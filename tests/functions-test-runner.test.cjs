const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { test } = require('node:test');
const vm = require('node:vm');

const filename = path.resolve(__dirname, '../scripts/run-functions-tests.cjs');
const source = fs.readFileSync(filename, 'utf8');

function run(mode, result = { status: 0 }) {
  const calls = [];
  const errors = [];
  const mockProcess = {
    argv: ['node', filename, mode],
    env: { EXISTING_ENV: 'preserved' },
    execPath: '/node',
    exitCode: undefined,
  };
  const mockRequire = name => {
    if (name === 'node:child_process') {
      return { spawnSync: (...args) => { calls.push(args); return result; } };
    }
    return require(name);
  };
  mockRequire.resolve = require.resolve;
  vm.runInNewContext(source, {
    require: mockRequire,
    __dirname: path.dirname(filename),
    process: mockProcess,
    console: { error: (...args) => errors.push(args) },
  }, { filename });
  return { calls, errors, exitCode: mockProcess.exitCode };
}

test('launches the requested isolated emulators using Node', () => {
  for (const [mode, emulators] of [
    ['smoke', 'auth,functions,firestore,storage'],
    ['integration', 'auth,functions,firestore'],
  ]) {
    const result = run(mode);
    assert.equal(result.exitCode, 0);
    if (mode === 'smoke') {
      assert.equal(result.calls.length, 2);
      const [executable, args, options] = result.calls[0];
      assert.equal(executable, '/node');
      assert.equal(args[0], require.resolve('typescript/bin/tsc', { paths: [path.resolve(__dirname, '../functions')] }));
      assert.equal(options.cwd, path.resolve(__dirname, '../functions'));
    }
    const [executable, args, options] = result.calls[mode === 'smoke' ? 1 : 0];
    assert.equal(executable, '/node');
    assert.equal(args[0], require.resolve('firebase-tools/lib/bin/firebase.js'));
    assert.deepEqual(Array.from(args.slice(1)), [
      'emulators:exec', '--project', 'demo-yardsale-hub',
      '--only', emulators, `node scripts/run-functions-tests.cjs ${mode}-child`,
    ]);
    assert.equal(options.env.EXISTING_ENV, 'preserved');
    assert.equal(options.cwd, path.resolve(__dirname, '..'));
  }
});

test('sets the smoke and integration child environments without a shell', () => {
  const smoke = run('smoke-child');
  const integration = run('integration-child');
  assert.deepEqual(Array.from(smoke.calls[0][1]), [
    '--env-file=functions/.env.demo-yardsale-hub', '-e', "require('./functions/lib/index.js')",
  ]);
  assert.equal(smoke.calls[0][2].env.GCLOUD_PROJECT, 'demo-yardsale-hub');
  assert.equal(smoke.calls[0][2].env.EXISTING_ENV, 'preserved');
  assert.deepEqual(Array.from(integration.calls[0][1]), [
    '--test', '--test-concurrency=1', 'functions/test/public-profile.integration.test.cjs',
  ]);
  assert.equal(integration.calls[0][2].env.FUNCTIONS_EMULATOR_HOST, '127.0.0.1:5001');
  assert.equal(integration.calls[0][2].env.EXISTING_ENV, 'preserved');
});

test('propagates failure status and reports spawn failures and unknown modes', () => {
  assert.equal(run('integration', { status: 7 }).exitCode, 7);
  const compileFailure = run('smoke', { status: 8 });
  assert.equal(compileFailure.exitCode, 8);
  assert.equal(compileFailure.calls.length, 1);
  assert.equal(run('smoke-child', { signal: 'SIGTERM' }).exitCode, 128 + os.constants.signals.SIGTERM);
  assert.equal(run('integration-child', { error: new Error('spawn failed') }).exitCode, 1);
  const invalid = run('invalid');
  assert.equal(invalid.exitCode, 1);
  assert.equal(invalid.calls.length, 0);
  assert.equal(invalid.errors.length, 1);
});
