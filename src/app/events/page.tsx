'use client';

import { Suspense } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { EmptyState } from '@/components/EmptyState';
import { EventCard } from '@/components/EventCard';
import { LoadingSpinner } from '@/components/LoadingSpinner';
import { usePublicEvents } from '@/hooks';

function EventListings() {
  const searchParams = useSearchParams();
  const { events, loading, loadingMore, hasMore, error, loadMore } = usePublicEvents();
  const search = (searchParams.get('search') ?? '').trim().toLowerCase();
  const location = (searchParams.get('location') ?? '').trim().toLowerCase();
  const visibleEvents = events.filter(event =>
    (!search || `${event.title} ${event.description}`.toLowerCase().includes(search)) &&
    (!location || event.location.toLowerCase().includes(location)),
  );

  return (
    <main className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8">
      <div className="mb-8 flex items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Yard Sale Events</h1>
          <p className="mt-2 text-gray-600">Browse upcoming sales by general location.</p>
        </div>
        <Link href="/events/new" className="rounded-lg bg-blue-600 px-6 py-2 font-semibold text-white transition hover:bg-blue-700">
          Create Event
        </Link>
      </div>
      {loading ? (
        <div className="flex justify-center py-12"><LoadingSpinner /></div>
      ) : error ? (
        <p role="alert" className="rounded-xl border border-red-200 bg-white p-8 text-center text-red-700">{error}</p>
      ) : visibleEvents.length ? (
        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {visibleEvents.map(event => <EventCard key={event.id} event={event} />)}
        </div>
      ) : (
        <EmptyState
          title={search || location ? 'No matching events' : 'No upcoming events'}
          description="Try another search or check back later."
        />
      )}
      {!loading && !error && hasMore && (
        <div className="mt-8 text-center">
          <button
            type="button"
            onClick={() => void loadMore()}
            disabled={loadingMore}
            className="rounded-lg border border-gray-300 px-5 py-2 font-semibold text-gray-800 hover:bg-gray-50 disabled:opacity-50"
          >
            {loadingMore ? 'Loading...' : 'Load more events'}
          </button>
        </div>
      )}
      <p className="mt-8 text-sm text-gray-600">
        Event titles and descriptions are public. Do not include street addresses,
        access codes, or private contact information in free-text fields.
      </p>
    </main>
  );
}

export default function Events() {
  return (
    <Suspense fallback={<div className="mx-auto max-w-7xl px-4 py-12"><LoadingSpinner /></div>}>
      <EventListings />
    </Suspense>
  );
}
