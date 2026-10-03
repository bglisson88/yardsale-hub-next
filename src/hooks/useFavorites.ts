'use client';

import { useCallback, useEffect } from 'react';
import {
  collection,
  query,
  where,
  onSnapshot,
  doc,
  setDoc,
  deleteDoc,
  serverTimestamp,
} from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useAuthStore, useFavoritesStore } from '@/store';
import type { Favorite } from '@/types';

type FavoriteType = Favorite['type'];

// One shared Firestore listener, reference counted across all hook consumers.
let activeUserId: string | null = null;
let subscribers = 0;
let unsubscribe: (() => void) | null = null;

function start(userId: string) {
  const store = useFavoritesStore.getState();
  store.setLoading(true);
  unsubscribe = onSnapshot(
    query(collection(db, 'favorites'), where('userId', '==', userId)),
    (snapshot) => {
      const list: Favorite[] = snapshot.docs.map((d) => {
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
      store.setFavorites(list);
      store.setError(null);
      store.setLoading(false);
    },
    (err) => {
      console.error('Error loading favorites:', err);
      store.setError(err.message);
      store.setLoading(false);
    }
  );
  activeUserId = userId;
}

function stop() {
  unsubscribe?.();
  unsubscribe = null;
  activeUserId = null;
  const store = useFavoritesStore.getState();
  store.setFavorites([]);
  store.setLoading(false);
}

// Deterministic id guarantees one favorite per user per target.
const favoriteId = (userId: string, type: FavoriteType, targetId: string) =>
  `${userId}_${type}_${targetId}`;

export function useFavorites() {
  const user = useAuthStore((s) => s.user);
  const { favorites, loading, error } = useFavoritesStore();
  const userId = user?.id ?? null;

  useEffect(() => {
    if (!userId) return;
    subscribers += 1;
    if (activeUserId !== userId) {
      if (unsubscribe) stop();
      start(userId);
    }
    return () => {
      subscribers -= 1;
      if (subscribers === 0) stop();
    };
  }, [userId]);

  const isFavorite = useCallback(
    (type: FavoriteType, targetId: string) =>
      favorites.some((f) => f.type === type && f.targetId === targetId),
    [favorites]
  );

  const addFavorite = useCallback(
    async (type: FavoriteType, targetId: string) => {
      if (!userId) throw new Error('Sign in to save favorites');
      await setDoc(doc(db, 'favorites', favoriteId(userId, type, targetId)), {
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
      await deleteDoc(doc(db, 'favorites', favoriteId(userId, type, targetId)));
    },
    [userId]
  );

  return { favorites, loading, error, isFavorite, addFavorite, removeFavorite };
}
