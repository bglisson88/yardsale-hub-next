'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { collection, query, where, getDocs, Timestamp } from 'firebase/firestore';
import { Search, MapPin, ArrowRight, Radio, Lamp, Sparkles } from 'lucide-react';
import { db } from '@/lib/firebase';
import { useItems } from '@/hooks';
import { EmptyState } from '@/components/EmptyState';
import { ItemCard } from '@/components/ItemCard';
import { EventCard } from '@/components/EventCard';
import { Logo } from '@/components/Logo';
import { CATEGORIES, categoryHref } from '@/lib/categories';
import type { YardSaleEvent } from '@/types';

export default function Home() {
  const router = useRouter();
  const [searchQuery, setSearchQuery] = useState('');
  const [location, setLocation] = useState('');
  const [searchType, setSearchType] = useState('items');
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const { items } = useItems();
  const [events, setEvents] = useState<YardSaleEvent[]>([]);
  const category = CATEGORIES.find((entry) => entry.id === selectedCategory);

  useEffect(() => {
    let active = true;
    const load = async () => {
      try {
        const q = query(collection(db, 'yardSaleEvents'), where('startDate', '>=', Timestamp.now()));
        const snap = await getDocs(q);
        const list = snap.docs.map((document) => {
          const data = document.data();
          return {
            ...data,
            id: document.id,
            startDate: data.startDate?.toDate(),
            endDate: data.endDate?.toDate(),
          } as YardSaleEvent;
        });
        if (active) setEvents(list.sort((a, b) => a.startDate.getTime() - b.startDate.getTime()).slice(0, 3));
      } catch (error) {
        console.error('Error loading events:', error);
      }
    };
    load();
    return () => { active = false; };
  }, []);

  const handleSearch = (event: React.FormEvent) => {
    event.preventDefault();
    const params = new URLSearchParams();
    if (searchQuery.trim()) params.set('search', searchQuery.trim());
    if (location.trim()) params.set('location', location.trim());
    const qs = params.toString();
    router.push(qs ? `/${searchType}?${qs}` : `/${searchType}`);
  };

  return (
    <div className="home-theme bg-slate-950 text-slate-300 pb-16">
      {/* Hero */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-4">
        <div className="relative overflow-hidden rounded-3xl border border-slate-800 bg-gradient-to-br from-slate-900 via-slate-900 to-emerald-950">
          <div className="absolute inset-0 opacity-[0.08]" style={{ backgroundImage: 'radial-gradient(circle at 1px 1px, #a7f3d0 1px, transparent 0)', backgroundSize: '24px 24px' }} aria-hidden="true" />
          <div className="absolute -right-24 top-12 h-80 w-80 rounded-full bg-emerald-500/10 blur-3xl" aria-hidden="true" />
          <div className="relative grid lg:grid-cols-12 items-center gap-8 px-5 py-10 sm:p-10 lg:p-12 lg:py-16">
            <div className="min-w-0 lg:col-span-7">
              <p className="inline-flex items-center gap-2 border border-emerald-400/20 bg-emerald-400/10 text-emerald-300 px-3 py-2 rounded-full text-xs sm:text-sm font-semibold mb-6">
                <MapPin size={14} className="shrink-0" aria-hidden="true" />
                Neighborhood treasures, wherever you are
              </p>
              <h1 className="text-4xl sm:text-5xl xl:text-6xl font-extrabold leading-[1.12] tracking-tight text-white mb-5">
                Turn Neighborhood Treasures Into{' '}
                <span className="bg-gradient-to-r from-emerald-400 to-amber-400 bg-clip-text text-transparent">Nearby Deals.</span>
              </h1>
              <p className="text-base sm:text-lg leading-relaxed max-w-xl mb-8">
                Discover local yard sales, estate sales, and secondhand treasures
              </p>
              <form onSubmit={handleSearch} className="bg-slate-950/80 border border-slate-700 rounded-2xl shadow-xl p-2 flex flex-wrap gap-2">
                <div className="relative w-full min-w-0">
                  <Search className="absolute left-3 top-3 text-slate-400" size={20} aria-hidden="true" />
                  <input type="text" aria-label="Search items or events" placeholder="Search items or events..." value={searchQuery} onChange={(event) => setSearchQuery(event.target.value)} className="w-full min-w-0 bg-slate-900 text-white placeholder:text-slate-400 pl-10 pr-3 py-2.5 rounded-xl focus:ring-2 focus:ring-emerald-400" />
                </div>
                <div className="relative flex-1 min-w-[10rem]">
                  <MapPin className="absolute left-3 top-3 text-slate-400" size={20} aria-hidden="true" />
                  <input type="text" aria-label="Location (city or ZIP)" placeholder="City or ZIP" value={location} onChange={(event) => setLocation(event.target.value)} className="w-full bg-slate-900 text-white placeholder:text-slate-400 pl-10 pr-3 py-2.5 rounded-xl focus:ring-2 focus:ring-emerald-400" />
                </div>
                <select aria-label="Search for" value={searchType} onChange={(event) => setSearchType(event.target.value)} className="bg-slate-900 text-white px-3 py-2.5 rounded-xl focus:ring-2 focus:ring-emerald-400">
                  <option value="items">Items</option>
                  <option value="events">Events</option>
                </select>
                <button type="submit" className="rounded-xl bg-emerald-600 px-5 py-3 text-sm font-bold text-slate-950 hover:bg-emerald-500 transition-colors">Search</button>
              </form>
              <div className="flex flex-wrap items-center gap-2 mt-4 text-xs">
                <span className="text-slate-400">Popular:</span>
                {CATEGORIES.slice(0, 3).map((entry) => (
                  <Link key={entry.id} href={categoryHref(entry.id)} className="rounded-full border border-slate-700 bg-slate-800/70 px-3 py-1.5 text-slate-300 hover:border-emerald-400 hover:text-emerald-300 transition-colors">{entry.label}</Link>
                ))}
              </div>
              <div className="flex flex-wrap gap-3 mt-7">
                <Link href="/items/new" className="px-4 py-3 rounded-xl text-sm font-bold bg-emerald-600 text-slate-950 hover:bg-emerald-500 transition-colors">Post an Item</Link>
                <Link href={location.trim() ? `/events?${new URLSearchParams({ location: location.trim() })}` : '/events'} className="inline-flex items-center gap-2 px-4 py-3 rounded-xl text-sm font-bold border border-slate-600 text-white hover:bg-slate-800 transition-colors">
                  Find Sales Near You <ArrowRight size={16} aria-hidden="true" />
                </Link>
              </div>
            </div>
            <div className="relative lg:col-span-5 flex items-center justify-center h-80 sm:h-96 select-none pointer-events-none" aria-hidden="true">
              <div className="absolute h-64 w-64 sm:h-80 sm:w-80 rounded-full border border-emerald-400/20 bg-emerald-500/5" />
              <div className="absolute h-48 w-48 sm:h-60 sm:w-60 rounded-full border border-amber-400/20 bg-amber-400/5" />
              <div className="treasure-float relative w-48 sm:w-60 rounded-3xl border-2 border-amber-400/70 bg-slate-900 p-5 sm:p-7 text-center shadow-2xl shadow-black/40 -rotate-6">
                <div className="flex justify-center mb-3"><Logo size={112} /></div>
                <p className="text-white font-extrabold text-xl">A new life for<br />old favorites.</p>
                <p className="mt-3 text-xs font-semibold text-emerald-400">Discover. Reuse. Repeat.</p>
              </div>
              <div className="treasure-float-delayed absolute left-0 top-5 sm:top-8 rounded-2xl border border-slate-700 bg-slate-800 p-3 sm:p-4 shadow-xl -rotate-12">
                <Lamp size={28} className="text-amber-400 mb-2" />
                <p className="text-sm font-bold text-white">Hidden gems</p>
                <p className="text-xs text-slate-300 mt-1">Secondhand charm</p>
              </div>
              <div className="treasure-float-delayed absolute right-0 bottom-2 sm:bottom-6 rounded-2xl border border-slate-700 bg-slate-800 p-3 sm:p-4 shadow-xl rotate-6">
                <div className="flex items-center gap-2 mb-1"><MapPin size={20} className="text-emerald-400" /><p className="text-sm font-bold text-white">Keep it local</p></div>
                <p className="text-xs text-slate-300">Meet your neighborhood</p>
              </div>
              <Sparkles className="absolute right-4 top-12 text-amber-400" size={24} />
            </div>
          </div>
        </div>
      </section>

      {/* Category quick links */}
      <section aria-labelledby="categories-heading" className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-10">
        <h2 id="categories-heading" className="text-sm font-semibold text-slate-300 mb-4">A little of everything. Something for you.</h2>
        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-3">
          {CATEGORIES.map((entry) => (
            <button key={entry.id} type="button" aria-expanded={selectedCategory === entry.id} aria-controls={selectedCategory === entry.id ? 'category-subcategories' : undefined} onClick={() => setSelectedCategory(selectedCategory === entry.id ? null : entry.id)} className={`bg-slate-900 border rounded-2xl hover:border-emerald-400 transition-colors p-3 text-center ${selectedCategory === entry.id ? 'border-emerald-400 ring-1 ring-emerald-400' : 'border-slate-800'}`}>
              <div className="flex justify-center text-emerald-400 mb-2" aria-hidden="true"><Lamp size={24} /></div>
              <p className="text-xs font-semibold text-slate-300">{entry.label}</p>
            </button>
          ))}
        </div>
        {category && (
          <div id="category-subcategories" className="mt-4 bg-slate-900 border border-slate-800 rounded-2xl p-4 flex flex-wrap gap-2" role="group" aria-label={`${category.label} subcategories`}>
            <Link href={categoryHref(category.id)} className="px-4 py-2 rounded-full text-sm font-semibold bg-emerald-600 text-slate-950 hover:bg-emerald-500">All {category.label}</Link>
            {category.subcategories.map((sub) => (
              <Link key={sub.id} href={categoryHref(category.id, sub.id)} className="px-4 py-2 rounded-full text-sm font-semibold bg-slate-800 text-slate-300 border border-slate-700 hover:border-emerald-400">{sub.label}</Link>
            ))}
          </div>
        )}
      </section>

      {/* Latest Items */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
        <div className="flex flex-wrap gap-4 justify-between items-end mb-6">
          <div><p className="text-xs font-bold uppercase tracking-widest text-emerald-400 mb-2">Fresh finds</p><h2 className="text-2xl sm:text-3xl font-extrabold text-white">Latest Items</h2></div>
          <Link href="/items" className="flex items-center gap-1 text-sm font-semibold text-emerald-400 hover:underline">View all <ArrowRight size={16} aria-hidden="true" /></Link>
        </div>
        {items.length === 0 ? (
          <EmptyState appearance="dark" title="No items yet" description="Be the first to post something for sale!" />
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
            {[...items].sort((a, b) => (b.createdAt?.getTime() || 0) - (a.createdAt?.getTime() || 0)).slice(0, 4).map((item) => <ItemCard key={item.id} item={item} appearance="dark" />)}
          </div>
        )}
      </section>

      {/* Upcoming Events */}
      <section className="border-y border-slate-800 bg-slate-900/40 py-12">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex flex-wrap gap-4 justify-between items-end mb-6">
            <div><p className="text-xs font-bold uppercase tracking-widest text-amber-400 mb-2">Around the neighborhood</p><h2 className="text-2xl sm:text-3xl font-extrabold text-white">Upcoming Events</h2></div>
            <Link href="/events" className="flex items-center gap-1 text-sm font-semibold text-emerald-400 hover:underline">View all <ArrowRight size={16} aria-hidden="true" /></Link>
          </div>
          {events.length === 0 ? (
            <EmptyState appearance="dark" title="No upcoming events" description="Hosting a sale? Put it on the map!" />
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">{events.map((event) => <EventCard key={event.id} event={event} appearance="dark" />)}</div>
          )}
        </div>
      </section>

      {/* Coming soon teaser */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <div className="rounded-3xl border border-slate-800 bg-slate-900 p-6 sm:p-10 flex flex-col md:flex-row items-start md:items-center gap-6">
          <div className="w-16 h-16 rounded-2xl bg-amber-400/10 text-amber-400 flex items-center justify-center flex-shrink-0" aria-hidden="true"><Radio size={32} /></div>
          <div>
            <p className="text-xs font-bold uppercase tracking-widest text-amber-400 mb-2">Coming soon</p>
            <h2 className="text-2xl font-extrabold text-white mb-2">Live Sales &amp; Auctions</h2>
            <p className="text-slate-300">Host a virtual yard sale, show off items live, and let neighbors bid in real time. Stay tuned!</p>
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="rounded-3xl border border-emerald-900 bg-gradient-to-br from-slate-900 to-emerald-950 px-6 py-12 text-center">
          <h2 className="text-3xl font-extrabold text-white mb-4">Ready to clear out the clutter?</h2>
          <p className="text-slate-300 text-lg mb-8">Join your neighbors buying and selling locally.</p>
          <Link href="/auth/signup" className="inline-block px-8 py-3 bg-emerald-600 text-slate-950 rounded-xl hover:bg-emerald-500 transition-colors font-bold">Create Account</Link>
        </div>
      </section>
    </div>
  );
}
