'use client';

import { useState, useEffect } from 'react';
import { collection, query, where, getDocs, Timestamp } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { LoadingSpinner, EmptyState } from '@/components';
import { Calendar, MapPin, Users } from 'lucide-react';
import Link from 'next/link';
import type { YardSaleEvent } from '@/types';

interface SearchParams {
  location?: string;
  date?: string;
}

export default function Events({ searchParams }: { searchParams: SearchParams }) {
  const [events, setEvents] = useState<YardSaleEvent[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchEvents = async () => {
      try {
        const q = query(collection(db, 'yardSaleEvents'), where('startDate', '>=', Timestamp.now()));
        const snapshot = await getDocs(q);
        const eventsList: YardSaleEvent[] = [];
        snapshot.forEach((doc) => {
          eventsList.push({
            ...doc.data(),
            id: doc.id,
            startDate: doc.data().startDate?.toDate(),
            endDate: doc.data().endDate?.toDate(),
            createdAt: doc.data().createdAt?.toDate(),
            updatedAt: doc.data().updatedAt?.toDate(),
          } as YardSaleEvent);
        });
        setEvents(eventsList.sort((a, b) => a.startDate.getTime() - b.startDate.getTime()));
      } catch (error) {
        console.error('Error fetching events:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchEvents();
  }, []);

  const filteredEvents = events.filter((event) => {
    if (searchParams.location && event.location !== searchParams.location) {
      return false;
    }
    return true;
  });

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <LoadingSpinner />
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
      <div className="flex justify-between items-center mb-8">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Yard Sale Events</h1>
          <p className="text-gray-600 mt-2">{filteredEvents.length} upcoming events</p>
        </div>
        <Link
          href="/events/new"
          className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition font-semibold"
        >
          Create Event
        </Link>
      </div>

      {filteredEvents.length === 0 ? (
        <EmptyState
          title="No events found"
          description="Check back soon for upcoming yard sales in your area"
        />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredEvents.map((event) => (
            <Link
              key={event.id}
              href={`/events/${event.id}`}
              className="bg-white rounded-xl border border-gray-200 overflow-hidden hover:shadow-lg transition"
            >
              {event.photoURL && (
                <div className="h-40 bg-gray-100 overflow-hidden">
                  <img src={event.photoURL} alt={event.title} className="w-full h-full object-cover" />
                </div>
              )}
              <div className="p-4">
                <h3 className="font-bold text-lg text-gray-900 mb-3">{event.title}</h3>

                <div className="space-y-2 text-sm text-gray-600">
                  <div className="flex items-center gap-2">
                    <Calendar size={16} className="text-blue-600" />
                    <span>
                      {event.startDate.toLocaleDateString()} at {event.startDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <MapPin size={16} className="text-blue-600" />
                    <span>{event.location}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Users size={16} className="text-blue-600" />
                    <span>{event.itemCount} items</span>
                  </div>
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
