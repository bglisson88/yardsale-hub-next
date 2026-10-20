'use client';

import Link from 'next/link';
import { Calendar, MapPin, Users } from 'lucide-react';
import type { YardSaleEvent } from '@/types';

export function EventCard({ event, appearance = 'light' }: { event: YardSaleEvent; appearance?: 'light' | 'dark' }) {
  const dark = appearance === 'dark';
  return (
    <Link href={`/events?${new URLSearchParams({ search: event.title })}`} className={`group overflow-hidden rounded-2xl border transition-colors ${dark ? 'bg-slate-900 border-slate-800 hover:border-slate-600' : 'bg-white border-gray-200 hover:border-gray-400'}`}>
      <div className={`h-40 overflow-hidden ${dark ? 'bg-slate-800' : 'bg-gray-100'}`}>
        {event.photoURL ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={event.photoURL} alt={event.title} className="w-full h-full object-cover motion-safe:group-hover:scale-105 motion-safe:transition motion-safe:duration-300" />
        ) : (
          <div className="h-full flex items-center justify-center text-emerald-400"><Calendar size={40} aria-hidden="true" /></div>
        )}
      </div>
      <div className="p-4">
        <h3 className={`font-bold text-lg mb-3 ${dark ? 'text-white' : 'text-gray-900'}`}>{event.title}</h3>
        <div className={`space-y-2 text-sm ${dark ? 'text-slate-300' : 'text-gray-600'}`}>
          <p className="flex items-center gap-2"><Calendar size={16} className="shrink-0 text-emerald-400" aria-hidden="true" />{event.startDate.toLocaleDateString()} at {event.startDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</p>
          <p className="flex items-center gap-2"><MapPin size={16} className="shrink-0 text-emerald-400" aria-hidden="true" />{event.location}</p>
          <p className="flex items-center gap-2"><Users size={16} className="shrink-0 text-emerald-400" aria-hidden="true" />{event.itemCount} items</p>
        </div>
      </div>
    </Link>
  );
}
