'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { doc, getDoc } from 'firebase/firestore';
import { ArrowLeft, Calendar, MapPin, Package, Users } from 'lucide-react';
import { db } from '@/lib/firebase';
import { useItems } from '@/hooks';
import { LoadingSpinner, EmptyState, Avatar, ItemCard } from '@/components';
import type { YardSaleEvent } from '@/types';

function EventItems({ eventId }: { eventId: string }) {
  const { items } = useItems(undefined, eventId);
  if (items.length === 0) return null;
  return (
    <section className="mt-10">
      <h2 className="text-2xl font-bold text-gray-900 mb-4 flex items-center gap-2">
        <Package aria-hidden="true" /> Items at this sale
      </h2>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
        {items.map((item) => (
          <ItemCard key={item.id} item={item} />
        ))}
      </div>
    </section>
  );
}

export default function EventDetail() {
  const params = useParams<{ id: string }>();
  const id = params?.id;
  const [event, setEvent] = useState<YardSaleEvent | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!id) return;
    const load = async () => {
      try {
        const snap = await getDoc(doc(db, 'yardSaleEvents', id));
        if (snap.exists()) {
          const data = snap.data();
          setEvent({
            ...data,
            id: snap.id,
            startDate: data.startDate?.toDate(),
            endDate: data.endDate?.toDate(),
            createdAt: data.createdAt?.toDate?.(),
            updatedAt: data.updatedAt?.toDate?.(),
          } as YardSaleEvent);
        }
      } catch (error) {
        console.error('Error loading event:', error);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [id]);

  if (loading) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        <LoadingSpinner />
      </div>
    );
  }

  if (!event) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-12">
        <EmptyState title="Event not found" description="It may have been removed by the host." />
        <Link href="/events" className="block text-center mt-6 text-brand-700 font-semibold hover:underline">
          Back to Events
        </Link>
      </div>
    );
  }

  const fmt = (d: Date) =>
    `${d.toLocaleDateString()} ${d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
      <Link href="/events" className="flex items-center gap-2 text-brand-700 hover:text-brand-800 mb-6">
        <ArrowLeft size={20} /> Back to Events
      </Link>

      <div className="bg-white rounded-2xl shadow-lg overflow-hidden">
        {event.photoURL && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={event.photoURL} alt={event.title} className="w-full h-64 object-cover" />
        )}
        <div className="p-8">
          <h1 className="text-3xl font-extrabold text-gray-900">{event.title}</h1>

          <div className="flex items-center gap-3 mt-4">
            <Avatar src={event.posterPhotoURL} name={event.posterName} size={40} />
            <p className="text-gray-700">
              Hosted by <span className="font-semibold">{event.posterName || 'a neighbor'}</span>
            </p>
          </div>

          <div className="mt-6 space-y-3 text-gray-700">
            <div className="flex items-center gap-3">
              <Calendar size={20} className="text-brand-600" aria-hidden="true" />
              <span>{fmt(event.startDate)} – {fmt(event.endDate)}</span>
            </div>
            <div className="flex items-center gap-3">
              <MapPin size={20} className="text-brand-600" aria-hidden="true" />
              <span>{event.address}, {event.location}</span>
            </div>
            <div className="flex items-center gap-3">
              <Users size={20} className="text-brand-600" aria-hidden="true" />
              <span>{event.itemCount} items</span>
            </div>
          </div>

          {event.description && <p className="mt-6 text-gray-700 whitespace-pre-line">{event.description}</p>}
        </div>
      </div>

      <EventItems eventId={event.id} />
    </div>
  );
}
