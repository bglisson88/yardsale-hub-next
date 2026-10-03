import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
} from 'firebase/firestore';
import { db } from './firebase';
import type { RatingBreakdown, Review } from '@/types';

export const MAX_COMMENT_LENGTH = 500;
export const RECENT_REVIEWS_LIMIT = 10;

export const reviewId = (sellerId: string, reviewerId: string) => `${sellerId}_${reviewerId}`;

const emptyBreakdown = (): RatingBreakdown => ({ '1': 0, '2': 0, '3': 0, '4': 0, '5': 0 });

const toReview = (id: string, data: Record<string, any>): Review => ({
  ...(data as Review),
  id,
  createdAt: data.createdAt?.toDate?.() ?? new Date(),
  updatedAt: data.updatedAt?.toDate?.() ?? new Date(),
});

export async function getReview(sellerId: string, reviewerId: string): Promise<Review | null> {
  const snap = await getDoc(doc(db, 'reviews', reviewId(sellerId, reviewerId)));
  return snap.exists() ? toReview(snap.id, snap.data()) : null;
}

// Client-side aggregation; a Cloud Function would be needed to make this tamper-proof.
export async function recalculateSellerRating(sellerId: string) {
  const snap = await getDocs(query(collection(db, 'reviews'), where('sellerId', '==', sellerId)));
  const ratingBreakdown = emptyBreakdown();
  let sum = 0;
  snap.forEach((d) => {
    const rating = Number(d.data().rating);
    if (rating >= 1 && rating <= 5) {
      ratingBreakdown[String(rating) as keyof RatingBreakdown] += 1;
      sum += rating;
    }
  });
  const totalReviews = Object.values(ratingBreakdown).reduce((a, b) => a + b, 0);
  const averageRating = totalReviews ? Math.round((sum / totalReviews) * 10) / 10 : 0;
  await updateDoc(doc(db, 'users', sellerId), { averageRating, totalReviews, ratingBreakdown });
  return { averageRating, totalReviews, ratingBreakdown };
}

export async function submitReview(
  sellerId: string,
  reviewer: { id: string; name: string; photoURL: string | null },
  rating: number,
  comment: string
) {
  if (reviewer.id === sellerId) throw new Error('You cannot review yourself.');
  if (!Number.isInteger(rating) || rating < 1 || rating > 5) throw new Error('Rating must be 1-5.');
  const trimmed = comment.trim();
  if (trimmed.length > MAX_COMMENT_LENGTH) throw new Error('Comment is too long.');

  const ref = doc(db, 'reviews', reviewId(sellerId, reviewer.id));
  const existing = await getDoc(ref);
  await setDoc(ref, {
    sellerId,
    reviewerId: reviewer.id,
    reviewerName: reviewer.name,
    reviewerPhotoURL: reviewer.photoURL,
    rating,
    comment: trimmed,
    createdAt: existing.exists() ? existing.data().createdAt : serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  return recalculateSellerRating(sellerId);
}

export async function deleteReview(sellerId: string, reviewerId: string) {
  await deleteDoc(doc(db, 'reviews', reviewId(sellerId, reviewerId)));
  return recalculateSellerRating(sellerId);
}

export async function fetchRecentReviews(sellerId: string, max = RECENT_REVIEWS_LIMIT): Promise<Review[]> {
  const snap = await getDocs(query(collection(db, 'reviews'), where('sellerId', '==', sellerId)));
  return snap.docs
    .map((d) => toReview(d.id, d.data()))
    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
    .slice(0, max);
}
