const assert = require('node:assert/strict');
const { test } = require('node:test');
const { spawnSync } = require('node:child_process');
const { randomUUID } = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { GeoPoint, Timestamp } = require('firebase-admin/firestore');
const {
  collectAuditCounts,
  formatSummary,
  safeFailureMessage,
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
  const pagesRead = [];
  const documentReads = [];
  function snapshot(entry) {
    return { id: entry.id, exists: true, data: () => entry.data };
  }
  return {
    collectionsRead,
    pagesRead,
    documentReads,
    collection(name) {
      assert.ok(
        ['yardSaleEvents', 'eventPrivate', 'eventAddressConsent',
          'generalLocations', 'generalLocationAliases'].includes(name),
        `unexpected collection read: ${name}`,
      );
      collectionsRead.push(name);
      return {
        doc(id) {
          assert.ok(['generalLocations', 'generalLocationAliases'].includes(name));
          return {
            async get() {
              documentReads.push({ name, id });
              const entry = (fixtures[name] ?? []).find(item => item.id === id);
              return entry ? snapshot(entry) : { exists: false };
            },
          };
        },
        orderBy() {
          return {
            limit(size) {
              assert.equal(size, 400);
              let cursor = null;
              const query = {
                startAfter(document) {
                  cursor = document.id;
                  return query;
                },
                async get() {
                  pagesRead.push({ name, cursor });
                  const docs = (fixtures[name] ?? [])
                    .filter(entry => cursor === null || entry.id > cursor)
                    .sort((a, b) => a.id.localeCompare(b.id))
                    .slice(0, size)
                    .map(snapshot);
                  return { docs, empty: docs.length === 0, size: docs.length };
                },
              };
              return query;
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

const start = Timestamp.fromMillis(1000);
const end = Timestamp.fromMillis(2000);
function event(overrides = {}) {
  return {
    userId: 'owner', title: 'Sale', description: '', location: 'Reviewed City',
    locationId: 'city', locationVisibility: 'general',
    startDate: start, endDate: end, photoURL: null, createdAt: start,
    updatedAt: start, itemCount: 0, ...overrides,
  };
}
function catalog(overrides = {}) {
  return {
    kind: 'city', displayName: 'Reviewed City', active: true,
    approvedAliases: ['Reviewed Alias'], countryCode: 'US', regionCode: 'TX',
    ...overrides,
  };
}
function marker(overrides = {}) {
  return {
    organizerUid: 'owner', consentVersion: 'exact-address-v1',
    addressRevision: 'revision', grantedAt: start, operationId: 'operation',
    ...overrides,
  };
}

for (const size of [0, 400, 401, 825]) {
  test(`paginates ${size} records in each event collection without losing joins`, async () => {
    const fixtures = {
      yardSaleEvents: [],
      eventPrivate: [],
      eventAddressConsent: [],
      generalLocations: [{ id: 'city', data: catalog() }],
    };
    for (let i = 0; i < size; i++) {
      const id = `event-${String(i).padStart(4, '0')}`;
      fixtures.yardSaleEvents.push({ id, data: event({ locationVisibility: 'exact' }) });
      fixtures.eventPrivate.push({ id, data: {
        userId: 'owner', address: 'PRIVATE_ADDRESS_SENTINEL', addressRevision: 'revision',
      } });
      fixtures.eventAddressConsent.push({ id, data: marker() });
    }
    if (size > 400) {
      fixtures.eventPrivate[400].data.userId = 'different-owner';
      fixtures.eventAddressConsent[size - 1].data.addressRevision = 'wrong-revision';
    }
    const db = readOnlyFirestore(fixtures);
    const counts = await collectAuditCounts(db);
    assert.equal(counts.eventDocuments, size);
    assert.equal(counts.privateDocuments, size);
    assert.equal(counts.consentMarkers, size);
    assert.equal(counts.catalogMatchedReviewUnverifiedLocations, size);
    assert.equal(counts.orphanPrivateDocuments, 0);
    assert.equal(counts.orphanConsentMarkers, 0);
    assert.equal(counts.eventPrivateOwnerMismatches, size > 400 ? 1 : 0);
    assert.equal(counts.exactEventsDefinitelyNotAnonymousReadable, size > 400 ? (size === 401 ? 1 : 2) : 0);
    assert.equal(counts.exactEventsPotentiallyAnonymousReadable,
      size - (size > 400 ? (size === 401 ? 1 : 2) : 0));
    assert.equal(counts.exactEventsPolicyStructurallyInvalid, size > 400 ? (size === 401 ? 1 : 2) : 0);
    assert.equal(counts.exactEventsPolicyStructurallyPlausible,
      size - (size > 400 ? (size === 401 ? 1 : 2) : 0));
    assert.equal(counts.privateDocumentsWithOwnerReadCondition, size);
    for (const name of ['yardSaleEvents', 'eventPrivate', 'eventAddressConsent']) {
      assert.equal(db.pagesRead.filter(page => page.name === name).length,
        Math.floor(size / 400) + 1);
    }
    assert.equal(db.documentReads.filter(read => read.name === 'generalLocations').length,
      size ? 1 : 0);
  });
}

test('joins missing and orphan records across page boundaries', async () => {
  const events = Array.from({ length: 401 }, (_, i) => ({
    id: `event-${String(i).padStart(4, '0')}`,
    data: event({ locationVisibility: 'exact' }),
  }));
  const privateEvents = events.slice(0, 400).map(({ id }) => ({
    id, data: { userId: 'owner', address: 'private', addressRevision: 'revision' },
  }));
  const markers = events.slice(1).map(({ id }) => ({ id, data: marker() }));
  privateEvents.push({ id: 'orphan-private', data: { userId: 'owner', address: 'private' } });
  markers.push({ id: 'orphan-marker', data: marker() });
  const counts = await collectAuditCounts(readOnlyFirestore({
    yardSaleEvents: events,
    eventPrivate: privateEvents,
    eventAddressConsent: markers,
    generalLocations: [{ id: 'city', data: catalog() }],
  }));
  assert.equal(counts.eventDocuments, 401);
  assert.equal(counts.privateDocuments, 401);
  assert.equal(counts.consentMarkers, 401);
  assert.equal(counts.orphanPrivateDocuments, 1);
  assert.equal(counts.orphanConsentMarkers, 1);
  assert.equal(counts.exactEventsWithoutNonblankPrivateAddress, 1);
  assert.equal(counts.exactEventsDefinitelyNotAnonymousReadable, 2);
});

test('reports catalog and alias matches without claiming independent review', async () => {
  const withoutId = overrides => {
    const result = event(overrides);
    delete result.locationId;
    return result;
  };
  const fixtures = [
    event(), withoutId({ location: 'Reviewed Alias' }),
    event({ location: '123 Main Street' }),
    event({ location: '29.123, -94.123' }),
    event({ location: '' }), event({ location: 42 }),
    withoutId({ location: 'Unreviewed Alias' }),
    event({ location: 'Other City' }),
    event({ locationId: 'inactive' }),
    event({ locationId: 'missing' }),
    event({ locationId: '../invalid' }),
    event({ locationId: 'malformed' }),
    withoutId({ location: 'Not In Index' }),
  ];
  const missing = event();
  delete missing.location;
  fixtures.push(missing);
  const db = readOnlyFirestore({
    yardSaleEvents: fixtures.map((data, i) => ({ id: `event-${String(i).padStart(2, '0')}`, data })),
    generalLocations: [
      { id: 'city', data: catalog() },
      { id: 'inactive', data: catalog({ active: false }) },
      { id: 'malformed', data: catalog({ extra: true }) },
    ],
    generalLocationAliases: [{ id: 'current', data: {
      schemaVersion: 1, aliases: { 'Reviewed Alias': 'city', 'Unreviewed Alias': 'city' },
    } }],
  });
  const counts = await collectAuditCounts(db);
  assert.equal(counts.catalogMatchedReviewUnverifiedLocations, 2);
  assert.equal(Object.hasOwn(counts, 'approvedPublicLocations'), false);
  assert.equal(counts.suspiciousPublicLocations, 2);
  assert.equal(counts.malformedPublicLocations, 2);
  assert.equal(counts.missingPublicLocations, 1);
  assert.equal(counts.unverifiedPublicLocations, 7);
  assert.equal(counts.publicEventsWithUnreviewedFreeText, fixtures.length);
  assert.equal(db.documentReads.some(read => read.id === '../invalid'), false);
  assert.equal(db.documentReads.filter(read => read.name === 'generalLocationAliases').length, 1);
  const output = formatSummary(staging, counts);
  for (const sensitive of ['123 Main Street', '29.123', '-94.123', 'Unreviewed Alias']) {
    assert.equal(output.includes(sensitive), false);
  }
});

test('missing or malformed alias indexes leave legacy locations unverified', async () => {
  for (const index of [undefined, {}, { schemaVersion: 1, aliases: [] },
    { schemaVersion: 1, aliases: { 'Reviewed Alias': 'city' }, extra: true }]) {
    const legacy = event({ location: 'Reviewed Alias' });
    delete legacy.locationId;
    const counts = await collectAuditCounts(readOnlyFirestore({
      yardSaleEvents: [{ id: 'event', data: legacy }],
      generalLocations: [{ id: 'city', data: catalog() }],
      generalLocationAliases: index ? [{ id: 'current', data: index }] : [],
    }));
    assert.equal(counts.unverifiedPublicLocations, 1);
    assert.equal(counts.catalogMatchedReviewUnverifiedLocations, 0);
  }
});

test('flags sensitive nested fields and GeoPoints without printing values', async () => {
  const records = [
    { nested: { lat: 29.99 } }, { nested: [{ lng: -94.01 }] },
    { point: new GeoPoint(29.99, -94.01) }, { legacyStreet: 'PRIVATE_ADDRESS_SENTINEL' },
    { location: 'PRIVATE_ADDRESS_SENTINEL' },
  ];
  const counts = await collectAuditCounts(readOnlyFirestore({
    yardSaleEvents: records.map((data, i) => ({ id: `e${i}`, data })),
  }));
  assert.equal(counts.publicDocumentsWithSensitiveLocationFields, 4);
  const output = formatSummary(staging, counts);
  for (const value of ['PRIVATE_ADDRESS_SENTINEL', '29.99', '-94.01']) {
    assert.equal(output.includes(value), false);
  }
});

test('checks event schema, owner identities and complete consent marker structure', async () => {
  const exact = event({ locationVisibility: 'exact' });
  const cases = [
    { public: exact, private: { userId: 'owner', address: 'private', addressRevision: 'revision' }, marker: marker(), valid: true },
    { public: exact, private: { userId: 'owner', address: 'private', addressRevision: 'revision' }, marker: marker({ operationId: undefined }) },
    { public: exact, private: { userId: 'owner', address: 'private', addressRevision: 'revision' }, marker: marker({ extra: true }) },
    { public: event({ locationVisibility: 'exact', userId: '' }), private: { userId: '', address: 'private', addressRevision: 'revision' }, marker: marker({ organizerUid: '' }) },
    { public: event({ locationVisibility: 'exact', itemCount: -1 }), private: { userId: 'owner', address: 'private', addressRevision: 'revision' }, marker: marker() },
    { public: exact, private: { userId: 'owner', address: 'private', addressRevision: 'revision' }, marker: marker({ addressRevision: 'other' }) },
    { public: exact, private: { userId: 'owner', address: 'private', addressRevision: 'revision' }, marker: marker({ grantedAt: 'not a timestamp' }) },
  ];
  const db = readOnlyFirestore({
    yardSaleEvents: cases.map((entry, i) => ({ id: `e${i}`, data: entry.public })),
    eventPrivate: cases.map((entry, i) => ({ id: `e${i}`, data: entry.private })),
    eventAddressConsent: cases.map((entry, i) => ({ id: `e${i}`, data: entry.marker })),
    generalLocations: [{ id: 'city', data: catalog() }],
  });
  const counts = await collectAuditCounts(db);
  assert.equal(counts.exactEventsPolicyStructurallyPlausible, 1);
  assert.equal(counts.exactEventsPolicyStructurallyInvalid, cases.length - 1);
  assert.equal(counts.exactEventsPotentiallyAnonymousReadable, 2);
  assert.equal(counts.exactEventsDefinitelyNotAnonymousReadable, cases.length - 2);
  assert.equal(counts.exactEventsPotentiallyReadableWithPolicyFailure, 1);
  assert.equal(counts.publicEventsFailingPolicySchema, 2);
  assert.equal(counts.eventPrivateOwnerMismatches, 1);
  assert.equal(counts.consentOrganizerMismatches, 1);
});

test('tracks Rules-permitted marker edge cases separately from stricter policy', async () => {
  const exact = event({ locationVisibility: 'exact' });
  const privateData = { userId: 'owner', address: 'private', addressRevision: 'revision' };
  const cases = [
    { event: exact, private: privateData, marker: marker({ operationId: '' }) },
    { event: exact, private: { ...privateData, addressRevision: '' }, marker: marker({ addressRevision: '' }) },
    { event: exact, private: { ...privateData, address: '   ' }, marker: marker() },
    { event: event({ locationVisibility: 'exact', userId: '' }),
      private: { ...privateData, userId: '' }, marker: marker({ organizerUid: '' }) },
    { event: exact, private: privateData, marker: marker() },
  ];
  const counts = await collectAuditCounts(readOnlyFirestore({
    yardSaleEvents: cases.map((entry, i) => ({ id: `e${i}`, data: entry.event })),
    eventPrivate: cases.map((entry, i) => ({ id: `e${i}`, data: entry.private })),
    eventAddressConsent: cases.map((entry, i) => ({ id: `e${i}`, data: entry.marker })),
    generalLocations: [{ id: 'city', data: catalog() }],
  }));
  assert.equal(counts.exactEventsPotentiallyAnonymousReadable, 5);
  assert.equal(counts.exactEventsDefinitelyNotAnonymousReadable, 0);
  assert.equal(counts.exactEventsPolicyStructurallyPlausible, 1);
  assert.equal(counts.exactEventsPolicyStructurallyInvalid, 4);
  assert.equal(counts.exactEventsPotentiallyReadableWithPolicyFailure, 4);
  assert.equal(counts.exactEventsWithoutNonblankPrivateAddress, 1);
});

test('owner-read conditions do not imply anonymous access', async () => {
  const counts = await collectAuditCounts(readOnlyFirestore({
    yardSaleEvents: [
      { id: 'general', data: event() },
      { id: 'exact-no-marker', data: event({ locationVisibility: 'exact' }) },
    ],
    eventPrivate: [
      { id: 'general', data: { userId: 'owner', address: 'private' } },
      { id: 'exact-no-marker', data: { userId: 'owner', address: 'private', addressRevision: 'r' } },
      { id: 'orphan', data: { userId: 'owner', address: 'private' } },
      { id: 'missing-owner', data: { address: 'private' } },
    ],
  }));
  assert.equal(counts.privateDocumentsWithOwnerReadCondition, 3);
  assert.equal(counts.exactEventsPotentiallyAnonymousReadable, 0);
  assert.equal(counts.exactEventsDefinitelyNotAnonymousReadable, 1);
  assert.equal(counts.orphanPrivateDocuments, 2);
});

test('ambiguous Firestore numeric types remain potentially readable, not proven', async () => {
  const counts = await collectAuditCounts(readOnlyFirestore({
    yardSaleEvents: [{ id: 'exact', data: event({
      locationVisibility: 'exact', itemCount: 0.0, eventVersion: 1.0,
    }) }],
    eventPrivate: [{ id: 'exact', data: {
      userId: 'owner', address: 'private', addressRevision: 'revision',
    } }],
    eventAddressConsent: [{ id: 'exact', data: marker() }],
    generalLocations: [{ id: 'city', data: catalog() }],
  }));
  assert.equal(counts.exactEventsPotentiallyAnonymousReadable, 1);
  assert.equal(counts.exactEventsDefinitelyNotAnonymousReadable, 0);
  assert.equal(Object.hasOwn(counts, 'exactEventsConfirmedAnonymousReadable'), false);
});

test('non-ASCII length ambiguity never proves anonymous access denied', async () => {
  const counts = await collectAuditCounts(readOnlyFirestore({
    yardSaleEvents: [{ id: 'exact', data: event({
      locationVisibility: 'exact', title: '😀'.repeat(100),
    }) }],
    eventPrivate: [{ id: 'exact', data: {
      userId: 'owner', address: 'private', addressRevision: 'revision',
    } }],
    eventAddressConsent: [{ id: 'exact', data: marker() }],
    generalLocations: [{ id: 'city', data: catalog() }],
  }));
  assert.equal(counts.exactEventsPotentiallyAnonymousReadable, 1);
  assert.equal(counts.exactEventsDefinitelyNotAnonymousReadable, 0);
  assert.equal(counts.exactEventsPotentiallyReadableWithPolicyFailure, 1);
});

test('catalog review flags do not establish independently reviewed approval', async () => {
  const data = event({ location: 'Building A, Apartment 5' });
  const counts = await collectAuditCounts(readOnlyFirestore({
    yardSaleEvents: [{ id: 'event', data }],
    generalLocations: [{ id: 'city', data: catalog({
      displayName: data.location, reviewed: true,
    }) }],
  }));
  assert.equal(counts.catalogMatchedReviewUnverifiedLocations, 0);
  assert.equal(counts.unverifiedPublicLocations, 1);
  assert.equal(Object.hasOwn(counts, 'approvedPublicLocations'), false);
  const matched = await collectAuditCounts(readOnlyFirestore({
    yardSaleEvents: [{ id: 'event', data }],
    generalLocations: [{ id: 'city', data: catalog({ displayName: data.location }) }],
  }));
  assert.equal(matched.catalogMatchedReviewUnverifiedLocations, 1);
  assert.equal(Object.hasOwn(matched, 'approvedPublicLocations'), false);
});

test('reports general markers as present rather than asserting consent validity', async () => {
  const counts = await collectAuditCounts(readOnlyFirestore({
    yardSaleEvents: [{ id: 'e', data: event() }],
    eventAddressConsent: [{ id: 'e', data: {} }],
    generalLocations: [{ id: 'city', data: catalog() }],
  }));
  assert.equal(counts.generalEventsWithConsentMarker, 1);
  assert.equal(Object.hasOwn(counts, 'generalEventsWithActiveConsent'), false);
});

test('public event date validation preserves Firestore nanosecond precision', async () => {
  const counts = await collectAuditCounts(readOnlyFirestore({
    yardSaleEvents: [
      { id: 'valid', data: event({
        startDate: new Timestamp(1, 1), endDate: new Timestamp(1, 2),
      }) },
      { id: 'invalid', data: event({
        startDate: new Timestamp(1, 2), endDate: new Timestamp(1, 1),
      }) },
    ],
    generalLocations: [{ id: 'city', data: catalog() }],
  }));
  assert.equal(counts.publicEventsFailingPolicySchema, 1);
});

test('error output never exposes argument values or untrusted error codes', () => {
  const secret = 'PRIVATE_ADDRESS_AND_EVENT_ID_SENTINEL';
  const result = spawnSync(process.execPath, [
    path.join(__dirname, '../scripts/audit-production-events.cjs'),
    '--project', secret, productionConfirmation,
  ], { encoding: 'utf8' });
  assert.equal(result.status, 2);
  assert.match(result.stderr, /Unsupported Firebase project ID/);
  assert.equal(result.stderr.includes(secret), false);
  assert.equal(result.stdout.includes(secret), false);
  assert.equal(safeFailureMessage({ code: secret, message: secret }),
    'Read-only event audit failed (unknown).');
  assert.equal(safeFailureMessage({ code: 'permission-denied', message: secret }),
    'Read-only event audit failed (permission-denied).');
});

test('a failed Firestore read prints no error payload or user data', async () => {
  const secret = 'PRIVATE_ADDRESS_OR_EVENT_ID_SENTINEL';
  const errors = [];
  const output = [];
  const moduleObject = { exports: {} };
  const fakeProcess = {
    argv: ['node', 'audit', '--project', staging, stagingConfirmation],
    env: {},
    exitCode: 0,
  };
  const firestore = require('firebase-admin/firestore');
  const fakeRequire = name => {
    if (name === 'firebase-admin/app') return { initializeApp() {} };
    if (name === 'firebase-admin/firestore') return {
      ...firestore,
      getFirestore: () => ({
        collection() {
          throw Object.assign(new Error(secret), { code: secret });
        },
      }),
    };
    throw new Error('Unexpected import');
  };
  fakeRequire.main = moduleObject;
  const source = fs.readFileSync(
    path.join(__dirname, '../scripts/audit-production-events.cjs'), 'utf8',
  );
  vm.runInNewContext(source, {
    require: fakeRequire, module: moduleObject, process: fakeProcess,
    console: { error: value => errors.push(value), log: value => output.push(value) },
  });
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(fakeProcess.exitCode, 1);
  assert.deepEqual(errors, ['Read-only event audit failed (unknown).']);
  assert.deepEqual(output, []);
  assert.equal(errors.join('').includes(secret), false);
});

test('tracked Rules agree with representative conservative assessments', {
  skip: !/^127\.0\.0\.1:\d+$/.test(process.env.FIRESTORE_EMULATOR_HOST ?? ''),
}, async () => {
  const { initializeTestEnvironment, assertFails, assertSucceeds } =
    require('@firebase/rules-unit-testing');
  const client = require('firebase/firestore');
  const rules = fs.readFileSync(path.join(__dirname, '../../firestore.rules'), 'utf8');
  const environment = await initializeTestEnvironment({
    projectId: `demo-audit-${randomUUID().replaceAll('-', '').slice(0, 12)}`,
    firestore: { rules },
  });
  const prefix = `audit-parity-${randomUUID()}`;
  const exact = event({ locationVisibility: 'exact' });
  const privateData = { userId: 'owner', address: 'private', addressRevision: 'revision' };
  const cases = [
    { event: exact, private: privateData, marker: marker(), readable: true },
    { event: exact, private: privateData, marker: marker({ operationId: '' }), readable: true },
    { event: exact, private: { ...privateData, addressRevision: '' }, marker: marker({ addressRevision: '' }), readable: true },
    { event: exact, private: { ...privateData, address: '   ' }, marker: marker(), readable: true },
    { event: event({ locationVisibility: 'exact', userId: '' }),
      private: { ...privateData, userId: '' }, marker: marker({ organizerUid: '' }), readable: true },
    { event: exact, private: privateData, readable: false },
    { event: exact, private: privateData, marker: marker({ extra: true }), readable: false },
    { event: event(), private: { userId: 'owner', address: 'private' }, readable: false, ownerReadable: true },
  ];
  const fixtures = {
    yardSaleEvents: [],
    eventPrivate: [],
    eventAddressConsent: [],
    generalLocations: [{ id: 'city', data: catalog() }],
  };
  const toClientTimestamp = value =>
    new client.Timestamp(value.seconds, value.nanoseconds);
  try {
    await environment.withSecurityRulesDisabled(async context => {
      const db = context.firestore();
      for (let i = 0; i < cases.length; i++) {
        const id = `${prefix}-${i}`;
        const item = cases[i];
        fixtures.yardSaleEvents.push({ id, data: item.event });
        fixtures.eventPrivate.push({ id, data: item.private });
        const publicData = { ...item.event };
        for (const field of ['startDate', 'endDate', 'createdAt', 'updatedAt']) {
          publicData[field] = toClientTimestamp(publicData[field]);
        }
        await client.setDoc(client.doc(db, 'yardSaleEvents', id), publicData);
        await client.setDoc(client.doc(db, 'eventPrivate', id), item.private);
        if (item.marker) {
          fixtures.eventAddressConsent.push({ id, data: item.marker });
          await client.setDoc(client.doc(db, 'eventAddressConsent', id), {
            ...item.marker, grantedAt: toClientTimestamp(item.marker.grantedAt),
          });
        }
      }
    });
    const anonymous = environment.unauthenticatedContext().firestore();
    const owner = environment.authenticatedContext('owner').firestore();
    for (let i = 0; i < cases.length; i++) {
      const ref = client.doc(anonymous, 'eventPrivate', `${prefix}-${i}`);
      if (cases[i].readable) await assertSucceeds(client.getDoc(ref));
      else await assertFails(client.getDoc(ref));
      if (cases[i].ownerReadable) {
        await assertSucceeds(client.getDoc(client.doc(owner, 'eventPrivate', `${prefix}-${i}`)));
      }
    }
    const counts = await collectAuditCounts(readOnlyFirestore(fixtures));
    assert.equal(counts.exactEventsPotentiallyAnonymousReadable, 5);
    assert.equal(counts.exactEventsDefinitelyNotAnonymousReadable, 2);
    assert.equal(counts.exactEventsPotentiallyReadableWithPolicyFailure, 4);
  } finally {
    try {
      await environment.withSecurityRulesDisabled(async context => {
        const db = context.firestore();
        for (let i = 0; i < cases.length; i++) {
          const id = `${prefix}-${i}`;
          for (const name of ['yardSaleEvents', 'eventPrivate', 'eventAddressConsent']) {
            await client.deleteDoc(client.doc(db, name, id));
          }
        }
      });
    } finally {
      await environment.cleanup();
    }
  }
});
