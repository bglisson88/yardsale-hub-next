import { randomUUID } from 'node:crypto';
import {
  FieldValue,
  Timestamp,
  getFirestore,
  type DocumentData,
} from 'firebase-admin/firestore';
import * as logger from 'firebase-functions/logger';
import { HttpsError, onCall } from 'firebase-functions/v2/https';
import { profileCallableOptions } from './runtime-options';

export const EXACT_ADDRESS_CONSENT_VERSION = 'exact-address-v1';
export const EXACT_ADDRESS_CONSENT_TEXT =
  "I understand that choosing to publish this event's exact address will make the address visible to everyone, including visitors who are not signed in. I confirm that I am authorized to share this address publicly.";

const SAVE_KEYS = [
  'eventId',
  'operationId',
  'expectedEventVersion',
  'expectedUpdatedAtMs',
  'title',
  'description',
  'location',
  'locationId',
  'locationVisibility',
  'startDateMs',
  'endDateMs',
  'photoURL',
  'itemCount',
  'address',
  'consentVersion',
  'consentConfirmed',
];
const DELETE_KEYS = [
  'eventId',
  'operationId',
  'expectedEventVersion',
  'expectedUpdatedAtMs',
];

type EventVisibility = 'general' | 'exact';
type EventAction = 'granted' | 'revoked' | 'updated' | 'deleted';

interface SaveRequest {
  eventId: string;
  operationId: string;
  expectedEventVersion: number;
  expectedUpdatedAtMs: number | null;
  title: string;
  description: string;
  location: string;
  locationId: string;
  locationVisibility: EventVisibility;
  startDateMs: number;
  endDateMs: number;
  photoURL: string | null;
  itemCount: number;
  address: string;
  consentVersion: string | null;
  consentConfirmed: boolean;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function hasExactKeys(value: Record<string, unknown>, expected: string[]): boolean {
  const keys = Object.keys(value);
  return keys.length === expected.length && expected.every(key => Object.hasOwn(value, key));
}

function invalidRequest(): never {
  throw new HttpsError('invalid-argument', 'Provide valid event details and consent.');
}

function parseSaveRequest(value: unknown): SaveRequest {
  if (!isRecord(value) || !hasExactKeys(value, SAVE_KEYS)) invalidRequest();
  if (
    typeof value.eventId !== 'string' ||
    !/^[A-Za-z0-9_-]{1,128}$/.test(value.eventId) ||
    typeof value.operationId !== 'string' ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value.operationId) ||
    !Number.isSafeInteger(value.expectedEventVersion) ||
    (value.expectedEventVersion as number) < 0 ||
    !(
      value.expectedUpdatedAtMs === null ||
      Number.isSafeInteger(value.expectedUpdatedAtMs)
    ) ||
    typeof value.title !== 'string' ||
    value.title.trim().length === 0 ||
    value.title.trim().length > 120 ||
    typeof value.description !== 'string' ||
    value.description.length > 5000 ||
    typeof value.location !== 'string' ||
    value.location.trim().length === 0 ||
    value.location.trim().length > 200 ||
    typeof value.locationId !== 'string' ||
    !/^[a-z0-9][a-z0-9_-]{0,63}$/.test(value.locationId) ||
    !['general', 'exact'].includes(String(value.locationVisibility)) ||
    !Number.isSafeInteger(value.startDateMs) ||
    !Number.isSafeInteger(value.endDateMs) ||
    (value.endDateMs as number) <= (value.startDateMs as number) ||
    !(
      value.photoURL === null ||
      (typeof value.photoURL === 'string' && value.photoURL.length <= 2048)
    ) ||
    !Number.isSafeInteger(value.itemCount) ||
    (value.itemCount as number) < 0 ||
    typeof value.address !== 'string' ||
    value.address.length > 300 ||
    !(value.consentVersion === null || typeof value.consentVersion === 'string') ||
    typeof value.consentConfirmed !== 'boolean'
  ) {
    invalidRequest();
  }

  const visibility = value.locationVisibility as EventVisibility;
  const address = value.address.trim();
  if (visibility === 'exact') {
    if (
      !address ||
      value.consentVersion !== EXACT_ADDRESS_CONSENT_VERSION ||
      value.consentConfirmed !== true
    ) {
      throw new HttpsError(
        'failed-precondition',
        'Confirm the exact-address disclosure before publishing this event.',
        { reason: 'EXACT_ADDRESS_CONSENT_REQUIRED' },
      );
    }
  } else if (value.consentVersion !== null || value.consentConfirmed) {
    invalidRequest();
  }

  return {
    eventId: value.eventId,
    operationId: value.operationId,
    expectedEventVersion: value.expectedEventVersion as number,
    expectedUpdatedAtMs: value.expectedUpdatedAtMs as number | null,
    title: value.title.trim(),
    description: value.description.trim(),
    location: value.location.trim(),
    locationId: value.locationId,
    locationVisibility: visibility,
    startDateMs: value.startDateMs as number,
    endDateMs: value.endDateMs as number,
    photoURL: value.photoURL as string | null,
    itemCount: value.itemCount as number,
    address,
    consentVersion: value.consentVersion as string | null,
    consentConfirmed: value.consentConfirmed,
  };
}

function validCatalogLocation(data: DocumentData | undefined, display: string): boolean {
  if (!data || !hasExactKeys(data, [
    'kind', 'displayName', 'active', 'approvedAliases', 'countryCode', 'regionCode',
  ])) return false;
  return ['city', 'state', 'postalCode', 'area'].includes(data.kind) &&
    typeof data.displayName === 'string' &&
    data.displayName.length > 0 &&
    data.displayName.length <= 200 &&
    data.displayName === display &&
    data.active === true &&
    Array.isArray(data.approvedAliases) &&
    typeof data.countryCode === 'string' &&
    /^[A-Z]{2}$/.test(data.countryCode) &&
    typeof data.regionCode === 'string' &&
    data.regionCode.length <= 32;
}

function parseDeleteRequest(value: unknown): {
  eventId: string;
  operationId: string;
  expectedEventVersion: number;
  expectedUpdatedAtMs: number | null;
} {
  if (!isRecord(value) || !hasExactKeys(value, DELETE_KEYS)) invalidRequest();
  if (
    typeof value.eventId !== 'string' ||
    !/^[A-Za-z0-9_-]{1,128}$/.test(value.eventId) ||
    typeof value.operationId !== 'string' ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value.operationId) ||
    !Number.isSafeInteger(value.expectedEventVersion) ||
    (value.expectedEventVersion as number) < 0 ||
    !(
      value.expectedUpdatedAtMs === null ||
      Number.isSafeInteger(value.expectedUpdatedAtMs)
    )
  ) {
    invalidRequest();
  }
  return {
    eventId: value.eventId,
    operationId: value.operationId,
    expectedEventVersion: value.expectedEventVersion as number,
    expectedUpdatedAtMs: value.expectedUpdatedAtMs as number | null,
  };
}

function currentEventVersion(data: DocumentData): number {
  const version: unknown = data.eventVersion;
  if (version === undefined) return 0;
  if (!Number.isSafeInteger(version) || (version as number) < 0) {
    throw new HttpsError('failed-precondition', 'The event version is invalid. Reload and try again.');
  }
  return version as number;
}

function assertUnversionedEventTimestamp(
  data: DocumentData,
  expectedUpdatedAtMs: number | null,
): void {
  const updatedAt: unknown = data.updatedAt;
  if (
    !(updatedAt instanceof Timestamp) ||
    expectedUpdatedAtMs === null ||
    updatedAt.toMillis() !== expectedUpdatedAtMs
  ) {
    throw new HttpsError(
      'aborted',
      'This event changed while you were editing it. Reload and try again.',
      { reason: 'EVENT_VERSION_MISMATCH', currentEventVersion: 0 },
    );
  }
}

function isConsentMarker(value: unknown): value is DocumentData {
  return isRecord(value) &&
    typeof value.organizerUid === 'string' &&
    value.consentVersion === EXACT_ADDRESS_CONSENT_VERSION &&
    typeof value.addressRevision === 'string' &&
    value.grantedAt instanceof Timestamp;
}

function existingOperation(
  value: unknown,
  uid: string,
  action: EventAction,
  expectedVersion: number,
): DocumentData | null {
  if (value === undefined) return null;
  if (
    !isRecord(value) ||
    value.organizerUid !== uid ||
    value.action !== action ||
    value.expectedEventVersion !== expectedVersion ||
    !Number.isSafeInteger(value.resultEventVersion)
  ) {
    throw new HttpsError(
      'already-exists',
      'This operation identifier was already used. Reload the event and try again.',
    );
  }
  return value;
}

function mapInternalError(error: unknown): never {
  if (error instanceof HttpsError) throw error;
  logger.error('An event consent operation failed.');
  throw new HttpsError('internal', 'Unable to save this event. Please try again.');
}

export const saveEventWithConsent = onCall(profileCallableOptions, async request => {
  const uid = request.auth?.uid;
  if (!uid) throw new HttpsError('unauthenticated', 'Sign in to save this event.');
  const input = parseSaveRequest(request.data);
  const firestore = getFirestore();
  const eventRef = firestore.collection('yardSaleEvents').doc(input.eventId);
  const privateRef = firestore.collection('eventPrivate').doc(input.eventId);
  const markerRef = firestore.collection('eventAddressConsent').doc(input.eventId);
  const historyRef = markerRef.collection('history').doc(input.operationId);
  const locationRef = firestore.collection('generalLocations').doc(input.locationId);
  const action: EventAction = input.locationVisibility === 'exact' ? 'granted' : 'revoked';

  try {
    return await firestore.runTransaction(async transaction => {
      const historySnapshot = await transaction.get(historyRef);
      if (historySnapshot.exists) {
        const previous = existingOperation(
          historySnapshot.data(),
          uid,
          action,
          input.expectedEventVersion,
        );
        if (previous) {
          return {
            eventId: input.eventId,
            eventVersion: previous.resultEventVersion,
          };
        }
      }

      const [eventSnapshot, privateSnapshot, markerSnapshot, locationSnapshot] = await Promise.all([
        transaction.get(eventRef),
        transaction.get(privateRef),
        transaction.get(markerRef),
        transaction.get(locationRef),
      ]);
      const current = eventSnapshot.data();
      if (eventSnapshot.exists && current?.userId !== uid) {
        throw new HttpsError('permission-denied', 'You can only edit your own events.');
      }
      if (privateSnapshot.exists && privateSnapshot.get('userId') !== uid) {
        throw new HttpsError('failed-precondition', 'The private event record could not be verified.');
      }
      if (!locationSnapshot.exists || !validCatalogLocation(locationSnapshot.data(), input.location)) {
        throw new HttpsError(
          'failed-precondition',
          'Select an active, approved general location.',
          { reason: 'INVALID_GENERAL_LOCATION' },
        );
      }

      const currentVersion = eventSnapshot.exists ? currentEventVersion(current ?? {}) : 0;
      if (currentVersion !== input.expectedEventVersion) {
        throw new HttpsError(
          'aborted',
          'This event changed while you were editing it. Reload and try again.',
          { reason: 'EVENT_VERSION_MISMATCH', currentEventVersion: currentVersion },
        );
      }
      if (eventSnapshot.exists && currentVersion === 0) {
        assertUnversionedEventTimestamp(current ?? {}, input.expectedUpdatedAtMs);
      }
      if (!eventSnapshot.exists && input.locationVisibility !== 'exact') {
        throw new HttpsError('failed-precondition', 'New events must be created with an exact-address consent operation.');
      }
      if (eventSnapshot.exists && current?.itemCount !== input.itemCount) {
        throw new HttpsError('failed-precondition', 'The event item count changed. Reload and try again.');
      }

      const nextVersion = currentVersion + 1;
      const addressRevision = input.locationVisibility === 'exact'
        ? randomUUID()
        : null;
      const publicEvent = {
        userId: uid,
        title: input.title,
        description: input.description,
        location: input.location,
        locationId: input.locationId,
        locationVisibility: input.locationVisibility,
        startDate: Timestamp.fromMillis(input.startDateMs),
        endDate: Timestamp.fromMillis(input.endDateMs),
        photoURL: input.photoURL,
        createdAt: current?.createdAt instanceof Timestamp
          ? current.createdAt
          : FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
        itemCount: input.itemCount,
        eventVersion: nextVersion,
      };

      if (eventSnapshot.exists) transaction.set(eventRef, publicEvent);
      else transaction.create(eventRef, publicEvent);

      if (input.locationVisibility === 'exact') {
        transaction.set(privateRef, {
          userId: uid,
          address: input.address,
          addressRevision,
        });
        transaction.set(markerRef, {
          organizerUid: uid,
          consentVersion: EXACT_ADDRESS_CONSENT_VERSION,
          addressRevision,
          grantedAt: FieldValue.serverTimestamp(),
          operationId: input.operationId,
        });
      } else {
        if (privateSnapshot.exists && input.address) {
          transaction.set(privateRef, { userId: uid, address: input.address });
        } else if (privateSnapshot.exists) {
          transaction.delete(privateRef);
        }
        if (markerSnapshot.exists) transaction.delete(markerRef);
      }

      transaction.create(historyRef, {
        action: input.locationVisibility === 'exact'
          ? 'granted'
          : markerSnapshot.exists ? 'revoked' : 'updated',
        organizerUid: uid,
        consentVersion: input.locationVisibility === 'exact'
          ? EXACT_ADDRESS_CONSENT_VERSION
          : null,
        addressRevision: addressRevision ??
          (isConsentMarker(markerSnapshot.data()) ? markerSnapshot.get('addressRevision') : null),
        recordedAt: FieldValue.serverTimestamp(),
        expectedEventVersion: input.expectedEventVersion,
        resultEventVersion: nextVersion,
      });

      return { eventId: input.eventId, eventVersion: nextVersion };
    });
  } catch (error) {
    mapInternalError(error);
  }
});

export const deleteEventWithConsent = onCall(profileCallableOptions, async request => {
  const uid = request.auth?.uid;
  if (!uid) throw new HttpsError('unauthenticated', 'Sign in to delete this event.');
  const input = parseDeleteRequest(request.data);
  const firestore = getFirestore();
  const eventRef = firestore.collection('yardSaleEvents').doc(input.eventId);
  const privateRef = firestore.collection('eventPrivate').doc(input.eventId);
  const markerRef = firestore.collection('eventAddressConsent').doc(input.eventId);
  const historyRef = markerRef.collection('history').doc(input.operationId);

  try {
    return await firestore.runTransaction(async transaction => {
      const historySnapshot = await transaction.get(historyRef);
      if (historySnapshot.exists) {
        const previous = existingOperation(
          historySnapshot.data(),
          uid,
          'deleted',
          input.expectedEventVersion,
        );
        if (previous) return { eventId: input.eventId, deleted: true };
      }

      const [eventSnapshot, privateSnapshot, markerSnapshot] = await Promise.all([
        transaction.get(eventRef),
        transaction.get(privateRef),
        transaction.get(markerRef),
      ]);
      if (!eventSnapshot.exists) {
        throw new HttpsError('not-found', 'This event no longer exists.');
      }
      const event = eventSnapshot.data();
      if (event?.userId !== uid) {
        throw new HttpsError('permission-denied', 'You can only delete your own events.');
      }
      if (privateSnapshot.exists && privateSnapshot.get('userId') !== uid) {
        throw new HttpsError('failed-precondition', 'The private event record could not be verified.');
      }

      const currentVersion = currentEventVersion(event ?? {});
      if (currentVersion !== input.expectedEventVersion) {
        throw new HttpsError(
          'aborted',
          'This event changed while you were editing it. Reload and try again.',
          { reason: 'EVENT_VERSION_MISMATCH', currentEventVersion: currentVersion },
        );
      }
      if (currentVersion === 0) {
        assertUnversionedEventTimestamp(event ?? {}, input.expectedUpdatedAtMs);
      }

      transaction.delete(eventRef);
      if (privateSnapshot.exists) transaction.delete(privateRef);
      if (markerSnapshot.exists) transaction.delete(markerRef);
      transaction.create(historyRef, {
        action: 'deleted',
        organizerUid: uid,
        consentVersion: isConsentMarker(markerSnapshot.data())
          ? EXACT_ADDRESS_CONSENT_VERSION
          : null,
        addressRevision: isConsentMarker(markerSnapshot.data())
          ? markerSnapshot.get('addressRevision')
          : null,
        recordedAt: FieldValue.serverTimestamp(),
        expectedEventVersion: input.expectedEventVersion,
        resultEventVersion: currentVersion + 1,
      });
      return { eventId: input.eventId, deleted: true };
    });
  } catch (error) {
    mapInternalError(error);
  }
});
