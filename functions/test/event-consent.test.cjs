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
  const input = eventInput({
    expectedEventVersion: 2,
    locationVisibility: 'general',
    address: '12 Main Street',
    consentVersion: null,
    consentConfirmed: false,
  });
  const result = await saveEventWithConsent.run(request(input));
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
  const writeCount = firestore.writes.length;
  assert.deepEqual(await saveEventWithConsent.run(request(input)), result);
  await assertError(() => saveEventWithConsent.run(request({
    ...input, address: 'Changed retry address',
  })), 'already-exists');
  assert.equal(firestore.writes.length, writeCount);
});

test('general saves create, update or remove only the owner private address and retry without writes', async t => {
  for (const existingAddress of [null, 'Old private address']) {
    for (const address of ['', '  New private address  ']) {
      await t.test(`${existingAddress ? 'existing' : 'missing'} private record, ${address ? 'supplied' : 'empty'} address`, async t => {
        const firestore = new FakeFirestore(new Map([
          ['yardSaleEvents/event-1', ownerEvent({ eventVersion: 1 })],
        ]));
        if (existingAddress) {
          firestore.records.set('eventPrivate/event-1', {
            userId: 'organizer-1', address: existingAddress,
          });
        }
        mockFirestore(t, firestore);
        const input = eventInput({
          expectedEventVersion: 1,
          locationVisibility: 'general',
          address,
          consentVersion: null,
          consentConfirmed: false,
        });
        const result = await saveEventWithConsent.run(request(input));
        assert.deepEqual(result, { eventId: 'event-1', eventVersion: 2 });
        const publicEvent = firestore.records.get('yardSaleEvents/event-1');
        assert.equal(publicEvent.locationVisibility, 'general');
        assert.equal(Object.hasOwn(publicEvent, 'address'), false);
        assert.equal(firestore.records.has('eventAddressConsent/event-1'), false);
        assert.deepEqual(firestore.records.get('eventPrivate/event-1'),
          address ? { userId: 'organizer-1', address: address.trim() } : undefined);
        const history = firestore.records.get(`eventAddressConsent/event-1/history/${input.operationId}`);
        assert.equal(history.action, 'updated');
        const writeCount = firestore.writes.length;
        assert.deepEqual(await saveEventWithConsent.run(request(input)), result);
        await assertError(() => saveEventWithConsent.run(request({
          ...input, address: 'Changed retry address',
        })), 'already-exists');
        await assertError(
          () => saveEventWithConsent.run(request(input, { uid: 'another-user', token: {} })),
          'already-exists',
        );
        assert.equal(firestore.writes.length, writeCount);
      });
    }
  }
});

test('general saves cannot overwrite a private record belonging to another organizer', async t => {
  const firestore = new FakeFirestore(new Map([
    ['yardSaleEvents/event-1', ownerEvent({ eventVersion: 1 })],
    ['eventPrivate/event-1', { userId: 'another-user', address: 'Private' }],
  ]));
  mockFirestore(t, firestore);
  await assertError(() => saveEventWithConsent.run(request(eventInput({
    expectedEventVersion: 1, locationVisibility: 'general',
    consentVersion: null, consentConfirmed: false,
  }))), 'failed-precondition');
  assert.equal(firestore.writes.length, 0);
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
  assert.deepEqual(await saveEventWithConsent.run(request(eventInput({
    title: `  ${input.title}  `,
    description: `  ${input.description}  `,
    address: `  ${input.address}  `,
    location: `  ${input.location}  `,
  }))), { eventId: 'event-1', eventVersion: 1 });
  for (const changed of [
    { title: 'Different title' },
    { description: 'Different description' },
    { address: 'Different private address' },
    { location: 'Different location' },
    { locationId: 'different-id' },
    { photoURL: 'https://example.test/changed.jpg' },
    { startDateMs: input.startDateMs + 1000 },
    { endDateMs: input.endDateMs + 1000 },
    { itemCount: 1 },
    { expectedEventVersion: 1 },
    { expectedUpdatedAtMs: 1 },
  ]) {
    await assertError(
      () => saveEventWithConsent.run(request(eventInput(changed))),
      'already-exists',
    );
  }
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

test('retries return the original result after later saves without repeating transitions', async t => {
  const firestore = new FakeFirestore();
  mockFirestore(t, firestore);
  const exact = eventInput();
  await saveEventWithConsent.run(request(exact));
  const general = eventInput({
    operationId: '123e4567-e89b-42d3-a456-426614174001',
    expectedEventVersion: 1, locationVisibility: 'general',
    consentVersion: null, consentConfirmed: false,
  });
  await saveEventWithConsent.run(request(general));
  const next = {
    ...general,
    operationId: '123e4567-e89b-42d3-a456-426614174002',
    expectedEventVersion: 2, address: '',
  };
  await saveEventWithConsent.run(request(next));
  assert.equal(firestore.records.has('eventPrivate/event-1'), false);
  assert.equal(firestore.records.has('eventAddressConsent/event-1'), false);
  const republish = eventInput({
    operationId: '123e4567-e89b-42d3-a456-426614174003',
    expectedEventVersion: 3,
    address: 'New exact address',
  });
  await saveEventWithConsent.run(request(republish));
  const revision = firestore.records.get('eventPrivate/event-1').addressRevision;
  assert.equal(firestore.records.get('eventAddressConsent/event-1').addressRevision, revision);
  assert.equal(Object.hasOwn(firestore.records.get('yardSaleEvents/event-1'), 'address'), false);
  const writeCount = firestore.writes.length;
  for (const [input, version] of [[exact, 1], [general, 2], [next, 3], [republish, 4]]) {
    assert.deepEqual(await saveEventWithConsent.run(request(input)),
      { eventId: 'event-1', eventVersion: version });
  }
  assert.equal(firestore.writes.length, writeCount);
  assert.equal(firestore.records.get('yardSaleEvents/event-1').eventVersion, 4);
  assert.equal(firestore.records.get('eventPrivate/event-1').address, 'New exact address');
  assert.equal(firestore.records.get('eventAddressConsent/event-1').addressRevision, revision);
});

test('unbound historical operations fail closed instead of assuming payload equivalence', async t => {
  const input = eventInput();
  const firestore = new FakeFirestore(new Map([
    [`eventAddressConsent/event-1/history/${input.operationId}`, {
      organizerUid: 'organizer-1', action: 'granted',
      expectedEventVersion: 0, resultEventVersion: 1,
    }],
  ]));
  mockFirestore(t, firestore);
  await assertError(() => saveEventWithConsent.run(request(input)), 'already-exists');
  assert.equal(firestore.writes.length, 0);
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
  const writeCount = firestore.writes.length;
  assert.deepEqual(
    await deleteEventWithConsent.run(request(input)),
    { eventId: 'event-1', deleted: true },
  );
  await assertError(
    () => deleteEventWithConsent.run(request({ ...input, expectedUpdatedAtMs: 1 })),
    'already-exists',
  );
  await assertError(
    () => saveEventWithConsent.run(request(eventInput({
      operationId: input.operationId, expectedEventVersion: 2,
    }))),
    'already-exists',
  );
  assert.equal(firestore.writes.length, writeCount);
});
