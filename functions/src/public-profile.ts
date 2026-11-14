import { getAuth } from 'firebase-admin/auth';
import { FieldPath, getFirestore, Timestamp } from 'firebase-admin/firestore';
import { HttpsError, onCall } from 'firebase-functions/v2/https';
import { canonicalizeUsername, isReservedUsername } from './username';

const INVALID_REQUEST_MESSAGE = 'Provide a valid username.';
const UNAVAILABLE_USERNAME_MESSAGE = 'That username is unavailable.';
const INCONSISTENT_PROFILE_MESSAGE =
  'Public profile data is inconsistent. Please contact support.';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function registrationUsername(value: unknown): string {
  if (
    !isRecord(value) ||
    Object.keys(value).length !== 1 ||
    !Object.hasOwn(value, 'username')
  ) {
    throw new HttpsError('invalid-argument', INVALID_REQUEST_MESSAGE);
  }

  try {
    return canonicalizeUsername(value.username);
  } catch (error) {
    if (error instanceof TypeError) {
      throw new HttpsError('invalid-argument', INVALID_REQUEST_MESSAGE);
    }
    throw error;
  }
}

function authCreationTimestamp(value: unknown): Timestamp {
  if (typeof value !== 'string' || value.length === 0) {
    throw new HttpsError(
      'failed-precondition',
      'Unable to verify your account creation date.',
    );
  }

  const date = new Date(value);
  if (!Number.isFinite(date.getTime()) || date.toUTCString() !== value) {
    throw new HttpsError(
      'failed-precondition',
      'Unable to verify your account creation date.',
    );
  }

  return Timestamp.fromDate(date);
}

function hasOnlyKeys(
  value: Record<string, unknown>,
  expectedKeys: string[],
): boolean {
  const keys = Object.keys(value);
  return keys.length === expectedKeys.length &&
    expectedKeys.every(key => Object.hasOwn(value, key));
}

function isNonemptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function isValidUsernameState(value: unknown): boolean {
  return isRecord(value) &&
    hasOnlyKeys(value, ['lastRenamedAt']) &&
    (value.lastRenamedAt === null || value.lastRenamedAt instanceof Timestamp);
}

function throwInconsistentProfile(): never {
  throw new HttpsError('failed-precondition', INCONSISTENT_PROFILE_MESSAGE);
}

export const registerPublicProfile = onCall(async request => {
  const uid = request.auth?.uid;
  if (!uid) {
    throw new HttpsError('unauthenticated', 'Sign in to register a public profile.');
  }

  const username = registrationUsername(request.data);
  if (isReservedUsername(username)) {
    throw new HttpsError('already-exists', UNAVAILABLE_USERNAME_MESSAGE);
  }

  let authUser;
  try {
    authUser = await getAuth().getUser(uid);
  } catch (error) {
    if (
      isRecord(error) &&
      error.code === 'auth/user-not-found'
    ) {
      throw new HttpsError('unauthenticated', 'Your account is unavailable.');
    }
    throw error;
  }
  if (authUser.disabled) {
    throw new HttpsError('unauthenticated', 'Your account is unavailable.');
  }
  const memberSince = authCreationTimestamp(authUser.metadata.creationTime);

  const firestore = getFirestore();
  const privateUserQuery = firestore.collection('users')
    .select('displayName')
    .where(FieldPath.documentId(), '==', uid);
  const profileRef = firestore.collection('publicProfiles').doc(uid);
  const claimRef = firestore.collection('usernameClaims').doc(username);
  const reservedRef = firestore.collection('reservedUsernames').doc(username);
  const stateRef = firestore.collection('usernameState').doc(uid);

  return firestore.runTransaction(async transaction => {
    const userSnapshot = await transaction.get(privateUserQuery);
    const [
      profileSnapshot,
      claimSnapshot,
      reservedSnapshot,
      stateSnapshot,
    ] = await Promise.all([
      transaction.get(profileRef),
      transaction.get(claimRef),
      transaction.get(reservedRef),
      transaction.get(stateRef),
    ]);

    if (reservedSnapshot.exists) {
      throw new HttpsError('already-exists', UNAVAILABLE_USERNAME_MESSAGE);
    }

    const privateUser = userSnapshot.docs[0];
    if (!privateUser) {
      throw new HttpsError(
        'failed-precondition',
        'Complete your account setup before registering a public profile.',
      );
    }
    const displayName: unknown = privateUser.get('displayName');
    if (!isNonemptyString(displayName)) {
      throw new HttpsError(
        'failed-precondition',
        'Your account profile is incomplete. Please update it before registering a public profile.',
      );
    }

    if (profileSnapshot.exists) {
      const profile: unknown = profileSnapshot.data();
      const claim: unknown = claimSnapshot.data();
      const state: unknown = stateSnapshot.data();
      if (
        !isRecord(profile) ||
        !hasOnlyKeys(profile, ['username', 'displayName', 'photoURL', 'memberSince']) ||
        profile.username !== username ||
        !isNonemptyString(profile.displayName) ||
        profile.displayName !== displayName ||
        profile.photoURL !== null ||
        !(profile.memberSince instanceof Timestamp) ||
        !profile.memberSince.isEqual(memberSince) ||
        !claimSnapshot.exists ||
        !isRecord(claim) ||
        !hasOnlyKeys(claim, ['uid']) ||
        claim.uid !== uid ||
        !stateSnapshot.exists ||
        !isValidUsernameState(state)
      ) {
        throwInconsistentProfile();
      }

      return { username };
    }

    if (claimSnapshot.exists) {
      const claim: unknown = claimSnapshot.data();
      if (isRecord(claim) && claim.uid !== uid) {
        throw new HttpsError('already-exists', UNAVAILABLE_USERNAME_MESSAGE);
      }
      throwInconsistentProfile();
    }
    if (stateSnapshot.exists) {
      throwInconsistentProfile();
    }

    transaction.create(profileRef, {
      username,
      displayName,
      photoURL: null,
      memberSince,
    });
    transaction.create(claimRef, { uid });
    transaction.create(stateRef, { lastRenamedAt: null });

    return { username };
  });
});
