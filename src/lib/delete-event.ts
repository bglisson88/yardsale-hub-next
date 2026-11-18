import { doc, getDoc } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { ref } from 'firebase/storage';
import { db, functions, storage } from '@/lib/firebase';

const pendingDeleteOperations = new Map<string, {
  eventVersion: number;
  updatedAtMs: number | null;
  operationId: string;
}>();

export async function deleteOwnedEvent(eventId: string, userId: string): Promise<string | null> {
  const eventRef = doc(db, 'yardSaleEvents', eventId);
  const privateRef = doc(db, 'eventPrivate', eventId);
  const event = await getDoc(eventRef);
  const operationKey = `${userId}:${eventId}`;
  if (!event.exists()) {
    pendingDeleteOperations.delete(operationKey);
    return 'Event was already deleted. Its photo could not be verified for cleanup.';
  }
  if (event.data().userId !== userId) throw new Error('You can only delete your own events.');
  const privateEvent = await getDoc(privateRef);
  if (privateEvent.exists() && privateEvent.data().userId !== userId) {
    throw new Error('The private event record could not be verified. No data was deleted.');
  }

  const photoURL = event.data().photoURL;
  try {
    const eventVersion: unknown = event.data().eventVersion ?? 0;
    if (!Number.isSafeInteger(eventVersion) || (eventVersion as number) < 0) {
      throw new Error('The event version is invalid. Reload and try again.');
    }
    const updatedAt = event.data().updatedAt;
    const expectedUpdatedAtMs = updatedAt && typeof updatedAt.toMillis === 'function'
      ? updatedAt.toMillis()
      : null;
    const pending = pendingDeleteOperations.get(operationKey);
    const operationId = pending &&
      pending.eventVersion === eventVersion &&
      pending.updatedAtMs === expectedUpdatedAtMs
      ? pending.operationId
      : crypto.randomUUID();
    pendingDeleteOperations.set(operationKey, {
      eventVersion: eventVersion as number,
      updatedAtMs: expectedUpdatedAtMs,
      operationId,
    });
    const removeEvent = httpsCallable(functions, 'deleteEventWithConsent');
    await removeEvent({
      eventId,
      operationId,
      expectedEventVersion: eventVersion,
      expectedUpdatedAtMs,
    });
    pendingDeleteOperations.delete(operationKey);
  } catch (error) {
    console.error('Event deletion could not be confirmed:', error);
    if (error instanceof Error && error.message.startsWith('The event version is invalid')) {
      throw error;
    }
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
