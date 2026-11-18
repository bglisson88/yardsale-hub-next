import { onAuthStateChanged } from 'firebase/auth';
import { httpsCallable } from 'firebase/functions';
import { auth, functions } from '@/lib/firebase';

type LookupRequest =
  | { mode: 'self' }
  | { mode: 'item'; itemId: string }
  | { mode: 'conversation'; messageId: string };

type LookupResponse = { username: string | null };
type CacheEntry = { username: string | null; expiresAt: number };

const CACHE_TTL_MS = 30_000;
const MAX_CACHE_ENTRIES = 256;
const USERNAME_PATTERN = /^[a-z0-9_]{3,20}$/;
const cache = new Map<string, CacheEntry>();
const inFlight = new Map<string, Promise<string | null>>();
const invalidationListeners = new Set<() => void>();
let authUid = auth.currentUser?.uid ?? null;
let generation = 0;

function clearCache(): void {
  generation++;
  cache.clear();
  inFlight.clear();
}

onAuthStateChanged(auth, user => {
  const nextUid = user?.uid ?? null;
  if (nextUid !== authUid) {
    authUid = nextUid;
    clearCache();
  }
});

export function invalidatePublicUsernameCache(): void {
  clearCache();
  for (const listener of invalidationListeners) listener();
}

export function subscribePublicUsernameInvalidation(listener: () => void): () => void {
  invalidationListeners.add(listener);
  return () => invalidationListeners.delete(listener);
}

function cacheUsername(key: string, username: string | null): void {
  cache.delete(key);
  cache.set(key, { username, expiresAt: Date.now() + CACHE_TTL_MS });
  if (cache.size > MAX_CACHE_ENTRIES) {
    const oldestKey = cache.keys().next().value;
    if (oldestKey !== undefined) cache.delete(oldestKey);
  }
}

async function lookupUsername(input: LookupRequest): Promise<string | null> {
  const callerUid = auth.currentUser?.uid ?? null;
  const key = `${callerUid ?? 'anonymous'}:${JSON.stringify(input)}`;
  const cached = cache.get(key);
  if (cached && cached.expiresAt > Date.now()) {
    cache.delete(key);
    cache.set(key, cached);
    return cached.username;
  }
  if (cached) cache.delete(key);

  const existing = inFlight.get(key);
  if (existing) return existing;

  const requestGeneration = generation;
  const callable = httpsCallable<LookupRequest, LookupResponse>(
    functions,
    'getPublicUsername',
  );
  const pending = callable(input).then(result => {
    const username = typeof result.data?.username === 'string' &&
      USERNAME_PATTERN.test(result.data.username)
      ? result.data.username
      : null;
    if (generation === requestGeneration) {
      cacheUsername(key, username);
    }
    return username;
  }).finally(() => {
    if (inFlight.get(key) === pending) inFlight.delete(key);
  });
  inFlight.set(key, pending);
  return pending;
}

export function getMyPublicUsername(): Promise<string | null> {
  return lookupUsername({ mode: 'self' });
}

export function getItemSellerUsername(itemId: string): Promise<string | null> {
  return lookupUsername({ mode: 'item', itemId });
}

export function getConversationUsername(messageId: string): Promise<string | null> {
  return lookupUsername({ mode: 'conversation', messageId });
}
