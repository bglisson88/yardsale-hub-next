'use client';

import { useEffect, useState } from 'react';
import { collection, onSnapshot, query, where } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useAuthStore } from '@/store';
import type { FavoriteType } from '@/types';

// Live count of users who favorited a target. Requires a signed-in user.
export function useFavoriteCount(type: FavoriteType, targetId: string) {
  const userId = useAuthStore((s) => s.user?.id);
  const [count, setCount] = useState(0);

  useEffect(() => {
    if (!userId || !targetId) {
      setCount(0);
      return;
    }
    const unsub = onSnapshot(
      query(
        collection(db, 'favorites'),
        where('type', '==', type),
        where('targetId', '==', targetId)
      ),
      (snap) => setCount(snap.size),
      (err) => console.error('Error loading favorite count:', err)
    );
    return unsub;
  }, [userId, type, targetId]);

  return count;
}
