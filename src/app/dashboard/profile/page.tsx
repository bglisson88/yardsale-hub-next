'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useAuthContext } from '@/hooks';
import { useAuthStore } from '@/store';
import { LoadingSpinner } from '@/components';
import { Avatar } from '@/components/Avatar';

export default function ProfilePage() {
  const { user, loading } = useAuthStore();
  useAuthContext();
  const router = useRouter();
  useEffect(() => {
    if (!loading && !user) router.replace('/auth/login?returnTo=%2Fdashboard%2Fprofile');
  }, [loading, user, router]);
  if (loading) return <div className="min-h-screen flex items-center justify-center"><LoadingSpinner /></div>;
  if (!user) return null;
  return (
    <div className="max-w-3xl mx-auto px-4 py-12">
      <Link href="/dashboard" className="text-blue-600 hover:underline">← Back to dashboard</Link>
      <div className="mt-8 rounded-xl border border-gray-200 bg-white p-6">
        <h1 className="text-3xl font-bold text-gray-900 mb-6">My Profile</h1>
        <Avatar src={user.photoURL} name={user.displayName} size={64} />
        <dl className="mt-6 space-y-4">
          <div><dt className="font-semibold">Name</dt><dd>{user.displayName}</dd></div>
          <div><dt className="font-semibold">Email</dt><dd>{user.email}</dd></div>
          <div><dt className="font-semibold">Location</dt><dd>{user.location || 'Not provided'}</dd></div>
          {user.bio && <div><dt className="font-semibold">About</dt><dd>{user.bio}</dd></div>}
        </dl>
      </div>
    </div>
  );
}
