const fs = require('node:fs');
const { before, beforeEach, after, test } = require('node:test');
const assert = require('node:assert/strict');
const {
  initializeTestEnvironment,
  assertSucceeds,
  assertFails,
} = require('@firebase/rules-unit-testing');
const {
  collection,
  deleteDoc,
  deleteField,
  doc,
  getDoc,
  getDocs,
  query,
  orderBy,
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
    projectId: 'demo-yardsale-hub',
    firestore: { rules: fs.readFileSync('firestore.rules', 'utf8') },
  });
});

after(async () => {
  if (environment) await environment.cleanup();
});

beforeEach(async () => {
  await environment.clearFirestore();
});

// Matches the Firestore document written by auth/signup/page.tsx.
function signupDocument(uid) {
  return {
    id: uid,
    email: `${uid}@example.test`,
    displayName: 'Test Seller',
    photoURL: null,
    location: 'Nederland',
    bio: '',
    createdAt,
    updatedAt: createdAt,
  };
}

// Matches ItemForm's create payload, including null originalPrice.
function itemDocument(uid, overrides = {}) {
  return {
    title: 'Used chair',
    description: 'Good condition',
    category: 'home-garden',
    subcategory: 'home-garden/indoor-furniture',
    price: 25,
    originalPrice: null,
    condition: 'good',
    location: 'Nederland',
    photoURLs: [],
    updatedAt: createdAt,
    userId: uid,
    createdAt,
    views: 0,
    isSold: false,
    ...overrides,
  };
}

// Matches messages/page.tsx's send payload.
function messageDocument() {
  return {
    senderId: 'alice',
    recipientId: 'bob',
    text: 'Is this available?',
    createdAt,
    read: false,
  };
}

test('signup creates the exact application user document for its authenticated owner', async () => {
  const ref = doc(database('alice'), 'users', 'alice');
  await assertSucceeds(setDoc(ref, signupDocument('alice')));
  assert.deepEqual((await getDoc(ref)).data(), signupDocument('alice'));
  await assertFails(setDoc(doc(database('bob'), 'users', 'alice'), signupDocument('alice')));
  await assertFails(setDoc(doc(anonymousDatabase(), 'users', 'guest'), signupDocument('guest')));
});

test('users read and update their own profiles but cannot change identity fields', async () => {
  const ref = doc(database('alice'), 'users', 'alice');
  await setDoc(ref, signupDocument('alice'));
  await assertSucceeds(updateDoc(ref, {
    displayName: 'Updated Seller', photoURL: 'https://example.test/avatar.jpg',
    location: 'Groves', bio: 'Local seller', updatedAt: Timestamp.now(),
  }));
  assert.equal((await getDoc(ref)).data().displayName, 'Updated Seller');
  for (const patch of [{ id: 'bob' }, { email: 'changed@example.test' }, { createdAt: Timestamp.now() }]) {
    await assertFails(updateDoc(ref, patch));
  }
});

test('private profiles reject anonymous and other-user reads, queries, updates and deletion', async () => {
  await seed('users/alice', signupDocument('alice'));
  for (const db of [anonymousDatabase(), database('bob')]) {
    const ref = doc(db, 'users', 'alice');
    await assertFails(getDoc(ref));
    await assertFails(getDocs(collection(db, 'users')));
    await assertFails(updateDoc(ref, { bio: 'Tampered' }));
    await assertFails(deleteDoc(ref));
  }
});

test('ItemForm create payload supports public document and collection browsing', async () => {
  const ref = doc(database('alice'), 'items', 'chair');
  await assertSucceeds(setDoc(ref, itemDocument('alice')));
  assert.equal((await getDoc(doc(anonymousDatabase(), 'items', 'chair'))).data().originalPrice, null);
  const result = await assertSucceeds(getDocs(query(
    collection(anonymousDatabase(), 'items'), where('isSold', '==', false),
  )));
  assert.equal(result.size, 1);
});

test('item edits remove optional taxonomy without losing ownership or sale association', async () => {
  const ref = doc(database('alice'), 'items', 'chair');
  await setDoc(ref, itemDocument('alice', { itemType: 'legacy-type', yardSaleId: 'sale' }));
  await assertSucceeds(updateDoc(ref, {
    title: 'Updated chair', description: 'Updated description',
    category: 'Other', subcategory: deleteField(), itemType: deleteField(),
    price: 20, originalPrice: null, condition: 'fair', location: 'Groves',
    photoURLs: [], updatedAt: Timestamp.now(),
  }));
  const data = (await getDoc(ref)).data();
  assert.equal('subcategory' in data, false);
  assert.equal('itemType' in data, false);
  assert.equal(data.userId, 'alice');
  assert.equal(data.yardSaleId, 'sale');
  await assertSucceeds(deleteDoc(ref));
});

test('item rules reject forged creation, unauthorized edits/deletion and ownership changes', async () => {
  await seed('items/chair', itemDocument('alice'));
  await assertFails(setDoc(doc(database('bob'), 'items', 'forged'), itemDocument('alice')));
  await assertFails(setDoc(doc(anonymousDatabase(), 'items', 'guest'), itemDocument('guest')));
  for (const db of [anonymousDatabase(), database('bob')]) {
    await assertFails(updateDoc(doc(db, 'items', 'chair'), { price: 0 }));
    await assertFails(deleteDoc(doc(db, 'items', 'chair')));
  }
  await assertFails(updateDoc(doc(database('alice'), 'items', 'chair'), { userId: 'bob' }));
});

test('sender creates an application message and both participants can read and query it', async () => {
  const ref = doc(database('alice'), 'messages', 'hello');
  await assertSucceeds(setDoc(ref, messageDocument()));
  for (const [uid, field] of [['alice', 'senderId'], ['bob', 'recipientId']]) {
    const db = database(uid);
    await assertSucceeds(getDoc(doc(db, 'messages', 'hello')));
    const result = await assertSucceeds(getDocs(query(
      collection(db, 'messages'), where(field, '==', uid),
    )));
    assert.equal(result.size, 1);
  }
  await assertSucceeds(getDocs(query(
    collection(database('alice'), 'messages'),
    where('senderId', '==', 'alice'), where('recipientId', '==', 'bob'),
    orderBy('createdAt', 'asc'),
  )));
});

test('messages reject forged senders, unrelated reads/queries and content modification', async () => {
  await seed('messages/hello', messageDocument());
  await assertFails(setDoc(doc(database('bob'), 'messages', 'forged'), messageDocument()));
  await assertFails(setDoc(doc(anonymousDatabase(), 'messages', 'guest'), messageDocument()));
  for (const db of [anonymousDatabase(), database('charlie')]) {
    await assertFails(getDoc(doc(db, 'messages', 'hello')));
    await assertFails(getDocs(collection(db, 'messages')));
    await assertFails(updateDoc(doc(db, 'messages', 'hello'), { read: true }));
  }
  for (const uid of ['alice', 'bob', 'charlie']) {
    const ref = doc(database(uid), 'messages', 'hello');
    await assertFails(updateDoc(ref, { text: 'Changed' }));
    await assertFails(updateDoc(ref, { senderId: uid }));
    await assertFails(updateDoc(ref, { recipientId: 'charlie' }));
    await assertFails(deleteDoc(ref));
  }
  await assertFails(updateDoc(doc(database('alice'), 'messages', 'hello'), { read: true }));
  const recipientRef = doc(database('bob'), 'messages', 'hello');
  await assertSucceeds(updateDoc(recipientRef, { read: true }));
  await assertFails(updateDoc(recipientRef, { read: false }));
});

test('legacy user and item fields can block otherwise legitimate owner updates', async () => {
  const { bio, ...incompleteUser } = signupDocument('alice');
  assert.equal(bio, '');
  await seed('users/alice', incompleteUser);
  await assertFails(updateDoc(doc(database('alice'), 'users', 'alice'), { displayName: 'Updated' }));
  await assertSucceeds(updateDoc(doc(database('alice'), 'users', 'alice'), { bio: '' }));

  const { views, ...incompleteItem } = itemDocument('alice');
  assert.equal(views, 0);
  await seed('items/missing-views', incompleteItem);
  await assertFails(updateDoc(doc(database('alice'), 'items', 'missing-views'), { title: 'Updated' }));
  await seed('items/extra-field', itemDocument('alice', { legacyMetadata: true }));
  await assertFails(updateDoc(doc(database('alice'), 'items', 'extra-field'), { title: 'Updated' }));
  await seed('items/legacy-category', itemDocument('alice', { category: 'Historical category' }));
  await assertSucceeds(updateDoc(doc(database('alice'), 'items', 'legacy-category'), { title: 'Updated' }));
});

test('legacy messages remain participant-readable but missing read state blocks acknowledgement', async () => {
  const { read, ...legacyMessage } = messageDocument();
  assert.equal(read, false);
  await seed('messages/legacy-message', { ...legacyMessage, legacyMetadata: true });
  const ref = doc(database('bob'), 'messages', 'legacy-message');
  await assertSucceeds(getDoc(ref));
  await assertFails(updateDoc(ref, { read: true }));
  await seed('messages/legacy-with-read', { ...messageDocument(), legacyMetadata: true });
  await assertSucceeds(updateDoc(doc(database('bob'), 'messages', 'legacy-with-read'), { read: true }));
});

test('exact private records cannot be deleted independently or by another user', async () => {
  const db = database('alice');
  const eventRef = doc(db, 'yardSaleEvents', 'exact-delete');
  const privateRef = doc(db, 'eventPrivate', 'exact-delete');
  const batch = writeBatch(db);
  batch.set(eventRef, publicEvent('alice', { locationVisibility: 'exact', address: '12 Main Street' }));
  batch.set(privateRef, { userId: 'alice', address: '12 Main Street' });
  await assertSucceeds(batch.commit());
  await assertFails(deleteDoc(privateRef));
  await assertFails(deleteDoc(doc(database('bob'), 'eventPrivate', 'exact-delete')));
  await assertFails(deleteDoc(doc(anonymousDatabase(), 'eventPrivate', 'exact-delete')));
  await assertFails(updateDoc(privateRef, { address: '99 Other Street' }));
  await assertFails(updateDoc(eventRef, { locationVisibility: 'general' }));
  assert.equal((await getDoc(privateRef)).exists(), true);

  const change = writeBatch(db);
  change.update(eventRef, {
    locationVisibility: 'general', address: deleteField(),
    latitude: deleteField(), longitude: deleteField(), updatedAt: Timestamp.now(),
  });
  change.delete(privateRef);
  await assertSucceeds(change.commit());
  assert.equal((await getDoc(privateRef)).exists(), false);
  assert.equal((await getDoc(eventRef)).data().locationVisibility, 'general');
});

test('private records can be deleted with their public event in one batch', async () => {
  const db = database('alice');
  const eventRef = doc(db, 'yardSaleEvents', 'delete-both');
  const privateRef = doc(db, 'eventPrivate', 'delete-both');
  const create = writeBatch(db);
  create.set(eventRef, publicEvent('alice', { locationVisibility: 'exact', address: '12 Main Street' }));
  create.set(privateRef, { userId: 'alice', address: '12 Main Street' });
  await assertSucceeds(create.commit());
  await assertFails(deleteDoc(eventRef));
  assert.equal((await getDoc(eventRef)).exists(), true);
  assert.equal((await getDoc(privateRef)).exists(), true);
  const remove = writeBatch(db);
  remove.delete(eventRef);
  remove.delete(privateRef);
  await assertSucceeds(remove.commit());
  await environment.withSecurityRulesDisabled(async context => {
    assert.equal((await getDoc(doc(context.firestore(), 'yardSaleEvents', 'delete-both'))).exists(), false);
    assert.equal((await getDoc(doc(context.firestore(), 'eventPrivate', 'delete-both'))).exists(), false);
  });
});

test('owner can delete an event without a private record', async () => {
  const db = database('alice');
  const eventRef = doc(db, 'yardSaleEvents', 'delete-without-private');
  await assertSucceeds(setDoc(eventRef, publicEvent('alice')));
  await assertFails(deleteDoc(doc(database('bob'), 'yardSaleEvents', 'delete-without-private')));
  await assertSucceeds(deleteDoc(eventRef));
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
