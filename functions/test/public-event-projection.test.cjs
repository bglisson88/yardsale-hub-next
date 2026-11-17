const assert = require('node:assert/strict');
const { test } = require('node:test');
const { Timestamp } = require('firebase-admin/firestore');

process.env.GCLOUD_PROJECT = 'demo-yardsale-hub';
process.env.YSH_EXPECTED_PROJECT_ID = 'demo-yardsale-hub';
process.env.YSH_FUNCTIONS_MODE = 'emulator';
process.env.YSH_FUNCTIONS_REGION = 'us-south1';
process.env.YSH_FUNCTIONS_MAX_INSTANCES = '2';
process.env.YSH_FUNCTIONS_CONCURRENCY = '10';
process.env.YSH_FUNCTIONS_TIMEOUT_SECONDS = '30';
process.env.YSH_FUNCTIONS_MEMORY = '256MiB';
process.env.YSH_FUNCTIONS_MIN_INSTANCES = '0';
delete process.env.YSH_FUNCTIONS_SERVICE_ACCOUNT;

const {
  buildPublicEventProjection,
  reconcilePublicEventProjection,
} = require('../lib/public-event-projection.js');

const catalog = {
  kind: 'city',
  displayName: 'Nederland',
  active: true,
  approvedAliases: [],
  countryCode: 'US',
  regionCode: 'TX',
};

function sourceEvent(overrides = {}) {
  return {
    userId: 'private-organizer-id',
    title: 'Neighborhood Sale',
    description: 'Saturday sale',
    location: 'Nederland',
    locationId: 'nederland-tx',
    locationVisibility: 'general',
    startDate: Timestamp.fromDate(new Date('2026-11-20T09:00:00Z')),
    endDate: Timestamp.fromDate(new Date('2026-11-20T12:00:00Z')),
    photoURL: null,
    createdAt: Timestamp.fromDate(new Date('2026-11-01T10:00:00Z')),
    updatedAt: Timestamp.fromDate(new Date('2026-11-01T10:00:00Z')),
    itemCount: 0,
    eventVersion: 1,
    ...overrides,
  };
}

class FakeReference {
  constructor(path) {
    this.path = path;
  }
}

class FakeFirestore {
  constructor(records = new Map()) {
    this.records = records;
    this.beforeCommit = null;
  }

  collection(name) {
    return { doc: id => new FakeReference(`${name}/${id}`) };
  }

  async runTransaction(callback) {
    for (let attempt = 0; attempt < 5; attempt++) {
      const readVersions = new Map();
      const writes = [];
      const transaction = {
        get: async reference => {
          readVersions.set(reference.path, this.records.get(reference.path)?.revision ?? 0);
          const entry = this.records.get(reference.path);
          return {
            exists: entry !== undefined,
            data: () => entry?.data,
          };
        },
        set: (reference, data) => writes.push(['set', reference.path, data]),
        delete: reference => writes.push(['delete', reference.path]),
      };
      const result = await callback(transaction);
      if (this.beforeCommit) {
        const beforeCommit = this.beforeCommit;
        this.beforeCommit = null;
        beforeCommit();
      }
      if ([...readVersions].some(([path, revision]) =>
        (this.records.get(path)?.revision ?? 0) !== revision)) continue;
      for (const [operation, path, data] of writes) {
        const revision = (this.records.get(path)?.revision ?? 0) + 1;
        if (operation === 'delete') this.records.delete(path);
        else this.records.set(path, { data, revision });
      }
      return result;
    }
    throw new Error('transaction retry limit exceeded');
  }

  set(path, data) {
    this.records.set(path, { data, revision: (this.records.get(path)?.revision ?? 0) + 1 });
  }

  delete(path) {
    this.records.delete(path);
  }
}

test('projection contains only the explicit public allowlist', () => {
  const projection = buildPublicEventProjection(sourceEvent({
    address: '12 Main Street',
    latitude: 29.99,
    longitude: -94.01,
    privateNote: 'Do not copy',
  }), catalog);
  assert.equal(projection, null);

  const safe = buildPublicEventProjection(sourceEvent(), catalog);
  assert.deepEqual(Object.keys(safe).sort(), [
    'createdAt', 'description', 'endDate', 'itemCount', 'location', 'locationId',
    'locationVisibility', 'photoURL', 'schemaVersion', 'startDate', 'title', 'updatedAt',
  ].sort());
  for (const field of ['address', 'latitude', 'longitude', 'userId', 'eventVersion']) {
    assert.equal(Object.hasOwn(safe, field), false);
  }
});

test('malformed, legacy, noncanonical, or untrusted catalog events are omitted', () => {
  for (const [event, location] of [
    [sourceEvent({ title: '' }), catalog],
    [sourceEvent({ extra: true }), catalog],
    [sourceEvent({ address: '12 Main Street' }), catalog],
    [sourceEvent({ locationId: undefined }), catalog],
    [sourceEvent({ location: '12 Main Street' }), catalog],
    [sourceEvent(), { ...catalog, active: false }],
    [sourceEvent(), { ...catalog, kind: 'street' }],
    [sourceEvent(), { ...catalog, extra: true }],
  ]) {
    assert.equal(buildPublicEventProjection(event, location), null);
  }
});

test('stale triggers reconcile the current source and cannot recreate deleted projections', async () => {
  const firestore = new FakeFirestore();
  firestore.set('generalLocations/nederland-tx', catalog);
  firestore.set('yardSaleEvents/event-1', sourceEvent());

  await reconcilePublicEventProjection(firestore, 'event-1');
  assert.equal(firestore.records.get('publicYardSaleEvents/event-1').data.title, 'Neighborhood Sale');

  firestore.set('yardSaleEvents/event-1', sourceEvent({
    title: 'Newer Sale',
    description: 'Updated content',
    eventVersion: 2,
  }));
  await reconcilePublicEventProjection(firestore, 'event-1');
  assert.equal(firestore.records.get('publicYardSaleEvents/event-1').data.title, 'Newer Sale');

  firestore.set('yardSaleEvents/event-1', sourceEvent({ title: 'Racing write' }));
  firestore.beforeCommit = () => firestore.delete('yardSaleEvents/event-1');
  await reconcilePublicEventProjection(firestore, 'event-1');
  assert.equal(firestore.records.has('publicYardSaleEvents/event-1'), false);
  await reconcilePublicEventProjection(firestore, 'event-1');
  assert.equal(firestore.records.has('publicYardSaleEvents/event-1'), false);
});

test('transaction retries if the source changes while a projection update is running', async () => {
  const firestore = new FakeFirestore();
  firestore.set('generalLocations/nederland-tx', catalog);
  firestore.set('yardSaleEvents/event-1', sourceEvent());
  firestore.beforeCommit = () => firestore.set(
    'yardSaleEvents/event-1',
    sourceEvent({ title: 'Concurrent Newer Sale', eventVersion: 2 }),
  );

  await reconcilePublicEventProjection(firestore, 'event-1');
  assert.equal(
    firestore.records.get('publicYardSaleEvents/event-1').data.title,
    'Concurrent Newer Sale',
  );
});
