const assert = require('node:assert/strict');
const { test } = require('node:test');
const {
  usernameRateLimitErrorMessage,
} = require(`${process.env.CATEGORY_TEST_BUILD}/username-rate-limit.js`);

test('formats actionable rolling-window retry details', () => {
  assert.equal(
    usernameRateLimitErrorMessage({
      code: 'functions/resource-exhausted',
      details: {
        reason: 'USERNAME_RATE_LIMIT',
        retryAfterSeconds: 901,
      },
    }, 'register'),
    'Too many attempts at registering your username. Please try again in about 16 minutes.',
  );
  assert.equal(
    usernameRateLimitErrorMessage({
      code: 'functions/resource-exhausted',
      details: { reason: 'OTHER', retryAfterSeconds: 30 },
    }, 'rename'),
    null,
  );
  assert.equal(
    usernameRateLimitErrorMessage({
      code: 'functions/resource-exhausted',
      details: { reason: 'USERNAME_RATE_LIMIT', retryAt: 'invalid' },
    }, 'rename'),
    'Too many attempts at changing your username. Please try again in a little while.',
  );
});
