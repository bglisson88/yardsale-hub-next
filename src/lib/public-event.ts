import type { PublicYardSaleEvent } from '@/types';

export function eventDate(value: unknown): Date | null {
  const date = value && typeof value === 'object' && 'toDate' in value &&
    typeof value.toDate === 'function' ? value.toDate() : value;
  return date instanceof Date && !Number.isNaN(date.getTime()) ? date : null;
}

export function parsePublicEvent(document: {
  id: string;
  data(): Record<string, unknown>;
}): PublicYardSaleEvent | null {
  const data = document.data();
  const startDate = eventDate(data.startDate);
  const endDate = eventDate(data.endDate);
  const createdAt = eventDate(data.createdAt);
  const updatedAt = eventDate(data.updatedAt);
  if (
    data.schemaVersion !== 1 ||
    typeof data.title !== 'string' ||
    typeof data.description !== 'string' ||
    typeof data.location !== 'string' ||
    typeof data.locationId !== 'string' ||
    (data.locationVisibility !== 'general' && data.locationVisibility !== 'exact') ||
    !startDate ||
    !endDate ||
    !createdAt ||
    !updatedAt ||
    !(data.photoURL === null || typeof data.photoURL === 'string') ||
    typeof data.itemCount !== 'number' ||
    !Number.isSafeInteger(data.itemCount) ||
    data.itemCount < 0
  ) return null;
  return {
    id: document.id,
    title: data.title,
    description: data.description,
    location: data.location,
    locationId: data.locationId,
    locationVisibility: data.locationVisibility,
    startDate,
    endDate,
    photoURL: data.photoURL,
    createdAt,
    updatedAt,
    itemCount: data.itemCount,
  };
}
