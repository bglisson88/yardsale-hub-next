'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { doc, getDocFromServer } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { auth, db, functions } from '@/lib/firebase';
import { normalizeUsername } from '@/lib/signup';
import { useAuthContext } from '@/hooks';
import { useAuthStore } from '@/store';
import { LoadingSpinner } from '@/components';
import { Avatar } from '@/components/Avatar';

function renameErrorMessage(error: unknown): string {
  const code = typeof error === 'object' && error !== null && 'code' in error
    ? error.code : undefined;
  const message = typeof error === 'object' && error !== null && 'message' in error
    ? error.message : undefined;
  switch (code) {
    case 'functions/already-exists':
      return 'That username is unavailable. Please choose another.';
    case 'functions/invalid-argument':
      return 'Please enter a valid username.';
    case 'functions/unauthenticated':
      return 'Your session has expired. Please sign in again.';
    case 'functions/failed-precondition':
      return message === 'You can change your username once every 30 days.'
        ? 'You can change your username once every 30 days. Please try again later.'
        : 'Your public profile could not be verified. Please contact support.';
    case 'functions/unavailable':
    case 'functions/deadline-exceeded':
    case 'functions/aborted':
    case 'functions/resource-exhausted':
      return 'The username service is temporarily unavailable. Please retry the same username.';
    default:
      return 'Unable to change your username. Please try again or contact support.';
  }
}

export default function ProfilePage() {
  const { user, loading } = useAuthStore();
  const [publicProfile, setPublicProfile] = useState<
    { uid: string; status: 'loading' | 'missing' | 'error' } |
    { uid: string; status: 'ready'; username: string }
  >({ uid: '', status: 'loading' });
  const [retry, setRetry] = useState(0);
  const [editing, setEditing] = useState(false);
  const [usernameInput, setUsernameInput] = useState('');
  const [saving, setSaving] = useState(false);
  const [renameMessage, setRenameMessage] = useState<{ text: string; error: boolean } | null>(null);
  const submitting = useRef(false);
  const currentUserId = useRef<string | null>(null);
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
  useEffect(() => {
    currentUserId.current = user?.id ?? null;
    setEditing(false);
    setUsernameInput('');
    setRenameMessage(null);
    setSaving(false);
    submitting.current = false;
    return () => { currentUserId.current = null; };
  }, [user?.id]);

  const handleRename = async (event: React.FormEvent) => {
    event.preventDefault();
    if (submitting.current || !user?.id) return;
    const uid = user.id;
    submitting.current = true;
    setSaving(true);
    setRenameMessage(null);
    try {
      const username = normalizeUsername(usernameInput);
      if (auth.currentUser?.uid !== uid) throw new Error('Your session changed. Please sign in again.');
      const rename = httpsCallable<{ username: string }, { username: string }>(functions, 'renameUsername');
      const result = await rename({ username });
      if (currentUserId.current !== uid || auth.currentUser?.uid !== uid) return;
      setPublicProfile({ uid, status: 'ready', username: result.data.username });
      setEditing(false);
      setRenameMessage({ text: `Your username is now ${result.data.username}.`, error: false });
    } catch (error: unknown) {
      if (currentUserId.current !== uid) return;
      const text = error instanceof Error && !('code' in error)
        ? error.message : renameErrorMessage(error);
      setRenameMessage({ text, error: true });
    } finally {
      if (currentUserId.current === uid) {
        submitting.current = false;
        setSaving(false);
      }
    }
  };
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
                publicProfile.status === 'ready' ? (
                  <>
                    {publicProfile.username}{' '}
                    <button type="button" disabled={saving} className="text-blue-600 hover:underline disabled:opacity-50" onClick={() => {
                      setUsernameInput(publicProfile.username);
                      setRenameMessage(null);
                      setEditing(true);
                    }}>Edit Username</button>
                  </>
                ) :
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
        {renameMessage && (
          <p role={renameMessage.error ? 'alert' : 'status'} className={`mt-4 text-sm ${renameMessage.error ? 'text-red-700' : 'text-green-700'}`}>
            {renameMessage.text}
          </p>
        )}
        {editing && publicProfile.uid === user.id && publicProfile.status === 'ready' && (
          <form onSubmit={handleRename} className="mt-4 space-y-3">
            <label htmlFor="new-username" className="block font-semibold">New username</label>
            <input id="new-username" value={usernameInput} onChange={event => setUsernameInput(event.target.value)} required
              className="w-full px-4 py-2 border border-gray-300 rounded-lg" />
            <p className="text-sm text-gray-600">
              3–20 letters, numbers, or underscores. Uppercase becomes lowercase. Usernames can be changed once every 30 days; the next eligible date is not available here.
            </p>
            <div className="flex gap-3">
              <button type="submit" disabled={saving} className="px-4 py-2 bg-blue-600 text-white rounded-lg disabled:opacity-50">
                {saving ? 'Saving...' : 'Save Username'}
              </button>
              <button type="button" disabled={saving} onClick={() => { setEditing(false); setRenameMessage(null); }}
                className="px-4 py-2 bg-gray-100 rounded-lg disabled:opacity-50">Cancel</button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
