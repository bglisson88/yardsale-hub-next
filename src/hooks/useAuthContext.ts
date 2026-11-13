'use client';

import { useEffect } from 'react';
import { onAuthStateChanged, type User as FirebaseUser } from 'firebase/auth';
import { auth, db } from '@/lib/firebase';
import { doc, getDoc } from 'firebase/firestore';
import { useAuthStore } from '@/store';
import type { User } from '@/types';

export async function loadAuthUser(firebaseUser: FirebaseUser): Promise<User> {
  const userDoc = await getDoc(doc(db, 'users', firebaseUser.uid));
  if (userDoc.exists()) return userDoc.data() as User;
  return {
    id: firebaseUser.uid,
    email: firebaseUser.email || '',
    displayName: firebaseUser.displayName || 'User',
    photoURL: firebaseUser.photoURL || null,
    location: '',
    bio: '',
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

export function useAuthContext() {
  const { user, setUser, setLoading } = useAuthStore();

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      if (firebaseUser) {
        try {
          const profile = await loadAuthUser(firebaseUser);
          if (auth.currentUser?.uid === firebaseUser.uid) setUser(profile);
        } catch (error) {
          console.error('Error fetching user:', error);
        }
      } else {
        setUser(null);
      }
      setLoading(false);
    });

    return () => unsubscribe();
  }, [setUser, setLoading]);

  return { user };
}
