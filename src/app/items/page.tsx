'use client';

import { useItems } from '@/hooks';
import { LoadingSpinner, EmptyState } from '@/components';
import { Heart } from 'lucide-react';
import Link from 'next/link';
import Image from 'next/image';

interface SearchParams {
  search?: string;
  location?: string;
  category?: string;
}

export default function Browse({ searchParams }: { searchParams: SearchParams }) {
  const { items, loading } = useItems();

  const filteredItems = items.filter((item) => {
    if (searchParams.search && !item.title.toLowerCase().includes(searchParams.search.toLowerCase())) {
      return false;
    }
    if (searchParams.location && item.location !== searchParams.location) {
      return false;
    }
    if (searchParams.category && item.category !== searchParams.category) {
      return false;
    }
    return !item.isSold;
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
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900">Browse Items</h1>
        <p className="text-gray-600 mt-2">{filteredItems.length} items available</p>
      </div>

      {filteredItems.length === 0 ? (
        <EmptyState
          title="No items found"
          description="Try adjusting your search or check back later"
        />
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
          {filteredItems.map((item) => (
            <Link
              key={item.id}
              href={`/items/${item.id}`}
              className="bg-white rounded-lg border border-gray-200 overflow-hidden hover:shadow-lg transition"
            >
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
                <button className="absolute top-2 right-2 bg-white rounded-full p-2 hover:bg-gray-100">
                  <Heart size={18} className="text-gray-400" />
                </button>
              </div>
              <div className="p-3">
                <h3 className="font-semibold text-gray-900 text-sm line-clamp-2">{item.title}</h3>
                <p className="text-lg font-bold text-blue-600 mt-1">${item.price.toFixed(2)}</p>
                <p className="text-xs text-gray-500 mt-1">{item.location}</p>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
