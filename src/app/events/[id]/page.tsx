'use client';

import { useEffect, useState } from 'react';
import { doc, getDoc } from 'firebase/firestore';
import { Calendar, MapPin, Pencil, Users } from 'lucide-react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { db } from '@/lib/firebase';
import { useAuthContext } from '@/hooks';
import { useAuthStore } from '@/store';
import { LoadingSpinner } from '@/components';
import type { YardSaleEvent } from '@/types';
import { deleteOwnedEvent } from '@/lib/delete-event';
import toast from 'react-hot-toast';

function asDate(value: unknown): Date | undefined {
  if (value instanceof Date) return value;
  if (value && typeof value === 'object' && 'toDate' in value &&
      typeof value.toDate === 'function') {
    return value.toDate();
  }
  return undefined;
}

export default function EventDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const { user } = useAuthStore();
  useAuthContext();
  const [event, setEvent] = useState<YardSaleEvent | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [deleting, setDeleting] = useState(false);

  const handleDelete = async () => {
    if (!user || !event || deleting || user.id !== event.userId) return;
    if (!window.confirm('Delete this event? This cannot be undone.')) return;
    setDeleting(true);
    try {
      const warning = await deleteOwnedEvent(event.id, user.id);
      if (warning) toast.error(warning, { duration: 10000 });
      else toast.success('Event deleted.');
      router.push('/dashboard/events');
    } catch (deleteError) {
      toast.error(deleteError instanceof Error ? deleteError.message : 'Failed to delete event. Please try again.');
      setDeleting(false);
    }
  };

  useEffect(() => {
    let active = true;
    async function loadEvent() {
      try {
        const snapshot = await getDoc(doc(db, 'yardSaleEvents', params.id));
        if (!snapshot.exists()) throw new Error('Sale not found.');
        const data = snapshot.data();
        if (active) {
          setEvent({
            ...data,
            id: snapshot.id,
            startDate: asDate(data.startDate),
            endDate: asDate(data.endDate),
            createdAt: asDate(data.createdAt),
            updatedAt: asDate(data.updatedAt),
            locationVisibility: data.locationVisibility === 'exact' ? 'exact' : 'general',
          } as YardSaleEvent);
        }
      } catch (loadError) {
        if (active) setError(loadError instanceof Error ? loadError.message : 'Failed to load sale.');
      } finally {
        if (active) setLoading(false);
      }
    }
    void loadEvent();
    return () => { active = false; };
  }, [params.id]);

  if (loading) {
    return <div className="min-h-screen flex items-center justify-center"><LoadingSpinner /></div>;
  }
  if (error || !event) {
    return <div className="mx-auto max-w-3xl px-4 py-12"><p role="alert" className="mb-4 text-red-700">{error || 'Sale not found.'}</p><Link href="/events" className="text-blue-600 underline">Back to events</Link></div>;
  }

  const exactAddress = event.locationVisibility === 'exact' ? event.address?.trim() : '';
  const directionsURL = exactAddress
    ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(exactAddress)}`
    : '';

  return (
    <article className="mx-auto max-w-4xl px-4 sm:px-6 lg:px-8 py-10">
      <Link href="/events" className="mb-6 inline-block text-blue-600 hover:underline">← Back to events</Link>
      <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm">
        {event.photoURL && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={event.photoURL} alt={`${event.title} sale`} className="max-h-[28rem] w-full object-cover" />
        )}
        <div className="p-5 sm:p-8">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <h1 className="text-3xl font-bold text-gray-900">{event.title}</h1>
            {user?.id === event.userId && (
              <div className="flex flex-wrap gap-2">
                <Link href={`/events/${event.id}/edit`} className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 font-semibold text-white hover:bg-blue-700">
                  <Pencil size={16} aria-hidden="true" /> Edit Event
                </Link>
                <button type="button" onClick={handleDelete} disabled={deleting} className="rounded-lg bg-red-700 px-4 py-2 font-semibold text-white hover:bg-red-800 disabled:opacity-50">
                  {deleting ? 'Deleting...' : 'Delete Event'}
                </button>
              </div>
            )}
          </div>
          {event.description && <p className="mt-5 whitespace-pre-wrap text-gray-700">{event.description}</p>}

          <dl className="mt-6 space-y-4 text-gray-700">
            <div className="flex items-start gap-3">
              <Calendar size={20} className="mt-0.5 shrink-0 text-blue-600" aria-hidden="true" />
              <div>
                <dt className="font-semibold">Sale time</dt>
                <dd>
                  {event.startDate?.toLocaleDateString()} at {event.startDate?.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  {' – '}
                  {event.endDate?.toLocaleDateString()} at {event.endDate?.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </dd>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <MapPin size={20} className="mt-0.5 shrink-0 text-blue-600" aria-hidden="true" />
              <div>
                <dt className="font-semibold">Location</dt>
                <dd>{event.location}</dd>
                {exactAddress ? (
                  <>
                    <dd className="mt-1">{exactAddress}</dd>
                    <dd className="mt-2">
                      <a href={directionsURL} target="_blank" rel="noopener noreferrer" className="font-semibold text-blue-600 underline">
                        Get directions
                      </a>
                    </dd>
                  </>
                ) : (
                  <dd className="mt-1 text-sm text-gray-600">The organizer has chosen to share only a general location.</dd>
                )}
              </div>
            </div>
            <div className="flex items-center gap-3">
              <Users size={20} className="shrink-0 text-blue-600" aria-hidden="true" />
              <dt className="sr-only">Items at sale</dt>
              <dd>{event.itemCount} items at this sale</dd>
            </div>
          </dl>
        </div>
      </div>
    </article>
  );
}
