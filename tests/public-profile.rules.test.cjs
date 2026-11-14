const fs = require('node:fs');
const path = require('node:path');
const { test } = require('node:test');
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
  setDoc,
  Timestamp,
  updateDoc,
} = require('firebase/firestore');

const PROJECT_ID = 'demo-yardsale-hub';
const CREATED_AT = Timestamp.fromDate(new Date('2026-01-01T00:00:00.000Z'));
const UPDATED_AT = Timestamp.fromDate(new Date('2026-01-02T00:00:00.000Z'));
const START_DATE = Timestamp.fromDate(new Date('2026-01-03T10:00:00.000Z'));
const END_DATE = Timestamp.fromDate(new Date('2026-01-03T12:00:00.000Z'));
const SUPPORTED_CONFIGS = [
  { file: 'firebase.json', eventWritesAllowed: true },
  { file: 'firebase.event-freeze.json', eventWritesAllowed: false },
];

function database(environment, uid) {
  return uid
    ? environment.authenticatedContext(uid).firestore()
    : environment.unauthenticatedContext().firestore();
}

function itemDocument() {
  return {
    userId: 'alice',
    title: 'Chair',
    description: 'Used chair',
    category: 'home-garden',
    price: 10,
    condition: 'good',
    location: 'Nederland',
    photoURLs: [],
    createdAt: CREATED_AT,
    updatedAt: UPDATED_AT,
    views: 0,
    isSold: false,
  };
}

function eventDocument() {
  return {
    userId: 'alice',
    title: 'Community sale',
    description: 'Sale details',
    location: 'Nederland',
    locationVisibility: 'general',
    startDate: START_DATE,
    endDate: END_DATE,
    photoURL: null,
    createdAt: CREATED_AT,
    updatedAt: UPDATED_AT,
    itemCount: 0,
  };
}

for (const { file, eventWritesAllowed } of SUPPORTED_CONFIGS) {
  test(`${file} protects public profiles and username collections`, async () => {
    const config = JSON.parse(fs.readFileSync(file, 'utf8'));
    const environment = await initializeTestEnvironment({
      projectId: PROJECT_ID,
      firestore: {
        rules: fs.readFileSync(path.resolve(config.firestore.rules), 'utf8'),
      },
    });

    try {
      await environment.clearFirestore();
      await environment.withSecurityRulesDisabled(async context => {
        const db = context.firestore();
        await Promise.all([
          setDoc(doc(db, 'publicProfiles/alice'), {
            username: 'alice',
            displayName: 'Alice Seller',
            photoURL: null,
            memberSince: CREATED_AT,
          }),
          setDoc(doc(db, 'usernameClaims/alice'), { uid: 'alice' }),
          setDoc(doc(db, 'usernameState/alice'), { lastRenamedAt: null }),
          setDoc(doc(db, 'reservedUsernames/admin'), { reserved: true }),
          setDoc(doc(db, 'users/alice'), {
            id: 'alice',
            email: 'private@example.test',
            displayName: 'Alice Seller',
            photoURL: null,
            location: 'Nederland',
            bio: '',
            createdAt: CREATED_AT,
            updatedAt: UPDATED_AT,
          }),
          setDoc(doc(db, 'items/chair'), itemDocument()),
          setDoc(doc(db, 'yardSaleEvents/sale'), eventDocument()),
        ]);
      });

      const anonymous = database(environment);
      const alice = database(environment, 'alice');
      const bob = database(environment, 'bob');
      const profileRef = doc(anonymous, 'publicProfiles', 'alice');
      const claimRef = doc(anonymous, 'usernameClaims', 'alice');

      const publicProfile = await assertSucceeds(getDoc(profileRef));
      assert.deepEqual(Object.keys(publicProfile.data()).sort(), [
        'displayName',
        'memberSince',
        'photoURL',
        'username',
      ]);
      assert.equal(publicProfile.data().photoURL, null);
      assert.equal((await assertSucceeds(getDoc(
        doc(alice, 'publicProfiles', 'alice'),
      ))).data().username, 'alice');

      for (const db of [anonymous, alice, bob]) {
        await assertFails(getDocs(collection(db, 'publicProfiles')));
        await assertFails(setDoc(doc(db, 'publicProfiles/new'), {
          username: 'new',
          displayName: 'New User',
          photoURL: null,
          memberSince: CREATED_AT,
        }));
        await assertFails(updateDoc(doc(db, 'publicProfiles', 'alice'), {
          displayName: 'Changed',
        }));
        await assertFails(deleteDoc(doc(db, 'publicProfiles', 'alice')));
      }

      assert.equal((await assertSucceeds(getDoc(claimRef))).data().uid, 'alice');
      assert.equal((await assertSucceeds(getDoc(
        doc(bob, 'usernameClaims', 'alice'),
      ))).data().uid, 'alice');
      for (const db of [anonymous, alice, bob]) {
        await assertFails(getDocs(collection(db, 'usernameClaims')));
        await assertFails(setDoc(doc(db, 'usernameClaims', 'new'), { uid: 'new' }));
        await assertFails(updateDoc(doc(db, 'usernameClaims', 'alice'), { uid: 'bob' }));
        await assertFails(deleteDoc(doc(db, 'usernameClaims', 'alice')));
      }

      for (const [collectionName, documentId] of [
        ['usernameState', 'alice'],
        ['reservedUsernames', 'admin'],
      ]) {
        for (const db of [anonymous, alice, bob]) {
          const documentRef = doc(db, collectionName, documentId);
          await assertFails(getDoc(documentRef));
          await assertFails(getDocs(collection(db, collectionName)));
          await assertFails(setDoc(doc(db, collectionName, 'new'), { value: true }));
          await assertFails(updateDoc(documentRef, { value: true }));
          await assertFails(deleteDoc(documentRef));
        }
      }

      assert.equal((await assertSucceeds(getDoc(
        doc(alice, 'users', 'alice'),
      ))).data().email, 'private@example.test');
      for (const db of [anonymous, bob]) {
        await assertFails(getDoc(doc(db, 'users', 'alice')));
      }
      for (const db of [anonymous, alice, bob]) {
        await assertFails(getDocs(collection(db, 'users')));
      }

      const itemRef = doc(alice, 'items', 'chair');
      assert.equal((await assertSucceeds(getDoc(
        doc(anonymous, 'items', 'chair'),
      ))).data().title, 'Chair');
      await assertSucceeds(updateDoc(itemRef, {
        title: 'Updated chair',
        updatedAt: UPDATED_AT,
      }));
      await assertFails(updateDoc(doc(bob, 'items', 'chair'), {
        title: 'Unauthorized',
        updatedAt: UPDATED_AT,
      }));

      const eventRef = doc(alice, 'yardSaleEvents', 'sale');
      assert.equal((await assertSucceeds(getDoc(
        doc(anonymous, 'yardSaleEvents', 'sale'),
      ))).data().title, 'Community sale');
      assert.equal((await assertSucceeds(getDocs(
        collection(anonymous, 'yardSaleEvents'),
      ))).size, 1);
      const updateEvent = updateDoc(eventRef, {
        title: 'Updated sale',
        updatedAt: UPDATED_AT,
      });
      if (eventWritesAllowed) {
        await assertSucceeds(updateEvent);
      } else {
        await assertFails(updateEvent);
      }
    } finally {
      await environment.cleanup();
    }
  });
}
