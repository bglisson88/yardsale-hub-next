'use client';

import { useCallback, useEffect } from 'react';
import {
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  where,
} from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useAuthStore, useFavoritesStore } from '@/store';
import type { Favorite, FavoriteType } from '@/types';

// Single shared listener, ref-counted across all consumers.
let consumers = 0;
let activeUid: string | null = null;
let unsubscribe: (() => void) | null = null;

function stop() {
  unsubscribe?.();
  unsubscribe = null;
  activeUid = null;
  useFavoritesStore.getState().reset();
}

function start(uid: string) {
  const { setFavorites, setLoading, setError } = useFavoritesStore.getState();
  activeUid = uid;
  setLoading(true);
  setError(null);
  unsubscribe = onSnapshot(
    query(collection(db, 'favorites'), where('userId', '==', uid)),
    (snap) => {
      const list = snap.docs.map((d) => {
        const data = d.data();
        return {
          id: d.id,
          userId: data.userId,
          type: data.type,
          targetId: data.targetId,
          createdAt: data.createdAt?.toDate?.() ?? new Date(),
        } as Favorite;
      });
      list.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
      setFavorites(list);
      setLoading(false);
    },
    (err) => {
      console.error('Error loading favorites:', err);
      setError('Could not load favorites.');
      setLoading(false);
    }
  );
}

function acquire(uid: string) {
  consumers += 1;
  if (activeUid !== uid) {
    unsubscribe?.();
    start(uid);
  }
}

function release() {
  consumers -= 1;
  if (consumers <= 0) {
    consumers = 0;
    stop();
  }
}

export const favoriteDocId = (userId: string, type: FavoriteType, targetId: string) =>
  `${userId}_${type}_${targetId}`;

export function useFavorites() {
  const userId = useAuthStore((s) => s.user?.id);
  const favorites = useFavoritesStore((s) => s.favorites);
  const loading = useFavoritesStore((s) => s.loading);
  const error = useFavoritesStore((s) => s.error);

  useEffect(() => {
    if (!userId) return;
    acquire(userId);
    return release;
  }, [userId]);

  const isFavorite = useCallback(
    (type: FavoriteType, id: string) =>
      favorites.some((f) => f.type === type && f.targetId === id),
    [favorites]
  );

  const addFavorite = useCallback(
    async (type: FavoriteType, targetId: string) => {
      if (!userId) throw new Error('Sign in to save favorites');
      await setDoc(doc(db, 'favorites', favoriteDocId(userId, type, targetId)), {
        userId,
        type,
        targetId,
        createdAt: serverTimestamp(),
      });
    },
    [userId]
  );

  const removeFavorite = useCallback(
    async (type: FavoriteType, targetId: string) => {
      if (!userId) throw new Error('Sign in to manage favorites');
      await deleteDoc(doc(db, 'favorites', favoriteDocId(userId, type, targetId)));
    },
    [userId]
  );

  return {
    favorites: userId ? favorites : [],
    loading: userId ? loading : false,
    error,
    isFavorite,
    addFavorite,
    removeFavorite,
  };
}
