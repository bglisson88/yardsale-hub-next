const assert = require('node:assert/strict');
const test = require('node:test');
const path = require('node:path');
const { matchesItem, DISCOVERY_SHORTCUTS } =
  require(path.join(process.env.CATEGORY_TEST_BUILD, 'discovery.js'));
const { categoryHref, normalizeCategory } =
  require(path.join(process.env.CATEGORY_TEST_BUILD, 'categories.js'));

const item = (category, extra = {}) => ({
  title: 'Vintage camera kit',
  location: 'Austin',
  category,
  isSold: false,
  ...extra,
});
const browseParams = href =>
  Object.fromEntries(new URL(href, 'https://example.test').searchParams);

test('electronics discovery spans electronics and gaming, including legacy electronics', () => {
  const params = browseParams(DISCOVERY_SHORTCUTS.find(
    shortcut => shortcut.id === 'electronics-gaming',
  ).href);
  for (const category of [
    'electronics-technology', 'Electronics', 'video-games-gaming', 'Video Games & Gaming',
  ]) {
    assert.equal(matchesItem(item(category), params), true);
  }
  assert.equal(matchesItem(item('Furniture'), params), false);
  assert.equal(matchesItem(item('Unknown'), params), false);
});

test('collectibles discovery includes all collectibles and the three cross-parent vintage children', () => {
  const params = browseParams(DISCOVERY_SHORTCUTS.find(
    shortcut => shortcut.id === 'collectibles-vintage',
  ).href);
  assert.equal(matchesItem(item('toys-collectibles-memorabilia'), params), true);
  assert.equal(matchesItem(item('Toys'), params), true);
  for (const [category, subcategory, scoped] of [
    ['Clothing', 'Vintage & Y2K Fashion', 'clothing-shoes-accessories/vintage-y2k-fashion'],
    ['kitchen-dining-specialty-household', 'Vintage Kitchenware', 'kitchen-dining-specialty-household/vintage-kitchenware'],
    ['art-handmade-craft-supplies', 'Vintage Craft Supplies', 'art-handmade-craft-supplies/vintage-craft-supplies'],
  ]) {
    assert.equal(matchesItem(item(category, { subcategory }), params), true);
    assert.equal(matchesItem(item(category, { subcategory: scoped }), params), true);
    assert.equal(matchesItem(item(category), params), false);
  }
  assert.equal(matchesItem(item('Clothing', { subcategory: "Women's Clothing" }), params), false);
  assert.equal(matchesItem(item('Furniture'), params), false);
});

test('legacy parent-only listings remain discoverable without acquiring arbitrary children', () => {
  assert.equal(matchesItem(item('Furniture'), { category: 'home-furniture-decor' }), true);
  assert.equal(matchesItem(item('home-furniture-decor'), { category: 'Furniture' }), true);
  assert.equal(matchesItem(item('Furniture'), {
    category: 'Furniture', subcategory: 'Sofas & Sectionals',
  }), false);
  assert.equal(matchesItem(item('Other'), {
    category: 'garage-sales-bundles-local-finds',
  }), true);
  assert.equal(matchesItem(item('Misc'), {
    category: 'Other', subcategory: 'Miscellaneous Household Items',
  }), false);
});

test('title, exact location, category, and discovery filters form a conjunction', () => {
  const listing = item('Electronics');
  const params = {
    search: ' CAMERA ', location: ' aUsTiN ', category: 'Electronics & Technology',
    discovery: 'electronics-gaming',
  };
  assert.equal(matchesItem(listing, params), true);
  assert.equal(matchesItem(listing, { ...params, search: 'sofa' }), false);
  assert.equal(matchesItem(listing, { ...params, location: 'Dallas' }), false);
  assert.equal(matchesItem(listing, { ...params, location: 'Aust' }), false);
  assert.equal(matchesItem(listing, { ...params, category: 'Furniture' }), false);
  assert.equal(matchesItem(listing, { ...params, discovery: 'collectibles-vintage' }), false);
  assert.equal(matchesItem(listing, { discovery: 'unknown-group' }), false);
});

test('categoryHref direct URLs filter valid parent/child pairs and reject mismatches', () => {
  const params = browseParams(categoryHref('Clothing', 'Vintage & Y2K Fashion'));
  assert.deepEqual(params, {
    category: 'clothing-shoes-accessories',
    subcategory: 'clothing-shoes-accessories/vintage-y2k-fashion',
  });
  assert.equal(matchesItem(item('Clothing', {
    subcategory: 'Vintage & Y2K Fashion',
  }), params), true);
  assert.equal(matchesItem(item('clothing-shoes-accessories', {
    subcategory: params.subcategory,
  }), params), true);
  assert.equal(matchesItem(item('Clothing'), params), false);
  assert.equal(matchesItem(item('Furniture', {
    subcategory: 'Sofas & Sectionals',
  }), params), false);
  assert.equal(matchesItem(item('Clothing', {
    subcategory: 'Vintage & Y2K Fashion',
  }), {
    category: 'Clothing', subcategory: 'home-furniture-decor/sofas-sectionals',
  }), false);
  assert.equal(matchesItem(item('Clothing'), {
    category: 'Clothing', subcategory: 'nonexistent-child',
  }), false);
});

test('sold listings never match, with or without other filters', () => {
  const listing = item('Electronics', { isSold: true });
  assert.equal(matchesItem(listing, {}), false);
  assert.equal(matchesItem(listing, { category: 'Electronics' }), false);
  assert.equal(matchesItem(listing, { discovery: 'electronics-gaming' }), false);
});

test('unknown legacy categories stay intact, support exact parent filters, and reject children', () => {
  const raw = 'Unknown legacy / category & raw';
  const listing = item(raw);
  assert.equal(normalizeCategory(raw), raw);
  assert.equal(matchesItem(listing, {}), true);
  assert.equal(matchesItem(listing, browseParams(categoryHref(raw))), true);
  assert.equal(matchesItem(listing, { category: 'Other' }), false);
  assert.equal(matchesItem(listing, { category: raw, subcategory: 'arbitrary' }), false);
  assert.equal(listing.category, raw);
});

test('yardSaleId associations neither affect discovery nor get mutated', () => {
  const standalone = item('Electronics');
  const associated = { ...standalone, yardSaleId: 'yard-sale-1' };
  const snapshot = JSON.stringify(associated);
  for (const params of [
    {}, { category: 'Electronics' }, { discovery: 'electronics-gaming' },
    { search: 'camera', location: 'Austin' }, { category: 'Furniture' },
  ]) {
    assert.equal(matchesItem(standalone, params), matchesItem(associated, params));
  }
  assert.equal(JSON.stringify(associated), snapshot);
  assert.equal(JSON.parse(snapshot).yardSaleId, 'yard-sale-1');
});
