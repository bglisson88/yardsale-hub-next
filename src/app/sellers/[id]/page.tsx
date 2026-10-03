'use client';

import { useCallback, useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { doc, getDoc } from 'firebase/firestore';
import { ArrowLeft, MapPin } from 'lucide-react';
import { db } from '@/lib/firebase';
import { getRecentReviews } from '@/lib/reviews';
import { LoadingSpinner, EmptyState, Avatar, StarRating, ReviewForm, ReviewList } from '@/components';
import type { Review, User } from '@/types';

export default function SellerProfile() {
  const params = useParams<{ id: string }>();
  const id = params?.id;
  const [seller, setSeller] = useState<User | null>(null);
  const [reviews, setReviews] = useState<Review[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!id) return;
    try {
      const snap = await getDoc(doc(db, 'users', id));
      if (snap.exists()) setSeller({ ...(snap.data() as User), id: snap.id });
      else setSeller(null);
      try {
        setReviews(await getRecentReviews(id, 10));
      } catch (error) {
        console.error('Error loading reviews:', error);
      }
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
        <EmptyState title="Seller not found" description="This profile may no longer exist." />
      </div>
    );
  }

  const total = seller.totalReviews || 0;
  const breakdown = seller.ratingBreakdown || {};

  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
      <Link href="/items" className="flex items-center gap-2 text-brand-700 hover:text-brand-800 mb-6">
        <ArrowLeft size={20} /> Back to Browse
      </Link>

      <div className="flex items-center gap-4 p-6 bg-white rounded-2xl border border-gray-100 shadow-sm">
        <Avatar src={seller.photoURL} name={seller.displayName} size={72} />
        <div>
          <h1 className="text-2xl font-extrabold text-gray-900">{seller.displayName}</h1>
          <StarRating rating={seller.averageRating} totalReviews={total} size={18} />
          {seller.location && (
            <p className="flex items-center gap-1 text-sm text-gray-600 mt-1">
              <MapPin size={14} aria-hidden="true" /> {seller.location}
            </p>
          )}
        </div>
      </div>

      {total > 0 && (
        <div className="mt-6 space-y-1">
          {[5, 4, 3, 2, 1].map((n) => {
            const count = breakdown[String(n)] || 0;
            return (
              <div key={n} className="flex items-center gap-2 text-sm text-gray-700">
                <span className="w-14">{n} star{n > 1 ? 's' : ''}</span>
                <div className="flex-1 h-2 bg-gray-100 rounded-full overflow-hidden">
                  <div className="h-full bg-amber-400" style={{ width: `${(count / total) * 100}%` }} />
                </div>
                <span className="w-6 text-right">{count}</span>
              </div>
            );
          })}
        </div>
      )}

      <section className="mt-8 p-4 bg-white rounded-2xl border border-gray-100 shadow-sm">
        <h2 className="font-bold text-gray-900 mb-3">Leave a review</h2>
        <ReviewForm sellerId={id} onSubmitted={load} />
      </section>

      <section className="mt-8">
        <h2 className="font-bold text-gray-900 mb-3">Recent reviews</h2>
        <ReviewList reviews={reviews} />
      </section>
    </div>
  );
}
