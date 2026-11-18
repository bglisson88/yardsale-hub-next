const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');
const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');
const ts = require('typescript');

function load(file, mocks = {}) {
  const filename = path.join(__dirname, '..', file);
  const module = { exports: {} };
  const { outputText } = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true },
  });
  vm.runInNewContext(outputText, {
    module, exports: module.exports,
    require: name => name in mocks ? mocks[name] : require(name),
    URL, TextEncoder,
  }, { filename });
  return module.exports;
}

const details = load('src/lib/item-details.ts');
const categories = load('src/lib/categories.ts');
const listing = {
  userId: 'seller',
  title: 'Oak table',
  price: 35.5,
  description: 'Solid wood.\nGood condition.',
  category: 'Furniture',
  condition: 'like-new',
  location: 'Nederland',
  photoURLs: [
    'https://firebasestorage.googleapis.com/v0/b/staging/o/items%2Fseller%2Fone.jpg?alt=media&token=one',
    'https://firebasestorage.googleapis.com/v0/b/staging/o/items%2Fseller%2Ftwo.jpg?alt=media&token=two',
  ],
  email: 'private@example.test',
  address: 'Private street address',
};

function harness({ id = 'chair', user = null, authLoading = false } = {}) {
  const params = Promise.resolve({ id });
  const states = [];
  const effects = [];
  const listeners = [];
  const reads = [];
  const usernameLookups = [];
  let cursor = 0, effectCursor = 0, tree;
  let authState = { user, loading: authLoading };
  const stub = () => null;
  const { default: Page } = load('src/app/items/[id]/page.tsx', {
    react: {
      ...React,
      use(value) {
        assert.equal(value, params);
        return { id };
      },
      useState(initial) {
        const index = cursor++;
        if (!(index in states)) states[index] = typeof initial === 'function' ? initial() : initial;
        return [states[index], value => {
          states[index] = typeof value === 'function' ? value(states[index]) : value;
        }];
      },
      useEffect(callback, deps) {
        const index = effectCursor++;
        if (!effects[index] || deps.some((value, i) => value !== effects[index].deps[i])) {
          effects[index]?.cleanup?.();
          effects[index] = { callback, deps };
        }
      },
    },
    'next/link': { __esModule: true, default: 'a' },
    'firebase/firestore': {
      doc: (_, collection, id) => { reads.push({ collection, id }); return `${collection}/${id}`; },
      onSnapshot(target, next, error) {
        const listener = { target, next, error, unsubscribed: false };
        listeners.push(listener);
        return () => { listener.unsubscribed = true; };
      },
    },
    '@/lib/firebase': { db: {} },
    '@/hooks': { useAuthContext: stub },
    '@/store': { useAuthStore: () => authState },
    '@/components': { LoadingSpinner: () => React.createElement('span', null, 'Loading') },
    '@/lib/categories': categories,
    '@/lib/item-details': details,
    '@/lib/public-profile': {
      getItemSellerUsername(itemId) {
        return new Promise((resolve, reject) => {
          usernameLookups.push({ itemId, resolve, reject });
        });
      },
    },
  });
  const wrapper = Page({ params });
  function render() {
    cursor = effectCursor = 0;
    tree = wrapper.type(wrapper.props);
    for (const effect of effects) {
      if (!effect.callback) continue;
      effect.cleanup = effect.callback();
      effect.callback = null;
    }
  }
  function find(predicate, node = tree) {
    if (!node || typeof node !== 'object') return undefined;
    if (predicate(node)) return node;
    for (const child of React.Children.toArray(node.props?.children)) {
      const found = find(predicate, child);
      if (found) return found;
    }
  }
  render();
  return {
    reads, listeners, usernameLookups, find, render,
    html: () => renderToStaticMarkup(tree),
    emit(data = listing) {
      const listener = [...listeners].reverse().find(
        entry => entry.target === `items/${id}` && !entry.unsubscribed
      );
      assert.ok(listener, 'Active item listener exists');
      listener.next({ id, exists: () => data !== null, data: () => data });
      render();
    },
    fail() {
      const listener = [...listeners].reverse().find(
        entry => entry.target === `items/${id}` && !entry.unsubscribed
      );
      assert.ok(listener, 'Active item listener exists');
      listener.error(new Error('private provider details'));
      render();
    },
    retry() { find(node => node.props?.children === 'Try again').props.onClick(); render(); render(); },
    async resolveUsername(index, username) {
      assert.ok(usernameLookups[index], 'Username lookup exists');
      usernameLookups[index].resolve(username);
      await new Promise(resolve => setImmediate(resolve));
      render();
    },
    async rejectUsername(index) {
      assert.ok(usernameLookups[index], 'Username lookup exists');
      usernameLookups[index].reject(new Error('Private profile details must not leak'));
      await new Promise(resolve => setImmediate(resolve));
      render();
    },
    auth(next) { authState = next; render(); },
    unmount() { effects.forEach(effect => effect.cleanup?.()); },
  };
}

test('detail subscribes to the URL document, renders saved photos after refresh, and exposes no private fields', () => {
  for (let refresh = 0; refresh < 2; refresh++) {
    const page = harness();
    assert.match(page.html(), /Loading listing/);
    assert.deepEqual(page.reads, [{ collection: 'items', id: 'chair' }]);
    page.emit();
    const html = page.html();
    for (const text of ['Oak table', '$35.50', 'Solid wood.', 'Nederland', 'like new', 'Contact seller is currently unavailable']) {
      assert.ok(html.includes(text), text);
    }
    for (const url of listing.photoURLs) assert.ok(html.includes(url.replace(/&/g, '&amp;')));
    assert.doesNotMatch(html, /private@example|Private street|Edit Listing/);
    assert.deepEqual(page.reads, [{ collection: 'items', id: 'chair' }]);
    page.unmount();
    assert.ok(page.listeners[0].unsubscribed);
  }
});

test('missing and invalid IDs show helpful not-found state without querying invalid paths', () => {
  for (const id of ['', ' ', '.', '..', '__reserved__', 'a/b', 'x'.repeat(1501)]) {
    const page = harness({ id });
    page.render();
    assert.match(page.html(), /Listing not found/);
    assert.equal(page.reads.length, 0);
  }
  const page = harness({ id: 'deleted' });
  page.emit(null);
  assert.match(page.html(), /Listing not found/);
  assert.match(page.html(), /Browse items/);
});

test('Firestore errors are distinct from missing records and retry unsubscribes stale listeners', () => {
  const page = harness();
  page.fail();
  assert.match(page.html(), /Unable to load listing/);
  assert.doesNotMatch(page.html(), /private provider/);
  page.retry();
  assert.ok(page.listeners[0].unsubscribed);
  assert.match(page.html(), /Loading listing/);
  page.listeners[0].next({ id: 'chair', exists: () => true, data: () => listing });
  page.render();
  assert.match(page.html(), /Loading listing/);
  page.emit();
  assert.match(page.html(), /Oak table/);
});

test('only the owner can edit and unsupported seller messaging is explicitly unavailable', () => {
  const owner = harness({ id: 'item with spaces', user: { id: 'seller' } });
  owner.emit();
  assert.match(owner.html(), /href="\/items\/item%20with%20spaces\/edit"/);
  assert.match(owner.html(), /YardSale Hub member/);
  assert.doesNotMatch(owner.html(), /Contact seller is currently unavailable/);
  const pending = harness({ user: { id: 'seller' }, authLoading: true });
  pending.emit();
  assert.match(pending.html(), /Checking sign-in/);
  assert.doesNotMatch(pending.html(), /Edit Listing/);
  const buyer = harness({ user: { id: 'buyer' } });
  buyer.emit();
  assert.doesNotMatch(buyer.html(), /Edit Listing/);
  assert.match(buyer.html(), /Contact seller is currently unavailable/);
  assert.equal(buyer.find(node => node.type === 'form'), undefined);
});

test('optional legacy fields and malformed images do not crash detail rendering', () => {
  const page = harness();
  page.emit({ photoURLs: [null, 'javascript:alert(1)', 'not a URL'] });
  assert.match(page.html(), /Item listing/);
  assert.match(page.html(), /Price unavailable/);
  assert.match(page.html(), /No photos available/);
  assert.match(page.html(), /Seller contact is unavailable/);
  assert.doesNotMatch(page.html(), /javascript:/);
  page.emit({ ...listing, isSold: true });
  assert.match(page.html(), /This item has been sold/);
  assert.equal(page.find(node => node.props?.senderId), undefined);
});

test('shared listing cards link to encoded document IDs, not title search', () => {
  const { ItemCard } = load('src/components/ItemCard.tsx', {
    'next/link': { __esModule: true, default: 'a' },
    '@/lib/categories': categories,
  });
  const html = renderToStaticMarkup(React.createElement(ItemCard, {
    item: { ...listing, id: 'table with spaces' },
  }));
  assert.match(html, /href="\/items\/table%20with%20spaces"/);
});


test('public seller username is displayed for guests and owners', async () => {
  for (const user of [null, { id: 'seller' }]) {
    const page = harness({ user });
    page.emit();

    assert.match(page.html(), /YardSale Hub member/);

    await page.resolveUsername(0, 'yardsaletest2');

    assert.match(page.html(), /yardsaletest2/);
    assert.doesNotMatch(page.html(), /private@example|Private street/);

    if (user) {
      assert.match(page.html(), /Edit Listing/);
    } else {
      assert.doesNotMatch(page.html(), /Edit Listing/);
    }

    page.unmount();
    assert.ok(page.listeners.every(listener => listener.unsubscribed));
  }
});

test('missing public usernames use the generic seller fallback', async () => {
  for (const username of [null, null, null]) {
    const page = harness();
    page.emit();
    await page.resolveUsername(0, username);

    assert.match(page.html(), /YardSale Hub member/);
    assert.doesNotMatch(page.html(), /yardsaletest2/);

    page.unmount();
  }
});

test('public profile lookup errors do not expose private information', async () => {
  const page = harness();
  page.emit();

  await page.rejectUsername(0);

  assert.match(page.html(), /YardSale Hub member/);
  assert.doesNotMatch(page.html(), /Private profile details|private@example|Private street/);

  page.unmount();
  assert.ok(page.listeners.every(listener => listener.unsubscribed));
});

test('switching sellers never displays a stale public username', async () => {
  const page = harness();
  page.emit();

  assert.equal(page.usernameLookups[0].itemId, 'chair');
  page.emit({ ...listing, userId: 'seller-b' });

  assert.match(page.html(), /YardSale Hub member/);

  // A prior request may complete after the item switches sellers.
  await page.resolveUsername(0, 'seller_one');

  assert.match(page.html(), /YardSale Hub member/);
  assert.doesNotMatch(page.html(), /seller_one/);

  assert.equal(page.usernameLookups[1].itemId, 'chair');
  await page.resolveUsername(1, 'seller_two');

  assert.match(page.html(), /seller_two/);
  assert.doesNotMatch(page.html(), /seller_one/);

  page.unmount();
  assert.ok(page.listeners.every(listener => listener.unsubscribed));
});