'use client';

import { useEffect, useState } from 'react';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { StarRating } from './StarRating';

interface Stats {
  averageRating?: number;
  totalReviews?: number;
}

const cache = new Map<string, Promise<Stats>>();

export function invalidateSellerRating(sellerId: string) {
  cache.delete(sellerId);
}

function loadStats(sellerId: string): Promise<Stats> {
  let p = cache.get(sellerId);
  if (!p) {
    p = getDoc(doc(db, 'users', sellerId))
      .then((snap) => (snap.exists() ? (snap.data() as Stats) : {}))
      .catch(() => {
        cache.delete(sellerId);
        return {};
      });
    cache.set(sellerId, p);
  }
  return p;
}

export function SellerRating({ sellerId, size }: { sellerId: string; size?: number }) {
  const [stats, setStats] = useState<Stats | null>(null);

  useEffect(() => {
    let active = true;
    loadStats(sellerId).then((s) => active && setStats(s));
    return () => {
      active = false;
    };
  }, [sellerId]);

  if (!stats) return null;
  return <StarRating rating={stats.averageRating} totalReviews={stats.totalReviews} size={size} />;
}
