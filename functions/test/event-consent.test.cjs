const assert = require('node:assert/strict');
const { test } = require('node:test');
const adminFirestore = require('firebase-admin/firestore');
const { HttpsError } = require('firebase-functions/v2/https');
const { Timestamp } = adminFirestore;

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
  EXACT_ADDRESS_CONSENT_VERSION,
  deleteEventWithConsent,
  saveEventWithConsent,
} = require('../lib/event-consent.js');

class FakeReference {
  constructor(path) {
    this.path = path;
  }

  collection(name) {
    return { doc: id => new FakeReference(`${this.path}/${name}/${id}`) };
  }
}

class FakeFirestore {
  constructor(records = new Map()) {
    this.records = records;
    this.records.set('generalLocations/nederland-tx', {
      kind: 'city',
      displayName: 'Nederland',
      active: true,
      approvedAliases: [],
      countryCode: 'US',
      regionCode: 'TX',
    });
    this.writes = [];
  }

  collection(name) {
    return { doc: id => new FakeReference(`${name}/${id}`) };
  }

  async runTransaction(callback) {
    const writes = [];
    const transaction = {
      get: async ref => {
        const value = this.records.get(ref.path);
        return {
          exists: value !== undefined,
          data: () => value,
          get: key => value?.[key],
        };
      },
      create: (ref, value) => writes.push(['create', ref.path, value]),
      set: (ref, value) => writes.push(['set', ref.path, value]),
      delete: ref => writes.push(['delete', ref.path]),
    };
    const result = await callback(transaction);
    for (const [operation, path, value] of writes) {
      if (operation === 'create' && this.records.has(path)) {
        throw Object.assign(new Error('already exists'), { code: 6 });
      }
    }
    for (const [operation, path, value] of writes) {
      this.writes.push([operation, path, value]);
      if (operation === 'delete') this.records.delete(path);
      else this.records.set(path, value);
    }
    return result;
  }
}

function request(data, auth = { uid: 'organizer-1', token: {} }) {
  return { data, auth };
}

function eventInput(overrides = {}) {
  return {
    eventId: 'event-1',
    operationId: '123e4567-e89b-42d3-a456-426614174000',
    expectedEventVersion: 0,
    expectedUpdatedAtMs: null,
    title: 'Neighborhood Sale',
    description: 'Saturday sale',
    location: 'Nederland',
    locationId: 'nederland-tx',
    locationVisibility: 'exact',
    startDateMs: Date.parse('2026-11-20T09:00:00Z'),
    endDateMs: Date.parse('2026-11-20T12:00:00Z'),
    photoURL: null,
    itemCount: 0,
    address: '12 Main Street',
    consentVersion: EXACT_ADDRESS_CONSENT_VERSION,
    consentConfirmed: true,
    ...overrides,
  };
}

function ownerEvent(overrides = {}) {
  return {
    userId: 'organizer-1',
    title: 'Neighborhood Sale',
    description: 'Saturday sale',
    location: 'Nederland',
    locationVisibility: 'general',
    startDate: Timestamp.fromDate(new Date('2026-11-20T09:00:00Z')),
    endDate: Timestamp.fromDate(new Date('2026-11-20T12:00:00Z')),
    photoURL: null,
    createdAt: Timestamp.fromDate(new Date('2026-11-01T10:00:00Z')),
    updatedAt: Timestamp.fromDate(new Date('2026-11-01T10:00:00Z')),
    itemCount: 0,
    ...overrides,
  };
}

function mockFirestore(t, firestore) {
  t.mock.method(adminFirestore, 'getFirestore', () => firestore);
}

async function assertError(call, code, details) {
  await assert.rejects(call, error => {
    assert.ok(error instanceof HttpsError);
    assert.equal(error.code, code);
    if (details) assert.deepEqual(error.details, details);
    return true;
  });
}

test('requires authentication and explicit, versioned exact-address consent', async t => {
  const firestore = new FakeFirestore();
  mockFirestore(t, firestore);
  await assertError(
    () => saveEventWithConsent.run(request(eventInput(), null)),
    'unauthenticated',
  );
  await assertError(
    () => saveEventWithConsent.run(request(eventInput({
      consentConfirmed: false,
    }))),
    'failed-precondition',
    { reason: 'EXACT_ADDRESS_CONSENT_REQUIRED' },
  );
  await assertError(
    () => saveEventWithConsent.run(request(eventInput({
      consentVersion: 'legacy',
    }))),
    'failed-precondition',
  );
  assert.equal(firestore.writes.length, 0);
});

test('creates an exact event without public address or precise coordinates', async t => {
  const firestore = new FakeFirestore();
  mockFirestore(t, firestore);

  assert.deepEqual(
    await saveEventWithConsent.run(request(eventInput())),
    { eventId: 'event-1', eventVersion: 1 },
  );
  const event = firestore.records.get('yardSaleEvents/event-1');
  const privateEvent = firestore.records.get('eventPrivate/event-1');
  const marker = firestore.records.get('eventAddressConsent/event-1');
  const history = firestore.records.get(
    'eventAddressConsent/event-1/history/123e4567-e89b-42d3-a456-426614174000',
  );
  assert.equal(event.userId, 'organizer-1');
  assert.equal(event.locationVisibility, 'exact');
  assert.equal(event.locationId, 'nederland-tx');
  assert.equal(event.eventVersion, 1);
  for (const field of ['address', 'latitude', 'longitude']) {
    assert.equal(Object.hasOwn(event, field), false);
  }
  assert.equal(privateEvent.address, '12 Main Street');
  assert.equal(privateEvent.userId, 'organizer-1');
  assert.equal(privateEvent.addressRevision, marker.addressRevision);
  assert.equal(marker.organizerUid, 'organizer-1');
  assert.equal(marker.consentVersion, 'exact-address-v1');
  assert.ok(marker.grantedAt);
  assert.equal(history.action, 'granted');
  assert.equal(history.addressRevision, marker.addressRevision);
  assert.equal(Object.hasOwn(history, 'address'), false);
});

test('requires a valid active catalog location and matching public display', async t => {
  const firestore = new FakeFirestore();
  mockFirestore(t, firestore);
  for (const overrides of [
    { location: '12 Main Street' },
    { locationId: 'unknown' },
    { locationId: '../private' },
    { locationId: null },
  ]) {
    await assert.rejects(() => saveEventWithConsent.run(request(eventInput(overrides))), HttpsError);
    assert.equal(firestore.writes.length, 0);
  }
  const location = firestore.records.get('generalLocations/nederland-tx');
  for (const invalid of [
    { ...location, active: false },
    { ...location, kind: 'street' },
    { ...location, approvedAliases: 'Nederland' },
    { ...location, countryCode: 'USA' },
    { ...location, extra: true },
  ]) {
    firestore.records.set('generalLocations/nederland-tx', invalid);
    await assertError(
      () => saveEventWithConsent.run(request(eventInput())),
      'failed-precondition',
      { reason: 'INVALID_GENERAL_LOCATION' },
    );
    assert.equal(firestore.writes.length, 0);
  }
});

test('accepts each approved location kind and rejects alias-only callable displays', async t => {
  const firestore = new FakeFirestore();
  mockFirestore(t, firestore);
  const catalog = firestore.records.get('generalLocations/nederland-tx');
  for (const [kind, displayName] of [
    ['city', 'Nederland'],
    ['state', 'Texas'],
    ['postalCode', '77705'],
    ['area', 'West Beaumont'],
  ]) {
    firestore.records.set('generalLocations/nederland-tx', {
      ...catalog, kind, displayName, approvedAliases: ['Old label'],
    });
    await assertError(
      () => saveEventWithConsent.run(request(eventInput({ location: 'Old label' }))),
      'failed-precondition',
      { reason: 'INVALID_GENERAL_LOCATION' },
    );
    const eventId = `event-${kind}`;
    await saveEventWithConsent.run(request(eventInput({ eventId, location: displayName })));
    assert.equal(firestore.records.get(`yardSaleEvents/${eventId}`).location, displayName);
  }
});

test('rejects another organizer without partial writes', async t => {
  const firestore = new FakeFirestore(new Map([
    ['yardSaleEvents/event-1', ownerEvent({ userId: 'another-user' })],
  ]));
  mockFirestore(t, firestore);
  await assertError(
    () => saveEventWithConsent.run(request(eventInput())),
    'permission-denied',
  );
  assert.equal(firestore.writes.length, 0);
});

test('rejects stale event versions without partial writes', async t => {
  const staleFirestore = new FakeFirestore(new Map([
    ['yardSaleEvents/event-1', ownerEvent({ eventVersion: 4 })],
  ]));
  mockFirestore(t, staleFirestore);
  await assertError(
    () => saveEventWithConsent.run(request(eventInput())),
    'aborted',
    { reason: 'EVENT_VERSION_MISMATCH', currentEventVersion: 4 },
  );
  assert.equal(staleFirestore.writes.length, 0);
});

test('initializes versioning when a legacy general event has no eventVersion', async t => {
  const firestore = new FakeFirestore(new Map([
    ['yardSaleEvents/event-1', ownerEvent({ address: 'legacy public address', latitude: 1, longitude: 2 })],
    ['eventPrivate/event-1', { userId: 'organizer-1', address: '12 Main Street' }],
  ]));
  mockFirestore(t, firestore);
  await saveEventWithConsent.run(request(eventInput({
    expectedUpdatedAtMs: Date.parse('2026-11-01T10:00:00Z'),
  })));
  const event = firestore.records.get('yardSaleEvents/event-1');
  assert.equal(event.eventVersion, 1);
  assert.equal(Object.hasOwn(event, 'address'), false);
  assert.equal(Object.hasOwn(event, 'latitude'), false);
  assert.equal(Object.hasOwn(event, 'longitude'), false);
});

test('general downgrade revokes the active marker and retains only a private address', async t => {
  const firestore = new FakeFirestore(new Map([
    ['yardSaleEvents/event-1', ownerEvent({
      locationVisibility: 'exact',
      eventVersion: 2,
    })],
    ['eventPrivate/event-1', {
      userId: 'organizer-1',
      address: '12 Main Street',
      addressRevision: 'old-revision',
    }],
    ['eventAddressConsent/event-1', {
      organizerUid: 'organizer-1',
      consentVersion: 'exact-address-v1',
      addressRevision: 'old-revision',
      grantedAt: Timestamp.now(),
    }],
  ]));
  mockFirestore(t, firestore);
  await saveEventWithConsent.run(request(eventInput({
    expectedEventVersion: 2,
    locationVisibility: 'general',
    address: '12 Main Street',
    consentVersion: null,
    consentConfirmed: false,
  })));
  assert.equal(firestore.records.get('yardSaleEvents/event-1').locationVisibility, 'general');
  assert.equal(firestore.records.has('eventAddressConsent/event-1'), false);
  assert.deepEqual(firestore.records.get('eventPrivate/event-1'), {
    userId: 'organizer-1',
    address: '12 Main Street',
  });
  const history = [...firestore.records.entries()].find(([path]) =>
    path.startsWith('eventAddressConsent/event-1/history/'),
  )[1];
  assert.equal(history.action, 'revoked');
  assert.equal(history.addressRevision, 'old-revision');
});

test('rejects a downgrade with an unapproved public location without revoking consent', async t => {
  const marker = {
    organizerUid: 'organizer-1',
    consentVersion: 'exact-address-v1',
    addressRevision: 'old-revision',
    grantedAt: Timestamp.now(),
  };
  const firestore = new FakeFirestore(new Map([
    ['yardSaleEvents/event-1', ownerEvent({ locationVisibility: 'exact', eventVersion: 2 })],
    ['eventPrivate/event-1', {
      userId: 'organizer-1', address: '12 Main Street', addressRevision: 'old-revision',
    }],
    ['eventAddressConsent/event-1', marker],
  ]));
  mockFirestore(t, firestore);
  await assertError(
    () => saveEventWithConsent.run(request(eventInput({
      expectedEventVersion: 2,
      locationVisibility: 'general',
      location: '12 Main Street',
      consentVersion: null,
      consentConfirmed: false,
    }))),
    'failed-precondition',
    { reason: 'INVALID_GENERAL_LOCATION' },
  );
  assert.equal(firestore.writes.length, 0);
  assert.equal(firestore.records.get('eventAddressConsent/event-1'), marker);
});

test('rejects stale edits to legacy events that have no eventVersion', async t => {
  const firestore = new FakeFirestore(new Map([
    ['yardSaleEvents/event-1', ownerEvent()],
  ]));
  mockFirestore(t, firestore);
  await assertError(
    () => saveEventWithConsent.run(request(eventInput({
      expectedUpdatedAtMs: Date.parse('2026-10-31T10:00:00Z'),
    }))),
    'aborted',
    { reason: 'EVENT_VERSION_MISMATCH', currentEventVersion: 0 },
  );
  assert.equal(firestore.writes.length, 0);
});

test('makes committed exact saves idempotent and rejects a conflicting operation key', async t => {
  const firestore = new FakeFirestore();
  mockFirestore(t, firestore);
  const input = eventInput();
  await saveEventWithConsent.run(request(input));
  const writeCount = firestore.writes.length;
  assert.deepEqual(
    await saveEventWithConsent.run(request(input)),
    { eventId: 'event-1', eventVersion: 1 },
  );
  assert.equal(firestore.writes.length, writeCount);
  await assertError(
    () => saveEventWithConsent.run(request(eventInput({
      locationVisibility: 'general',
      consentVersion: null,
      consentConfirmed: false,
    }))),
    'already-exists',
  );
});

test('deletes the event, private address, and active marker atomically with durable history', async t => {
  const firestore = new FakeFirestore(new Map([
    ['yardSaleEvents/event-1', ownerEvent({
      locationVisibility: 'exact',
      eventVersion: 2,
    })],
    ['eventPrivate/event-1', {
      userId: 'organizer-1',
      address: '12 Main Street',
      addressRevision: 'revision-1',
    }],
    ['eventAddressConsent/event-1', {
      organizerUid: 'organizer-1',
      consentVersion: 'exact-address-v1',
      addressRevision: 'revision-1',
      grantedAt: Timestamp.now(),
    }],
  ]));
  mockFirestore(t, firestore);
  const input = {
    eventId: 'event-1',
    operationId: '123e4567-e89b-42d3-a456-426614174001',
    expectedEventVersion: 2,
    expectedUpdatedAtMs: null,
  };
  assert.deepEqual(
    await deleteEventWithConsent.run(request(input)),
    { eventId: 'event-1', deleted: true },
  );
  for (const path of [
    'yardSaleEvents/event-1',
    'eventPrivate/event-1',
    'eventAddressConsent/event-1',
  ]) {
    assert.equal(firestore.records.has(path), false);
  }
  assert.equal(
    firestore.records.get('eventAddressConsent/event-1/history/123e4567-e89b-42d3-a456-426614174001').action,
    'deleted',
  );
  assert.deepEqual(
    await deleteEventWithConsent.run(request(input)),
    { eventId: 'event-1', deleted: true },
  );
});
