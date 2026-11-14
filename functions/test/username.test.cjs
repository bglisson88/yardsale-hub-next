const assert = require('node:assert/strict');
const { test } = require('node:test');
const {
  canRenameUsername,
  canonicalizeUsername,
  isReservedUsername,
  USERNAME_RENAME_COOLDOWN_MS,
} = require('../lib/username.js');

test('accepts valid lowercase ASCII usernames', () => {
  for (const username of ['abc', 'seller_1', '123', 'a_b']) {
    assert.equal(canonicalizeUsername(username), username);
  }
});

test('normalizes ASCII uppercase without changing other valid characters', () => {
  assert.equal(canonicalizeUsername('AbC_123'), 'abc_123');
});

test('rejects invalid characters, Unicode, and whitespace without trimming', () => {
  for (const username of [
    'ab',
    'ab-cd',
    'ab.cd',
    'ab cd',
    ' abc',
    'abc ',
    'éabc',
    'abcß',
    'ａｂｃ',
    'аbc',
    'ab\nc',
    '',
    123,
    null,
  ]) {
    assert.throws(() => canonicalizeUsername(username), TypeError);
  }
});

test('rejects trailing LF, CR, and CRLF before and after uppercase normalization', () => {
  for (const username of [
    'abc\n',
    'abc\r',
    'abc\r\n',
    'ABC\n',
    'ABC\r',
    'ABC\r\n',
  ]) {
    assert.throws(() => canonicalizeUsername(username), TypeError);
  }
});

test('accepts username length boundaries and rejects out-of-range lengths', () => {
  assert.equal(canonicalizeUsername('a'.repeat(3)), 'a'.repeat(3));
  assert.equal(canonicalizeUsername('a'.repeat(20)), 'a'.repeat(20));
  assert.throws(() => canonicalizeUsername('a'.repeat(2)), TypeError);
  assert.throws(() => canonicalizeUsername('a'.repeat(21)), TypeError);
});

test('rejects reserved usernames case-insensitively', () => {
  for (const username of [
    'admin',
    'ADMIN',
    'Administrator',
    'support',
    'help',
    'moderator',
    'staff',
    'system',
    'root',
    'api',
    'www',
  ]) {
    assert.equal(isReservedUsername(username), true);
  }

  assert.equal(isReservedUsername('admin_1'), false);
});

test('allows the first rename when no previous rename timestamp exists', () => {
  assert.equal(canRenameUsername(null, new Date('2026-01-01T00:00:00.000Z')), true);
});

test('requires 30 full days and allows a rename at the exact boundary', () => {
  const lastRenamedAt = new Date('2026-01-01T00:00:00.000Z');
  const justBefore = new Date(
    lastRenamedAt.getTime() + USERNAME_RENAME_COOLDOWN_MS - 1,
  );
  const atBoundary = new Date(
    lastRenamedAt.getTime() + USERNAME_RENAME_COOLDOWN_MS,
  );
  const afterBoundary = new Date(atBoundary.getTime() + 1);

  assert.equal(canRenameUsername(lastRenamedAt, justBefore), false);
  assert.equal(canRenameUsername(lastRenamedAt, atBoundary), true);
  assert.equal(canRenameUsername(lastRenamedAt, afterBoundary), true);
});

test('does not allow a rename when the last timestamp is in the future', () => {
  assert.equal(
    canRenameUsername(
      new Date('2026-02-01T00:00:00.000Z'),
      new Date('2026-01-01T00:00:00.000Z'),
    ),
    false,
  );
});

test('rejects invalid current or previous rename timestamps', () => {
  const validTime = new Date('2026-01-01T00:00:00.000Z');
  const invalidTime = new Date(Number.NaN);

  assert.throws(() => canRenameUsername(null, invalidTime), RangeError);
  assert.throws(() => canRenameUsername(invalidTime, validTime), RangeError);
  assert.throws(
    () => canRenameUsername('2026-01-01T00:00:00.000Z', validTime),
    RangeError,
  );
});
