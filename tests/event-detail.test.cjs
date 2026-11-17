const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');
const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');
const ts = require('typescript');

function loadPage(imports) {
  const filename = path.join(__dirname, '..', 'src/app/events/[id]/page.tsx');
  const pageModule = { exports: {} };
  const code = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      jsx: ts.JsxEmit.ReactJSX,
      esModuleInterop: true,
    },
  }).outputText;
  vm.runInNewContext(code, {
    module: pageModule,
    exports: pageModule.exports,
    require: name => imports[name] ?? require(name),
    Error,
  }, { filename });
  return pageModule.exports.default;
}

async function loadEventDetail({
  locationVisibility = 'exact',
  privateDocument = { userId: 'owner', address: '12 Main Street' },
  privateError,
  publicError,
  user = { id: 'owner' },
} = {}) {
  const state = [];
  const effects = [];
  const documentReads = [];
  let cursor = 0;
  let tree;
  const eventData = {
    userId: 'owner',
    title: 'Neighborhood Sale',
    description: 'Public event details',
    location: 'Nederland',
    locationVisibility,
    startDate: new Date('2026-11-20T09:00:00Z'),
    endDate: new Date('2026-11-20T12:00:00Z'),
    createdAt: new Date('2026-11-01T10:00:00Z'),
    updatedAt: new Date('2026-11-01T10:00:00Z'),
    photoURL: null,
    itemCount: 3,
  };
  const Icon = () => null;
  const imports = {
    react: {
      useState(initial) {
        const index = cursor++;
        if (!(index in state)) state[index] = initial;
        return [state[index], value => {
          state[index] = typeof value === 'function' ? value(state[index]) : value;
        }];
      },
      useEffect(effect) { effects.push(effect); },
    },
    'firebase/firestore': {
      doc: (_db, collection, id) => `${collection}/${id}`,
      getDoc: async path => {
        documentReads.push(path);
        if (path === 'yardSaleEvents/event-1') {
          if (publicError) throw publicError;
          return { exists: () => true, id: 'event-1', data: () => eventData };
        }
        if (privateError) throw privateError;
        return {
          exists: () => privateDocument !== null,
          data: () => privateDocument,
        };
      },
    },
    'lucide-react': {
      Calendar: Icon,
      MapPin: Icon,
      Pencil: Icon,
      Users: Icon,
    },
    'next/link': { __esModule: true, default: 'a' },
    'next/navigation': {
      useParams: () => ({ id: 'event-1' }),
      useRouter: () => ({ push() {} }),
    },
    '@/lib/firebase': { db: {} },
    '@/hooks': { useAuthContext() {} },
    '@/store': { useAuthStore: () => ({ user }) },
    '@/components': { LoadingSpinner: () => null },
    '@/lib/delete-event': { deleteOwnedEvent: async () => null },
    'react-hot-toast': { __esModule: true, default: { success() {}, error() {} } },
  };
  const Page = loadPage(imports);
  const render = () => {
    cursor = 0;
    tree = Page();
    return renderToStaticMarkup(tree);
  };

  render();
  effects[0]();
  await new Promise(resolve => setImmediate(resolve));
  const html = render();
  return { html, documentReads };
}

test('loads public event detail and shows an address returned by the consent-gated read', async () => {
  const { html, documentReads } = await loadEventDetail();
  assert.match(html, /Neighborhood Sale/);
  assert.match(html, /Nederland/);
  assert.match(html, /12 Main Street/);
  assert.match(html, /href="\/events\/event-1\/edit"/);
  assert.match(html, /Delete Event/);
  assert.deepEqual(documentReads, ['yardSaleEvents/event-1', 'eventPrivate/event-1']);
});

test('a denied private-address read preserves public details and falls back to general location', async () => {
  const permissionError = Object.assign(new Error('permission denied'), {
    code: 'permission-denied',
  });
  const { html } = await loadEventDetail({ privateError: permissionError });
  assert.match(html, /Neighborhood Sale/);
  assert.match(html, /Public event details/);
  assert.match(html, /Nederland/);
  assert.match(html, /The exact address is unavailable\. Showing the general location\./);
  assert.doesNotMatch(html, /12 Main Street/);
});

test('a missing consent-gated private document shows public details without an address', async () => {
  const { html } = await loadEventDetail({ privateDocument: null });
  assert.match(html, /Neighborhood Sale/);
  assert.match(html, /Nederland/);
  assert.match(html, /The exact address is unavailable\. Showing the general location\./);
  assert.doesNotMatch(html, /Get directions/);
});

test('general-location events do not request private addresses and retain owner controls', async () => {
  const { html, documentReads } = await loadEventDetail({
    locationVisibility: 'general',
    privateDocument: null,
  });
  assert.match(html, /Neighborhood Sale/);
  assert.match(html, /The organizer has chosen to share only a general location\./);
  assert.match(html, /href="\/events\/event-1\/edit"/);
  assert.deepEqual(documentReads, ['yardSaleEvents/event-1']);
});

test('public event read failures remain distinct from denied address reads', async () => {
  const { html, documentReads } = await loadEventDetail({
    publicError: new Error('Public event read failed'),
  });
  assert.match(html, /Public event read failed/);
  assert.deepEqual(documentReads, ['yardSaleEvents/event-1']);
});
