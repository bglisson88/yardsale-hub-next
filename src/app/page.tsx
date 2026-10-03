'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { collection, query, where, getDocs, Timestamp } from 'firebase/firestore';
import { Search, MapPin, ArrowRight, Radio } from 'lucide-react';
import { db } from '@/lib/firebase';
import { useItems } from '@/hooks';
import { ItemCard, EventCard, EmptyState } from '@/components';
import { CATEGORIES, CATEGORY_ICONS, CITIES } from '@/lib/constants';
import type { YardSaleEvent } from '@/types';

export default function Home() {
  const router = useRouter();
  const [searchQuery, setSearchQuery] = useState('');
  const [location, setLocation] = useState('');
  const { items } = useItems();
  const [events, setEvents] = useState<YardSaleEvent[]>([]);

  useEffect(() => {
    const load = async () => {
      try {
        const q = query(collection(db, 'yardSaleEvents'), where('endDate', '>=', Timestamp.now()));
        const snap = await getDocs(q);
        const list = snap.docs.map((d) => {
          const data = d.data();
          return {
            ...data,
            id: d.id,
            startDate: data.startDate?.toDate(),
            endDate: data.endDate?.toDate(),
          } as YardSaleEvent;
        });
        setEvents(list.sort((a, b) => a.startDate.getTime() - b.startDate.getTime()).slice(0, 3));
      } catch (error) {
        console.error('Error loading events:', error);
      }
    };
    load();
  }, []);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    const params = new URLSearchParams();
    if (searchQuery.trim()) params.set('search', searchQuery.trim());
    if (location) params.set('location', location);
    const qs = params.toString();
    router.push(qs ? `/items?${qs}` : '/items');
  };

  return (
    <div>
      {/* Hero */}
      <section className="relative overflow-hidden bg-gradient-to-br from-brand-500 via-brand-600 to-accent-700 text-white">
        <div
          className="absolute inset-0 opacity-20"
          style={{ backgroundImage: 'radial-gradient(circle at 1px 1px, white 1.5px, transparent 0)', backgroundSize: '28px 28px' }}
          aria-hidden="true"
        />
        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-20 md:py-28 text-center">
          <p className="inline-block bg-white/20 backdrop-blur px-4 py-1 rounded-full text-sm font-semibold mb-6">
            🏷️ Mid-County · Orange · Beaumont
          </p>
          <h1 className="text-4xl md:text-6xl font-extrabold leading-tight mb-4">
            Treasure hunting,<br />right in your neighborhood.
          </h1>
          <p className="text-lg md:text-xl text-white/90 max-w-2xl mx-auto mb-10">
            Find local yard sales, snag great deals, and sell what you no longer need.
          </p>

          <form
            onSubmit={handleSearch}
            className="max-w-3xl mx-auto bg-white rounded-2xl shadow-2xl p-3 flex flex-col md:flex-row gap-3 text-gray-900"
          >
            <div className="relative flex-1">
              <Search className="absolute left-3 top-3 text-gray-400" size={20} aria-hidden="true" />
              <input
                type="text"
                aria-label="Search items"
                placeholder="Search items..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-10 pr-4 py-2.5 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500"
              />
            </div>
            <div className="relative md:w-52">
              <MapPin className="absolute left-3 top-3 text-gray-400" size={20} aria-hidden="true" />
              <select
                aria-label="City"
                value={location}
                onChange={(e) => setLocation(e.target.value)}
                className="w-full pl-10 pr-4 py-2.5 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-brand-500"
              >
                <option value="">All cities</option>
                {CITIES.map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            </div>
            <button type="submit" className="btn-primary">Search</button>
          </form>

          <div className="flex flex-wrap justify-center gap-4 mt-8">
            <Link href="/items/new" className="px-6 py-3 rounded-xl font-bold bg-white text-brand-700 hover:bg-brand-50 shadow-lg transition">
              Post an Item
            </Link>
            <Link href="/events" className="px-6 py-3 rounded-xl font-bold border-2 border-white text-white hover:bg-white/10 transition">
              Find Sales Near You
            </Link>
          </div>
        </div>
      </section>

      {/* Category quick links */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 -mt-8 relative z-10">
        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-3">
          {CATEGORIES.map((c) => (
            <Link
              key={c}
              href={`/items?category=${encodeURIComponent(c)}`}
              className="bg-white rounded-2xl shadow-md hover:shadow-xl hover:-translate-y-1 transition p-4 text-center"
            >
              <div className="text-3xl mb-1" aria-hidden="true">{CATEGORY_ICONS[c]}</div>
              <p className="text-sm font-semibold text-gray-800">{c}</p>
            </Link>
          ))}
        </div>
      </section>

      {/* Latest Items */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
        <div className="flex justify-between items-end mb-6">
          <h2 className="text-3xl font-extrabold text-gray-900">Latest Items</h2>
          <Link href="/items" className="flex items-center gap-1 font-semibold text-brand-700 hover:underline">
            View all <ArrowRight size={16} aria-hidden="true" />
          </Link>
        </div>
        {items.length === 0 ? (
          <EmptyState title="No items yet" description="Be the first to post something for sale!" />
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
            {items.slice(0, 4).map((item) => (
              <ItemCard key={item.id} item={item} />
            ))}
          </div>
        )}
      </section>

      {/* Upcoming Events */}
      <section className="bg-accent-50 py-16">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-end mb-6">
            <h2 className="text-3xl font-extrabold text-gray-900">Upcoming Events</h2>
            <Link href="/events" className="flex items-center gap-1 font-semibold text-accent-700 hover:underline">
              See the map <ArrowRight size={16} aria-hidden="true" />
            </Link>
          </div>
          {events.length === 0 ? (
            <EmptyState title="No upcoming events" description="Hosting a sale? Put it on the map!" />
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {events.map((event) => (
                <EventCard key={event.id} event={event} />
              ))}
            </div>
          )}
        </div>
      </section>

      {/* Coming soon teaser */}
      <section className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
        <div className="rounded-3xl bg-gradient-to-r from-accent-800 to-accent-600 text-white p-10 flex flex-col md:flex-row items-center gap-6">
          <div className="w-16 h-16 rounded-full bg-white/20 flex items-center justify-center flex-shrink-0" aria-hidden="true">
            <Radio size={32} />
          </div>
          <div>
            <p className="text-sm font-bold uppercase tracking-wide text-accent-100">Coming soon</p>
            <h2 className="text-2xl font-extrabold mb-1">Live Sales &amp; Auctions</h2>
            <p className="text-accent-50">
              Host a virtual yard sale, show off items live, and let neighbors bid in real time. Stay tuned!
            </p>
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="bg-gradient-to-r from-brand-600 to-brand-700 py-16">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <h2 className="text-3xl font-extrabold text-white mb-4">Ready to clear out the clutter?</h2>
          <p className="text-brand-100 text-lg mb-8">Join your neighbors buying and selling locally.</p>
          <Link href="/auth/signup" className="inline-block px-8 py-3 bg-white text-brand-700 rounded-xl hover:bg-brand-50 transition font-bold text-lg">
            Create Account
          </Link>
        </div>
      </section>
    </div>
  );
}
