const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { readFileSync } = require('node:fs');
const path = require('node:path');
const { after, before, test } = require('node:test');
const { initializeTestEnvironment } = require('@firebase/rules-unit-testing');
const { initializeApp: initializeAdminApp, deleteApp: deleteAdminApp } = require('firebase-admin/app');
const { getAuth: getAdminAuth } = require('firebase-admin/auth');
const { getFirestore: getAdminFirestore, Timestamp } = require('firebase-admin/firestore');
const { initializeApp, deleteApp } = require('firebase/app');
const { connectAuthEmulator, createUserWithEmailAndPassword, getAuth } = require('firebase/auth');
const { connectFunctionsEmulator, getFunctions, httpsCallable } = require('firebase/functions');
const {
  collection, connectFirestoreEmulator, doc, getDocFromServer, getDocsFromServer,
  getFirestore,
} = require('firebase/firestore');

const PROJECT_ID = 'demo-yardsale-hub';
const HOST = '127.0.0.1';
const PORTS = { auth: 9099, firestore: 8080, functions: 5001, hub: 4400 };
const users = [];
const fixturePaths = [];
const apps = [];
let rules;
let adminApp;
let adminAuth;
let adminFirestore;

function assertCallableFailure(promise, code) {
  return assert.rejects(promise, error => {
    assert.equal(error.code, `functions/${code}`);
    return true;
  });
}

function client(label, uid) {
  const app = initializeApp(
    { projectId: PROJECT_ID, apiKey: 'emulator-only' },
    `public-username-${label}-${randomUUID()}`,
  );
  apps.push(app);
  const auth = getAuth(app);
  connectAuthEmulator(auth, `http://${HOST}:${PORTS.auth}`, { disableWarnings: true });
  const firestore = getFirestore(app);
  connectFirestoreEmulator(firestore, HOST, PORTS.firestore);
  const functions = getFunctions(app, 'us-south1');
  connectFunctionsEmulator(functions, HOST, PORTS.functions);
  return {
    auth,
    firestore,
    lookup: httpsCallable(functions, 'getPublicUsername'),
    signIn: uid ? createUserWithEmailAndPassword(
      auth, `${uid}@example.test`, 'emulator-test-password',
    ).then(result => {
      users.push(result.user.uid);
      return result.user.uid;
    }) : Promise.resolve(null),
  };
}

before(async () => {
  assert.equal(process.env.GCLOUD_PROJECT, PROJECT_ID);
  assert.equal(process.env.GOOGLE_APPLICATION_CREDENTIALS, undefined);
  for (const [key, name] of [
    ['FIREBASE_AUTH_EMULATOR_HOST', 'auth'],
    ['FIRESTORE_EMULATOR_HOST', 'firestore'],
    ['FUNCTIONS_EMULATOR_HOST', 'functions'],
    ['FIREBASE_EMULATOR_HUB', 'hub'],
  ]) {
    assert.equal(process.env[key], `${HOST}:${PORTS[name]}`);
  }
  const response = await fetch(`http://${HOST}:${PORTS.hub}/emulators`, {
    signal: AbortSignal.timeout(5000),
  });
  assert.equal(response.ok, true);
  const emulators = await response.json();
  for (const name of ['auth', 'firestore', 'functions']) {
    assert.equal(emulators[name]?.host, HOST);
    assert.equal(emulators[name]?.port, PORTS[name]);
  }

  rules = await initializeTestEnvironment({
    projectId: PROJECT_ID,
    firestore: {
      host: HOST,
      port: PORTS.firestore,
      rules: readFileSync(path.join(__dirname, '../../firestore.production-candidate.rules'), 'utf8'),
    },
  });
  adminApp = initializeAdminApp({ projectId: PROJECT_ID }, 'public-username-integration');
  adminAuth = getAdminAuth(adminApp);
  adminFirestore = getAdminFirestore(adminApp);
});

after(async () => {
  const results = [];
  if (adminFirestore) {
    for (const fixturePath of fixturePaths) {
      results.push(await Promise.resolve().then(() =>
        adminFirestore.doc(fixturePath).delete()).then(
        () => ({ status: 'fulfilled' }),
        reason => ({ status: 'rejected', reason }),
      ));
    }
  }
  for (const uid of users) {
    results.push(await Promise.resolve().then(() => adminAuth.deleteUser(uid)).then(
      () => ({ status: 'fulfilled' }),
      reason => ({ status: 'rejected', reason }),
    ));
  }
  for (const app of apps) {
    results.push(await Promise.resolve().then(() => deleteApp(app)).then(
      () => ({ status: 'fulfilled' }),
      reason => ({ status: 'rejected', reason }),
    ));
  }
  if (rules) {
    results.push(await Promise.resolve().then(() => rules.cleanup()).then(
      () => ({ status: 'fulfilled' }),
      reason => ({ status: 'rejected', reason }),
    ));
  }
  if (adminApp) {
    results.push(await Promise.resolve().then(() => deleteAdminApp(adminApp)).then(
      () => ({ status: 'fulfilled' }),
      reason => ({ status: 'rejected', reason }),
    ));
  }
  const failures = results.filter(result => result.status === 'rejected');
  if (failures.length) {
    throw new AggregateError(failures.map(result => result.reason), 'Username emulator cleanup failed');
  }
});

test('scoped username callable works with candidate Rules without broadening profile reads', {
  timeout: 120_000,
}, async () => {
  const owner = client('owner', `owner-${randomUUID()}`);
  const outsider = client('outsider', `outsider-${randomUUID()}`);
  const anonymous = client('anonymous', null);
  const [ownerUid, outsiderUid] = await Promise.all([owner.signIn, outsider.signIn]);
  const sellerUid = `seller-${randomUUID()}`;
  const itemId = `item-${randomUUID()}`;
  const missingProfileItemId = `missing-${randomUUID()}`;
  const ownerMessageId = `message-${randomUUID()}`;
  const unrelatedMessageId = `message-${randomUUID()}`;
  const privateEmail = 'private@example.test';
  const memberSince = Timestamp.fromMillis(1);
  fixturePaths.push(
    `publicProfiles/${ownerUid}`,
    `usernameClaims/owner_user`,
    `publicProfiles/${sellerUid}`,
    `usernameClaims/seller_user`,
    `publicProfiles/malformed-${sellerUid}`,
    `usernameClaims/bad_user`,
    `users/${ownerUid}`,
    `items/${itemId}`,
    `items/${missingProfileItemId}`,
    `items/malformed-${itemId}`,
    `messages/${ownerMessageId}`,
    `messages/${unrelatedMessageId}`,
  );

  await Promise.all([
    adminFirestore.collection('publicProfiles').doc(ownerUid).set({
      username: 'owner_user', displayName: 'owner_user', photoURL: null, memberSince,
    }),
    adminFirestore.collection('usernameClaims').doc('owner_user').set({ uid: ownerUid }),
    adminFirestore.collection('publicProfiles').doc(sellerUid).set({
      username: 'seller_user', displayName: 'seller_user', photoURL: null, memberSince,
    }),
    adminFirestore.collection('usernameClaims').doc('seller_user').set({ uid: sellerUid }),
    adminFirestore.collection('publicProfiles').doc(`malformed-${sellerUid}`).set({
      username: 'bad_user', displayName: 'bad_user', photoURL: null, memberSince,
      email: privateEmail,
    }),
    adminFirestore.collection('usernameClaims').doc('bad_user').set({
      uid: `malformed-${sellerUid}`,
    }),
    adminFirestore.collection('users').doc(ownerUid).set({
      email: privateEmail, displayName: 'Private owner name', location: 'Private city',
      bio: 'Private biography', photoURL: 'https://example.test/private.jpg',
    }),
    adminFirestore.collection('items').doc(itemId).set({
      userId: sellerUid, title: 'Public item',
    }),
    adminFirestore.collection('items').doc(missingProfileItemId).set({
      userId: `deleted-${sellerUid}`, title: 'Public item without a profile',
    }),
    adminFirestore.collection('items').doc(`malformed-${itemId}`).set({
      userId: `malformed-${sellerUid}`, title: 'Public item with malformed profile',
    }),
    adminFirestore.collection('messages').doc(ownerMessageId).set({
      senderId: ownerUid, recipientId: sellerUid,
    }),
    adminFirestore.collection('messages').doc(unrelatedMessageId).set({
      senderId: outsiderUid, recipientId: sellerUid,
    }),
  ]);

  const anonymousItem = await getDocFromServer(doc(anonymous.firestore, 'items', itemId));
  assert.equal(anonymousItem.get('title'), 'Public item');
  const itemUsername = await anonymous.lookup({ mode: 'item', itemId });
  assert.deepEqual(itemUsername.data, { username: 'seller_user' });
  assert.deepEqual(Object.keys(itemUsername.data), ['username']);
  assert.ok(!JSON.stringify(itemUsername.data).includes(privateEmail));
  assert.deepEqual((await anonymous.lookup({
    mode: 'item', itemId: missingProfileItemId,
  })).data, { username: null });
  assert.deepEqual((await anonymous.lookup({
    mode: 'item', itemId: `malformed-${itemId}`,
  })).data, { username: null });

  const ownerUsername = await owner.lookup({ mode: 'self' });
  assert.deepEqual(ownerUsername.data, { username: 'owner_user' });
  await assertCallableFailure(owner.lookup({ mode: 'self', uid: sellerUid }), 'invalid-argument');
  await assertCallableFailure(anonymous.lookup({ mode: 'self' }), 'unauthenticated');
  await assertCallableFailure(
    anonymous.lookup({ mode: 'conversation', messageId: ownerMessageId }),
    'unauthenticated',
  );

  assert.deepEqual((await owner.lookup({
    mode: 'conversation', messageId: ownerMessageId,
  })).data, { username: 'seller_user' });
  assert.deepEqual((await outsider.lookup({
    mode: 'conversation', messageId: ownerMessageId,
  })).data, { username: null });

  await assertCallableFailure(
    anonymous.lookup({ mode: 'uid', uid: sellerUid }),
    'invalid-argument',
  );
  for (const viewer of [anonymous.firestore, outsider.firestore, owner.firestore]) {
    await assert.rejects(
      getDocFromServer(doc(viewer, 'publicProfiles', sellerUid)),
      { code: 'permission-denied' },
    );
    await assert.rejects(
      getDocsFromServer(collection(viewer, 'publicProfiles')),
      { code: 'permission-denied' },
    );
  }
  await assert.rejects(
    getDocFromServer(doc(outsider.firestore, 'users', ownerUid)),
    { code: 'permission-denied' },
  );
  assert.equal(
    (await getDocFromServer(doc(owner.firestore, 'users', ownerUid))).get('email'),
    privateEmail,
  );
  await assert.rejects(
    getDocFromServer(doc(outsider.firestore, 'messages', ownerMessageId)),
    { code: 'permission-denied' },
  );
  assert.deepEqual((await owner.lookup({
    mode: 'conversation', messageId: unrelatedMessageId,
  })).data, { username: null });

  const abuseAttempts = await Promise.allSettled(Array.from({ length: 130 }, () =>
    anonymous.lookup({ mode: 'item', itemId }),
  ));
  assert.ok(
    abuseAttempts.some(result =>
      result.status === 'rejected' &&
      result.reason.code === 'functions/resource-exhausted'),
    'anonymous item lookups from one source must be rate limited',
  );
});
