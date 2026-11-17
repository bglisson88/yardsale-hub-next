const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const root = path.resolve(__dirname, '..');
const mode = process.argv[2];
const project = 'demo-yardsale-hub';
let args;
let env = process.env;

function run(args, cwd = root, env = process.env) {
  const result = spawnSync(process.execPath, args, { cwd, env, stdio: 'inherit' });
  if (result.error) {
    console.error('Failed to start Functions test command:', result.error);
    return 1;
  }
  if (result.signal) {
    console.error(`Functions test command terminated by ${result.signal}.`);
    return 128 + (os.constants.signals[result.signal] || 0);
  }
  return result.status ?? 1;
}

switch (mode) {
  case 'smoke':
  case 'integration':
    if (mode === 'smoke') {
      const functionsDir = path.join(root, 'functions');
      const tsc = require.resolve('typescript/bin/tsc', { paths: [functionsDir] });
      const status = run([tsc], functionsDir);
      if (status !== 0) {
        process.exitCode = status;
        break;
      }
    }
    args = [
      require.resolve('firebase-tools/lib/bin/firebase.js'),
      'emulators:exec', '--project', project,
      '--only', mode === 'smoke' ? 'auth,functions,firestore,storage' : 'auth,functions,firestore',
      `node scripts/run-functions-tests.cjs ${mode}-child`,
    ];
    break;
  case 'smoke-child':
    args = [
      '--env-file=functions/.env.demo-yardsale-hub',
      '-e', "require('./functions/lib/index.js')",
    ];
    env = { ...process.env, GCLOUD_PROJECT: project };
    break;
  case 'integration-child':
    args = [
      '--test',
      '--test-concurrency=1',
      'functions/test/public-profile.integration.test.cjs',
      'functions/test/public-event-projection-audit.integration.test.cjs',
    ];
    env = { ...process.env, FUNCTIONS_EMULATOR_HOST: '127.0.0.1:5001' };
    break;
  default:
    console.error('Expected a Functions test mode: smoke or integration.');
    process.exitCode = 1;
}

if (args) {
  process.exitCode = run(args, root, env);
}
