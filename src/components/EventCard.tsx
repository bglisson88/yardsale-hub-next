'use client';

import Link from 'next/link';
import { Calendar, MapPin, Users } from 'lucide-react';
import { Avatar } from './Avatar';
import { FavoriteButton } from './FavoriteButton';
import { useUserProfile } from '@/hooks/useUserProfile';
import type { YardSaleEvent } from '@/types';

export function EventCard({ event }: { event: YardSaleEvent }) {
  const poster = useUserProfile(event.userId, event.posterName, event.posterPhotoURL);
  return (
    <div className="card group relative">
      <div className="absolute top-3 right-3 z-10">
        <FavoriteButton type="event" targetId={event.id} />
      </div>
      <Link href={`/events/${event.id}`} className="block">
        <div className="relative h-40 bg-gradient-to-br from-accent-100 to-brand-100 overflow-hidden">
          {event.photoURL ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={event.photoURL}
              alt={event.title}
              className="w-full h-full object-cover group-hover:scale-105 transition duration-300"
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-accent-500">
              <Calendar size={40} aria-hidden="true" />
            </div>
          )}
          <span className="absolute top-3 left-3 bg-white/90 rounded-full p-0.5 shadow">
            <Avatar src={poster.photoURL} name={poster.name} size={32} />
          </span>
        </div>
        <div className="p-4">
          <h3 className="font-bold text-lg text-gray-900 mb-3">{event.title}</h3>
          <div className="space-y-2 text-sm text-gray-600">
            <div className="flex items-center gap-2">
              <Calendar size={16} className="text-brand-600" aria-hidden="true" />
              <span>
                {event.startDate.toLocaleDateString()} at{' '}
                {event.startDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <MapPin size={16} className="text-brand-600" aria-hidden="true" />
              <span>{event.location}</span>
            </div>
            <div className="flex items-center gap-2">
              <Users size={16} className="text-brand-600" aria-hidden="true" />
              <span>{event.itemCount} items</span>
            </div>
          </div>
        </div>
      </Link>
    </div>
  );
}
