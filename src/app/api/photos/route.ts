import { NextResponse } from 'next/server';
import { PhotoLifecycleError, validIdentifier } from '@/lib/photo-lifecycle';
import { getPhotoBackend } from '@/lib/server/photo-admin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  if (process.env.PHOTO_LIFECYCLE_ENABLED !== 'true') {
    return NextResponse.json({ error: 'Photo service is not enabled.' }, { status: 503 });
  }
  if (request.headers.get('origin') !== new URL(request.url).origin) {
    return NextResponse.json({ error: 'Request origin rejected.' }, { status: 403 });
  }
  const token = request.headers.get('authorization')?.match(/^Bearer (\S+)$/)?.[1];
  if (!token) return NextResponse.json({ error: 'Sign in required.' }, { status: 401 });
  let backend: ReturnType<typeof getPhotoBackend>;
  try {
    backend = getPhotoBackend();
  } catch {
    console.error('photo-service-configuration-error');
    return NextResponse.json({ error: 'Photo service is unavailable.' }, { status: 503 });
  }
  let uid: string;
  try {
    uid = (await backend.auth.verifyIdToken(token, true)).uid;
  } catch {
    return NextResponse.json({ error: 'Sign in again before uploading.' }, { status: 401 });
  }
  let input: unknown;
  try {
    const body = await request.text();
    if (body.length > 4096) throw new Error('Body too large');
    input = JSON.parse(body);
  } catch {
    return NextResponse.json({ error: 'Invalid photo request.' }, { status: 400 });
  }
  if (!input || typeof input !== 'object') {
    return NextResponse.json({ error: 'Invalid photo request.' }, { status: 400 });
  }
  const data = input as Record<string, unknown>;
  try {
    if (data.action === 'reserve' || data.action === 'commit') {
      if ((data.kind !== 'items' && data.kind !== 'events')
          || typeof data.recordId !== 'string' || !validIdentifier(data.recordId)) {
        throw new PhotoLifecycleError('invalid');
      }
      if (data.action === 'reserve') {
        const photo = await backend.service.reserve(uid, data.kind, data.recordId);
        return NextResponse.json({ photo }, { headers: { 'Cache-Control': 'no-store' } });
      }
      if (!Number.isSafeInteger(data.revision) || typeof data.revision !== 'number'
          || data.revision < 0 || !Array.isArray(data.photoIds) || data.photoIds.length > 5
          || !data.photoIds.every(id => typeof id === 'string' && validIdentifier(id))) {
        throw new PhotoLifecycleError('invalid');
      }
      const revision = await backend.service.commit(
        uid, data.kind, data.recordId, data.revision, data.photoIds,
      );
      return NextResponse.json({ revision });
    }
    if (typeof data.photoId !== 'string' || !validIdentifier(data.photoId)) {
      throw new PhotoLifecycleError('invalid');
    }
    if (data.action === 'verify') await backend.service.verify(uid, data.photoId);
    else if (data.action === 'cancel') await backend.service.cancel(uid, data.photoId);
    else if (data.action === 'cleanup') await backend.service.cleanup(uid, data.photoId);
    else throw new PhotoLifecycleError('invalid');
    return NextResponse.json({ complete: true });
  } catch (error) {
    if (error instanceof PhotoLifecycleError) {
      const status = error.code === 'forbidden' ? 403 : error.code === 'invalid' ? 400 : 409;
      return NextResponse.json({ error: error.message }, { status });
    }
    // Never log provider errors, object URLs, tokens, or record contents.
    console.error('photo-service-operation-failed', { action: data.action });
    return NextResponse.json({ error: 'Photo operation failed. Retry safely.' }, { status: 503 });
  }
}
