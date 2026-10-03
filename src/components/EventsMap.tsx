'use client';

import { useEffect, useMemo, useState } from 'react';
import { MapContainer, TileLayer, Marker, Popup } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import Link from 'next/link';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useAuthStore } from '@/store';
import { CITY_CENTERS, DEFAULT_MAP_CENTER } from '@/lib/constants';
import { getInitials, getAvatarColorIndex } from './Avatar';
import type { YardSaleEvent } from '@/types';

const PIN_COLORS = ['#f97316', '#0d9488', '#4f46e5', '#ec4899', '#f59e0b', '#059669', '#7c3aed'];

const escapeHtml = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');

const isSafeUrl = (url: string) => /^https?:\/\//i.test(url);

function createPinIcon(photoURL: string | null | undefined, name: string | undefined) {
  const base =
    'width:44px;height:44px;border-radius:50%;border:3px solid #fff;box-shadow:0 2px 8px rgba(0,0,0,.4);overflow:hidden;display:flex;align-items:center;justify-content:center;';
  const inner =
    photoURL && isSafeUrl(photoURL)
      ? `<img src="${escapeHtml(photoURL)}" alt="" style="width:100%;height:100%;object-fit:cover;" />`
      : `<span style="color:#fff;font:700 16px sans-serif;">${escapeHtml(getInitials(name))}</span>`;
  const bg = photoURL && isSafeUrl(photoURL) ? '#fff' : PIN_COLORS[getAvatarColorIndex(name)];
  return L.divIcon({
    className: 'avatar-pin',
    html: `<div style="${base}background:${bg};">${inner}</div>`,
    iconSize: [44, 44],
    iconAnchor: [22, 22],
    popupAnchor: [0, -22],
  });
}

function resolvePosition(event: YardSaleEvent): [number, number] {
  if (event.latitude && event.longitude) return [event.latitude, event.longitude];
  const center = CITY_CENTERS[event.location] || DEFAULT_MAP_CENTER;
  // Deterministic small offset so fallback pins in one city don't stack exactly
  let hash = 0;
  for (let i = 0; i < event.id.length; i++) hash = (hash * 31 + event.id.charCodeAt(i)) >>> 0;
  const dx = ((hash % 100) / 100 - 0.5) * 0.02;
  const dy = (((hash >> 7) % 100) / 100 - 0.5) * 0.02;
  return [center.lat + dx, center.lng + dy];
}

export default function EventsMap({ events }: { events: YardSaleEvent[] }) {
  const { user } = useAuthStore();
  const [posters, setPosters] = useState<Record<string, { name?: string; photoURL?: string | null }>>({});

  // Legacy events lack denormalized poster info; look it up when permitted (signed-in users only)
  useEffect(() => {
    if (!user) return;
    const missing = Array.from(
      new Set(events.filter((e) => !e.posterName && !e.posterPhotoURL).map((e) => e.userId))
    ).filter((uid) => !(uid in posters));
    if (missing.length === 0) return;
    let cancelled = false;
    (async () => {
      const found: Record<string, { name?: string; photoURL?: string | null }> = {};
      for (const uid of missing) {
        try {
          const snap = await getDoc(doc(db, 'users', uid));
          found[uid] = snap.exists()
            ? { name: snap.data().displayName, photoURL: snap.data().photoURL || null }
            : {};
        } catch (error) {
          console.error('Error fetching poster:', error);
          found[uid] = {};
        }
      }
      if (!cancelled) setPosters((prev) => ({ ...prev, ...found }));
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [events, user]);

  const markers = useMemo(
    () =>
      events.map((event) => {
        const poster = posters[event.userId];
        const name = event.posterName || poster?.name;
        const photo = event.posterPhotoURL || poster?.photoURL;
        return { event, position: resolvePosition(event), icon: createPinIcon(photo, name) };
      }),
    [events, posters]
  );

  return (
    <MapContainer
      center={[DEFAULT_MAP_CENTER.lat, DEFAULT_MAP_CENTER.lng]}
      zoom={10}
      scrollWheelZoom
      className="w-full h-[500px] rounded-2xl shadow-lg z-0"
    >
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      {markers.map(({ event, position, icon }) => (
        <Marker key={event.id} position={position} icon={icon}>
          <Popup minWidth={220}>
            <div className="space-y-2">
              {event.photoURL && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={event.photoURL} alt={event.title} className="w-full h-28 object-cover rounded-lg" />
              )}
              <h3 className="font-bold text-base">{event.title}</h3>
              <p className="text-sm">
                {event.startDate.toLocaleDateString()}{' '}
                {event.startDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} –{' '}
                {event.endDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
              </p>
              <p className="text-sm">
                {event.address}, {event.location}
              </p>
              {event.description && <p className="text-sm text-gray-600 line-clamp-3">{event.description}</p>}
              <p className="text-sm font-semibold">{event.itemCount} items</p>
              <Link href={`/events/${event.id}`} className="inline-block text-brand-700 font-bold underline">
                View details
              </Link>
            </div>
          </Popup>
        </Marker>
      ))}
    </MapContainer>
  );
}
