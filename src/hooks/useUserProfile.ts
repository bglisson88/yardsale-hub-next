'use client';

import { useEffect, useState } from 'react';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';

export interface UserProfileInfo {
  name?: string;
  photoURL?: string | null;
}

const cache = new Map<string, Promise<UserProfileInfo>>();

function loadProfile(userId: string): Promise<UserProfileInfo> {
  let p = cache.get(userId);
  if (!p) {
    p = getDoc(doc(db, 'users', userId))
      .then((snap): UserProfileInfo =>
        snap.exists()
          ? { name: snap.data().displayName || undefined, photoURL: snap.data().photoURL || null }
          : {}
      )
      .catch((error) => {
        console.error('Error fetching user profile:', error);
        cache.delete(userId);
        return {};
      });
    cache.set(userId, p);
  }
  return p;
}

/** Looks up users/{userId} only when cached name/photo are missing. */
export function useUserProfile(
  userId: string | undefined,
  cachedName?: string | null,
  cachedPhotoURL?: string | null
): UserProfileInfo {
  const [fetched, setFetched] = useState<{ id: string; info: UserProfileInfo } | null>(null);
  const needsFetch = !!userId && !cachedName;

  useEffect(() => {
    if (!needsFetch || !userId) return;
    let cancelled = false;
    loadProfile(userId).then((info) => {
      if (!cancelled) setFetched({ id: userId, info });
    });
    return () => {
      cancelled = true;
    };
  }, [needsFetch, userId]);

  if (cachedName) return { name: cachedName, photoURL: cachedPhotoURL };
  const info = fetched && fetched.id === userId ? fetched.info : {};
  return { name: info.name, photoURL: cachedPhotoURL || info.photoURL };
}
