'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { doc, onSnapshot } from 'firebase/firestore';
import { ArrowLeft, MapPin, Package } from 'lucide-react';
import { db } from '@/lib/firebase';
import { useAuthContext } from '@/hooks';
import { useAuthStore } from '@/store';
import { LoadingSpinner } from '@/components';
import { categoryLabel, subcategoryLabel } from '@/lib/categories';
import { itemDetails, validItemId, type ItemDetails } from '@/lib/item-details';

type ListingState =
  | { status: 'loading' | 'missing' | 'error' }
  | { status: 'ready'; item: ItemDetails };

export default function ItemPage({ params }: { params: { id: string } }) {
  return <ItemDetail key={params.id} id={params.id} />;
}

function ItemDetail({ id }: { id: string }) {
  useAuthContext();
  const { user, loading: authLoading } = useAuthStore();
  const [state, setState] = useState<ListingState>({ status: 'loading' });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (!validItemId(id)) {
      setState({ status: 'missing' });
      return;
    }
    let active = true;
    setState({ status: 'loading' });
    const unsubscribe = onSnapshot(doc(db, 'items', id), snapshot => {
      if (!active) return;
      setState(snapshot.exists()
        ? { status: 'ready', item: itemDetails(snapshot.id, snapshot.data()) }
        : { status: 'missing' });
    }, () => {
      if (active) setState({ status: 'error' });
    });
    return () => { active = false; unsubscribe(); };
  }, [id, attempt]);

  if (state.status === 'loading') {
    return <div role="status" aria-label="Loading listing" className="flex min-h-64 items-center justify-center"><LoadingSpinner /></div>;
  }
  if (state.status !== 'ready') {
    return (
      <main className="max-w-3xl mx-auto px-4 py-12">
        <h1 className="text-2xl font-bold text-gray-900">
          {state.status === 'missing' ? 'Listing not found' : 'Unable to load listing'}
        </h1>
        <p role={state.status === 'error' ? 'alert' : undefined} className="mt-3 text-gray-600">
          {state.status === 'missing'
            ? 'This listing may have been removed, or the link is invalid.'
            : 'We could not load this listing. Please check your connection and try again.'}
        </p>
        {state.status === 'error' && (
          <button type="button" onClick={() => setAttempt(value => value + 1)} className="mt-4 mr-4 rounded-lg bg-blue-600 px-4 py-2 text-white">Try again</button>
        )}
        <Link href="/items" className="inline-block mt-4 text-blue-600 underline">Browse items</Link>
      </main>
    );
  }

  const { item } = state;
  const owner = !authLoading && user?.id === item.sellerId;
  return (
    <main className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-12">
      <Link href="/items" className="inline-flex items-center gap-2 text-blue-600 hover:underline mb-6">
        <ArrowLeft size={20} aria-hidden="true" /> Back to items
      </Link>
      <article className="grid gap-8 lg:grid-cols-2">
        <section aria-label="Listing photos" className="space-y-4 min-w-0">
          {item.photos.length ? item.photos.map((url, index) => (
            // eslint-disable-next-line @next/next/no-img-element
            <img key={`${index}:${url}`} src={url} alt={`${item.title}, photo ${index + 1}`} loading={index ? 'lazy' : 'eager'} className="w-full max-h-[32rem] object-contain rounded-2xl bg-gray-100" />
          )) : (
            <div className="flex h-64 items-center justify-center gap-3 rounded-2xl bg-gray-100 text-gray-500">
              <Package size={32} aria-hidden="true" /> No photos available
            </div>
          )}
        </section>
        <div className="min-w-0 rounded-2xl border border-gray-200 bg-white p-5 sm:p-8">
          <h1 className="text-3xl font-bold text-gray-900 break-words">{item.title}</h1>
          <p className="mt-4 text-3xl font-bold text-blue-600">
            {item.price === null ? 'Price unavailable' : `$${item.price.toFixed(2)}`}
          </p>
          {item.isSold && <p className="mt-3 font-semibold text-gray-600">This item has been sold.</p>}
          <dl className="mt-6 space-y-3">
            {item.category && <div><dt className="font-semibold">Category</dt><dd>{categoryLabel(item.category)}{item.subcategory && ` / ${subcategoryLabel(item.category, item.subcategory)}`}</dd></div>}
            {item.condition && <div><dt className="font-semibold">Condition</dt><dd className="capitalize">{item.condition.replace(/-/g, ' ')}</dd></div>}
            {item.location && <div><dt className="font-semibold">General location</dt><dd className="flex items-center gap-2"><MapPin size={16} aria-hidden="true" />{item.location}</dd></div>}
          </dl>
          {item.description && <section className="mt-6"><h2 className="font-semibold text-lg">Description</h2><p className="mt-2 whitespace-pre-wrap break-words text-gray-700">{item.description}</p></section>}
          <section aria-label="Seller" className="mt-8 border-t border-gray-200 pt-6">
            <h2 className="text-lg font-semibold">Seller</h2>
            <p className="mt-2 text-gray-600">{owner ? 'You are the seller.' : 'YardSale Hub member.'}</p>
            {owner ? (
              <Link href={`/items/${encodeURIComponent(id)}/edit`} className="inline-block mt-4 rounded-lg bg-blue-600 px-5 py-3 font-semibold text-white hover:bg-blue-700">Edit Listing</Link>
            ) : !item.sellerId ? (
              <p className="mt-4 text-gray-600">Seller contact is unavailable for this listing.</p>
            ) : item.isSold ? null : authLoading ? (
              <p role="status" className="mt-4 text-gray-600">Checking sign-in...</p>
            ) : (
              <p className="mt-4 text-gray-600">Contact seller is currently unavailable. Messaging support is being updated.</p>
            )}
          </section>
        </div>
      </article>
    </main>
  );
}
