'use client';

import { Suspense, useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams, usePathname } from 'next/navigation';
import Link from 'next/link';
import { Search, PackageSearch } from 'lucide-react';
import { useItems } from '@/hooks';
import { LoadingSpinner, EmptyState, ItemCard } from '@/components';
import { CATEGORIES, CITIES } from '@/lib/constants';

const SORTS = [
  { value: 'newest', label: 'Newest' },
  { value: 'price-asc', label: 'Price: Low to High' },
  { value: 'price-desc', label: 'Price: High to Low' },
];

// Items posted before the category list was updated used 'Sports'
const normalizeCategory = (c?: string) => (c === 'Sports' ? 'Sports & Outdoors' : c);

function BrowseContent() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const { items, loading, error } = useItems();

  const category = params.get('category') || '';
  const location = params.get('location') || '';
  const sort = params.get('sort') || 'newest';
  const seller = params.get('seller') || '';
  const urlSearch = params.get('search') || '';
  const [searchText, setSearchText] = useState(urlSearch);

  useEffect(() => {
    setSearchText(urlSearch);
  }, [urlSearch]);

  const updateParam = (key: string, value: string) => {
    const next = new URLSearchParams(params.toString());
    if (value) next.set(key, value);
    else next.delete(key);
    const qs = next.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  };

  useEffect(() => {
    if (searchText === urlSearch) return;
    const t = setTimeout(() => updateParam('search', searchText.trim()), 300);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchText]);

  const filtered = useMemo(() => {
    const q = urlSearch.toLowerCase();
    const list = items.filter((item) => {
      if (seller && item.userId !== seller) return false;
      if (category && normalizeCategory(item.category) !== category) return false;
      if (location && item.location !== location) return false;
      if (q && !`${item.title} ${item.description || ''}`.toLowerCase().includes(q)) return false;
      return true;
    });
    if (sort === 'price-asc') list.sort((a, b) => a.price - b.price);
    else if (sort === 'price-desc') list.sort((a, b) => b.price - a.price);
    return list;
  }, [items, seller, category, location, urlSearch, sort]);

  const chip = (active: boolean) =>
    `px-4 py-1.5 rounded-full text-sm font-semibold whitespace-nowrap transition ${
      active ? 'bg-brand-600 text-white shadow' : 'bg-white text-gray-700 border border-gray-200 hover:border-brand-400'
    }`;

  return (
    <div>
      <div className="sticky top-16 z-30 bg-white/90 backdrop-blur border-b border-brand-100 shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 space-y-3">
          <div className="flex flex-col md:flex-row gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-2.5 text-gray-400" size={20} aria-hidden="true" />
              <input
                type="search"
                aria-label="Search items"
                placeholder="Search items..."
                value={searchText}
                onChange={(e) => setSearchText(e.target.value)}
                className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500"
              />
            </div>
            <select
              aria-label="Filter by city"
              value={location}
              onChange={(e) => updateParam('location', e.target.value)}
              className="px-4 py-2 border border-gray-300 rounded-lg bg-white"
            >
              <option value="">All cities</option>
              {CITIES.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
            <select
              aria-label="Sort items"
              value={sort}
              onChange={(e) => updateParam('sort', e.target.value === 'newest' ? '' : e.target.value)}
              className="px-4 py-2 border border-gray-300 rounded-lg bg-white"
            >
              {SORTS.map((s) => (
                <option key={s.value} value={s.value}>{s.label}</option>
              ))}
            </select>
          </div>
          <div className="flex gap-2 overflow-x-auto pb-1" role="group" aria-label="Categories">
            <button className={chip(!category)} onClick={() => updateParam('category', '')}>All</button>
            {CATEGORIES.map((c) => (
              <button key={c} className={chip(category === c)} onClick={() => updateParam('category', c)}>
                {c}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="flex justify-between items-center mb-6">
          <h1 className="text-3xl font-extrabold text-gray-900">
            {seller ? 'My Items' : 'Browse Items'}
            <span className="ml-3 text-base font-medium text-gray-500">{filtered.length} found</span>
          </h1>
          <Link href="/items/new" className="btn-primary !py-2 text-sm">Post Item</Link>
        </div>

        {loading ? (
          <div className="py-20"><LoadingSpinner /></div>
        ) : error ? (
          <EmptyState title="Couldn't load items" description={error} />
        ) : filtered.length === 0 ? (
          <EmptyState
            icon={<PackageSearch size={48} />}
            title="No items found"
            description="Try a different category or search, or be the first to post something!"
          />
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
            {filtered.map((item) => (
              <ItemCard key={item.id} item={item} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export default function Browse() {
  return (
    <Suspense fallback={<div className="py-20"><LoadingSpinner /></div>}>
      <BrowseContent />
    </Suspense>
  );
}
