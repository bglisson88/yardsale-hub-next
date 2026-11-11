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
const MAX_AVATAR_SIZE = 1024 * 1024;
let environment;

before(async () => {
  environment = await initializeTestEnvironment({
    projectId: PROJECT_ID,
    storage: { rules: fs.readFileSync('storage.rules', 'utf8') },
  });
});

beforeEach(async () => {
  await clearStorage();
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

// Representative flat and nested legacy layouts; the profile uploader is not
// present in this checkout, so its exact production filenames are unverified.
const avatarPaths = [
  'avatars/alice/avatar.jpg',
  'avatars/alice/1799999999999_profile.png',
  'avatars/alice/profile/original/avatar.webp',
];

test('avatars: flat and nested legacy paths support owner uploads and public reads', async () => {
  for (const path of avatarPaths) {
    await assertSucceeds(upload(storage('alice'), path));
    assert.deepEqual(new Uint8Array(await assertSucceeds(getBytes(ref(storage(), path)))), IMAGE);
    await assertSucceeds(getMetadata(ref(storage('bob'), path)));
  }
});

test('avatars: owner can replace, update metadata, and delete their own avatars', async () => {
  const replacement = new Uint8Array([1, 2, 3]);
  for (const path of avatarPaths) {
    const object = ref(storage('alice'), path);
    await upload(storage('alice'), path);
    await assertSucceeds(upload(storage('alice'), path, replacement, 'image/jpeg'));
    await assertSucceeds(updateMetadata(object, { customMetadata: { profile: 'updated' } }));
    assert.deepEqual(new Uint8Array(await getBytes(ref(storage(), path))), replacement);
    assert.equal((await getMetadata(object)).customMetadata.profile, 'updated');
    await assertSucceeds(deleteObject(object));
    await assert.rejects(getBytes(ref(storage(), path)), { code: 'storage/object-not-found' });
  }
});

test('avatars: anonymous users and other owners cannot create, replace, modify or delete', async () => {
  for (const path of avatarPaths) {
    for (const uid of [undefined, 'bob']) {
      await assertFails(upload(storage(uid), path));
    }
    await upload(storage('alice'), path);
    const before = await getMetadata(ref(storage('alice'), path));
    for (const uid of [undefined, 'bob']) {
      await assertFails(upload(storage(uid), path, new Uint8Array([1, 2, 3])));
      await assertFails(updateMetadata(ref(storage(uid), path), {
        customMetadata: { changed: 'yes' },
      }));
      await assertFails(deleteObject(ref(storage(uid), path)));
    }
    const after = await getMetadata(ref(storage(), path));
    assert.equal(after.generation, before.generation);
    assert.equal(after.metageneration, before.metageneration);
    assert.deepEqual(new Uint8Array(await getBytes(ref(storage(), path))), IMAGE);
  }
});

test('avatars: 1 MiB is allowed, but larger creates and replacements are denied', async () => {
  for (const path of avatarPaths) {
    await assertFails(upload(storage('alice'), path, new Uint8Array(MAX_AVATAR_SIZE + 1)));
    await assertSucceeds(upload(storage('alice'), path, new Uint8Array(MAX_AVATAR_SIZE)));
    const before = await getMetadata(ref(storage('alice'), path));
    await assertFails(upload(storage('alice'), path, new Uint8Array(MAX_AVATAR_SIZE + 1)));
    const after = await getMetadata(ref(storage(), path));
    assert.equal(after.size, MAX_AVATAR_SIZE);
    assert.equal(after.generation, before.generation);
  }
});

test('avatars: the compatibility policy does not introduce new MIME restrictions', async () => {
  for (const [index, type] of [
    'image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/heic', 'image/svg+xml',
  ].entries()) {
    await assertSucceeds(upload(storage('alice'), `avatars/alice/format-${index}`, IMAGE, type));
  }
});

test('avatars: recursive permissions do not extend to other namespaces or owner prefixes', async () => {
  for (const path of [
    'avatar/alice/photo.png', 'private/alice/photo.png',
    'items/alice/profile/photo.png', 'events/alice/profile/photo.png',
  ]) {
    await assertFails(upload(storage('alice'), path));
    await environment.withSecurityRulesDisabled(async context => {
      await upload(context.storage(), path);
    });
    await assertFails(getBytes(ref(storage(), path)));
    await assertFails(deleteObject(ref(storage('alice'), path)));
  }
  await assertFails(upload(storage('alice'), 'avatars/alice-other/profile/photo.png'));
});

async function clearStorage() {
  // rules-unit-testing 3.x clearStorage() does not traverse folder prefixes.
  await environment.withSecurityRulesDisabled(async context => {
    async function clearDirectory(directory) {
      const { items, prefixes } = await listAll(directory);
      await Promise.all(items.map(item => deleteObject(item)));
      await Promise.all(prefixes.map(prefix => clearDirectory(prefix)));
    }

    await clearDirectory(ref(context.storage()));
  });
}

test('cleanup removes root and nested objects so owner paths can be reused between tests', async () => {
  const paths = ['root.png', 'items/alice/photo.png', 'events/alice/photo.png',
    'items/alice/nested/photo.png', 'private/alice/photo.png'];
  await environment.withSecurityRulesDisabled(async context => {
    for (const path of paths) await upload(context.storage(), path);
  });

  await clearStorage();

  await environment.withSecurityRulesDisabled(async context => {
    const remaining = await listAll(ref(context.storage()));
    assert.equal(remaining.items.length, 0);
    assert.equal(remaining.prefixes.length, 0);
  });
  for (const collection of ['items', 'events']) {
    await assertSucceeds(upload(storage('alice'), `${collection}/alice/photo.png`));
  }
});

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
    await assertSucceeds(upload(storage('alice'), path));
    await assertFails(upload(storage('alice'), path));
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

  test(`${collection}: rejects identical and changed-content overwrites`, async () => {
    const path = `${collection}/alice/photo.png`;
    await upload(storage('alice'), path);
    const originalMetadata = await getMetadata(ref(storage('alice'), path));

    for (const uid of ['alice', 'bob', undefined]) {
      await assertFails(upload(storage(uid), path));
      await assertFails(upload(storage(uid), path, new Uint8Array([1, 2, 3])));
      await assertFails(uploadBytes(ref(storage(uid), path), IMAGE, {
        contentType: 'image/png',
        customMetadata: { changed: 'yes' },
      }));
    }

    assert.deepEqual(new Uint8Array(await getBytes(ref(storage(), path))), IMAGE);
    const metadata = await getMetadata(ref(storage(), path));
    assert.equal(metadata.generation, originalMetadata.generation);
    assert.equal(metadata.metageneration, originalMetadata.metageneration);
    assert.deepEqual(metadata.customMetadata, originalMetadata.customMetadata);
  });

  test(`${collection}: rejects standalone metadata updates`, async () => {
    const path = `${collection}/alice/photo.png`;
    await uploadBytes(ref(storage('alice'), path), IMAGE, {
      contentType: 'image/png',
      customMetadata: { original: 'yes' },
    });
    const originalMetadata = await getMetadata(ref(storage('alice'), path));

    for (const uid of ['alice', 'bob', undefined]) {
      await assertFails(updateMetadata(ref(storage(uid), path), {
        customMetadata: { changed: 'yes' },
      }));
      await assertFails(updateMetadata(ref(storage(uid), path), {
        contentType: 'image/jpeg',
      }));
    }

    const metadata = await getMetadata(ref(storage(), path));
    assert.equal(metadata.contentType, originalMetadata.contentType);
    assert.equal(metadata.metageneration, originalMetadata.metageneration);
    assert.deepEqual(metadata.customMetadata, originalMetadata.customMetadata);
    assert.deepEqual(new Uint8Array(await getBytes(ref(storage(), path))), IMAGE);
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
