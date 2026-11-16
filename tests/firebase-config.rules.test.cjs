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
  doc,
  getDoc,
  getDocs,
  setDoc,
} = require('firebase/firestore');

const PROJECT_ID = 'demo-yardsale-hub';
const SUPPORTED_CONFIGS = [
  'firebase.json',
  'firebase.event-freeze.json',
];

for (const configFile of SUPPORTED_CONFIGS) {
  test(`${configFile} keeps user documents private`, async () => {
    const config = JSON.parse(fs.readFileSync(configFile, 'utf8'));
    const rulesPath = path.resolve(config.firestore.rules);
    const environment = await initializeTestEnvironment({
      projectId: PROJECT_ID,
      firestore: { rules: fs.readFileSync(rulesPath, 'utf8') },
    });

    try {
      await environment.withSecurityRulesDisabled(async context => {
        await setDoc(doc(context.firestore(), 'users/alice'), {
          email: 'private@example.test',
        });
      });

      const owner = environment.authenticatedContext('alice').firestore();
      const otherUser = environment.authenticatedContext('bob').firestore();
      const anonymous = environment.unauthenticatedContext().firestore();

      assert.equal((await assertSucceeds(getDoc(
        doc(owner, 'users', 'alice'),
      ))).data().email, 'private@example.test');

      for (const database of [otherUser, anonymous]) {
        await assertFails(getDoc(doc(database, 'users', 'alice')));
      }

      for (const database of [owner, otherUser, anonymous]) {
        await assertFails(getDocs(collection(database, 'users')));
      }
    } finally {
      await environment.cleanup();
    }
  });
}
