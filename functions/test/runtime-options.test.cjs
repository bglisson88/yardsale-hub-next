const assert = require('node:assert/strict');
const { test } = require('node:test');

const stagingEnvironment = () => ({
  GCLOUD_PROJECT: 'yardsale-hub-staging',
  YSH_EXPECTED_PROJECT_ID: 'yardsale-hub-staging',
  YSH_FUNCTIONS_MODE: 'staging',
  YSH_FUNCTIONS_REGION: 'us-south1',
  YSH_FUNCTIONS_SERVICE_ACCOUNT:
    'yardsale-hub-staging-backend@yardsale-hub-staging.iam.gserviceaccount.com',
  YSH_FUNCTIONS_MAX_INSTANCES: '2',
  YSH_FUNCTIONS_CONCURRENCY: '10',
  YSH_FUNCTIONS_TIMEOUT_SECONDS: '30',
  YSH_FUNCTIONS_MEMORY: '256MiB',
  YSH_FUNCTIONS_MIN_INSTANCES: '0',
});

const productionEnvironment = () => ({
  GCLOUD_PROJECT: 'yardsale-hub-93c49',
  YSH_EXPECTED_PROJECT_ID: 'yardsale-hub-93c49',
  YSH_FUNCTIONS_MODE: 'production',
  YSH_FUNCTIONS_REGION: 'us-south1',
  YSH_FUNCTIONS_SERVICE_ACCOUNT:
    'yardsale-hub-prod-backend@yardsale-hub-93c49.iam.gserviceaccount.com',
  YSH_FUNCTIONS_MAX_INSTANCES: '2',
  YSH_FUNCTIONS_CONCURRENCY: '10',
  YSH_FUNCTIONS_TIMEOUT_SECONDS: '30',
  YSH_FUNCTIONS_MEMORY: '256MiB',
  YSH_FUNCTIONS_MIN_INSTANCES: '0',
});

const emulatorEnvironment = () => ({
  GCLOUD_PROJECT: 'demo-yardsale-hub',
  YSH_EXPECTED_PROJECT_ID: 'demo-yardsale-hub',
  YSH_FUNCTIONS_MODE: 'emulator',
  YSH_FUNCTIONS_REGION: 'us-south1',
  YSH_FUNCTIONS_MAX_INSTANCES: '2',
  YSH_FUNCTIONS_CONCURRENCY: '10',
  YSH_FUNCTIONS_TIMEOUT_SECONDS: '30',
  YSH_FUNCTIONS_MEMORY: '256MiB',
  YSH_FUNCTIONS_MIN_INSTANCES: '0',
});

Object.assign(process.env, emulatorEnvironment());
delete process.env.YSH_FUNCTIONS_SERVICE_ACCOUNT;

const {
  buildProfileCallableOptions,
  buildProfileEventOptions,
} = require('../lib/runtime-options.js');

test('builds the exact reviewed staging options', () => {
  assert.deepEqual(buildProfileCallableOptions(stagingEnvironment()), {
    region: 'us-south1',
    serviceAccount:
      'yardsale-hub-staging-backend@yardsale-hub-staging.iam.gserviceaccount.com',
    maxInstances: 2,
    concurrency: 10,
    timeoutSeconds: 30,
    memory: '256MiB',
    minInstances: 0,
  });
});

test('builds production options only for the reviewed project and identity', () => {
  assert.deepEqual(buildProfileCallableOptions(productionEnvironment()), {
    region: 'us-south1',
    serviceAccount:
      'yardsale-hub-prod-backend@yardsale-hub-93c49.iam.gserviceaccount.com',
    maxInstances: 2,
    concurrency: 10,
    timeoutSeconds: 30,
    memory: '256MiB',
    minInstances: 0,
  });

  const wrongIdentity = productionEnvironment();
  wrongIdentity.YSH_FUNCTIONS_SERVICE_ACCOUNT =
    'other-backend@yardsale-hub-93c49.iam.gserviceaccount.com';
  assert.throws(
    () => buildProfileCallableOptions(wrongIdentity),
    /does not match the reviewed production identity/,
  );

  const wrongMode = productionEnvironment();
  wrongMode.YSH_FUNCTIONS_MODE = 'staging';
  assert.throws(
    () => buildProfileCallableOptions(wrongMode),
    /cloud runtime mode does not match/,
  );
});

test('builds emulator options without a service account', () => {
  const options = buildProfileCallableOptions(emulatorEnvironment());
  assert.deepEqual(options, {
    region: 'us-south1',
    maxInstances: 2,
    concurrency: 10,
    timeoutSeconds: 30,
    memory: '256MiB',
    minInstances: 0,
  });
  assert.equal(Object.hasOwn(options, 'serviceAccount'), false);
});

test('rejects missing project, required settings, and service account', () => {
  for (const key of [
    'GCLOUD_PROJECT',
    'YSH_EXPECTED_PROJECT_ID',
    'YSH_FUNCTIONS_MODE',
    'YSH_FUNCTIONS_REGION',
    'YSH_FUNCTIONS_MAX_INSTANCES',
    'YSH_FUNCTIONS_CONCURRENCY',
    'YSH_FUNCTIONS_TIMEOUT_SECONDS',
    'YSH_FUNCTIONS_MEMORY',
    'YSH_FUNCTIONS_MIN_INSTANCES',
    'YSH_FUNCTIONS_SERVICE_ACCOUNT',
  ]) {
    const env = stagingEnvironment();
    delete env[key];
    assert.throws(() => buildProfileCallableOptions(env), /Invalid profile callable runtime configuration/);
  }
});

test('rejects wrong projects, region, and staging identity', () => {
  const wrongSelectedProject = stagingEnvironment();
  wrongSelectedProject.GCLOUD_PROJECT = 'yardsale-hub-production';
  assert.throws(
    () => buildProfileCallableOptions(wrongSelectedProject),
    /selected project does not match/,
  );

  const wrongExpectedProject = stagingEnvironment();
  wrongExpectedProject.YSH_EXPECTED_PROJECT_ID = 'yardsale-hub-production';
  assert.throws(
    () => buildProfileCallableOptions(wrongExpectedProject),
    /selected project does not match/,
  );

  const wrongRegion = stagingEnvironment();
  wrongRegion.YSH_FUNCTIONS_REGION = 'us-central1';
  assert.throws(() => buildProfileCallableOptions(wrongRegion), /region must be us-south1/);

  const wrongIdentity = stagingEnvironment();
  wrongIdentity.YSH_FUNCTIONS_SERVICE_ACCOUNT =
    'other-backend@yardsale-hub-staging.iam.gserviceaccount.com';
  assert.throws(
    () => buildProfileCallableOptions(wrongIdentity),
    /does not match the reviewed staging identity/,
  );

  const malformedIdentity = stagingEnvironment();
  malformedIdentity.YSH_FUNCTIONS_SERVICE_ACCOUNT = 'not-an-account';
  assert.throws(
    () => buildProfileCallableOptions(malformedIdentity),
    /valid account in the selected project/,
  );
});

test('rejects invalid limits, unsupported memory, and min instances above max', () => {
  for (const [key, value] of [
    ['YSH_FUNCTIONS_MAX_INSTANCES', '0'],
    ['YSH_FUNCTIONS_CONCURRENCY', '-1'],
    ['YSH_FUNCTIONS_TIMEOUT_SECONDS', '30.5'],
    ['YSH_FUNCTIONS_MEMORY', '256MB'],
    ['YSH_FUNCTIONS_MIN_INSTANCES', '-1'],
    ['YSH_FUNCTIONS_MAX_INSTANCES', '1'],
    ['YSH_FUNCTIONS_MIN_INSTANCES', '3'],
  ]) {
    const env = stagingEnvironment();
    env[key] = value;
    assert.throws(
      () => buildProfileCallableOptions(env),
      /Invalid profile callable runtime configuration/,
      `${key}=${value}`,
    );
  }
});

test('isolates emulator mode to the demo project and forbids service accounts', () => {
  const wrongProject = emulatorEnvironment();
  wrongProject.GCLOUD_PROJECT = 'yardsale-hub-staging';
  wrongProject.YSH_EXPECTED_PROJECT_ID = 'yardsale-hub-staging';
  assert.throws(
    () => buildProfileCallableOptions(wrongProject),
    /emulator mode is only allowed/,
  );

  const cloudModeInDemo = emulatorEnvironment();
  cloudModeInDemo.YSH_FUNCTIONS_MODE = 'staging';
  assert.throws(
    () => buildProfileCallableOptions(cloudModeInDemo),
    /cloud runtime mode does not match/,
  );

  const emulatorWithIdentity = emulatorEnvironment();
  emulatorWithIdentity.YSH_FUNCTIONS_SERVICE_ACCOUNT =
    'yardsale-hub-staging-backend@yardsale-hub-staging.iam.gserviceaccount.com';
  assert.throws(
    () => buildProfileCallableOptions(emulatorWithIdentity),
    /emulator mode must not configure a service account/,
  );
});

test('projection triggers inherit the reviewed region, limits, and project identity', () => {
  assert.deepEqual(buildProfileEventOptions(stagingEnvironment()), {
    region: 'us-south1',
    maxInstances: 2,
    concurrency: 10,
    timeoutSeconds: 30,
    memory: '256MiB',
    minInstances: 0,
    serviceAccount:
      'yardsale-hub-staging-backend@yardsale-hub-staging.iam.gserviceaccount.com',
  });
  assert.deepEqual(buildProfileEventOptions(emulatorEnvironment()), {
    region: 'us-south1',
    maxInstances: 2,
    concurrency: 10,
    timeoutSeconds: 30,
    memory: '256MiB',
    minInstances: 0,
  });
  assert.throws(
    () => buildProfileEventOptions({ ...stagingEnvironment(), GCLOUD_PROJECT: 'other-project' }),
    /selected project does not match/,
  );
});
