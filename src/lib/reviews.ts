import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  limit,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
} from 'firebase/firestore';
import { db } from '@/lib/firebase';
import type { Review } from '@/types';

export const MAX_COMMENT_LENGTH = 500;

// One review per buyer per seller: the document ID encodes the pair.
export const reviewId = (sellerId: string, reviewerId: string) => `${sellerId}_${reviewerId}`;

export function mapReview(id: string, data: Record<string, any>): Review {
  return {
    ...(data as Review),
    id,
    createdAt: data.createdAt?.toDate?.() ?? new Date(),
    updatedAt: data.updatedAt?.toDate?.() ?? new Date(),
  };
}

export async function getUserReview(sellerId: string, reviewerId: string): Promise<Review | null> {
  const snap = await getDoc(doc(db, 'reviews', reviewId(sellerId, reviewerId)));
  return snap.exists() ? mapReview(snap.id, snap.data()) : null;
}

export async function getRecentReviews(sellerId: string, count = 10): Promise<Review[]> {
  const snap = await getDocs(
    query(
      collection(db, 'reviews'),
      where('sellerId', '==', sellerId),
      orderBy('createdAt', 'desc'),
      limit(count)
    )
  );
  return snap.docs.map((d) => mapReview(d.id, d.data()));
}

// Recalculate the seller's averageRating / totalReviews / ratingBreakdown from all reviews.
export async function recalculateSellerRating(sellerId: string) {
  const snap = await getDocs(query(collection(db, 'reviews'), where('sellerId', '==', sellerId)));
  const breakdown: Record<string, number> = { '1': 0, '2': 0, '3': 0, '4': 0, '5': 0 };
  let sum = 0;
  snap.docs.forEach((d) => {
    const r = Number(d.data().rating);
    sum += r;
    breakdown[String(r)] = (breakdown[String(r)] || 0) + 1;
  });
  const totalReviews = snap.size;
  const averageRating = totalReviews ? Math.round((sum / totalReviews) * 10) / 10 : 0;
  await updateDoc(doc(db, 'users', sellerId), {
    averageRating,
    totalReviews,
    ratingBreakdown: breakdown,
  });
  return { averageRating, totalReviews, ratingBreakdown: breakdown };
}

interface SubmitArgs {
  sellerId: string;
  reviewerId: string;
  reviewerName?: string;
  reviewerPhotoURL?: string | null;
  rating: number;
  comment: string;
}

export async function submitReview(args: SubmitArgs) {
  const { sellerId, reviewerId, rating } = args;
  if (!reviewerId) throw new Error('You must be signed in to leave a review.');
  if (sellerId === reviewerId) throw new Error('You cannot review yourself.');
  if (!Number.isInteger(rating) || rating < 1 || rating > 5) throw new Error('Choose a rating from 1 to 5.');
  const comment = args.comment.trim();
  if (comment.length > MAX_COMMENT_LENGTH) throw new Error(`Comment must be ${MAX_COMMENT_LENGTH} characters or fewer.`);

  const ref = doc(db, 'reviews', reviewId(sellerId, reviewerId));
  const existing = await getDoc(ref);
  if (existing.exists()) {
    await updateDoc(ref, {
      rating,
      comment,
      reviewerName: args.reviewerName || 'Neighbor',
      reviewerPhotoURL: args.reviewerPhotoURL || null,
      updatedAt: serverTimestamp(),
    });
  } else {
    await setDoc(ref, {
      sellerId,
      reviewerId,
      reviewerName: args.reviewerName || 'Neighbor',
      reviewerPhotoURL: args.reviewerPhotoURL || null,
      rating,
      comment,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  }
  return recalculateSellerRating(sellerId);
}

export async function deleteReview(sellerId: string, reviewerId: string) {
  await deleteDoc(doc(db, 'reviews', reviewId(sellerId, reviewerId)));
  return recalculateSellerRating(sellerId);
}
