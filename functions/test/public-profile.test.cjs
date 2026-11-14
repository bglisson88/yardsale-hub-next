const assert = require('node:assert/strict');
const { test } = require('node:test');
const { HttpsError } = require('firebase-functions/v2/https');
const { registerPublicProfile } = require('../lib/public-profile.js');

function request(data, auth = { uid: 'user-123', token: {} }) {
  return { data, auth };
}

async function assertCallableError(call, code, message) {
  let error;
  try {
    await call();
  } catch (caught) {
    error = caught;
  }
  assert.ok(error instanceof HttpsError);
  assert.equal(error.code, code);
  assert.equal(error.message, message);
  assert.equal(error.details, undefined);
  return error;
}

test('requires a verified callable user before processing registration data', async () => {
  await assertCallableError(
    () => registerPublicProfile.run(request({ username: 'seller_1' }, null)),
    'unauthenticated',
    'Sign in to register a public profile.',
  );
});

test('accepts only the username field and rejects private or identity inputs', async () => {
  for (const data of [
    null,
    [],
    {},
    { uid: 'forged' },
    { username: 'seller_1', uid: 'forged' },
    { username: 'seller_1', memberSince: 'forged' },
    { username: 'seller_1', photoURL: 'https://example.test/photo.jpg' },
    { username: 'seller_1', displayName: 'Forged name' },
    { username: 'seller_1', email: 'private@example.test' },
  ]) {
    await assertCallableError(
      () => registerPublicProfile.run(request(data)),
      'invalid-argument',
      'Provide a valid username.',
    );
  }
});

test('maps invalid usernames to a safe callable error', async () => {
  for (const username of ['ab', 'has space', 'name-é']) {
    const error = await assertCallableError(
      () => registerPublicProfile.run(request({ username })),
      'invalid-argument',
      'Provide a valid username.',
    );
    assert.equal(error.message.includes(username), false);
  }
});

test('maps hardcoded reserved usernames to the generic unavailable response', async () => {
  const error = await assertCallableError(
    () => registerPublicProfile.run(request({ username: 'ADMIN' })),
    'already-exists',
    'That username is unavailable.',
  );
  assert.equal(error.message.includes('ADMIN'), false);
});
