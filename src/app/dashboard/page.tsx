'use client';

import { useEffect, useState } from 'react';
import { useAuthStore } from '@/store';
import { useAuthContext } from '@/hooks';
import { LoadingSpinner } from '@/components';
import { signOut } from 'firebase/auth';
import { auth, db } from '@/lib/firebase';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { User, Package, Calendar } from 'lucide-react';
import { collection, onSnapshot, query, where } from 'firebase/firestore';

export default function Dashboard() {
  const { user, loading } = useAuthStore();
  useAuthContext();
  const router = useRouter();
  const [itemCount, setItemCount] = useState(0);
  const [eventCount, setEventCount] = useState(0);

  useEffect(() => {
    if (!user?.id) return;

    const itemsQuery = query(collection(db, 'items'), where('userId', '==', user.id));
    const eventsQuery = query(collection(db, 'yardSaleEvents'), where('userId', '==', user.id));

    const unsubscribeItems = onSnapshot(itemsQuery, (snapshot) => {
      setItemCount(snapshot.size);
    });

    const unsubscribeEvents = onSnapshot(eventsQuery, (snapshot) => {
      setEventCount(snapshot.size);
    });

    return () => {
      unsubscribeItems();
      unsubscribeEvents();
    };
  }, [user?.id]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <LoadingSpinner />
      </div>
    );
  }

  if (!user) {
    router.push('/auth/login');
    return null;
  }

  const handleSignOut = async () => {
    await signOut(auth);
    router.push('/');
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900">My Dashboard</h1>
        <p className="text-gray-600 mt-2">Welcome, {user.displayName}!</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-12">
        {/* Profile Card */}
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <div className="flex items-center gap-4 mb-4">
            <div className="w-12 h-12 bg-blue-600 rounded-full flex items-center justify-center">
              <User className="text-white" size={24} />
            </div>
            <div>
              <p className="text-sm text-gray-600">Profile</p>
              <p className="font-semibold text-gray-900">{user.displayName}</p>
            </div>
          </div>
          <Link
            href="/dashboard/profile"
            className="text-blue-600 font-semibold text-sm hover:underline"
          >
            Edit Profile →
          </Link>
        </div>

        {/* My Items */}
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <div className="flex items-center gap-4 mb-4">
            <div className="w-12 h-12 bg-green-600 rounded-full flex items-center justify-center">
              <Package className="text-white" size={24} />
            </div>
            <div>
              <p className="text-sm text-gray-600">My Items</p>
              <p className="font-semibold text-gray-900">{itemCount} Listing{itemCount === 1 ? '' : 's'}</p>
            </div>
          </div>
          <Link
            href="/items/new"
            className="text-blue-600 font-semibold text-sm hover:underline"
          >
            Post Item →
          </Link>
        </div>

        {/* My Events */}
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <div className="flex items-center gap-4 mb-4">
            <div className="w-12 h-12 bg-purple-600 rounded-full flex items-center justify-center">
              <Calendar className="text-white" size={24} />
            </div>
            <div>
              <p className="text-sm text-gray-600">My Events</p>
              <p className="font-semibold text-gray-900">{eventCount} Yard Sale{eventCount === 1 ? '' : 's'}</p>
            </div>
          </div>
          <Link
            href="/events/new"
            className="text-blue-600 font-semibold text-sm hover:underline"
          >
            Create Event →
          </Link>
        </div>
      </div>

      <div className="flex gap-4">
        <Link
          href="/"
          className="px-6 py-2 bg-gray-100 text-gray-900 rounded-lg hover:bg-gray-200 transition font-semibold"
        >
          Browse Listings
        </Link>
        <button
          onClick={handleSignOut}
          className="px-6 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition font-semibold"
        >
          Sign Out
        </button>
      </div>
    </div>
  );
}
