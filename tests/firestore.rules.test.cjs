const fs = require('node:fs');
const { before, after, test } = require('node:test');
const assert = require('node:assert/strict');
const {
  initializeTestEnvironment,
  assertSucceeds,
  assertFails,
} = require('@firebase/rules-unit-testing');
const {
  collection,
  deleteField,
  doc,
  getDoc,
  getDocs,
  query,
  setDoc,
  Timestamp,
  updateDoc,
  where,
  writeBatch,
} = require('firebase/firestore');

let environment;
const startDate = Timestamp.fromDate(new Date('2026-11-10T15:00:00Z'));
const endDate = Timestamp.fromDate(new Date('2026-11-10T18:00:00Z'));
const createdAt = Timestamp.fromDate(new Date('2026-11-01T12:00:00Z'));

before(async () => {
  environment = await initializeTestEnvironment({
    projectId: 'yardsale-hub-event-privacy',
    firestore: { rules: fs.readFileSync('firestore.rules', 'utf8') },
  });
});

after(async () => {
  await environment.cleanup();
});

function database(uid) {
  return environment.authenticatedContext(uid, {
    email: `${uid}@example.test`,
  }).firestore();
}

function anonymousDatabase() {
  return environment.unauthenticatedContext().firestore();
}

function publicEvent(userId, overrides = {}) {
  return {
    userId,
    title: 'Neighborhood Sale',
    description: 'Saturday sale',
    location: 'Nederland',
    locationVisibility: 'general',
    startDate,
    endDate,
    photoURL: null,
    createdAt,
    updatedAt: createdAt,
    itemCount: 0,
    ...overrides,
  };
}

async function seed(path, data) {
  await environment.withSecurityRulesDisabled(async context => {
    await setDoc(doc(context.firestore(), path), data);
  });
}

test('general event creates and public browse reads exclude precise location fields', async () => {
  const alice = database('alice');
  const eventRef = doc(collection(alice, 'yardSaleEvents'));
  await assertSucceeds(setDoc(eventRef, publicEvent('alice')));
  const result = await getDoc(doc(anonymousDatabase(), 'yardSaleEvents', eventRef.id));
  assert.equal(result.data().locationVisibility, 'general');
  assert.equal('address' in result.data(), false);
  assert.equal('latitude' in result.data(), false);
  assert.equal('longitude' in result.data(), false);

  await assertSucceeds(getDocs(query(
    collection(anonymousDatabase(), 'yardSaleEvents'),
    where('startDate', '>=', Timestamp.now()),
  )));
});

test('general event can retain a private address in an atomic batch', async () => {
  const alice = database('alice');
  const eventRef = doc(collection(alice, 'yardSaleEvents'));
  const privateRef = doc(alice, 'eventPrivate', eventRef.id);
  const batch = writeBatch(alice);
  batch.set(eventRef, publicEvent('alice'));
  batch.set(privateRef, { userId: 'alice', address: '12 Main Street' });
  await assertSucceeds(batch.commit());

  assert.equal((await getDoc(doc(anonymousDatabase(), 'yardSaleEvents', eventRef.id)))
    .data().address, undefined);
  assert.equal((await getDoc(privateRef)).data().address, '12 Main Street');
  await assertFails(getDoc(doc(database('bob'), 'eventPrivate', eventRef.id)));
  await assertFails(getDoc(doc(anonymousDatabase(), 'eventPrivate', eventRef.id)));
  await assertFails(setDoc(
    doc(database('bob'), 'eventPrivate', eventRef.id),
    { userId: 'alice', address: 'Changed Address' },
  ));
  await assertFails(updateDoc(doc(database('bob'), 'eventPrivate', eventRef.id), {
    address: 'Changed Address',
  }));
});

test('exact event and private address must be written atomically and consistently', async () => {
  const alice = database('alice');
  const eventRef = doc(collection(alice, 'yardSaleEvents'));
  const privateRef = doc(alice, 'eventPrivate', eventRef.id);
  const batch = writeBatch(alice);
  batch.set(eventRef, publicEvent('alice', {
    locationVisibility: 'exact',
    address: '12 Main Street',
  }));
  batch.set(privateRef, { userId: 'alice', address: '12 Main Street' });
  await assertSucceeds(batch.commit());

  const publicSnapshot = await getDoc(doc(anonymousDatabase(), 'yardSaleEvents', eventRef.id));
  assert.equal(publicSnapshot.data().address, '12 Main Street');
  await assertFails(getDoc(doc(database('bob'), 'eventPrivate', eventRef.id)));

  const mismatchedRef = doc(collection(alice, 'yardSaleEvents'));
  const mismatchedPrivate = doc(alice, 'eventPrivate', mismatchedRef.id);
  const mismatchedBatch = writeBatch(alice);
  mismatchedBatch.set(mismatchedRef, publicEvent('alice', {
    locationVisibility: 'exact',
    address: '12 Main Street',
  }));
  mismatchedBatch.set(mismatchedPrivate, {
    userId: 'alice',
    address: '99 Other Street',
  });
  await assertFails(mismatchedBatch.commit());
});

test('exact visibility requires an address and a private record', async () => {
  const alice = database('alice');
  await assertFails(setDoc(
    doc(collection(alice, 'yardSaleEvents')),
    publicEvent('alice', {
      locationVisibility: 'exact',
      address: '12 Main Street',
    }),
  ));
  await assertFails(setDoc(
    doc(collection(alice, 'yardSaleEvents')),
    publicEvent('alice', { locationVisibility: 'exact' }),
  ));
});

test('only the event owner may create or update an event', async () => {
  const alice = database('alice');
  const eventRef = doc(alice, 'yardSaleEvents', 'owned');
  await assertSucceeds(setDoc(eventRef, publicEvent('alice')));
  await assertFails(setDoc(
    doc(database('bob'), 'yardSaleEvents', 'forged'),
    publicEvent('alice'),
  ));
  await assertFails(updateDoc(doc(database('bob'), 'yardSaleEvents', 'owned'), {
    title: 'Changed by Bob',
    updatedAt: Timestamp.now(),
  }));
  await assertFails(updateDoc(eventRef, {
    userId: 'bob',
    updatedAt: Timestamp.now(),
  }));
  await assertSucceeds(updateDoc(eventRef, {
    title: 'Updated by Alice',
    updatedAt: Timestamp.now(),
  }));
});

test('changing exact visibility to general removes published address atomically', async () => {
  const alice = database('alice');
  const eventRef = doc(alice, 'yardSaleEvents', 'visibility-change');
  const privateRef = doc(alice, 'eventPrivate', 'visibility-change');
  await seed('yardSaleEvents/visibility-change', publicEvent('alice', {
    locationVisibility: 'exact',
    address: '12 Main Street',
    latitude: 29.99,
    longitude: -94.01,
  }));
  await seed('eventPrivate/visibility-change', {
    userId: 'alice',
    address: '12 Main Street',
  });

  const change = writeBatch(alice);
  change.update(eventRef, {
    locationVisibility: 'general',
    updatedAt: Timestamp.now(),
    address: deleteField(),
    latitude: deleteField(),
    longitude: deleteField(),
  });
  await assertSucceeds(change.commit());

  const publicData = (await getDoc(doc(anonymousDatabase(), 'yardSaleEvents', eventRef.id))).data();
  assert.equal(publicData.locationVisibility, 'general');
  assert.equal('address' in publicData, false);
  assert.equal('latitude' in publicData, false);
  assert.equal('longitude' in publicData, false);
  assert.equal((await getDoc(privateRef)).data().address, '12 Main Street');
});

test('general events reject public addresses and precise coordinates', async () => {
  const alice = database('alice');
  await assertFails(setDoc(
    doc(collection(alice, 'yardSaleEvents')),
    publicEvent('alice', { address: '12 Main Street' }),
  ));
  await assertFails(setDoc(
    doc(collection(alice, 'yardSaleEvents')),
    publicEvent('alice', { latitude: 0, longitude: 0 }),
  ));
});

test('invalid event time ranges are rejected by rules', async () => {
  const alice = database('alice');
  await assertFails(setDoc(
    doc(collection(alice, 'yardSaleEvents')),
    publicEvent('alice', { endDate: startDate }),
  ));
});

test('legacy private fields remain visible in public queries until migration', async () => {
  await seed('yardSaleEvents/legacy', {
    ...publicEvent('alice', {
      locationVisibility: 'exact',
      latitude: 29.99,
      longitude: -94.01,
    }),
    address: '12 Main Street',
  });
  await assertFails(getDoc(doc(anonymousDatabase(), 'yardSaleEvents', 'legacy')));
  await assertSucceeds(getDoc(doc(database('alice'), 'yardSaleEvents', 'legacy')));

  const publicQuery = await getDocs(collection(anonymousDatabase(), 'yardSaleEvents'));
  const legacyDocument = publicQuery.docs.find(snapshot => snapshot.id === 'legacy');
  assert.ok(legacyDocument);
  assert.equal(legacyDocument.data().address, '12 Main Street');
  assert.equal(legacyDocument.data().latitude, 29.99);
  assert.equal(legacyDocument.data().longitude, -94.01);
});
