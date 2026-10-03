'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Star } from 'lucide-react';
import toast from 'react-hot-toast';
import { useAuthStore } from '@/store';
import { getReview, submitReview, MAX_COMMENT_LENGTH } from '@/lib/reviews';

interface ReviewFormProps {
  sellerId: string;
  onSubmitted?: () => void;
}

export function ReviewForm({ sellerId, onSubmitted }: ReviewFormProps) {
  const { user } = useAuthStore();
  const [rating, setRating] = useState(0);
  const [comment, setComment] = useState('');
  const [existing, setExisting] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!user) return;
    let active = true;
    getReview(sellerId, user.id)
      .then((r) => {
        if (!active || !r) return;
        setExisting(true);
        setRating(r.rating);
        setComment(r.comment);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
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
    if (rating < 1) {
      toast.error('Please select a star rating');
      return;
    }
    setSaving(true);
    try {
      await submitReview(
        sellerId,
        { id: user.id, name: user.displayName || 'Neighbor', photoURL: user.photoURL ?? null },
        rating,
        comment
      );
      setExisting(true);
      toast.success(existing ? 'Review updated' : 'Review submitted');
      onSubmitted?.();
    } catch (error) {
      console.error('Error submitting review:', error);
      toast.error('Could not save review');
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
          >
            <Star size={28} className={n <= rating ? 'text-amber-500 fill-amber-500' : 'text-gray-300'} />
          </button>
        ))}
      </div>
      <textarea
        value={comment}
        onChange={(e) => setComment(e.target.value)}
        maxLength={MAX_COMMENT_LENGTH}
        rows={3}
        placeholder="Add a comment (optional)"
        className="w-full rounded-lg border border-gray-300 p-2 text-sm"
      />
      <div className="flex items-center justify-between">
        <span className="text-xs text-gray-500">
          {comment.length}/{MAX_COMMENT_LENGTH}
        </span>
        <button type="submit" disabled={saving} className="btn-primary">
          {saving ? 'Saving...' : existing ? 'Update review' : 'Submit review'}
        </button>
      </div>
    </form>
  );
}
