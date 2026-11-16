const assert = require('node:assert/strict');
const { test } = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const React = require('react');
const ts = require('typescript');
const { normalizeUsername, registrationErrorMessage, completeSignup } =
  require(`${process.env.CATEGORY_TEST_BUILD}/signup.js`);

test('validates and normalizes usernames using the backend rules', () => {
  for (const [input, expected] of [['seller_1', 'seller_1'], ['AbC_123', 'abc_123'],
    ['abc', 'abc'], ['A'.repeat(20), 'a'.repeat(20)]]) {
    assert.equal(normalizeUsername(input), expected);
  }
  for (const input of ['ab', 'a'.repeat(21), 'ab-c', 'ab c', 'éabc', 'abc\n', ' abc', 'abc ']) {
    assert.throws(() => normalizeUsername(input), /3–20/);
  }
  for (const input of ['ADMIN', 'administrator', 'support', 'help', 'moderator',
    'staff', 'system', 'root', 'api', 'www']) {
    assert.throws(() => normalizeUsername(input), /unavailable/);
  }
});

test('maps duplicate and transient callable errors by Firebase code', () => {
  assert.match(registrationErrorMessage({ code: 'functions/already-exists' }), /unavailable.*choose another/);
  assert.match(registrationErrorMessage({ code: 'functions/unavailable' }), /temporarily unavailable.*try again/);
  assert.match(registrationErrorMessage({ code: 'functions/unauthenticated' }), /Sign in/);
  assert.match(registrationErrorMessage({ code: 'functions/failed-precondition' }), /contact support/);
});

test('registers only after account and private profile creation, then retries without a second account', async () => {
  const calls = [];
  const state = { uid: null, hasPrivateProfile: false };
  let fail = true;
  const steps = {
    createAccount: async () => { calls.push('auth'); return 'uid-1'; },
    onAccountCreated: uid => { state.uid = uid; },
    savePrivateProfile: async uid => { calls.push(`private:${uid}`); },
    onPrivateProfileCreated: () => { state.hasPrivateProfile = true; },
    registerUsername: async username => {
      calls.push(`register:${username}`);
      if (fail) throw { code: 'functions/unavailable' };
      return 'existing_name';
    },
  };
  await assert.rejects(completeSignup('Seller_1', state, steps),
    error => error.code === 'functions/unavailable');
  assert.deepEqual(state, { uid: 'uid-1', hasPrivateProfile: true });
  fail = false;
  assert.equal(await completeSignup('Seller_1', state, steps), 'existing_name');
  assert.deepEqual(calls, ['auth', 'private:uid-1', 'register:seller_1', 'register:seller_1']);
});

test('private profile failure preserves the account and retries before registration', async () => {
  const calls = [];
  const state = { uid: null, hasPrivateProfile: false };
  let fail = true;
  const steps = {
    createAccount: async () => { calls.push('auth'); return 'uid-1'; },
    onAccountCreated: uid => { state.uid = uid; },
    savePrivateProfile: async () => {
      calls.push('private');
      if (fail) throw new Error('offline');
    },
    onPrivateProfileCreated: () => { state.hasPrivateProfile = true; },
    registerUsername: async username => { calls.push('register'); return username; },
  };
  await assert.rejects(completeSignup('seller', state, steps), /offline/);
  assert.deepEqual(state, { uid: 'uid-1', hasPrivateProfile: false });
  fail = false;
  await completeSignup('seller', state, steps);
  assert.deepEqual(calls, ['auth', 'private', 'private', 'register']);
});

test('invalid usernames do not create an account', async () => {
  await assert.rejects(completeSignup('admin', { uid: null, hasPrivateProfile: false }, {
    createAccount: async () => { assert.fail('must not create account'); },
  }), /unavailable/);
});

for (const scenario of ['existing-user', 'duplicate', 'ambiguous-private-write']) test(`signup UI recovers from ${scenario} without a second account`, async () => {
  const states = [], refs = [], effects = [], calls = [];
  let stateCursor = 0, refCursor = 0, tree, resolveCreate, attempts = 0;
  let privateExists = scenario === 'existing-user';
  const auth = {
    currentUser: scenario === 'existing-user' ? { uid: 'uid-1', email: 'seller@example.test' } : null,
  };
  const hooks = {
    useState(initial) {
      const index = stateCursor++;
      if (!(index in states)) states[index] = initial;
      return [states[index], value => { states[index] = typeof value === 'function' ? value(states[index]) : value; }];
    },
    useRef(initial) {
      const index = refCursor++;
      return refs[index] ?? (refs[index] = { current: initial });
    },
    useEffect(effect) { if (!effects.length) effects.push(effect); },
  };
  const imports = {
    react: hooks,
    'firebase/auth': {
      onAuthStateChanged: (_, callback) => {
        Promise.resolve().then(() => callback(auth.currentUser));
        return () => {};
      },
      createUserWithEmailAndPassword: () => {
        calls.push('auth');
        return new Promise(resolve => { resolveCreate = () => {
          auth.currentUser = { uid: 'uid-1', email: 'seller@example.test' };
          resolve({ user: auth.currentUser });
        }; });
      },
    },
    'firebase/firestore': {
      doc: (_, collection, uid) => `${collection}/${uid}`,
      getDocFromServer: async () => ({ exists: () => privateExists }),
      setDoc: async ref => {
        calls.push(ref);
        privateExists = true;
        if (scenario === 'ambiguous-private-write') throw new Error('offline');
      },
      Timestamp: { fromDate: date => date },
    },
    'firebase/functions': {
      httpsCallable: (_, name) => async payload => {
        calls.push([name, { ...payload }]);
        if (++attempts === 1 && scenario === 'duplicate') throw { code: 'functions/already-exists' };
        return { data: { username: payload.username } };
      },
    },
    '@/lib/firebase': { auth, db: {}, functions: {} },
    '@/lib/signup': require(`${process.env.CATEGORY_TEST_BUILD}/signup.js`),
    'next/navigation': { useRouter: () => ({ push: route => calls.push(route) }) },
    'next/link': { __esModule: true, default: 'a' },
    'react-hot-toast': { __esModule: true, default: { success() {}, error() {} } },
    '@/components/Logo': { Logo: () => null },
  };
  const filename = path.join(__dirname, '../src/app/auth/signup/page.tsx');
  const code = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  const module = { exports: {} };
  vm.runInNewContext(code, {
    module, exports: module.exports, Error, console,
    require: name => imports[name] ?? require(name),
  }, { filename });
  const Page = module.exports.default;
  function render() { stateCursor = 0; refCursor = 0; tree = Page(); }
  function find(predicate, node = tree) {
    if (!node || typeof node !== 'object') return undefined;
    if (predicate(node)) return node;
    for (const child of React.Children.toArray(node.props?.children)) {
      const found = find(predicate, child);
      if (found) return found;
    }
  }
  render();
  effects[0]();
  await new Promise(resolve => setImmediate(resolve));
  render();
  if (scenario === 'existing-user') {
    assert.equal(find(node => node.props?.name === 'password'), undefined);
    find(node => node.props?.name === 'username').props.onChange({ target: { name: 'username', value: 'New_Name' } });
    render();
    await find(node => node.type === 'form').props.onSubmit({ preventDefault() {} });
    assert.deepEqual(calls, [['registerPublicProfile', { username: 'new_name' }], '/dashboard']);
    return;
  }
  for (const [name, value] of Object.entries({
    email: 'seller@example.test', location: 'Nederland',
    password: 'password', confirmPassword: 'password', username: 'TAKEN',
  })) {
    find(node => node.props?.name === name).props.onChange({ target: { name, value } });
    render();
  }
  const form = find(node => node.type === 'form');
  const first = form.props.onSubmit({ preventDefault() {} });
  await form.props.onSubmit({ preventDefault() {} });
  assert.deepEqual(calls, ['auth']);
  resolveCreate();
  await first;
  render();
  assert.match(find(node => node.props?.role === 'alert').props.children,
    scenario === 'duplicate' ? /unavailable/ : /offline/);
  assert.equal(find(node => node.props?.name === 'password'), undefined);
  if (scenario === 'duplicate') {
    states.length = 0;
    refs.length = 0;
    effects.length = 0;
    render();
    effects[0]();
    await new Promise(resolve => setImmediate(resolve));
    render();
    assert.equal(find(node => node.props?.name === 'password'), undefined);
    assert.ok(find(node => node.props?.name === 'username'));
  }
  find(node => node.props?.name === 'username').props.onChange({ target: { name: 'username', value: 'New_Name' } });
  render();
  await find(node => node.type === 'form').props.onSubmit({ preventDefault() {} });
  assert.deepEqual(calls, scenario === 'duplicate' ? [
    'auth', 'users/uid-1', ['registerPublicProfile', { username: 'taken' }],
    ['registerPublicProfile', { username: 'new_name' }], '/dashboard',
  ] : [
    'auth', 'users/uid-1', ['registerPublicProfile', { username: 'new_name' }], '/dashboard',
  ]);
});

for (const status of ['ready', 'missing', 'error']) test(`profile page handles ${status} public username separately from private data`, async () => {
  const states = [], effects = [], reads = [];
  let cursor = 0, tree, firstRender = true;
  const hooks = {
    useState(initial) {
      const index = cursor++;
      if (!(index in states)) states[index] = initial;
      return [states[index], value => { states[index] = typeof value === 'function' ? value(states[index]) : value; }];
    },
    useEffect(effect) { if (firstRender) effects.push(effect); },
    useRef(initial) {
      const index = cursor++;
      if (!(index in states)) states[index] = { current: initial };
      return states[index];
    },
  };
  const imports = {
    react: hooks,
    'next/link': { __esModule: true, default: 'a' },
    'next/navigation': { useRouter: () => ({ replace: () => assert.fail('unexpected redirect') }) },
    'firebase/firestore': {
      doc: (_, collection, uid) => `${collection}/${uid}`,
      getDocFromServer: async ref => {
        reads.push(ref);
        if (status === 'error') throw new Error('offline');
        return { exists: () => status === 'ready', data: () => ({ username: 'seller_1' }) };
      },
    },
    '@/lib/firebase': { db: {} },
    '@/lib/signup': require(`${process.env.CATEGORY_TEST_BUILD}/signup.js`),
    '@/hooks': { useAuthContext() {} },
    '@/store': { useAuthStore: () => ({
      user: { id: 'uid-1', displayName: 'Private Name', email: 'private@example.test', location: 'Nederland' },
      loading: false,
    }) },
    '@/components': { LoadingSpinner: () => null },
    '@/components/Avatar': { Avatar: () => null },
  };
  const filename = path.join(__dirname, '../src/app/dashboard/profile/page.tsx');
  const code = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  const module = { exports: {} };
  vm.runInNewContext(code, {
    module, exports: module.exports, Error, console,
    require: name => imports[name] ?? require(name),
  }, { filename });
  const Page = module.exports.default;
  function render() { cursor = 0; tree = Page(); firstRender = false; }
  function find(predicate, node = tree) {
    if (!node || typeof node !== 'object') return undefined;
    if (predicate(node)) return node;
    for (const child of React.Children.toArray(node.props?.children)) {
      const found = find(predicate, child);
      if (found) return found;
    }
  }
  render();
  effects.forEach(effect => effect());
  await new Promise(resolve => setImmediate(resolve));
  render();
  assert.deepEqual(reads, ['publicProfiles/uid-1']);
  assert.equal(find(node => node.type === 'dd' && node.props.children === 'Private Name'), undefined);
  assert.ok(find(node => node.type === 'dd' && node.props.children === 'private@example.test'));
  if (status === 'ready') {
    assert.ok(find(node => node.type === 'dd' && React.Children.toArray(node.props.children.props.children).includes('seller_1')));
    assert.ok(find(node => node.type === 'button' && node.props.children === 'Edit Username'));
  }
  if (status === 'missing') assert.ok(find(node => node.props?.href === '/auth/signup'));
  if (status === 'error') assert.ok(find(node => node.type === 'button' && node.props.children === 'Try again'));
});

for (const scenario of ['success', 'unavailable-name', 'cooldown', 'inconsistent', 'missing-details', 'retry', 'invalid']) {
  test(`profile username editing handles ${scenario}`, async () => {
    const states = [], effects = [], calls = [];
    let cursor = 0, tree, firstRender = true, attempts = 0, resolveRename;
    const auth = { currentUser: { uid: 'uid-1' } };
    const hooks = {
      useState(initial) {
        const index = cursor++;
        if (!(index in states)) states[index] = initial;
        return [states[index], value => { states[index] = typeof value === 'function' ? value(states[index]) : value; }];
      },
      useRef(initial) {
        const index = cursor++;
        if (!(index in states)) states[index] = { current: initial };
        return states[index];
      },
      useEffect(effect) { if (firstRender) effects.push(effect); },
    };
    const imports = {
      react: hooks,
      'next/link': { __esModule: true, default: 'a' },
      'next/navigation': { useRouter: () => ({ replace: () => assert.fail('unexpected redirect') }) },
      'firebase/firestore': {
        doc: (_, collection, uid) => `${collection}/${uid}`,
        getDocFromServer: async ref => {
          assert.equal(ref, 'publicProfiles/uid-1');
          return { exists: () => true, data: () => ({ username: 'seller_1' }) };
        },
      },
      'firebase/functions': {
        httpsCallable: (client, name) => {
          assert.equal(client, 'regional-functions');
          assert.equal(name, 'renameUsername');
          return async payload => {
            calls.push({ ...payload });
            attempts++;
            if (scenario === 'unavailable-name' && attempts === 1) throw { code: 'functions/already-exists' };
            if (scenario === 'cooldown') throw { code: 'functions/failed-precondition', message: 'Different message', details: { reason: 'USERNAME_RENAME_COOLDOWN' } };
            if (scenario === 'inconsistent' || scenario === 'missing-details') throw { code: 'functions/failed-precondition', message: 'You can change your username once every 30 days.', details: scenario === 'inconsistent' ? { reason: 'PROFILE_INCONSISTENT' } : undefined };
            if (scenario === 'retry' && attempts === 1) throw { code: 'functions/unavailable' };
            if (scenario === 'success') return new Promise(resolve => { resolveRename = () => resolve({ data: { username: 'new_name' } }); });
            return { data: { username: payload.username } };
          };
        },
      },
      '@/lib/firebase': { db: {}, functions: 'regional-functions', auth },
      '@/lib/signup': require(`${process.env.CATEGORY_TEST_BUILD}/signup.js`),
      '@/hooks': { useAuthContext() {} },
      '@/store': { useAuthStore: () => ({ user: { id: 'uid-1', displayName: 'Private Name', email: 'private@example.test' }, loading: false }) },
      '@/components': { LoadingSpinner: () => null },
      '@/components/Avatar': { Avatar: () => null },
    };
    const filename = path.join(__dirname, '../src/app/dashboard/profile/page.tsx');
    const code = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
    }).outputText;
    const module = { exports: {} };
    vm.runInNewContext(code, {
      module, exports: module.exports, Error, console,
      require: name => imports[name] ?? require(name),
    }, { filename });
    const Page = module.exports.default;
    function render() { cursor = 0; tree = Page(); firstRender = false; }
    function find(predicate, node = tree) {
      if (!node || typeof node !== 'object') return undefined;
      if (predicate(node)) return node;
      for (const child of React.Children.toArray(node.props?.children)) {
        const found = find(predicate, child);
        if (found) return found;
      }
    }
    render();
    effects.forEach(effect => effect());
    await new Promise(resolve => setImmediate(resolve));
    render();
    find(node => node.type === 'button' && node.props.children === 'Edit Username').props.onClick();
    render();
    assert.ok(find(node => node.type === 'p' && typeof node.props.children === 'string' &&
      node.props.children.includes('first username change is immediate') &&
      node.props.children.includes('30 days')));
    find(node => node.props?.id === 'new-username').props.onChange({ target: { value: scenario === 'invalid' ? 'bad name' : 'New_Name' } });
    render();
    const form = find(node => node.type === 'form');
    const submitted = form.props.onSubmit({ preventDefault() {} });
    if (scenario === 'success') {
      await form.props.onSubmit({ preventDefault() {} });
      assert.deepEqual(calls, [{ username: 'new_name' }]);
      resolveRename();
    }
    await submitted;
    render();
    if (scenario === 'success') {
      assert.match(find(node => node.props?.role === 'status').props.children, /new_name/);
      assert.equal(find(node => node.type === 'form'), undefined);
      return;
    }
    const message = find(node => node.props?.role === 'alert').props.children;
    if (scenario === 'invalid') {
      assert.match(message, /3–20/);
      assert.deepEqual(calls, []);
      return;
    }
    if (scenario === 'cooldown') assert.match(message, /30 days/);
    if (scenario === 'inconsistent' || scenario === 'missing-details') assert.match(message, /contact support/);
    if (scenario === 'unavailable-name') assert.match(message, /unavailable/);
    if (scenario === 'retry') assert.match(message, /temporarily unavailable/);
    assert.equal(find(node => node.props?.id === 'new-username').props.value, 'New_Name');
    if (scenario === 'unavailable-name' || scenario === 'retry') {
      if (scenario === 'unavailable-name') {
        find(node => node.props?.id === 'new-username').props.onChange({ target: { value: 'Other_Name' } });
        render();
      }
      await find(node => node.type === 'form').props.onSubmit({ preventDefault() {} });
      render();
      assert.deepEqual(calls, [{ username: 'new_name' }, { username: scenario === 'retry' ? 'new_name' : 'other_name' }]);
      assert.match(find(node => node.props?.role === 'status').props.children, scenario === 'retry' ? /new_name/ : /other_name/);
    }
  });
}
