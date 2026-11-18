import { FieldPath, Timestamp, type DocumentData } from 'firebase-admin/firestore';
import { buildPublicEventProjection } from './public-event-projection-builder';
import { validCatalogLocation } from './location-catalog';

const PAGE_SIZE = 100;
const LOCATION_ID_PATTERN = /^[a-z0-9][a-z0-9_-]{0,63}$/;
const SENSITIVE_FIELD = /(address|latitude|longitude|coordinates?|geopoint|street|(?:^|[_-])(lat|lng|lon)(?:$|[_-]))/i;
const PROJECTION_FIELDS = [
  'schemaVersion', 'title', 'description', 'location', 'locationId',
  'locationVisibility', 'startDate', 'endDate', 'photoURL', 'createdAt',
  'updatedAt', 'itemCount',
];

interface AuditDocumentSnapshot {
  id: string;
  exists: boolean;
  data(): DocumentData | undefined;
}

interface AuditQuerySnapshot {
  docs: AuditDocumentSnapshot[];
  empty: boolean;
}

interface AuditQuery {
  orderBy(field: FieldPath): AuditQuery;
  limit(amount: number): AuditQuery;
  startAfter(snapshot: AuditDocumentSnapshot): AuditQuery;
  get(): Promise<AuditQuerySnapshot>;
}

interface AuditDocumentReference {
  get(): Promise<AuditDocumentSnapshot>;
}

interface AuditCollectionReference {
  doc(id: string): AuditDocumentReference;
  orderBy(field: FieldPath): AuditQuery;
}

export interface ReadOnlyProjectionAuditStore {
  collection(name: string): AuditCollectionReference;
}

export interface ProjectionCoverageReport {
  scanCompleted: true;
  scanConsistency: 'best-effort-non-atomic';
  totalCatalogRecords: number;
  malformedCatalogRecords: number;
  inactiveCatalogRecords: number;
  totalSourceEvents: number;
  structurallyEligibleEvents: number;
  publicationApprovedEvents: 0;
  validExistingProjections: number;
  missingProjections: number;
  staleProjections: number;
  malformedProjections: number;
  projectionsWithSensitiveFieldNames: number;
  orphanedProjections: number;
  invalidLocationReferences: number;
  inactiveLocationReferences: number;
  legacyOrMalformedSourceEvents: number;
  manualReviewRequiredEvents: number;
  proposedActions: {
    removeMalformedOrSensitive: number;
    removeOrphaned: number;
    reviewBeforeCreate: number;
    reviewBeforeUpdate: number;
  };
}

function isRecord(value: unknown): value is DocumentData {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function hasValidCatalogStructure(value: unknown): value is DocumentData {
  if (!isRecord(value) || typeof value.active !== 'boolean') return false;
  return validCatalogLocation(
    { ...value, active: true },
    typeof value.displayName === 'string' ? value.displayName : '',
  );
}

function containsSensitiveField(value: unknown, seen = new Set<object>()): boolean {
  if (!isRecord(value) && !Array.isArray(value)) return false;
  if (seen.has(value)) return false;
  seen.add(value);
  if (Array.isArray(value)) return value.some(item => containsSensitiveField(item, seen));
  return Object.entries(value).some(([key, item]) =>
    SENSITIVE_FIELD.test(key) || containsSensitiveField(item, seen));
}

function valuesEqual(left: unknown, right: unknown): boolean {
  if (left === right) return true;
  if (left && typeof left === 'object' && right && typeof right === 'object') {
    if ('isEqual' in left && typeof left.isEqual === 'function') {
      return left.isEqual(right);
    }
    if (Array.isArray(left) || Array.isArray(right)) {
      return Array.isArray(left) && Array.isArray(right) &&
        left.length === right.length &&
        left.every((item, index) => valuesEqual(item, right[index]));
    }
    const leftKeys = Object.keys(left);
    const rightKeys = Object.keys(right);
    return leftKeys.length === rightKeys.length &&
      leftKeys.every(key =>
        Object.hasOwn(right, key) &&
        valuesEqual((left as Record<string, unknown>)[key], (right as Record<string, unknown>)[key]));
  }
  return false;
}

function hasValidProjectionShape(projection: DocumentData): boolean {
  const keys = Object.keys(projection);
  return keys.length === PROJECTION_FIELDS.length &&
    PROJECTION_FIELDS.every(key => Object.hasOwn(projection, key)) &&
    projection.schemaVersion === 1 &&
    typeof projection.title === 'string' &&
    projection.title.length > 0 &&
    projection.title.length <= 120 &&
    typeof projection.description === 'string' &&
    projection.description.length <= 5000 &&
    typeof projection.location === 'string' &&
    projection.location.length > 0 &&
    projection.location.length <= 200 &&
    typeof projection.locationId === 'string' &&
    LOCATION_ID_PATTERN.test(projection.locationId) &&
    (projection.locationVisibility === 'general' ||
      projection.locationVisibility === 'exact') &&
    projection.startDate instanceof Timestamp &&
    projection.endDate instanceof Timestamp &&
    projection.endDate.toMillis() > projection.startDate.toMillis() &&
    (projection.photoURL === null ||
      (typeof projection.photoURL === 'string' && projection.photoURL.length <= 2048)) &&
    projection.createdAt instanceof Timestamp &&
    projection.updatedAt instanceof Timestamp &&
    Number.isSafeInteger(projection.itemCount) &&
    projection.itemCount >= 0;
}

function projectionStatus(
  projection: DocumentData,
  expected: DocumentData | null,
): 'valid' | 'stale' | 'malformed' | 'sensitive' {
  if (containsSensitiveField(projection)) return 'sensitive';
  if (!hasValidProjectionShape(projection)) return 'malformed';
  if (!expected || !valuesEqual(projection, expected)) return 'stale';
  return 'valid';
}

async function forEachPage(
  store: ReadOnlyProjectionAuditStore,
  collection: string,
  visit: (document: AuditDocumentSnapshot) => Promise<void>,
): Promise<void> {
  let cursor: AuditDocumentSnapshot | undefined;
  while (true) {
    let query = store.collection(collection)
      .orderBy(FieldPath.documentId())
      .limit(PAGE_SIZE);
    if (cursor) query = query.startAfter(cursor);
    const page = await query.get();
    for (const document of page.docs) await visit(document);
    if (page.empty || page.docs.length < PAGE_SIZE) return;
    cursor = page.docs[page.docs.length - 1];
  }
}

export async function auditPublicEventProjections(
  store: ReadOnlyProjectionAuditStore,
): Promise<ProjectionCoverageReport> {
  const counts = {
    totalCatalogRecords: 0,
    malformedCatalogRecords: 0,
    inactiveCatalogRecords: 0,
    totalSourceEvents: 0,
    structurallyEligibleEvents: 0,
    validExistingProjections: 0,
    missingProjections: 0,
    staleProjections: 0,
    malformedProjections: 0,
    projectionsWithSensitiveFieldNames: 0,
    orphanedProjections: 0,
    invalidLocationReferences: 0,
    inactiveLocationReferences: 0,
    legacyOrMalformedSourceEvents: 0,
    manualReviewRequiredEvents: 0,
    proposedActions: {
      removeMalformedOrSensitive: 0,
      removeOrphaned: 0,
      reviewBeforeCreate: 0,
      reviewBeforeUpdate: 0,
    },
  };
  const locations = new Map<string, Promise<AuditDocumentSnapshot>>();
  const sourceCollection = store.collection('yardSaleEvents');
  const projectionCollection = store.collection('publicYardSaleEvents');
  const catalogCollection = store.collection('generalLocations');

  await forEachPage(store, 'generalLocations', async catalogSnapshot => {
    counts.totalCatalogRecords++;
    const catalog = catalogSnapshot.data();
    if (!hasValidCatalogStructure(catalog)) counts.malformedCatalogRecords++;
    if (isRecord(catalog) && catalog.active === false) counts.inactiveCatalogRecords++;
  });

  await forEachPage(store, 'yardSaleEvents', async sourceSnapshot => {
    counts.totalSourceEvents++;
    counts.manualReviewRequiredEvents++;
    const source = sourceSnapshot.data();
    const locationId = source?.locationId;
    let catalog: DocumentData | undefined;
    let locationIsInactive = false;

    if (typeof locationId === 'string' && LOCATION_ID_PATTERN.test(locationId)) {
      let locationPromise = locations.get(locationId);
      if (!locationPromise) {
        locationPromise = catalogCollection.doc(locationId).get();
        locations.set(locationId, locationPromise);
      }
      const locationSnapshot = await locationPromise;
      catalog = locationSnapshot.data();
      locationIsInactive = catalog?.active === false;
      if (!locationSnapshot.exists || !validCatalogLocation(catalog, String(source?.location ?? ''))) {
        counts.invalidLocationReferences++;
      }
      if (locationIsInactive) counts.inactiveLocationReferences++;
    } else {
      counts.invalidLocationReferences++;
    }

    const expected = buildPublicEventProjection(source, catalog);
    if (!expected) {
      counts.legacyOrMalformedSourceEvents++;
    } else {
      counts.structurallyEligibleEvents++;
    }

    const projectionSnapshot = await projectionCollection.doc(sourceSnapshot.id).get();
    if (!projectionSnapshot.exists) {
      if (expected) {
        counts.missingProjections++;
        counts.proposedActions.reviewBeforeCreate++;
      }
      return;
    }

    const projection = projectionSnapshot.data();
    if (!projection) {
      counts.malformedProjections++;
      counts.proposedActions.removeMalformedOrSensitive++;
      return;
    }
    const status = projectionStatus(projection, expected);
    if (status === 'valid') counts.validExistingProjections++;
    if (status === 'stale') {
      counts.staleProjections++;
      counts.proposedActions.reviewBeforeUpdate++;
    }
    if (status === 'malformed') {
      counts.malformedProjections++;
      counts.proposedActions.removeMalformedOrSensitive++;
    }
    if (status === 'sensitive') {
      counts.projectionsWithSensitiveFieldNames++;
      counts.proposedActions.removeMalformedOrSensitive++;
    }
  });

  await forEachPage(store, 'publicYardSaleEvents', async projectionSnapshot => {
    const sourceSnapshot = await sourceCollection.doc(projectionSnapshot.id).get();
    if (!sourceSnapshot.exists) {
      counts.orphanedProjections++;
      counts.proposedActions.removeOrphaned++;
      const projection = projectionSnapshot.data();
      if (projection && containsSensitiveField(projection)) {
        counts.projectionsWithSensitiveFieldNames++;
      } else if (projection && !hasValidProjectionShape(projection)) {
        counts.malformedProjections++;
      }
    }
  });

  return {
    scanCompleted: true,
    scanConsistency: 'best-effort-non-atomic',
    publicationApprovedEvents: 0,
    ...counts,
  };
}

export function formatProjectionCoverageReport(
  projectId: string,
  report: ProjectionCoverageReport,
): string {
  return JSON.stringify({ projectId, readOnly: true, ...report }, null, 2);
}
