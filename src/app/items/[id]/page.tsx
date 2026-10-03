'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { doc, getDoc } from 'firebase/firestore';
import { ArrowLeft, MapPin, MessageCircle, Package, Tag } from 'lucide-react';
import { db } from '@/lib/firebase';
import { useAuthStore } from '@/store';
import { LoadingSpinner, EmptyState, Avatar, FavoriteButton } from '@/components';
import type { Item } from '@/types';

export default function ItemDetail() {
  const params = useParams<{ id: string }>();
  const id = params?.id;
  const { user } = useAuthStore();
  const [item, setItem] = useState<Item | null>(null);
  const [loading, setLoading] = useState(true);
  const [activePhoto, setActivePhoto] = useState(0);

  useEffect(() => {
    if (!id) return;
    const load = async () => {
      try {
        const snap = await getDoc(doc(db, 'items', id));
        if (snap.exists()) {
          const data = snap.data();
          setItem({
            ...data,
            id: snap.id,
            photoURLs: data.photoURLs || [],
            createdAt: data.createdAt?.toDate?.() ?? new Date(),
            updatedAt: data.updatedAt?.toDate?.() ?? new Date(),
          } as Item);
        }
      } catch (error) {
        console.error('Error loading item:', error);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [id]);

  if (loading) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        <LoadingSpinner />
      </div>
    );
  }

  if (!item) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-12">
        <EmptyState title="Item not found" description="It may have been removed by the seller." />
        <Link href="/items" className="block text-center mt-6 text-brand-700 font-semibold hover:underline">
          Back to Browse
        </Link>
      </div>
    );
  }

  const photos = item.photoURLs || [];
  const isOwner = user?.id === item.userId;
  const messageHref = user
    ? `/messages?to=${item.userId}&item=${item.id}`
    : '/auth/login';

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
      <Link href="/items" className="flex items-center gap-2 text-brand-700 hover:text-brand-800 mb-6">
        <ArrowLeft size={20} /> Back to Browse
      </Link>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-10">
        <div>
          <div className="aspect-square bg-gradient-to-br from-brand-100 to-accent-100 rounded-2xl overflow-hidden flex items-center justify-center">
            {photos.length > 0 ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={photos[activePhoto]} alt={item.title} className="w-full h-full object-cover" />
            ) : (
              <Package size={64} className="text-brand-400" aria-hidden="true" />
            )}
          </div>
          {photos.length > 1 && (
            <div className="flex gap-3 mt-4 overflow-x-auto">
              {photos.map((url, i) => (
                <button
                  key={url}
                  onClick={() => setActivePhoto(i)}
                  aria-label={`Show photo ${i + 1}`}
                  className={`w-20 h-20 rounded-lg overflow-hidden flex-shrink-0 border-2 ${i === activePhoto ? 'border-brand-600' : 'border-transparent'}`}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={url} alt={`${item.title} thumbnail ${i + 1}`} className="w-full h-full object-cover" />
                </button>
              ))}
            </div>
          )}
        </div>

        <div>
          <div className="flex items-start justify-between gap-3">
            <h1 className="text-3xl font-extrabold text-gray-900">{item.title}</h1>
            <FavoriteButton type="item" targetId={item.id} size={24} className="flex-shrink-0 border border-gray-200" />
          </div>
          <div className="flex items-center gap-3 mt-4">
            <span className="text-3xl font-extrabold text-brand-600">${Number(item.price).toFixed(2)}</span>
            {item.originalPrice ? (
              <span className="text-gray-500 line-through">${Number(item.originalPrice).toFixed(2)}</span>
            ) : null}
            {item.isSold && (
              <span className="bg-gray-800 text-white text-xs font-bold px-2 py-1 rounded-full">SOLD</span>
            )}
          </div>

          <div className="flex flex-wrap gap-2 mt-4">
            <span className="flex items-center gap-1 text-sm font-semibold bg-accent-50 text-accent-700 px-3 py-1 rounded-full">
              <Tag size={14} aria-hidden="true" /> {item.category}
            </span>
            <span className="text-sm font-semibold bg-brand-50 text-brand-700 px-3 py-1 rounded-full capitalize">
              {item.condition}
            </span>
            <span className="flex items-center gap-1 text-sm font-semibold bg-gray-100 text-gray-700 px-3 py-1 rounded-full">
              <MapPin size={14} aria-hidden="true" /> {item.location || 'Local'}
            </span>
          </div>

          {item.description && (
            <p className="mt-6 text-gray-700 whitespace-pre-line">{item.description}</p>
          )}

          <div className="flex items-center gap-3 mt-8 p-4 bg-white rounded-2xl border border-gray-100 shadow-sm">
            <Avatar src={item.sellerPhotoURL} name={item.sellerName} size={48} />
            <div className="flex-1">
              <p className="text-xs text-gray-500">Sold by</p>
              <p className="font-bold text-gray-900">{item.sellerName || 'Neighbor'}</p>
            </div>
            {!isOwner && (
              <FavoriteButton type="seller" targetId={item.userId} className="border border-gray-200" />
            )}
          </div>

          {!isOwner && (
            <Link href={messageHref} className="btn-primary w-full mt-6">
              <MessageCircle size={18} aria-hidden="true" /> Message seller
            </Link>
          )}
        </div>
      </div>
    </div>
  );
}
