const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { test } = require('node:test');
const {
  initializeApp,
  deleteApp,
} = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');

const { consumeUsernameAttempt } = require('../lib/rate-limit.js');

const PROJECT_ID = 'demo-yardsale-hub';
const HOST = '127.0.0.1:8080';

test('real Firestore serializes concurrent username rate-limit attempts', {
  timeout: 60_000,
}, async t => {
  assert.equal(process.env.GCLOUD_PROJECT, PROJECT_ID);
  assert.equal(process.env.GOOGLE_APPLICATION_CREDENTIALS, undefined);
  assert.equal(process.env.FIRESTORE_EMULATOR_HOST, HOST);

  const uid = `rate-limit-${randomUUID()}`;
  const app = initializeApp(
    { projectId: PROJECT_ID },
    `rate-limit-${uid}`,
  );

  const db = getFirestore(app);
  const limitRef = db.collection('usernameRateLimits')
    .doc(uid)
    .collection('operations')
    .doc('register');

  t.after(async () => {
    try {
      await limitRef.delete();
    } finally {
      await deleteApp(app);
    }
  });

  const results = [];

  // Four waves of five concurrent requests reduce emulator lock contention
  // while still exercising concurrent transactions against the same document.
  for (let wave = 0; wave < 4; wave++) {
    const batch = await Promise.allSettled(
      Array.from({ length: 5 }, () =>
        consumeUsernameAttempt(db, uid, 'register'),
      ),
    );

    results.push(...batch);
  }

  const successful = results.filter(
    result => result.status === 'fulfilled',
  );

  const rejected = results.filter(
    result => result.status === 'rejected',
  );

  const rateLimited = rejected.filter(
    result => result.reason?.code === 'resource-exhausted',
  );

  const unexpected = rejected.filter(
    result => result.reason?.code !== 'resource-exhausted',
  );

  assert.equal(results.length, 20);
  assert.equal(successful.length, 5, 'Exactly five attempts should succeed');
  assert.equal(rateLimited.length, 15, 'Remaining attempts should be rate-limited');
  assert.equal(unexpected.length, 0, 'No unexpected transaction failures');

  const snapshot = await limitRef.get();

  assert.equal(snapshot.exists, true);

  const attempts = snapshot.get('attempts');

  assert.equal(attempts.length, 5);
  assert.ok(attempts.every(attempt =>
    typeof attempt.toMillis === 'function',
  ));

  console.log('Rate-limit emulator integration results:');
  console.log(`Total attempts: ${results.length}`);
  console.log(`Successful: ${successful.length}`);
  console.log(`Rate limited: ${rateLimited.length}`);
  console.log(`Unexpected failures: ${unexpected.length}`);
  console.log(`Persisted attempts: ${attempts.length}`);
});
