const assert = require('node:assert/strict');
const { test } = require('node:test');
const { Timestamp } = require('firebase-admin/firestore');
const { HttpsError } = require('firebase-functions/v2/https');
const { consumeUsernameAttempt } = require('../lib/rate-limit.js');

const FIFTEEN_MINUTES = 15 * 60 * 1000;
const ONE_DAY = 24 * 60 * 60 * 1000;

class FakeFirestore {
  constructor() {
    this.records = new Map();
    this.tail = Promise.resolve();
  }

  collection(name) {
    return { doc: id => new FakeReference(`${name}/${id}`) };
  }

  runTransaction(callback) {
    const execute = async () => {
      const writes = [];
      const transaction = {
        get: async ref => ({
          exists: this.records.has(ref.path),
          get: key => this.records.get(ref.path)?.[key],
        }),
        set: (ref, value) => writes.push([ref.path, value]),
      };
      const result = await callback(transaction);
      for (const [path, value] of writes) this.records.set(path, value);
      return result;
    };
    const result = this.tail.then(execute);
    this.tail = result.catch(() => undefined);
    return result;
  }
}

class FakeReference {
  constructor(path) {
    this.path = path;
  }

  collection(name) {
    return { doc: id => new FakeReference(`${this.path}/${name}/${id}`) };
  }
}

test('limits each operation to five attempts in a rolling 15-minute window', async () => {
  const firestore = new FakeFirestore();
  const now = Date.parse('2026-11-16T12:00:00Z');
  for (let attempt = 0; attempt < 5; attempt += 1) {
    await consumeUsernameAttempt(firestore, 'uid-1', 'register', now + attempt);
  }

  await assert.rejects(
    consumeUsernameAttempt(firestore, 'uid-1', 'register', now + 5),
    error => {
      assert.ok(error instanceof HttpsError);
      assert.equal(error.code, 'resource-exhausted');
      assert.equal(error.details.reason, 'USERNAME_RATE_LIMIT');
      assert.equal(error.details.retryAfterSeconds, 900);
      return true;
    },
  );
  await consumeUsernameAttempt(firestore, 'uid-1', 'register', now + FIFTEEN_MINUTES + 5);
  assert.equal(
    firestore.records.get('usernameRateLimits/uid-1/operations/register').attempts.length,
    6,
  );
});

test('calculates retry time from the oldest active attempt even if stored order is stale', async () => {
  const firestore = new FakeFirestore();
  const now = Date.parse('2026-11-16T12:00:00Z');
  firestore.records.set('usernameRateLimits/uid-unsorted/operations/register', {
    attempts: [
      Timestamp.fromMillis(now - 60_000),
      Timestamp.fromMillis(now - 5 * 60_000),
      Timestamp.fromMillis(now - 10 * 60_000),
      Timestamp.fromMillis(now - 12 * 60_000),
      Timestamp.fromMillis(now - 14 * 60_000),
    ],
  });

  await assert.rejects(
    consumeUsernameAttempt(firestore, 'uid-unsorted', 'register', now),
    error => {
      assert.equal(error.details.retryAfterSeconds, 60);
      return true;
    },
  );
});

test('limits each operation to 20 attempts in a rolling 24-hour window', async () => {
  const firestore = new FakeFirestore();
  const now = Date.parse('2026-11-16T12:00:00Z');
  for (let attempt = 0; attempt < 19; attempt += 1) {
    await consumeUsernameAttempt(
      firestore,
      'uid-2',
      'rename',
      now - ONE_DAY + 60_000 + attempt * 20 * 60_000,
    );
  }
  await consumeUsernameAttempt(firestore, 'uid-2', 'rename', now);
  await assert.rejects(
    consumeUsernameAttempt(firestore, 'uid-2', 'rename', now + 1),
    error => {
      assert.ok(error instanceof HttpsError);
      assert.equal(error.code, 'resource-exhausted');
      assert.equal(error.details.retryAfterSeconds, 60);
      return true;
    },
  );
});

test('keeps register and rename quotas independent for the same UID', async () => {
  const firestore = new FakeFirestore();
  const now = Date.now();
  for (let attempt = 0; attempt < 5; attempt += 1) {
    await consumeUsernameAttempt(firestore, 'uid-3', 'register', now + attempt);
  }
  await consumeUsernameAttempt(firestore, 'uid-3', 'rename', now + 5);
  assert.equal(
    firestore.records.get('usernameRateLimits/uid-3/operations/rename').attempts.length,
    1,
  );
});

test('serializes concurrent attempts and fails closed on malformed records', async () => {
  const firestore = new FakeFirestore();
  const now = Date.now();
  const results = await Promise.all(Array.from({ length: 20 }, () =>
    consumeUsernameAttempt(firestore, 'uid-4', 'register', now).then(
      () => 'allowed',
      error => error.code,
    ),
  ));
  assert.equal(results.filter(result => result === 'allowed').length, 5);
  assert.equal(results.filter(result => result === 'resource-exhausted').length, 15);
  assert.equal(
    firestore.records.get('usernameRateLimits/uid-4/operations/register').attempts.length,
    5,
  );

  firestore.records.set('usernameRateLimits/uid-bad/operations/register', {
    attempts: ['not-a-timestamp'],
  });
  await assert.rejects(
    consumeUsernameAttempt(firestore, 'uid-bad', 'register', now),
    error => error instanceof HttpsError && error.code === 'internal',
  );
});

test('prunes timestamps outside each rolling boundary', async () => {
  const firestore = new FakeFirestore();
  const now = Date.parse('2026-11-16T12:00:00Z');
  firestore.records.set('usernameRateLimits/uid-5/operations/register', {
    attempts: [
      Timestamp.fromMillis(now - ONE_DAY),
      Timestamp.fromMillis(now - FIFTEEN_MINUTES),
    ],
  });
  await consumeUsernameAttempt(firestore, 'uid-5', 'register', now);
  assert.deepEqual(
    firestore.records.get('usernameRateLimits/uid-5/operations/register')
      .attempts.map(value => value.toMillis()),
    [now - FIFTEEN_MINUTES, now],
  );
});
