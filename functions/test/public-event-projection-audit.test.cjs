const assert = require('node:assert/strict');
const { test } = require('node:test');
const { FieldPath, Timestamp } = require('firebase-admin/firestore');

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
  getImpersonatedServiceAccount,
  readOnlyStore,
  safeFailureMessage,
  validatePreflight,
} = require('../scripts/audit-public-event-projections.cjs');

const STAGING_PROJECT = 'yardsale-hub-staging';
const AUDIT_IDENTITY =
  'yardsale-hub-staging-audit@yardsale-hub-staging.iam.gserviceaccount.com';
const CREDENTIALS = {
  type: 'impersonated_service_account',
  service_account_impersonation_url:
    `https://iamcredentials.googleapis.com/v1/projects/-/serviceAccounts/${AUDIT_IDENTITY}:generateAccessToken`,
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

test('preflight permits only explicit staging with matching impersonated identity', () => {
  assert.deepEqual(
    validatePreflight(['--project', STAGING_PROJECT], validEnvironment(), CREDENTIALS),
    { projectId: STAGING_PROJECT, plan: false },
  );
  assert.deepEqual(
    validatePreflight(['--project', STAGING_PROJECT, '--plan'], validEnvironment(), CREDENTIALS),
    { projectId: STAGING_PROJECT, plan: true },
  );
  assert.equal(getImpersonatedServiceAccount(CREDENTIALS), AUDIT_IDENTITY);
});

test('preflight rejects missing, production, unexpected, and emulator targets', () => {
  const emulatorVariables = [
    'FIREBASE_EMULATOR_HUB',
    'FIRESTORE_EMULATOR_HOST',
    'FIREBASE_AUTH_EMULATOR_HOST',
    'FIREBASE_STORAGE_EMULATOR_HOST',
    'FIREBASE_DATABASE_EMULATOR_HOST',
    'FUNCTIONS_EMULATOR',
    'FIREBASE_EMULATORS_PATH',
  ];
  for (const [args, env, credentials] of [
    [[], validEnvironment(), CREDENTIALS],
    [['--project', 'yardsale-hub-93c49'], validEnvironment(), CREDENTIALS],
    [['--project', STAGING_PROJECT, '--apply'], validEnvironment(), CREDENTIALS],
    [['--project', STAGING_PROJECT], validEnvironment({ GCLOUD_PROJECT: 'yardsale-hub-93c49' }), CREDENTIALS],
    [['--project', STAGING_PROJECT], validEnvironment({ GOOGLE_CLOUD_PROJECT: 'wrong-project' }), CREDENTIALS],
    ...emulatorVariables.map(name => [
      ['--project', STAGING_PROJECT],
      validEnvironment({ [name]: 'configured' }),
      CREDENTIALS,
    ]),
    [['--project', STAGING_PROJECT], validEnvironment({ FIREBASE_CONFIG: 'not-json' }), CREDENTIALS],
    [['--project', STAGING_PROJECT], validEnvironment({ FIREBASE_CONFIG: '{"projectId":"wrong-project"}' }), CREDENTIALS],
    [['--project', STAGING_PROJECT], validEnvironment({ YSH_PROJECTION_AUDIT_SERVICE_ACCOUNT: 'unexpected' }), CREDENTIALS],
    [['--project', STAGING_PROJECT], validEnvironment(), { type: 'authorized_user' }],
    [['--project', STAGING_PROJECT], validEnvironment(), {
      type: 'impersonated_service_account',
      service_account_impersonation_url:
        'https://iamcredentials.googleapis.com/v1/projects/-/serviceAccounts/another@yardsale-hub-staging.iam.gserviceaccount.com:generateAccessToken',
    }],
    [['--project', STAGING_PROJECT], validEnvironment(), {
      type: 'service_account',
      client_email: AUDIT_IDENTITY,
    }],
    [['--project', STAGING_PROJECT], validEnvironment(), {
      type: 'external_account',
      service_account_impersonation_url: 'https://unexpected.example/v1/projects/-/serviceAccounts/yardsale-hub-staging-audit@yardsale-hub-staging.iam.gserviceaccount.com:generateAccessToken',
    }],
  ]) {
    assert.ok(validatePreflight(args, env, credentials).error);
  }
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
