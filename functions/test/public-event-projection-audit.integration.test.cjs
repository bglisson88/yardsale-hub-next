const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { after, afterEach, before, test } = require('node:test');
const { deleteApp, initializeApp } = require('firebase-admin/app');
const { FieldPath, getFirestore, Timestamp } = require('firebase-admin/firestore');

const PROJECT_ID = 'demo-yardsale-hub';
const EMULATOR_HOST = '127.0.0.1:8080';
const HOSTS = {
  FIREBASE_AUTH_EMULATOR_HOST: '127.0.0.1:9099',
  FIRESTORE_EMULATOR_HOST: EMULATOR_HOST,
  FIREBASE_STORAGE_EMULATOR_HOST: '127.0.0.1:9199',
  FIREBASE_DATABASE_EMULATOR_HOST: '127.0.0.1:9000',
  FIREBASE_EMULATOR_HUB: '127.0.0.1:4400',
  FUNCTIONS_EMULATOR_HOST: '127.0.0.1:5001',
};

assert.equal(process.env.GCLOUD_PROJECT, PROJECT_ID);
if (process.env.GOOGLE_CLOUD_PROJECT) {
  assert.equal(process.env.GOOGLE_CLOUD_PROJECT, PROJECT_ID);
}
for (const [name, host] of Object.entries(HOSTS)) {
  if (process.env[name]) assert.equal(process.env[name], host);
}
assert.equal(process.env.FIRESTORE_EMULATOR_HOST, EMULATOR_HOST);
assert.equal(process.env.GOOGLE_APPLICATION_CREDENTIALS, undefined);
if (process.env.FIREBASE_CONFIG) {
  assert.equal(JSON.parse(process.env.FIREBASE_CONFIG).projectId, PROJECT_ID);
}

process.env.YSH_EXPECTED_PROJECT_ID = PROJECT_ID;
process.env.YSH_FUNCTIONS_MODE = 'emulator';
process.env.YSH_FUNCTIONS_REGION = 'us-south1';
process.env.YSH_FUNCTIONS_MAX_INSTANCES = '2';
process.env.YSH_FUNCTIONS_CONCURRENCY = '10';
process.env.YSH_FUNCTIONS_TIMEOUT_SECONDS = '30';
process.env.YSH_FUNCTIONS_MEMORY = '256MiB';
process.env.YSH_FUNCTIONS_MIN_INSTANCES = '0';
delete process.env.YSH_FUNCTIONS_SERVICE_ACCOUNT;

const { auditPublicEventProjections } = require('../lib/public-event-projection-audit.js');
const { buildPublicEventProjection } = require('../lib/public-event-projection.js');
const { readOnlyStore } = require('../scripts/audit-public-event-projections.cjs');

const START = Timestamp.fromDate(new Date('2026-11-20T09:00:00Z'));
const END = Timestamp.fromDate(new Date('2026-11-20T12:00:00Z'));
const CREATED = Timestamp.fromDate(new Date('2026-11-01T10:00:00Z'));
const PREFIX = `pa-${randomUUID().replaceAll('-', '').slice(0, 8)}-`;
const trackedReferences = [];
let app;
let firestore;

function catalog(id, overrides = {}) {
  return {
    kind: 'city',
    displayName: `City ${id}`,
    active: true,
    approvedAliases: [],
    countryCode: 'US',
    regionCode: 'TX',
    ...overrides,
  };
}

function source(locationId, overrides = {}) {
  const document = {
    userId: 'synthetic-owner',
    title: 'Synthetic sale',
    description: 'Emulator fixture only',
    location: `City ${locationId}`,
    locationId,
    locationVisibility: 'general',
    startDate: START,
    endDate: END,
    photoURL: null,
    createdAt: CREATED,
    updatedAt: CREATED,
    itemCount: 0,
    ...overrides,
  };
  if (document.locationId === undefined) delete document.locationId;
  return document;
}

function ref(collection, id) {
  const document = firestore.collection(collection).doc(id);
  trackedReferences.push(document);
  return document;
}

async function writeRows(rows) {
  for (let offset = 0; offset < rows.length; offset += 400) {
    const batch = firestore.batch();
    for (const [collection, id, data] of rows.slice(offset, offset + 400)) {
      batch.set(ref(collection, id), data);
    }
    await batch.commit();
  }
}

function storeWithQueryHook(onQuery) {
  const base = readOnlyStore(firestore);

  function wrapQuery(query, collection) {
    return {
      orderBy: field => wrapQuery(query.orderBy(field), collection),
      limit: amount => wrapQuery(query.limit(amount), collection),
      startAfter: snapshot => wrapQuery(query.startAfter(snapshot), collection),
      get: async () => {
        const page = await query.get();
        await onQuery?.(collection, page);
        return page;
      },
    };
  }

  return {
    collection(name) {
      const collectionRef = base.collection(name);
      return {
        doc: id => collectionRef.doc(id),
        orderBy: field => wrapQuery(collectionRef.orderBy(field), name),
      };
    },
  };
}

async function seedCoverageData() {
  const rows = [];
  for (let index = 0; index < 105; index++) {
    const suffix = String(index).padStart(3, '0');
    const eventId = `${PREFIX}event-${suffix}`;
    const locationId = `${PREFIX}location-${suffix}`;
    if (index !== 5) {
      const place = catalog(locationId, index === 4 ? { active: false } : {});
      if (index === 6) place.unexpected = true;
      rows.push(['generalLocations', locationId, place]);
    }
    rows.push([
      'yardSaleEvents',
      eventId,
      index === 7 ? source(undefined, { locationId: undefined }) : source(locationId),
    ]);

    if (![2, 5, 6, 7].includes(index)) {
      const expected = buildPublicEventProjection(
        index === 7 ? source(undefined, { locationId: undefined }) : source(locationId),
        catalog(locationId),
      );
      const projection = index === 1
        ? { ...expected, title: 'Stale synthetic title' }
        : index === 3
          ? { ...expected, unexpected: true }
          : expected;
      rows.push(['publicYardSaleEvents', eventId, projection]);
    }
  }
  rows.push([
    'generalLocations',
    `${PREFIX}location-unreferenced`,
    catalog(`${PREFIX}location-unreferenced`),
  ]);
  rows.push([
    'publicYardSaleEvents',
    `${PREFIX}orphan`,
    { synthetic: true },
  ]);
  await writeRows(rows);
}

before(() => {
  app = initializeApp({ projectId: PROJECT_ID }, `projection-audit-${randomUUID()}`);
  firestore = getFirestore(app);
});

afterEach(async () => {
  for (let offset = 0; offset < trackedReferences.length; offset += 400) {
    const batch = firestore.batch();
    for (const document of trackedReferences.slice(offset, offset + 400)) {
      batch.delete(document);
    }
    if (trackedReferences.length) await batch.commit();
  }
  trackedReferences.length = 0;
});

after(async () => {
  if (app) await deleteApp(app);
});

test('empty emulator collections return a completed, explicitly non-atomic report', async () => {
  const report = await auditPublicEventProjections(readOnlyStore(firestore));
  assert.equal(report.scanCompleted, true);
  assert.equal(report.scanConsistency, 'best-effort-non-atomic');
  assert.equal(report.totalCatalogRecords, 0);
  assert.equal(report.totalSourceEvents, 0);
  assert.equal(report.validExistingProjections, 0);
});

test('emulator audit paginates and classifies synthetic coverage records', async () => {
  await seedCoverageData();
  const adapter = readOnlyStore(firestore);
  let cursor;
  const ids = [];
  while (true) {
    let query = adapter.collection('generalLocations')
      .orderBy(FieldPath.documentId())
      .limit(25);
    if (cursor) query = query.startAfter(cursor);
    const page = await query.get();
    ids.push(...page.docs.map(document => document.id));
    if (page.empty || page.docs.length < 25) break;
    cursor = page.docs[page.docs.length - 1];
  }
  assert.equal(ids.length, 105);
  assert.equal(new Set(ids).size, ids.length);
  assert.deepEqual(ids, [...ids].sort());

  const report = await auditPublicEventProjections(adapter);
  assert.equal(report.scanCompleted, true);
  assert.equal(report.scanConsistency, 'best-effort-non-atomic');
  assert.equal(report.totalCatalogRecords, 105);
  assert.equal(report.malformedCatalogRecords, 1);
  assert.equal(report.inactiveCatalogRecords, 1);
  assert.equal(report.totalSourceEvents, 105);
  assert.equal(report.structurallyEligibleEvents, 101);
  assert.equal(report.publicationApprovedEvents, 0);
  assert.equal(report.validExistingProjections, 98);
  assert.equal(report.missingProjections, 1);
  assert.equal(report.staleProjections, 2);
  // Malformed and orphaned classifications overlap for the malformed orphan fixture.
  assert.equal(report.malformedProjections, 2);
  assert.equal(report.orphanedProjections, 1);
  assert.equal(report.invalidLocationReferences, 4);
  assert.equal(report.inactiveLocationReferences, 1);
  assert.equal(report.legacyOrMalformedSourceEvents, 4);
  assert.equal(report.manualReviewRequiredEvents, 105);
});

test('a concurrent insert during pagination remains explicitly non-atomic', async () => {
  const rows = Array.from({ length: 101 }, (_, index) => {
    const id = `${PREFIX}catalog-${String(index).padStart(3, '0')}`;
    return ['generalLocations', id, catalog(id)];
  });
  await writeRows(rows);
  let inserted = false;
  const store = storeWithQueryHook(async (collection, page) => {
    if (collection === 'generalLocations' && page.docs.length === 100 && !inserted) {
      inserted = true;
      const id = `${PREFIX}catalog-late`;
      await ref('generalLocations', id).set(catalog(id));
    }
  });

  const report = await auditPublicEventProjections(store);
  assert.equal(report.totalCatalogRecords, 102);
  assert.equal(report.scanCompleted, true);
  assert.equal(report.scanConsistency, 'best-effort-non-atomic');
});

test('a page read failure rejects without returning a completed report', async () => {
  await writeRows(Array.from({ length: 101 }, (_, index) => {
    const id = `${PREFIX}catalog-${String(index).padStart(3, '0')}`;
    return ['generalLocations', id, catalog(id)];
  }));
  let pageReads = 0;
  const store = storeWithQueryHook(collection => {
    if (collection === 'generalLocations' && ++pageReads === 2) {
      throw new Error('synthetic emulator page failure');
    }
  });

  await assert.rejects(
    auditPublicEventProjections(store),
    /synthetic emulator page failure/,
  );
});
