'use client';

import { Star } from 'lucide-react';

interface StarRatingProps {
  average?: number | null;
  count?: number | null;
  size?: number;
  className?: string;
}

export function StarRating({ average, count, size = 14, className = '' }: StarRatingProps) {
  const total = count ?? 0;
  if (!total) {
    return <span className={`text-xs text-gray-500 ${className}`}>No ratings yet</span>;
  }
  const avg = average ?? 0;
  return (
    <span
      className={`inline-flex items-center gap-1 text-xs text-gray-600 ${className}`}
      aria-label={`${avg.toFixed(1)} out of 5 stars from ${total} ${total === 1 ? 'review' : 'reviews'}`}
    >
      <span className="inline-flex" aria-hidden="true">
        {[1, 2, 3, 4, 5].map((n) => (
          <Star
            key={n}
            size={size}
            className={n <= Math.round(avg) ? 'text-amber-500 fill-amber-500' : 'text-gray-300'}
          />
        ))}
      </span>
      <span className="font-semibold text-gray-800">{avg.toFixed(1)}</span>
      <span>({total})</span>
    </span>
  );
}
