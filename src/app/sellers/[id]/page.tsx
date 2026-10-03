'use client';

import { useCallback, useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { doc, getDoc } from 'firebase/firestore';
import { ArrowLeft, Star } from 'lucide-react';
import { db } from '@/lib/firebase';
import { fetchRecentReviews } from '@/lib/reviews';
import { Avatar, EmptyState, LoadingSpinner, ReviewForm, ReviewList, StarRating } from '@/components';
import type { Review, User } from '@/types';

export default function SellerPage() {
  const params = useParams<{ id: string }>();
  const id = params?.id;
  const [seller, setSeller] = useState<User | null>(null);
  const [reviews, setReviews] = useState<Review[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!id) return;
    try {
      const snap = await getDoc(doc(db, 'users', id));
      if (snap.exists()) setSeller({ ...snap.data(), id: snap.id } as User);
      else setSeller(null);
      setReviews(await fetchRecentReviews(id));
    } catch (error) {
      console.error('Error loading seller:', error);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  if (loading) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        <LoadingSpinner />
      </div>
    );
  }

  if (!seller || !id) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-12">
        <EmptyState title="Seller not found" description="This profile may not exist." />
      </div>
    );
  }

  const total = seller.totalReviews ?? 0;
  const breakdown = seller.ratingBreakdown;

  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 py-10">
      <Link href="/items" className="flex items-center gap-2 text-brand-700 hover:text-brand-800 mb-6">
        <ArrowLeft size={20} /> Back to Browse
      </Link>

      <div className="flex items-center gap-4">
        <Avatar src={seller.photoURL} name={seller.displayName} size={64} />
        <div>
          <h1 className="text-2xl font-extrabold text-gray-900">{seller.displayName || 'Neighbor'}</h1>
          <StarRating average={seller.averageRating} count={total} size={18} />
        </div>
      </div>

      {total > 0 && (
        <div className="mt-8 space-y-1">
          {([5, 4, 3, 2, 1] as const).map((n) => {
            const count = breakdown?.[String(n) as '1'] ?? 0;
            return (
              <div key={n} className="flex items-center gap-2 text-sm">
                <span className="w-8 flex items-center gap-0.5">
                  {n} <Star size={12} className="text-amber-500 fill-amber-500" aria-hidden="true" />
                </span>
                <div className="flex-1 h-2 bg-gray-100 rounded-full overflow-hidden">
                  <div className="h-full bg-amber-500" style={{ width: `${(count / total) * 100}%` }} />
                </div>
                <span className="w-8 text-right text-gray-600">{count}</span>
              </div>
            );
          })}
        </div>
      )}

      <section className="mt-8">
        <h2 className="font-bold text-gray-900 mb-2">Rate this seller</h2>
        <ReviewForm sellerId={id} onSubmitted={load} />
      </section>

      <section className="mt-8">
        <h2 className="font-bold text-gray-900 mb-3">Recent reviews</h2>
        <ReviewList reviews={reviews} />
      </section>
    </div>
  );
}
