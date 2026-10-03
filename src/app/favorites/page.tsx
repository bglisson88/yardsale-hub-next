'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { doc, getDoc } from 'firebase/firestore';
import { Heart, Users } from 'lucide-react';
import toast from 'react-hot-toast';
import { db } from '@/lib/firebase';
import { useAuthStore } from '@/store';
import { useFavorites } from '@/hooks';
import { LoadingSpinner, EmptyState, Avatar, ItemCard, FavoriteButton } from '@/components';
import type { Item } from '@/types';

interface SellerInfo {
  id: string;
  displayName: string;
  photoURL: string | null;
  location: string;
}

export default function FavoritesPage() {
  const { user, loading: authLoading } = useAuthStore();
  const { favorites, loading, error } = useFavorites();
  const [tab, setTab] = useState<'item' | 'seller'>('item');
  const [items, setItems] = useState<Item[]>([]);
  const [sellers, setSellers] = useState<SellerInfo[]>([]);
  const [fetching, setFetching] = useState(false);

  const itemIds = favorites.filter((f) => f.type === 'item').map((f) => f.targetId).join(',');
  const sellerIds = favorites.filter((f) => f.type === 'seller').map((f) => f.targetId).join(',');

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setFetching(true);
      try {
        const [itemSnaps, sellerSnaps] = await Promise.all([
          Promise.all((itemIds ? itemIds.split(',') : []).map((id) => getDoc(doc(db, 'items', id)))),
          Promise.all((sellerIds ? sellerIds.split(',') : []).map((id) => getDoc(doc(db, 'users', id)))),
        ]);
        if (cancelled) return;
        setItems(
          itemSnaps
            .filter((s) => s.exists())
            .map((s) => {
              const data = s.data()!;
              return {
                ...data,
                id: s.id,
                photoURLs: data.photoURLs || [],
                createdAt: data.createdAt?.toDate?.() ?? new Date(0),
                updatedAt: data.updatedAt?.toDate?.() ?? new Date(0),
              } as Item;
            })
        );
        setSellers(
          sellerSnaps
            .filter((s) => s.exists())
            .map((s) => {
              const data = s.data()!;
              return {
                id: s.id,
                displayName: data.displayName || 'Neighbor',
                photoURL: data.photoURL ?? null,
                location: data.location || '',
              };
            })
        );
      } catch (err) {
        console.error('Error loading favorites:', err);
        if (!cancelled) toast.error('Failed to load favorites');
      } finally {
        if (!cancelled) setFetching(false);
      }
    };
    load();
    return () => {
      cancelled = true;
    };
  }, [itemIds, sellerIds]);

  if (authLoading || loading || fetching) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        <LoadingSpinner />
      </div>
    );
  }

  if (!user) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-12">
        <EmptyState title="Sign in to see your favorites" description="Save items and sellers you love." />
        <Link href="/auth/login" className="block text-center mt-6 text-brand-700 font-semibold hover:underline">
          Sign In
        </Link>
      </div>
    );
  }

  const tabClass = (active: boolean) =>
    `px-5 py-2 rounded-full font-semibold transition ${
      active ? 'bg-brand-600 text-white' : 'bg-white text-gray-700 border border-gray-200 hover:bg-brand-50'
    }`;

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
      <h1 className="text-3xl font-extrabold text-gray-900 mb-6">My Favorites</h1>
      <div className="flex gap-3 mb-8" role="tablist">
        <button role="tab" aria-selected={tab === 'item'} onClick={() => setTab('item')} className={tabClass(tab === 'item')}>
          Items ({items.length})
        </button>
        <button role="tab" aria-selected={tab === 'seller'} onClick={() => setTab('seller')} className={tabClass(tab === 'seller')}>
          Sellers ({sellers.length})
        </button>
      </div>

      {error && <p className="text-red-600 mb-4">{error}</p>}

      {tab === 'item' ? (
        items.length === 0 ? (
          <EmptyState
            title="No favorites yet"
            description="Tap the heart on an item to save it here."
            icon={<Heart size={32} />}
          />
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
            {items.map((item) => (
              <ItemCard key={item.id} item={item} />
            ))}
          </div>
        )
      ) : sellers.length === 0 ? (
        <EmptyState
          title="No favorites yet"
          description="Tap the heart next to a seller to save them here."
          icon={<Users size={32} />}
        />
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {sellers.map((s) => (
            <div key={s.id} className="flex items-center gap-3 p-4 bg-white rounded-2xl border border-gray-100 shadow-sm">
              <Avatar src={s.photoURL} name={s.displayName} size={48} />
              <div className="flex-1 min-w-0">
                <Link href={`/items?seller=${s.id}`} className="font-bold text-gray-900 hover:underline truncate block">
                  {s.displayName}
                </Link>
                {s.location && <p className="text-sm text-gray-500 truncate">{s.location}</p>}
              </div>
              <FavoriteButton type="seller" targetId={s.id} className="border border-gray-200" />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
