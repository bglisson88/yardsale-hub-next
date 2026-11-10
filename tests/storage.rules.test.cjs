const fs = require('node:fs');
const { before, beforeEach, after, test } = require('node:test');
const assert = require('node:assert/strict');
const {
  initializeTestEnvironment,
  assertSucceeds,
  assertFails,
} = require('@firebase/rules-unit-testing');
const {
  deleteObject,
  getBytes,
  getMetadata,
  listAll,
  ref,
  updateMetadata,
  uploadBytes,
} = require('firebase/storage');

const PROJECT_ID = 'demo-yardsale-hub';
const IMAGE = new Uint8Array([0x89, 0x50, 0x4e, 0x47]);
const MAX_IMAGE_SIZE = 10 * 1024 * 1024;
let environment;

before(async () => {
  environment = await initializeTestEnvironment({
    projectId: PROJECT_ID,
    storage: { rules: fs.readFileSync('storage.rules', 'utf8') },
  });
});

beforeEach(async () => {
  await environment.clearStorage();
});

after(async () => {
  if (environment) await environment.cleanup();
});

function storage(uid) {
  const context = uid
    ? environment.authenticatedContext(uid)
    : environment.unauthenticatedContext();
  return context.storage();
}

function upload(bucket, path, bytes = IMAGE, contentType = 'image/png') {
  return uploadBytes(ref(bucket, path), bytes, { contentType });
}

for (const collection of ['items', 'events']) {
  test(`${collection}: owner can upload at the application's flat user path`, async () => {
    const path = `${collection}/alice/1799999999999_photo.png`;
    await assertSucceeds(upload(storage('alice'), path));
  });

  test(`${collection}: reads are public for images, but directory listings are denied`, async () => {
    const path = `${collection}/alice/photo.png`;
    await upload(storage('alice'), path);

    await assertSucceeds(getBytes(ref(storage(), path)));
    await assertSucceeds(getMetadata(ref(storage('bob'), path)));
    await assertFails(listAll(ref(storage())));
    await assertFails(listAll(ref(storage(), collection)));
    await assertFails(listAll(ref(storage(), `${collection}/alice`)));
  });

  test(`${collection}: only the authenticated path owner can create or delete`, async () => {
    const path = `${collection}/alice/photo.png`;
    await assertFails(upload(storage(), path));
    await assertFails(upload(storage('bob'), path));
    await assertSucceeds(upload(storage('alice'), path));

    await assertFails(deleteObject(ref(storage(), path)));
    await assertFails(deleteObject(ref(storage('bob'), path)));
    await assertSucceeds(deleteObject(ref(storage('alice'), path)));
  });

  test(`${collection}: allows JPEG, PNG, GIF, and WebP; rejects other types`, async () => {
    for (const [index, contentType] of [
      'image/jpeg', 'image/png', 'image/gif', 'image/webp',
    ].entries()) {
      await assertSucceeds(upload(
        storage('alice'), `${collection}/alice/supported-${index}`, IMAGE, contentType,
      ));
    }

    for (const [index, contentType] of [
      'image/svg+xml', 'image/heic', 'text/plain', 'application/pdf',
    ].entries()) {
      await assertFails(upload(
        storage('alice'), `${collection}/alice/unsupported-${index}`, IMAGE, contentType,
      ));
    }
    await assertFails(upload(storage('alice'), `${collection}/alice/no-type`, IMAGE, ''));
  });

  test(`${collection}: accepts 10 MiB and rejects larger and empty files`, async () => {
    await assertSucceeds(upload(
      storage('alice'),
      `${collection}/alice/at-limit`,
      new Uint8Array(MAX_IMAGE_SIZE),
    ));
    await assertFails(upload(
      storage('alice'),
      `${collection}/alice/over-limit`,
      new Uint8Array(MAX_IMAGE_SIZE + 1),
    ));
    await assertFails(upload(
      storage('alice'),
      `${collection}/alice/empty`,
      new Uint8Array(0),
    ));
  });

  test(`${collection}: rejects overwrites and metadata changes`, async () => {
    const path = `${collection}/alice/photo.png`;
    await upload(storage('alice'), path);

    await assertFails(upload(storage('alice'), path));
    await assertFails(upload(storage('bob'), path));
    await assertFails(updateMetadata(ref(storage('alice'), path), {
      customMetadata: { changed: 'yes' },
    }));
    await assertSucceeds(getBytes(ref(storage('alice'), path)));
  });

  test(`${collection}: rejects recursive paths and objects outside its namespace`, async () => {
    const nestedPath = `${collection}/alice/nested/photo.png`;
    const unrelatedPath = `private/alice/${collection}-photo.png`;

    await assertFails(upload(storage('alice'), nestedPath));
    await assertFails(upload(storage('alice'), unrelatedPath));

    await environment.withSecurityRulesDisabled(async context => {
      await upload(context.storage(), unrelatedPath);
      await upload(context.storage(), nestedPath);
    });

    for (const uid of [undefined, 'alice', 'bob']) {
      const bucket = storage(uid);
      await assertFails(getBytes(ref(bucket, unrelatedPath)));
      await assertFails(getBytes(ref(bucket, nestedPath)));
      await assertFails(deleteObject(ref(bucket, unrelatedPath)));
      await assertFails(deleteObject(ref(bucket, nestedPath)));
    }
  });
}
