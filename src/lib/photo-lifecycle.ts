export type PhotoKind = 'items' | 'events';
export type PhotoState = 'reserved' | 'ready' | 'attached' | 'retired' | 'cancelled';

export interface PhotoReservation {
  id: string;
  ownerUid: string;
  kind: PhotoKind;
  recordId: string;
  path: string;
  state: PhotoState;
  expiresAt: number;
  generation?: string;
}

export interface PhotoRecord {
  ownerUid: string;
  revision: number;
  photoIds: string[];
}

export class PhotoLifecycleError extends Error {
  constructor(public readonly code: 'invalid' | 'forbidden' | 'conflict' | 'expired') {
    super(`Photo operation rejected: ${code}.`);
  }
}

export const MAX_PHOTO_BYTES = 10 * 1024 * 1024;
export const PHOTO_MIME_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
export const RESERVATION_DURATION = 30 * 60 * 1000;

export function validIdentifier(value: string): boolean {
  return /^[A-Za-z0-9_-]{1,128}$/.test(value);
}

export function createPhotoReservation(
  ownerUid: string, kind: PhotoKind, recordId: string, photoId: string, now: number,
): PhotoReservation {
  if (!ownerUid || ownerUid.includes('/') || !validIdentifier(recordId)
      || !validIdentifier(photoId) || !['items', 'events'].includes(kind)) {
    throw new PhotoLifecycleError('invalid');
  }
  return {
    id: photoId,
    ownerUid,
    kind,
    recordId,
    path: `recordPhotos/${kind}/${ownerUid}/${recordId}/${photoId}`,
    state: 'reserved',
    expiresAt: now + RESERVATION_DURATION,
  };
}

export function verifyPhotoObject(
  reservation: PhotoReservation,
  object: { path: string; size: number; contentType: string; generation: string },
  now: number,
): PhotoReservation {
  if (reservation.state !== 'reserved') throw new PhotoLifecycleError('conflict');
  if (now >= reservation.expiresAt) throw new PhotoLifecycleError('expired');
  if (object.path !== reservation.path || !object.generation
      || !PHOTO_MIME_TYPES.includes(object.contentType)
      || object.size <= 0 || object.size > MAX_PHOTO_BYTES) {
    throw new PhotoLifecycleError('invalid');
  }
  return { ...reservation, state: 'ready', generation: object.generation };
}

// Called inside one repository transaction with the record and all affected manifests.
export function planPhotoCommit(
  uid: string,
  kind: PhotoKind,
  recordId: string,
  record: PhotoRecord,
  expectedRevision: number,
  desiredIds: string[],
  reservations: PhotoReservation[],
  now: number,
): { record: PhotoRecord; photos: PhotoReservation[] } {
  if (record.ownerUid !== uid) throw new PhotoLifecycleError('forbidden');
  if (record.revision !== expectedRevision) throw new PhotoLifecycleError('conflict');
  if (desiredIds.length > (kind === 'items' ? 5 : 1)
      || new Set(desiredIds).size !== desiredIds.length) {
    throw new PhotoLifecycleError('invalid');
  }
  const affected = new Set([...record.photoIds, ...desiredIds]);
  const byId = new Map(reservations.map(photo => [photo.id, photo]));
  const photos: PhotoReservation[] = [];
  for (const id of affected) {
    const photo = byId.get(id);
    if (!photo || photo.ownerUid !== uid || photo.kind !== kind || photo.recordId !== recordId
        || photo.path !== `recordPhotos/${kind}/${uid}/${recordId}/${id}`) {
      throw new PhotoLifecycleError('forbidden');
    }
    if (desiredIds.includes(id)) {
      const alreadyAttached = record.photoIds.includes(id) && photo.state === 'attached';
      if (!alreadyAttached && (photo.state !== 'ready' || !photo.generation)) {
        throw new PhotoLifecycleError('conflict');
      }
      if (!alreadyAttached && now >= photo.expiresAt) throw new PhotoLifecycleError('expired');
      photos.push({ ...photo, state: 'attached' });
    } else {
      if (photo.state !== 'attached') throw new PhotoLifecycleError('conflict');
      photos.push({ ...photo, state: 'retired' });
    }
  }
  return {
    record: { ...record, revision: record.revision + 1, photoIds: [...desiredIds] },
    photos,
  };
}

export function cancelPhotoReservation(photo: PhotoReservation, uid: string): PhotoReservation {
  if (photo.ownerUid !== uid) throw new PhotoLifecycleError('forbidden');
  if (photo.state === 'attached' || photo.state === 'retired') {
    throw new PhotoLifecycleError('conflict');
  }
  return { ...photo, state: 'cancelled' };
}
