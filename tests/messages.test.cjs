const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');
const React = require('react');
const ts = require('typescript');
const { renderToStaticMarkup } = require('react-dom/server');

const root = path.join(__dirname, '..');

function harness() {
  const states = [];
  const effects = [];
  const listeners = [];
  const writes = [];
  const pendingSends = [];
  let deferSends = false;
  let cursor = 0;
  let effectCursor = 0;
  let tree;
  let auth = { user: { id: 'account-a' }, loading: false };

  const filename = path.join(root, 'src/app/messages/page.tsx');
  const { outputText } = ts.transpileModule(
    fs.readFileSync(filename, 'utf8'),
    {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2020,
        jsx: ts.JsxEmit.ReactJSX,
        esModuleInterop: true,
      },
    }
  );

  const module = { exports: {} };

  const mocks = {
    react: {
      ...React,
      useRef(initial) {
        const index = cursor++;
        if (!(index in states)) {
          states[index] = { current: initial };
        }
        return states[index];
      },
      useState(initial) {
        const index = cursor++;
        if (!(index in states)) states[index] = initial;
        return [
          states[index],
          value => {
            states[index] =
              typeof value === 'function'
                ? value(states[index])
                : value;
          },
        ];
      },
      useEffect(callback, deps) {
        const index = effectCursor++;
        const previous = effects[index];

        if (
          !previous ||
          deps.some((value, i) => value !== previous.deps[i])
        ) {
          previous?.cleanup?.();
          effects[index] = { callback, deps };
        }
      },
    },
    'firebase/firestore': {
      collection: (_, name) => ({ collectionName: name }),
      doc: (_, name, id) => ({ collectionName: name, id }),
      where: (field, operator, value) => ({ field, operator, value }),
      orderBy: (field, direction) => ({ field, direction }),
      query: (reference, ...constraints) => ({
        ...reference,
        constraints,
      }),
      onSnapshot: (reference, next, error) => {
        const listener = {
          reference,
          next,
          error,
          active: true,
        };

        listeners.push(listener);

        return () => {
          listener.active = false;
        };
      },
      addDoc: (_, data) => {
        writes.push(data);

        if (!deferSends) {
          return Promise.resolve({ id: 'new-message' });
        }

        return new Promise((resolve, reject) => {
          pendingSends.push({ resolve, reject });
        });
      },
      Timestamp: { now: () => ({ seconds: 123 }) },
    },
    '@/lib/firebase': { db: {} },
    '@/store': { useAuthStore: () => auth },
    '@/hooks': { useAuthContext: () => {} },
    '@/components': { LoadingSpinner: () => null },
    'lucide-react': { Send: () => null },
    'react-hot-toast': {
      __esModule: true,
      default: { success() {}, error() {} },
    },
  };

  vm.runInNewContext(
    outputText,
    {
      module,
      exports: module.exports,
      require: name => name in mocks ? mocks[name] : require(name),
      console,
    },
    { filename }
  );

  function render() {
    cursor = 0;
    effectCursor = 0;
    tree = module.exports.default();

    for (const effect of effects) {
      if (effect.callback) {
        effect.cleanup = effect.callback();
        effect.callback = null;
      }
    }

    return tree;
  }

  function settle() {
    // Allow state updates from effects to propagate through renders.
    // A bounded number of passes prevents accidental infinite loops.
    for (let pass = 0; pass < 5; pass++) {
      render();
    }
    return tree;
  }

  function find(predicate, node = tree) {
    if (!node || typeof node !== 'object') return undefined;
    if (predicate(node)) return node;

    for (const child of React.Children.toArray(node.props?.children)) {
      const result = find(predicate, child);
      if (result) return result;
    }
  }

  function snapshot(listener, documents) {
    listener.next({
      forEach(callback) {
        for (const document of documents) {
          callback({
            id: document.id ?? 'message-id',
            data: () => document,
          });
        }
      },
    });

    settle();
  }

  function profile(listener, username) {
    listener.next({
      data: () => ({ username }),
    });
    settle();
  }

  function listenerFor(collectionName, predicate = () => true) {
    return [...listeners].reverse().find(
      listener =>
        listener.active &&
        listener.reference.collectionName === collectionName &&
        predicate(listener.reference)
    );
  }

  function conversationListener(ownerId) {
    return listenerFor(
      'messages',
      reference =>
        reference.constraints.length === 1 &&
        reference.constraints[0].field === 'senderId' &&
        reference.constraints[0].value === ownerId
    );
  }

  function historyListener(ownerId, recipientId) {
    return listenerFor(
      'messages',
      reference =>
        reference.constraints.some(
          constraint =>
            constraint.field === 'senderId' &&
            constraint.value === ownerId
        ) &&
        reference.constraints.some(
          constraint =>
            constraint.field === 'recipientId' &&
            constraint.value === recipientId
        )
    );
  }

  function html() {
    return renderToStaticMarkup(tree);
  }

  function clickConversation(username) {
    const button = find(
      node =>
        node.type === 'button' &&
        node.props?.children?.props?.children === username
    );

    assert.ok(button, `Conversation not found: ${username}`);
    button.props.onClick();
    settle();
  }

  function typeMessage(value) {
    const input = find(
      node =>
        node.type === 'input' &&
        node.props?.placeholder === 'Type a message...'
    );

    assert.ok(input, 'Message input not found');
    input.props.onChange({ target: { value } });
    settle();
  }

  settle();

  return {
    render: settle,
    html,
    snapshot,
    profile,
    conversationListener,
    historyListener,
    clickConversation,
    typeMessage,
    listenerFor,
    listeners,
    writes,
    pendingSends,
    deferMessageSends() {
      deferSends = true;
    },
    find,
    switchAccount(id) {
      auth = {
        user: id ? { id } : null,
        loading: false,
      };

      // Inspect the immediate render before effects settle.
      cursor = 0;
      effectCursor = 0;
      tree = module.exports.default();
      const immediate = renderToStaticMarkup(tree);

      settle();
      return immediate;
    },
    unmount() {
      for (const effect of effects) effect.cleanup?.();
    },
  };
}

function message(text, senderId, recipientId) {
  return {
    id: `id-${text}`,
    text,
    senderId,
    recipientId,
    createdAt: {
      toDate: () => new Date('2026-11-15T12:00:00Z'),
    },
  };
}

test('account switching immediately hides the previous account messages and draft', () => {
  const app = harness();

  const conversationsA = app.conversationListener('account-a');
  assert.ok(conversationsA);

  app.snapshot(conversationsA, [
    message('hello', 'account-a', 'recipient-a'),
  ]);


  const profileA = app.listenerFor(
    'publicProfiles',
    reference => reference.id === 'recipient-a'
  );


  assert.ok(profileA);
  app.profile(profileA, 'recipient_a');
  app.clickConversation('recipient_a');

  const historyA = app.historyListener('account-a', 'recipient-a');
  assert.ok(historyA);

  app.snapshot(historyA, [
    message('private account A message', 'account-a', 'recipient-a'),
  ]);

  app.typeMessage('private account A draft');

  assert.match(app.html(), /private account A message/);
  assert.match(app.html(), /private account A draft/);

  const immediate = app.switchAccount('account-b');

  assert.doesNotMatch(immediate, /private account A message/);
  assert.doesNotMatch(immediate, /private account A draft/);
  assert.doesNotMatch(app.html(), /private account A message/);
  assert.doesNotMatch(app.html(), /private account A draft/);

  app.unmount();
});

test('stale Firestore callbacks cannot restore another account conversation', () => {
  const app = harness();

  const oldConversations = app.conversationListener('account-a');
  app.snapshot(oldConversations, [
    message('hello', 'account-a', 'recipient-a'),
  ]);

  const oldProfile = app.listenerFor(
    'publicProfiles',
    reference => reference.id === 'recipient-a'
  );

  app.profile(oldProfile, 'recipient_a');
  app.clickConversation('recipient_a');

  const oldHistory = app.historyListener('account-a', 'recipient-a');
  assert.ok(oldHistory);

  app.switchAccount('account-b');

  assert.equal(oldConversations.active, false);
  assert.equal(oldProfile.active, false);
  assert.equal(oldHistory.active, false);

  // Deliberately invoke callbacks after unsubscribe.
  app.snapshot(oldConversations, [
    message('stale conversation', 'account-a', 'recipient-a'),
  ]);

  app.profile(oldProfile, 'stale_username');

  app.snapshot(oldHistory, [
    message('stale private message', 'account-a', 'recipient-a'),
  ]);

  assert.doesNotMatch(
    app.html(),
    /stale conversation|stale_username|stale private message/
  );

  app.unmount();
});

test('changing conversations clears previous history and draft', () => {
  const app = harness();
  const conversations = app.conversationListener('account-a');

  app.snapshot(conversations, [
    message('first', 'account-a', 'recipient-a'),
    message('second', 'account-a', 'recipient-b'),
  ]);

  const profileA = app.listenerFor(
    'publicProfiles',
    reference => reference.id === 'recipient-a'
  );
  const profileB = app.listenerFor(
    'publicProfiles',
    reference => reference.id === 'recipient-b'
  );

  app.profile(profileA, 'recipient_a');
  app.profile(profileB, 'recipient_b');

  app.clickConversation('recipient_a');

  const historyA = app.historyListener('account-a', 'recipient-a');
  app.snapshot(historyA, [
    message('recipient A private history', 'account-a', 'recipient-a'),
  ]);

  app.typeMessage('recipient A draft');

  app.clickConversation('recipient_b');

  assert.doesNotMatch(app.html(), /recipient A private history/);
  assert.doesNotMatch(app.html(), /recipient A draft/);

  const historyB = app.historyListener('account-a', 'recipient-b');
  assert.ok(historyB);

  app.snapshot(historyB, [
    message('recipient B private history', 'account-a', 'recipient-b'),
  ]);

  assert.match(app.html(), /recipient B private history/);

  app.unmount();
});

test('live public username updates survive conversation-list refreshes', () => {
  const app = harness();
  const conversations = app.conversationListener('account-a');

  const document = message('hello', 'account-a', 'recipient-a');

  app.snapshot(conversations, [document]);

  const profile = app.listenerFor(
    'publicProfiles',
    reference => reference.id === 'recipient-a'
  );

  app.profile(profile, 'original_username');
  assert.match(app.html(), /original_username/);

  app.profile(profile, 'renamed_username');
  assert.match(app.html(), /renamed_username/);
  assert.doesNotMatch(app.html(), /original_username/);

  app.snapshot(conversations, [document]);

  assert.match(app.html(), /renamed_username/);
  assert.doesNotMatch(app.html(), /Username unavailable/);

  app.unmount();
});








test('an old account send cannot unlock the new account send', async () => {
  const app = harness();
  app.deferMessageSends();

  function openConversation(ownerId, recipientId, username) {
    const conversations = app.conversationListener(ownerId);
    assert.ok(conversations);

    app.snapshot(conversations, [
      message('hello', ownerId, recipientId),
    ]);

    const profile = app.listenerFor(
      'publicProfiles',
      reference => reference.id === recipientId
    );

    assert.ok(profile);
    app.profile(profile, username);
    app.clickConversation(username);
  }

  function send() {
    const form = app.find(node => node.type === 'form');
    assert.ok(form);
    return form.props.onSubmit({ preventDefault() {} });
  }

  openConversation('account-a', 'recipient-a', 'recipient_a');
  app.typeMessage('message from A');
  const sendA = send();

  assert.equal(app.writes.length, 1);
  assert.equal(app.pendingSends.length, 1);

  app.switchAccount('account-b');
  openConversation('account-b', 'recipient-b', 'recipient_b');
  app.typeMessage('message from B');
  const sendB = send();

  assert.equal(app.writes.length, 2);
  assert.equal(app.pendingSends.length, 2);

  // Account A completes while Account B is still sending.
  app.pendingSends[0].resolve({ id: 'sent-a' });
  await sendA;
  app.render();

  // A second submission from B must remain blocked.
  send();
  assert.equal(
    app.writes.length,
    2,
    'Account A completion must not unlock Account B sending'
  );

  // Account B can finish normally.
  app.pendingSends[1].resolve({ id: 'sent-b' });
  await sendB;
  app.render();

  assert.doesNotMatch(app.html(), /message from B/);

  app.unmount();
});