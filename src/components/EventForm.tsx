'use client';

import { useEffect, useState } from 'react';
import {
  collection, deleteField, doc, getDoc, writeBatch,
} from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { db, storage } from '@/lib/firebase';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import toast from 'react-hot-toast';
import { Upload, ArrowLeft } from 'lucide-react';
import { useAuthStore } from '@/store';
import { useAuthContext } from '@/hooks';
import { LoadingSpinner } from '@/components';
import type { YardSaleEvent } from '@/types';
import {
  buildPrivateEventData, buildPublicEventData, getEventDateRange,
  type EventLocationVisibility,
} from '@/lib/event-data';

interface EventFormValues {
  title: string;
  description: string;
  address: string;
  location: string;
  locationVisibility: EventLocationVisibility;
  startDate: string;
  startTime: string;
  endDate: string;
  endTime: string;
}

const emptyForm = (location = ''): EventFormValues => ({
  title: '',
  description: '',
  address: '',
  location,
  locationVisibility: 'general',
  startDate: '',
  startTime: '',
  endDate: '',
  endTime: '',
});

function toLocalDateTime(value: Date | undefined, part: 'date' | 'time'): string {
  if (!value || Number.isNaN(value.getTime())) return '';
  const pad = (number: number) => String(number).padStart(2, '0');
  if (part === 'date') {
    return `${value.getFullYear()}-${pad(value.getMonth() + 1)}-${pad(value.getDate())}`;
  }
  return `${pad(value.getHours())}:${pad(value.getMinutes())}`;
}

function asDate(value: unknown): Date | undefined {
  if (value instanceof Date) return value;
  if (value && typeof value === 'object' && 'toDate' in value &&
      typeof value.toDate === 'function') {
    return value.toDate();
  }
  return undefined;
}

export default function EventForm({ eventId }: { eventId?: string }) {
  const { user, loading: authLoading } = useAuthStore();
  useAuthContext();
  const [values, setValues] = useState<EventFormValues>(emptyForm());
  const [loading, setLoading] = useState(false);
  const [recordLoading, setRecordLoading] = useState(Boolean(eventId));
  const [loadError, setLoadError] = useState('');
  const [loadedEvent, setLoadedEvent] = useState<YardSaleEvent | null>(null);
  const [privateRecordExists, setPrivateRecordExists] = useState(false);
  const [exactAddressConfirmed, setExactAddressConfirmed] = useState(false);
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [photoPreviewUrl, setPhotoPreviewUrl] = useState('');
  const [photoURL, setPhotoURL] = useState<string | null>(null);
  const router = useRouter();

  useEffect(() => {
    if (!authLoading && !user) router.replace('/auth/login');
  }, [authLoading, user, router]);

  useEffect(() => {
    if (!eventId || authLoading || !user) return;
    const currentEventId = eventId;
    const currentUserId = user.id;
    const currentUserLocation = user.location;
    let cancelled = false;

    async function loadEvent() {
      try {
        const eventSnapshot = await getDoc(doc(db, 'yardSaleEvents', currentEventId));
        if (!eventSnapshot.exists()) throw new Error('Sale not found.');
        const data = eventSnapshot.data();
        if (data.userId !== currentUserId) throw new Error('You can only edit your own sales.');

        const privateSnapshot = await getDoc(doc(db, 'eventPrivate', currentEventId));
        if (cancelled) return;
        const privateData = privateSnapshot.exists() ? privateSnapshot.data() : null;
        const startDate = asDate(data.startDate);
        const endDate = asDate(data.endDate);
        const createdAt = asDate(data.createdAt);
        const updatedAt = asDate(data.updatedAt);
        setLoadedEvent({
          ...data,
          id: eventSnapshot.id,
          startDate,
          endDate,
          createdAt,
          updatedAt,
        } as YardSaleEvent);
        setPrivateRecordExists(privateSnapshot.exists());
        setPhotoURL(data.photoURL ?? null);
        setValues({
          title: data.title ?? '',
          description: data.description ?? '',
          address: privateData?.address ?? data.address ?? '',
          location: data.location ?? currentUserLocation ?? '',
          locationVisibility: data.locationVisibility === 'exact' ? 'exact' : 'general',
          startDate: toLocalDateTime(startDate, 'date'),
          startTime: toLocalDateTime(startDate, 'time'),
          endDate: toLocalDateTime(endDate, 'date'),
          endTime: toLocalDateTime(endDate, 'time'),
        });
      } catch (error) {
        if (!cancelled) {
          setLoadError(error instanceof Error ? error.message : 'Failed to load sale.');
        }
      } finally {
        if (!cancelled) setRecordLoading(false);
      }
    }

    void loadEvent();
    return () => { cancelled = true; };
  }, [eventId, authLoading, user]);

  const handleInputChange = (
    event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>,
  ) => {
    const { name, value } = event.target;
    setValues(previous => ({ ...previous, [name]: value }));
    if (name === 'address') setExactAddressConfirmed(false);
  };

  const handleVisibilityChange = (locationVisibility: EventLocationVisibility) => {
    setValues(previous => ({ ...previous, locationVisibility }));
    setExactAddressConfirmed(false);
  };

  const handlePhotoChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    setPhotoFile(file);
    setPhotoPreviewUrl(URL.createObjectURL(file));
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!user || loading) return;

    let dates: { startDate: Date; endDate: Date };
    try {
      dates = getEventDateRange(
        values.startDate, values.startTime, values.endDate, values.endTime,
      );
      if (!values.title.trim()) throw new Error('Please enter a sale title.');
      if (!(values.location.trim() || user.location.trim())) {
        throw new Error('Please provide a city, state, or general location.');
      }
      if (values.locationVisibility === 'exact') {
        if (!values.address.trim()) throw new Error('Enter the exact sale address.');
        if (!exactAddressConfirmed) {
          throw new Error('Confirm that you want the exact address published.');
        }
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Please review the sale details.');
      return;
    }

    setLoading(true);
    try {
      let nextPhotoURL = photoURL;
      if (photoFile) {
        const uploadRef = ref(storage, `events/${user.id}/${Date.now()}_${photoFile.name}`);
        await uploadBytes(uploadRef, photoFile);
        nextPhotoURL = await getDownloadURL(uploadRef);
      }

      const eventRef = eventId
        ? doc(db, 'yardSaleEvents', eventId)
        : doc(collection(db, 'yardSaleEvents'));
      const privateRef = doc(db, 'eventPrivate', eventRef.id);
      const now = new Date();
      const publicData = buildPublicEventData({
        userId: user.id,
        title: values.title,
        description: values.description,
        location: values.location || user.location,
        locationVisibility: values.locationVisibility,
        address: values.address,
        ...dates,
        photoURL: nextPhotoURL,
        createdAt: loadedEvent?.createdAt ?? now,
        updatedAt: now,
        itemCount: loadedEvent?.itemCount ?? 0,
      });
      const privateData = buildPrivateEventData(user.id, values.address);
      const batch = writeBatch(db);

      if (eventId) {
        batch.update(eventRef, {
          ...publicData,
          latitude: deleteField(),
          longitude: deleteField(),
          ...(values.locationVisibility === 'general' ? { address: deleteField() } : {}),
        });
      } else {
        batch.set(eventRef, publicData);
      }

      if (privateData) {
        batch.set(privateRef, privateData);
      } else if (eventId && privateRecordExists) {
        batch.delete(privateRef);
      }

      await batch.commit();
      toast.success(eventId ? 'Sale updated successfully!' : 'Yard sale event created!');
      router.push(eventId ? `/events/${eventId}` : '/dashboard');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to save sale.');
    } finally {
      setLoading(false);
    }
  };

  if (authLoading || recordLoading) {
    return <div className="min-h-screen flex items-center justify-center"><LoadingSpinner /></div>;
  }
  if (!user) return null;
  if (loadError) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-12">
        <p role="alert" className="mb-4 text-red-700">{loadError}</p>
        <Link href="/events" className="text-blue-600 underline">Back to events</Link>
      </div>
    );
  }

  const currentPhoto = photoPreviewUrl || photoURL;

  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
      <Link href={eventId ? `/events/${eventId}` : '/dashboard'} className="flex items-center gap-2 text-blue-600 hover:text-blue-700 mb-6">
        <ArrowLeft size={20} aria-hidden="true" /> Back
      </Link>

      <div className="bg-white rounded-2xl shadow-lg p-5 sm:p-8">
        <h1 className="text-3xl font-bold text-gray-900 mb-8">
          {eventId ? 'Edit Yard Sale' : 'Create Yard Sale Event'}
        </h1>

        <form onSubmit={handleSubmit} className="space-y-6">
          <div>
            <label htmlFor="event-title" className="block text-sm font-semibold text-gray-700 mb-2">Event Title *</label>
            <input id="event-title" name="title" type="text" required maxLength={120} value={values.title} onChange={handleInputChange} className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500" placeholder="e.g., Spring Garage Sale" />
          </div>

          <div>
            <label htmlFor="event-description" className="block text-sm font-semibold text-gray-700 mb-2">Description</label>
            <textarea id="event-description" name="description" value={values.description} onChange={handleInputChange} rows={4} maxLength={5000} className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500" placeholder="Describe your yard sale..." />
          </div>

          <fieldset className="space-y-3">
            <legend className="block text-sm font-semibold text-gray-700 mb-2">Address visibility</legend>
            <label className="flex items-start gap-3 rounded-lg border border-gray-300 p-3">
              <input
                type="radio"
                name="locationVisibility"
                value="general"
                checked={values.locationVisibility === 'general'}
                onChange={() => handleVisibilityChange('general')}
                className="mt-1"
              />
              <span>
                <span className="block font-semibold text-gray-900">General location only (default)</span>
                <span className="block text-sm text-gray-600">Shoppers see the city or broad area, not your street address or precise map pin.</span>
              </span>
            </label>
            <label className="flex items-start gap-3 rounded-lg border border-gray-300 p-3">
              <input
                type="radio"
                name="locationVisibility"
                value="exact"
                checked={values.locationVisibility === 'exact'}
                onChange={() => handleVisibilityChange('exact')}
                className="mt-1"
              />
              <span>
                <span className="block font-semibold text-gray-900">Publish exact address</span>
                <span className="block text-sm text-gray-600">The street address will be visible to anyone viewing this sale.</span>
              </span>
            </label>
          </fieldset>

          <div>
            <label htmlFor="event-address" className="block text-sm font-semibold text-gray-700 mb-2">
              {values.locationVisibility === 'exact' ? 'Exact street address *' : 'Private street address (optional)'}
            </label>
            <input
              id="event-address"
              name="address"
              type="text"
              required={values.locationVisibility === 'exact'}
              maxLength={300}
              autoComplete="street-address"
              value={values.address}
              onChange={handleInputChange}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="Street address"
            />
            {values.locationVisibility === 'exact' && (
              <div className="mt-3 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-950">
                <p className="font-semibold">This address will be publicly visible.</p>
                <label className="mt-3 flex items-start gap-2">
                  <input
                    type="checkbox"
                    checked={exactAddressConfirmed}
                    onChange={event => setExactAddressConfirmed(event.target.checked)}
                    className="mt-1"
                  />
                  <span>I understand and confirm that this exact address will be published.</span>
                </label>
              </div>
            )}
            {values.locationVisibility === 'general' && (
              <p className="mt-2 text-sm text-gray-600">If provided, the street address is stored privately for the organizer and is not included in public event data.</p>
            )}
          </div>

          <div>
            <label htmlFor="event-location" className="block text-sm font-semibold text-gray-700 mb-2">City or general area *</label>
            <select id="event-location" name="location" required value={values.location} onChange={handleInputChange} className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white">
              <option value="">Select a general location</option>
              {[...new Set([user.location, 'Nederland', 'Groves', 'West Beaumont', 'Orange County'].filter(Boolean))].map(location => (
                <option key={location} value={location}>{location}</option>
              ))}
            </select>
            <p className="mt-2 text-sm text-gray-600">Only this broad location is shown when exact address visibility is off.</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <label htmlFor="event-start-date" className="block text-sm font-semibold text-gray-700 mb-2">Start Date *</label>
              <input id="event-start-date" type="date" name="startDate" required value={values.startDate} onChange={handleInputChange} className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
            <div>
              <label htmlFor="event-start-time" className="block text-sm font-semibold text-gray-700 mb-2">Start Time *</label>
              <input id="event-start-time" type="time" name="startTime" required value={values.startTime} onChange={handleInputChange} className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
            <div>
              <label htmlFor="event-end-date" className="block text-sm font-semibold text-gray-700 mb-2">End Date *</label>
              <input id="event-end-date" type="date" name="endDate" required value={values.endDate} onChange={handleInputChange} className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
            <div>
              <label htmlFor="event-end-time" className="block text-sm font-semibold text-gray-700 mb-2">End Time *</label>
              <input id="event-end-time" type="time" name="endTime" required value={values.endTime} onChange={handleInputChange} className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
          </div>

          <div>
            <label htmlFor="event-photo" className="block text-sm font-semibold text-gray-700 mb-4">Event Photo (Optional)</label>
            <div className="border-2 border-dashed border-gray-300 rounded-lg p-6 text-center">
              <Upload className="mx-auto text-gray-400 mb-2" size={32} aria-hidden="true" />
              <input id="event-photo" type="file" accept="image/*" onChange={handlePhotoChange} className="mx-auto block max-w-full" />
            </div>
            {currentPhoto && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={currentPhoto} alt="Sale photo preview" className="mt-4 w-full h-48 object-cover rounded-lg" />
            )}
          </div>

          <button type="submit" disabled={loading} className="w-full bg-blue-600 text-white py-3 rounded-lg font-bold hover:bg-blue-700 transition disabled:opacity-50">
            {loading ? 'Saving...' : eventId ? 'Save Changes' : 'Create Event'}
          </button>
        </form>
      </div>
    </div>
  );
}
