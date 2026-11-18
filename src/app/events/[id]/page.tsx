'use client';

import { useEffect, useState } from 'react';
import { onAuthStateChanged } from 'firebase/auth';
import { doc, getDocFromServer } from 'firebase/firestore';
import { Calendar, MapPin, Pencil, Users } from 'lucide-react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { auth, db } from '@/lib/firebase';
import { LoadingSpinner } from '@/components';
import { deleteOwnedEvent } from '@/lib/delete-event';
import { eventDate, parsePublicEvent } from '@/lib/public-event';
import toast from 'react-hot-toast';

interface EventDetail {
  id: string;
  title: string;
  description: string;
  location: string;
  locationVisibility: 'general' | 'exact';
  startDate: Date | null;
  endDate: Date | null;
  photoURL: string | null;
  itemCount: number;
}

interface DetailResult {
  id: string;
  viewer: string | null;
  event: EventDetail | null;
  isOwner: boolean;
  address: string;
  error: string;
}

function isPermissionDenied(error: unknown): boolean {
  return typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    error.code === 'permission-denied';
}

export default function EventDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const [viewer, setViewer] = useState<string | null | undefined>(undefined);
  const [result, setResult] = useState<DetailResult | null>(null);
  const [deleting, setDeleting] = useState(false);
  const id = params.id;
  const current = result?.id === id && result.viewer === viewer ? result : null;
  const event = current?.event;

  const handleDelete = async () => {
    if (!viewer || !current?.isOwner || !event || deleting || auth.currentUser?.uid !== viewer) return;
    if (!window.confirm('Delete this event? This cannot be undone.')) return;
    setDeleting(true);
    try {
      const warning = await deleteOwnedEvent(event.id, viewer);
      if (warning) toast.success(warning, { duration: 10000 });
      else toast.success('Event deleted.');
      router.push('/dashboard/events');
    } catch (deleteError) {
      toast.error(deleteError instanceof Error ? deleteError.message : 'Failed to delete event. Please try again.');
      setDeleting(false);
    }
  };

  useEffect(() => onAuthStateChanged(auth, user => setViewer(user?.uid ?? null)), []);

  useEffect(() => {
    if (viewer === undefined) return;
    const viewerId = viewer;
    let active = true;
    async function loadEvent() {
      const detail: DetailResult = {
        id, viewer: viewerId, event: null, isOwner: false, address: '', error: '',
      };
      let projectionFailed = false;
      try {
        const snapshot = await getDocFromServer(doc(db, 'publicYardSaleEvents', id));
        if (snapshot.exists()) detail.event = parsePublicEvent(snapshot);
      } catch (error) {
        projectionFailed = !isPermissionDenied(error);
      }

      let canReadAsPublic = viewerId === null;
      if (viewerId && active) {
        try {
          const snapshot = await getDocFromServer(doc(db, 'yardSaleEvents', id));
          const source = snapshot.data();
          if (source?.userId === viewerId) {
            detail.isOwner = true;
            detail.event ??= {
              id,
              title: typeof source.title === 'string' ? source.title : 'Sale',
              description: typeof source.description === 'string' ? source.description : '',
              location: typeof source.location === 'string' ? source.location : '',
              locationVisibility: source.locationVisibility === 'exact' ? 'exact' : 'general',
              startDate: eventDate(source.startDate),
              endDate: eventDate(source.endDate),
              photoURL: typeof source.photoURL === 'string' ? source.photoURL : null,
              itemCount: typeof source.itemCount === 'number' ? source.itemCount : 0,
            };
          }
        } catch (error) {
          // A denied owner lookup is normal for a signed-in visitor.
          canReadAsPublic = isPermissionDenied(error);
          if (!canReadAsPublic && !detail.event) projectionFailed = true;
        }
      }

      // Owners can read unpublished addresses in the editor. An owner read here
      // would not prove that the Rules granted access on the basis of consent.
      if (active && canReadAsPublic && detail.event?.locationVisibility === 'exact') {
        try {
          const snapshot = await getDocFromServer(doc(db, 'eventPrivate', id));
          const data = snapshot.data();
          if (data && data.userId !== viewerId && typeof data.address === 'string') {
            detail.address = data.address.trim();
          }
        } catch {
          // Keep the public projection visible when the separate address is unavailable.
        }
      }

      if (!detail.event) detail.error = projectionFailed ? 'Failed to load sale. Please try again.' : 'Sale not found.';
      if (active && (auth.currentUser?.uid ?? null) === viewerId) setResult(detail);
    }
    void loadEvent();
    return () => { active = false; };
  }, [id, viewer]);

  if (!current) {
    return <div className="min-h-screen flex items-center justify-center"><LoadingSpinner /></div>;
  }
  if (!event) {
    return <div className="mx-auto max-w-3xl px-4 py-12"><p role="alert" className="mb-4 text-red-700">{current.error}</p><Link href="/events" className="text-blue-600 underline">Back to events</Link></div>;
  }

  const exactAddress = current.address;
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
            {current.isOwner && (
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
                  <dd className="mt-1 text-sm text-gray-600">
                    {event.locationVisibility === 'exact'
                      ? current.isOwner
                        ? 'Manage the exact address in Edit Event.'
                        : 'The exact address is unavailable. Showing the general location.'
                      : 'The organizer has chosen to share only a general location.'}
                  </dd>
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
