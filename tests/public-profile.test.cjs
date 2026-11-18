const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');
const ts = require('typescript');

function createHarness() {
  let authListener;
  let now = 1_000;
  let auth = { currentUser: { uid: 'user-a' } };
  class TestDate extends Date {
    static now() { return now; }
  }
  const calls = [];
  const module = { exports: {} };
  const filename = path.join(__dirname, '../src/lib/public-profile.ts');
  const code = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText;
  vm.runInNewContext(code, {
    module,
    exports: module.exports,
    Date: TestDate,
    require(name) {
      if (name === 'firebase/auth') {
        return { onAuthStateChanged: (_auth, callback) => {
          authListener = callback;
          return () => {};
        } };
      }
      if (name === 'firebase/functions') {
        return { httpsCallable: (_functions, name) => input => {
          calls.push({ name, input });
          return new Promise((resolve, reject) => {
            calls.at(-1).resolve = resolve;
            calls.at(-1).reject = reject;
          });
        } };
      }
      if (name === '@/lib/firebase') return { auth, functions: {} };
      return require(name);
    },
  }, { filename });

  return {
    calls,
    lib: module.exports,
    setAuth(user) {
      auth.currentUser = user;
      authListener(user);
    },
    setTime(value) {
      now = value;
    },
    resolve(index, username) {
      calls[index].resolve({ data: { username } });
    },
    reject(index, error) {
      calls[index].reject(error);
    },
  };
}

test('deduplicates in-flight requests and caches allowlisted usernames briefly', async () => {
  const app = createHarness();
  const first = app.lib.getMyPublicUsername();
  const second = app.lib.getMyPublicUsername();
  assert.equal(app.calls.length, 1);
  app.resolve(0, 'seller_1');
  assert.deepEqual(await Promise.all([first, second]), ['seller_1', 'seller_1']);
  assert.equal(await app.lib.getMyPublicUsername(), 'seller_1');
  assert.equal(app.calls.length, 1);
});

test('validates callable responses and treats missing usernames as null', async () => {
  const app = createHarness();
  const malformed = app.lib.getMyPublicUsername();
  app.resolve(0, 'Private Name');
  assert.equal(await malformed, null);
  assert.equal(await app.lib.getMyPublicUsername(), null);
  assert.equal(app.calls.length, 1);
});

test('expires cached usernames after the documented thirty-second TTL', async () => {
  const app = createHarness();
  const first = app.lib.getMyPublicUsername();
  app.resolve(0, 'seller_1');
  assert.equal(await first, 'seller_1');

  app.setTime(30_999);
  assert.equal(await app.lib.getMyPublicUsername(), 'seller_1');
  assert.equal(app.calls.length, 1);

  app.setTime(31_000);
  const refreshed = app.lib.getMyPublicUsername();
  assert.equal(app.calls.length, 2);
  app.resolve(1, 'new_name');
  assert.equal(await refreshed, 'new_name');
});

test('auth changes invalidate cache and prevent pending results crossing accounts', async () => {
  const app = createHarness();
  const oldLookup = app.lib.getMyPublicUsername();
  app.setAuth({ uid: 'user-b' });
  const newLookup = app.lib.getMyPublicUsername();
  assert.equal(app.calls.length, 2);

  app.resolve(0, 'account_a');
  assert.equal(await oldLookup, 'account_a');
  app.resolve(1, 'account_b');
  assert.equal(await newLookup, 'account_b');
  assert.equal(await app.lib.getMyPublicUsername(), 'account_b');
  assert.equal(app.calls.length, 2);

  app.setAuth(null);
  const signedOutLookup = app.lib.getMyPublicUsername();
  assert.equal(app.calls.length, 3);
  app.resolve(2, null);
  assert.equal(await signedOutLookup, null);
});

test('rename invalidation causes the next self lookup to fetch the current username', async () => {
  const app = createHarness();
  const oldLookup = app.lib.getMyPublicUsername();
  app.resolve(0, 'old_name');
  assert.equal(await oldLookup, 'old_name');
  app.lib.invalidatePublicUsernameCache();
  const updatedLookup = app.lib.getMyPublicUsername();
  assert.equal(app.calls.length, 2);
  app.resolve(1, 'new_name');
  assert.equal(await updatedLookup, 'new_name');
});

test('bounds retained cache entries and notifies mounted username consumers on invalidation', async () => {
  const app = createHarness();
  let notifications = 0;
  const unsubscribe = app.lib.subscribePublicUsernameInvalidation(() => notifications++);

  for (let index = 0; index < 257; index++) {
    const lookup = app.lib.getItemSellerUsername(`item-${index}`);
    app.resolve(index, `seller_${index}`);
    await lookup;
  }
  const firstItemLookup = app.lib.getItemSellerUsername('item-0');
  assert.equal(app.calls.length, 258);
  app.resolve(257, 'seller_0');
  await firstItemLookup;

  app.lib.invalidatePublicUsernameCache();
  assert.equal(notifications, 1);
  unsubscribe();
  app.lib.invalidatePublicUsernameCache();
  assert.equal(notifications, 1);
});

test('uses scoped lookup modes and returns null on callable errors', async () => {
  const app = createHarness();
  const itemLookup = app.lib.getItemSellerUsername('public-item');
  assert.equal(JSON.stringify(app.calls[0].input), JSON.stringify({
    mode: 'item', itemId: 'public-item',
  }));
  app.resolve(0, null);
  assert.equal(await itemLookup, null);

  const conversationLookup = app.lib.getConversationUsername('message-id');
  assert.equal(JSON.stringify(app.calls[1].input), JSON.stringify({
    mode: 'conversation', messageId: 'message-id',
  }));
  app.reject(1, new Error('private backend detail'));
  await assert.rejects(conversationLookup, /private backend detail/);
});
