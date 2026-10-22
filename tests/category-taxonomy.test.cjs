const assert = require('node:assert/strict');
const test = require('node:test');
const path = require('node:path');
const { CATEGORIES, categoryFields, categoryHref, getCategory } =
  require(path.join(process.env.CATEGORY_TEST_BUILD, 'categories.js'));
const { matchesItem } = require(path.join(process.env.CATEGORY_TEST_BUILD, 'discovery.js'));

const expected = [
  ['Garage Sales, Estate Sales, and Events', [
    'Yard Sales', 'Garage Sales', 'Estate Sales', 'Multi-Family', 'Neighborhood Sales',
    'Auctions', 'Live Sales', 'Other Events',
  ]],
  ['Women', [
    ['Clothing', "Tops;Bottoms;Skirts;Dresses;Activewear;Formal Wear;Jackets & Winter Wear;Other Women's Clothing"],
    ['Shoes', "Sneakers;Sandals & Slides;Boots;Formal;Other Women's Shoes"],
    ['Jewelry', "Watches;Bracelets;Rings;Necklaces;Earrings;Other Women's Jewelry"],
    ['Bags', "Purses;Handbags;Wristlets;Beach Bags;Duffel Bags;Backpacks;Wallets;Other Women's Bags"],
    ['Accessories', "Hair Accessories;Hats;Belts;Sunglasses;Other Women's Accessories"],
    ['Beauty Supplies', "Hair;Nails;Skin;Face;Beauty Tools;Perfumes;Other Women's Beauty Supplies"],
  ]],
  ['Men', [
    ['Clothing', "Shirts;Jeans;Shorts;Activewear;Formal Wear;Jackets & Winter Wear;Other Men's Clothing"],
    ['Shoes', "Sneakers;Sandals & Slides;Boots;Formal;Other Men's Shoes"],
    ['Jewelry', "Watches;Bracelets;Rings;Necklaces;Earrings;Other Men's Jewelry"],
    ['Bags', "Duffel Bags;Backpacks;Wallets;Suitcases;Other Men's Bags"],
    ['Accessories', "Hats;Belts;Sunglasses;Other Men's Accessories"],
    ['Grooming Supplies', "Hair;Skin;Face;Grooming Tools;Colognes;Other Men's Grooming Supplies"],
  ]],
  ['Kids & Baby', [
    'Girls Clothing', 'Girls Shoes', 'Boys Clothing', 'Boys Shoes', 'Car Seats',
    'Strollers & Carriers', 'Baby Safety', 'Nursery Furniture', 'Baby Essentials',
    'Maternity', 'Toys', 'Other Kids & Baby',
  ]],
  ['Electronics', [
    ['Phones & Tablets', 'Cell Phones;Tablets;E-Readers;Landlines;Chargers & Cables;Phone & Tablet Accessories;Other Cell Phones & Tablets'],
    ['Computers & Accessories', 'Desktop;Laptop;Gaming PC;Monitors;Desks & Chairs;Computer Accessories;Other Computers & Accessories'],
    ['TVs & Projectors', 'Televisions;Projectors;Media Players;Streaming Devices;TV & Projector Accessories;Other TVs & Projectors'],
    ['Audio', 'Home Audio;Car Audio;Headphones & Earbuds;Outdoor Audio;Portable Audio;Audio Accessories;Other Audio'],
    ['Video Games', 'Consoles;Gaming Computers;VR;Games;Retro Gaming;Handheld Gaming;Video Game Accessories;Other Video Games'],
    ['Wearables', 'Fitness Trackers;Smart Rings;Smart Glasses;Wearable Accessories;Other Wearables'],
    'Other Electronics',
  ]],
  ['Home & Garden', [
    'Indoor Furniture', 'Outdoor Furniture', 'Decorations & Accessories', 'Bedding',
    'Linens', 'Tools', 'Gas Powered Lawn Equipment', 'Battery Powered Lawn Equipment',
    'Lawn Tools', 'Seasonal Decorations & Items', 'Office',
  ]],
  ['Books & Media', [
    ['Reading', "Fiction;Nonfiction;Children's Books;Comics & Graphic Novels;Magazines"],
    ['Music', 'Record Players & Records;CDs;Cassettes;8-Track'],
    ['Video', 'DVDs & DVD Players;Blu-ray & Blu-ray Players;VCRs & VHS Tapes'],
  ]],
  ['Sports & Outdoors', [
    ['Team Sports', 'Baseball;Football;Basketball;Track & Field;Hockey;Soccer;Other Team Sports'],
    'Racket Sports', 'Hunting', 'Fishing', 'Camping', 'Health & Fitness', 'Sports on Wheels', 'Water Sports',
  ]],
  ['More', ['Pet Supplies', 'Vehicles', 'Boats', 'Motorcycles', 'General']],
];

test('header taxonomy contains all nine categories in order with exact normalized tiers', () => {
  assert.deepEqual(CATEGORIES.map(parent => [
    parent.label,
    parent.subcategories.map(child => child.itemTypes
      ? [child.label, child.itemTypes.map(type => type.label).join(';')]
      : child.label),
  ]), expected);
  const ids = [];
  for (const parent of CATEGORIES) {
    assert.equal(getCategory(parent.id), parent);
    ids.push(parent.id);
    for (const child of parent.subcategories) {
      ids.push(child.id);
      assert.ok(child.id.startsWith(`${parent.id}/`));
      for (const type of child.itemTypes ?? []) {
        ids.push(type.id);
        assert.ok(type.id.startsWith(`${child.id}/`));
      }
    }
  }
  assert.equal(new Set(ids).size, ids.length);
});

test('every tier-three link round-trips and filters only the selected item type', () => {
  for (const parent of CATEGORIES) {
    for (const child of parent.subcategories) {
      for (const type of child.itemTypes ?? []) {
        const fields = { category: parent.id, subcategory: child.id, itemType: type.id };
        const href = categoryHref(parent.id, child.label, type.label);
        const params = Object.fromEntries(new URL(href, 'https://example.test').searchParams);
        assert.deepEqual(params, fields);
        assert.deepEqual(categoryFields(parent.id, child.label, type.label), fields);
        const item = { title: type.label, location: 'Austin', isSold: false, ...fields };
        assert.equal(matchesItem(item, params), true);
        assert.equal(matchesItem({ ...item, itemType: type.label }, params), true);
        assert.equal(matchesItem({ ...item, itemType: undefined }, params), false);
        assert.equal(matchesItem(item, { ...params, itemType: 'invalid' }), false);
        assert.equal(matchesItem(item, { ...params, subcategory: undefined }), false);
        assert.equal(matchesItem(item, { ...params, category: undefined }), false);
        assert.equal(matchesItem(item, { category: parent.id, subcategory: child.id }), true);
      }
    }
  }
});

test('third-tier routes reject cross-parent and cross-subcategory IDs', () => {
  assert.throws(() => categoryHref('women', 'Clothing', 'men/clothing/shirts'));
  assert.throws(() => categoryHref('women', 'Clothing', 'women/shoes/sneakers'));
  assert.throws(() => categoryHref('women', undefined, 'Tops'));
  assert.throws(() => categoryHref('more', 'General', 'Tops'));
});

test('new electronics are included in electronics and gaming discovery', () => {
  assert.equal(matchesItem({
    title: 'Console', location: 'Austin', isSold: false,
    ...categoryFields(CATEGORIES[4].id, 'Video Games', 'Consoles'),
  }, { discovery: 'electronics-gaming' }), true);
});
