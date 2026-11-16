'use client';

import { useEffect, useRef, useState } from 'react';
import { createUserWithEmailAndPassword, onAuthStateChanged } from 'firebase/auth';
import { doc, getDocFromServer, setDoc, Timestamp } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { auth, db, functions } from '@/lib/firebase';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import toast from 'react-hot-toast';
import { Logo } from '@/components/Logo';
import type { User } from '@/types';
import { completeSignup, normalizeUsername, registrationErrorMessage } from '@/lib/signup';

type SetupStage = 'checking' | 'signup' | 'private' | 'username' | 'error';

export default function SignUp() {
  const [loading, setLoading] = useState(false);
  const [stage, setStage] = useState<SetupStage>('checking');
  const [setupError, setSetupError] = useState('');
  const [checkAttempt, setCheckAttempt] = useState(0);
  const submitting = useRef(false);
  const accountUid = useRef<string | null>(null);
  const [formData, setFormData] = useState({
    username: '',
    email: '',
    password: '',
    confirmPassword: '',
    location: '',
  });
  const router = useRouter();

  useEffect(() => {
    let active = true;
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (!active) return;
      unsubscribe();
      if (!user) {
        setStage('signup');
        return;
      }
      accountUid.current = user.uid;
      try {
        const snapshot = await getDocFromServer(doc(db, 'users', user.uid));
        if (!active) return;
        if (auth.currentUser?.uid !== user.uid) {
          setSetupError('Your session changed. Please reload this page.');
          setStage('error');
          return;
        }
        setFormData(previous => ({ ...previous, email: user.email || '' }));
        setStage(snapshot.exists() ? 'username' : 'private');
      } catch {
        if (!active) return;
        setSetupError('Unable to check your account setup. Please try again.');
        setStage('error');
      }
    });
    return () => { active = false; unsubscribe(); };
  }, [checkAttempt]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    setFormData({
      ...formData,
      [e.target.name]: e.target.value,
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submitting.current || stage === 'checking' || stage === 'error') return;
    submitting.current = true;
    setLoading(true);
    setSetupError('');
    let registrationAttempted = false;
    let completed = false;

    try {
      const normalizedUsername = normalizeUsername(formData.username);
      if (stage === 'signup' && formData.password !== formData.confirmPassword) {
        throw new Error('Passwords do not match');
      }
      if ((accountUid.current && auth.currentUser?.uid !== accountUid.current) ||
          (!accountUid.current && auth.currentUser)) {
        throw new Error('Your session changed. Please reload this page to continue.');
      }

      const username = await completeSignup(formData.username, {
        uid: accountUid.current,
        hasPrivateProfile: stage === 'username',
      }, {
        createAccount: async () => {
          const credential = await createUserWithEmailAndPassword(auth, formData.email, formData.password);
          return credential.user.uid;
        },
        onAccountCreated: uid => {
          accountUid.current = uid;
          setStage('private');
        },
        savePrivateProfile: async uid => {
          if (auth.currentUser?.uid !== uid) throw new Error('Your session changed. Please sign in again.');
          const userRef = doc(db, 'users', uid);
          const existing = await getDocFromServer(userRef);
          if (auth.currentUser?.uid !== uid) throw new Error('Your session changed. Please sign in again.');
          if (existing.exists()) return;
          const newUser: User = {
            id: uid,
            email: auth.currentUser.email || formData.email,
            displayName: normalizedUsername,
            photoURL: null,
            location: formData.location,
            bio: '',
            createdAt: new Date(),
            updatedAt: new Date(),
          };
          await setDoc(userRef, {
            ...newUser,
            createdAt: Timestamp.fromDate(newUser.createdAt),
            updatedAt: Timestamp.fromDate(newUser.updatedAt),
          });
        },
        onPrivateProfileCreated: () => {
          setStage('username');
        },
        registerUsername: async requestedUsername => {
          if (auth.currentUser?.uid !== accountUid.current) {
            throw new Error('Your session changed. Please sign in again.');
          }
          const register = httpsCallable<{ username: string }, { username: string }>(
            functions, 'registerPublicProfile'
          );
          registrationAttempted = true;
          const result = await register({ username: requestedUsername });
          return result.data.username;
        },
      });

      toast.success(`Account setup complete! Your username is ${username}.`);
      completed = true;
      router.push('/dashboard');
    } catch (error: unknown) {
      const message = registrationAttempted
        ? registrationErrorMessage(error)
        : error instanceof Error ? error.message : 'Failed to create account. Please try again.';
      setSetupError(message);
      toast.error(message);
    } finally {
      if (!completed) {
        submitting.current = false;
        setLoading(false);
      }
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-50 flex items-center justify-center px-4">
      <div className="w-full max-w-md">
        <div className="bg-white rounded-2xl shadow-xl p-8">
          <div className="flex justify-center mb-6">
            <Logo size={56} />
          </div>
          <h1 className="text-2xl font-bold text-center text-gray-900 mb-6">
            {stage === 'private' || stage === 'username' ? 'Finish Account Setup' : 'Create Account'}
          </h1>

          {stage === 'checking' ? <p>Checking account setup...</p> : stage === 'error' ? (
            <div role="alert">
              <p>{setupError}</p>
              <button type="button" onClick={() => { setStage('checking'); setCheckAttempt(value => value + 1); }} className="text-blue-600 underline">Try again</button>
            </div>
          ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            {(stage === 'private' || stage === 'username') && (
              <p className="text-sm text-gray-700">
                You are signed in. Your account is preserved; finish setup here without creating another account.
              </p>
            )}
            {setupError && <p role="alert" className="text-sm text-red-700">{setupError}</p>}
            {stage !== 'username' && (
            <>

            {stage === 'signup' && (
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">
                Email
              </label>
              <input
                type="email"
                name="email"
                required
                value={formData.email}
                onChange={handleChange}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="you@example.com"
              />
            </div>
            )}

            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">
                Location
              </label>
              <select
                name="location"
                required
                value={formData.location}
                onChange={handleChange}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
              >
                <option value="">Select a location</option>
                <option value="Nederland">Nederland</option>
                <option value="Groves">Groves</option>
                <option value="West Beaumont">West Beaumont</option>
                <option value="Orange County">Orange County</option>
              </select>
            </div>

            {stage === 'signup' && (
            <>
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">
                Password
              </label>
              <input
                type="password"
                name="password"
                required
                value={formData.password}
                onChange={handleChange}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="••••••••"
              />
            </div>
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">
                Confirm Password
              </label>
              <input
                type="password"
                name="confirmPassword"
                required
                value={formData.confirmPassword}
                onChange={handleChange}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="••••••••"
              />
            </div>
            </>
            )}
            </>
            )}

            <div>
              <label htmlFor="username" className="block text-sm font-semibold text-gray-700 mb-2">
                Username
              </label>
              <input
                id="username"
                type="text"
                name="username"
                required
                autoComplete="username"
                value={formData.username}
                onChange={handleChange}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="Username"
              />
              <p className="text-sm text-gray-600 mt-1">3–20 letters, numbers, or underscores. Uppercase letters become lowercase.</p>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-blue-600 text-white py-2 rounded-lg font-semibold hover:bg-blue-700 transition disabled:opacity-50"
            >
              {loading ? 'Saving...' : stage === 'signup' ? 'Create Account' : 'Finish Setup'}
            </button>
          </form>
          )}

          <p className="text-center text-gray-600 text-sm mt-6">
            Already have an account?{' '}
            <Link href="/auth/login" className="text-blue-600 font-semibold hover:underline">
              Sign In
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
