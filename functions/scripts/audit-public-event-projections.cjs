const fs = require('node:fs/promises');
const path = require('node:path');
const { Firestore } = require('@google-cloud/firestore');
const {
  GoogleAuth, IdentityPoolClient, Impersonated, UserRefreshClient,
} = require('google-auth-library');

const STAGING_PROJECT_ID = 'yardsale-hub-staging';
const STAGING_AUDIT_SERVICE_ACCOUNT =
  'yardsale-hub-staging-audit@yardsale-hub-staging.iam.gserviceaccount.com';
const SOURCE_SCOPE = 'https://www.googleapis.com/auth/cloud-platform';
const FIRESTORE_SCOPE = 'https://www.googleapis.com/auth/datastore';
const EMAIL_SCOPE = 'https://www.googleapis.com/auth/userinfo.email';
const STS_URL = 'https://sts.googleapis.com/v1/token';
const IMPERSONATION_URL_PREFIX = 'https://iamcredentials.googleapis.com/v1/projects/-/serviceAccounts/';
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
  'FUNCTIONS_EMULATOR_HOST',
  'FIREBASE_EMULATORS_PATH',
];

function validatePreflight(args, env) {
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
  for (const name of [
    'GCLOUD_PROJECT',
    'GOOGLE_CLOUD_PROJECT',
    'GOOGLE_CLOUD_QUOTA_PROJECT',
  ]) {
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

function nonemptyString(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

function validateCredentials(config) {
  const invalid = () => new Error('Invalid staging impersonation credentials.');
  if (!config || ![STAGING_AUDIT_SERVICE_ACCOUNT, encodeURIComponent(STAGING_AUDIT_SERVICE_ACCOUNT)]
    .some(principal =>
      config.service_account_impersonation_url === `${IMPERSONATION_URL_PREFIX}${principal}:generateAccessToken`
    )) {
    throw invalid();
  }
  if (config.type === 'impersonated_service_account') {
    const source = config.source_credentials;
    if (source?.type !== 'authorized_user' ||
        ![source.client_id, source.client_secret, source.refresh_token].every(nonemptyString)) {
      throw invalid();
    }
    return {
      clientId: source.client_id,
      clientSecret: source.client_secret,
      refreshToken: source.refresh_token,
    };
  }

  const { audience, credential_source: source } = config;
  const format = source?.format;
  if (config.type !== 'external_account' ||
      typeof audience !== 'string' ||
      !/^\/\/iam\.googleapis\.com\/projects\/\d+\/locations\/global\/workloadIdentityPools\/[\w-]+\/providers\/[\w-]+$/.test(audience) ||
      config.token_url !== STS_URL ||
      config.subject_token_type !== 'urn:ietf:params:oauth:token-type:jwt' ||
      typeof source?.file !== 'string' || !path.isAbsolute(source.file) ||
      Object.keys(source).some(key => key !== 'file' && key !== 'format') ||
      (format !== undefined && format?.type !== 'text' &&
        !(format?.type === 'json' && nonemptyString(format.subject_token_field_name)))) {
    throw invalid();
  }
  return {
    audience,
    subject_token_type: config.subject_token_type,
    token_url: STS_URL,
    credential_source: { file: source.file, ...(format && { format }) },
    scopes: [SOURCE_SCOPE],
  };
}

async function createFirestoreClient(config, {
  IdentityPoolClientClass = IdentityPoolClient,
  ImpersonatedClass = Impersonated,
  UserRefreshClientClass = UserRefreshClient,
  FirestoreClass = Firestore,
} = {}) {
  const sourceOptions = validateCredentials(config);
  const sourceAuth = config.type === 'external_account'
    ? new IdentityPoolClientClass(sourceOptions)
    : new UserRefreshClientClass(sourceOptions);
  sourceAuth.quotaProjectId = STAGING_PROJECT_ID;
  const impersonated = new ImpersonatedClass({
    sourceClient: sourceAuth,
    targetPrincipal: STAGING_AUDIT_SERVICE_ACCOUNT,
    targetScopes: [FIRESTORE_SCOPE, EMAIL_SCOPE],
    lifetime: 3600,
    quotaProjectId: STAGING_PROJECT_ID,
  });
  const { token } = await impersonated.getAccessToken();
  const principal = token ? await impersonated.getTokenInfo(token) : null;
  if (principal?.email !== STAGING_AUDIT_SERVICE_ACCOUNT || principal.email_verified === false) {
    throw new Error('Staging audit identity could not be verified.');
  }
  // GAX expects a GoogleAuth wrapper, not a bare OAuth client.
  return new FirestoreClass({
    projectId: STAGING_PROJECT_ID,
    auth: new GoogleAuth({ projectId: STAGING_PROJECT_ID, authClient: impersonated }),
  });
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

  const preflight = validatePreflight(args, env);
  if (preflight.error) {
    console.error(`Projection audit blocked: ${preflight.error}`);
    process.exitCode = 2;
    return;
  }

  let config;
  try {
    config = JSON.parse(await fs.readFile(env.GOOGLE_APPLICATION_CREDENTIALS, 'utf8'));
    validateCredentials(config);
  } catch {
    console.error('Projection audit blocked: staging identity could not be verified.');
    process.exitCode = 2;
    return;
  }

  try {
    const {
      auditPublicEventProjections,
      formatProjectionCoverageReport,
    } = require('../lib/public-event-projection-audit.js');
    const firestore = await createFirestoreClient(config);
    const report = await auditPublicEventProjections(readOnlyStore(firestore));
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
  createFirestoreClient,
  main,
  readOnlyStore,
  safeFailureMessage,
  validatePreflight,
};
