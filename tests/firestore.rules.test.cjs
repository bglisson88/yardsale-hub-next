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
  await environment.withSecurityRulesDisabled(async context => {
    const db = context.firestore();
    for (const [id, kind, displayName, aliases] of [
      ['nederland', 'city', 'Nederland', ['Nederland, TX']],
      ['texas', 'state', 'Texas', []],
      ['zip', 'postalCode', '77705', []],
      ['west-beaumont', 'area', 'West Beaumont', []],
    ]) {
      await setDoc(doc(db, 'generalLocations', id), {
        kind, displayName, active: true, approvedAliases: aliases,
        countryCode: 'US', regionCode: 'TX',
      });
    }
    await setDoc(doc(db, 'generalLocationAliases', 'current'), {
      schemaVersion: 1,
      aliases: {
        Nederland: 'nederland',
        'Nederland, TX': 'nederland',
        Texas: 'texas',
        '77705': 'zip',
        'West Beaumont': 'west-beaumont',
      },
    });
  });
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

test('item owners can mark sold and available while making permitted edits', async () => {
  await seed('items/chair', itemDocument('alice'));
  const ref = doc(database('alice'), 'items', 'chair');
  await assertSucceeds(updateDoc(ref, { isSold: true, title: 'Sold chair' }));
  let data = (await assertSucceeds(getDoc(ref))).data();
  assert.equal(data.isSold, true);
  assert.equal(data.title, 'Sold chair');
  await assertSucceeds(updateDoc(ref, { isSold: false, price: 20 }));
  data = (await assertSucceeds(getDoc(ref))).data();
  assert.equal(data.isSold, false);
  assert.equal(data.price, 20);
});

test('item sold updates reject invalid values, non-owners and protected field changes', async () => {
  await seed('items/chair', itemDocument('alice', { yardSaleId: 'sale' }));
  const ref = doc(database('alice'), 'items', 'chair');
  for (const isSold of ['true', 1, null, deleteField()]) {
    await assertFails(updateDoc(ref, { isSold }));
  }
  for (const db of [anonymousDatabase(), database('bob')]) {
    await assertFails(updateDoc(doc(db, 'items', 'chair'), { isSold: true }));
  }
  for (const patch of [
    { views: 1 }, { userId: 'bob' }, { createdAt: Timestamp.now() }, { yardSaleId: 'other' },
  ]) {
    await assertFails(updateDoc(ref, { isSold: true, ...patch }));
  }
  assert.equal((await getDoc(ref)).data().isSold, false);
});

test('favorites support owner creates, reads, scoped queries and deletes for all three types', async () => {
  const alice = database('alice');
  const refs = [];
  for (const type of ['item', 'seller', 'event']) {
    const ref = doc(alice, 'favorites', `alice_${type}_target`);
    const favorite = { userId: 'alice', type, targetId: 'target', createdAt };
    await assertSucceeds(setDoc(ref, favorite));
    assert.deepEqual((await assertSucceeds(getDoc(ref))).data(), favorite);
    refs.push(ref);
  }
  await seed('favorites/bob_item_other', { userId: 'bob', type: 'item', targetId: 'other' });
  const result = await assertSucceeds(getDocs(query(
    collection(alice, 'favorites'), where('userId', '==', 'alice'),
  )));
  assert.equal(result.size, 3);
  assert.ok(result.docs.every(snapshot => snapshot.data().userId === 'alice'));
  for (const ref of refs) await assertSucceeds(deleteDoc(ref));
});

test('favorites deny forged creates, invalid types, IDs and all updates', async () => {
  const alice = database('alice');
  const favorite = { userId: 'alice', type: 'item', targetId: 'chair' };
  await assertFails(setDoc(doc(anonymousDatabase(), 'favorites', 'alice_item_chair'), favorite));
  await assertFails(setDoc(doc(database('bob'), 'favorites', 'alice_item_chair'), favorite));
  await assertFails(setDoc(doc(alice, 'favorites', 'alice_other_chair'), { ...favorite, type: 'other' }));
  await assertFails(setDoc(doc(alice, 'favorites', 'alice_item_wrong'), favorite));
  await assertFails(setDoc(doc(alice, 'favorites', 'alice_item_chair'), { userId: 'alice', type: 'item' }));
  await seed('favorites/alice_item_chair', favorite);
  await assertFails(updateDoc(doc(alice, 'favorites', 'alice_item_chair'), { targetId: 'other' }));
  await assertFails(setDoc(doc(alice, 'favorites', 'alice_item_chair'), favorite));
  await assertFails(updateDoc(doc(database('bob'), 'favorites', 'alice_item_chair'), { userId: 'bob' }));
});

test('favorites reject other users and anonymous reads, queries and deletes', async () => {
  await seed('favorites/alice_event_sale', { userId: 'alice', type: 'event', targetId: 'sale' });
  for (const db of [anonymousDatabase(), database('bob')]) {
    await assertFails(getDoc(doc(db, 'favorites', 'alice_event_sale')));
    await assertFails(getDocs(collection(db, 'favorites')));
    await assertFails(getDocs(query(collection(db, 'favorites'), where('userId', '==', 'alice'))));
    await assertFails(deleteDoc(doc(db, 'favorites', 'alice_event_sale')));
  }
  await assertFails(getDocs(collection(database('alice'), 'favorites')));
});

test('authenticated users can create and read reviews and query by seller', async () => {
  const alice = database('alice');
  const review = { reviewerId: 'alice', sellerId: 'seller', rating: 1, comment: 'x'.repeat(500) };
  await assertSucceeds(setDoc(doc(alice, 'reviews', 'seller_alice'), review));
  await assertSucceeds(setDoc(doc(database('bob'), 'reviews', 'seller_bob'), {
    reviewerId: 'bob', sellerId: 'seller', rating: 5, comment: '',
  }));
  for (const uid of ['alice', 'seller', 'charlie']) {
    const db = database(uid);
    assert.deepEqual((await assertSucceeds(getDoc(doc(db, 'reviews', 'seller_alice')))).data(), review);
    assert.equal((await assertSucceeds(getDocs(collection(db, 'reviews')))).size, 2);
    assert.equal((await assertSucceeds(getDocs(query(
      collection(db, 'reviews'), where('sellerId', '==', 'seller'),
    )))).size, 2);
  }
  await assertFails(getDoc(doc(anonymousDatabase(), 'reviews', 'seller_alice')));
  await assertFails(getDocs(collection(anonymousDatabase(), 'reviews')));
  await assertFails(getDocs(query(
    collection(anonymousDatabase(), 'reviews'), where('sellerId', '==', 'seller'),
  )));
});

test('review creation rejects forged identities, self reviews, invalid content and document IDs', async () => {
  const review = { reviewerId: 'alice', sellerId: 'seller', rating: 3, comment: 'Good' };
  const alice = database('alice');
  await assertFails(setDoc(doc(anonymousDatabase(), 'reviews', 'seller_alice'), review));
  await assertFails(setDoc(doc(database('bob'), 'reviews', 'seller_alice'), review));
  await assertFails(setDoc(doc(alice, 'reviews', 'alice_alice'), { ...review, sellerId: 'alice' }));
  for (const rating of [0, 6]) {
    await assertFails(setDoc(doc(alice, 'reviews', 'seller_alice'), { ...review, rating }));
  }
  await assertFails(setDoc(doc(alice, 'reviews', 'seller_alice'), { ...review, comment: 'x'.repeat(501) }));
  await assertFails(setDoc(doc(alice, 'reviews', 'alice_seller'), review));
  await assertFails(setDoc(doc(alice, 'reviews', 'seller_alice'), { reviewerId: 'alice', sellerId: 'seller' }));
});

test('reviewers can edit and delete reviews but cannot change either identity', async () => {
  const review = { reviewerId: 'alice', sellerId: 'seller', rating: 3, comment: 'Good' };
  await seed('reviews/seller_alice', review);
  const ref = doc(database('alice'), 'reviews', 'seller_alice');
  await assertSucceeds(updateDoc(ref, { rating: 4, comment: 'Updated' }));
  await assertFails(updateDoc(ref, { reviewerId: 'bob' }));
  await assertFails(updateDoc(ref, { sellerId: 'bob' }));
  await assertFails(updateDoc(ref, { reviewerId: deleteField() }));
  await assertFails(updateDoc(ref, { sellerId: deleteField() }));
  await assertFails(setDoc(ref, { ...review, sellerId: 'bob' }));
  for (const db of [anonymousDatabase(), database('bob'), database('seller')]) {
    await assertFails(updateDoc(doc(db, 'reviews', 'seller_alice'), { rating: 5 }));
    await assertFails(deleteDoc(doc(db, 'reviews', 'seller_alice')));
  }
  // Production does not revalidate rating or comment on update.
  await assertSucceeds(updateDoc(ref, { rating: 6, comment: 'x'.repeat(501) }));
  await assertSucceeds(deleteDoc(ref));
});

test('legacy reviews without sellerId can be edited without changing identity fields', async () => {
  await seed('reviews/legacy', { reviewerId: 'alice', comment: 'Old' });
  const ref = doc(database('alice'), 'reviews', 'legacy');
  await assertSucceeds(updateDoc(ref, { comment: 'Updated' }));
  await assertFails(updateDoc(ref, { sellerId: 'seller' }));
  await assertSucceeds(deleteDoc(ref));
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

test('exact addresses require active server consent and cannot be changed directly', async () => {
  await seed('yardSaleEvents/exact-delete', publicEvent('alice', {
    locationVisibility: 'exact',
    eventVersion: 1,
  }));
  await seed('eventPrivate/exact-delete', {
    userId: 'alice',
    address: '12 Main Street',
    addressRevision: 'revision-1',
  });
  await seed('eventAddressConsent/exact-delete', {
    organizerUid: 'alice',
    consentVersion: 'exact-address-v1',
    addressRevision: 'revision-1',
    grantedAt: createdAt,
    operationId: 'server-operation-1',
  });

  const privateRef = doc(database('alice'), 'eventPrivate', 'exact-delete');
  assert.equal((await assertSucceeds(getDoc(privateRef))).data().address, '12 Main Street');
  assert.equal(
    (await assertSucceeds(getDoc(doc(anonymousDatabase(), 'eventPrivate', 'exact-delete'))))
      .data().address,
    '12 Main Street',
  );
  await assertFails(updateDoc(privateRef, { address: '99 Other Street' }));
  await assertFails(deleteDoc(privateRef));
  await assertFails(updateDoc(doc(database('alice'), 'yardSaleEvents', 'exact-delete'), {
    locationVisibility: 'general',
    updatedAt: Timestamp.now(),
  }));
  await assertFails(deleteDoc(doc(database('alice'), 'yardSaleEvents', 'exact-delete')));

  for (const context of [database('alice'), anonymousDatabase()]) {
    await assertFails(getDoc(doc(context, 'eventAddressConsent', 'exact-delete')));
    await assertFails(getDocs(collection(context, 'eventAddressConsent')));
    await assertFails(setDoc(doc(context, 'eventAddressConsent', 'forged'), {
      organizerUid: 'alice',
    }));
    await assertFails(getDoc(doc(
      context,
      'eventAddressConsent',
      'exact-delete',
      'history',
      'server-operation-1',
    )));
  }
});

test('private records can be deleted with their public event in one batch', async () => {
  const db = database('alice');
  const eventRef = doc(db, 'yardSaleEvents', 'delete-both');
  const privateRef = doc(db, 'eventPrivate', 'delete-both');
  const create = writeBatch(db);
  create.set(eventRef, publicEvent('alice'));
  create.set(privateRef, { userId: 'alice', address: '12 Main Street' });
  await assertSucceeds(create.commit());
  const remove = writeBatch(db);
  remove.delete(eventRef);
  remove.delete(privateRef);
  await assertSucceeds(remove.commit());
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

test('general event creation keeps public reads and browsing available', async () => {
  const alice = database('alice');
  const eventRef = doc(collection(alice, 'yardSaleEvents'));
  await assertSucceeds(setDoc(eventRef, publicEvent('alice')));
  const result = await getDoc(doc(anonymousDatabase(), 'yardSaleEvents', eventRef.id));
  assert.equal(result.data().locationVisibility, 'general');
  assert.equal('address' in result.data(), false);
  assert.equal('latitude' in result.data(), false);
  assert.equal('longitude' in result.data(), false);

  const publicEvents = await assertSucceeds(getDocs(query(
    collection(anonymousDatabase(), 'yardSaleEvents'),
    where('startDate', '>=', Timestamp.fromMillis(0)),
  )));
  assert.equal(publicEvents.size, 1);
  const ownerEvents = await assertSucceeds(getDocs(query(
    collection(alice, 'yardSaleEvents'),
    where('userId', '==', 'alice'),
  )));
  assert.deepEqual(ownerEvents.docs.map(event => event.id), [eventRef.id]);
});

test('deployed legacy general-event create keeps an optional address private', async () => {
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

test('deployed legacy general-event edit payload remains valid without eventVersion', async () => {
  const alice = database('alice');
  const eventRef = doc(alice, 'yardSaleEvents', 'legacy-general');
  const privateRef = doc(alice, 'eventPrivate', 'legacy-general');
  await assertSucceeds(setDoc(eventRef, publicEvent('alice')));
  const batch = writeBatch(alice);
  batch.update(eventRef, {
    ...publicEvent('alice', {
      title: 'Updated legacy sale',
      updatedAt: Timestamp.now(),
    }),
    address: deleteField(),
    latitude: deleteField(),
    longitude: deleteField(),
  });
  batch.set(privateRef, { userId: 'alice', address: '12 Main Street' });
  await assertSucceeds(batch.commit());

  const publicEventSnapshot = await assertSucceeds(
    getDoc(doc(anonymousDatabase(), 'yardSaleEvents', 'legacy-general')),
  );
  assert.equal(publicEventSnapshot.data().title, 'Updated legacy sale');
  for (const field of ['address', 'latitude', 'longitude', 'eventVersion']) {
    assert.equal(Object.hasOwn(publicEventSnapshot.data(), field), false);
  }
  assert.equal((await assertSucceeds(getDoc(privateRef))).data().address, '12 Main Street');
  await assertFails(getDoc(doc(anonymousDatabase(), 'eventPrivate', 'legacy-general')));

  const changeLocation = writeBatch(alice);
  changeLocation.update(eventRef, { location: 'Texas', updatedAt: Timestamp.now() });
  changeLocation.set(privateRef, { userId: 'alice', address: '99 Other Street' });
  await assertSucceeds(changeLocation.commit());
  assert.equal((await getDoc(eventRef)).data().location, 'Texas');
  assert.equal((await getDoc(privateRef)).data().address, '99 Other Street');
});

test('legacy edits of canonical events preserve the matching ID or fail atomically', async () => {
  const alice = database('alice');
  const eventRef = doc(alice, 'yardSaleEvents', 'canonical-legacy-edit');
  const privateRef = doc(alice, 'eventPrivate', 'canonical-legacy-edit');
  await assertSucceeds(setDoc(eventRef, publicEvent('alice', { locationId: 'nederland' })));

  const unchanged = writeBatch(alice);
  unchanged.update(eventRef, {
    ...publicEvent('alice', { title: 'Edited by old client', updatedAt: Timestamp.now() }),
    address: deleteField(), latitude: deleteField(), longitude: deleteField(),
  });
  unchanged.set(privateRef, { userId: 'alice', address: '12 Main Street' });
  await assertSucceeds(unchanged.commit());

  const changed = writeBatch(alice);
  changed.update(eventRef, { location: 'Texas', updatedAt: Timestamp.now() });
  changed.set(privateRef, { userId: 'alice', address: '99 Other Street' });
  await assertFails(changed.commit());
  assert.equal((await getDoc(eventRef)).data().location, 'Nederland');
  assert.equal((await getDoc(eventRef)).data().locationId, 'nederland');
  assert.equal((await getDoc(privateRef)).data().address, '12 Main Street');
  await assertFails(getDoc(doc(anonymousDatabase(), 'eventPrivate', 'canonical-legacy-edit')));

  const canonical = writeBatch(alice);
  canonical.update(eventRef, { locationId: 'texas', location: 'Texas', updatedAt: Timestamp.now() });
  canonical.set(privateRef, { userId: 'alice', address: '99 Other Street' });
  await assertSucceeds(canonical.commit());
  assert.equal((await getDoc(eventRef)).data().locationId, 'texas');
  assert.equal((await getDoc(privateRef)).data().address, '99 Other Street');
});

test('public event schema preserves city, ZIP-code, and broad-area locations', async () => {
  const alice = database('alice');
  for (const [id, location] of [
    ['city', 'Nederland'],
    ['state', 'Texas'],
    ['zip', '77705'],
    ['area', 'West Beaumont'],
  ]) {
    await assertSucceeds(setDoc(
      doc(alice, 'yardSaleEvents', `general-${id}`),
      publicEvent('alice', { location }),
    ));
  }
  const publicEvents = await assertSucceeds(
    getDocs(collection(anonymousDatabase(), 'yardSaleEvents')),
  );
  assert.deepEqual(
    publicEvents.docs.map(event => event.data().location).sort(),
    ['77705', 'Nederland', 'Texas', 'West Beaumont'].sort(),
  );
});

test('canonical event locations require an active matching trusted catalog record on create and update', async () => {
  const alice = database('alice');
  for (const [id, location] of [
    ['nederland', 'Nederland'],
    ['texas', 'Texas'],
    ['zip', '77705'],
    ['west-beaumont', 'West Beaumont'],
  ]) {
    await assertSucceeds(setDoc(
      doc(alice, 'yardSaleEvents', `canonical-${id}`),
      publicEvent('alice', { locationId: id, location }),
    ));
  }
  await seed('generalLocations/inactive', {
    kind: 'city', displayName: 'Inactive', active: false, approvedAliases: [],
    countryCode: 'US', regionCode: 'TX',
  });
  await seed('generalLocations/malformed', {
    kind: 'street', displayName: '12 Main Street', active: true, approvedAliases: [],
    countryCode: 'US', regionCode: 'TX',
  });
  const ref = doc(alice, 'yardSaleEvents', 'canonical-update');
  await assertSucceeds(setDoc(ref, publicEvent('alice', { locationId: 'nederland' })));
  const invalid = [
    { locationId: 'nederland', location: '12 Main Street' },
    { locationId: 'missing', location: 'Nederland' },
    { locationId: '../users', location: 'Nederland' },
    { locationId: null, location: 'Nederland' },
    { locationId: 'inactive', location: 'Inactive' },
    { locationId: 'malformed', location: '12 Main Street' },
    { locationId: 'nederland', location: 'Nederland, TX' },
  ];
  for (const [index, fields] of invalid.entries()) {
    await assertFails(setDoc(
      doc(alice, 'yardSaleEvents', `canonical-invalid-${index}`),
      publicEvent('alice', fields),
    ));
    await assertFails(updateDoc(ref, fields));
  }
  await assertSucceeds(updateDoc(ref, { locationId: 'zip', location: '77705' }));
});

test('legacy alias writes require the index and independently approved active catalog display', async () => {
  const alice = database('alice');
  const ref = doc(alice, 'yardSaleEvents', 'legacy-alias');
  await assertSucceeds(setDoc(ref, publicEvent('alice', { location: 'Nederland, TX' })));
  await assertFails(updateDoc(ref, { location: '12 Main Street' }));
  await seed('generalLocationAliases/current', {
    schemaVersion: 1,
    aliases: { '12 Main Street': 'nederland', 'Nederland, TX': 'nederland' },
  });
  await assertFails(setDoc(
    doc(alice, 'yardSaleEvents', 'injected-alias'),
    publicEvent('alice', { location: '12 Main Street' }),
  ));
  await assertFails(updateDoc(ref, { location: '12 Main Street' }));
  await seed('generalLocations/nederland', {
    kind: 'city', displayName: 'Nederland', active: false,
    approvedAliases: ['Nederland, TX'], countryCode: 'US', regionCode: 'TX',
  });
  await assertFails(updateDoc(ref, { title: 'Inactive location' }));
  await seed('generalLocations/nederland', {
    kind: 'city', displayName: 'Nederland', active: true,
    approvedAliases: ['Nederland, TX'], countryCode: 'US', regionCode: 'TX',
  });
  await environment.withSecurityRulesDisabled(async context => {
    await deleteDoc(doc(context.firestore(), 'generalLocationAliases', 'current'));
  });
  await assertFails(updateDoc(ref, { title: 'Retired alias' }));
  await assertFails(setDoc(doc(alice, 'yardSaleEvents', 'retired'), publicEvent('alice')));
  await assertSucceeds(setDoc(
    doc(alice, 'yardSaleEvents', 'after-retirement'),
    publicEvent('alice', { locationId: 'nederland' }),
  ));
});

test('missing or malformed alias indexes and catalog records deny legacy create and update', async () => {
  const alice = database('alice');
  const eventRef = doc(alice, 'yardSaleEvents', 'alias-index-update');
  await assertSucceeds(setDoc(eventRef, publicEvent('alice')));
  await seed('generalLocations/inactive-index-target', {
    kind: 'city', displayName: 'Nederland', active: false, approvedAliases: [],
    countryCode: 'US', regionCode: 'TX',
  });
  await seed('generalLocations/malformed-index-target', {
    kind: 'city', displayName: 'Nederland', active: true, approvedAliases: 'Nederland',
    countryCode: 'US', regionCode: 'TX',
  });
  const indexes = [
    null,
    {},
    { schemaVersion: 1 },
    { schemaVersion: 1, aliases: null },
    { schemaVersion: 1, aliases: 'Nederland' },
    { schemaVersion: 2, aliases: { Nederland: 'nederland' } },
    { schemaVersion: 1, aliases: { Nederland: 'nederland' }, extra: true },
    { schemaVersion: 1, aliases: {} },
    { schemaVersion: 1, aliases: { Nederland: 42 } },
    { schemaVersion: 1, aliases: { Nederland: '../users' } },
    { schemaVersion: 1, aliases: { Nederland: 'missing' } },
    { schemaVersion: 1, aliases: { Nederland: 'inactive-index-target' } },
    { schemaVersion: 1, aliases: { Nederland: 'malformed-index-target' } },
  ];
  for (const [i, index] of indexes.entries()) {
    await environment.withSecurityRulesDisabled(async context => {
      const ref = doc(context.firestore(), 'generalLocationAliases', 'current');
      if (index === null) await deleteDoc(ref);
      else await setDoc(ref, index);
    });
    await assertFails(setDoc(
      doc(alice, 'yardSaleEvents', `bad-index-${i}`), publicEvent('alice'),
    ));
    await assertFails(updateDoc(eventRef, { title: `Rejected ${i}` }));
    if (index === null) {
      const batch = writeBatch(alice);
      batch.update(eventRef, { title: 'Rejected batch' });
      batch.set(doc(alice, 'eventPrivate', 'alias-index-update'), {
        userId: 'alice', address: '12 Main Street',
      });
      await assertFails(batch.commit());
      await environment.withSecurityRulesDisabled(async context => {
        const db = context.firestore();
        assert.equal((await getDoc(doc(db, 'yardSaleEvents', 'alias-index-update'))).data().title, 'Neighborhood Sale');
        assert.equal((await getDoc(doc(db, 'eventPrivate', 'alias-index-update'))).exists(), false);
      });
    }
  }
});

test('legacy and canonical event/private batches fit Rules access-call limits', async () => {
  const alice = database('alice');
  const batch = writeBatch(alice);
  for (const [id, overrides] of [
    ['legacy-limit', {}],
    ['canonical-limit', { locationId: 'nederland' }],
  ]) {
    batch.set(doc(alice, 'yardSaleEvents', id), publicEvent('alice', overrides));
    batch.set(doc(alice, 'eventPrivate', id), { userId: 'alice', address: '12 Main Street' });
  }
  await assertSucceeds(batch.commit());
  for (const id of ['legacy-limit', 'canonical-limit']) {
    assert.equal((await getDoc(doc(alice, 'eventPrivate', id))).data().address, '12 Main Street');
    await assertFails(getDoc(doc(anonymousDatabase(), 'eventPrivate', id)));
    await assertFails(getDoc(doc(database('bob'), 'eventPrivate', id)));
  }
});

test('catalog and alias index cannot be changed by clients', async () => {
  for (const db of [anonymousDatabase(), database('alice')]) {
    const location = doc(db, 'generalLocations', 'nederland');
    const index = doc(db, 'generalLocationAliases', 'current');
    await assertSucceeds(getDoc(location));
    await assertFails(setDoc(location, { displayName: '12 Main Street' }));
    await assertFails(updateDoc(location, { displayName: '12 Main Street' }));
    await assertFails(deleteDoc(location));
    await assertFails(getDoc(index));
    await assertFails(setDoc(index, { aliases: { '12 Main Street': 'nederland' } }));
    await assertFails(updateDoc(index, { schemaVersion: 2 }));
    await assertFails(deleteDoc(index));
  }
});

test('legacy private-address batch fails atomically for unapproved public location', async () => {
  const alice = database('alice');
  const eventRef = doc(alice, 'yardSaleEvents', 'invalid-batch');
  const privateRef = doc(alice, 'eventPrivate', 'invalid-batch');
  const batch = writeBatch(alice);
  batch.set(eventRef, publicEvent('alice', { location: '12 Main Street' }));
  batch.set(privateRef, { userId: 'alice', address: '12 Main Street' });
  await assertFails(batch.commit());
  await environment.withSecurityRulesDisabled(async context => {
    const db = context.firestore();
    assert.equal((await getDoc(doc(db, 'yardSaleEvents', 'invalid-batch'))).exists(), false);
    assert.equal((await getDoc(doc(db, 'eventPrivate', 'invalid-batch'))).exists(), false);
  });
});

test('clients cannot create exact events or set public address fields', async () => {
  const alice = database('alice');
  const eventRef = doc(collection(alice, 'yardSaleEvents'));
  const privateRef = doc(alice, 'eventPrivate', eventRef.id);

  await assertFails(setDoc(eventRef, publicEvent('alice', {
    locationVisibility: 'exact',
  })));
  const batch = writeBatch(alice);
  batch.set(eventRef, publicEvent('alice', {
    locationVisibility: 'general',
  }));
  batch.set(privateRef, {
    userId: 'alice',
    address: '12 Main Street',
  });
  await assertSucceeds(batch.commit());

  await assertFails(
    setDoc(doc(collection(alice, 'yardSaleEvents')),
      publicEvent('alice', {
        locationVisibility: 'exact',
        address: '12 Main Street',
      }))
  );

  const invalidRef = doc(collection(alice, 'yardSaleEvents'));
  const invalidPrivateRef = doc(alice, 'eventPrivate', invalidRef.id);
  const invalidBatch = writeBatch(alice);

  invalidBatch.set(invalidRef, publicEvent('alice', {
    locationVisibility: 'exact',
  }));
  invalidBatch.set(invalidPrivateRef, {
    userId: 'alice',
    address: '',
  });

  await assertFails(invalidBatch.commit());
});

test('public exact-address access requires a matching server consent revision', async () => {
  await seed('yardSaleEvents/revision-match', publicEvent('alice', {
    locationVisibility: 'exact',
    eventVersion: 1,
  }));
  await seed('eventPrivate/revision-match', {
    userId: 'alice',
    address: '12 Main Street',
    addressRevision: 'revision-1',
  });
  const privateRef = doc(anonymousDatabase(), 'eventPrivate', 'revision-match');
  await assertFails(getDoc(privateRef));
  await seed('eventAddressConsent/revision-match', {
    organizerUid: 'alice',
    consentVersion: 'exact-address-v1',
    addressRevision: 'revision-1',
    grantedAt: createdAt,
    operationId: 'server-operation-1',
  });
  assert.equal((await assertSucceeds(getDoc(privateRef))).data().address, '12 Main Street');

  await seed('eventAddressConsent/revision-match', {
    organizerUid: 'alice',
    consentVersion: 'exact-address-v1',
    addressRevision: 'stale-revision',
    grantedAt: createdAt,
    operationId: 'server-operation-2',
  });
  await assertFails(getDoc(privateRef));

  const alice = database('alice');
  await assertFails(setDoc(
    doc(collection(alice, 'yardSaleEvents')),
    publicEvent('alice', {
      locationVisibility: 'exact',
    }),
  ));
  await assertFails(setDoc(doc(alice, 'eventAddressConsent', 'forged'), {
    organizerUid: 'alice',
    consentVersion: 'exact-address-v1',
  }));
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

test('direct updates cannot transition exact events or alter server-managed versions', async () => {
  const alice = database('alice');
  const eventRef = doc(alice, 'yardSaleEvents', 'visibility-change');
  await seed('yardSaleEvents/visibility-change', publicEvent('alice', {
    locationVisibility: 'exact',
    eventVersion: 4,
  }));
  await assertFails(updateDoc(eventRef, {
    locationVisibility: 'general',
    updatedAt: Timestamp.now(),
  }));
  await assertFails(updateDoc(eventRef, {
    eventVersion: 5,
    updatedAt: Timestamp.now(),
  }));
  await assertFails(updateDoc(eventRef, {
    title: 'Older client changed the event',
    updatedAt: Timestamp.now(),
  }));
  await assertFails(deleteDoc(eventRef));

  const generalRef = doc(alice, 'yardSaleEvents', 'version-immutable');
  await assertSucceeds(setDoc(generalRef, publicEvent('alice')));
  await assertFails(updateDoc(generalRef, {
    eventVersion: 1,
    updatedAt: Timestamp.now(),
  }));
});

test('public event schema rejects prohibited location fields on create and update', async () => {
  const alice = database('alice');
  const prohibitedFields = {
    address: '12 Main Street',
    streetAddress: '12 Main Street',
    latitude: 29.99,
    longitude: -94.01,
    coordinates: [29.99, -94.01],
    geoPoint: { latitude: 29.99, longitude: -94.01 },
    locationCoordinates: { latitude: 29.99, longitude: -94.01 },
  };

  for (const [field, value] of Object.entries(prohibitedFields)) {
    await assertFails(setDoc(
      doc(alice, 'yardSaleEvents', `invalid-create-${field}`),
      publicEvent('alice', { [field]: value }),
    ));

    const eventRef = doc(alice, 'yardSaleEvents', `invalid-update-${field}`);
    await seed(`yardSaleEvents/invalid-update-${field}`, publicEvent('alice'));
    await assertFails(updateDoc(eventRef, { [field]: value }));
  }
});

test('invalid event time ranges are rejected by rules', async () => {
  const alice = database('alice');
  await assertFails(setDoc(
    doc(collection(alice, 'yardSaleEvents')),
    publicEvent('alice', { endDate: startDate }),
  ));
});

test('public event listings contain only fields from the strict event schema', async () => {
  await seed('yardSaleEvents/alice-event', publicEvent('alice'));
  await seed('yardSaleEvents/bob-event', publicEvent('bob'));

  const alice = database('alice');
  const crossOwnerEvents = await assertSucceeds(getDocs(query(
    collection(alice, 'yardSaleEvents'),
    where('userId', '==', 'bob'),
  )));
  assert.deepEqual(crossOwnerEvents.docs.map(event => event.id), ['bob-event']);

  const aliceEvents = await assertSucceeds(getDocs(query(
    collection(alice, 'yardSaleEvents'),
    where('userId', '==', 'alice'),
  )));
  assert.deepEqual(aliceEvents.docs.map(event => event.id), ['alice-event']);
  for (const event of aliceEvents.docs) {
    assert.equal('address' in event.data(), false);
    assert.equal('latitude' in event.data(), false);
    assert.equal('longitude' in event.data(), false);
  }

  const bob = database('bob');
  const bobEvents = await assertSucceeds(getDocs(query(
    collection(bob, 'yardSaleEvents'),
    where('userId', '==', 'bob'),
  )));
  assert.deepEqual(bobEvents.docs.map(event => event.id), ['bob-event']);
  const publicEvents = await assertSucceeds(getDocs(collection(anonymousDatabase(), 'yardSaleEvents')));
  assert.equal(publicEvents.size, 2);
  for (const event of publicEvents.docs) {
    assert.equal('address' in event.data(), false);
    assert.equal('latitude' in event.data(), false);
    assert.equal('longitude' in event.data(), false);
  }
});

test('malformed legacy event documents are not publicly readable by document ID', async () => {
  await seed('yardSaleEvents/legacy', {
    ...publicEvent('alice', {
      locationVisibility: 'exact',
      latitude: 29.99,
      longitude: -94.01,
    }),
    address: '12 Main Street',
    privateNote: 'Unexpected legacy field',
  });
  await assertFails(getDoc(doc(anonymousDatabase(), 'yardSaleEvents', 'legacy')));
  const owner = database('alice');
  const ownerDocument = await assertSucceeds(getDoc(doc(owner, 'yardSaleEvents', 'legacy')));
  assert.equal(ownerDocument.data().address, '12 Main Street');
  assert.equal(ownerDocument.data().latitude, 29.99);
  assert.equal(ownerDocument.data().longitude, -94.01);
  assert.equal(ownerDocument.data().privateNote, 'Unexpected legacy field');

  assert.equal(ownerDocument.data().address, '12 Main Street');
});
