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
const SENSITIVE_FIELD = /(address|latitude|longitude|coordinates?|geopoint|street|(?:^|[_-])(lat|lng|lon)(?:$|[_-]))/i;
const LOCATION_ID = /^[a-z0-9][a-z0-9_-]{0,63}$/;
const EVENT_FIELDS = [
  'userId', 'title', 'description', 'location', 'locationVisibility',
  'startDate', 'endDate', 'photoURL', 'createdAt', 'updatedAt', 'itemCount',
];
const MARKER_FIELDS = [
  'organizerUid', 'consentVersion', 'addressRevision', 'grantedAt', 'operationId',
];
const CATALOG_FIELDS = [
  'kind', 'displayName', 'active', 'approvedAliases', 'countryCode', 'regionCode',
];
const SAFE_ERROR_CODES = new Set([
  'cancelled', 'unknown', 'invalid-argument', 'deadline-exceeded', 'not-found',
  'already-exists', 'permission-denied', 'resource-exhausted', 'failed-precondition',
  'aborted', 'out-of-range', 'unimplemented', 'internal', 'unavailable',
  'data-loss', 'unauthenticated',
]);

function validateAuditArguments(args, env = process.env) {
  const projectPositions = args.flatMap((argument, index) =>
    argument === '--project' ? [index] : []);
  if (projectPositions.length !== 1) {
    return { error: 'Provide exactly one --project argument.', publicError: 'Provide exactly one --project argument.' };
  }

  const projectIndex = projectPositions[0];
  const projectId = args[projectIndex + 1];
  if (!Object.hasOwn(AUDIT_PROJECTS, projectId)) {
    return {
      error: `Unsupported Firebase project ID "${String(projectId)}".`,
      publicError: 'Unsupported Firebase project ID.',
    };
  }

  const suppliedConfirmations = args.filter(argument =>
    CONFIRMATION_FLAGS.has(argument));
  if (suppliedConfirmations.length !== 1) {
    return {
      error: 'Provide exactly one project-specific read-only confirmation flag.',
      publicError: 'Provide exactly one project-specific read-only confirmation flag.',
    };
  }
  const requiredConfirmation = AUDIT_PROJECTS[projectId];
  if (suppliedConfirmations[0] !== requiredConfirmation) {
    return {
      error: `Firebase project "${projectId}" requires ${requiredConfirmation}; confirmation flags cannot be interchanged.`,
      publicError: 'The confirmation flag does not match the requested project.',
    };
  }
  if (
    args.length !== 3 ||
    args.filter(argument => argument === projectId).length !== 1
  ) {
    return { error: 'Unexpected or duplicate audit arguments.', publicError: 'Unexpected or duplicate audit arguments.' };
  }

  const allowedArguments = new Set([
    '--project',
    projectId,
    requiredConfirmation,
  ]);
  if (args.some(argument => !allowedArguments.has(argument))) {
    return { error: 'Unexpected or duplicate audit arguments.', publicError: 'Unexpected or duplicate audit arguments.' };
  }
  if (env.FIRESTORE_EMULATOR_HOST) {
    return { error: 'Refusing to audit while a Firestore emulator is configured.', publicError: 'Refusing to audit while a Firestore emulator is configured.' };
  }
  if (env.GCLOUD_PROJECT && env.GCLOUD_PROJECT !== projectId) {
    return {
      error: `Requested project "${projectId}" does not match GCLOUD_PROJECT "${env.GCLOUD_PROJECT}".`,
      publicError: 'The requested project does not match GCLOUD_PROJECT.',
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

function hasRequiredAndAllowedFields(data, required, optional = []) {
  return data && typeof data === 'object' && !Array.isArray(data) &&
    required.every(key => Object.hasOwn(data, key)) &&
    Object.keys(data).every(key => required.includes(key) || optional.includes(key));
}

function validPublicEvent(data) {
  return hasRequiredAndAllowedFields(data, EVENT_FIELDS, ['eventVersion', 'locationId']) &&
    typeof data.userId === 'string' && data.userId.length > 0 &&
    typeof data.title === 'string' && data.title.length > 0 && data.title.length <= 120 &&
    typeof data.description === 'string' && data.description.length <= 5000 &&
    typeof data.location === 'string' && data.location.length > 0 &&
    ['general', 'exact'].includes(data.locationVisibility) &&
    data.startDate instanceof Timestamp && data.endDate instanceof Timestamp &&
    (data.endDate.seconds > data.startDate.seconds ||
      (data.endDate.seconds === data.startDate.seconds &&
        data.endDate.nanoseconds > data.startDate.nanoseconds)) &&
    (data.photoURL === null || typeof data.photoURL === 'string') &&
    data.createdAt instanceof Timestamp && data.updatedAt instanceof Timestamp &&
    Number.isInteger(data.itemCount) && data.itemCount >= 0 &&
    (!Object.hasOwn(data, 'eventVersion') ||
      (Number.isInteger(data.eventVersion) && data.eventVersion >= 0));
}

function maySatisfyPublicEventReadRules(data) {
  const definitelyTooLong = (value, limit) =>
    /^[\x00-\x7f]*$/.test(value) && value.length > limit;
  return hasRequiredAndAllowedFields(data, EVENT_FIELDS, ['eventVersion', 'locationId']) &&
    typeof data.userId === 'string' &&
    typeof data.title === 'string' && data.title.length > 0 &&
    !definitelyTooLong(data.title, 120) &&
    typeof data.description === 'string' && !definitelyTooLong(data.description, 5000) &&
    typeof data.location === 'string' && data.location.length > 0 &&
    ['general', 'exact'].includes(data.locationVisibility) &&
    data.startDate instanceof Timestamp && data.endDate instanceof Timestamp &&
    (data.endDate.seconds > data.startDate.seconds ||
      (data.endDate.seconds === data.startDate.seconds &&
        data.endDate.nanoseconds > data.startDate.nanoseconds)) &&
    (data.photoURL === null || typeof data.photoURL === 'string') &&
    data.createdAt instanceof Timestamp && data.updatedAt instanceof Timestamp &&
    Number.isInteger(data.itemCount) && data.itemCount >= 0 &&
    (!Object.hasOwn(data, 'eventVersion') ||
      (Number.isInteger(data.eventVersion) && data.eventVersion >= 0));
}

function validCatalogRecord(data) {
  return hasRequiredAndAllowedFields(data, CATALOG_FIELDS) &&
    ['city', 'state', 'postalCode', 'area'].includes(data.kind) &&
    typeof data.displayName === 'string' && data.displayName.length > 0 &&
    data.displayName.length <= 200 && data.active === true &&
    Array.isArray(data.approvedAliases) &&
    typeof data.countryCode === 'string' && /^[A-Z]{2}$/.test(data.countryCode) &&
    typeof data.regionCode === 'string' && data.regionCode.length <= 32;
}

function suspiciousLocation(value) {
  return /\b\d{1,6}\s+[\w.'-]+(?:\s+[\w.'-]+){0,4}\s+(?:street|st|road|rd|avenue|ave|lane|ln|drive|dr|boulevard|blvd|court|ct)\b/i.test(value) ||
    /(?:^|[^\d])[-+]?\d{1,2}\.\d+\s*,\s*[-+]?\d{1,3}\.\d+(?:$|[^\d])/.test(value);
}

function structurallyValidMarker(marker, event, privateEvent) {
  return hasRequiredAndAllowedFields(marker, MARKER_FIELDS) &&
    typeof event.userId === 'string' && event.userId.length > 0 &&
    privateEvent && typeof privateEvent.userId === 'string' &&
    privateEvent.userId.length > 0 && marker.organizerUid === event.userId &&
    marker.organizerUid === privateEvent.userId &&
    marker.consentVersion === 'exact-address-v1' &&
    typeof marker.addressRevision === 'string' && marker.addressRevision.length > 0 &&
    marker.addressRevision === privateEvent.addressRevision &&
    marker.grantedAt instanceof Timestamp && typeof marker.operationId === 'string' &&
    marker.operationId.length > 0;
}

function maySatisfyAnonymousPrivateReadRules(marker, event, privateEvent) {
  return event.maySatisfyReadRules &&
    event.locationVisibility === 'exact' && privateEvent &&
    privateEvent.userId === event.userId && privateEvent.hasRulesAddress &&
    typeof privateEvent.addressRevision === 'string' &&
    hasRequiredAndAllowedFields(marker, MARKER_FIELDS) &&
    marker.organizerUid === event.userId &&
    marker.organizerUid === privateEvent.userId &&
    marker.consentVersion === 'exact-address-v1' &&
    typeof marker.addressRevision === 'string' &&
    marker.addressRevision === privateEvent.addressRevision &&
    marker.grantedAt instanceof Timestamp && typeof marker.operationId === 'string';
}

function safeFailureMessage(error) {
  const code = error && SAFE_ERROR_CODES.has(error.code) ? error.code : 'unknown';
  return `Read-only event audit failed (${code}).`;
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
    privateDocumentsWithOwnerReadCondition: 0,
    orphanPrivateDocuments: 0,
    eventPrivateOwnerMismatches: 0,
    exactEventsWithoutNonblankPrivateAddress: 0,
    exactEventsPotentiallyAnonymousReadable: 0,
    exactEventsDefinitelyNotAnonymousReadable: 0,
    exactEventsPolicyStructurallyPlausible: 0,
    exactEventsPolicyStructurallyInvalid: 0,
    exactEventsPotentiallyReadableWithPolicyFailure: 0,
    consentMarkers: 0,
    orphanConsentMarkers: 0,
    consentOrganizerMismatches: 0,
    generalEventsWithConsentMarker: 0,
    publicEventsFailingPolicySchema: 0,
    catalogMatchedReviewUnverifiedLocations: 0,
    suspiciousPublicLocations: 0,
    malformedPublicLocations: 0,
    missingPublicLocations: 0,
    unverifiedPublicLocations: 0,
    publicEventsWithUnreviewedFreeText: 0,
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
    if (!validPublicEvent(data)) counts.publicEventsFailingPolicySchema += 1;
    if ((typeof data.title === 'string' && data.title.length > 0) ||
        (typeof data.description === 'string' && data.description.length > 0)) {
      counts.publicEventsWithUnreviewedFreeText += 1;
    }
    events.set(document.id, {
      userId: typeof data.userId === 'string' ? data.userId : null,
      locationVisibility: data.locationVisibility,
      locationPresent: Object.hasOwn(data, 'location'),
      location: data.location,
      locationIdPresent: Object.hasOwn(data, 'locationId'),
      locationId: data.locationId,
      validSchema: validPublicEvent(data),
      maySatisfyReadRules: maySatisfyPublicEventReadRules(data),
    });
  });

  await readCollection(db, 'eventPrivate', document => {
    const data = document.data();
    counts.privateDocuments += 1;
    if (typeof data.address === 'string' && data.address.trim()) {
      counts.privateDocumentsWithAddress += 1;
    }
    if (typeof data.userId === 'string' && data.userId.length > 0) {
      counts.privateDocumentsWithOwnerReadCondition += 1;
    }
    privateEvents.set(document.id, {
      userId: typeof data.userId === 'string' ? data.userId : null,
      hasAddress: typeof data.address === 'string' && data.address.trim().length > 0,
      hasRulesAddress: typeof data.address === 'string' && data.address.length > 0,
      addressRevision: typeof data.addressRevision === 'string'
        ? data.addressRevision
        : null,
    });
  });

  await readCollection(db, 'eventAddressConsent', document => {
    const data = document.data();
    counts.consentMarkers += 1;
    consentMarkers.set(document.id, data);
  });

  let aliases;
  const catalog = new Map();
  async function getCatalogRecord(id) {
    if (!catalog.has(id)) {
      const snapshot = await db.collection('generalLocations').doc(id).get();
      catalog.set(id, snapshot.exists ? snapshot.data() : null);
    }
    return catalog.get(id);
  }

  for (const [eventId, event] of events) {
    const privateEvent = privateEvents.get(eventId);
    const marker = consentMarkers.get(eventId);
    if (privateEvent && (!event.userId || !privateEvent.userId ||
        privateEvent.userId !== event.userId)) {
      counts.eventPrivateOwnerMismatches += 1;
    }
    if (event.locationVisibility === 'exact') {
      if (!privateEvent?.hasAddress) counts.exactEventsWithoutNonblankPrivateAddress += 1;
      const policyPlausible = !(
        !event.validSchema ||
        !privateEvent?.hasAddress ||
        !marker ||
        !structurallyValidMarker(marker, event, privateEvent)
      );
      const potentiallyReadable = Boolean(
        marker && maySatisfyAnonymousPrivateReadRules(marker, event, privateEvent),
      );
      if (potentiallyReadable) {
        counts.exactEventsPotentiallyAnonymousReadable += 1;
      } else {
        counts.exactEventsDefinitelyNotAnonymousReadable += 1;
      }
      if (policyPlausible) {
        counts.exactEventsPolicyStructurallyPlausible += 1;
      } else {
        counts.exactEventsPolicyStructurallyInvalid += 1;
        if (potentiallyReadable) counts.exactEventsPotentiallyReadableWithPolicyFailure += 1;
      }
    }
    if (event.locationVisibility === 'general' && marker) {
      counts.generalEventsWithConsentMarker += 1;
    }

    if (!event.locationPresent) {
      counts.missingPublicLocations += 1;
    } else if (typeof event.location !== 'string' ||
        event.location.length === 0 || event.location.length > 200 ||
        event.location.trim() !== event.location) {
      counts.malformedPublicLocations += 1;
    } else if (suspiciousLocation(event.location)) {
      counts.suspiciousPublicLocations += 1;
    } else {
      let locationId = event.locationId;
      if (!event.locationIdPresent) {
        if (aliases === undefined) {
          const snapshot = await db.collection('generalLocationAliases').doc('current').get();
          const index = snapshot.exists ? snapshot.data() : null;
          aliases = hasRequiredAndAllowedFields(index, ['schemaVersion', 'aliases']) &&
            index.schemaVersion === 1 && index.aliases &&
            typeof index.aliases === 'object' && !Array.isArray(index.aliases)
            ? index.aliases : null;
        }
        locationId = aliases && Object.hasOwn(aliases, event.location)
          ? aliases[event.location] : null;
      }
      if (typeof locationId !== 'string' || !LOCATION_ID.test(locationId)) {
        counts.unverifiedPublicLocations += 1;
        continue;
      }
      const record = await getCatalogRecord(locationId);
      if (validCatalogRecord(record) &&
          (record.displayName === event.location ||
            (!event.locationIdPresent && record.approvedAliases.includes(event.location)))) {
        counts.catalogMatchedReviewUnverifiedLocations += 1;
      } else {
        counts.unverifiedPublicLocations += 1;
      }
    }
  }

  for (const eventId of privateEvents.keys()) {
    if (!events.has(eventId)) counts.orphanPrivateDocuments += 1;
  }
  for (const eventId of consentMarkers.keys()) {
    if (!events.has(eventId)) counts.orphanConsentMarkers += 1;
    else if (!events.get(eventId).userId ||
        events.get(eventId).userId !== consentMarkers.get(eventId).organizerUid) {
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
      `${validation.publicError}\nUsage: node functions/scripts/audit-production-events.cjs --project <yardsale-hub-93c49|yardsale-hub-staging> <matching read-only confirmation flag>`,
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
    console.error(safeFailureMessage(error));
    process.exitCode = 1;
  });
}

module.exports = {
  collectAuditCounts,
  formatSummary,
  safeFailureMessage,
  validateAuditArguments,
};
