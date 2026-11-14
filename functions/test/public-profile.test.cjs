const assert = require('node:assert/strict');
const { test } = require('node:test');
const adminAuth = require('firebase-admin/auth');
const { FieldValue, Timestamp } = require('firebase-admin/firestore');
const adminFirestore = require('firebase-admin/firestore');
const { HttpsError } = require('firebase-functions/v2/https');
const { registerPublicProfile, renameUsername } = require('../lib/public-profile.js');

function request(data, auth = { uid: 'user-123', token: {} }) {
  return { data, auth };
}

async function assertCallableError(call, code, message) {
  let error;
  try {
    await call();
  } catch (caught) {
    error = caught;
  }
  assert.ok(error instanceof HttpsError);
  assert.equal(error.code, code);
  assert.equal(error.message, message);
  assert.equal(error.details, undefined);
  return error;
}

test('requires a verified callable user before processing registration data', async () => {
  await assertCallableError(
    () => registerPublicProfile.run(request({ username: 'seller_1' }, null)),
    'unauthenticated',
    'Sign in to register a public profile.',
  );
});

test('accepts only the username field and rejects private or identity inputs', async () => {
  for (const data of [
    null,
    [],
    {},
    { uid: 'forged' },
    { username: 'seller_1', uid: 'forged' },
    { username: 'seller_1', memberSince: 'forged' },
    { username: 'seller_1', photoURL: 'https://example.test/photo.jpg' },
    { username: 'seller_1', displayName: 'Forged name' },
    { username: 'seller_1', email: 'private@example.test' },
  ]) {
    await assertCallableError(
      () => registerPublicProfile.run(request(data)),
      'invalid-argument',
      'Provide a valid username.',
    );
  }
});

test('maps invalid usernames to a safe callable error', async () => {
  for (const username of ['ab', 'has space', 'name-é']) {
    const error = await assertCallableError(
      () => registerPublicProfile.run(request({ username })),
      'invalid-argument',
      'Provide a valid username.',
    );
    assert.equal(error.message.includes(username), false);
  }
});

test('maps hardcoded reserved usernames to the generic unavailable response', async () => {
  const error = await assertCallableError(
    () => registerPublicProfile.run(request({ username: 'ADMIN' })),
    'already-exists',
    'That username is unavailable.',
  );
  assert.equal(error.message.includes('ADMIN'), false);
});

test('rename requires authentication and accepts only a valid username field', async () => {
  await assertCallableError(
    () => renameUsername.run(request({ username: 'seller_1' }, null)),
    'unauthenticated',
    'Sign in to change your username.',
  );
  for (const data of [
    {},
    { username: 'seller_1', uid: 'forged' },
    { username: 'seller_1', lastRenamedAt: '2020-01-01' },
    { username: 'seller_1', memberSince: '2020-01-01' },
    { username: 'seller_1', displayName: 'Forged' },
    { username: 'bad name' },
  ]) {
    await assertCallableError(
      () => renameUsername.run(request(data)),
      'invalid-argument',
      'Provide a valid username.',
    );
  }
});

test('rename transaction moves the claim and updates only approved fields', async t => {
  const records = new Map([
    ['publicProfiles/user-123', {
      username: 'old_name',
      displayName: 'Seller',
      photoURL: null,
      memberSince: Timestamp.fromDate(new Date('2020-01-01T00:00:00Z')),
    }],
    ['usernameState/user-123', { lastRenamedAt: null }],
    ['usernameClaims/old_name', { uid: 'user-123' }],
  ]);
  const writes = [];
  const transaction = {
    async get(ref) {
      assert.equal(writes.length, 0, 'Transaction reads must precede writes');
      return { exists: records.has(ref.path), data: () => records.get(ref.path) };
    },
    delete(ref) { writes.push(['delete', ref.path]); },
    create(ref, data) { writes.push(['create', ref.path, data]); },
    update(ref, data) { writes.push(['update', ref.path, data]); },
  };
  t.mock.method(adminAuth, 'getAuth', () => ({ getUser: async () => ({ disabled: false }) }));
  t.mock.method(adminFirestore, 'getFirestore', () => ({
    collection: collection => ({ doc: id => ({ path: `${collection}/${id}` }) }),
    runTransaction: callback => callback(transaction),
  }));

  assert.deepEqual(await renameUsername.run(request({ username: 'NEW_NAME' })), { username: 'new_name' });
  assert.deepEqual(writes.slice(0, 3), [
    ['delete', 'usernameClaims/old_name'],
    ['create', 'usernameClaims/new_name', { uid: 'user-123' }],
    ['update', 'publicProfiles/user-123', { username: 'new_name' }],
  ]);
  assert.equal(writes.length, 4);
  assert.equal(writes[3][0], 'update');
  assert.equal(writes[3][1], 'usernameState/user-123');
  assert.deepEqual(Object.keys(writes[3][2]), ['lastRenamedAt']);
  assert.ok(writes[3][2].lastRenamedAt.isEqual(FieldValue.serverTimestamp()));
});

test('rename retries ignore later reservations and do not write', async t => {
  const records = new Map([
    ['publicProfiles/user-123', {
      username: 'seller_1',
      displayName: 'Seller',
      photoURL: null,
      memberSince: Timestamp.fromDate(new Date('2020-01-01T00:00:00Z')),
    }],
    ['usernameState/user-123', { lastRenamedAt: Timestamp.fromDate(new Date('2020-01-01T00:00:00Z')) }],
    ['usernameClaims/seller_1', { uid: 'user-123' }],
    ['reservedUsernames/seller_1', { reserved: true }],
  ]);
  const transaction = {
    async get(ref) { return { exists: records.has(ref.path), data: () => records.get(ref.path) }; },
    delete() { assert.fail('Unexpected delete'); },
    create() { assert.fail('Unexpected create'); },
    update() { assert.fail('Unexpected update'); },
  };
  t.mock.method(adminAuth, 'getAuth', () => ({ getUser: async () => ({ disabled: false }) }));
  t.mock.method(adminFirestore, 'getFirestore', () => ({
    collection: collection => ({ doc: id => ({ path: `${collection}/${id}` }) }),
    runTransaction: callback => callback(transaction),
  }));

  assert.deepEqual(await renameUsername.run(request({ username: 'SELLER_1' })), { username: 'seller_1' });
});

test('rename enforces the full cooldown including fractional timestamps', async t => {
  const start = Date.parse('2025-01-01T00:00:00Z');
  const boundary = start + 30 * 24 * 60 * 60 * 1000;
  t.mock.timers.enable({ apis: ['Date'], now: boundary });
  const records = new Map([
    ['publicProfiles/user-123', {
      username: 'old_name',
      displayName: 'Seller',
      photoURL: null,
      memberSince: Timestamp.fromMillis(start),
    }],
    ['usernameState/user-123', { lastRenamedAt: Timestamp.fromMillis(start) }],
    ['usernameClaims/old_name', { uid: 'user-123' }],
  ]);
  const writes = [];
  const transaction = {
    async get(ref) { return { exists: records.has(ref.path), data: () => records.get(ref.path) }; },
    delete(ref) { writes.push(['delete', ref.path]); },
    create(ref) { writes.push(['create', ref.path]); },
    update(ref) { writes.push(['update', ref.path]); },
  };
  t.mock.method(adminAuth, 'getAuth', () => ({ getUser: async () => ({ disabled: false }) }));
  t.mock.method(adminFirestore, 'getFirestore', () => ({
    collection: collection => ({ doc: id => ({ path: `${collection}/${id}` }) }),
    runTransaction: callback => callback(transaction),
  }));
  const rename = () => renameUsername.run(request({ username: 'new_name' }));
  const assertCooldown = () => assertCallableError(
    rename, 'failed-precondition', 'You can change your username once every 30 days.',
  );

  t.mock.timers.setTime(boundary - 1);
  await assertCooldown();
  assert.equal(writes.length, 0);
  t.mock.timers.setTime(boundary);
  assert.deepEqual(await rename(), { username: 'new_name' });
  assert.equal(writes.length, 4);

  writes.length = 0;
  records.set('usernameState/user-123', { lastRenamedAt: new Timestamp(start / 1000, 1) });
  await assertCooldown();
  assert.equal(writes.length, 0);
  t.mock.timers.setTime(boundary + 1);
  assert.deepEqual(await rename(), { username: 'new_name' });
  assert.equal(writes.length, 4);

  writes.length = 0;
  records.set('usernameState/user-123', { lastRenamedAt: Timestamp.fromMillis(boundary + 1000) });
  await assertCallableError(
    () => renameUsername.run(request({ username: 'old_name' })),
    'failed-precondition',
    'Public profile data is inconsistent. Please contact support.',
  );
  assert.equal(writes.length, 0);
});

test('rename maps transient backend errors to safe callable responses', async t => {
  t.mock.method(adminAuth, 'getAuth', () => ({ getUser: async () => ({ disabled: false }) }));
  t.mock.method(adminFirestore, 'getFirestore', () => ({
    collection: collection => ({ doc: id => ({ path: `${collection}/${id}` }) }),
    runTransaction: async () => {
      throw Object.assign(new Error('private backend detail'), { code: 14 });
    },
  }));
  await assertCallableError(
    () => renameUsername.run(request({ username: 'seller_1' })),
    'unavailable',
    'The username service is unavailable. Please try again.',
  );
});
