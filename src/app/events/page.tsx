'use client';

import { Suspense, useState, useEffect } from 'react';
import dynamic from 'next/dynamic';
import { useSearchParams, useRouter } from 'next/navigation';
import { collection, query, where, getDocs, Timestamp } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { LoadingSpinner, EmptyState, EventCard } from '@/components';
import { List, Map as MapIcon, CalendarX } from 'lucide-react';
import Link from 'next/link';
import type { YardSaleEvent } from '@/types';
import { LocationSearch } from '@/components/LocationSearch';
import { useZipSearch } from '@/hooks/useZipSearch';
import { searchRadius } from '@/lib/location';

const EventsMap = dynamic(() => import('@/components/EventsMap'), {
  ssr: false,
  loading: () => (
    <div className="h-[500px] flex items-center justify-center bg-white rounded-2xl">
      <LoadingSpinner />
    </div>
  ),
});

function EventsContent() {
  const searchParams = useSearchParams();
  const locationFilter = searchParams.get('location');
  const router = useRouter();
  const [events, setEvents] = useState<YardSaleEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [view, setView] = useState<'list' | 'map'>('list');
  const nearby = useZipSearch(events, searchParams.get('zip') || '', searchRadius(searchParams.get('radius')));

  useEffect(() => {
    const fetchEvents = async () => {
      try {
        const q = query(collection(db, 'yardSaleEvents'), where('endDate', '>=', Timestamp.now()));
        const snapshot = await getDocs(q);
        const eventsList: YardSaleEvent[] = snapshot.docs.map((d) => {
          const data = d.data();
          return {
            ...data,
            id: d.id,
            startDate: data.startDate?.toDate(),
            endDate: data.endDate?.toDate(),
            createdAt: data.createdAt?.toDate?.(),
            updatedAt: data.updatedAt?.toDate?.(),
          } as YardSaleEvent;
        });
        setEvents(eventsList.sort((a, b) => a.startDate.getTime() - b.startDate.getTime()));
      } catch (error) {
        console.error('Error fetching events:', error);
        setError('Unable to load events. Please try again.');
      } finally {
        setLoading(false);
      }
    };

    fetchEvents();
  }, []);

  const search = searchParams.get('search') || '';
  const filteredEvents = nearby.records.filter((event) =>
    (!locationFilter || event.location === locationFilter) &&
    (!search || `${event.title} ${event.description || ''}`.toLowerCase().includes(search.toLowerCase())));

  const toggle = (active: boolean) =>
    `flex items-center gap-2 px-4 py-2 text-sm font-semibold transition ${
      active ? 'bg-brand-600 text-white' : 'bg-white text-gray-700 hover:bg-brand-50'
    }`;

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
      <div className="flex flex-wrap gap-4 justify-between items-center mb-8">
        <div>
          <h1 className="text-3xl font-extrabold text-gray-900">Yard Sale Events</h1>
          <p className="text-gray-600 mt-2">{filteredEvents.length} upcoming events</p>
        </div>
        <div className="flex items-center gap-3">
          <div className="inline-flex rounded-xl overflow-hidden border border-gray-200" role="group" aria-label="View mode">
            <button className={toggle(view === 'list')} onClick={() => setView('list')} aria-pressed={view === 'list'}>
              <List size={16} aria-hidden="true" /> List
            </button>
            <button className={toggle(view === 'map')} onClick={() => setView('map')} aria-pressed={view === 'map'}>
              <MapIcon size={16} aria-hidden="true" /> Map
            </button>
          </div>
          <Link href="/events/new" className="btn-primary !py-2 text-sm">
            Create Event
          </Link>
        </div>
      </div>

      <div className="space-y-3 mb-6">
        <form onSubmit={(event) => {
          event.preventDefault();
          const next = new URLSearchParams(searchParams.toString());
          const value = new FormData(event.currentTarget).get('search')?.toString().trim() || '';
          if (value) next.set('search', value); else next.delete('search');
          router.replace(`/events?${next}`, { scroll: false });
        }} className="flex gap-2">
          <input key={search} name="search" type="search" aria-label="Search events" placeholder="Search events..."
            defaultValue={search} className="min-w-0 flex-1 px-4 py-2 border border-gray-300 rounded-lg" />
          <button type="submit" className="btn-primary !py-2">Search</button>
        </form>
        <LocationSearch />
        {nearby.warning && <p className="text-sm text-gray-600" role="status">{nearby.warning}</p>}
        {(nearby.error || nearby.warning) && <button type="button" onClick={nearby.retry} className="text-sm text-brand-700 underline">Refresh location results</button>}
      </div>
      {loading || nearby.loading ? <LoadingSpinner /> : error || nearby.error ? (
        <EmptyState title="Couldn't load events" description={error || nearby.error} />
      ) : view === 'map' ? (
        <EventsMap events={filteredEvents} />
      ) : filteredEvents.length === 0 ? (
        <EmptyState
          icon={<CalendarX size={48} />}
          title="No events found"
          description="Check back soon for upcoming yard sales in your area"
        />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredEvents.map((event) => (
            <EventCard key={event.id} event={event} />
          ))}
        </div>
      )}
    </div>
  );
}

export default function Events() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center">
          <LoadingSpinner />
        </div>
      }
    >
      <EventsContent />
    </Suspense>
  );
}
