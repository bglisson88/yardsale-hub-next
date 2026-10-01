'use client';

import { useEffect } from 'react';
import { collection, query, where, onSnapshot } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useItemStore } from '@/store';
import type { Item } from '@/types';

export function useItems(userId?: string, yardSaleId?: string) {
  const { items, setItems, setLoading, setError } = useItemStore();

  useEffect(() => {
    setLoading(true);
    let q;

    if (userId) {
      q = query(collection(db, 'items'), where('userId', '==', userId));
    } else if (yardSaleId) {
      q = query(collection(db, 'items'), where('yardSaleId', '==', yardSaleId));
    } else {
      q = query(collection(db, 'items'), where('isSold', '==', false));
    }

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const itemsList: Item[] = [];
      snapshot.forEach((doc) => {
        itemsList.push({
          ...doc.data(),
          id: doc.id,
          createdAt: doc.data().createdAt?.toDate(),
          updatedAt: doc.data().updatedAt?.toDate(),
        } as Item);
      });
      setItems(itemsList);
      setLoading(false);
    });

    return () => unsubscribe();
  }, [userId, yardSaleId, setItems, setLoading]);

  return { items, loading: useItemStore((state) => state.loading), error: useItemStore((state) => state.error) };
}
