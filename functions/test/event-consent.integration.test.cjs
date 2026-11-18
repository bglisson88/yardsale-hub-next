const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { readFileSync } = require('node:fs');
const path = require('node:path');
const { test } = require('node:test');
const { initializeTestEnvironment } = require('@firebase/rules-unit-testing');
const { initializeApp: initializeAdminApp, deleteApp: deleteAdminApp } = require('firebase-admin/app');
const { getAuth: getAdminAuth } = require('firebase-admin/auth');
const { getFirestore: getAdminFirestore } = require('firebase-admin/firestore');
const { initializeApp, deleteApp } = require('firebase/app');
const { connectAuthEmulator, createUserWithEmailAndPassword, getAuth } = require('firebase/auth');
const { connectFunctionsEmulator, getFunctions, httpsCallable } = require('firebase/functions');
const {
  Timestamp, collection, connectFirestoreEmulator, doc, documentId, getDocFromServer,
  getFirestore, onSnapshot, query, setDoc, where,
} = require('firebase/firestore');

const PROJECT_ID = 'demo-yardsale-hub';
const HOST = '127.0.0.1';
const PORTS = { auth: 9099, firestore: 8080, functions: 5001, hub: 4400 };
const PROJECTION_FIELDS = [
  'createdAt', 'description', 'endDate', 'itemCount', 'location', 'locationId',
  'locationVisibility', 'photoURL', 'schemaVersion', 'startDate', 'title', 'updatedAt',
];

async function assertLocalEmulators() {
  assert.equal(process.env.GCLOUD_PROJECT, PROJECT_ID);
  assert.equal(process.env.GOOGLE_APPLICATION_CREDENTIALS, undefined);
  if (process.env.GOOGLE_CLOUD_PROJECT) assert.equal(process.env.GOOGLE_CLOUD_PROJECT, PROJECT_ID);
  if (process.env.FIREBASE_CONFIG) {
    assert.equal(JSON.parse(process.env.FIREBASE_CONFIG).projectId, PROJECT_ID);
  }
  for (const [key, name] of [
    ['FIREBASE_AUTH_EMULATOR_HOST', 'auth'],
    ['FIRESTORE_EMULATOR_HOST', 'firestore'],
    ['FUNCTIONS_EMULATOR_HOST', 'functions'],
    ['FIREBASE_EMULATOR_HUB', 'hub'],
  ]) {
    assert.equal(process.env[key], `${HOST}:${PORTS[name]}`, `${key} must point to the local emulator`);
  }
  const response = await fetch(`http://${HOST}:${PORTS.hub}/emulators`, {
    signal: AbortSignal.timeout(5000),
  });
  assert.equal(response.ok, true, 'Expected a running emulator hub');
  const emulators = await response.json();
  for (const name of ['auth', 'firestore', 'functions']) {
    assert.equal(emulators[name]?.host, HOST);
    assert.equal(emulators[name]?.port, PORTS[name]);
  }
}

function waitForPublicProjection(db, eventId, visibility) {
  const eventQuery = query(
    collection(db, 'publicYardSaleEvents'), where(documentId(), '==', eventId),
  );
  const timeoutMs = 20_000;
  let unsubscribe;
  let timer;
  return new Promise((resolve, reject) => {
    timer = setTimeout(() => reject(new Error(
      `Timed out after ${timeoutMs} ms waiting for public projection to be ${visibility ?? 'absent'}`,
    )), timeoutMs);
    unsubscribe = onSnapshot(eventQuery, { includeMetadataChanges: true }, snapshot => {
      if (snapshot.metadata.fromCache) return;
      const projection = snapshot.docs[0]?.data();
      if (visibility === null ? snapshot.empty : projection?.locationVisibility === visibility) {
        resolve(projection);
      }
    }, reject);
  }).finally(() => {
    clearTimeout(timer);
    unsubscribe?.();
  });
}

function assertProjection(projection, input) {
  assert.deepEqual(Object.keys(projection).sort(), PROJECTION_FIELDS);
  assert.equal(projection.schemaVersion, 1);
  for (const key of ['title', 'description', 'location', 'locationId', 'locationVisibility']) {
    assert.equal(projection[key], input[key], `Unexpected projected ${key}`);
  }
  assert.ok(!JSON.stringify(projection).includes(input.address));
}

test('real callables revoke exact-address access and the trigger refreshes and deletes the projection', {
  timeout: 120_000,
}, async t => {
  await assertLocalEmulators();
  // The runner executes this file last in a disposable emulator session.
  const rules = await initializeTestEnvironment({
    projectId: PROJECT_ID,
    firestore: {
      host: HOST,
      port: PORTS.firestore,
      rules: readFileSync(path.join(__dirname, '../../firestore.production-candidate.rules'), 'utf8'),
    },
  });
  const eventId = randomUUID();
  const adminApp = initializeAdminApp({ projectId: PROJECT_ID }, `consent-${eventId}`);
  const db = getAdminFirestore(adminApp);
  const adminAuth = getAdminAuth(adminApp);
  const apps = [];
  const uids = [];
  const source = db.collection('yardSaleEvents').doc(eventId);
  const projection = db.collection('publicYardSaleEvents').doc(eventId);
  const privateRef = db.collection('eventPrivate').doc(eventId);
  const marker = db.collection('eventAddressConsent').doc(eventId);
  const location = db.collection('generalLocations').doc(`consent-${eventId}`);
  const grantId = randomUUID();
  const revokeId = randomUUID();
  const deleteId = randomUUID();
  t.after(async () => {
    const results = [];
    async function clean(tasks) {
      results.push(...await Promise.allSettled(tasks.map(task => Promise.resolve().then(task))));
    }
    await clean([() => source.delete()]);
    await clean([
      ...[projection, privateRef, marker, location,
        ...[grantId, revokeId, deleteId].map(id => marker.collection('history').doc(id)),
      ].map(ref => () => ref.delete()),
      ...uids.map(uid => () => adminAuth.deleteUser(uid)),
    ]);
    await clean([() => rules.cleanup(), ...apps.map(app => () => deleteApp(app)),
      () => deleteAdminApp(adminApp)]);
    const failures = results.filter(result => result.status === 'rejected');
    if (failures.length) {
      throw new AggregateError(failures.map(result => result.reason), 'Consent fixture cleanup failed');
    }
  });

  async function client(label, signedIn) {
    const app = initializeApp({ projectId: PROJECT_ID, apiKey: 'emulator-only' }, `${eventId}-${label}`);
    apps.push(app);
    const auth = getAuth(app);
    connectAuthEmulator(auth, `http://${HOST}:${PORTS.auth}`, { disableWarnings: true });
    if (signedIn) {
      const result = await createUserWithEmailAndPassword(
        auth, `${eventId}-${label}@example.test`, 'emulator-test-password',
      );
      uids.push(result.user.uid);
    }
    const firestore = getFirestore(app);
    connectFirestoreEmulator(firestore, HOST, PORTS.firestore);
    const functions = getFunctions(app, 'us-south1');
    connectFunctionsEmulator(functions, HOST, PORTS.functions);
    return {
      db: firestore,
      save: httpsCallable(functions, 'saveEventWithConsent', { timeout: 15_000 }),
      remove: httpsCallable(functions, 'deleteEventWithConsent', { timeout: 15_000 }),
    };
  }
  const organizer = await client('organizer', true);
  const outsider = await client('outsider', true);
  const anonymous = await client('anonymous', false);
  const readAddress = client => getDocFromServer(doc(client.db, 'eventPrivate', eventId));
  const publicDetail = doc(anonymous.db, 'publicYardSaleEvents', eventId);
  const permissionDenied = { code: 'permission-denied' };

  const exact = {
    eventId, operationId: grantId, expectedEventVersion: 0, expectedUpdatedAtMs: null,
    title: 'Synthetic consent sale', description: 'Emulator fixture only',
    location: 'Synthetic City', locationId: location.id, locationVisibility: 'exact',
    startDateMs: Date.UTC(2026, 10, 20, 9), endDateMs: Date.UTC(2026, 10, 20, 12),
    photoURL: null, itemCount: 0, address: '100 Synthetic Fixture Road',
    consentVersion: 'exact-address-v1', consentConfirmed: true,
  };
  const general = {
    ...exact, operationId: revokeId, expectedEventVersion: 1,
    title: 'Synthetic general sale', locationVisibility: 'general',
    consentVersion: null, consentConfirmed: false,
  };
  const deletion = {
    eventId, operationId: deleteId, expectedEventVersion: 2, expectedUpdatedAtMs: null,
  };
  await location.set({
    kind: 'city', displayName: exact.location, active: true,
    approvedAliases: [], countryCode: 'US', regionCode: 'TX',
  });

  assert.deepEqual((await organizer.save(exact)).data, { eventId, eventVersion: 1 });
  assertProjection(await waitForPublicProjection(anonymous.db, eventId, 'exact'), exact);
  assertProjection((await getDocFromServer(publicDetail)).data(), exact);
  const grant = (await marker.get()).data();
  const exactPrivate = (await privateRef.get()).data();
  assert.ok(grant.addressRevision);
  assert.equal(grant.addressRevision, exactPrivate.addressRevision);
  assert.equal((await readAddress(anonymous)).get('address'), exact.address);

  await assert.rejects(outsider.save(general), { code: 'functions/permission-denied' });
  await assert.rejects(outsider.remove(deletion), { code: 'functions/permission-denied' });
  await assert.rejects(anonymous.save(general), { code: 'functions/unauthenticated' });
  await assert.rejects(setDoc(doc(outsider.db, 'eventAddressConsent', eventId), {
    ...grant,
    grantedAt: new Timestamp(grant.grantedAt.seconds, grant.grantedAt.nanoseconds),
  }), permissionDenied);
  await assert.rejects(getDocFromServer(doc(outsider.db, 'eventAddressConsent', eventId)), permissionDenied);
  assert.equal((await readAddress(anonymous)).get('address'), exact.address);

  await privateRef.update({ addressRevision: randomUUID() });
  await assert.rejects(readAddress(anonymous), permissionDenied);
  await assert.rejects(readAddress(outsider), permissionDenied);
  assert.equal((await readAddress(organizer)).get('address'), exact.address);
  await privateRef.set(exactPrivate);
  assert.equal((await readAddress(anonymous)).get('address'), exact.address);

  assert.deepEqual((await organizer.save(general)).data, { eventId, eventVersion: 2 });
  assert.equal((await marker.get()).exists, false);
  await assert.rejects(readAddress(anonymous), permissionDenied);
  await assert.rejects(readAddress(outsider), permissionDenied);
  assert.equal((await readAddress(organizer)).get('address'), exact.address);
  assertProjection(await waitForPublicProjection(anonymous.db, eventId, 'general'), general);

  // Reintroduce a formerly valid grant and private revision to isolate the source visibility check.
  await db.batch().set(marker, grant).set(privateRef, exactPrivate).commit();
  await assert.rejects(readAddress(anonymous), permissionDenied);
  await assert.rejects(readAddress(outsider), permissionDenied);

  assert.deepEqual((await organizer.remove(deletion)).data, { eventId, deleted: true });
  await waitForPublicProjection(anonymous.db, eventId, null);
  await assert.rejects(getDocFromServer(publicDetail), permissionDenied);
  for (const ref of [source, projection, marker, privateRef]) {
    assert.equal((await ref.get()).exists, false, `Expected ${ref.parent.id} fixture to be deleted`);
  }
  for (const viewer of [anonymous, outsider, organizer]) {
    await assert.rejects(readAddress(viewer), permissionDenied);
  }
});
