import { doc, getDoc, writeBatch } from 'firebase/firestore';
import { ref } from 'firebase/storage';
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
    return 'Event deleted. Its photo was retained; cleanup is deferred until references can be checked safely.';
  } catch (error) {
    console.error('Event photo cleanup was deferred:', error);
    return 'Event deleted. Its photo was retained because it could not be verified safely.';
  }
}
