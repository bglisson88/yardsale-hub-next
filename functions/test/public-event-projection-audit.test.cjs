const assert = require('node:assert/strict');
const { test } = require('node:test');
const { FieldPath, Timestamp } = require('firebase-admin/firestore');
const { Firestore } = require('@google-cloud/firestore');

process.env.GCLOUD_PROJECT = 'demo-yardsale-hub';
process.env.YSH_EXPECTED_PROJECT_ID = 'demo-yardsale-hub';
process.env.YSH_FUNCTIONS_MODE = 'emulator';
process.env.YSH_FUNCTIONS_REGION = 'us-south1';
process.env.YSH_FUNCTIONS_MAX_INSTANCES = '2';
process.env.YSH_FUNCTIONS_CONCURRENCY = '10';
process.env.YSH_FUNCTIONS_TIMEOUT_SECONDS = '30';
process.env.YSH_FUNCTIONS_MEMORY = '256MiB';
process.env.YSH_FUNCTIONS_MIN_INSTANCES = '0';
delete process.env.YSH_FUNCTIONS_SERVICE_ACCOUNT;

const {
  auditPublicEventProjections,
  formatProjectionCoverageReport,
} = require('../lib/public-event-projection-audit.js');
const {
  buildPublicEventProjection,
} = require('../lib/public-event-projection.js');
const {
  createFirestoreClient,
  readOnlyStore,
  safeFailureMessage,
  validatePreflight,
} = require('../scripts/audit-public-event-projections.cjs');

const STAGING_PROJECT = 'yardsale-hub-staging';
const AUDIT_IDENTITY =
  'yardsale-hub-staging-audit@yardsale-hub-staging.iam.gserviceaccount.com';
const IMPERSONATION_URL =
  `https://iamcredentials.googleapis.com/v1/projects/-/serviceAccounts/${AUDIT_IDENTITY}:generateAccessToken`;
const IMPERSONATED_CONFIG = {
  type: 'impersonated_service_account',
  service_account_impersonation_url: IMPERSONATION_URL,
  source_credentials: {
    type: 'authorized_user',
    client_id: 'test-client-id',
    client_secret: 'test-client-secret',
    refresh_token: 'test-refresh-token',
  },
};
const EXTERNAL_CONFIG = {
  type: 'external_account',
  service_account_impersonation_url: IMPERSONATION_URL,
  audience: '//iam.googleapis.com/projects/123/locations/global/workloadIdentityPools/test/providers/test',
  subject_token_type: 'urn:ietf:params:oauth:token-type:jwt',
  token_url: 'https://sts.googleapis.com/v1/token',
  credential_source: { file: '/test/subject-token' },
};
const START = Timestamp.fromDate(new Date('2026-11-20T09:00:00Z'));
const END = Timestamp.fromDate(new Date('2026-11-20T12:00:00Z'));
const CREATED = Timestamp.fromDate(new Date('2026-11-01T10:00:00Z'));
const CATALOG = {
  kind: 'city',
  displayName: 'Nederland',
  active: true,
  approvedAliases: [],
  countryCode: 'US',
  regionCode: 'TX',
};

function source(overrides = {}) {
  return {
    userId: 'owner-private-id',
    title: 'Sale',
    description: 'Public details',
    location: 'Nederland',
    locationId: 'nederland-tx',
    locationVisibility: 'general',
    startDate: START,
    endDate: END,
    photoURL: null,
    createdAt: CREATED,
    updatedAt: CREATED,
    itemCount: 0,
    ...overrides,
  };
}

function snapshot(id, data) {
  return { id, exists: data !== undefined, data: () => data };
}

class FakeStore {
  constructor(records = {}) {
    this.records = records;
    this.reads = 0;
  }

  collection(name) {
    const records = this.records[name] ?? new Map();
    return {
      doc: id => ({
        get: async () => {
          this.reads++;
          return snapshot(id, records.get(id));
        },
      }),
      orderBy: field => {
        assert.equal(field.isEqual(FieldPath.documentId()), true);
        let amount = Infinity;
        let after;
        const query = {
          orderBy: nextField => {
            assert.equal(nextField.isEqual(FieldPath.documentId()), true);
            return query;
          },
          limit: nextAmount => {
            amount = nextAmount;
            return query;
          },
          startAfter: cursor => {
            after = cursor.id;
            return query;
          },
          get: async () => {
            this.reads++;
            const docs = [...records.entries()]
              .sort(([left], [right]) => left.localeCompare(right))
              .filter(([id]) => !after || id > after)
              .slice(0, amount)
              .map(([id, data]) => snapshot(id, data));
            return { docs, empty: docs.length === 0 };
          },
        };
        return query;
      },
    };
  }
}

function makeCoverageFixture() {
  const rows = new Map([
    ['a-valid', source()],
    ['b-missing', source({ title: 'Missing projection' })],
    ['c-stale', source({ title: 'Current source title' })],
    ['d-inactive', source({ locationId: 'inactive' })],
    ['e-legacy', source({ locationId: undefined })],
    ['f-malformed-source', source({ extra: true })],
    ['g-sensitive-projection', source()],
    ['h-malformed-catalog', source({ locationId: 'malformed-catalog' })],
    ['i-missing-catalog', source({ locationId: 'missing-catalog' })],
  ]);
  const expected = buildPublicEventProjection(source(), CATALOG);
  const locations = new Map([
    ['nederland-tx', CATALOG],
    ['inactive', { ...CATALOG, active: false }],
    ['malformed-catalog', { ...CATALOG, extra: true }],
    ['unreferenced', { ...CATALOG, displayName: 'Austin' }],
  ]);
  const projections = new Map([
    ['a-valid', expected],
    ['d-inactive', { ...expected, schemaVersion: 2 }],
    ['c-stale', { ...expected, title: 'Old source title' }],
    ['e-legacy', { schemaVersion: 1, address: '12 Main Street' }],
    ['f-malformed-source', { schemaVersion: 1, unexpected: 'field' }],
    ['g-sensitive-projection', { ...expected, address: '12 Main Street' }],
    ['z-orphan', { schemaVersion: 1, address: 'Private orphan' }],
  ]);
  return new FakeStore({
    yardSaleEvents: rows,
    publicYardSaleEvents: projections,
    generalLocations: locations,
  });
}

function validEnvironment(overrides = {}) {
  return {
    YSH_EXPECTED_PROJECT_ID: STAGING_PROJECT,
    YSH_FUNCTIONS_MODE: 'staging',
    YSH_PROJECTION_AUDIT_SERVICE_ACCOUNT: AUDIT_IDENTITY,
    ...overrides,
  };
}

test('preflight permits only explicit staging with matching reviewed settings', () => {
  assert.deepEqual(
    validatePreflight(['--project', STAGING_PROJECT], validEnvironment()),
    { projectId: STAGING_PROJECT, plan: false },
  );
  assert.deepEqual(
    validatePreflight(
      ['--project', STAGING_PROJECT],
      validEnvironment({ GOOGLE_APPLICATION_CREDENTIALS: '/source-adc.json' }),
    ),
    { projectId: STAGING_PROJECT, plan: false },
  );
  assert.deepEqual(
    validatePreflight(['--project', STAGING_PROJECT, '--plan'], validEnvironment()),
    { projectId: STAGING_PROJECT, plan: true },
  );
});

test('preflight rejects missing, production, unexpected, and emulator targets', () => {
  const emulatorVariables = [
    'FIREBASE_EMULATOR_HUB',
    'FIRESTORE_EMULATOR_HOST',
    'FIREBASE_AUTH_EMULATOR_HOST',
    'FIREBASE_STORAGE_EMULATOR_HOST',
    'FIREBASE_DATABASE_EMULATOR_HOST',
    'FUNCTIONS_EMULATOR',
    'FUNCTIONS_EMULATOR_HOST',
    'FIREBASE_EMULATORS_PATH',
  ];
  for (const [args, env] of [
    [[], validEnvironment()],
    [['--project', 'yardsale-hub-93c49'], validEnvironment()],
    [['--project', STAGING_PROJECT, '--apply'], validEnvironment()],
    [['--project', STAGING_PROJECT], validEnvironment({ GCLOUD_PROJECT: 'yardsale-hub-93c49' })],
    [['--project', STAGING_PROJECT], validEnvironment({ GOOGLE_CLOUD_PROJECT: 'wrong-project' })],
    [['--project', STAGING_PROJECT], validEnvironment({ GOOGLE_CLOUD_QUOTA_PROJECT: 'yardsale-hub-93c49' })],
    [['--project', STAGING_PROJECT], validEnvironment({ YSH_EXPECTED_PROJECT_ID: 'yardsale-hub-93c49' })],
    ...emulatorVariables.map(name => [
      ['--project', STAGING_PROJECT],
      validEnvironment({ [name]: 'configured' }),
    ]),
    [['--project', STAGING_PROJECT], validEnvironment({ FIREBASE_CONFIG: 'not-json' })],
    [['--project', STAGING_PROJECT], validEnvironment({ FIREBASE_CONFIG: '{"projectId":"wrong-project"}' })],
    [['--project', STAGING_PROJECT], validEnvironment({ YSH_PROJECTION_AUDIT_SERVICE_ACCOUNT: 'unexpected' })],
  ]) {
    assert.ok(validatePreflight(args, env).error);
  }
});

function mockAuthentication({
  tokenInfo = { email: AUDIT_IDENTITY, email_verified: true },
  token = 'test-access-token',
  tokenError,
} = {}) {
  const calls = [];
  class FakeSource {
    constructor(options) {
      this.options = options;
      calls.push('source');
    }
  }
  class FakeImpersonated {
    constructor(options) {
      this.options = options;
      this.universeDomain = 'googleapis.com';
      calls.push('impersonate');
    }

    async getAccessToken() {
      calls.push('issue token');
      if (tokenError) throw tokenError;
      return { token };
    }

    async getTokenInfo(accessToken) {
      assert.equal(accessToken, token);
      calls.push('verify token');
      return tokenInfo;
    }
  }
  return {
    calls,
    deps: {
      UserRefreshClientClass: FakeSource,
      IdentityPoolClientClass: FakeSource,
      ImpersonatedClass: FakeImpersonated,
    },
  };
}

for (const config of [IMPERSONATED_CONFIG, EXTERNAL_CONFIG]) {
  test(`verified ${config.type} credentials reach the real Firestore GAX client without ADC`, async () => {
    const { calls, deps } = mockAuthentication();
    const firestore = await createFirestoreClient(config, deps);
    try {
      assert.ok(firestore instanceof Firestore);
      assert.equal(firestore.projectId, STAGING_PROJECT);
      assert.deepEqual(calls, ['source', 'impersonate', 'issue token', 'verify token']);
      // Inspect the generated client without creating an RPC or a gRPC stub.
      await firestore._clientPool.run('offline-auth-test', true, async client => {
        assert.equal(await client.auth.getProjectId(), STAGING_PROJECT);
        const credential = await client.auth.getClient();
        assert.ok(credential instanceof deps.ImpersonatedClass);
        const { sourceClient, ...options } = credential.options;
        assert.equal(sourceClient.quotaProjectId, STAGING_PROJECT);
        assert.deepEqual(options, {
          targetPrincipal: AUDIT_IDENTITY,
          targetScopes: [
            'https://www.googleapis.com/auth/datastore',
            'https://www.googleapis.com/auth/userinfo.email',
          ],
          lifetime: 3600,
          quotaProjectId: STAGING_PROJECT,
        });
        if (config.type === 'external_account') {
          assert.deepEqual(sourceClient.options.scopes, ['https://www.googleapis.com/auth/cloud-platform']);
          assert.deepEqual(sourceClient.options.credential_source, config.credential_source);
          assert.equal(sourceClient.options.service_account_impersonation_url, undefined);
        } else {
          assert.equal(sourceClient.options.refreshToken, config.source_credentials.refresh_token);
        }
      });
    } finally {
      await firestore.terminate();
    }
  });
}

test('invalid configurations fail before any auth client is constructed', async () => {
  for (const config of [
    null,
    { ...IMPERSONATED_CONFIG, source_credentials: { type: 'service_account' } },
    { ...IMPERSONATED_CONFIG, source_credentials: { type: 'authorized_user' } },
    { ...IMPERSONATED_CONFIG, service_account_impersonation_url: IMPERSONATION_URL.replace(AUDIT_IDENTITY, 'other') },
    { ...EXTERNAL_CONFIG, service_account_impersonation_url: IMPERSONATION_URL.replace('iamcredentials.googleapis.com', 'other.example') },
    { ...EXTERNAL_CONFIG, token_url: 'https://other.example/token' },
    { ...EXTERNAL_CONFIG, credential_source: { ...EXTERNAL_CONFIG.credential_source, executable: {} } },
  ]) {
    const { calls, deps } = mockAuthentication();
    await assert.rejects(createFirestoreClient(config, deps), /Invalid staging impersonation credentials/);
    assert.deepEqual(calls, []);
  }
});

test('missing tokens and unverified principals block Firestore initialization', async () => {
  for (const options of [
    { token: null },
    { tokenInfo: { email_verified: true } },
    { tokenInfo: { email: 'unexpected@example.com', email_verified: true } },
    { tokenError: new Error('token exchange denied') },
  ]) {
    const { deps } = mockAuthentication(options);
    class UnexpectedFirestore {
      constructor() {
        assert.fail('Firestore must not be constructed');
      }
    }
    await assert.rejects(
      createFirestoreClient(IMPERSONATED_CONFIG, { ...deps, FirestoreClass: UnexpectedFirestore }),
      options.tokenError ?? /Staging audit identity could not be verified/,
    );
  }
});

test('only explicit Boolean or string true verifies the staging token email', async () => {
  class FakeFirestore {}

  for (const email_verified of [true, 'true']) {
    const { deps } = mockAuthentication({ tokenInfo: { email: AUDIT_IDENTITY, email_verified } });
    const firestore = await createFirestoreClient(IMPERSONATED_CONFIG, {
      ...deps, FirestoreClass: FakeFirestore,
    });
    assert.ok(firestore instanceof FakeFirestore);
  }

  class UnexpectedFirestore {
    constructor() {
      assert.fail('Firestore must not be constructed');
    }
  }
  for (const tokenInfo of [
    { email: AUDIT_IDENTITY },
    ...[false, 'false', null, 1, 'TRUE'].map(email_verified => ({
      email: AUDIT_IDENTITY, email_verified,
    })),
  ]) {
    const { deps } = mockAuthentication({ tokenInfo });
    await assert.rejects(
      createFirestoreClient(IMPERSONATED_CONFIG, { ...deps, FirestoreClass: UnexpectedFirestore }),
      /Staging audit identity could not be verified/,
      JSON.stringify(tokenInfo),
    );
  }
});

test('Firestore initialization failure propagates after principal verification', async () => {
  const { calls, deps } = mockAuthentication();
  class FailingFirestore {
    constructor() {
      assert.equal(calls.at(-1), 'verify token');
      throw new Error('Firestore initialization failed');
    }
  }
  await assert.rejects(
    createFirestoreClient(IMPERSONATED_CONFIG, { ...deps, FirestoreClass: FailingFirestore }),
    /Firestore initialization failed/,
  );
});

test('audit store exposes only reads and cannot invoke Firestore writes', async () => {
  const writes = [];
  const raw = {
    collection: () => ({
      doc: () => ({
        get: async () => snapshot('doc', {}),
        set: () => writes.push('set'),
        update: () => writes.push('update'),
        delete: () => writes.push('delete'),
      }),
      orderBy: () => ({
        limit: () => ({
          get: async () => ({ docs: [], empty: true }),
          startAfter: () => ({ get: async () => ({ docs: [], empty: true }) }),
        }),
      }),
    }),
    runTransaction: () => writes.push('transaction'),
    batch: () => writes.push('batch'),
  };
  const store = readOnlyStore(raw);
  const collection = store.collection('yardSaleEvents');
  const document = collection.doc('event-id-never-output');
  const query = collection.orderBy(FieldPath.documentId());

  assert.equal(typeof store.runTransaction, 'undefined');
  assert.equal(typeof store.batch, 'undefined');
  assert.equal(typeof document.set, 'undefined');
  assert.equal(typeof document.update, 'undefined');
  assert.equal(typeof document.delete, 'undefined');
  assert.equal(typeof query.set, 'undefined');
  assert.throws(() => store.collection('eventPrivate'));
  await document.get();
  await query.limit(10).get();
  assert.deepEqual(writes, []);
});

test('audit classifies eligibility, projection coverage, invalid locations, and manual review', async () => {
  const report = await auditPublicEventProjections(makeCoverageFixture());
  assert.deepEqual(report, {
    scanCompleted: true,
    scanConsistency: 'best-effort-non-atomic',
    totalCatalogRecords: 4,
    malformedCatalogRecords: 1,
    inactiveCatalogRecords: 1,
    totalSourceEvents: 9,
    structurallyEligibleEvents: 4,
    publicationApprovedEvents: 0,
    validExistingProjections: 1,
    missingProjections: 1,
    staleProjections: 1,
    malformedProjections: 2,
    projectionsWithSensitiveFieldNames: 3,
    orphanedProjections: 1,
    invalidLocationReferences: 4,
    inactiveLocationReferences: 1,
    legacyOrMalformedSourceEvents: 5,
    manualReviewRequiredEvents: 9,
    proposedActions: {
      removeMalformedOrSensitive: 4,
      removeOrphaned: 1,
      reviewBeforeCreate: 1,
      reviewBeforeUpdate: 1,
    },
  });
});

test('audit paginates large collections and repeated runs produce the same report', async () => {
  const events = new Map();
  const locations = new Map([['nederland-tx', CATALOG]]);
  for (let index = 0; index < 205; index++) {
    events.set(`event-${String(index).padStart(3, '0')}`, source());
    if (index > 0) {
      locations.set(`location-${String(index).padStart(3, '0')}`, {
        ...CATALOG,
        displayName: `City ${index}`,
      });
    }
  }
  const store = new FakeStore({
    yardSaleEvents: events,
    publicYardSaleEvents: new Map(),
    generalLocations: locations,
  });

  const first = await auditPublicEventProjections(store);
  const second = await auditPublicEventProjections(store);
  assert.equal(first.totalSourceEvents, 205);
  assert.equal(first.totalCatalogRecords, 205);
  assert.equal(first.missingProjections, 205);
  assert.equal(first.structurallyEligibleEvents, 205);
  assert.deepEqual(second, first);
});

test('audit emits aggregate-only output and never echoes event data', async () => {
  const report = await auditPublicEventProjections(makeCoverageFixture());
  const output = formatProjectionCoverageReport(STAGING_PROJECT, report);
  for (const sensitive of [
    'a-valid',
    'owner-private-id',
    '12 Main Street',
    'Private orphan',
    'Nederland',
  ]) {
    assert.equal(output.includes(sensitive), false);
  }
  assert.equal(JSON.parse(output).readOnly, true);
});

test('audit failures do not produce success-shaped reports or expose error details', async () => {
  const failedStore = {
    collection() {
      return {
        orderBy() {
          return {
            limit() {
              return {
                get: async () => {
                  throw new Error('event-id 12 Main Street owner-private-id');
                },
              };
            },
          };
        },
      };
    },
  };
  await assert.rejects(auditPublicEventProjections(failedStore));
  assert.equal(
    safeFailureMessage(new Error('event-id 12 Main Street')),
    'Projection audit failed; no record data was emitted.',
  );
});
