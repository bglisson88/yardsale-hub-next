const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');
const React = require('react');
const ts = require('typescript');
const { renderToStaticMarkup } = require('react-dom/server');

const root = path.join(__dirname, '..');
function load(file, mocks = {}) {
  const filename = path.join(root, file);
  const module = { exports: {} };
  const { outputText } = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true },
  });
  vm.runInNewContext(outputText, {
    module, exports: module.exports,
    require: name => name in mocks ? mocks[name] : require(name),
    URLSearchParams, console, ...mocks.globals,
  }, { filename });
  return module.exports;
}

function harness(file, initialAuth = { user: null, loading: false }) {
  const states = [];
  const refs = [];
  const effects = [];
  let cursor, refCursor, effectCursor, tree;
  let authState = initialAuth;
  let currentPath = '/';
  const listeners = new Map();
  const mediaListeners = new Map();
  const pushes = [], errors = [];
  let signOutCalls = 0, rejectSignOut = false;
  const document = {
    addEventListener: (name, listener) => listeners.set(name, listener),
    removeEventListener: (name, listener) => {
      if (listeners.get(name) === listener) listeners.delete(name);
    },
  };
  const stub = () => null;
  const taxonomy = load('src/lib/categories.ts');
  const exports = load(file, {
    react: {
      ...React,
      useState(initial) {
        const index = cursor++;
        if (!(index in states)) states[index] = initial;
        return [states[index], value => { states[index] = typeof value === 'function' ? value(states[index]) : value; }];
      },
      useRef(initial) {
        const index = refCursor++;
        return refs[index] ||= { current: initial };
      },
      useEffect(callback, deps) {
        const index = effectCursor++;
        const previous = effects[index];
        if (!previous || deps.some((value, i) => value !== previous.deps[i])) {
          previous?.cleanup?.();
          effects[index] = { deps, callback };
        }
      },
    },
    'next/link': { __esModule: true, default: 'a' },
    'next/navigation': { useRouter: () => ({ push: url => pushes.push(url) }), usePathname: () => currentPath },
    'firebase/auth': { signOut: async () => { signOutCalls++; if (rejectSignOut) throw new Error('offline'); } },
    'firebase/firestore': {
      collection: stub, query: stub, where: stub, Timestamp: { now: stub },
      getDocs: async () => ({ docs: [] }),
    },
    'react-hot-toast': { __esModule: true, default: { error: message => errors.push(message) } },
    '@/lib/firebase': { auth: {}, db: {} },
    '@/hooks': { useAuthContext: stub, useItems: () => ({ items: [] }) },
    '@/store': { useAuthStore: () => authState },
    './Avatar': { Avatar: stub }, './Logo': { Logo: stub },
    '@/components/Logo': { Logo: stub },
    '@/components/EmptyState': { EmptyState: stub },
    '@/components/ItemCard': { ItemCard: stub },
    '@/components/EventCard': { EventCard: stub },
    '@/lib/categories': taxonomy,
    globals: {
      document,
      window: { matchMedia: () => ({
        addEventListener: (name, listener) => mediaListeners.set(name, listener),
        removeEventListener: (name, listener) => {
          if (mediaListeners.get(name) === listener) mediaListeners.delete(name);
        },
      }) },
      console: { error() {} },
    },
  });
  function render() {
    cursor = refCursor = effectCursor = 0;
    tree = (exports.Navbar || exports.default)();
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
      const result = find(predicate, child);
      if (result) return result;
    }
  }
  render();
  return {
    find, render, refs, pushes, errors,
    get signOutCalls() { return signOutCalls; },
    rejectSignOut() { rejectSignOut = true; },
    auth(next) { authState = next; render(); render(); },
    route(next) { currentPath = next; render(); render(); },
    event(name, event) { listeners.get(name)?.(event); render(); },
    resize() { mediaListeners.get('change')?.(); render(); },
    click(label) {
      const node = find(node => node.props?.onClick && (
        node.props['aria-label'] === label || node.props.children === label ||
        React.Children.toArray(node.props.children).some(child => child.props?.children === label)
      ));
      assert.ok(node, `Missing ${label}`);
      node.props.onClick(); render();
    },
    async signOut() {
      await find(node => node.type === 'button' && node.props.children === 'Sign Out').props.onClick();
      render();
    },
    unmount() { effects.forEach(effect => effect.cleanup?.()); assert.equal(listeners.size, 0); assert.equal(mediaListeners.size, 0); },
  };
}

const user = { id: 'test-user', displayName: 'Test Neighbor', email: 'neighbor@example.test', photoURL: null };
const account = node => node.props?.id === 'account-navigation';
const mobile = node => node.props?.id === 'mobile-navigation';

test('signed-out and loading navigation have desktop/mobile parity', () => {
  const nav = harness('src/components/Navbar.tsx', { user: null, loading: true });
  assert.equal(nav.find(node => node.props?.children === 'Sign In'), undefined);
  nav.click('Open menu');
  assert.ok(nav.find(mobile));
  assert.equal(nav.find(node => node.props?.children === 'Sign In'), undefined);
  nav.auth({ user: null, loading: false });
  assert.ok(nav.find(node => node.props?.href === '/auth/login'));
  assert.equal(nav.find(node => node.props?.href === '/dashboard'), undefined);
  nav.event('pointerdown', { target: {} });
  assert.equal(nav.find(mobile), undefined);
  nav.unmount();
});

test('account and mobile menus close on Escape/outside click and restore focus', () => {
  const nav = harness('src/components/Navbar.tsx', { user, loading: false });
  let accountFocus = 0, mobileFocus = 0;
  nav.refs[2].current = { focus: () => accountFocus++ };
  nav.refs[3].current = { focus: () => mobileFocus++ };
  nav.click('Open account menu');
  assert.ok(nav.find(account));
  assert.ok(nav.find(node => node.props?.href === '/dashboard'));
  nav.event('keydown', { key: 'Escape' });
  assert.equal(nav.find(account), undefined);
  assert.equal(accountFocus, 1);
  nav.click('Open account menu');
  nav.refs[1].current = { contains: target => target === 'inside' };
  nav.event('pointerdown', { target: 'inside' });
  assert.ok(nav.find(account));
  nav.event('pointerdown', { target: {} });
  assert.equal(nav.find(account), undefined);
  nav.click('Open menu');
  nav.event('keydown', { key: 'Escape' });
  assert.equal(nav.find(mobile), undefined);
  assert.equal(mobileFocus, 1);
  nav.click('Open menu');
  nav.event('pointerdown', { target: {} });
  assert.equal(nav.find(mobile), undefined);
  nav.unmount();
});

test('navigation, breakpoint, and auth changes dismiss stale menus', () => {
  const nav = harness('src/components/Navbar.tsx', { user, loading: false });
  nav.click('Open account menu');
  nav.route('/items');
  assert.equal(nav.find(account), undefined);
  nav.click('Open menu');
  nav.resize();
  assert.equal(nav.find(mobile), undefined);
  nav.click('Open menu');
  nav.auth({ user: null, loading: false });
  assert.equal(nav.find(mobile), undefined);
  nav.unmount();
});

test('desktop/mobile sign out closes menus and redirects only on success', async () => {
  for (const label of ['Open account menu', 'Open menu']) {
    const nav = harness('src/components/Navbar.tsx', { user, loading: false });
    nav.click(label);
    await nav.signOut();
    assert.equal(nav.signOutCalls, 1);
    assert.deepEqual(nav.pushes, ['/']);
    assert.equal(nav.find(account), undefined);
    assert.equal(nav.find(mobile), undefined);
    nav.unmount();
  }
  const nav = harness('src/components/Navbar.tsx', { user, loading: false });
  nav.rejectSignOut();
  nav.click('Open account menu');
  await nav.signOut();
  assert.deepEqual(nav.pushes, []);
  assert.deepEqual(nav.errors, ['Failed to sign out']);
  nav.unmount();
});

test('homepage search submits supported filters for items and events', () => {
  for (const type of ['items', 'events']) {
    const page = harness('src/app/page.tsx');
    for (const [label, value] of [['Search items or events', ' lamp & desk '], ['Location (city or ZIP)', ' 12345 '], ['Search for', type]]) {
      page.find(node => node.props?.['aria-label'] === label).props.onChange({ target: { value } });
      page.render();
    }
    page.find(node => node.type === 'form').props.onSubmit({ preventDefault() {} });
    assert.equal(page.pushes[0], `/${type}?search=lamp+%26+desk&location=12345`);
  }
});

test('homepage quick links retain existing category IDs and one layout strip mount', () => {
  const page = harness('src/app/page.tsx');
  page.click('Clothing, Shoes & Accessories');
  const group = page.find(node => node.props?.id === 'category-subcategories');
  assert.ok(group);
  assert.ok(page.find(node => node.props?.href?.includes('category=clothing-shoes-accessories'), group));
  page.click('Clothing, Shoes & Accessories');
  assert.equal(page.find(node => node.props?.id === 'category-subcategories'), undefined);
  const layout = fs.readFileSync(path.join(root, 'src/app/layout.tsx'), 'utf8');
  const home = fs.readFileSync(path.join(root, 'src/app/page.tsx'), 'utf8');
  assert.equal((layout.match(/<CategoryNavigation\s*\/>/g) || []).length, 1);
  assert.equal((home.match(/<CategoryNavigation\s*\/>/g) || []).length, 0);
});

test('shared empty states and cards default to light and allow homepage dark styling', () => {
  const taxonomy = load('src/lib/categories.ts');
  for (const [file, name, props] of [
    ['EmptyState', 'EmptyState', { title: 'No items', description: 'Try again' }],
    ['ItemCard', 'ItemCard', { item: { title: 'Lamp', price: 5, category: 'home-furniture-decor', condition: 'good', photoURLs: [] } }],
    ['EventCard', 'EventCard', { event: { title: 'Sale', startDate: new Date('2026-10-20'), itemCount: 2 } }],
  ]) {
    const component = load(`src/components/${file}.tsx`, {
      'next/link': { __esModule: true, default: 'a' }, '@/lib/categories': taxonomy,
    })[name];
    assert.match(renderToStaticMarkup(component(props)), /text-gray-900/);
    assert.match(renderToStaticMarkup(component({ ...props, appearance: 'dark' })), /text-white/);
  }
});
