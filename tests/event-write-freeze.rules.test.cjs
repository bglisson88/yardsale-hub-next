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
  doc,
  getDoc,
  getDocs,
  query,
  setDoc,
  Timestamp,
  updateDoc,
  where,
} = require('firebase/firestore');
const {
  deleteObject,
  getBytes,
  listAll,
  ref,
  updateMetadata,
  uploadBytes,
} = require('firebase/storage');

const PROJECT_ID = 'demo-yardsale-hub';
const IMAGE = new Uint8Array([0x89, 0x50, 0x4e, 0x47]);
let environment;

before(async () => {
  environment = await initializeTestEnvironment({
    projectId: PROJECT_ID,
    firestore: { rules: fs.readFileSync('firestore.event-freeze.rules', 'utf8') },
    storage: { rules: fs.readFileSync('storage.event-freeze.rules', 'utf8') },
  });
});

beforeEach(async () => {
  await environment.clearFirestore();
  await clearStorage();
});

after(async () => {
  if (environment) await environment.cleanup();
});

function database(uid) {
  const context = uid
    ? environment.authenticatedContext(uid)
    : environment.unauthenticatedContext();
  return context.firestore();
}

function storage(uid) {
  const context = uid
    ? environment.authenticatedContext(uid)
    : environment.unauthenticatedContext();
  return context.storage();
}

function upload(bucket, path, bytes = IMAGE, contentType = 'image/png') {
  return uploadBytes(ref(bucket, path), bytes, { contentType });
}

async function seedDocument(path, data) {
  await environment.withSecurityRulesDisabled(async context => {
    await setDoc(doc(context.firestore(), path), data);
  });
}

async function seedObject(path, bytes = IMAGE, contentType = 'image/png') {
  await environment.withSecurityRulesDisabled(async context => {
    await upload(context.storage(), path, bytes, contentType);
  });
}

async function clearStorage() {
  await environment.withSecurityRulesDisabled(async context => {
    async function clearDirectory(directory) {
      const { items, prefixes } = await listAll(directory);
      await Promise.all(items.map(item => deleteObject(item)));
      await Promise.all(prefixes.map(prefix => clearDirectory(prefix)));
    }

    await clearDirectory(ref(context.storage()));
  });
}

test('event freeze denies public listing, preserves safe gets and owner-scoped reads, and denies writes', async () => {
  const validEvent = {
    userId: 'bob',
    title: 'Public sale',
    description: 'Saturday sale',
    location: 'Nederland',
    locationVisibility: 'general',
    startDate: Timestamp.fromDate(new Date('2026-11-10T15:00:00Z')),
    endDate: Timestamp.fromDate(new Date('2026-11-10T18:00:00Z')),
    photoURL: null,
    createdAt: Timestamp.fromDate(new Date('2026-11-01T12:00:00Z')),
    updatedAt: Timestamp.fromDate(new Date('2026-11-01T12:00:00Z')),
    itemCount: 0,
  };
  await seedDocument('yardSaleEvents/existing', {
    ...validEvent,
    userId: 'alice',
    address: '12 Main Street',
    latitude: 29.99,
    longitude: -94.01,
    unexpectedLegacyField: 'legacy private value',
  });
  await seedDocument('yardSaleEvents/valid', validEvent);
  await seedDocument('yardSaleEvents/bob-event', validEvent);
  await seedDocument('eventPrivate/existing', {
    userId: 'alice',
    address: '12 Main Street',
  });

  const anonymous = database();
  const alice = database('alice');
  const bob = database('bob');
  assert.equal((await assertSucceeds(getDoc(
    doc(anonymous, 'yardSaleEvents', 'valid'),
  ))).data().title, 'Public sale');
  await assertFails(getDoc(doc(anonymous, 'yardSaleEvents', 'existing')));
  const ownerLegacyEvent = await assertSucceeds(getDoc(
    doc(alice, 'yardSaleEvents', 'existing'),
  ));
  assert.equal(ownerLegacyEvent.data().address, '12 Main Street');
  assert.equal(ownerLegacyEvent.data().latitude, 29.99);
  assert.equal(ownerLegacyEvent.data().longitude, -94.01);
  assert.equal(ownerLegacyEvent.data().unexpectedLegacyField, 'legacy private value');
  await assertFails(getDocs(collection(anonymous, 'yardSaleEvents')));
  await assertFails(getDocs(collection(alice, 'yardSaleEvents')));
  await assertFails(getDocs(query(
    collection(alice, 'yardSaleEvents'),
    where('userId', '==', 'bob'),
  )));
  for (const db of [anonymous, alice, bob]) {
    await assertFails(getDoc(doc(db, 'eventPrivate', 'existing')));
  }
  const ownerEvents = await assertSucceeds(getDocs(query(
    collection(alice, 'yardSaleEvents'),
    where('userId', '==', 'alice'),
  )));
  assert.deepEqual(ownerEvents.docs.map(event => event.id), ['existing']);

  for (const db of [anonymous, alice, bob]) {
    await assertFails(setDoc(doc(db, 'yardSaleEvents', 'new'), { userId: 'alice' }));
    await assertFails(updateDoc(doc(db, 'yardSaleEvents', 'valid'), { title: 'Changed' }));
    await assertFails(deleteDoc(doc(db, 'yardSaleEvents', 'valid')));

    await assertFails(setDoc(doc(db, 'eventPrivate', 'new'), {
      userId: 'alice',
      address: '99 Other Street',
    }));
    await assertFails(updateDoc(doc(db, 'eventPrivate', 'existing'), {
      address: '99 Other Street',
    }));
    await assertFails(deleteDoc(doc(db, 'eventPrivate', 'existing')));
  }
});

test('user profiles are private during event freeze', async () => {
  await seedDocument('users/alice', { displayName: 'Alice' });

  const owner = database('alice');
  const anonymous = database();
  const otherUser = database('bob');

  assert.equal((await assertSucceeds(getDoc(
    doc(owner, 'users', 'alice'),
  ))).data().displayName, 'Alice');

  for (const db of [anonymous, otherUser]) {
    await assertFails(getDoc(doc(db, 'users', 'alice')));
  }

  for (const db of [owner, anonymous, otherUser]) {
    await assertFails(getDocs(collection(db, 'users')));
  }
});

test('unrelated production Firestore permissions remain available', async () => {
  const alice = database('alice');
  const anonymous = database();

  const user = doc(alice, 'users', 'alice');
  await assertSucceeds(setDoc(user, { displayName: 'Alice' }));
  await assertSucceeds(updateDoc(user, { displayName: 'Updated Alice' }));
  await assertSucceeds(deleteDoc(user));

  await seedDocument('users/seller', { displayName: 'Seller' });
  await assertSucceeds(setDoc(doc(alice, 'users', 'seller'), {
    averageRating: 4.5,
    totalReviews: 2,
    ratingBreakdown: { 4: 1, 5: 1 },
  }));

  const item = doc(alice, 'items', 'chair');
  await assertSucceeds(setDoc(item, { userId: 'alice', title: 'Chair' }));
  assert.equal((await assertSucceeds(getDoc(doc(anonymous, 'items', 'chair'))))
    .data().title, 'Chair');
  await assertSucceeds(updateDoc(item, { title: 'Updated chair' }));
  await assertSucceeds(deleteDoc(item));

  const favorite = doc(alice, 'favorites', 'alice_item_chair');
  await assertSucceeds(setDoc(favorite, {
    userId: 'alice',
    type: 'item',
    targetId: 'chair',
  }));
  assert.equal((await assertSucceeds(getDoc(
    doc(database('bob'), 'favorites', 'alice_item_chair'),
  ))).data().userId, 'alice');
  await assertSucceeds(deleteDoc(favorite));

  const review = doc(alice, 'reviews', 'seller_alice');
  await assertSucceeds(setDoc(review, {
    reviewerId: 'alice',
    sellerId: 'seller',
    rating: 5,
    comment: 'Great seller',
  }));
  assert.equal((await assertSucceeds(getDoc(
    doc(database('bob'), 'reviews', 'seller_alice'),
  ))).data().rating, 5);
  await assertSucceeds(updateDoc(review, { comment: 'Updated review' }));
  await assertSucceeds(deleteDoc(review));

  const message = doc(alice, 'messages', 'hello');
  await assertSucceeds(setDoc(message, {
    senderId: 'alice',
    recipientId: 'bob',
    text: 'Is this available?',
    createdAt: new Date(),
    read: false,
  }));
  assert.equal((await assertSucceeds(getDoc(
    doc(database('bob'), 'messages', 'hello'),
  ))).data().senderId, 'alice');
  await assertFails(updateDoc(doc(database('bob'), 'messages', 'hello'), {
    read: true,
  }));
});

test('event Storage writes are frozen while existing event photos remain public', async () => {
  await seedObject('events/alice/existing/photo.png');

  assert.deepEqual(new Uint8Array(await assertSucceeds(getBytes(
    ref(storage(), 'events/alice/existing/photo.png'),
  ))), IMAGE);

  await assertFails(upload(storage('alice'), 'events/alice/new/photo.png'));
  await assertFails(upload(storage('bob'), 'events/alice/other-owner.png'));
  await assertFails(upload(storage(), 'events/alice/anonymous.png'));

  for (const uid of [undefined, 'alice', 'bob']) {
    const object = ref(storage(uid), 'events/alice/existing/photo.png');
    await assertFails(upload(storage(uid), 'events/alice/existing/photo.png', new Uint8Array([1])));
    await assertFails(updateMetadata(object, { customMetadata: { changed: 'yes' } }));
    await assertFails(deleteObject(object));
  }

  await assertFails(upload(storage('alice'), 'events/alice/nested/new/photo.png'));
});

test('production item-photo and avatar Storage permissions are preserved', async () => {
  const itemPath = 'items/alice/chair.png';
  const item = ref(storage('alice'), itemPath);
  await assertSucceeds(upload(storage('alice'), itemPath, IMAGE, 'application/octet-stream'));
  assert.deepEqual(new Uint8Array(await assertSucceeds(getBytes(ref(storage(), itemPath)))), IMAGE);
  await assertSucceeds(upload(storage('alice'), itemPath, new Uint8Array([1, 2, 3])));
  await assertSucceeds(deleteObject(item));

  const avatarPath = 'avatars/alice/profile.png';
  const avatar = ref(storage('alice'), avatarPath);
  await assertSucceeds(upload(storage('alice'), avatarPath, IMAGE, 'application/octet-stream'));
  assert.deepEqual(new Uint8Array(await assertSucceeds(getBytes(ref(storage(), avatarPath)))), IMAGE);
  await assertSucceeds(upload(storage('alice'), avatarPath, new Uint8Array([1, 2, 3])));
  await assertFails(deleteObject(avatar));
});
