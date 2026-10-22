const assert = require('node:assert/strict');
const test = require('node:test');
const path = require('node:path');
const {
  CATEGORIES, normalizeCategory, getCategory, categoryLabel, subcategoryLabel,
  normalizeSubcategory, categoryFields, categoryHref,
} = require(path.join(process.env.CATEGORY_TEST_BUILD, 'categories.js'));

const expected = [
  ['clothing-shoes-accessories', 'Clothing, Shoes & Accessories', "Women's Clothing;Men's Clothing;Unisex Clothing;Kids' Clothing;Vintage & Y2K Fashion;Designer & Luxury Fashion;Streetwear;Shoes & Sneakers;Boots & Sandals;Handbags & Purses;Jewelry & Watches;Hats, Belts & Accessories;Activewear & Athleisure;Formalwear & Occasion Wear;Maternity Clothing;Clothing Bundles & Lots"],
  ['home-furniture-decor', 'Home, Furniture & Decor', 'Sofas & Sectionals;Tables & Desks;Chairs & Seating;Beds & Mattresses;Dressers & Storage;Shelving & Bookcases;Home Decor & Wall Art;Lamps & Lighting;Rugs & Curtains;Kitchen & Dining;Cookware & Bakeware;Bedding & Bath;Home Organization;Appliances;Patio & Outdoor Furniture;Seasonal & Holiday Decor'],
  ['electronics-technology', 'Electronics & Technology', 'Cell Phones;Tablets & E-Readers;Computers & Laptops;Computer Parts & Components;Monitors & Accessories;TVs & Home Theater;Headphones & Earbuds;Speakers & Audio Equipment;Cameras & Photography;Smartwatches & Wearables;Smart Home Devices;Cables, Chargers & Accessories;Printers & Scanners;Drones;Electronic Parts & Accessories'],
  ['video-games-gaming', 'Video Games & Gaming', 'Gaming Consoles;Video Games;Controllers & Accessories;Gaming PCs;Gaming Laptops;Gaming Monitors;VR Headsets & Accessories;Retro Gaming;Handheld Gaming Devices;Gaming Chairs & Desks;Collectible Gaming Merchandise'],
  ['toys-collectibles-memorabilia', 'Toys, Collectibles & Memorabilia', 'Action Figures;Dolls & Doll Accessories;Trading Cards;Die-Cast Cars & Model Vehicles;LEGO & Building Sets;Board Games & Puzzles;Stuffed Animals & Plush;Comic Books;Movie & TV Memorabilia;Sports Memorabilia;Coins & Currency;Stamps;Vintage Toys;Pop Culture Collectibles;Collectible Display & Storage'],
  ['baby-kids-parenting', 'Baby, Kids & Parenting', "Baby Clothing;Kids' Clothing;Baby Shoes & Accessories;Strollers & Carriers;High Chairs & Feeding;Cribs & Nursery Furniture;Baby Monitors & Nursery Electronics;Toys & Learning Activities;Kids' Furniture;School Supplies & Backpacks;Kids' Sports Equipment;Maternity Clothing & Accessories;Diaper Bags & Baby Bags;Baby Safety Products"],
  ['sports-fitness-outdoors', 'Sports, Fitness & Outdoors', 'Bicycles & Cycling;Golf Equipment;Fishing Equipment;Camping & Hiking;Fitness Equipment;Weights & Home Gym Equipment;Team Sports Equipment;Baseball & Softball;Basketball;Football;Soccer;Tennis & Racket Sports;Skateboards & Scooters;Kayaks & Paddle Sports;Outdoor Clothing & Footwear;Sports Apparel & Fan Gear'],
  ['tools-diy-home-improvement', 'Tools, DIY & Home Improvement', 'Hand Tools;Power Tools;Tool Sets & Storage;Workshop Equipment;Building Materials;Lumber & Woodworking;Plumbing Supplies;Electrical Supplies;Paint & Painting Supplies;Flooring & Tile;Doors & Windows;Cabinets & Countertops;Lighting & Fixtures;Hardware & Fasteners;Home Improvement Supplies'],
  ['lawn-garden-outdoor-living', 'Lawn, Garden & Outdoor Living', 'Lawn Mowers;Yard & Garden Tools;Trimmers & Leaf Blowers;Gardening Supplies;Planters & Pots;Plants & Gardening Accessories;Outdoor Decor;Grills & Outdoor Cooking;Patio Furniture;Pool & Spa Accessories;Fencing & Outdoor Structures;Pressure Washers;Outdoor Storage;Greenhouse & Gardening Equipment'],
  ['vehicles-parts-transportation', 'Vehicles, Parts & Transportation', 'Cars & Trucks;Motorcycles;ATVs & Powersports;Bicycles & E-Bikes;Boats & Marine;Trailers;RVs & Campers;Auto Parts;Tires & Wheels;Car Electronics;Interior Accessories;Exterior Accessories;Truck Accessories;Motorcycle Parts & Accessories;Vehicle Maintenance Supplies'],
  ['books-music-media', 'Books, Music & Media', "Fiction & Literature;Nonfiction;Textbooks & Educational Books;Children's Books;Comics & Graphic Novels;Magazines;Vinyl Records;CDs;DVDs & Blu-rays;Musical Instruments;Guitars & Amps;Keyboards & Pianos;Recording & Studio Equipment;DJ Equipment;Sheet Music"],
  ['art-handmade-craft-supplies', 'Art, Handmade & Craft Supplies', 'Original Artwork;Paintings & Drawings;Prints & Posters;Photography;Sculptures & Pottery;Handmade Items;Sewing & Fabric;Yarn & Knitting;Beading & Jewelry-Making Supplies;Scrapbooking;Painting & Drawing Supplies;Woodworking Crafts;DIY Craft Kits;Vintage Craft Supplies'],
  ['kitchen-dining-specialty-household', 'Kitchen, Dining & Specialty Household', 'Plates, Bowls & Dinnerware;Glassware & Drinkware;Silverware & Flatware;Coffee & Tea Accessories;Small Kitchen Appliances;Storage Containers;Vintage Kitchenware;Barware & Serving Accessories;Cookbooks;Table Linens;Baking Supplies;Kitchen Gadgets'],
  ['beauty-personal-care-accessories', 'Beauty, Personal Care & Accessories', 'Makeup & Cosmetics;Skincare;Hair Styling Tools;Hair Accessories;Beauty Tools;Fragrance;Nail Art Supplies;Grooming Accessories;Cosmetic Bags & Organizers;Mirrors & Vanity Accessories'],
  ['garage-sales-bundles-local-finds', 'Garage Sales, Bundles & Local Finds', 'Upcoming Garage Sales;Estate Sales;Moving Sales;Multi-Family Yard Sales;Community & Neighborhood Sales;Flea Market Finds;Thrift & Resale Shop Finds;Bulk Lots & Bundles;Free Items;Curb Alerts;Moving Clearance;Miscellaneous Household Items'],
];

test('historical parents and children retain stable IDs for saved URLs and listings', () => {
  const legacy = expected.map(([id]) => getCategory(id));
  assert.deepEqual(legacy.map(({ id, label, subcategories }) =>
    [id, label, subcategories.map(child => child.label).join(';')]), expected);
  assert.deepEqual(legacy.map(category => category.subcategories.length),
    [16, 16, 15, 11, 15, 14, 16, 15, 14, 15, 15, 14, 12, 10, 12]);
  const ids = legacy.flatMap(category => [
    category.id, ...category.subcategories.map(child => child.id),
  ]);
  assert.equal(ids.length, 225);
  assert.equal(new Set(ids).size, ids.length);
  for (const parent of legacy) {
    for (const child of parent.subcategories) {
      const slug = child.label.toLowerCase().replace(/['’]/g, '')
        .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
      assert.equal(child.id, `${parent.id}/${slug}`);
      assert.equal(child.itemTypes, undefined);
    }
  }
});

test('legacy parents and exact modern labels normalize without fabricating children', () => {
  const aliases = {
    Furniture: 1, Electronics: 2, Tools: 7, Clothing: 0, Other: 14,
    Sports: 6, 'Sports & Outdoors': 6, Books: 10, Home: 1, Toys: 4,
    Vehicles: 9, Misc: 14, 'Toys & Games': 4, 'Books & Media': 10,
    'Clothing & Accessories': 0, 'Home & Furniture': 1, Miscellaneous: 14,
  };
  for (const [alias, index] of Object.entries(aliases)) {
    const parent = getCategory(expected[index][0]);
    assert.equal(normalizeCategory(alias), parent.id);
    assert.equal(getCategory(alias), parent);
    assert.equal(categoryLabel(alias), parent.label);
    assert.deepEqual(categoryFields(alias), { category: parent.id });
  }
  for (const parent of expected.map(([id]) => getCategory(id))) {
    assert.equal(normalizeCategory(parent.id), parent.id);
    assert.equal(normalizeCategory(parent.label), parent.id);
  }
  const raw = '  Unknown legacy category!  ';
  assert.equal(normalizeCategory(raw), raw);
  assert.equal(categoryLabel(raw), raw);
  assert.equal(getCategory(raw), undefined);
  assert.deepEqual(categoryFields(raw), { category: raw });
});

test('child normalization and display require the correct parent', () => {
  for (const parent of CATEGORIES) {
    for (const child of parent.subcategories) {
      assert.equal(normalizeSubcategory(parent.id, child.label), child.id);
      assert.equal(normalizeSubcategory(parent.label, child.id), child.id);
      assert.equal(subcategoryLabel(parent.id, child.id), child.label);
      assert.equal(subcategoryLabel(parent.id, child.label), child.label);
      assert.deepEqual(categoryFields(parent.id, child.label), {
        category: parent.id, subcategory: child.id,
      });
    }
  }
  assert.equal(subcategoryLabel('Furniture'), '');
  assert.equal(subcategoryLabel('Furniture', 'unknown-child'), 'unknown-child');
  assert.equal(normalizeSubcategory('Furniture', 'Cell Phones'), 'Cell Phones');
  assert.throws(() => categoryFields('Furniture', 'Cell Phones'));
  assert.throws(() => categoryFields('Furniture', CATEGORIES[2].subcategories[0].id));
  assert.throws(() => categoryFields('unknown-parent', 'Cell Phones'));
  assert.throws(() => categoryFields('unknown-parent', undefined, 'unknown-type'));
  assert.throws(() => categoryFields(''));
  assert.throws(() => categoryFields('   '));
});

test('item types remain optional and validate against their selected child', () => {
  const parent = getCategory('Clothing');
  const child = parent.subcategories[0];
  assert.throws(() => categoryFields(parent.id, undefined, 'type'));
  assert.throws(() => categoryFields(parent.id, child.id, 'type'));
  const type = { id: `${child.id}/test-type`, label: 'Test Type' };
  child.itemTypes = [type];
  try {
    for (const input of [type.id, type.label]) {
      assert.deepEqual(categoryFields(parent.id, child.id, input), {
        category: parent.id, subcategory: child.id, itemType: type.id,
      });
    }
    assert.throws(() => categoryFields(parent.id, parent.subcategories[1].id, type.id));
    assert.throws(() => categoryFields(parent.id, child.id, 'wrong-type'));
  } finally {
    delete child.itemTypes;
  }
});

test('serialization omits absent fields and preserves item/yard-sale associations', () => {
  for (const fields of [
    categoryFields('Other'),
    categoryFields('Furniture', '', ''),
    categoryFields('unknown legacy category'),
    categoryFields('Furniture', 'Sofas & Sectionals'),
  ]) {
    assert.ok(Object.values(fields).every(value => value !== undefined));
    const item = { id: 'item-1', yardSaleId: 'yard-sale-1', ...fields };
    assert.deepEqual(JSON.parse(JSON.stringify(item)), item);
    assert.equal(JSON.parse(JSON.stringify(item)).yardSaleId, 'yard-sale-1');
  }
});

test('links use canonical scoped categories and URLSearchParams encoding', () => {
  const parent = getCategory('Clothing');
  const child = parent.subcategories[0];
  assert.equal(categoryHref('Clothing', child.label),
    `/items?${new URLSearchParams({ category: parent.id, subcategory: child.id })}`);
  assert.equal(categoryHref('Other'),
    '/items?category=garage-sales-bundles-local-finds');
  const raw = 'unknown & legacy';
  assert.equal(new URL(categoryHref(raw), 'https://example.test').searchParams.get('category'), raw);
});
