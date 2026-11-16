const { initializeApp } = require('firebase-admin/app');
const {
  FieldPath,
  GeoPoint,
  Timestamp,
  getFirestore,
} = require('firebase-admin/firestore');

const AUDIT_PROJECTS = Object.freeze({
  'yardsale-hub-93c49': '--confirm-read-only-production-audit',
  'yardsale-hub-staging': '--confirm-read-only-staging-audit',
});
const CONFIRMATION_FLAGS = new Set(Object.values(AUDIT_PROJECTS));
const PAGE_SIZE = 400;
const SENSITIVE_FIELD = /(address|latitude|longitude|coordinates?|geopoint|street)/i;

function validateAuditArguments(args, env = process.env) {
  const projectPositions = args.flatMap((argument, index) =>
    argument === '--project' ? [index] : []);
  if (projectPositions.length !== 1) {
    return { error: 'Provide exactly one --project argument.' };
  }

  const projectIndex = projectPositions[0];
  const projectId = args[projectIndex + 1];
  if (!Object.hasOwn(AUDIT_PROJECTS, projectId)) {
    return {
      error: `Unsupported Firebase project ID "${String(projectId)}".`,
    };
  }

  const suppliedConfirmations = args.filter(argument =>
    CONFIRMATION_FLAGS.has(argument));
  if (suppliedConfirmations.length !== 1) {
    return {
      error: 'Provide exactly one project-specific read-only confirmation flag.',
    };
  }
  const requiredConfirmation = AUDIT_PROJECTS[projectId];
  if (suppliedConfirmations[0] !== requiredConfirmation) {
    return {
      error: `Firebase project "${projectId}" requires ${requiredConfirmation}; confirmation flags cannot be interchanged.`,
    };
  }
  if (
    args.length !== 3 ||
    args.filter(argument => argument === projectId).length !== 1
  ) {
    return { error: 'Unexpected or duplicate audit arguments.' };
  }

  const allowedArguments = new Set([
    '--project',
    projectId,
    requiredConfirmation,
  ]);
  if (args.some(argument => !allowedArguments.has(argument))) {
    return { error: 'Unexpected or duplicate audit arguments.' };
  }
  if (env.FIRESTORE_EMULATOR_HOST) {
    return { error: 'Refusing to audit while a Firestore emulator is configured.' };
  }
  if (env.GCLOUD_PROJECT && env.GCLOUD_PROJECT !== projectId) {
    return {
      error: `Requested project "${projectId}" does not match GCLOUD_PROJECT "${env.GCLOUD_PROJECT}".`,
    };
  }

  return { projectId };
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

async function collectAuditCounts(db) {
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

  return counts;
}

function formatSummary(projectId, counts) {
  return JSON.stringify({
    projectId,
    readOnly: true,
    counts,
  }, null, 2);
}

async function main(args = process.argv.slice(2), env = process.env) {
  const validation = validateAuditArguments(args, env);
  if (validation.error) {
    console.error(
      `${validation.error}\nUsage: node functions/scripts/audit-production-events.cjs --project <yardsale-hub-93c49|yardsale-hub-staging> <matching read-only confirmation flag>`,
    );
    process.exitCode = 2;
    return;
  }

  initializeApp({ projectId: validation.projectId });
  const counts = await collectAuditCounts(getFirestore());
  console.log(formatSummary(validation.projectId, counts));
}

if (require.main === module) {
  main().catch(error => {
    const code = error && typeof error.code === 'string' ? error.code : 'unknown';
    console.error(`Read-only event audit failed (${code}).`);
    process.exitCode = 1;
  });
}

module.exports = {
  collectAuditCounts,
  formatSummary,
  validateAuditArguments,
};
