'use client';

import Link from 'next/link';
import { MapPin, Package } from 'lucide-react';
import type { Item } from '@/types';
import { categoryLabel } from '@/lib/categories';

export function ItemCard({ item, appearance = 'light' }: { item: Item; appearance?: 'light' | 'dark' }) {
  const dark = appearance === 'dark';
  return (
    <Link href={`/items?${new URLSearchParams({ search: item.title })}`} className={`group overflow-hidden rounded-2xl border transition-colors ${dark ? 'bg-slate-900 border-slate-800 hover:border-slate-600' : 'bg-white border-gray-200 hover:border-gray-400'}`}>
      <div className={`relative h-48 overflow-hidden ${dark ? 'bg-slate-800' : 'bg-gray-100'}`}>
        {item.photoURLs?.[0] ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={item.photoURLs[0]} alt={item.title} className="w-full h-full object-cover motion-safe:group-hover:scale-105 motion-safe:transition motion-safe:duration-300" />
        ) : (
          <div className="h-full flex items-center justify-center text-emerald-400"><Package size={40} aria-label="No photo" /></div>
        )}
        <span className="absolute top-3 left-3 text-white bg-emerald-700 font-bold text-sm px-3 py-1 rounded-full">${Number(item.price).toFixed(2)}</span>
      </div>
      <div className="p-4">
        <h3 className={`font-bold truncate ${dark ? 'text-white' : 'text-gray-900'}`}>{item.title}</h3>
        <div className="flex flex-wrap gap-2 mt-2">
          <span className={`text-xs font-semibold px-2 py-0.5 rounded-full bg-emerald-400/10 ${dark ? 'text-emerald-300' : 'text-emerald-700'}`}>{categoryLabel(item.category)}</span>
          <span className={`text-xs font-semibold px-2 py-0.5 rounded-full capitalize ${dark ? 'bg-amber-400/10 text-amber-300' : 'bg-amber-50 text-amber-700'}`}>{item.condition}</span>
        </div>
        <p className={`flex items-center gap-1 mt-3 text-sm ${dark ? 'text-slate-300' : 'text-gray-600'}`}><MapPin size={14} aria-hidden="true" />{item.location || 'Local'}</p>
      </div>
    </Link>
  );
}
