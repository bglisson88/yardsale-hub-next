'use client';

import { useEffect, useState } from 'react';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { StarRating } from './StarRating';

interface Stats {
  averageRating: number;
  totalReviews: number;
}

const cache = new Map<string, Promise<Stats>>();

function loadStats(sellerId: string): Promise<Stats> {
  let p = cache.get(sellerId);
  if (!p) {
    p = getDoc(doc(db, 'users', sellerId))
      .then((snap) => {
        const d = snap.exists() ? snap.data() : {};
        return { averageRating: d.averageRating ?? 0, totalReviews: d.totalReviews ?? 0 };
      })
      .catch((error) => {
        cache.delete(sellerId);
        throw error;
      });
    cache.set(sellerId, p);
  }
  return p;
}

export function SellerRating({ sellerId, className = '' }: { sellerId?: string; className?: string }) {
  const [stats, setStats] = useState<Stats | null>(null);

  useEffect(() => {
    if (!sellerId) return;
    let active = true;
    loadStats(sellerId)
      .then((s) => active && setStats(s))
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [sellerId]);

  if (!sellerId || !stats) return null;
  return <StarRating average={stats.averageRating} count={stats.totalReviews} className={className} />;
}
