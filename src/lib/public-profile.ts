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
const USERNAME_PATTERN = /^[a-z0-9_]{3,20}$/;
const cache = new Map<string, CacheEntry>();
const inFlight = new Map<string, Promise<string | null>>();
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
}

async function lookupUsername(input: LookupRequest): Promise<string | null> {
  const callerUid = auth.currentUser?.uid ?? null;
  const key = `${callerUid ?? 'anonymous'}:${JSON.stringify(input)}`;
  const cached = cache.get(key);
  if (cached && cached.expiresAt > Date.now()) return cached.username;
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
      cache.set(key, { username, expiresAt: Date.now() + CACHE_TTL_MS });
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
