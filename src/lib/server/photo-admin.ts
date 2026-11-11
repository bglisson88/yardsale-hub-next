import { cert, getApps, initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';
import { getStorage } from 'firebase-admin/storage';
import {
  PhotoLifecycleError, validIdentifier,
  type PhotoKind, type PhotoRecord, type PhotoReservation,
} from '../photo-lifecycle';
import { PhotoService, type PhotoRepository, type PhotoObjects } from './photo-service';

function configuration() {
  if (process.env.PHOTO_LIFECYCLE_ENABLED !== 'true') throw new Error('Photo service disabled');
  const projectId = process.env.FIREBASE_ADMIN_PROJECT_ID;
  const bucket = process.env.FIREBASE_ADMIN_STORAGE_BUCKET;
  const clientEmail = process.env.FIREBASE_ADMIN_CLIENT_EMAIL;
  const privateKey = process.env.FIREBASE_ADMIN_PRIVATE_KEY;
  if (!projectId || !bucket || !clientEmail || !privateKey
      || projectId !== process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID
      || bucket !== process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET
      || process.env.FIREBASE_AUTH_EMULATOR_HOST || process.env.FIRESTORE_EMULATOR_HOST
      || process.env.FIREBASE_STORAGE_EMULATOR_HOST) {
    throw new Error('Photo service configuration mismatch');
  }
  const app = getApps().find(candidate => candidate.name === 'photo-lifecycle')
    ?? initializeApp({
      credential: cert({ projectId, clientEmail, privateKey: privateKey.replace(/\\n/g, '\n') }),
      storageBucket: bucket,
    }, 'photo-lifecycle');
  return { app, bucket };
}

function targetCollection(kind: PhotoKind) {
  return kind === 'items' ? 'items' : 'yardSaleEvents';
}

export function getPhotoBackend() {
  const { app, bucket: bucketName } = configuration();
  const database = getFirestore(app);
  const bucket = getStorage(app).bucket(bucketName);
  const repository: PhotoRepository = {
    transaction: operation => database.runTransaction(async transaction => operation({
      async getRecord(kind, id) {
        const snapshot = await transaction.get(database.collection(targetCollection(kind)).doc(id));
        if (!snapshot.exists) return null;
        const data = snapshot.data()!;
        // Never silently drop legacy references or invent an association.
        if (data.photoRevision === undefined
            && (kind === 'items' ? data.photoURLs?.length : data.photoURL)) {
          throw new PhotoLifecycleError('conflict');
        }
        return {
          ownerUid: data.userId,
          revision: data.photoRevision ?? 0,
          photoIds: data.photoIds ?? [],
        } satisfies PhotoRecord;
      },
      async getPhoto(id) {
        if (!validIdentifier(id)) throw new PhotoLifecycleError('invalid');
        const snapshot = await transaction.get(database.collection('photoReservations').doc(id));
        return snapshot.exists ? snapshot.data() as PhotoReservation : null;
      },
      createPhoto(photo) {
        transaction.create(database.collection('photoReservations').doc(photo.id), photo);
      },
      putPhoto(photo) {
        transaction.set(database.collection('photoReservations').doc(photo.id), photo);
      },
      putRecord(kind, id, record, paths) {
        const urls = paths.map(path =>
          `https://firebasestorage.googleapis.com/v0/b/${encodeURIComponent(bucketName)}/o/${encodeURIComponent(path)}?alt=media`);
        transaction.update(database.collection(targetCollection(kind)).doc(id), {
          photoRevision: record.revision,
          photoIds: record.photoIds,
          photoPaths: paths,
          ...(kind === 'items' ? { photoURLs: urls } : { photoURL: urls[0] ?? null }),
        });
      },
    })),
  };
  const objects: PhotoObjects = {
    async inspect(path) {
      const file = bucket.file(path);
      let metadata;
      try {
        [metadata] = await file.getMetadata();
      } catch (error) {
        if (error && typeof error === 'object' && 'code' in error && error.code === 404) return null;
        throw error;
      }
      return {
        path: metadata.name ?? '',
        size: Number(metadata.size),
        contentType: metadata.contentType ?? '',
        generation: String(metadata.generation ?? ''),
      };
    },
    async remove(path, generation) {
      await bucket.file(path).delete({ ifGenerationMatch: generation, ignoreNotFound: true });
    },
  };
  return { auth: getAuth(app), service: new PhotoService(repository, objects) };
}
