'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { doc, getDoc } from 'firebase/firestore';
import toast from 'react-hot-toast';
import { Heart } from 'lucide-react';
import { db } from '@/lib/firebase';
import { useAuthStore } from '@/store';
import { useAuthContext } from '@/hooks';
import { useFavorites } from '@/hooks/useFavorites';
import { LoadingSpinner, EmptyState, ItemCard, Avatar } from '@/components';
import type { Item, User } from '@/types';

type Tab = 'item' | 'seller';

export default function FavoritesPage() {
  useAuthContext();
  const { user, loading: authLoading } = useAuthStore();
  const { favorites, loading, removeFavorite } = useFavorites();
  const [tab, setTab] = useState<Tab>('item');
  const [items, setItems] = useState<Record<string, Item | null>>({});
  const [sellers, setSellers] = useState<Record<string, User | null>>({});

  const itemIds = favorites.filter((f) => f.type === 'item').map((f) => f.targetId);
  const sellerIds = favorites.filter((f) => f.type === 'seller').map((f) => f.targetId);
  const itemKey = itemIds.join(',');
  const sellerKey = sellerIds.join(',');

  useEffect(() => {
    const missing = itemIds.filter((id) => !(id in items));
    if (missing.length === 0) return;
    let cancelled = false;
    Promise.all(
      missing.map(async (id) => {
        try {
          const snap = await getDoc(doc(db, 'items', id));
          if (!snap.exists()) return [id, null] as const;
          const data = snap.data();
          return [
            id,
            {
              ...data,
              id: snap.id,
              photoURLs: data.photoURLs || [],
              createdAt: data.createdAt?.toDate?.() ?? new Date(),
              updatedAt: data.updatedAt?.toDate?.() ?? new Date(),
            } as Item,
          ] as const;
        } catch {
          return [id, null] as const;
        }
      })
    ).then((entries) => {
      if (!cancelled) setItems((prev) => ({ ...prev, ...Object.fromEntries(entries) }));
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [itemKey]);

  useEffect(() => {
    const missing = sellerIds.filter((id) => !(id in sellers));
    if (missing.length === 0) return;
    let cancelled = false;
    Promise.all(
      missing.map(async (id) => {
        try {
          const snap = await getDoc(doc(db, 'users', id));
          if (!snap.exists()) return [id, null] as const;
          return [id, { ...(snap.data() as User), id: snap.id }] as const;
        } catch {
          return [id, null] as const;
        }
      })
    ).then((entries) => {
      if (!cancelled) setSellers((prev) => ({ ...prev, ...Object.fromEntries(entries) }));
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sellerKey]);

  if (authLoading || (user && loading)) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        <LoadingSpinner />
      </div>
    );
  }

  if (!user) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-12">
        <EmptyState
          title="Sign in to see your favorites"
          description="Save items and sellers you like."
          icon={<Heart size={36} />}
        />
        <Link href="/auth/login" className="block text-center mt-6 text-brand-700 font-semibold hover:underline">
          Sign in
        </Link>
      </div>
    );
  }

  const visibleItems = itemIds.map((id) => items[id]).filter((i): i is Item => !!i);
  const visibleSellers = sellerIds.map((id) => sellers[id]).filter((s): s is User => !!s);

  const remove = async (type: Tab, id: string) => {
    try {
      await removeFavorite(type, id);
      toast.success('Removed from favorites');
    } catch {
      toast.error('Could not remove favorite');
    }
  };

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
      <h1 className="text-3xl font-extrabold text-gray-900 mb-6">Favorites</h1>
      <div className="flex gap-2 mb-6" role="tablist">
        {(['item', 'seller'] as Tab[]).map((t) => (
          <button
            key={t}
            role="tab"
            aria-selected={tab === t}
            onClick={() => setTab(t)}
            className={`px-4 py-2 rounded-full font-semibold ${
              tab === t ? 'bg-brand-600 text-white' : 'bg-brand-50 text-brand-700'
            }`}
          >
            {t === 'item' ? 'Items' : 'Sellers'}
          </button>
        ))}
      </div>

      {tab === 'item' ? (
        visibleItems.length === 0 ? (
          <EmptyState
            title="No favorite items yet"
            description="Tap the heart on an item to save it here."
            icon={<Heart size={36} />}
          />
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
            {visibleItems.map((item) => (
              <ItemCard key={item.id} item={item} />
            ))}
          </div>
        )
      ) : visibleSellers.length === 0 ? (
        <EmptyState
          title="No favorite sellers yet"
          description="Tap the heart next to a seller to save them here."
          icon={<Heart size={36} />}
        />
      ) : (
        <ul className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {visibleSellers.map((s) => (
            <li
              key={s.id}
              className="flex items-center gap-3 p-4 bg-white rounded-2xl border border-gray-100 shadow-sm"
            >
              <Avatar src={s.photoURL} name={s.displayName} size={48} />
              <div className="flex-1 min-w-0">
                <p className="font-bold text-gray-900 truncate">{s.displayName}</p>
                {s.location && <p className="text-sm text-gray-600 truncate">{s.location}</p>}
              </div>
              <button
                onClick={() => remove('seller', s.id)}
                className="text-sm font-semibold text-red-600 hover:underline"
              >
                Remove
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
