'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Star } from 'lucide-react';
import toast from 'react-hot-toast';
import { useAuthStore } from '@/store';
import { invalidateSellerRating } from './SellerRating';
import { MAX_COMMENT_LENGTH, getUserReview, submitReview } from '@/lib/reviews';

interface ReviewFormProps {
  sellerId: string;
  onSubmitted?: () => void;
}

export function ReviewForm({ sellerId, onSubmitted }: ReviewFormProps) {
  const { user } = useAuthStore();
  const [rating, setRating] = useState(0);
  const [hover, setHover] = useState(0);
  const [comment, setComment] = useState('');
  const [hasExisting, setHasExisting] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!user) return;
    getUserReview(sellerId, user.id)
      .then((r) => {
        if (r) {
          setRating(r.rating);
          setComment(r.comment || '');
          setHasExisting(true);
        }
      })
      .catch((e) => console.error('Error loading your review:', e));
  }, [sellerId, user]);

  if (!user) {
    return (
      <p className="text-sm text-gray-600">
        <Link href="/auth/login" className="text-brand-700 font-semibold hover:underline">
          Sign in
        </Link>{' '}
        to rate this seller.
      </p>
    );
  }
  if (user.id === sellerId) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!rating) {
      toast.error('Please choose a star rating');
      return;
    }
    setSaving(true);
    try {
      await submitReview({
        sellerId,
        reviewerId: user.id,
        reviewerName: user.displayName,
        reviewerPhotoURL: user.photoURL,
        rating,
        comment,
      });
      invalidateSellerRating(sellerId);
      toast.success(hasExisting ? 'Review updated' : 'Review submitted');
      setHasExisting(true);
      onSubmitted?.();
    } catch (error: any) {
      toast.error(error?.message || 'Could not save review');
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <div className="flex gap-1" role="radiogroup" aria-label="Rating">
        {[1, 2, 3, 4, 5].map((n) => (
          <button
            key={n}
            type="button"
            role="radio"
            aria-checked={rating === n}
            aria-label={`${n} star${n > 1 ? 's' : ''}`}
            onClick={() => setRating(n)}
            onMouseEnter={() => setHover(n)}
            onMouseLeave={() => setHover(0)}
          >
            <Star
              size={28}
              className={n <= (hover || rating) ? 'text-amber-400 fill-amber-400' : 'text-gray-300'}
            />
          </button>
        ))}
      </div>
      <div>
        <textarea
          value={comment}
          onChange={(e) => setComment(e.target.value)}
          maxLength={MAX_COMMENT_LENGTH}
          rows={3}
          placeholder="Write a review (optional)"
          className="w-full border border-gray-300 rounded-lg p-3 text-sm"
        />
        <p className="text-xs text-gray-500 text-right">
          {comment.length}/{MAX_COMMENT_LENGTH}
        </p>
      </div>
      <button type="submit" disabled={saving} className="btn-primary">
        {saving ? 'Saving...' : hasExisting ? 'Update review' : 'Submit review'}
      </button>
    </form>
  );
}
