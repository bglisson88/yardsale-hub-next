const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');
const ts = require('typescript');

function createHookHarness(pages) {
  const filename = path.join(__dirname, '..', 'src/hooks/usePublicEvents.ts');
  const hookModule = { exports: {} };
  const state = [];
  let stateCursor = 0;
  let effect;
  const queryCalls = [];
  let currentPage = 0;
  const timestamp = { marker: 'now' };
  const code = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS },
  }).outputText;
  const mocks = {
    react: {
      useState(initial) {
        const index = stateCursor++;
        if (!(index in state)) state[index] = initial;
        return [state[index], value => {
          state[index] = typeof value === 'function' ? value(state[index]) : value;
        }];
      },
      useRef(initial) {
        const index = stateCursor++;
        if (!(index in state)) state[index] = { current: initial };
        return state[index];
      },
      useEffect(callback) { effect = callback; },
    },
    'firebase/firestore': {
      collection: (_db, name) => ({ name }),
      where: (...args) => ({ type: 'where', args }),
      orderBy: (...args) => ({ type: 'orderBy', args }),
      startAfter: cursor => ({ type: 'startAfter', cursor }),
      limit: amount => ({ type: 'limit', amount }),
      query: (collection, ...constraints) => {
        queryCalls.push({ collection, constraints });
        return { collection, constraints };
      },
      Timestamp: { now: () => timestamp },
      getDocs: async () => pages[currentPage++],
    },
    '@/lib/firebase': { db: {} },
  };
  vm.runInNewContext(code, {
    module: hookModule, exports: hookModule.exports,
    require: name => mocks[name] ?? require(name),
    Date,
  }, { filename });

  return {
    usePublicEvents: hookModule.exports.usePublicEvents,
    queryCalls,
    state,
    timestamp,
    rerender() { stateCursor = 0; },
    async runEffect() {
      const cleanup = effect();
      await new Promise(resolve => setImmediate(resolve));
      return cleanup;
    },
  };
}

function eventDocument(overrides = {}) {
  return {
    schemaVersion: 1,
    title: 'Sale',
    description: 'Public details',
    location: 'Nederland',
    locationId: 'nederland-tx',
    locationVisibility: 'general',
    startDate: { toDate: () => new Date('2026-11-20T09:00:00Z') },
    endDate: { toDate: () => new Date('2026-11-20T12:00:00Z') },
    photoURL: null,
    createdAt: { toDate: () => new Date('2026-11-01T10:00:00Z') },
    updatedAt: { toDate: () => new Date('2026-11-01T10:00:00Z') },
    itemCount: 0,
    ...overrides,
  };
}

function doc(id, data) {
  return { id, data: () => data };
}

test('public event hook queries only the sanitized collection and allowlists returned fields', async () => {
  const harness = createHookHarness([{
    docs: [
      doc('safe', eventDocument({
        address: 'private value',
        userId: 'private organizer',
        unknownField: 'do not copy',
      })),
      doc('malformed', eventDocument({ itemCount: 'invalid' })),
      doc('unsupported-version', eventDocument({ schemaVersion: 2 })),
    ],
  }]);
  harness.usePublicEvents();
  await harness.runEffect();
  harness.rerender();

  assert.equal(harness.queryCalls[0].collection.name, 'publicYardSaleEvents');
  assert.deepEqual(
    harness.queryCalls[0].constraints.map(constraint => constraint.type),
    ['where', 'orderBy', 'limit'],
  );
  assert.equal(harness.queryCalls[0].constraints[2].amount, 50);
  assert.equal(harness.queryCalls[0].constraints[0].args[0], 'startDate');
  assert.equal(harness.queryCalls[0].constraints[0].args[2], harness.timestamp);
  const result = harness.usePublicEvents();
  assert.equal(result.events.length, 1);
  assert.equal(result.events[0].id, 'safe');
  assert.deepEqual(Object.keys(result.events[0]).sort(), [
    'createdAt', 'description', 'endDate', 'id', 'itemCount', 'location',
    'locationId', 'locationVisibility', 'photoURL', 'startDate', 'title', 'updatedAt',
  ].sort());
});

test('public event hook loads additional pages after the last document', async () => {
  const rows = Array.from({ length: 50 }, (_, index) =>
    doc(`event-${index}`, eventDocument({ title: `Event ${index}` })));
  const cursor = rows[rows.length - 1];
  const harness = createHookHarness([
    { docs: rows },
    { docs: [doc('event-50', eventDocument({ title: 'Event 50' }))] },
  ]);
  harness.usePublicEvents();
  await harness.runEffect();
  harness.rerender();
  const result = harness.usePublicEvents();
  assert.equal(result.hasMore, true);
  await result.loadMore();
  harness.rerender();
  const updated = harness.usePublicEvents();
  assert.equal(updated.events.length, 51);
  assert.equal(harness.queryCalls[1].constraints[2].type, 'startAfter');
  assert.equal(harness.queryCalls[1].constraints[2].cursor.id, cursor.id);
  assert.equal(harness.queryCalls[1].constraints[3].amount, 50);
});
