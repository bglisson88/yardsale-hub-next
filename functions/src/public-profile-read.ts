import { isIP } from 'node:net';
import { Timestamp, getFirestore, type Firestore } from 'firebase-admin/firestore';
import { HttpsError, onCall } from 'firebase-functions/v2/https';
import { canonicalizeUsername } from './username';
import { profileCallableOptions } from './runtime-options';

const LOOKUP_WINDOW_MS = 60 * 1000;
const LOOKUP_LIMIT = 120;
const MAX_RATE_LIMIT_BUCKETS = 4096;
const PROFILE_FIELDS = ['username', 'displayName', 'photoURL', 'memberSince'];
const IDENTIFIER = /^[A-Za-z0-9_-]{1,128}$/;

type LookupRequest =
  | { mode: 'self' }
  | { mode: 'item'; itemId: string }
  | { mode: 'conversation'; messageId: string };

type RateLimitBucket = {
  windowStartedAt: number;
  count: number;
};

const rateLimitBuckets = new Map<string, RateLimitBucket>();
let requestsSincePrune = 0;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function hasExactKeys(value: Record<string, unknown>, expected: string[]): boolean {
  const keys = Object.keys(value);
  return keys.length === expected.length &&
    expected.every(key => Object.hasOwn(value, key));
}

function parseLookupRequest(value: unknown): LookupRequest {
  if (!isRecord(value) || typeof value.mode !== 'string') {
    throw new HttpsError('invalid-argument', 'Provide a valid username lookup request.');
  }
  if (value.mode === 'self' && hasExactKeys(value, ['mode'])) {
    return { mode: 'self' };
  }
  if (
    value.mode === 'item' &&
    hasExactKeys(value, ['mode', 'itemId']) &&
    typeof value.itemId === 'string' &&
    IDENTIFIER.test(value.itemId)
  ) {
    return { mode: 'item', itemId: value.itemId };
  }
  if (
    value.mode === 'conversation' &&
    hasExactKeys(value, ['mode', 'messageId']) &&
    typeof value.messageId === 'string' &&
    IDENTIFIER.test(value.messageId)
  ) {
    return { mode: 'conversation', messageId: value.messageId };
  }
  throw new HttpsError('invalid-argument', 'Provide a valid username lookup request.');
}

function consumeLookupLimit(key: string, now = Date.now()): void {
  if ((requestsSincePrune++ % 128) === 0) {
    for (const [bucketKey, bucket] of rateLimitBuckets) {
      if (now - bucket.windowStartedAt >= LOOKUP_WINDOW_MS) {
        rateLimitBuckets.delete(bucketKey);
      }
    }
  }

  let bucket = rateLimitBuckets.get(key);
  if (bucket && now - bucket.windowStartedAt >= LOOKUP_WINDOW_MS) {
    rateLimitBuckets.delete(key);
    bucket = undefined;
  }
  if (!bucket) {
    if (rateLimitBuckets.size >= MAX_RATE_LIMIT_BUCKETS) {
      throw new HttpsError('resource-exhausted', 'Username lookup is temporarily rate limited.');
    }
    bucket = { windowStartedAt: now, count: 0 };
    rateLimitBuckets.set(key, bucket);
  }
  if (bucket.count >= LOOKUP_LIMIT) {
    throw new HttpsError('resource-exhausted', 'Too many username lookups. Please try again later.');
  }
  bucket.count++;
}

function anonymousRateLimitKey(ip: unknown): string | null {
  if (typeof ip !== 'string') return null;
  let address = ip.split('%')[0].trim().toLowerCase();
  if (isIP(address) === 0) return null;
  if (isIP(address) === 4) return `ip4:${address}`;

  const ipv4Tail = /(\d{1,3}(?:\.\d{1,3}){3})$/.exec(address)?.[1];
  if (ipv4Tail) {
    const [a, b, c, d] = ipv4Tail.split('.').map(Number);
    const high = ((a << 8) | b).toString(16);
    const low = ((c << 8) | d).toString(16);
    address = `${address.slice(0, -ipv4Tail.length)}${high}:${low}`;
  }

  let groups = address.split(':');
  if (address.includes('::')) {
    const split = address.split('::');
    const left = split[0] ? split[0].split(':') : [];
    const right = split[1] ? split[1].split(':') : [];
    groups = [...left, ...Array(8 - left.length - right.length).fill('0'), ...right];
  }
  if (groups.length !== 8) return null;
  groups = groups.map(group => group.padStart(4, '0'));
  if (groups.slice(0, 5).every(group => group === '0000') && groups[5] === 'ffff') {
    const high = Number.parseInt(groups[6], 16);
    const low = Number.parseInt(groups[7], 16);
    return `ip4:${high >> 8}.${high & 255}.${low >> 8}.${low & 255}`;
  }
  return `ip6:${groups.slice(0, 4).join(':')}/64`;
}

function validPublicUsername(data: unknown): string | null {
  if (!isRecord(data) || !hasExactKeys(data, PROFILE_FIELDS)) return null;
  let username: string;
  try {
    username = canonicalizeUsername(data.username);
  } catch (error) {
    if (error instanceof TypeError) return null;
    throw error;
  }
  if (
    username !== data.username ||
    data.displayName !== username ||
    !(data.photoURL === null || (
      typeof data.photoURL === 'string' && data.photoURL.trim().length > 0
    )) ||
    !(data.memberSince instanceof Timestamp)
  ) {
    return null;
  }
  return username;
}

async function lookupUsername(firestore: Firestore, uid: string): Promise<string | null> {
  const profileRef = firestore.collection('publicProfiles').doc(uid);
  const profileSnapshot = await profileRef.get();
  if (!profileSnapshot.exists) return null;

  const username = validPublicUsername(profileSnapshot.data());
  if (!username) return null;

  const claimSnapshot = await firestore.collection('usernameClaims').doc(username).get();
  const claim = claimSnapshot.data();
  if (
    !claimSnapshot.exists ||
    !claim ||
    Object.keys(claim).length !== 1 ||
    claim.uid !== uid
  ) {
    return null;
  }
  return username;
}

async function resolveTargetUid(
  firestore: Firestore,
  request: LookupRequest,
  callerUid: string | null,
): Promise<string | null> {
  switch (request.mode) {
    case 'self':
      return callerUid;
    case 'item': {
      const itemSnapshot = await firestore.collection('items').doc(request.itemId).get();
      const item = itemSnapshot.data();
      return itemSnapshot.exists &&
        typeof item?.userId === 'string' &&
        IDENTIFIER.test(item.userId)
        ? item.userId
        : null;
    }
    case 'conversation': {
      if (!callerUid) {
        throw new HttpsError('unauthenticated', 'Sign in to look up a conversation username.');
      }
      const messageSnapshot = await firestore.collection('messages').doc(request.messageId).get();
      const message = messageSnapshot.data();
      if (!messageSnapshot.exists || !message) return null;

      if (
        message.recipientId === callerUid &&
        typeof message.senderId === 'string' &&
        IDENTIFIER.test(message.senderId) &&
        message.senderId !== callerUid
      ) {
        return message.senderId;
      }

      if (
        message.senderId !== callerUid ||
        typeof message.recipientId !== 'string' ||
        !IDENTIFIER.test(message.recipientId) ||
        message.recipientId === callerUid
      ) {
        return null;
      }

      const partnerReply = await firestore.collection('messages')
        .where('senderId', '==', message.recipientId)
        .where('recipientId', '==', callerUid)
        .limit(1)
        .get();
      return partnerReply.empty ? null : message.recipientId;
    }
  }
}

function safeLookupFailure(): HttpsError {
  return new HttpsError('unavailable', 'Username lookup is temporarily unavailable.');
}

export const getPublicUsername = onCall(profileCallableOptions, async request => {
  const input = parseLookupRequest(request.data);
  const callerUid = request.auth?.uid ?? null;
  if (input.mode !== 'item' && !callerUid) {
    throw new HttpsError('unauthenticated', 'Sign in to look up this username.');
  }

  let rateLimitKey: string;
  if (callerUid) {
    rateLimitKey = `uid:${callerUid}`;
  } else {
    const ipKey = anonymousRateLimitKey(request.rawRequest.ip);
    if (!ipKey) {
      throw new HttpsError('resource-exhausted', 'Username lookup is temporarily rate limited.');
    }
    rateLimitKey = ipKey;
  }
  consumeLookupLimit(rateLimitKey);

  try {
    const firestore = getFirestore();
    const uid = await resolveTargetUid(firestore, input, callerUid);
    if (!uid) return { username: null };
    return { username: await lookupUsername(firestore, uid) };
  } catch (error) {
    if (error instanceof HttpsError) throw error;
    throw safeLookupFailure();
  }
});
