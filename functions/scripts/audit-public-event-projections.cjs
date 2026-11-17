const fs = require('node:fs');
const path = require('node:path');
const { applicationDefault, initializeApp } = require('firebase-admin/app');
const { FieldPath, getFirestore } = require('firebase-admin/firestore');

const STAGING_PROJECT_ID = 'yardsale-hub-staging';
const STAGING_AUDIT_SERVICE_ACCOUNT =
  'yardsale-hub-staging-audit@yardsale-hub-staging.iam.gserviceaccount.com';
const READ_COLLECTIONS = new Set([
  'yardSaleEvents',
  'publicYardSaleEvents',
  'generalLocations',
]);
const EMULATOR_VARIABLES = [
  'FIREBASE_EMULATOR_HUB',
  'FIRESTORE_EMULATOR_HOST',
  'FIREBASE_AUTH_EMULATOR_HOST',
  'FIREBASE_STORAGE_EMULATOR_HOST',
  'FIREBASE_DATABASE_EMULATOR_HOST',
  'FUNCTIONS_EMULATOR',
  'FIREBASE_EMULATORS_PATH',
];

function getImpersonatedServiceAccount(config) {
  if (!config || !['impersonated_service_account', 'external_account'].includes(config.type)) {
    return null;
  }
  const url = config.service_account_impersonation_url;
  if (typeof url !== 'string') return null;
  let parsedUrl;
  try {
    parsedUrl = new URL(url);
  } catch {
    return null;
  }
  if (
    parsedUrl.protocol !== 'https:' ||
    parsedUrl.hostname !== 'iamcredentials.googleapis.com'
  ) return null;
  const match = /^\/v1\/projects\/-\/serviceAccounts\/([^/:]+):generateAccessToken$/
    .exec(parsedUrl.pathname);
  if (!match) return null;
  try {
    return decodeURIComponent(match[1]);
  } catch {
    return null;
  }
}

function validateEnvironment(args, env) {
  const plan = args.length === 3 && args[2] === '--plan';
  if (
    (args.length !== 2 && !plan) ||
    args[0] !== '--project' ||
    args[1] !== STAGING_PROJECT_ID
  ) {
    return { error: 'Provide only the explicit staging project and optional --plan flag.' };
  }
  if (
    env.YSH_EXPECTED_PROJECT_ID !== STAGING_PROJECT_ID ||
    env.YSH_FUNCTIONS_MODE !== 'staging' ||
    env.YSH_PROJECTION_AUDIT_SERVICE_ACCOUNT !== STAGING_AUDIT_SERVICE_ACCOUNT
  ) {
    return { error: 'Staging project configuration does not match the reviewed identity.' };
  }
  for (const name of ['GCLOUD_PROJECT', 'GOOGLE_CLOUD_PROJECT']) {
    if (env[name] && env[name] !== STAGING_PROJECT_ID) {
      return { error: 'A configured project does not match the staging target.' };
    }
  }
  if (env.FIREBASE_CONFIG) {
    let firebaseConfig;
    try {
      firebaseConfig = JSON.parse(env.FIREBASE_CONFIG);
    } catch {
      return { error: 'FIREBASE_CONFIG is invalid.' };
    }
    if (!firebaseConfig || firebaseConfig.projectId !== STAGING_PROJECT_ID) {
      return { error: 'FIREBASE_CONFIG does not match the staging target.' };
    }
  }
  if (EMULATOR_VARIABLES.some(name => Boolean(env[name]))) {
    return { error: 'Emulator configuration is not allowed for a staging audit.' };
  }
  return { projectId: STAGING_PROJECT_ID, plan };
}

function validatePreflight(args, env, adcConfig) {
  const environment = validateEnvironment(args, env);
  if (environment.error) return environment;
  if (getImpersonatedServiceAccount(adcConfig) !== STAGING_AUDIT_SERVICE_ACCOUNT) {
    return { error: 'Application credentials do not match the reviewed staging identity.' };
  }
  return environment;
}

function loadAdcConfig(env) {
  const filename = env.GOOGLE_APPLICATION_CREDENTIALS;
  if (!filename) throw new Error('Application credentials are required.');
  try {
    return JSON.parse(fs.readFileSync(filename, 'utf8'));
  } catch {
    throw new Error('Application credentials could not be verified.');
  }
}

function readOnlyStore(firestore) {
  function wrapQuery(query) {
    return {
      orderBy: field => wrapQuery(query.orderBy(field)),
      limit: amount => wrapQuery(query.limit(amount)),
      startAfter: snapshot => wrapQuery(query.startAfter(snapshot)),
      get: () => query.get(),
    };
  }

  return {
    collection(name) {
      if (!READ_COLLECTIONS.has(name)) {
        throw new Error('Unsupported collection for projection audit.');
      }
      const collection = firestore.collection(name);
      return {
        doc(id) {
          const reference = collection.doc(id);
          return { get: () => reference.get() };
        },
        orderBy(field) {
          return wrapQuery(collection.orderBy(field));
        },
      };
    },
  };
}

function safeFailureMessage() {
  return 'Projection audit failed; no record data was emitted.';
}

async function main(args = process.argv.slice(2), env = process.env) {
  try {
    process.loadEnvFile(path.join(__dirname, '../.env.yardsale-hub-staging'));
  } catch {
    console.error('Projection audit blocked: reviewed staging configuration is unavailable.');
    process.exitCode = 2;
    return;
  }

  const environment = validateEnvironment(args, env);
  if (environment.error) {
    console.error(`Projection audit blocked: ${environment.error}`);
    process.exitCode = 2;
    return;
  }

  let preflight;
  try {
    preflight = validatePreflight(args, env, loadAdcConfig(env));
  } catch {
    console.error('Projection audit blocked: staging identity could not be verified.');
    process.exitCode = 2;
    return;
  }
  if (preflight.error) {
    console.error(`Projection audit blocked: ${preflight.error}`);
    process.exitCode = 2;
    return;
  }

  process.env.GCLOUD_PROJECT = preflight.projectId;
  try {
    const {
      auditPublicEventProjections,
      formatProjectionCoverageReport,
    } = require('../lib/public-event-projection-audit.js');
    const app = initializeApp({
      credential: applicationDefault(),
      projectId: preflight.projectId,
    }, 'staging-public-event-projection-audit');
    const report = await auditPublicEventProjections(readOnlyStore(getFirestore(app)));
    const formatted = JSON.parse(formatProjectionCoverageReport(preflight.projectId, report));
    formatted.mode = preflight.plan ? 'dry-run-plan' : 'read-only-audit';
    formatted.writesPerformed = 0;
    console.log(JSON.stringify(formatted, null, 2));
  } catch {
    console.error(safeFailureMessage());
    process.exitCode = 1;
  }
}

if (require.main === module) {
  void main();
}

module.exports = {
  getImpersonatedServiceAccount,
  main,
  readOnlyStore,
  safeFailureMessage,
  validatePreflight,
};
