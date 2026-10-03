'use client';

import { format } from 'date-fns';
import { Avatar } from './Avatar';
import { StarRating } from './StarRating';
import type { Review } from '@/types';

export function ReviewList({ reviews }: { reviews: Review[] }) {
  if (reviews.length === 0) {
    return <p className="text-gray-500 text-sm">No reviews yet.</p>;
  }
  return (
    <ul className="space-y-4">
      {reviews.map((r) => (
        <li key={r.id} className="flex gap-3 p-4 bg-white rounded-2xl border border-gray-100">
          <Avatar src={r.reviewerPhotoURL} name={r.reviewerName} size={40} />
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-x-3">
              <span className="font-semibold text-gray-900">{r.reviewerName || 'Neighbor'}</span>
              <StarRating rating={r.rating} totalReviews={1} compact />
              <span className="text-xs text-gray-500">{format(r.createdAt, 'MMM d, yyyy')}</span>
            </div>
            {r.comment && <p className="mt-1 text-gray-700 text-sm whitespace-pre-line break-words">{r.comment}</p>}
          </div>
        </li>
      ))}
    </ul>
  );
}
