const assert = require('node:assert/strict');
const { randomBytes } = require('node:crypto');
const { after, before, test } = require('node:test');
const { initializeApp: initializeAdminApp, deleteApp: deleteAdminApp } = require('firebase-admin/app');
const { getAuth: getAdminAuth } = require('firebase-admin/auth');
const { getFirestore: getAdminFirestore, Timestamp } = require('firebase-admin/firestore');
const { initializeApp, deleteApp } = require('firebase/app');
const { connectAuthEmulator, createUserWithEmailAndPassword, getAuth } = require('firebase/auth');
const { connectFunctionsEmulator, getFunctions, httpsCallable } = require('firebase/functions');
const { connectFirestoreEmulator, doc, getDoc, getFirestore, setDoc } = require('firebase/firestore');

const PROJECT_ID = 'demo-yardsale-hub';
const ENDPOINTS = {
  FIREBASE_AUTH_EMULATOR_HOST: '127.0.0.1:9099',
  FIRESTORE_EMULATOR_HOST: '127.0.0.1:8080',
  FUNCTIONS_EMULATOR_HOST: '127.0.0.1:5001',
  FIREBASE_EMULATOR_HUB: '127.0.0.1:4400',
};
const apps = [];
const users = [];
const documents = new Map();
let adminApp;
let adminAuth;
let db;

function uniqueName() {
  return `u${randomBytes(8).toString('hex')}`;
}

function reference(collection, id) {
  const ref = db.collection(collection).doc(id);
  documents.set(ref.path, ref);
  return ref;
}

function trackedDocuments(uid, username) {
  return {
    user: reference('users', uid),
    profile: reference('publicProfiles', uid),
    claim: reference('usernameClaims', username),
    state: reference('usernameState', uid),
  };
}

async function snapshots(refs) {
  return Promise.all(refs.map(ref => ref.get()));
}

function assertUnchanged(beforeSnapshots, afterSnapshots) {
  for (let i = 0; i < beforeSnapshots.length; i++) {
    assert.equal(afterSnapshots[i].exists, beforeSnapshots[i].exists);
    if (beforeSnapshots[i].exists) {
      assert.deepEqual(afterSnapshots[i].data(), beforeSnapshots[i].data());
      assert.ok(afterSnapshots[i].updateTime.isEqual(beforeSnapshots[i].updateTime));
    }
  }
}

async function assertCallableError(promise, code) {
  await assert.rejects(promise, error => {
    assert.equal(error.code, `functions/${code}`);
    return true;
  });
}

function client() {
  const app = initializeApp({ projectId: PROJECT_ID, apiKey: 'emulator-only' }, uniqueName());
  apps.push(app);
  const auth = getAuth(app);
  connectAuthEmulator(auth, `http://${ENDPOINTS.FIREBASE_AUTH_EMULATOR_HOST}`, {
    disableWarnings: true,
  });
  const functions = getFunctions(app, 'us-central1');
  connectFunctionsEmulator(functions, '127.0.0.1', 5001);
  const firestore = getFirestore(app);
  connectFirestoreEmulator(firestore, '127.0.0.1', 8080);
  return {
    auth,
    firestore,
    register: httpsCallable(functions, 'registerPublicProfile'),
    rename: httpsCallable(functions, 'renameUsername'),
  };
}

async function authenticatedUser() {
  const instance = client();
  const result = await createUserWithEmailAndPassword(
    instance.auth, `${uniqueName()}@example.test`, 'emulator-test-password',
  );
  users.push(result.user.uid);
  return { ...instance, uid: result.user.uid };
}

async function fixture(user, username, overrides = {}) {
  const refs = trackedDocuments(user.uid, username);
  const privateData = {
    id: user.uid,
    displayName: 'Legacy Seller',
    email: 'private@example.test',
    location: 'Private location',
    zip: '12345',
    bio: 'Private bio',
    photoURL: 'https://example.test/legacy-photo.jpg',
    createdAt: Timestamp.fromDate(new Date('2010-01-01T00:00:00Z')),
    ...overrides,
  };
  await refs.user.set(privateData);
  return { refs, privateData };
}

async function expectedMemberSince(uid) {
  const authUser = await adminAuth.getUser(uid);
  return Timestamp.fromDate(new Date(authUser.metadata.creationTime));
}

before(async () => {
  assert.equal(process.env.GCLOUD_PROJECT, PROJECT_ID, 'Expected the demo project');
  if (process.env.GOOGLE_CLOUD_PROJECT) {
    assert.equal(process.env.GOOGLE_CLOUD_PROJECT, PROJECT_ID);
  }
  if (process.env.FIREBASE_CONFIG) {
    assert.equal(JSON.parse(process.env.FIREBASE_CONFIG).projectId, PROJECT_ID);
  }
  for (const [name, endpoint] of Object.entries(ENDPOINTS)) {
    assert.equal(process.env[name], endpoint, `${name} must be the configured local emulator`);
  }
  const response = await fetch(`http://${ENDPOINTS.FIREBASE_EMULATOR_HUB}/emulators`);
  assert.equal(response.ok, true, 'Emulator hub must be available');
  const emulators = await response.json();
  for (const [name, port] of [['auth', 9099], ['firestore', 8080], ['functions', 5001]]) {
    assert.equal(emulators[name]?.host, '127.0.0.1', `${name} must be local`);
    assert.equal(emulators[name]?.port, port, `${name} must use its configured port`);
  }

  adminApp = initializeAdminApp({ projectId: PROJECT_ID }, 'public-profile-integration');
  adminAuth = getAdminAuth(adminApp);
  db = getAdminFirestore(adminApp);
});

after(async () => {
  const cleanup = [];
  if (db) {
    for (const ref of documents.values()) cleanup.push(ref.delete());
  }
  if (adminAuth) {
    for (const uid of users) cleanup.push(adminAuth.deleteUser(uid));
  }
  const results = await Promise.allSettled(cleanup);
  for (const app of apps) results.push(await Promise.resolve(deleteApp(app)).then(
    () => ({ status: 'fulfilled' }),
    reason => ({ status: 'rejected', reason }),
  ));
  if (adminApp) results.push(await Promise.resolve(deleteAdminApp(adminApp)).then(
    () => ({ status: 'fulfilled' }),
    reason => ({ status: 'rejected', reason }),
  ));
  const failures = results.filter(result => result.status === 'rejected');
  if (failures.length) throw new AggregateError(failures.map(result => result.reason), 'Fixture cleanup failed');
});

test('requires authentication and rejects client identity, timestamps and extra fields', async () => {
  const anonymous = client();
  await assertCallableError(anonymous.register({ username: uniqueName() }), 'unauthenticated');

  const user = await authenticatedUser();
  const username = uniqueName();
  const { refs } = await fixture(user, username);
  const allRefs = Object.values(refs);
  const beforeSnapshots = await snapshots(allRefs);
  for (const extra of [
    { uid: 'forged' },
    { memberSince: '2020-01-01' },
    { displayName: 'Forged' },
    { photoURL: 'https://example.test/photo.jpg' },
  ]) {
    await assertCallableError(user.register({ username, ...extra }), 'invalid-argument');
  }
  assertUnchanged(beforeSnapshots, await snapshots(allRefs));
});

test('registers a legacy user with verified public data and enforces client rules', async () => {
  const user = await authenticatedUser();
  const other = await authenticatedUser();
  const username = uniqueName();
  const { refs, privateData } = await fixture(user, username);
  const privateBefore = await refs.user.get();
  const memberSince = await expectedMemberSince(user.uid);
  for (const ref of [refs.profile, refs.claim, refs.state]) {
    assert.equal((await ref.get()).exists, false);
  }

  assert.deepEqual((await user.register({ username: username.toUpperCase() })).data, { username });
  const [profile, claim, state, privateAfter] = await snapshots([
    refs.profile, refs.claim, refs.state, refs.user,
  ]);
  assert.deepEqual(Object.keys(profile.data()).sort(), ['displayName', 'memberSince', 'photoURL', 'username']);
  assert.equal(profile.get('username'), username);
  assert.equal(profile.get('displayName'), privateData.displayName);
  assert.equal(profile.get('photoURL'), null);
  assert.ok(profile.get('memberSince') instanceof Timestamp);
  assert.ok(profile.get('memberSince').isEqual(memberSince));
  assert.deepEqual(claim.data(), { uid: user.uid });
  assert.deepEqual(state.data(), { lastRenamedAt: null });
  assertUnchanged([privateBefore], [privateAfter]);

  const anonymous = client();
  const publicDoc = await getDoc(doc(anonymous.firestore, 'publicProfiles', user.uid));
  assert.equal(publicDoc.data().username, username);
  await assert.rejects(getDoc(doc(other.firestore, 'users', user.uid)), { code: 'permission-denied' });
  const attemptedProfile = reference('publicProfiles', uniqueName());
  const attemptedClaim = reference('usernameClaims', uniqueName());
  const cleanupRefs = [refs.profile, refs.claim, attemptedProfile, attemptedClaim];
  try {
    await assert.rejects(setDoc(doc(user.firestore, 'publicProfiles', user.uid), { username }), {
      code: 'permission-denied',
    });
    await assert.rejects(setDoc(doc(user.firestore, 'publicProfiles', attemptedProfile.id), { username }), {
      code: 'permission-denied',
    });
    await assert.rejects(setDoc(doc(user.firestore, 'usernameClaims', username), { uid: user.uid }), {
      code: 'permission-denied',
    });
    await assert.rejects(setDoc(doc(user.firestore, 'usernameClaims', attemptedClaim.id), { uid: user.uid }), {
      code: 'permission-denied',
    });
  } finally {
    const results = await Promise.allSettled(cleanupRefs.map(ref => ref.delete()));
    const failures = results.filter(result => result.status === 'rejected');
    if (failures.length) {
      throw new AggregateError(failures.map(result => result.reason), 'Denied-write fixture cleanup failed');
    }
    for (const ref of cleanupRefs) documents.delete(ref.path);
  }
});

test('rejects duplicate and case-insensitive claims without partial records', async () => {
  const first = await authenticatedUser();
  const second = await authenticatedUser();
  const username = uniqueName();
  const { refs: firstRefs } = await fixture(first, username);
  const { refs: secondRefs } = await fixture(second, username);
  await first.register({ username });
  const allRefs = [firstRefs.profile, firstRefs.claim, firstRefs.state, secondRefs.user, secondRefs.profile, secondRefs.state];
  const beforeSnapshots = await snapshots(allRefs);

  await assertCallableError(second.register({ username }), 'already-exists');
  await assertCallableError(second.register({ username: username.toUpperCase() }), 'already-exists');
  assertUnchanged(beforeSnapshots, await snapshots(allRefs));
  assert.equal((await secondRefs.profile.get()).exists, false);
  assert.equal((await secondRefs.state.get()).exists, false);
});

test('concurrent users cannot both claim the same canonical username', async () => {
  const first = await authenticatedUser();
  const second = await authenticatedUser();
  assert.notEqual(first.uid, second.uid);
  const username = uniqueName();
  const { refs: firstRefs } = await fixture(first, username);
  const { refs: secondRefs } = await fixture(second, username);
  const results = await Promise.allSettled([
    first.register({ username }),
    second.register({ username: username.toUpperCase() }),
  ]);
  assert.equal(results.filter(result => result.status === 'fulfilled').length, 1);
  const failure = results.find(result => result.status === 'rejected');
  assert.equal(failure.reason.code, 'functions/already-exists');
  const winner = results[0].status === 'fulfilled' ? first : second;
  const loserRefs = results[0].status === 'fulfilled' ? secondRefs : firstRefs;
  const winnerRefs = results[0].status === 'fulfilled' ? firstRefs : secondRefs;
  assert.deepEqual((await winnerRefs.claim.get()).data(), { uid: winner.uid });
  assert.equal((await winnerRefs.profile.get()).get('username'), username);
  assert.deepEqual((await winnerRefs.state.get()).data(), { lastRenamedAt: null });
  assert.equal((await loserRefs.profile.get()).exists, false);
  assert.equal((await loserRefs.state.get()).exists, false);
});

test('rejects hardcoded and admin-reserved usernames without writes', async () => {
  const user = await authenticatedUser();
  const username = uniqueName();
  const { refs } = await fixture(user, username);
  const reserved = reference('reservedUsernames', username);
  const hardcodedClaim = db.collection('usernameClaims').doc('admin');
  await reserved.set({ reserved: true });
  const allRefs = [...Object.values(refs), reserved, hardcodedClaim];
  const beforeSnapshots = await snapshots(allRefs);

  await assertCallableError(user.register({ username: 'ADMIN' }), 'already-exists');
  await assertCallableError(user.register({ username }), 'already-exists');
  assertUnchanged(beforeSnapshots, await snapshots(allRefs));
});

test('identical retries do not rewrite any records or memberSince', async () => {
  const user = await authenticatedUser();
  const username = uniqueName();
  const { refs } = await fixture(user, username);
  await user.register({ username });
  const allRefs = Object.values(refs);
  const beforeSnapshots = await snapshots(allRefs);

  assert.deepEqual((await user.register({ username: username.toUpperCase() })).data, { username });
  assertUnchanged(beforeSnapshots, await snapshots(allRefs));
  assert.ok((await refs.profile.get()).get('memberSince').isEqual(await expectedMemberSince(user.uid)));
});

test('missing or malformed private users fail without partial writes', async () => {
  for (const data of [null, {}, { displayName: '' }, { displayName: '  ' }, { displayName: 42 }]) {
    const user = await authenticatedUser();
    const username = uniqueName();
    const refs = trackedDocuments(user.uid, username);
    if (data !== null) await refs.user.set(data);
    const allRefs = Object.values(refs);
    const beforeSnapshots = await snapshots(allRefs);
    await assertCallableError(user.register({ username }), 'failed-precondition');
    assertUnchanged(beforeSnapshots, await snapshots(allRefs));
  }
});

test('conflicting claims and inconsistent records fail without repairs or partial writes', async () => {
  for (const scenario of ['conflicting-claim', 'missing-claim', 'malformed-claim', 'missing-state', 'malformed-state', 'inconsistent-profile']) {
    const user = await authenticatedUser();
    const username = uniqueName();
    const { refs } = await fixture(user, username);
    const memberSince = await expectedMemberSince(user.uid);
    const profile = { username, displayName: 'Legacy Seller', photoURL: null, memberSince };
    if (scenario === 'conflicting-claim') {
      await refs.claim.set({ uid: 'another-user' });
    } else {
      await refs.profile.set(scenario === 'inconsistent-profile' ? { ...profile, photoURL: 'legacy' } : profile);
      if (scenario !== 'missing-claim') await refs.claim.set(scenario === 'malformed-claim' ? {} : { uid: user.uid });
      if (scenario !== 'missing-state') {
        await refs.state.set({ lastRenamedAt: scenario === 'malformed-state' ? 'invalid' : null });
      }
    }
    const allRefs = Object.values(refs);
    const beforeSnapshots = await snapshots(allRefs);
    await assertCallableError(
      user.register({ username }),
      scenario === 'conflicting-claim' ? 'already-exists' : 'failed-precondition',
    );
    assertUnchanged(beforeSnapshots, await snapshots(allRefs));
  }
});

test('rename requires authentication and rejects forged identity and timestamps', async () => {
  const anonymous = client();
  await assertCallableError(anonymous.rename({ username: uniqueName() }), 'unauthenticated');
  const user = await authenticatedUser();
  const username = uniqueName();
  const { refs } = await fixture(user, username);
  await user.register({ username });
  const requested = uniqueName();
  const allRefs = [...Object.values(refs), reference('usernameClaims', requested)];
  const beforeSnapshots = await snapshots(allRefs);
  for (const extra of [
    { uid: 'forged' },
    { lastRenamedAt: '2020-01-01' },
    { memberSince: '2020-01-01' },
    { displayName: 'Forged' },
  ]) {
    await assertCallableError(user.rename({ username: requested, ...extra }), 'invalid-argument');
  }
  assertUnchanged(beforeSnapshots, await snapshots(allRefs));
});

test('first rename is immediate, preserves fields, and same-name retries are idempotent', async () => {
  const user = await authenticatedUser();
  const original = uniqueName();
  const requested = uniqueName();
  const { refs } = await fixture(user, original);
  const requestedClaim = reference('usernameClaims', requested);
  const reserved = reference('reservedUsernames', requested);
  await user.register({ username: original });
  await refs.profile.update({ photoURL: 'https://example.test/approved-photo.jpg' });
  const allRefs = [...Object.values(refs), requestedClaim];
  const registered = await snapshots(allRefs);

  assert.deepEqual((await user.rename({ username: original.toUpperCase() })).data, { username: original });
  assertUnchanged(registered, await snapshots(allRefs));
  assert.deepEqual((await user.rename({ username: requested.toUpperCase() })).data, { username: requested });
  const [privateAfter, profileAfter, oldClaim, stateAfter, newClaim] = await snapshots(allRefs);
  assertUnchanged([registered[0]], [privateAfter]);
  assert.deepEqual(profileAfter.data(), { ...registered[1].data(), username: requested });
  assert.equal(oldClaim.exists, false);
  assert.deepEqual(newClaim.data(), { uid: user.uid });
  assert.ok(stateAfter.get('lastRenamedAt') instanceof Timestamp);

  await reserved.set({ reserved: true });
  const afterRename = await snapshots([...allRefs, reserved]);
  assert.deepEqual((await user.rename({ username: requested })).data, { username: requested });
  assertUnchanged(afterRename, await snapshots([...allRefs, reserved]));

  const third = uniqueName();
  const thirdClaim = reference('usernameClaims', third);
  const beforeRejected = await snapshots([...allRefs, reserved, thirdClaim]);
  await assertCallableError(user.rename({ username: third }), 'failed-precondition');
  assertUnchanged(beforeRejected, await snapshots([...allRefs, reserved, thirdClaim]));
});

test('rename cooldown rejects recent changes and allows changes after 30 days', async () => {
  const user = await authenticatedUser();
  const original = uniqueName();
  const requested = uniqueName();
  const { refs } = await fixture(user, original);
  const requestedClaim = reference('usernameClaims', requested);
  await user.register({ username: original });
  const day = 24 * 60 * 60 * 1000;
  await refs.state.update({ lastRenamedAt: Timestamp.fromMillis(Date.now() - 29 * day) });
  const allRefs = [...Object.values(refs), requestedClaim];
  const beforeSnapshots = await snapshots(allRefs);
  await assertCallableError(user.rename({ username: requested }), 'failed-precondition');
  assertUnchanged(beforeSnapshots, await snapshots(allRefs));

  await refs.state.update({ lastRenamedAt: Timestamp.fromMillis(Date.now() - 31 * day) });
  assert.deepEqual((await user.rename({ username: requested })).data, { username: requested });
  assert.equal((await refs.claim.get()).exists, false);
  assert.deepEqual((await requestedClaim.get()).data(), { uid: user.uid });
});

test('rename rejects reserved and claimed usernames without changing records', async () => {
  const user = await authenticatedUser();
  const other = await authenticatedUser();
  const original = uniqueName();
  const claimed = uniqueName();
  const reservedName = uniqueName();
  const { refs } = await fixture(user, original);
  const { refs: otherRefs } = await fixture(other, claimed);
  const reservedClaim = reference('usernameClaims', reservedName);
  const reserved = reference('reservedUsernames', reservedName);
  await user.register({ username: original });
  await other.register({ username: claimed });
  await reserved.set({ reserved: true });
  const allRefs = [...Object.values(refs), ...Object.values(otherRefs), reservedClaim, reserved];
  const beforeSnapshots = await snapshots(allRefs);

  await assertCallableError(user.rename({ username: 'ADMIN' }), 'already-exists');
  await assertCallableError(user.rename({ username: reservedName }), 'already-exists');
  await assertCallableError(user.rename({ username: claimed.toUpperCase() }), 'already-exists');
  assertUnchanged(beforeSnapshots, await snapshots(allRefs));
});

test('rename fails closed on corrupt ownership, profile, and cooldown state', async () => {
  for (const scenario of [
    'missing-profile', 'invalid-current-name', 'missing-current-claim',
    'other-current-owner', 'malformed-current-claim', 'missing-state',
    'malformed-state', 'future-state', 'self-owned-target', 'malformed-target',
  ]) {
    const user = await authenticatedUser();
    const original = uniqueName();
    const requested = uniqueName();
    const { refs } = await fixture(user, original);
    const requestedClaim = reference('usernameClaims', requested);
    await user.register({ username: original });
    if (scenario === 'missing-profile') await refs.profile.delete();
    if (scenario === 'invalid-current-name') await refs.profile.update({ username: 'invalid/name' });
    if (scenario === 'missing-current-claim') await refs.claim.delete();
    if (scenario === 'other-current-owner') await refs.claim.set({ uid: 'another-user' });
    if (scenario === 'malformed-current-claim') await refs.claim.set({ uid: user.uid, extra: true });
    if (scenario === 'missing-state') await refs.state.delete();
    if (scenario === 'malformed-state') await refs.state.set({ lastRenamedAt: 'invalid' });
    if (scenario === 'future-state') {
      await refs.state.set({ lastRenamedAt: Timestamp.fromMillis(Date.now() + 86400000) });
    }
    if (scenario === 'self-owned-target') await requestedClaim.set({ uid: user.uid });
    if (scenario === 'malformed-target') await requestedClaim.set({ unexpected: true });
    const allRefs = [...Object.values(refs), requestedClaim];
    const beforeSnapshots = await snapshots(allRefs);

    await assertCallableError(user.rename({ username: requested }), 'failed-precondition');
    assertUnchanged(beforeSnapshots, await snapshots(allRefs));
  }
});

test('concurrent different renames allow at most one change and leave no partial claim', async () => {
  const user = await authenticatedUser();
  const original = uniqueName();
  const first = uniqueName();
  const second = uniqueName();
  const { refs } = await fixture(user, original);
  const firstClaim = reference('usernameClaims', first);
  const secondClaim = reference('usernameClaims', second);
  await user.register({ username: original });
  const results = await Promise.allSettled([
    user.rename({ username: first }),
    user.rename({ username: second }),
  ]);
  assert.equal(results.filter(result => result.status === 'fulfilled').length, 1);
  assert.equal(results.find(result => result.status === 'rejected').reason.code, 'functions/failed-precondition');
  const winner = results[0].status === 'fulfilled' ? first : second;
  const winnerClaim = results[0].status === 'fulfilled' ? firstClaim : secondClaim;
  const loserClaim = results[0].status === 'fulfilled' ? secondClaim : firstClaim;
  assert.equal((await refs.profile.get()).get('username'), winner);
  assert.equal((await refs.claim.get()).exists, false);
  assert.deepEqual((await winnerClaim.get()).data(), { uid: user.uid });
  assert.equal((await loserClaim.get()).exists, false);
  assert.ok((await refs.state.get()).get('lastRenamedAt') instanceof Timestamp);
});

test('registration and rename contend for one canonical claim without partial changes', async () => {
  const renamer = await authenticatedUser();
  const registrant = await authenticatedUser();
  assert.notEqual(renamer.uid, registrant.uid);
  const original = uniqueName();
  const requested = uniqueName();
  const { refs: oldRefs } = await fixture(renamer, original);
  const { refs: newRefs } = await fixture(registrant, requested);
  await renamer.register({ username: original });
  const results = await Promise.allSettled([
    renamer.rename({ username: requested }),
    registrant.register({ username: requested.toUpperCase() }),
  ]);
  assert.equal(results.filter(result => result.status === 'fulfilled').length, 1);
  assert.equal(results.find(result => result.status === 'rejected').reason.code, 'functions/already-exists');
  if (results[0].status === 'fulfilled') {
    assert.deepEqual((await newRefs.claim.get()).data(), { uid: renamer.uid });
    assert.equal((await oldRefs.claim.get()).exists, false);
    assert.equal((await oldRefs.profile.get()).get('username'), requested);
    assert.equal((await newRefs.profile.get()).exists, false);
    assert.equal((await newRefs.state.get()).exists, false);
  } else {
    assert.deepEqual((await newRefs.claim.get()).data(), { uid: registrant.uid });
    assert.deepEqual((await oldRefs.claim.get()).data(), { uid: renamer.uid });
    assert.equal((await oldRefs.profile.get()).get('username'), original);
    assert.deepEqual((await oldRefs.state.get()).data(), { lastRenamedAt: null });
    assert.equal((await newRefs.profile.get()).get('username'), requested);
  }
});
