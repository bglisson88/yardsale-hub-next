import { Timestamp, type DocumentData } from 'firebase-admin/firestore';
import { validCatalogLocation } from './location-catalog';
const SOURCE_REQUIRED_FIELDS = [
  'userId', 'title', 'description', 'location', 'locationId',
  'locationVisibility', 'startDate', 'endDate', 'photoURL',
  'createdAt', 'updatedAt', 'itemCount',
];
const SOURCE_OPTIONAL_FIELDS = ['eventVersion'];
const LOCATION_ID_PATTERN = /^[a-z0-9][a-z0-9_-]{0,63}$/;

export interface PublicEventProjection extends DocumentData {
  schemaVersion: 1;
  title: string;
  description: string;
  location: string;
  locationId: string;
  locationVisibility: 'general' | 'exact';
  startDate: Timestamp;
  endDate: Timestamp;
  photoURL: string | null;
  createdAt: Timestamp;
  updatedAt: Timestamp;
  itemCount: number;
}

function isRecord(value: unknown): value is DocumentData {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function hasOnlySourceFields(data: DocumentData): boolean {
  const allowedFields = [...SOURCE_REQUIRED_FIELDS, ...SOURCE_OPTIONAL_FIELDS];
  return SOURCE_REQUIRED_FIELDS.every(field => Object.hasOwn(data, field)) &&
    Object.keys(data).every(field => allowedFields.includes(field));
}

export function buildPublicEventProjection(
  value: unknown,
  catalog: DocumentData | undefined,
): PublicEventProjection | null {
  if (!isRecord(value) || !hasOnlySourceFields(value)) return null;
  if (
    typeof value.userId !== 'string' ||
    !value.userId ||
    typeof value.title !== 'string' ||
    value.title.length === 0 ||
    value.title.length > 120 ||
    typeof value.description !== 'string' ||
    value.description.length > 5000 ||
    typeof value.location !== 'string' ||
    typeof value.locationId !== 'string' ||
    !LOCATION_ID_PATTERN.test(value.locationId) ||
    !['general', 'exact'].includes(value.locationVisibility) ||
    !(value.startDate instanceof Timestamp) ||
    !(value.endDate instanceof Timestamp) ||
    value.endDate.toMillis() <= value.startDate.toMillis() ||
    !(value.photoURL === null ||
      (typeof value.photoURL === 'string' && value.photoURL.length <= 2048)) ||
    !(value.createdAt instanceof Timestamp) ||
    !(value.updatedAt instanceof Timestamp) ||
    !Number.isSafeInteger(value.itemCount) ||
    value.itemCount < 0 ||
    (Object.hasOwn(value, 'eventVersion') &&
      (!Number.isSafeInteger(value.eventVersion) || value.eventVersion < 0)) ||
    !validCatalogLocation(catalog, value.location)
  ) {
    return null;
  }

  const projection: PublicEventProjection = {
    schemaVersion: 1,
    title: value.title,
    description: value.description,
    location: value.location,
    locationId: value.locationId,
    locationVisibility: value.locationVisibility,
    startDate: value.startDate,
    endDate: value.endDate,
    photoURL: value.photoURL,
    createdAt: value.createdAt,
    updatedAt: value.updatedAt,
    itemCount: value.itemCount,
  };
  return projection;
}
