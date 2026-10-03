'use client';

import Link from 'next/link';
import { Package, MapPin } from 'lucide-react';
import { Avatar } from './Avatar';
import { FavoriteButton } from './FavoriteButton';
import type { Item } from '@/types';

const NEW_WINDOW_MS = 3 * 24 * 60 * 60 * 1000;

export function ItemCard({ item }: { item: Item }) {
  const photo = item.photoURLs?.[0];
  const isNew = item.createdAt && Date.now() - item.createdAt.getTime() < NEW_WINDOW_MS;

  return (
    <Link href={`/items/${item.id}`} className="card group block">
      <div className="relative h-48 bg-gradient-to-br from-brand-100 to-accent-100 overflow-hidden">
        {photo ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={photo}
            alt={item.title}
            className="w-full h-full object-cover group-hover:scale-105 transition duration-300"
          />
        ) : (
          <div className="w-full h-full flex flex-col items-center justify-center text-brand-400">
            <Package size={40} aria-hidden="true" />
            <span className="text-xs mt-1 font-medium">No photo</span>
          </div>
        )}
        <span className="absolute top-3 left-3 bg-brand-600 text-white font-bold text-sm px-3 py-1 rounded-full shadow">
          ${Number(item.price).toFixed(2)}
        </span>
        <div className="absolute top-3 right-3">
          <FavoriteButton type="item" targetId={item.id} />
        </div>
        {isNew && (
          <span className="absolute top-3 left-24 bg-accent-600 text-white text-xs font-bold px-2 py-1 rounded-full shadow">
            NEW
          </span>
        )}
      </div>
      <div className="p-4">
        <h3 className="font-bold text-gray-900 truncate">{item.title}</h3>
        <div className="flex flex-wrap gap-2 mt-2">
          <span className="text-xs font-semibold bg-accent-50 text-accent-700 px-2 py-0.5 rounded-full">
            {item.category}
          </span>
          <span className="text-xs font-semibold bg-brand-50 text-brand-700 px-2 py-0.5 rounded-full capitalize">
            {item.condition}
          </span>
        </div>
        <div className="flex items-center justify-between mt-3 text-sm text-gray-600">
          <span className="flex items-center gap-1 min-w-0">
            <MapPin size={14} aria-hidden="true" />
            <span className="truncate">{item.location || 'Local'}</span>
          </span>
          <Avatar src={item.sellerPhotoURL} name={item.sellerName} size={24} />
        </div>
      </div>
    </Link>
  );
}
