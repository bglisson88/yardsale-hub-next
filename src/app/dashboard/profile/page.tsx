'use client';

import { useEffect, useState } from 'react';
import { doc, setDoc, Timestamp } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { db, storage } from '@/lib/firebase';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import toast from 'react-hot-toast';
import { ArrowLeft, Upload } from 'lucide-react';
import { useAuthStore } from '@/store';
import { useAuthContext } from '@/hooks';
import { LoadingSpinner, Avatar } from '@/components';
import { CITIES, PRESET_AVATARS } from '@/lib/constants';

const MAX_AVATAR_BYTES = 5 * 1024 * 1024;

export default function EditProfile() {
  const { user, loading: authLoading, setUser } = useAuthStore();
  useAuthContext();
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [initialized, setInitialized] = useState(false);
  const [formData, setFormData] = useState({ displayName: '', location: '', bio: '' });
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [photoURL, setPhotoURL] = useState<string | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  useEffect(() => {
    if (user && !initialized) {
      setFormData({
        displayName: user.displayName || '',
        location: user.location || '',
        bio: user.bio || '',
      });
      setPhotoURL(user.photoURL || null);
      setInitialized(true);
    }
  }, [user, initialized]);

  useEffect(() => {
    if (!authLoading && !user) router.push('/auth/login');
  }, [authLoading, user, router]);

  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  if (authLoading || !user) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <LoadingSpinner />
      </div>
    );
  }

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      toast.error('Please choose an image file');
      return;
    }
    if (file.size > MAX_AVATAR_BYTES) {
      toast.error('Image must be under 5MB');
      return;
    }
    setPhotoFile(file);
    setPreviewUrl(URL.createObjectURL(file));
  };

  const choosePreset = (url: string) => {
    setPhotoFile(null);
    setPreviewUrl(null);
    setPhotoURL(url);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.displayName.trim()) {
      toast.error('Display name is required');
      return;
    }
    setSaving(true);
    try {
      let finalPhoto = photoURL;
      if (photoFile) {
        const storageRef = ref(storage, `avatars/${user.id}/${Date.now()}_${photoFile.name}`);
        await uploadBytes(storageRef, photoFile);
        finalPhoto = await getDownloadURL(storageRef);
      }

      const updates = {
        displayName: formData.displayName.trim(),
        location: formData.location,
        bio: formData.bio,
        photoURL: finalPhoto,
      };

      await setDoc(
        doc(db, 'users', user.id),
        { id: user.id, email: user.email, ...updates, updatedAt: Timestamp.now() },
        { merge: true }
      );

      setUser({ ...user, ...updates, updatedAt: new Date() });
      toast.success('Profile updated!');
      router.push('/dashboard');
    } catch (error: any) {
      toast.error(error.message || 'Failed to update profile');
    } finally {
      setSaving(false);
    }
  };

  const shownPhoto = previewUrl || photoURL;
  const inputClass =
    'w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500';

  return (
    <div className="max-w-2xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
      <Link href="/dashboard" className="flex items-center gap-2 text-brand-700 hover:text-brand-800 mb-6">
        <ArrowLeft size={20} /> Back to Dashboard
      </Link>

      <div className="bg-white rounded-2xl shadow-lg p-8">
        <h1 className="text-3xl font-bold text-gray-900 mb-8">Edit Profile</h1>

        <form onSubmit={handleSubmit} className="space-y-6">
          <div>
            <p className="block text-sm font-semibold text-gray-700 mb-3">Profile Picture</p>
            <div className="flex items-center gap-6">
              <Avatar src={shownPhoto} name={formData.displayName} size={96} />
              <div>
                <input type="file" accept="image/*" onChange={handleFile} className="hidden" id="avatar-upload" />
                <label
                  htmlFor="avatar-upload"
                  className="inline-flex items-center gap-2 cursor-pointer px-4 py-2 rounded-lg bg-brand-50 text-brand-700 font-semibold hover:bg-brand-100"
                >
                  <Upload size={16} aria-hidden="true" /> Upload photo
                </label>
                {shownPhoto && (
                  <button
                    type="button"
                    onClick={() => {
                      setPhotoFile(null);
                      setPreviewUrl(null);
                      setPhotoURL(null);
                    }}
                    className="ml-3 text-sm text-gray-600 hover:underline"
                  >
                    Use default avatar
                  </button>
                )}
              </div>
            </div>
            <p className="text-sm text-gray-600 mt-4 mb-2">Or pick an avatar:</p>
            <div className="flex flex-wrap gap-3">
              {PRESET_AVATARS.map((url) => (
                <button
                  key={url}
                  type="button"
                  onClick={() => choosePreset(url)}
                  aria-label="Choose this avatar"
                  className={`rounded-full ring-2 ${!previewUrl && photoURL === url ? 'ring-brand-600' : 'ring-transparent hover:ring-brand-300'}`}
                >
                  <Avatar src={url} name="Preset" size={48} />
                </button>
              ))}
            </div>
          </div>

          <div>
            <label htmlFor="displayName" className="block text-sm font-semibold text-gray-700 mb-2">
              Display Name *
            </label>
            <input
              id="displayName"
              type="text"
              name="displayName"
              required
              value={formData.displayName}
              onChange={handleChange}
              className={inputClass}
            />
          </div>

          <div>
            <label htmlFor="location" className="block text-sm font-semibold text-gray-700 mb-2">
              Location
            </label>
            <select
              id="location"
              name="location"
              value={formData.location}
              onChange={handleChange}
              className={`${inputClass} bg-white`}
            >
              <option value="">Select a location</option>
              {CITIES.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </div>

          <div>
            <label htmlFor="bio" className="block text-sm font-semibold text-gray-700 mb-2">Bio</label>
            <textarea
              id="bio"
              name="bio"
              rows={4}
              value={formData.bio}
              onChange={handleChange}
              className={inputClass}
              placeholder="Tell buyers a little about yourself..."
            />
          </div>

          <button type="submit" disabled={saving} className="btn-primary w-full disabled:opacity-50">
            {saving ? 'Saving...' : 'Save Changes'}
          </button>
        </form>
      </div>
    </div>
  );
}
