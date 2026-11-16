const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');
const React = require('react');
const ts = require('typescript');

function load(file, imports = {}, globals = {}) {
  const filename = path.join(__dirname, '..', file);
  const module = { exports: {} };
  const code = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  vm.runInNewContext(code, {
    module, exports: module.exports,
    require: name => imports[name] ?? require(name),
    URL, console, Error, ...globals,
  }, { filename });
  return module.exports;
}

test('return destinations stay local and cannot loop back to authentication', () => {
  const { authDestination } = load('src/lib/auth-redirect.ts');
  for (const value of [undefined, '', '//evil.test', '/\\evil.test', 'https://evil.test',
    '/auth/login', '/%61uth/login', '/%2e%2e%2fauth%2flogin', '/%2f%2fevil.test', '/auth/signup', '/%zz']) {
    assert.equal(authDestination(value), '/dashboard');
  }
  assert.equal(authDestination('/events/abc/edit?tab=details#photo'), '/events/abc/edit?tab=details#photo');
});

test('successful sign-in initializes the profile before replacing the return destination', async () => {
  const states = [], actions = [];
  let cursor = 0, tree;
  const hooks = {
    useState(initial) {
      const index = cursor++;
      if (!(index in states)) states[index] = initial;
      return [states[index], value => { states[index] = typeof value === 'function' ? value(states[index]) : value; }];
    },
    useEffect() {},
  };
  const profile = { id: 'owner' };
  const imports = {
    react: hooks,
    'next/link': { __esModule: true, default: 'a' },
    'next/navigation': { useRouter: () => ({ replace: value => actions.push(['redirect', value]) }) },
    'firebase/auth': { signInWithEmailAndPassword: async () => ({ user: { uid: 'owner' } }) },
    '@/lib/firebase': { auth: {} },
    '@/lib/auth-redirect': load('src/lib/auth-redirect.ts'),
    '@/hooks': { useAuthContext() {} },
    '@/hooks/useAuthContext': { loadAuthUser: async () => profile },
    '@/store': { useAuthStore: () => ({ user: null, loading: false, setUser: value => actions.push(['profile', value]) }) },
    '@/components/Logo': { Logo: () => null },
    'react-hot-toast': { __esModule: true, default: { success() {}, error: message => actions.push(['error', message]) } },
  };
  const Login = load('src/app/auth/login/page.tsx', imports).default;
  function render() { cursor = 0; tree = Login({ searchParams: { returnTo: '/events/new' } }); }
  function find(predicate, node = tree) {
    if (!node || typeof node !== 'object') return undefined;
    if (predicate(node)) return node;
    for (const child of React.Children.toArray(node.props?.children)) {
      const found = find(predicate, child);
      if (found) return found;
    }
  }
  render();
  await find(node => node.type === 'form').props.onSubmit({ preventDefault() {} });
  assert.deepEqual(actions, [['profile', profile], ['redirect', '/events/new']]);
});

test('dashboard collections query only the signed-in owner and include sold items and past events', () => {
  for (const kind of ['items', 'events']) {
    const state = [], effects = [], queries = [];
    let cursor = 0, tree;
    const hooks = {
      useState(initial) {
        const index = cursor++;
        if (!(index in state)) state[index] = typeof initial === 'function' ? initial() : initial;
        return [state[index], value => { state[index] = typeof value === 'function' ? value(state[index]) : value; }];
      },
      useRef(initial) {
        const index = cursor++;
        if (!(index in state)) state[index] = { current: initial };
        return state[index];
      },
      useEffect(effect) { effects.push(effect); },
    };
    const rows = kind === 'items'
      ? [{ id: 'active', isSold: false }, { id: 'sold', isSold: true }]
      : [{ id: 'past', title: 'Past event', startDate: { toDate: () => new Date(2020, 0, 1) } }];
    const Card = () => null;
    const imports = {
      react: hooks,
      'next/link': { __esModule: true, default: 'a' },
      'next/navigation': { useRouter: () => ({ replace() {} }) },
      'firebase/firestore': {
        collection: (_, name) => name,
        where: (...constraint) => constraint,
        query: (name, constraint) => ({ name, constraint }),
        onSnapshot: (query, success) => {
          queries.push(query);
          success({ docs: rows.map(row => ({ id: row.id, data: () => row })) });
          return () => {};
        },
      },
      '@/lib/firebase': { db: {} },
      '@/hooks': { useAuthContext() {} },
      '@/store': { useAuthStore: () => ({ user: { id: 'owner' }, loading: false }) },
      '@/components/LoadingSpinner': { LoadingSpinner: () => null },
      '@/components/ItemCard': { ItemCard: Card },
    };
    const Page = load('src/components/OwnedDashboardPage.tsx', imports).default;
    function render() { cursor = 0; tree = Page({ kind }); }
    function find(predicate, node = tree) {
      if (!node || typeof node !== 'object') return undefined;
      if (predicate(node)) return node;
      for (const child of React.Children.toArray(node.props?.children)) {
        const found = find(predicate, child);
        if (found) return found;
      }
    }
    render();
    effects.splice(0).forEach(effect => effect());
    render();
    assert.equal(queries[0].name, kind === 'items' ? 'items' : 'yardSaleEvents');
    assert.deepEqual(queries[0].constraint, ['userId', '==', 'owner']);
    if (kind === 'items') {
      assert.ok(find(node => node.props?.children === 'Sold'));
      assert.ok(find(node => node.props?.children === 'Active'));
    } else {
      assert.ok(find(node => node.props?.href === '/events/past'));
    }
  }
});

function deletion(options = {}) {
  const calls = [];
  const deletedPhotos = [];
  let referenceQueries = 0;
  const event = { userId: 'owner', photoURL: options.photoURL || null };
  const privateData = { userId: options.privateOwner || 'owner', address: 'private' };
  const bucket = 'test-bucket';
  const mocks = {
    'firebase/firestore': {
      doc: (_, collection, id) => `${collection}/${id}`,
      getDoc: async ref => ref.startsWith('eventPrivate/')
        ? { exists: () => options.privateExists !== false, data: () => privateData }
        : { exists: () => options.eventExists !== false, data: () => ({
          ...event,
          userId: options.owner || 'owner',
          eventVersion: options.eventVersion ?? 0,
        }) },
      collection: (_, name) => name,
      where: (...args) => args,
      query: (collection, constraint) => ({ collection, constraint }),
      getDocsFromServer: async query => {
        referenceQueries++;
        if (options.queryError) throw new Error('query failed');
        return { empty: options.referenced !== query.collection };
      },
    },
    'firebase/storage': {
      ref: (_, url) => url ? { bucket: options.bucket || bucket, fullPath: url } : { bucket },
      deleteObject: async photo => {
        if (options.photoError) throw new Error('storage failed');
        deletedPhotos.push(photo.fullPath);
      },
    },
    'firebase/functions': {
      httpsCallable: (_functions, name) => async data => {
        calls.push([name, data]);
        if (options.commitError) throw new Error('write failed');
        return { data: { eventId: data.eventId, deleted: true } };
      },
    },
    '@/lib/firebase': { db: {}, storage: {}, functions: {} },
  };
  const { deleteOwnedEvent } = load('src/lib/delete-event.ts', mocks, {
    console: { error() {} },
    crypto: { randomUUID: () => '123e4567-e89b-42d3-a456-426614174000' },
  });
  return {
    run: () => deleteOwnedEvent('event1', 'owner'),
    calls,
    deletedPhotos,
    get referenceQueries() { return referenceQueries; },
  };
}

const scopedPhoto = 'events/owner/event1_123e4567-e89b-42d3-a456-426614174000_photo.jpg';

test('event deletion checks ownership and calls the server-side consent transaction', async () => {
  const own = deletion({ photoURL: scopedPhoto });
  assert.equal(
    await own.run(),
    'Event deleted. Its photo was retained; cleanup is deferred until references can be checked safely.',
  );
  assert.equal(own.calls.length, 1);
  assert.equal(own.calls[0][0], 'deleteEventWithConsent');
  assert.equal(own.calls[0][1].eventId, 'event1');
  assert.equal(own.calls[0][1].expectedEventVersion, 0);
  assert.equal(own.calls[0][1].expectedUpdatedAtMs, null);
  assert.match(own.calls[0][1].operationId, /^[0-9a-f-]{36}$/);
  assert.deepEqual(own.deletedPhotos, []);
  assert.equal(own.referenceQueries, 0);
  const noPrivate = deletion({ privateExists: false });
  await noPrivate.run();
  assert.equal(noPrivate.calls.length, 1);
  for (const options of [{ owner: 'other' }, { privateOwner: 'other' }]) {
    const denied = deletion(options);
    await assert.rejects(denied.run());
    assert.deepEqual(denied.calls, []);
  }
  const alreadyDeleted = deletion({ eventExists: false });
  assert.match(await alreadyDeleted.run(), /already deleted/);
  assert.deepEqual(alreadyDeleted.calls, []);
});

test('event deletion retains photos without a safe global reference check', async () => {
  for (const options of [
    { photoURL: 'events/owner/12345_old.jpg' },
    { photoURL: scopedPhoto, bucket: 'other-bucket' },
    { photoURL: scopedPhoto, referenced: 'items' },
    { photoURL: scopedPhoto, referenced: 'yardSaleEvents' },
  ]) {
    const operation = deletion(options);
    assert.match(await operation.run(), /Event deleted/);
    assert.deepEqual(operation.deletedPhotos, []);
    assert.equal(operation.referenceQueries, 0);
  }

  const failure = deletion({ photoURL: scopedPhoto, commitError: true });
  await assert.rejects(failure.run(), /Could not confirm event deletion/);
  await assert.rejects(failure.run(), /Could not confirm event deletion/);
  assert.equal(failure.calls.length, 2);
  assert.equal(failure.calls[0][1].operationId, failure.calls[1][1].operationId);
  assert.deepEqual(failure.deletedPhotos, []);
});

async function eventDetail(deleteResult = null, deleteError = null) {
  const state = [], effects = [], notifications = [], pushes = [];
  let cursor = 0, tree;
  const eventData = {
    userId: 'owner',
    title: 'Sale',
    location: 'Nederland',
    locationVisibility: 'general',
    startDate: new Date(2026, 10, 10, 9),
    endDate: new Date(2026, 10, 10, 12),
    itemCount: 0,
  };
  const hooks = {
    useState(initial) {
      const index = cursor++;
      if (!(index in state)) state[index] = initial;
      return [state[index], value => { state[index] = typeof value === 'function' ? value(state[index]) : value; }];
    },
    useEffect(effect) { effects.push(effect); },
  };
  const Icon = () => null;
  const imports = {
    react: hooks,
    'next/link': { __esModule: true, default: 'a' },
    'next/navigation': {
      useParams: () => ({ id: 'event1' }),
      useRouter: () => ({ push: path => pushes.push(path) }),
    },
    'firebase/firestore': {
      doc: (_, collection, id) => ({ collection, id }),
      getDoc: async () => ({ exists: () => true, id: 'event1', data: () => eventData }),
    },
    'lucide-react': { Calendar: Icon, MapPin: Icon, Pencil: Icon, Users: Icon },
    '@/lib/firebase': { db: {} },
    '@/hooks': { useAuthContext() {} },
    '@/store': { useAuthStore: () => ({ user: { id: 'owner' } }) },
    '@/components': { LoadingSpinner: Icon },
    '@/lib/delete-event': {
      deleteOwnedEvent: async () => {
        if (deleteError) throw deleteError;
        return deleteResult;
      },
    },
    'react-hot-toast': {
      __esModule: true,
      default: {
        success: (...args) => notifications.push(['success', ...args]),
        error: (...args) => notifications.push(['error', ...args]),
      },
    },
  };
  const Page = load('src/app/events/[id]/page.tsx', imports, {
    window: { confirm: () => true },
  }).default;
  function render() { cursor = 0; tree = Page(); }
  function find(predicate, node = tree) {
    if (!node || typeof node !== 'object') return undefined;
    if (predicate(node)) return node;
    for (const child of React.Children.toArray(node.props?.children)) {
      const found = find(predicate, child);
      if (found) return found;
    }
  }
  render();
  effects.splice(0).forEach(effect => effect());
  await new Promise(resolve => setImmediate(resolve));
  render();
  return {
    delete: () => find(node => node.type === 'button' && node.props.children === 'Delete Event').props.onClick(),
    notifications,
    pushes,
  };
}

test('event deletion notifications distinguish deferred cleanup from deletion failures', async () => {
  const ordinary = await eventDetail();
  await ordinary.delete();
  assert.deepEqual(ordinary.notifications, [['success', 'Event deleted.']]);
  assert.deepEqual(ordinary.pushes, ['/dashboard/events']);

  const deferredMessage = 'Event deleted. Its photo was retained; cleanup is deferred until references can be checked safely.';
  const deferred = await eventDetail(deferredMessage);
  await deferred.delete();
  assert.equal(deferred.notifications.length, 1);
  assert.equal(deferred.notifications[0][0], 'success');
  assert.equal(deferred.notifications[0][1], deferredMessage);
  assert.equal(deferred.notifications[0][2].duration, 10000);
  assert.deepEqual(deferred.pushes, ['/dashboard/events']);

  const failed = await eventDetail(null, new Error('Could not confirm event deletion.'));
  await failed.delete();
  assert.deepEqual(failed.notifications, [['error', 'Could not confirm event deletion.']]);
  assert.deepEqual(failed.pushes, []);
});

async function eventForm(eventId = 'event1') {
  const state = [], dependencies = [], effects = [], pushes = [], errors = [], confirmations = [];
  let cursor = 0, tree, confirmed = true;
  let user = { id: 'owner', location: 'Nederland' };
  const data = {
    userId: 'owner', title: 'Sale', description: '', location: 'Nederland',
    locationVisibility: 'general', startDate: new Date(2026, 10, 10, 9),
    endDate: new Date(2026, 10, 10, 12), createdAt: new Date(), updatedAt: new Date(),
    itemCount: 0, photoURL: null,
  };
  const hooks = {
    useState(initial) {
      const index = cursor++;
      if (!(index in state)) state[index] = typeof initial === 'function' ? initial() : initial;
      return [state[index], value => { state[index] = typeof value === 'function' ? value(state[index]) : value; }];
    },
    useRef(initial) {
      const index = cursor++;
      if (!(index in state)) state[index] = { current: initial };
      return state[index];
    },
    useEffect(effect, deps) {
      const index = cursor++;
      if (!dependencies[index] || deps.some((value, i) => value !== dependencies[index][i])) {
        dependencies[index] = deps;
        effects.push(effect);
      }
    },
  };
  const imports = {
    react: hooks,
    'next/link': { __esModule: true, default: 'a' },
    'next/navigation': { useRouter: () => ({ push: path => pushes.push(path), replace() {} }) },
    'firebase/firestore': {
      collection: () => 'collection',
      doc: (...args) => args.length === 1 ? { id: 'new-event' } : args[1],
      getDoc: async name => name === 'yardSaleEvents'
        ? { exists: () => true, data: () => data, id: 'event1' }
        : { exists: () => true, data: () => ({ address: 'private address' }) },
    },
    'firebase/storage': {},
    '@/lib/firebase': { db: {}, storage: {} },
    '@/store': { useAuthStore: () => ({ user, loading: false }) },
    '@/hooks': { useAuthContext() {} },
    '@/components': { LoadingSpinner: () => null },
    '@/lib/event-data': {},
    'react-hot-toast': { __esModule: true, default: { error: message => errors.push(message) } },
  };
  const Form = load('src/components/EventForm.tsx', imports, {
    window: { confirm: message => { confirmations.push(message); return confirmed; } },
    URL: { createObjectURL: () => 'blob:preview', revokeObjectURL() {} },
  }).default;
  function render() { cursor = 0; tree = Form({ eventId }); }
  function find(predicate, node = tree) {
    if (!node || typeof node !== 'object') return undefined;
    if (predicate(node)) return node;
    for (const child of React.Children.toArray(node.props?.children)) {
      const found = find(predicate, child);
      if (found) return found;
    }
  }
  render();
  effects.splice(0).forEach(effect => effect());
  await new Promise(resolve => setImmediate(resolve));
  render();
  return {
    find, pushes, confirmations,
    changeUser(next) { user = next; render(); },
    changeTitle(value) {
      find(node => node.props?.name === 'title').props.onChange({ target: { name: 'title', value } });
      render();
    },
    changeVisibility() {
      find(node => node.props?.name === 'locationVisibility' && node.props.value === 'exact').props.onChange();
      render();
    },
    choosePhoto() {
      find(node => node.props?.id === 'event-photo').props.onChange({ target: { files: [{ name: 'sale.jpg' }] } });
      render();
    },
    cancel(allow) {
      confirmed = allow;
      find(node => node.type === 'button' && node.props.children === 'Cancel').props.onClick();
    },
  };
}

test('editing cancels cleanly and asks before discarding changes', async () => {
  const clean = await eventForm();
  assert.equal(clean.find(node => node.type === 'h1').props.children, 'Edit Event');
  clean.cancel(false);
  assert.deepEqual(clean.pushes, ['/dashboard']);
  const dirty = await eventForm();
  dirty.changeTitle('Changed');
  dirty.cancel(false);
  assert.deepEqual(dirty.pushes, []);
  dirty.cancel(true);
  assert.deepEqual(dirty.pushes, ['/dashboard']);
  const changedUser = await eventForm();
  assert.ok(changedUser.find(node => node.props?.name === 'address'));
  changedUser.changeUser({ id: 'other', location: 'Nederland' });
  assert.equal(changedUser.find(node => node.props?.name === 'address'), undefined);
});

test('creating cancels immediately when unchanged and confirms before discarding changes', async () => {
  const clean = await eventForm(null);
  const cancel = clean.find(node => node.type === 'button' && node.props.children === 'Cancel');
  assert.equal(cancel.props.type, 'button');
  assert.match(cancel.props.className, /\bw-full\b/);
  clean.cancel(false);
  assert.deepEqual(clean.confirmations, []);
  assert.deepEqual(clean.pushes, ['/dashboard']);

  for (const change of [form => form.changeTitle('Sale'), form => form.changeVisibility(), form => form.choosePhoto()]) {
    const dirty = await eventForm(null);
    change(dirty);
    dirty.cancel(false);
    assert.deepEqual(dirty.confirmations, ['Discard your unsaved changes?']);
    assert.deepEqual(dirty.pushes, []);
    dirty.cancel(true);
    assert.deepEqual(dirty.pushes, ['/dashboard']);
  }

  const reverted = await eventForm(null);
  reverted.changeTitle('Sale');
  reverted.changeTitle('');
  reverted.cancel(false);
  assert.deepEqual(reverted.confirmations, []);
  assert.deepEqual(reverted.pushes, ['/dashboard']);
});
