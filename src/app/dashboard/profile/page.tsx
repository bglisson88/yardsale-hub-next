'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { doc, getDocFromServer } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useAuthContext } from '@/hooks';
import { useAuthStore } from '@/store';
import { LoadingSpinner } from '@/components';
import { Avatar } from '@/components/Avatar';

export default function ProfilePage() {
  const { user, loading } = useAuthStore();
  const [publicProfile, setPublicProfile] = useState<
    { uid: string; status: 'loading' | 'missing' | 'error' } |
    { uid: string; status: 'ready'; username: string }
  >({ uid: '', status: 'loading' });
  const [retry, setRetry] = useState(0);
  useAuthContext();
  const router = useRouter();
  useEffect(() => {
    if (!loading && !user) router.replace('/auth/login?returnTo=%2Fdashboard%2Fprofile');
  }, [loading, user, router]);
  useEffect(() => {
    if (!user?.id) return;
    let active = true;
    const uid = user.id;
    setPublicProfile({ uid, status: 'loading' });
    getDocFromServer(doc(db, 'publicProfiles', uid)).then(snapshot => {
      if (!active) return;
      if (!snapshot.exists()) {
        setPublicProfile({ uid, status: 'missing' });
        return;
      }
      const username: unknown = snapshot.data().username;
      setPublicProfile(typeof username === 'string' && username
        ? { uid, status: 'ready', username }
        : { uid, status: 'error' });
    }).catch(() => {
      if (active) setPublicProfile({ uid, status: 'error' });
    });
    return () => { active = false; };
  }, [user?.id, retry]);
  if (loading) return <div className="min-h-screen flex items-center justify-center"><LoadingSpinner /></div>;
  if (!user) return null;
  return (
    <div className="max-w-3xl mx-auto px-4 py-12">
      <Link href="/dashboard" className="text-blue-600 hover:underline">← Back to dashboard</Link>
      <div className="mt-8 rounded-xl border border-gray-200 bg-white p-6">
        <h1 className="text-3xl font-bold text-gray-900 mb-6">My Profile</h1>
        <Avatar src={user.photoURL} name={user.displayName} size={64} />
        <dl className="mt-6 space-y-4">
          <div>
            <dt className="font-semibold">Public username</dt>
            <dd>
              {publicProfile.uid !== user.id ? 'Loading...' :
                publicProfile.status === 'ready' ? publicProfile.username :
                publicProfile.status === 'missing' ? (
                  <>Not registered. <Link href="/auth/signup" className="text-blue-600 hover:underline">Finish username setup</Link></>
                ) : publicProfile.status === 'error' ? (
                  <>Unable to load your username. <button type="button" className="text-blue-600 hover:underline" onClick={() => setRetry(value => value + 1)}>Try again</button></>
                ) : 'Loading...'}
            </dd>
          </div>
          <div><dt className="font-semibold">Name</dt><dd>{user.displayName}</dd></div>
          <div><dt className="font-semibold">Email</dt><dd>{user.email}</dd></div>
          <div><dt className="font-semibold">Location</dt><dd>{user.location || 'Not provided'}</dd></div>
          {user.bio && <div><dt className="font-semibold">About</dt><dd>{user.bio}</dd></div>}
        </dl>
      </div>
    </div>
  );
}
