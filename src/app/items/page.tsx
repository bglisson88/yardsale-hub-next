'use client';

import { useAuthContext, useItems } from '@/hooks';
import { LoadingSpinner, EmptyState } from '@/components';
import { Heart } from 'lucide-react';
import Link from 'next/link';
import Image from 'next/image';
import { useState } from 'react';
import { categoryLabel, subcategoryLabel } from '@/lib/categories';
import { DISCOVERY_GROUPS, matchesItem, type BrowseParams } from '@/lib/discovery';
import ListingCategoryFields from '@/components/CategoryFields';

export default function Browse({ searchParams }: { searchParams: Record<string, string | string[] | undefined> }) {
  const { items, loading } = useItems();
  const params: BrowseParams = Object.fromEntries(
    Object.entries(searchParams).map(([key, value]) => [key, Array.isArray(value) ? value[0] : value]),
  );
  return <BrowseResults key={JSON.stringify(params)} params={params} items={items} loading={loading} />;
}

function BrowseResults({ params, items, loading }: {
  params: BrowseParams;
  items: ReturnType<typeof useItems>['items'];
  loading: boolean;
}) {
  const [category, setCategory] = useState(params.category ?? '');
  const [subcategory, setSubcategory] = useState(params.subcategory ?? '');
  const [itemType, setItemType] = useState(params.itemType ?? '');
  const { user } = useAuthContext();
  const filteredItems = items.filter(item => matchesItem(item, params));
  const group = params.discovery ? DISCOVERY_GROUPS[params.discovery] : undefined;

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <LoadingSpinner />
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900">Browse Items</h1>
        <p className="text-gray-600 mt-2">{filteredItems.length} items available</p>
        {group && <p className="mt-2 text-gray-700"><strong>{group.label}:</strong> {group.description}</p>}
        {params.category && <p className="mt-2 text-gray-700">{categoryLabel(params.category)}{params.subcategory && ` / ${subcategoryLabel(params.category, params.subcategory)}`}</p>}
      </div>

      <form action="/items" method="get" className="mb-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {params.discovery && <input type="hidden" name="discovery" value={params.discovery} />}
        <div>
          <label htmlFor="browse-search" className="block text-sm font-semibold text-gray-700 mb-2">Search items</label>
          <input id="browse-search" name="search" defaultValue={params.search} className="w-full rounded-lg border border-gray-300 px-4 py-2" />
        </div>
        <div>
          <label htmlFor="browse-location" className="block text-sm font-semibold text-gray-700 mb-2">Location (city or ZIP)</label>
          <input id="browse-location" name="location" defaultValue={params.location} className="w-full rounded-lg border border-gray-300 px-4 py-2" />
        </div>
        <ListingCategoryFields category={category} subcategory={subcategory} itemType={itemType} onChange={values => {
          setCategory(values.category);
          setSubcategory(values.subcategory);
          setItemType(values.itemType);
        }} />
        <div className="flex items-center gap-4">
          <button type="submit" className="rounded-lg bg-blue-600 px-5 py-2 font-semibold text-white hover:bg-blue-700">Apply filters</button>
          <Link href="/items" className="text-blue-600 underline">Clear all filters</Link>
        </div>
      </form>

      {filteredItems.length === 0 ? (
        <EmptyState
          title="No items found"
          description="Try clearing a category or subcategory, changing your search or location, or check back later."
        />
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
          {filteredItems.map((item) => (
            <article
              key={item.id}
              className="bg-white rounded-lg border border-gray-200 overflow-hidden hover:shadow-lg transition"
            >
              <Link href={`/items/${item.id}`}>
              <div className="relative h-40 bg-gray-100">
                {item.photoURLs.length > 0 ? (
                  <Image
                    src={item.photoURLs[0]}
                    alt={item.title}
                    fill
                    className="object-cover"
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-gray-400">
                    No image
                  </div>
                )}
                <Heart size={18} aria-hidden="true" className="absolute top-2 right-2 text-gray-400" />
              </div>
              <div className="p-3">
                <h3 className="font-semibold text-gray-900 text-sm line-clamp-2">{item.title}</h3>
                <p className="text-lg font-bold text-blue-600 mt-1">${item.price.toFixed(2)}</p>
                <p className="text-xs text-gray-500 mt-1">{item.location}</p>
                <p className="text-xs text-gray-600 mt-1">{categoryLabel(item.category)}{item.subcategory && ` / ${subcategoryLabel(item.category, item.subcategory)}`}</p>
              </div>
              </Link>
              {user?.id === item.userId && (
                <Link href={`/items/${item.id}/edit`} className="block px-3 pb-3 text-sm font-semibold text-blue-600 underline">Edit listing</Link>
              )}
            </article>
          ))}
        </div>
      )}
    </div>
  );
}
