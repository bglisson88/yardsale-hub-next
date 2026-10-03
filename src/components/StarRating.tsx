'use client';

import { Star } from 'lucide-react';

interface StarRatingProps {
  rating?: number;
  totalReviews?: number;
  size?: number;
  compact?: boolean;
  className?: string;
}

export function StarRating({ rating = 0, totalReviews = 0, size = 14, compact = false, className = '' }: StarRatingProps) {
  if (!totalReviews) {
    return <span className={`text-xs text-gray-500 ${className}`}>No ratings yet</span>;
  }
  return (
    <span
      className={`inline-flex items-center gap-1 text-sm text-gray-700 ${className}`}
      aria-label={`${rating} out of 5 stars from ${totalReviews} reviews`}
    >
      <span className="flex" aria-hidden="true">
        {[1, 2, 3, 4, 5].map((n) => (
          <Star
            key={n}
            size={size}
            className={n <= Math.round(rating) ? 'text-amber-400 fill-amber-400' : 'text-gray-300'}
          />
        ))}
      </span>
      {!compact && (
        <>
          <span className="font-semibold">{rating.toFixed(1)}</span>
          <span className="text-gray-500">({totalReviews})</span>
        </>
      )}
    </span>
  );
}
