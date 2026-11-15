const assert = require('node:assert/strict');
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

const adminAuth = require('firebase-admin/auth');
const { FieldValue, Timestamp } = require('firebase-admin/firestore');
const adminFirestore = require('firebase-admin/firestore');
const { HttpsError } = require('firebase-functions/v2/https');
const { registerPublicProfile, renameUsername } = require('../lib/public-profile.js');
const INCONSISTENT_PROFILE_MESSAGE =
  'Public profile data is inconsistent. Please contact support.';

test('both profile callables use the validated emulator runtime options', () => {
  for (const callable of [registerPublicProfile, renameUsername]) {
    const options = callable.__endpoint;
    assert.deepEqual(options.region, ['us-south1']);
    assert.equal(options.maxInstances, 2);
    assert.equal(options.concurrency, 10);
    assert.equal(options.timeoutSeconds, 30);
    assert.equal(options.availableMemoryMb, 256);
    assert.equal(options.minInstances, 0);
    assert.notEqual(
      options.serviceAccountEmail,
      'yardsale-hub-staging-backend@yardsale-hub-staging.iam.gserviceaccount.com',
    );
  }
});

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

function mockRegistration(t, records, uid = 'user-123') {
  const reads = [];
  const writes = [];
  const collection = name => ({
    doc: id => ({ path: `${name}/${id}`, id }),
    select: () => ({
      where: (_field, _operator, value) => ({ kind: 'private-users-query', uid: value }),
    }),
    where: (field, _operator, value) => ({
      kind: 'uid-claims-query',
      field,
      uid: value,
      limit: count => ({ kind: 'uid-claims-query', field, uid: value, count }),
    }),
  });
  const transaction = {
    async get(ref) {
      assert.equal(writes.length, 0, 'Transaction reads must precede writes');
      reads.push(ref);
      if (ref.kind === 'private-users-query') {
        const data = records.get(`users/${ref.uid}`);
        return { docs: data ? [{ get: key => data[key] }] : [] };
      }
      if (ref.kind === 'uid-claims-query') {
        assert.equal(ref.field, 'uid');
        assert.equal(ref.count, 2);
        const docs = [...records.entries()]
          .filter(([path, data]) =>
            path.startsWith('usernameClaims/') && data.uid === ref.uid,
          )
          .slice(0, ref.count)
          .map(([path, data]) => ({
            id: path.slice('usernameClaims/'.length),
            data: () => data,
          }));
        return { docs };
      }
      return {
        exists: records.has(ref.path),
        data: () => records.get(ref.path),
      };
    },
    create(ref, data) { writes.push(['create', ref.path, data]); },
    delete(ref) { writes.push(['delete', ref.path]); },
    update(ref, data) { writes.push(['update', ref.path, data]); },
  };
  const creationTime = 'Mon, 01 Jan 2024 00:00:00 GMT';
  t.mock.method(adminAuth, 'getAuth', () => ({
    getUser: async () => ({ disabled: false, metadata: { creationTime } }),
  }));
  t.mock.method(adminFirestore, 'getFirestore', () => ({
    collection,
    runTransaction: callback => callback(transaction),
  }));
  return {
    reads,
    writes,
    creationTime,
    run: data => registerPublicProfile.run(request(data, { uid, token: {} })),
  };
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

test('maps hardcoded reserved usernames to the generic unavailable response', async t => {
  const registration = mockRegistration(t, new Map([
    ['users/user-123', { displayName: 'Seller' }],
  ]));
  const error = await assertCallableError(
    () => registration.run({ username: 'ADMIN' }),
    'already-exists',
    'That username is unavailable.',
  );
  assert.equal(error.message.includes('ADMIN'), false);
});

test('existing registration retries return the current username without writes', async t => {
  const memberSince = Timestamp.fromDate(new Date('2024-01-01T00:00:00Z'));
  const records = new Map([
    ['users/user-123', { displayName: 'Renamed in private data' }],
    ['publicProfiles/user-123', {
      username: 'current_name',
      displayName: 'Public display name',
      photoURL: null,
      memberSince,
    }],
    ['usernameState/user-123', {
      lastRenamedAt: Timestamp.fromDate(new Date('2024-02-01T00:00:00Z')),
    }],
    ['usernameClaims/current_name', { uid: 'user-123' }],
    ['usernameClaims/claimed_name', { uid: 'another-user' }],
    ['reservedUsernames/reserved_name', { reserved: true }],
  ]);
  const registration = mockRegistration(t, records);

  for (const username of ['original_name', 'claimed_name', 'reserved_name', 'admin']) {
    assert.deepEqual(await registration.run({ username }), { username: 'current_name' });
  }
  assert.deepEqual(registration.writes, []);
  assert.deepEqual(records.get('publicProfiles/user-123'), {
    username: 'current_name',
    displayName: 'Public display name',
    photoURL: null,
    memberSince,
  });
  assert.equal(records.get('usernameState/user-123').lastRenamedAt.toDate().toISOString(),
    '2024-02-01T00:00:00.000Z');
  assert.equal(records.get('users/user-123').displayName, 'Renamed in private data');
  assert.equal(
    registration.reads.some(ref => ref.path === 'usernameClaims/claimed_name' ||
      ref.path === 'reservedUsernames/reserved_name'),
    false,
  );
  assert.equal(registration.reads.some(ref => ref.kind === 'private-users-query'), false);
});

test('existing registration retries fail closed on inconsistent profile, claim, or state', async t => {
  const memberSince = Timestamp.fromDate(new Date('2024-01-01T00:00:00Z'));
  const validProfile = {
    username: 'current_name',
    displayName: 'Public display name',
    photoURL: null,
    memberSince,
  };
  const validState = { lastRenamedAt: null };
  const scenarios = [
    { name: 'missing current claim', remove: 'usernameClaims/current_name' },
    { name: 'corrupt current claim', set: ['usernameClaims/current_name', { uid: 'other' }] },
    { name: 'missing state', remove: 'usernameState/user-123' },
    { name: 'corrupt state', set: ['usernameState/user-123', { lastRenamedAt: 'invalid' }] },
    {
      name: 'future state',
      set: ['usernameState/user-123', { lastRenamedAt: Timestamp.fromMillis(Date.now() + 60_000) }],
    },
    {
      name: 'extra claim',
      set: ['usernameClaims/extra_name', { uid: 'user-123' }],
    },
    {
      name: 'mismatched Auth memberSince',
      set: ['publicProfiles/user-123', { ...validProfile, memberSince: Timestamp.fromMillis(0) }],
    },
    {
      name: 'unapproved photo',
      set: ['publicProfiles/user-123', { ...validProfile, photoURL: 'https://example.test/photo.jpg' }],
    },
    {
      name: 'noncanonical current username',
      set: ['publicProfiles/user-123', { ...validProfile, username: 'Current_Name' }],
    },
  ];

  for (const scenario of scenarios) {
    const records = new Map([
      ['users/user-123', { displayName: 'Private display name' }],
      ['publicProfiles/user-123', validProfile],
      ['usernameState/user-123', validState],
      ['usernameClaims/current_name', { uid: 'user-123' }],
    ]);
    if (scenario.remove) records.delete(scenario.remove);
    if (scenario.set) records.set(...scenario.set);
    const registration = mockRegistration(t, records);
    await assertCallableError(
      () => registration.run({ username: 'requested_name' }),
      'failed-precondition',
      INCONSISTENT_PROFILE_MESSAGE,
    );
    assert.deepEqual(registration.writes, [], scenario.name);
  }
});

test('new registration rejects an orphan UID claim and creates no partial records', async t => {
  const records = new Map([
    ['users/user-123', { displayName: 'Seller' }],
    ['usernameClaims/orphan_name', { uid: 'user-123' }],
  ]);
  const registration = mockRegistration(t, records);

  await assertCallableError(
    () => registration.run({ username: 'requested_name' }),
    'failed-precondition',
    INCONSISTENT_PROFILE_MESSAGE,
  );
  assert.deepEqual(registration.writes, []);
});

test('new registration creates public profile, claim, and state atomically', async t => {
  const records = new Map([
    ['users/user-123', { displayName: 'Seller' }],
  ]);
  const registration = mockRegistration(t, records);

  assert.deepEqual(await registration.run({ username: 'seller_1' }), { username: 'seller_1' });
  assert.deepEqual(registration.writes.map(([operation, path]) => [operation, path]), [
    ['create', 'publicProfiles/user-123'],
    ['create', 'usernameClaims/seller_1'],
    ['create', 'usernameState/user-123'],
  ]);
  assert.deepEqual(registration.writes[0][2], {
    username: 'seller_1',
    displayName: 'Seller',
    photoURL: null,
    memberSince: Timestamp.fromDate(new Date(registration.creationTime)),
  });
  assert.deepEqual(registration.writes[1][2], { uid: 'user-123' });
  assert.deepEqual(registration.writes[2][2], { lastRenamedAt: null });
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
