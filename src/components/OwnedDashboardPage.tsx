'use client';

import { useEffect, useState } from 'react';
import { collection, onSnapshot, query, where } from 'firebase/firestore';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { db } from '@/lib/firebase';
import { useAuthContext } from '@/hooks';
import { useAuthStore } from '@/store';
import { LoadingSpinner } from '@/components/LoadingSpinner';
import { ItemCard } from '@/components/ItemCard';
import type { Item, YardSaleEvent } from '@/types';

export default function OwnedDashboardPage({ kind }: { kind: 'items' | 'events' }) {
  const { user, loading } = useAuthStore();
  useAuthContext();
  const router = useRouter();
  const [records, setRecords] = useState<{ owner: string; items: Item[]; events: YardSaleEvent[] } | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!loading && !user) router.replace(`/auth/login?returnTo=${encodeURIComponent(`/dashboard/${kind}`)}`);
  }, [loading, user, router, kind]);

  useEffect(() => {
    if (!user) return;
    setRecords(null);
    setError('');
    const owner = user.id;
    const q = query(collection(db, kind === 'items' ? 'items' : 'yardSaleEvents'), where('userId', '==', owner));
    return onSnapshot(q, snapshot => {
      if (kind === 'items') {
        const items = snapshot.docs.map(record => ({ ...record.data(), id: record.id } as Item));
        setRecords({ owner, items, events: [] });
      } else {
        const events = snapshot.docs.map(record => {
          const data = record.data();
          return {
            ...data, id: record.id,
            startDate: data.startDate?.toDate(),
          } as YardSaleEvent;
        });
        setRecords({ owner, items: [], events });
      }
    }, () => setError(`Could not load your ${kind}. Please try again.`));
  }, [user?.id, kind]);

  if (loading || (user && !records && !error)) return <div className="min-h-screen flex items-center justify-center"><LoadingSpinner /></div>;
  if (!user) return null;
  const current = records?.owner === user.id ? records : null;
  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
      <Link href="/dashboard" className="text-blue-600 hover:underline">← Back to dashboard</Link>
      <div className="flex flex-wrap justify-between items-center gap-4 my-8">
        <h1 className="text-3xl font-bold text-gray-900">My {kind === 'items' ? 'Items' : 'Events'}</h1>
        <Link href={kind === 'items' ? '/items/new' : '/events/new'} className="rounded-lg bg-blue-600 px-4 py-2 font-semibold text-white hover:bg-blue-700">
          {kind === 'items' ? 'Post Item' : 'Create Event'}
        </Link>
      </div>
      {error ? <p role="alert" className="text-red-700">{error}</p> : kind === 'items' ? (
        current?.items.length ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {current.items.map(item => (
              <div key={item.id}>
                <ItemCard item={item} />
                <p className="mt-2 font-semibold text-gray-700">{item.isSold ? 'Sold' : 'Active'}</p>
                <Link href={`/items/${encodeURIComponent(item.id)}/edit`} className="text-blue-600 underline">Edit listing</Link>
              </div>
            ))}
          </div>
        ) : <p className="text-gray-600">You have no listings yet.</p>
      ) : current?.events.length ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {current.events.map(event => (
            <Link key={event.id} href={`/events/${encodeURIComponent(event.id)}`} className="rounded-xl border border-gray-200 bg-white p-6 hover:shadow-lg">
              <h2 className="font-bold text-lg text-gray-900">{event.title}</h2>
              <p className="mt-2 text-gray-600">{event.startDate?.toLocaleString()}</p>
              <p className="text-gray-600">{event.location}</p>
            </Link>
          ))}
        </div>
      ) : <p className="text-gray-600">You have no events yet.</p>}
    </div>
  );
}
