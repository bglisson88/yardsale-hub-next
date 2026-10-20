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

async function renderItemForm({ item, ...options } = {}) {
  const state = [];
  const dependencies = [];
  let cursor = 0;
  let effects = [];
  let tree;
  let uploads = 0;
  const updates = [];
  const creates = [];
  const uploadedFiles = [];
  const previews = [];
  const revoked = [];
  const errors = [];
  const successes = [];
  const pushes = [];
  const replacements = [];
  let authState = {
    user: { id: 'owner', location: 'Town' }, loading: false, ...options.auth,
  };
  class Timestamp {
    constructor() { this.seconds = 123; this.nanoseconds = 456; }
    static now() { return new Timestamp(); }
  }
  const router = {
    replace: destination => { replacements.push(destination); },
    push: destination => { pushes.push(destination); },
  };
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
      collection: (_, name) => name,
      getDoc: async () => ({ exists: () => true, data: () => item, id: 'legacy-item' }),
      updateDoc: async (_, fields) => { updates.push(fields); },
      addDoc: async (collection, fields) => {
        if (options.writeError) throw options.writeError;
        creates.push({ collection, fields });
      },
      deleteField: () => 'DELETE_FIELD',
      Timestamp,
    },
    'firebase/storage': {
      ref: () => 'photo',
      uploadBytes: async (_, file) => {
        uploads++;
        uploadedFiles.push(file);
        if (options.uploadError) throw options.uploadError;
      },
      getDownloadURL: async () => 'uploaded-photo',
    },
    '@/lib/firebase': { db: {}, storage: {}, auth: { currentUser: { uid: 'owner' } } },
    'next/navigation': { useRouter: () => router },
    'react-hot-toast': {
      __esModule: true,
      default: {
        error: message => { errors.push(message); },
        success: message => { successes.push(message); },
      },
    },
    '@/store': { useAuthStore: () => authState },
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
    URL: {
      createObjectURL(file) {
        const url = `blob:preview-${previews.length}`;
        previews.push({ file, url });
        return url;
      },
      revokeObjectURL: url => { revoked.push(url); },
    },
    Error,
  }, { filename: formPath });
  function render() {
    cursor = 0;
    tree = formModule.exports.default(item ? { itemId: 'legacy-item' } : {});
  }
  function flushEffects() {
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
  if (!options.deferEffects) {
    flushEffects();
    await new Promise(resolve => setImmediate(resolve));
    render();
  }
  function changeInput(name, value) {
    find(node => node.props?.name === name).props.onChange({ target: { name, value } });
    render();
  }
  return {
    updates,
    creates,
    uploadedFiles,
    previews,
    revoked,
    errors,
    successes,
    pushes,
    replacements,
    Timestamp,
    find,
    flushEffects,
    html: () => renderToStaticMarkup(tree),
    setAuth(next) {
      authState = next;
      render();
    },
    get uploads() { return uploads; },
    changeTitle: value => changeInput('title', value),
    changeInput,
    addPhotos(files) {
      const target = { files, value: 'selected' };
      find(node => node.props?.type === 'file').props.onChange({ target });
      render();
      return target;
    },
    removePhoto(number) {
      find(node => node.props?.['aria-label'] === `Remove photo ${number}`).props.onClick();
      render();
    },
    changeClassification(values) {
      find(node => node.type === ListingCategoryFields).props.onChange(values);
      render();
    },
    async submit() {
      await find(node => node.type === 'form').props.onSubmit({ preventDefault() {} });
      render();
    },
  };
}

const renderEditForm = item => renderItemForm({ item });

function fillCreateForm(form) {
  const parent = taxonomy.CATEGORIES[1];
  form.changeTitle('Coffee table');
  form.changeInput('price', '12.50');
  form.changeClassification({
    category: parent.id, subcategory: parent.subcategories[0].id, itemType: '',
  });
}

test('create auth gates the form while loading and redirects signed-out users only after effects', async () => {
  const form = await renderItemForm({
    auth: { user: null, loading: true }, deferEffects: true,
  });
  assert.equal(form.find(node => node.type === 'form'), undefined);
  assert.match(form.html(), /min-h-screen/);
  assert.deepEqual(form.replacements, []);
  form.flushEffects();
  assert.deepEqual(form.replacements, []);

  form.setAuth({ user: null, loading: false });
  assert.equal(form.html(), '');
  assert.deepEqual(form.replacements, []);
  form.flushEffects();
  assert.deepEqual(form.replacements, ['/auth/login']);
  assert.deepEqual(form.pushes, []);
  assert.equal(form.uploads, 0);
  assert.equal(form.creates.length, 0);

  form.setAuth({ user: { id: 'owner', location: 'Town' }, loading: false });
  form.flushEffects();
  assert.ok(form.find(node => node.type === 'form'));
});

test('create HTML retains required title/price and image picker hints with required taxonomy', async () => {
  const form = await renderItemForm();
  const html = form.html();
  assert.match(html, /name="title" required=""/);
  assert.match(html, /name="price" required="" step="0.01"/);
  assert.match(html, /name="category" required=""/);
  assert.match(html, /name="subcategory" required=""/);
  assert.match(html, /type="file" multiple="" accept="image\/\*"/);
  assert.match(html, /PNG, JPG up to 10MB each/);
  assert.equal(form.find(node => node.props?.name === 'condition').props.value, 'good');
});

test('create requires title and price before uploading photos or writing', async () => {
  for (const missing of ['title', 'price']) {
    const form = await renderItemForm();
    fillCreateForm(form);
    form.changeInput(missing, '');
    form.addPhotos([{ name: 'photo.jpg' }]);
    await form.submit();
    assert.deepEqual(form.errors, ['Please fill in all required fields']);
    assert.equal(form.uploads, 0);
    assert.equal(form.creates.length, 0);
    assert.deepEqual(form.successes, []);
    assert.deepEqual(form.pushes, []);
    assert.equal(form.find(node => node.type === 'fieldset').props.disabled, false);
  }
});

test('create intentionally validates category and subcategory before uploads or writes', async () => {
  const parent = taxonomy.CATEGORIES[1];
  const cases = [
    { category: '', subcategory: '' },
    { category: parent.id, subcategory: '' },
    { category: 'Unknown legacy category', subcategory: '' },
    { category: parent.id, subcategory: 'Unknown legacy child' },
    { category: parent.id, subcategory: taxonomy.CATEGORIES[2].subcategories[0].id },
  ];
  for (const values of cases) {
    const form = await renderItemForm();
    fillCreateForm(form);
    form.changeClassification({ ...values, itemType: '' });
    form.addPhotos([{ name: 'photo.jpg' }]);
    await form.submit();
    assert.equal(form.errors.length, 1, JSON.stringify(values));
    assert.match(form.errors[0], /category|subcategory/i);
    assert.equal(form.uploads, 0);
    assert.equal(form.creates.length, 0);
    assert.deepEqual(form.successes, []);
    assert.deepEqual(form.pushes, []);
  }
});

test('create photo limit is cumulative, rejects a whole excess selection, and allows replacement after removal', async () => {
  const form = await renderItemForm();
  fillCreateForm(form);
  const files = Array.from({ length: 6 }, (_, index) => ({ name: `photo-${index}.jpg` }));
  assert.equal(form.addPhotos(files.slice(0, 3)).value, '');
  form.addPhotos(files.slice(3));
  assert.equal(form.previews.length, 3);
  assert.equal(form.addPhotos(files.slice(3, 5)).value, '');
  form.addPhotos([files[5]]);
  assert.deepEqual(form.errors, ['Maximum 5 photos allowed', 'Maximum 5 photos allowed']);
  assert.equal(form.previews.length, 5);
  assert.match(form.html(), /5 photo\(s\) selected/);
  form.removePhoto(2);
  assert.deepEqual(form.revoked, ['blob:preview-1']);
  assert.match(form.html(), /4 photo\(s\) selected/);
  form.addPhotos([files[5]]);
  await form.submit();
  assert.deepEqual(form.uploadedFiles, [files[0], files[2], files[3], files[4], files[5]]);
  assert.deepEqual(Array.from(form.creates[0].fields.photoURLs), Array(5).fill('uploaded-photo'));
});

test('create preserves legacy absence of JavaScript MIME and 10MB size enforcement', async () => {
  const form = await renderItemForm();
  fillCreateForm(form);
  const files = [
    { name: 'not-an-image.txt', type: 'text/plain', size: 20 },
    { name: 'large.jpg', type: 'image/jpeg', size: 10 * 1024 * 1024 + 1 },
  ];
  form.addPhotos(files);
  await form.submit();
  assert.deepEqual(form.errors, []);
  assert.deepEqual(form.uploadedFiles, files);
  assert.equal(form.creates.length, 1);
  assert.deepEqual(form.successes, ['Item posted successfully!']);
  assert.deepEqual(form.pushes, ['/dashboard']);
});

test('create writes exact canonical payload, numeric prices, timestamps, and unchanged defaults', async () => {
  const parent = taxonomy.getCategory('Furniture');
  for (const originalPrice of ['', '35.75']) {
    const form = await renderItemForm();
    fillCreateForm(form);
    form.changeClassification({
      category: 'Furniture', subcategory: parent.subcategories[0].label, itemType: '',
    });
    form.changeInput('originalPrice', originalPrice);
    if (originalPrice) {
      form.changeInput('description', 'Solid oak');
      form.changeInput('location', 'Other town');
      form.addPhotos([{ name: 'table.jpg' }]);
    }
    await form.submit();
    assert.deepEqual(form.errors, []);
    assert.equal(form.creates.length, 1);
    assert.equal(form.creates[0].collection, 'items');
    const fields = form.creates[0].fields;
    assert.deepEqual(Object.keys(fields).sort(), [
      'title', 'description', 'category', 'subcategory', 'price', 'originalPrice',
      'condition', 'location', 'photoURLs', 'updatedAt', 'userId', 'createdAt', 'views', 'isSold',
    ].sort());
    assert.equal(fields.title, 'Coffee table');
    assert.equal(fields.description, originalPrice ? 'Solid oak' : '');
    assert.equal(fields.category, parent.id);
    assert.equal(fields.subcategory, parent.subcategories[0].id);
    assert.equal(fields.price, 12.5);
    assert.equal(typeof fields.price, 'number');
    assert.equal(fields.originalPrice, originalPrice ? 35.75 : null);
    assert.equal(fields.condition, 'good');
    assert.equal(fields.location, originalPrice ? 'Other town' : 'Town');
    assert.deepEqual(Array.from(fields.photoURLs), originalPrice ? ['uploaded-photo'] : []);
    assert.ok(fields.createdAt instanceof form.Timestamp);
    assert.ok(fields.updatedAt instanceof form.Timestamp);
    assert.equal(fields.views, 0);
    assert.equal(fields.isSold, false);
    assert.equal(fields.userId, 'owner');
    assert.equal('itemType' in fields, false);
    assert.equal('yardSaleId' in fields, false);
    assert.ok(Object.values(fields).every(value => value !== undefined));
    assert.deepEqual(form.successes, ['Item posted successfully!']);
    assert.deepEqual(form.pushes, ['/dashboard']);
  }
});

test('create upload and write failures show error toast without success or navigation', async () => {
  for (const failure of ['uploadError', 'writeError']) {
    const form = await renderItemForm({ [failure]: new Error(`${failure} failed`) });
    fillCreateForm(form);
    form.addPhotos([{ name: 'photo.jpg' }]);
    await form.submit();
    assert.equal(form.uploads, 1);
    assert.equal(form.creates.length, 0);
    assert.deepEqual(form.errors, [`${failure} failed`]);
    assert.deepEqual(form.successes, []);
    assert.deepEqual(form.pushes, []);
    assert.equal(form.find(node => node.type === 'fieldset').props.disabled, false);
  }
});

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

test('edit patches survive serialization and a second edit without losing legacy taxonomy or sale association', async () => {
  const parent = taxonomy.getCategory('Furniture');
  for (const values of [
    { category: 'Furniture', subcategory: parent.subcategories[0].label },
    { category: parent.id, subcategory: parent.subcategories[0].id },
    { category: 'Furniture', subcategory: 'Unknown child', itemType: 'Unknown type' },
    { category: 'Unknown parent', subcategory: 'Unknown child', itemType: 'Unknown type' },
    { category: 'Furniture' },
  ]) {
    let document = {
      userId: 'owner', title: 'Original', price: 10, condition: 'good',
      photoURLs: ['existing-photo'], yardSaleId: 'existing-event', ...values,
    };
    for (const title of ['First edit', 'Second edit']) {
      const form = await renderEditForm(document);
      form.changeTitle(title);
      await form.submit();
      assert.deepEqual(form.errors, []);
      assert.equal(form.updates.length, 1);
      const patch = form.updates[0];
      for (const [key, value] of Object.entries(patch)) {
        if (value === 'DELETE_FIELD') delete document[key];
        else document[key] = value;
      }
      document = JSON.parse(JSON.stringify(document));
      assert.equal(document.title, title);
      assert.equal(document.category, values.category);
      assert.equal(document.subcategory, values.subcategory);
      assert.equal(document.itemType, values.itemType);
      assert.equal(document.yardSaleId, 'existing-event');
      assert.deepEqual(document.photoURLs, ['existing-photo']);
      assert.equal(form.uploads, 0);
    }
  }
});

test('changed legacy taxonomy patches canonicalize and delete cleared fields across a second edit', async () => {
  const parent = taxonomy.getCategory('Furniture');
  for (const subcategory of ['', parent.subcategories[0].label]) {
    let document = {
      userId: 'owner', title: 'Original', price: 10, condition: 'good',
      category: 'Furniture', subcategory: 'Unknown child', itemType: 'Unknown type',
      yardSaleId: 'existing-event',
    };
    const first = await renderEditForm(document);
    first.changeClassification({ category: 'Furniture', subcategory, itemType: '' });
    await first.submit();
    assert.deepEqual(first.errors, []);
    assert.equal(first.updates.length, 1);
    for (const [key, value] of Object.entries(first.updates[0])) {
      if (value === 'DELETE_FIELD') delete document[key];
      else document[key] = value;
    }
    document = JSON.parse(JSON.stringify(document));
    assert.equal(document.category, parent.id);
    assert.equal(document.subcategory, subcategory ? parent.subcategories[0].id : undefined);
    assert.equal('itemType' in document, false);
    assert.equal(document.yardSaleId, 'existing-event');

    const second = await renderEditForm(document);
    second.changeTitle('Second edit');
    await second.submit();
    assert.deepEqual(second.errors, []);
    assert.equal(second.updates.length, 1);
    const reloaded = JSON.parse(JSON.stringify({ ...document, ...second.updates[0] }));
    assert.equal(reloaded.title, 'Second edit');
    assert.equal(reloaded.category, parent.id);
    assert.equal(reloaded.subcategory, document.subcategory);
    assert.equal('itemType' in reloaded, false);
    assert.equal(reloaded.yardSaleId, 'existing-event');
  }
});
