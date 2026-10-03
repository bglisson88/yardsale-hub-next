'use client';

import { useEffect, useState } from 'react';
import { collection, query, where, onSnapshot } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import type { Item } from '@/types';

export function useItems(userId?: string, yardSaleId?: string) {
  const [items, setItems] = useState<Item[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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

    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const itemsList: Item[] = snapshot.docs.map((d) => {
          const data = d.data();
          return {
            ...data,
            id: d.id,
            photoURLs: data.photoURLs || [],
            createdAt: data.createdAt?.toDate?.() ?? new Date(0),
            updatedAt: data.updatedAt?.toDate?.() ?? new Date(0),
          } as Item;
        });
        itemsList.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
        setItems(itemsList);
        setError(null);
        setLoading(false);
      },
      (err) => {
        console.error('Error loading items:', err);
        setError(err.message);
        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, [userId, yardSaleId]);

  return { items, loading, error };
}
