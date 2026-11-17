'use client';

import { useEffect, useRef, useState } from 'react';
import {
  collection, getDocs, limit, orderBy, query, startAfter, Timestamp, where,
  type QueryDocumentSnapshot,
} from 'firebase/firestore';
import { db } from '@/lib/firebase';
import type { PublicYardSaleEvent } from '@/types';

const MAX_PUBLIC_EVENTS = 50;

function toDate(value: unknown): Date | null {
  if (value instanceof Date) return value;
  if (value && typeof value === 'object' && 'toDate' in value &&
      typeof value.toDate === 'function') {
    const date = value.toDate();
    return date instanceof Date && !Number.isNaN(date.getTime()) ? date : null;
  }
  return null;
}

export function usePublicEvents() {
  const [events, setEvents] = useState<PublicYardSaleEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [error, setError] = useState('');
  const lastDocument = useRef<QueryDocumentSnapshot | null>(null);
  const loadingMoreRef = useRef(false);

  useEffect(() => {
    let active = true;
    async function loadFirstPage() {
      try {
        const snapshot = await getDocs(query(
          collection(db, 'publicYardSaleEvents'),
          where('startDate', '>=', Timestamp.now()),
          orderBy('startDate'),
          limit(MAX_PUBLIC_EVENTS),
        ));
        if (!active) return;
        const parsed = snapshot.docs.flatMap(parsePublicEvent);
        lastDocument.current = snapshot.docs[snapshot.docs.length - 1] ?? null;
        setEvents(parsed);
        setHasMore(snapshot.docs.length === MAX_PUBLIC_EVENTS);
        setError('');
      } catch {
        if (active) {
          setEvents([]);
          setError('Could not load public events. Please try again.');
        }
      } finally {
        if (active) setLoading(false);
      }
    }
    void loadFirstPage();
    return () => { active = false; };
  }, []);

  async function loadMore() {
    const cursor = lastDocument.current;
    if (!cursor || !hasMore || loadingMoreRef.current) return;
    loadingMoreRef.current = true;
    setLoadingMore(true);
    try {
      const snapshot = await getDocs(query(
        collection(db, 'publicYardSaleEvents'),
        where('startDate', '>=', Timestamp.now()),
        orderBy('startDate'),
        startAfter(cursor),
        limit(MAX_PUBLIC_EVENTS),
      ));
      const nextEvents = snapshot.docs.flatMap(parsePublicEvent);
      lastDocument.current = snapshot.docs[snapshot.docs.length - 1] ?? cursor;
      setEvents(current => [...current, ...nextEvents]);
      setHasMore(snapshot.docs.length === MAX_PUBLIC_EVENTS);
      setError('');
    } catch {
      setError('Could not load more public events. Please try again.');
    } finally {
      loadingMoreRef.current = false;
      setLoadingMore(false);
    }
  }

  return { events, loading, loadingMore, hasMore, error, loadMore };
}

function parsePublicEvent(document: {
  id: string;
  data(): Record<string, unknown>;
}): PublicYardSaleEvent[] {
  const data = document.data();
  const startDate = toDate(data.startDate);
  const endDate = toDate(data.endDate);
  const createdAt = toDate(data.createdAt);
  const updatedAt = toDate(data.updatedAt);
  if (
    data.schemaVersion !== 1 ||
    typeof data.title !== 'string' ||
    typeof data.description !== 'string' ||
    typeof data.location !== 'string' ||
    typeof data.locationId !== 'string' ||
    !['general', 'exact'].includes(String(data.locationVisibility)) ||
    !startDate ||
    !endDate ||
    !createdAt ||
    !updatedAt ||
    !(data.photoURL === null || typeof data.photoURL === 'string') ||
    !Number.isSafeInteger(data.itemCount) ||
    (data.itemCount as number) < 0
  ) return [];
  return [{
    id: document.id,
    title: data.title,
    description: data.description,
    location: data.location,
    locationId: data.locationId,
    locationVisibility: data.locationVisibility as 'general' | 'exact',
    startDate,
    endDate,
    photoURL: data.photoURL,
    createdAt,
    updatedAt,
    itemCount: data.itemCount as number,
  }];
}
