const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');
const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');
const ts = require('typescript');
const taxonomy = require(path.join(process.env.CATEGORY_TEST_BUILD, 'categories.js'));

const componentPath = path.join(__dirname, '../src/components/CategoryFields.tsx');
const componentModule = { exports: {} };
const { outputText } = ts.transpileModule(fs.readFileSync(componentPath, 'utf8'), {
  compilerOptions: {
    module: ts.ModuleKind.CommonJS,
    jsx: ts.JsxEmit.ReactJSX,
  },
});
vm.runInNewContext(outputText, {
  module: componentModule,
  exports: componentModule.exports,
  require: name => name === '@/lib/categories' ? taxonomy : require(name),
}, { filename: componentPath });
const { default: ListingCategoryFields, CategoryFields } = componentModule.exports;

function findSelects(tree) {
  const selects = [];
  function visit(node) {
    if (!node || typeof node !== 'object') return;
    if (node.type === 'select') selects.push(node);
    React.Children.forEach(node.props?.children, visit);
  }
  visit(tree);
  return selects;
}

function optionValues(select) {
  return React.Children.toArray(select.props.children)
    .filter(React.isValidElement)
    .map(option => option.props.value);
}

test('changing parent clears child and item type and replaces dependent options', () => {
  const [first, second] = taxonomy.CATEGORIES;
  let values = {
    category: first.id,
    subcategory: first.subcategories[0].id,
    itemType: 'legacy-item-type',
  };
  const render = () => findSelects(ListingCategoryFields({
    ...values,
    required: true,
    requireSubcategory: true,
    onChange: next => { values = next; },
  }));
  let selects = render();
  assert.deepEqual(optionValues(selects[1]), ['', ...first.subcategories.map(child => child.id)]);

  selects[0].props.onChange({ target: { value: second.id } });
  assert.equal(values.category, second.id);
  assert.equal(values.subcategory, '');
  assert.equal(values.itemType, '');
  selects = render();
  assert.deepEqual(optionValues(selects[1]), ['', ...second.subcategories.map(child => child.id)]);
  assert.equal(selects[1].props.value, '');
  assert.ok(!optionValues(selects[1]).includes(first.subcategories[0].id));
});

test('selecting or clearing a subcategory clears the previous item type', () => {
  const parent = taxonomy.CATEGORIES[0];
  let values = {
    category: parent.id,
    subcategory: parent.subcategories[0].id,
    itemType: 'legacy-item-type',
  };
  const render = () => findSelects(ListingCategoryFields({
    ...values,
    onChange: next => { values = next; },
  }));
  render()[1].props.onChange({ target: { value: parent.subcategories[1].id } });
  assert.equal(values.category, parent.id);
  assert.equal(values.subcategory, parent.subcategories[1].id);
  assert.equal(values.itemType, '');

  values.itemType = 'another-item-type';
  render()[1].props.onChange({ target: { value: '' } });
  assert.equal(values.category, parent.id);
  assert.equal(values.subcategory, '');
  assert.equal(values.itemType, '');
});

test('browse wrapper exposes the parent-child callback and clears child on parent change', () => {
  const [first, second] = taxonomy.CATEGORIES;
  let selection;
  const component = CategoryFields({
    category: first.id,
    subcategory: first.subcategories[0].id,
    onChange: (parent, child) => { selection = [parent, child]; },
  });
  const selects = findSelects(component.type(component.props));
  selects[0].props.onChange({ target: { value: second.id } });
  assert.deepEqual(selection, [second.id, '']);
  selects[1].props.onChange({ target: { value: first.subcategories[1].id } });
  assert.deepEqual(selection, [first.id, first.subcategories[1].id]);
});

test('React SSR renders independent required flags and optional browse labels', () => {
  const parent = taxonomy.CATEGORIES[0];
  const render = extra => renderToStaticMarkup(React.createElement(CategoryFields, {
    category: parent.id,
    subcategory: '',
    onChange() {},
    ...extra,
  }));
  const optional = render({});
  assert.match(optional, /All categories/);
  assert.match(optional, /All subcategories/);
  assert.doesNotMatch(optional, /required=/);

  const parentOnly = render({ required: true });
  assert.match(parentOnly, /name="category" required=""/);
  assert.doesNotMatch(parentOnly, /name="subcategory" required=/);
  assert.match(parentOnly, /All subcategories/);

  const childOnly = render({ requireSubcategory: true });
  assert.doesNotMatch(childOnly, /name="category" required=/);
  assert.match(childOnly, /name="subcategory" required=""/);
  assert.match(childOnly, /All categories/);

  const both = render({ required: true, requireSubcategory: true });
  assert.match(both, /name="category" required=""/);
  assert.match(both, /name="subcategory" required=""/);
  assert.match(both, /<option value="" selected="">Select a subcategory<\/option>/);
});

test('disabled flags disable both controls and a missing parent disables only the child', () => {
  const render = extra => {
    const component = CategoryFields({
      category: taxonomy.CATEGORIES[0].id,
      subcategory: '',
      onChange() {},
      ...extra,
    });
    return findSelects(component.type(component.props));
  };
  for (const select of render({ disabled: true })) assert.equal(select.props.disabled, true);
  const [parent, child] = render({ category: '' });
  assert.equal(parent.props.disabled, false);
  assert.equal(child.props.disabled, true);
});

test('React SSR canonicalizes known legacy parent and child display without inventing children', () => {
  const parent = taxonomy.getCategory('Furniture');
  const child = parent.subcategories[0];
  const html = renderToStaticMarkup(React.createElement(CategoryFields, {
    category: 'Furniture',
    subcategory: child.label,
    onChange() {},
  }));
  assert.ok(html.includes(`<option value="${parent.id}" selected="">`));
  assert.ok(html.includes(`<option value="${child.id}" selected="">`));

  const component = CategoryFields({ category: 'Furniture', subcategory: '', onChange() {} });
  assert.equal(findSelects(component.type(component.props))[1].props.value, '');
});

test('React SSR preserves an unknown legacy category as its selected raw value', () => {
  const html = renderToStaticMarkup(React.createElement(CategoryFields, {
    category: 'Unmapped vintage category',
    subcategory: '',
    onChange() {},
  }));
  assert.match(html, /<option value="Unmapped vintage category" selected="">Unmapped vintage category \(legacy\)<\/option>/);
});

async function renderEditForm(item) {
  const state = [];
  const dependencies = [];
  let cursor = 0;
  let effects = [];
  let tree;
  let uploads = 0;
  const updates = [];
  const errors = [];
  const user = { id: 'owner', location: 'Town' };
  const router = { replace() {}, push() {} };
  const hooks = {
    useState(initial) {
      const index = cursor++;
      if (!(index in state)) state[index] = initial;
      return [state[index], value => {
        state[index] = typeof value === 'function' ? value(state[index]) : value;
      }];
    },
    useRef(initial) {
      const index = cursor++;
      if (!(index in state)) state[index] = { current: initial };
      return state[index];
    },
    useEffect(effect, next) {
      const index = cursor++;
      if (!dependencies[index] || next.some((value, i) => value !== dependencies[index][i])) {
        effects.push(effect);
        dependencies[index] = next;
      }
    },
  };
  const imports = {
    react: hooks,
    'firebase/firestore': {
      doc: () => 'item-document',
      getDoc: async () => ({ exists: () => true, data: () => item, id: 'legacy-item' }),
      updateDoc: async (_, fields) => { updates.push(fields); },
      deleteField: () => 'DELETE_FIELD',
      Timestamp: { now: () => 123 },
    },
    'firebase/storage': {
      ref: () => 'photo',
      uploadBytes: async () => { uploads++; },
      getDownloadURL: async () => 'uploaded-photo',
    },
    '@/lib/firebase': { db: {}, storage: {}, auth: { currentUser: { uid: user.id } } },
    'next/navigation': { useRouter: () => router },
    'react-hot-toast': {
      __esModule: true,
      default: { error: message => { errors.push(message); }, success() {} },
    },
    '@/store': { useAuthStore: () => ({ user, loading: false }) },
    '@/hooks': { useAuthContext() {} },
    '@/components': { LoadingSpinner: () => null },
    '@/components/CategoryFields': { __esModule: true, default: ListingCategoryFields },
    '@/lib/categories': taxonomy,
  };
  const formPath = path.join(__dirname, '../src/components/ItemForm.tsx');
  const formModule = { exports: {} };
  const code = ts.transpileModule(fs.readFileSync(formPath, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  vm.runInNewContext(code, {
    module: formModule,
    exports: formModule.exports,
    require: name => imports[name] ?? require(name),
    URL,
    Error,
  }, { filename: formPath });
  function render() {
    cursor = 0;
    tree = formModule.exports.default({ itemId: 'legacy-item' });
    const pending = effects;
    effects = [];
    pending.forEach(effect => effect());
  }
  function find(predicate, node = tree) {
    if (!node || typeof node !== 'object') return undefined;
    if (predicate(node)) return node;
    for (const child of React.Children.toArray(node.props?.children)) {
      const found = find(predicate, child);
      if (found) return found;
    }
    return undefined;
  }
  render();
  await new Promise(resolve => setImmediate(resolve));
  render();
  return {
    updates,
    errors,
    get uploads() { return uploads; },
    changeTitle(value) {
      find(node => node.props?.name === 'title').props.onChange({ target: { name: 'title', value } });
      render();
    },
    changeClassification(values) {
      find(node => node.type === ListingCategoryFields).props.onChange(values);
      render();
    },
    async submit() {
      await find(node => node.type === 'form').props.onSubmit({ preventDefault() {} });
    },
  };
}

test('unrelated edits preserve original unknown legacy children and types verbatim', async () => {
  for (const category of ['Furniture', 'Unmapped legacy parent']) {
    const original = {
      userId: 'owner',
      title: 'Original title',
      category,
      subcategory: 'Unrecognized old child',
      itemType: 'Unrecognized old item type',
      price: 10,
      condition: 'good',
      photoURLs: ['existing-photo'],
      yardSaleId: 'existing-event',
    };
    const form = await renderEditForm(original);
    form.changeTitle('Updated title');
    await form.submit();
    assert.equal(form.errors.length, 0);
    assert.equal(form.uploads, 0);
    assert.equal(form.updates.length, 1);
    const update = form.updates[0];
    assert.equal(update.title, 'Updated title');
    assert.equal(update.category, original.category);
    assert.equal(update.subcategory, original.subcategory);
    assert.equal(update.itemType, original.itemType);
    assert.deepEqual(Array.from(update.photoURLs), original.photoURLs);
    assert.equal('yardSaleId' in update, false);
  }
});

test('unchanged parent-only legacy edits omit missing optional taxonomy fields', async () => {
  const form = await renderEditForm({
    userId: 'owner', title: 'Old', category: 'Furniture', price: 10, condition: 'good',
  });
  await form.submit();
  assert.equal(form.updates.length, 1);
  assert.equal(form.updates[0].category, 'Furniture');
  assert.equal('subcategory' in form.updates[0], false);
  assert.equal('itemType' in form.updates[0], false);
});

test('changed legacy classification is validated before uploads or writes', async () => {
  const original = {
    userId: 'owner', title: 'Old', category: 'Furniture', subcategory: 'Old unknown child',
    itemType: 'Old unknown type', price: 10, condition: 'good',
  };
  const invalidChild = await renderEditForm(original);
  invalidChild.changeClassification({
    category: 'Furniture', subcategory: 'Old unknown child', itemType: '',
  });
  await invalidChild.submit();
  assert.equal(invalidChild.updates.length, 0);
  assert.equal(invalidChild.uploads, 0);
  assert.match(invalidChild.errors[0], /Invalid subcategory/);

  const invalidParent = await renderEditForm({ ...original, category: 'Unknown old parent' });
  invalidParent.changeClassification({
    category: 'Unknown old parent', subcategory: '', itemType: '',
  });
  await invalidParent.submit();
  assert.equal(invalidParent.updates.length, 0);
  assert.equal(invalidParent.uploads, 0);
  assert.match(invalidParent.errors[0], /valid category/);

  const cleared = await renderEditForm(original);
  cleared.changeClassification({ category: 'Furniture', subcategory: '', itemType: '' });
  await cleared.submit();
  assert.equal(cleared.updates.length, 1);
  assert.equal(cleared.updates[0].category, taxonomy.normalizeCategory('Furniture'));
  assert.equal(cleared.updates[0].subcategory, 'DELETE_FIELD');
  assert.equal(cleared.updates[0].itemType, 'DELETE_FIELD');
});
