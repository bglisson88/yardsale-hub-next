const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const root = path.resolve(__dirname, '..');
const sources = [
  'src/lib/categories.ts',
  'src/lib/discovery.ts',
  'src/lib/event-data.ts',
  'src/lib/signup.ts',
  'src/lib/username-rate-limit.ts',
];
const tests = [
  'tests/categories.test.cjs',
  'tests/category-navigation.test.cjs',
  'tests/category-taxonomy.test.cjs',
  'tests/discovery.test.cjs',
  'tests/event-data.test.cjs',
  'tests/event-detail.test.cjs',
  'tests/item-details.test.cjs',
  'tests/public-events.test.cjs',
  'tests/restoration.test.cjs',
  'tests/selectors.test.cjs',
  'tests/usability.test.cjs',
  'tests/signup.test.cjs',
  'tests/public-profile.test.cjs',
  'tests/username-rate-limit.test.cjs',
  'tests/messages.test.cjs',
];

function run(args, env = process.env) {
  const result = spawnSync(process.execPath, args, { cwd: root, env, stdio: 'inherit' });
  if (result.error) {
    console.error('Failed to start test command:', result.error);
    return 1;
  }
  if (result.signal) {
    console.error(`Test command terminated by ${result.signal}.`);
    return 128 + (os.constants.signals[result.signal] || 0);
  }
  return result.status ?? 1;
}

let tempDir;
let exitCode = 1;
try {
  tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'yardsale-tests-'));
  exitCode = run([
    require.resolve('typescript/bin/tsc'),
    ...sources,
    '--module', 'commonjs',
    '--target', 'ES2020',
    '--skipLibCheck',
    '--outDir', tempDir,
  ]);
  if (exitCode === 0) {
    exitCode = run(['--test', ...tests], { ...process.env, CATEGORY_TEST_BUILD: tempDir });
  }
} catch (error) {
  console.error('Unable to run application tests:', error);
  exitCode = 1;
} finally {
  if (tempDir) {
    try {
      fs.rmSync(tempDir, { recursive: true, force: true });
    } catch (error) {
      console.error('Unable to clean up test directory:', error);
      if (exitCode === 0) exitCode = 1;
    }
  }
  process.exitCode = exitCode;
}
