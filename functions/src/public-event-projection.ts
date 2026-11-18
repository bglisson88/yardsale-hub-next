import {
  FieldPath,
  getFirestore,
  type Firestore,
  type QueryDocumentSnapshot,
} from 'firebase-admin/firestore';
import { onDocumentWritten } from 'firebase-functions/v2/firestore';
import { buildPublicEventProjection } from './public-event-projection-builder';
export { buildPublicEventProjection } from './public-event-projection-builder';
export type { PublicEventProjection } from './public-event-projection-builder';
import { profileEventOptions } from './runtime-options';

const LOCATION_ID_PATTERN = /^[a-z0-9][a-z0-9_-]{0,63}$/;
const LOCATION_BATCH_SIZE = 100;
const LOCATION_CONCURRENCY = 10;
export async function reconcilePublicEventProjection(
  firestore: Firestore,
  eventId: string,
): Promise<void> {
  const sourceRef = firestore.collection('yardSaleEvents').doc(eventId);
  const projectionRef = firestore.collection('publicYardSaleEvents').doc(eventId);

  await firestore.runTransaction(async transaction => {
    const [sourceSnapshot, projectionSnapshot] = await Promise.all([
      transaction.get(sourceRef),
      transaction.get(projectionRef),
    ]);
    const source = sourceSnapshot.data();
    const locationId = source?.locationId;
    const catalogSnapshot = typeof locationId === 'string' &&
        LOCATION_ID_PATTERN.test(locationId)
      ? await transaction.get(firestore.collection('generalLocations').doc(locationId))
      : undefined;
    const projection = sourceSnapshot.exists
      ? buildPublicEventProjection(source, catalogSnapshot?.data())
      : null;

    if (projection) transaction.set(projectionRef, projection);
    else if (projectionSnapshot.exists) transaction.delete(projectionRef);
  });
}

async function reconcileLocationProjections(
  firestore: Firestore,
  locationId: string,
): Promise<void> {
  const events = firestore.collection('yardSaleEvents');
  let cursor: QueryDocumentSnapshot | undefined;

  while (true) {
    let pageQuery = events
      .where('locationId', '==', locationId)
      .orderBy(FieldPath.documentId())
      .limit(LOCATION_BATCH_SIZE);
    if (cursor) pageQuery = pageQuery.startAfter(cursor);
    const page = await pageQuery.get();
    if (page.empty) return;

    for (let offset = 0; offset < page.docs.length; offset += LOCATION_CONCURRENCY) {
      await Promise.all(page.docs
        .slice(offset, offset + LOCATION_CONCURRENCY)
        .map(event => reconcilePublicEventProjection(firestore, event.id)));
    }
    cursor = page.docs[page.docs.length - 1];
    if (page.docs.length < LOCATION_BATCH_SIZE) return;
  }
}

const projectionRuntimeOptions = {
  ...profileEventOptions,
  retry: true,
};

export const projectPublicYardSaleEvent = onDocumentWritten({
  ...projectionRuntimeOptions,
  document: 'yardSaleEvents/{eventId}',
}, async event => {
  await reconcilePublicEventProjection(getFirestore(), event.params.eventId);
});
export const refreshPublicEventsForLocation = onDocumentWritten({
  ...projectionRuntimeOptions,
  document: 'generalLocations/{locationId}',
}, async event => {
  const { locationId } = event.params;
  if (typeof locationId !== 'string' || !LOCATION_ID_PATTERN.test(locationId)) return;
  await reconcileLocationProjections(getFirestore(), locationId);
});
