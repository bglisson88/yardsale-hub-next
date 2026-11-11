import { randomUUID } from 'node:crypto';
import {
  cancelPhotoReservation, createPhotoReservation, PhotoLifecycleError, planPhotoCommit,
  verifyPhotoObject,
  type PhotoKind, type PhotoRecord, type PhotoReservation,
} from '../photo-lifecycle';

export interface PhotoTransaction {
  getRecord(kind: PhotoKind, id: string): Promise<PhotoRecord | null>;
  getPhoto(id: string): Promise<PhotoReservation | null>;
  createPhoto(photo: PhotoReservation): void;
  putPhoto(photo: PhotoReservation): void;
  putRecord(kind: PhotoKind, id: string, record: PhotoRecord, photoPaths: string[]): void;
}

export interface PhotoRepository {
  transaction<T>(operation: (transaction: PhotoTransaction) => Promise<T>): Promise<T>;
}

export interface PhotoObjects {
  inspect(path: string): Promise<{
    path: string; size: number; contentType: string; generation: string;
  } | null>;
  remove(path: string, generation: string): Promise<void>;
}

// No network or credentials are initialized here. Callers must verify an ID token
// and supply its UID, never a UID taken from the request body.
export class PhotoService {
  constructor(
    private readonly repository: PhotoRepository,
    private readonly objects: PhotoObjects,
    private readonly clock: () => number = Date.now,
    private readonly newId: () => string = randomUUID,
  ) {}

  async reserve(uid: string, kind: PhotoKind, recordId: string): Promise<PhotoReservation> {
    const photo = createPhotoReservation(uid, kind, recordId, this.newId(), this.clock());
    return this.repository.transaction(async transaction => {
      const record = await transaction.getRecord(kind, recordId);
      if (!record || record.ownerUid !== uid) throw new PhotoLifecycleError('forbidden');
      transaction.createPhoto(photo);
      return photo;
    });
  }

  async verify(uid: string, photoId: string): Promise<void> {
    const photo = await this.repository.transaction(async transaction => {
      const candidate = await transaction.getPhoto(photoId);
      if (!candidate || candidate.ownerUid !== uid) throw new PhotoLifecycleError('forbidden');
      return candidate;
    });
    const object = await this.objects.inspect(photo.path);
    if (!object) throw new PhotoLifecycleError('conflict');
    await this.repository.transaction(async transaction => {
      const current = await transaction.getPhoto(photoId);
      const record = await transaction.getRecord(photo.kind, photo.recordId);
      if (!current || current.ownerUid !== uid || !record || record.ownerUid !== uid) {
        throw new PhotoLifecycleError('forbidden');
      }
      if (current.state === 'ready' && current.generation === object.generation) return;
      transaction.putPhoto(verifyPhotoObject(current, object, this.clock()));
    });
  }

  async commit(
    uid: string, kind: PhotoKind, recordId: string, revision: number, desiredIds: string[],
  ): Promise<number> {
    return this.repository.transaction(async transaction => {
      const record = await transaction.getRecord(kind, recordId);
      if (!record) throw new PhotoLifecycleError('forbidden');
      const ids = [...new Set([...record.photoIds, ...desiredIds])];
      if (ids.length > 10) throw new PhotoLifecycleError('invalid');
      const photos: PhotoReservation[] = [];
      for (const id of ids) {
        const photo = await transaction.getPhoto(id);
        if (!photo) throw new PhotoLifecycleError('forbidden');
        photos.push(photo);
      }
      const plan = planPhotoCommit(uid, kind, recordId, record, revision, desiredIds, photos, this.clock());
      for (const photo of plan.photos) transaction.putPhoto(photo);
      transaction.putRecord(kind, recordId, plan.record,
        desiredIds.map(id => photos.find(photo => photo.id === id)!.path));
      return plan.record.revision;
    });
  }

  async cancel(uid: string, photoId: string): Promise<void> {
    await this.repository.transaction(async transaction => {
      const photo = await transaction.getPhoto(photoId);
      if (!photo) throw new PhotoLifecycleError('forbidden');
      transaction.putPhoto(cancelPhotoReservation(photo, uid));
    });
  }

  async cleanup(uid: string, photoId: string): Promise<void> {
    const photo = await this.repository.transaction(async transaction => {
      const current = await transaction.getPhoto(photoId);
      if (!current || current.ownerUid !== uid) throw new PhotoLifecycleError('forbidden');
      if (current.state === 'attached') throw new PhotoLifecycleError('conflict');
      if ((current.state === 'reserved' || current.state === 'ready')
          && this.clock() < current.expiresAt) throw new PhotoLifecycleError('conflict');
      const terminal = current.state === 'retired'
        ? current : cancelPhotoReservation(current, uid);
      transaction.putPhoto(terminal);
      return terminal;
    });
    const object = await this.objects.inspect(photo.path);
    if (!object) return;
    // Tombstones are deliberately retained: a delayed upload may finish after
    // cleanup. An independently scheduled reconciler must revisit them.
    await this.objects.remove(photo.path, object.generation);
  }
}
