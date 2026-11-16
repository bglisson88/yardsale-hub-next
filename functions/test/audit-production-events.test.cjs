const assert = require('node:assert/strict');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { test } = require('node:test');

const script = path.resolve(__dirname, '../scripts/audit-production-events.cjs');

test('production event audit refuses to run without explicit read-only confirmation', () => {
  const result = spawnSync(process.execPath, [script], {
    encoding: 'utf8',
    env: { ...process.env, FIRESTORE_EMULATOR_HOST: '' },
  });
  assert.equal(result.status, 2);
  assert.equal(result.stdout, '');
  assert.match(result.stderr, /--confirm-read-only-production-audit/);
});

test('production event audit rejects any project other than the verified production ID', () => {
  const result = spawnSync(process.execPath, [
    script,
    '--project',
    'yardsale-hub-staging',
    '--confirm-read-only-production-audit',
  ], {
    encoding: 'utf8',
    env: { ...process.env, GCLOUD_PROJECT: 'yardsale-hub-staging', FIRESTORE_EMULATOR_HOST: '' },
  });
  assert.equal(result.status, 2);
  assert.equal(result.stdout, '');
  assert.match(result.stderr, /yardsale-hub-93c49/);
});
