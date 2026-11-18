const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { test } = require('node:test');

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

const adminFirestore = require('firebase-admin/firestore');
const { Timestamp } = adminFirestore;
const { HttpsError } = require('firebase-functions/v2/https');
const { getPublicUsername } = require('../lib/public-profile-read.js');

function fakeFirestore(records = new Map()) {
  const reads = [];
  return {
    reads,
    collection(name) {
      return {
        doc: id => {
          const path = `${name}/${id}`;
          return {
            async get() {
              reads.push(path);
              const data = records.get(path);
              return { exists: data !== undefined, data: () => data };
            },
          };
        },
      };
    },
  };
}

function request(data, uid = 'caller', ip = '127.0.0.1') {
  return {
    data,
    auth: uid ? { uid, token: {} } : null,
    rawRequest: { ip },
  };
}

function profile(username = 'seller_1', overrides = {}) {
  return {
    username,
    displayName: username,
    photoURL: null,
    memberSince: Timestamp.fromMillis(1),
    ...overrides,
  };
}

test('uses the validated per-callable emulator runtime configuration', () => {
  const options = getPublicUsername.__endpoint;
  assert.deepEqual(options.region, ['us-south1']);
  assert.equal(options.maxInstances, 2);
  assert.equal(options.concurrency, 10);
  assert.equal(options.timeoutSeconds, 30);
  assert.equal(options.availableMemoryMb, 256);
  assert.equal(options.minInstances, 0);
  assert.notEqual(typeof options.serviceAccountEmail, 'string');
});
function mockDatabase(t, database) {
  t.mock.method(adminFirestore, 'getFirestore', () => database);
}

async function assertCallableError(promise, code) {
  await assert.rejects(promise, error => {
    assert.ok(error instanceof HttpsError);
    assert.equal(error.code, code);
    return true;
  });
}

test('validates lookup modes strictly and requires authentication for self and conversation', async t => {
  const database = fakeFirestore();
  mockDatabase(t, database);

  await assertCallableError(getPublicUsername.run(request({ mode: 'self' }, null)), 'unauthenticated');
  await assertCallableError(getPublicUsername.run(request({
    mode: 'self', uid: 'another-user',
  })), 'invalid-argument');
  await assertCallableError(getPublicUsername.run(request({
    mode: 'conversation', messageId: 'message-1',
  }, null)), 'unauthenticated');
  for (const data of [
    null,
    { mode: 'self', extra: true },
    { mode: 'item', itemId: '../private' },
    { mode: 'item', itemId: 'public-item', uid: 'another-user' },
    { mode: 'conversation', messageId: 'message-1', uid: 'another-user' },
    { mode: 'uid', uid: 'another-user' },
  ]) {
    await assertCallableError(getPublicUsername.run(request(data)), 'invalid-argument');
  }
  assert.deepEqual(database.reads, []);
});

test('self lookup derives the caller UID and returns only a valid username', async t => {
  const uid = `self-${randomUUID()}`;
  const database = fakeFirestore(new Map([
    [`publicProfiles/${uid}`, profile()],
    ['usernameClaims/seller_1', { uid }],
  ]));
  mockDatabase(t, database);

  const result = await getPublicUsername.run(request({ mode: 'self' }, uid));
  assert.deepEqual(result, { username: 'seller_1' });
  assert.deepEqual(database.reads, [`publicProfiles/${uid}`, 'usernameClaims/seller_1']);
  assert.deepEqual(Object.keys(result), ['username']);
});

test('item mode derives the seller UID from the public item and supports anonymous lookup', async t => {
  const sellerUid = `seller-${randomUUID()}`;
  const database = fakeFirestore(new Map([
    ['items/public-item', { userId: sellerUid, title: 'Public listing' }],
    [`publicProfiles/${sellerUid}`, profile()],
    ['usernameClaims/seller_1', { uid: sellerUid }],
  ]));
  mockDatabase(t, database);

  const result = await getPublicUsername.run(request({
    mode: 'item', itemId: 'public-item',
  }, null, '198.51.100.10'));
  assert.deepEqual(result, { username: 'seller_1' });
  assert.deepEqual(database.reads, [
    'items/public-item', `publicProfiles/${sellerUid}`, 'usernameClaims/seller_1',
  ]);
});

test('item mode returns null for missing or malformed public items and never accepts a UID', async t => {
  const database = fakeFirestore(new Map([
    ['items/no-owner', { title: 'Malformed public listing' }],
  ]));
  mockDatabase(t, database);

  assert.deepEqual(await getPublicUsername.run(request({
    mode: 'item', itemId: 'missing-item',
  }, null, '198.51.100.11')), { username: null });
  assert.deepEqual(await getPublicUsername.run(request({
    mode: 'item', itemId: 'no-owner',
  }, null, '198.51.100.12')), { username: null });
});

test('conversation lookup resolves only a recipient from a message sent by the caller', async t => {
  const caller = `caller-${randomUUID()}`;
  const recipient = `recipient-${randomUUID()}`;
  const database = fakeFirestore(new Map([
    ['messages/outgoing-message', { senderId: caller, recipientId: recipient }],
    [`publicProfiles/${recipient}`, profile()],
    ['usernameClaims/seller_1', { uid: recipient }],
  ]));
  mockDatabase(t, database);

  assert.deepEqual(await getPublicUsername.run(request({
    mode: 'conversation', messageId: 'outgoing-message',
  }, caller)), { username: 'seller_1' });

  database.reads.length = 0;
  assert.deepEqual(await getPublicUsername.run(request({
    mode: 'conversation', messageId: 'outgoing-message',
  }, `not-${caller}`)), { username: null });
  assert.deepEqual(database.reads, ['messages/outgoing-message']);
});

test('missing, deleted, malformed or unclaimed profiles return only null', async t => {
  const uid = `malformed-${randomUUID()}`;
  const database = fakeFirestore(new Map([
    [`publicProfiles/${uid}`, profile('invalid name')],
    [`publicProfiles/extra-${uid}`, profile('seller_2', { email: 'private@example.test' })],
    [`publicProfiles/wrong-claim-${uid}`, profile('seller_3')],
    ['usernameClaims/seller_3', { uid: 'different-user' }],
  ]));
  mockDatabase(t, database);

  for (const id of [uid, `extra-${uid}`, `wrong-claim-${uid}`, `missing-${uid}`]) {
    const result = await getPublicUsername.run(request({
      mode: 'self',
    }, id));
    assert.deepEqual(result, { username: null });
    assert.deepEqual(Object.keys(result), ['username']);
  }
});

test('backend initialization failures return a generic unavailable error', async t => {
  t.mock.method(adminFirestore, 'getFirestore', () => {
    throw new Error('private backend detail');
  });
  await assertCallableError(
    getPublicUsername.run(request({ mode: 'self' })),
    'unavailable',
  );
});

test('throttles anonymous item lookups per source IP and fails closed when IP is absent', async t => {
  const database = fakeFirestore();
  mockDatabase(t, database);
  const ip = '203.0.113.250';

  for (let attempt = 0; attempt < 120; attempt++) {
    await getPublicUsername.run(request({ mode: 'item', itemId: 'missing' }, null, ip));
  }
  await assertCallableError(
    getPublicUsername.run(request({ mode: 'item', itemId: 'missing' }, null, ip)),
    'resource-exhausted',
  );
  await assertCallableError(
    getPublicUsername.run({
      data: { mode: 'item', itemId: 'missing' },
      auth: null,
      rawRequest: {},
    }),
    'resource-exhausted',
  );
});

test('throttles authenticated lookups per UID', async t => {
  const database = fakeFirestore();
  mockDatabase(t, database);
  const uid = `limited-${randomUUID()}`;

  for (let attempt = 0; attempt < 120; attempt++) {
    await getPublicUsername.run(request({ mode: 'self' }, uid));
  }
  await assertCallableError(
    getPublicUsername.run(request({ mode: 'self' }, uid)),
    'resource-exhausted',
  );
});
