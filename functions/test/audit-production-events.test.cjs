const assert = require('node:assert/strict');
const { test } = require('node:test');
const { GeoPoint, Timestamp } = require('firebase-admin/firestore');
const {
  collectAuditCounts,
  formatSummary,
  validateAuditArguments,
} = require('../scripts/audit-production-events.cjs');

const production = 'yardsale-hub-93c49';
const staging = 'yardsale-hub-staging';
const productionConfirmation = '--confirm-read-only-production-audit';
const stagingConfirmation = '--confirm-read-only-staging-audit';

test('accepts only each approved project with its matching confirmation flag', () => {
  assert.deepEqual(
    validateAuditArguments(['--project', production, productionConfirmation], {}),
    { projectId: production },
  );
  assert.deepEqual(
    validateAuditArguments(['--project', staging, stagingConfirmation], {}),
    { projectId: staging },
  );
});

test('rejects unknown project IDs with an explicit identity error', () => {
  const result = validateAuditArguments([
    '--project',
    'yardsale-hub-unapproved',
    productionConfirmation,
  ], {});
  assert.match(result.error, /Unsupported Firebase project ID "yardsale-hub-unapproved"/);
});

test('rejects a project that conflicts with the active GCLOUD_PROJECT', () => {
  const result = validateAuditArguments(
    ['--project', production, productionConfirmation],
    { GCLOUD_PROJECT: staging },
  );
  assert.match(result.error, new RegExp(`"${production}".*"${staging}"`));
});

test('production and staging confirmation flags cannot be interchanged', () => {
  const productionWithStagingFlag = validateAuditArguments(
    ['--project', production, stagingConfirmation],
    {},
  );
  assert.match(productionWithStagingFlag.error, new RegExp(production));
  assert.match(productionWithStagingFlag.error, new RegExp(productionConfirmation));

  const stagingWithProductionFlag = validateAuditArguments(
    ['--project', staging, productionConfirmation],
    {},
  );
  assert.match(stagingWithProductionFlag.error, new RegExp(staging));
  assert.match(stagingWithProductionFlag.error, new RegExp(stagingConfirmation));
});

test('rejects duplicate or conflicting project and confirmation arguments', () => {
  for (const args of [
    ['--project', production, '--project', production, productionConfirmation],
    ['--project', production, '--project', staging, productionConfirmation],
    ['--project', production, productionConfirmation, productionConfirmation],
    ['--project', production, productionConfirmation, stagingConfirmation],
    ['--project', production, production, productionConfirmation],
  ]) {
    assert.ok(validateAuditArguments(args, {}).error, `accepted ${args.join(' ')}`);
  }
});

test('refuses emulator configuration and unexpected arguments', () => {
  assert.match(
    validateAuditArguments(
      ['--project', production, productionConfirmation],
      { FIRESTORE_EMULATOR_HOST: '127.0.0.1:8080' },
    ).error,
    /emulator/,
  );
  assert.match(
    validateAuditArguments(
      ['--project', production, productionConfirmation, '--write'],
      {},
    ).error,
    /Unexpected or duplicate/,
  );
});

function readOnlyFirestore(fixtures) {
  const collectionsRead = [];
  return {
    collectionsRead,
    collection(name) {
      assert.ok(
        ['yardSaleEvents', 'eventPrivate', 'eventAddressConsent'].includes(name),
        `unexpected collection read: ${name}`,
      );
      collectionsRead.push(name);
      return {
        orderBy() {
          return {
            limit(size) {
              assert.equal(size, 400);
              return {
                async get() {
                  const docs = (fixtures[name] ?? []).map(({ id, data }) => ({
                    id,
                    data: () => data,
                  }));
                  return { docs, empty: docs.length === 0, size: docs.length };
                },
              };
            },
          };
        },
      };
    },
  };
}

test('audit performs reads only and formats aggregate counts without private values', async () => {
  const privateValues = [
    'PRIVATE_EVENT_ID_SENTINEL',
    'PRIVATE_ORGANIZER_ID_SENTINEL',
    'PRIVATE_ADDRESS_SENTINEL',
  ];
  const db = readOnlyFirestore({
    yardSaleEvents: [{
      id: privateValues[0],
      data: {
        userId: privateValues[1],
        locationVisibility: 'general',
        address: privateValues[2],
        latitude: 29.99,
        longitude: -94.01,
        coordinates: new GeoPoint(29.99, -94.01),
      },
    }],
    eventPrivate: [{
      id: privateValues[0],
      data: { userId: privateValues[1], address: privateValues[2] },
    }],
    eventAddressConsent: [{
      id: privateValues[0],
      data: {
        organizerUid: privateValues[1],
        consentVersion: 'exact-address-v1',
        addressRevision: 'revision',
        grantedAt: Timestamp.now(),
      },
    }],
  });

  const counts = await collectAuditCounts(db);
  const output = formatSummary(staging, counts);
  assert.equal(counts.eventDocuments, 1);
  assert.equal(counts.publicDocumentsWithSensitiveLocationFields, 1);
  assert.equal(counts.privateDocumentsWithAddress, 1);
  assert.deepEqual(
    new Set(db.collectionsRead),
    new Set(['yardSaleEvents', 'eventPrivate', 'eventAddressConsent']),
  );
  for (const value of [...privateValues, '29.99', '-94.01']) {
    assert.equal(output.includes(value), false);
  }
  assert.match(output, /"readOnly": true/);
  assert.match(output, /"publicDocumentsWithSensitiveLocationFields": 1/);
});
