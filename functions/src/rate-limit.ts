import { FieldValue, Timestamp, type Firestore } from 'firebase-admin/firestore';
import { HttpsError } from 'firebase-functions/v2/https';

export type UsernameOperation = 'register' | 'rename';

const FIFTEEN_MINUTES_MS = 15 * 60 * 1000;
const ONE_DAY_MS = 24 * 60 * 60 * 1000;
const SHORT_WINDOW_LIMIT = 5;
const DAILY_WINDOW_LIMIT = 20;

function isTimestamp(value: unknown): value is Timestamp {
  return value instanceof Timestamp;
}

function attemptsFromSnapshot(value: unknown): Timestamp[] {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.length > DAILY_WINDOW_LIMIT || !value.every(isTimestamp)) {
    throw new HttpsError(
      'internal',
      'The username service could not verify your request limits.',
    );
  }
  return value;
}

function rateLimitError(retryAt: number, now: number): HttpsError {
  const retryAfterSeconds = Math.max(1, Math.ceil((retryAt - now) / 1000));
  throw new HttpsError(
    'resource-exhausted',
    'Too many username attempts. Please wait before trying again.',
    {
      reason: 'USERNAME_RATE_LIMIT',
      retryAfterSeconds,
      retryAt: new Date(retryAt).toISOString(),
    },
  );
}

export async function consumeUsernameAttempt(
  firestore: Firestore,
  uid: string,
  operation: UsernameOperation,
  now = Date.now(),
): Promise<void> {
  if (!uid || !Number.isSafeInteger(now)) {
    throw new HttpsError('internal', 'The username service could not verify your request limits.');
  }

  const limitRef = firestore.collection('usernameRateLimits')
    .doc(uid)
    .collection('operations')
    .doc(operation);

  await firestore.runTransaction(async transaction => {
    const snapshot = await transaction.get(limitRef);
    const previousAttempts = attemptsFromSnapshot(snapshot.exists
      ? snapshot.get('attempts')
      : undefined);
    const activeDaily = previousAttempts
      .filter(attempt => attempt.toMillis() > now - ONE_DAY_MS)
      .sort((left, right) => left.toMillis() - right.toMillis());
    const activeShort = activeDaily.filter(
      attempt => attempt.toMillis() > now - FIFTEEN_MINUTES_MS,
    );

    const retryTimes: number[] = [];
    if (activeShort.length >= SHORT_WINDOW_LIMIT) {
      retryTimes.push(activeShort[0].toMillis() + FIFTEEN_MINUTES_MS);
    }
    if (activeDaily.length >= DAILY_WINDOW_LIMIT) {
      retryTimes.push(activeDaily[0].toMillis() + ONE_DAY_MS);
    }
    if (retryTimes.length > 0) {
      rateLimitError(Math.max(...retryTimes), now);
    }

    transaction.set(limitRef, {
      attempts: [...activeDaily, Timestamp.fromMillis(now)],
      updatedAt: FieldValue.serverTimestamp(),
    });
  });
}
