'use client';

import { format } from 'date-fns';
import { Avatar } from './Avatar';
import { StarRating } from './StarRating';
import type { Review } from '@/types';

export function ReviewList({ reviews }: { reviews: Review[] }) {
  if (reviews.length === 0) {
    return <p className="text-sm text-gray-500">No reviews yet.</p>;
  }
  return (
    <ul className="space-y-4">
      {reviews.map((r) => (
        <li key={r.id} className="p-4 bg-white rounded-2xl border border-gray-100 shadow-sm">
          <div className="flex items-center gap-3">
            <Avatar src={r.reviewerPhotoURL} name={r.reviewerName} size={36} />
            <div>
              <p className="font-semibold text-gray-900">{r.reviewerName}</p>
              <div className="flex items-center gap-2">
                <StarRating average={r.rating} count={1} />
                <span className="text-xs text-gray-500">{format(r.createdAt, 'MMM d, yyyy')}</span>
              </div>
            </div>
          </div>
          {r.comment && <p className="mt-3 text-gray-700 whitespace-pre-line">{r.comment}</p>}
        </li>
      ))}
    </ul>
  );
}
