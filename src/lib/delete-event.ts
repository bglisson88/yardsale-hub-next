import { collection, doc, getDoc, getDocsFromServer, query, where, writeBatch } from 'firebase/firestore';
import { deleteObject, ref } from 'firebase/storage';
import { db, storage } from '@/lib/firebase';

export async function deleteOwnedEvent(eventId: string, userId: string): Promise<string | null> {
  const eventRef = doc(db, 'yardSaleEvents', eventId);
  const privateRef = doc(db, 'eventPrivate', eventId);
  const event = await getDoc(eventRef);
  if (!event.exists()) throw new Error('This event no longer exists.');
  if (event.data().userId !== userId) throw new Error('You can only delete your own events.');
  const privateEvent = await getDoc(privateRef);
  if (privateEvent.exists() && privateEvent.data().userId !== userId) {
    throw new Error('The private event record could not be verified. No data was deleted.');
  }

  const photoURL = event.data().photoURL;
  const batch = writeBatch(db);
  batch.delete(eventRef);
  if (privateEvent.exists()) batch.delete(privateRef);
  try {
    await batch.commit();
  } catch (error) {
    console.error('Event deletion could not be confirmed:', error);
    throw new Error('Could not confirm event deletion. Refresh and check the event before retrying.');
  }

  if (!photoURL) return null;
  try {
    const photo = ref(storage, photoURL);
    const prefix = `events/${userId}/${eventId}_`;
    const suffix = photo.fullPath.slice(prefix.length);
    if (photo.bucket !== ref(storage).bucket || !photo.fullPath.startsWith(prefix) ||
        !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}_[^/]+$/i.test(suffix)) {
      return 'Event deleted. Its legacy or external photo was retained for manual review.';
    }
    const [events, items] = await Promise.all([
      getDocsFromServer(query(collection(db, 'yardSaleEvents'), where('photoURL', '==', photoURL))),
      getDocsFromServer(query(collection(db, 'items'), where('photoURLs', 'array-contains', photoURL))),
    ]);
    if (!events.empty || !items.empty) return 'Event deleted. Its photo is still referenced by another listing and was retained.';
    await deleteObject(photo);
    return null;
  } catch (error) {
    if (typeof error === 'object' && error !== null && 'code' in error && error.code === 'storage/object-not-found') return null;
    console.error('Event deleted but photo cleanup failed:', error);
    return 'Event deleted, but its photo could not be cleaned up. Please contact support.';
  }
}
