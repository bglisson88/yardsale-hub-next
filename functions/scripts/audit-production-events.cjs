const { initializeApp } = require('firebase-admin/app');
const {
  FieldPath,
  GeoPoint,
  Timestamp,
  getFirestore,
} = require('firebase-admin/firestore');

const PROJECT_ID = 'yardsale-hub-93c49';
const PAGE_SIZE = 400;
const SENSITIVE_FIELD = /(address|latitude|longitude|coordinates?|geopoint|street)/i;

function usage() {
  console.error(
    'Usage: node functions/scripts/audit-production-events.cjs --project yardsale-hub-93c49 --confirm-read-only-production-audit',
  );
  process.exitCode = 2;
}

function containsSensitiveLocation(value, seen = new Set()) {
  if (value instanceof GeoPoint) return true;
  if (!value || typeof value !== 'object' || seen.has(value)) return false;
  seen.add(value);
  if (Array.isArray(value)) {
    return value.some(item => containsSensitiveLocation(item, seen));
  }
  return Object.entries(value).some(([key, item]) =>
    SENSITIVE_FIELD.test(key) || containsSensitiveLocation(item, seen));
}

async function readCollection(db, name, onDocument) {
  let lastDocument = null;
  for (;;) {
    let query = db.collection(name)
      .orderBy(FieldPath.documentId())
      .limit(PAGE_SIZE);
    if (lastDocument) query = query.startAfter(lastDocument);
    const snapshot = await query.get();
    if (snapshot.empty) return;
    for (const document of snapshot.docs) onDocument(document);
    lastDocument = snapshot.docs[snapshot.docs.length - 1];
    if (snapshot.size < PAGE_SIZE) return;
  }
}

async function main() {
  const projectIndex = process.argv.indexOf('--project');
  if (
    process.argv[projectIndex + 1] !== PROJECT_ID ||
    !process.argv.includes('--confirm-read-only-production-audit') ||
    process.env.FIRESTORE_EMULATOR_HOST ||
    (process.env.GCLOUD_PROJECT && process.env.GCLOUD_PROJECT !== PROJECT_ID)
  ) {
    usage();
    return;
  }

  initializeApp({ projectId: PROJECT_ID });
  const db = getFirestore();
  const events = new Map();
  const privateEvents = new Map();
  const consentMarkers = new Map();
  const counts = {
    eventDocuments: 0,
    generalEvents: 0,
    exactEvents: 0,
    unknownVisibilityEvents: 0,
    publicDocumentsWithSensitiveLocationFields: 0,
    privateDocuments: 0,
    privateDocumentsWithAddress: 0,
    orphanPrivateDocuments: 0,
    eventPrivateOwnerMismatches: 0,
    exactEventsMissingPrivateAddress: 0,
    exactEventsWithoutValidConsent: 0,
    consentMarkers: 0,
    orphanConsentMarkers: 0,
    consentOrganizerMismatches: 0,
    generalEventsWithActiveConsent: 0,
  };

  await readCollection(db, 'yardSaleEvents', document => {
    const data = document.data();
    counts.eventDocuments += 1;
    if (data.locationVisibility === 'general') counts.generalEvents += 1;
    else if (data.locationVisibility === 'exact') counts.exactEvents += 1;
    else counts.unknownVisibilityEvents += 1;
    if (containsSensitiveLocation(data)) {
      counts.publicDocumentsWithSensitiveLocationFields += 1;
    }
    events.set(document.id, {
      userId: typeof data.userId === 'string' ? data.userId : null,
      locationVisibility: data.locationVisibility,
    });
  });

  await readCollection(db, 'eventPrivate', document => {
    const data = document.data();
    counts.privateDocuments += 1;
    if (typeof data.address === 'string' && data.address.trim()) {
      counts.privateDocumentsWithAddress += 1;
    }
    privateEvents.set(document.id, {
      userId: typeof data.userId === 'string' ? data.userId : null,
      hasAddress: typeof data.address === 'string' && data.address.trim().length > 0,
      addressRevision: typeof data.addressRevision === 'string'
        ? data.addressRevision
        : null,
    });
  });

  await readCollection(db, 'eventAddressConsent', document => {
    const data = document.data();
    counts.consentMarkers += 1;
    consentMarkers.set(document.id, {
      organizerUid: typeof data.organizerUid === 'string' ? data.organizerUid : null,
      consentVersion: data.consentVersion,
      addressRevision: typeof data.addressRevision === 'string'
        ? data.addressRevision
        : null,
      grantedAt: data.grantedAt instanceof Timestamp,
    });
  });

  for (const [eventId, event] of events) {
    const privateEvent = privateEvents.get(eventId);
    const marker = consentMarkers.get(eventId);
    if (privateEvent && privateEvent.userId !== event.userId) {
      counts.eventPrivateOwnerMismatches += 1;
    }
    if (event.locationVisibility === 'exact') {
      if (!privateEvent?.hasAddress) counts.exactEventsMissingPrivateAddress += 1;
      if (
        !privateEvent?.hasAddress ||
        !marker ||
        marker.organizerUid !== event.userId ||
        marker.organizerUid !== privateEvent.userId ||
        marker.consentVersion !== 'exact-address-v1' ||
        !marker.addressRevision ||
        marker.addressRevision !== privateEvent.addressRevision ||
        !marker.grantedAt
      ) {
        counts.exactEventsWithoutValidConsent += 1;
      }
    }
    if (event.locationVisibility === 'general' && marker) {
      counts.generalEventsWithActiveConsent += 1;
    }
  }

  for (const eventId of privateEvents.keys()) {
    if (!events.has(eventId)) counts.orphanPrivateDocuments += 1;
  }
  for (const eventId of consentMarkers.keys()) {
    if (!events.has(eventId)) counts.orphanConsentMarkers += 1;
    else if (events.get(eventId).userId !== consentMarkers.get(eventId).organizerUid) {
      counts.consentOrganizerMismatches += 1;
    }
  }

  console.log(JSON.stringify({
    projectId: PROJECT_ID,
    readOnly: true,
    counts,
  }, null, 2));
}

main().catch(error => {
  const code = error && typeof error.code === 'string' ? error.code : 'unknown';
  console.error(`Read-only production event audit failed (${code}).`);
  process.exitCode = 1;
});
