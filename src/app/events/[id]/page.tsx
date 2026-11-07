'use client';

import { useEffect, useState } from 'react';
import { doc, getDoc } from 'firebase/firestore';
import { Calendar, MapPin, ArrowLeft } from 'lucide-react';
import Link from 'next/link';
import { db } from '@/lib/firebase';
import { useItems } from '@/hooks';
import { EmptyState, LoadingSpinner } from '@/components';
import { categoryLabel } from '@/lib/categories';
import type { YardSaleEvent } from '@/types';

export default function EventDetails({ params }: { params: { id: string } }) {
  const [event, setEvent] = useState<YardSaleEvent | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const { items, loading: itemsLoading } = useItems(undefined, params.id);
  const activeItems = items.filter(item => !item.isSold);

  useEffect(() => {
    let active = true;
    const loadEvent = async () => {
      try {
        const snapshot = await getDoc(doc(db, 'yardSaleEvents', params.id));
        if (!snapshot.exists()) throw new Error('This yard sale event could not be found.');
        const data = snapshot.data();
        if (active) {
          setEvent({
            ...data,
            id: snapshot.id,
            startDate: data.startDate?.toDate(),
            endDate: data.endDate?.toDate(),
            createdAt: data.createdAt?.toDate(),
            updatedAt: data.updatedAt?.toDate(),
          } as YardSaleEvent);
        }
      } catch (loadError) {
        if (active) setError(loadError instanceof Error ? loadError.message : 'Unable to load this yard sale event.');
      } finally {
        if (active) setLoading(false);
      }
    };
    void loadEvent();
    return () => { active = false; };
  }, [params.id]);

  if (loading) {
    return <div className="min-h-screen flex items-center justify-center"><LoadingSpinner /></div>;
  }
  if (error || !event) {
    return (
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <p role="alert" className="text-red-700">{error || 'This yard sale event could not be found.'}</p>
        <Link href="/events" className="mt-4 inline-flex items-center gap-2 text-blue-600 hover:underline">
          <ArrowLeft size={16} aria-hidden="true" /> Back to events
        </Link>
      </div>
    );
  }

  const search = new URLSearchParams({ yardSaleId: event.id });
  return (
    <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
      <Link href="/events" className="mb-6 inline-flex items-center gap-2 text-blue-600 hover:underline">
        <ArrowLeft size={16} aria-hidden="true" /> Back to events
      </Link>
      <section className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm">
        {event.photoURL && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={event.photoURL} alt="" className="h-64 w-full object-cover sm:h-80" />
        )}
        <div className="p-6 sm:p-8">
          <h1 className="text-3xl font-bold text-gray-900">{event.title}</h1>
          <div className="mt-4 flex flex-wrap gap-x-6 gap-y-3 text-gray-600">
            <p className="flex items-center gap-2"><Calendar size={18} aria-hidden="true" />{event.startDate.toLocaleString()}</p>
            <p className="flex items-center gap-2"><MapPin size={18} aria-hidden="true" />{event.address}, {event.location}</p>
          </div>
          {event.description && <p className="mt-5 whitespace-pre-wrap text-gray-700">{event.description}</p>}
          <Link href={`/items/new?${search.toString()}`} className="mt-6 inline-flex rounded-lg bg-blue-600 px-5 py-3 font-semibold text-white hover:bg-blue-700">
            Add an item to this sale
          </Link>
        </div>
      </section>

      <section className="mt-10" aria-labelledby="sale-items-heading">
        <div className="mb-5 flex items-end justify-between gap-4">
          <div>
            <p className="text-sm text-gray-600">{activeItems.length} {activeItems.length === 1 ? 'item' : 'items'} in this sale</p>
            <h2 id="sale-items-heading" className="text-2xl font-bold text-gray-900">Items at this sale</h2>
          </div>
        </div>
        {itemsLoading ? <LoadingSpinner /> : activeItems.length === 0 ? (
          <EmptyState title="No items listed yet" description="Items added to this sale will appear here and in their regular categories." />
        ) : (
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
            {activeItems.map(item => (
              <Link
                key={item.id}
                href={`/items?${new URLSearchParams({ search: item.title })}`}
                className="overflow-hidden rounded-xl border border-gray-200 bg-white hover:shadow-md"
              >
                {item.photoURLs?.[0] ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={item.photoURLs[0]} alt={item.title} className="h-40 w-full object-cover" />
                ) : (
                  <div className="flex h-40 items-center justify-center bg-gray-100 text-gray-500">No photo</div>
                )}
                <div className="p-3">
                  <h3 className="line-clamp-2 font-semibold text-gray-900">{item.title}</h3>
                  <p className="mt-1 text-lg font-bold text-blue-600">${Number(item.price).toFixed(2)}</p>
                  <p className="mt-1 text-xs text-gray-600">{categoryLabel(item.category)}</p>
                </div>
              </Link>
            ))}
          </div>
        )}
      </section>
    </main>
  );
}
