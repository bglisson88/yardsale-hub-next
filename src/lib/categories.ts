export interface ItemType {
  id: string;
  label: string;
}

export interface Subcategory {
  id: string;
  label: string;
  itemTypes?: ItemType[];
}

export interface Category {
  id: string;
  label: string;
  subcategories: Subcategory[];
}

function defineCategory(id: string, label: string, children: string[]): Category {
  return {
    id,
    label,
    subcategories: children.map(child => ({
      id: `${id}/${child.toLowerCase().replace(/['’]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')}`,
      label: child,
    })),
  };
}

export const CATEGORIES: Category[] = [
  defineCategory('clothing-shoes-accessories', 'Clothing, Shoes & Accessories', [
    "Women's Clothing", "Men's Clothing", 'Unisex Clothing', "Kids' Clothing",
    'Vintage & Y2K Fashion', 'Designer & Luxury Fashion', 'Streetwear',
    'Shoes & Sneakers', 'Boots & Sandals', 'Handbags & Purses', 'Jewelry & Watches',
    'Hats, Belts & Accessories', 'Activewear & Athleisure', 'Formalwear & Occasion Wear',
    'Maternity Clothing', 'Clothing Bundles & Lots',
  ]),
  defineCategory('home-furniture-decor', 'Home, Furniture & Decor', [
    'Sofas & Sectionals', 'Tables & Desks', 'Chairs & Seating', 'Beds & Mattresses',
    'Dressers & Storage', 'Shelving & Bookcases', 'Home Decor & Wall Art',
    'Lamps & Lighting', 'Rugs & Curtains', 'Kitchen & Dining', 'Cookware & Bakeware',
    'Bedding & Bath', 'Home Organization', 'Appliances', 'Patio & Outdoor Furniture',
    'Seasonal & Holiday Decor',
  ]),
  defineCategory('electronics-technology', 'Electronics & Technology', [
    'Cell Phones', 'Tablets & E-Readers', 'Computers & Laptops',
    'Computer Parts & Components', 'Monitors & Accessories', 'TVs & Home Theater',
    'Headphones & Earbuds', 'Speakers & Audio Equipment', 'Cameras & Photography',
    'Smartwatches & Wearables', 'Smart Home Devices', 'Cables, Chargers & Accessories',
    'Printers & Scanners', 'Drones', 'Electronic Parts & Accessories',
  ]),
  defineCategory('video-games-gaming', 'Video Games & Gaming', [
    'Gaming Consoles', 'Video Games', 'Controllers & Accessories', 'Gaming PCs',
    'Gaming Laptops', 'Gaming Monitors', 'VR Headsets & Accessories', 'Retro Gaming',
    'Handheld Gaming Devices', 'Gaming Chairs & Desks', 'Collectible Gaming Merchandise',
  ]),
  defineCategory('toys-collectibles-memorabilia', 'Toys, Collectibles & Memorabilia', [
    'Action Figures', 'Dolls & Doll Accessories', 'Trading Cards',
    'Die-Cast Cars & Model Vehicles', 'LEGO & Building Sets', 'Board Games & Puzzles',
    'Stuffed Animals & Plush', 'Comic Books', 'Movie & TV Memorabilia',
    'Sports Memorabilia', 'Coins & Currency', 'Stamps', 'Vintage Toys',
    'Pop Culture Collectibles', 'Collectible Display & Storage',
  ]),
  defineCategory('baby-kids-parenting', 'Baby, Kids & Parenting', [
    'Baby Clothing', "Kids' Clothing", 'Baby Shoes & Accessories', 'Strollers & Carriers',
    'High Chairs & Feeding', 'Cribs & Nursery Furniture',
    'Baby Monitors & Nursery Electronics', 'Toys & Learning Activities', "Kids' Furniture",
    'School Supplies & Backpacks', "Kids' Sports Equipment",
    'Maternity Clothing & Accessories', 'Diaper Bags & Baby Bags', 'Baby Safety Products',
  ]),
  defineCategory('sports-fitness-outdoors', 'Sports, Fitness & Outdoors', [
    'Bicycles & Cycling', 'Golf Equipment', 'Fishing Equipment', 'Camping & Hiking',
    'Fitness Equipment', 'Weights & Home Gym Equipment', 'Team Sports Equipment',
    'Baseball & Softball', 'Basketball', 'Football', 'Soccer', 'Tennis & Racket Sports',
    'Skateboards & Scooters', 'Kayaks & Paddle Sports', 'Outdoor Clothing & Footwear',
    'Sports Apparel & Fan Gear',
  ]),
  defineCategory('tools-diy-home-improvement', 'Tools, DIY & Home Improvement', [
    'Hand Tools', 'Power Tools', 'Tool Sets & Storage', 'Workshop Equipment',
    'Building Materials', 'Lumber & Woodworking', 'Plumbing Supplies',
    'Electrical Supplies', 'Paint & Painting Supplies', 'Flooring & Tile',
    'Doors & Windows', 'Cabinets & Countertops', 'Lighting & Fixtures',
    'Hardware & Fasteners', 'Home Improvement Supplies',
  ]),
  defineCategory('lawn-garden-outdoor-living', 'Lawn, Garden & Outdoor Living', [
    'Lawn Mowers', 'Yard & Garden Tools', 'Trimmers & Leaf Blowers', 'Gardening Supplies',
    'Planters & Pots', 'Plants & Gardening Accessories', 'Outdoor Decor',
    'Grills & Outdoor Cooking', 'Patio Furniture', 'Pool & Spa Accessories',
    'Fencing & Outdoor Structures', 'Pressure Washers', 'Outdoor Storage',
    'Greenhouse & Gardening Equipment',
  ]),
  defineCategory('vehicles-parts-transportation', 'Vehicles, Parts & Transportation', [
    'Cars & Trucks', 'Motorcycles', 'ATVs & Powersports', 'Bicycles & E-Bikes',
    'Boats & Marine', 'Trailers', 'RVs & Campers', 'Auto Parts', 'Tires & Wheels',
    'Car Electronics', 'Interior Accessories', 'Exterior Accessories',
    'Truck Accessories', 'Motorcycle Parts & Accessories', 'Vehicle Maintenance Supplies',
  ]),
  defineCategory('books-music-media', 'Books, Music & Media', [
    'Fiction & Literature', 'Nonfiction', 'Textbooks & Educational Books',
    "Children's Books", 'Comics & Graphic Novels', 'Magazines', 'Vinyl Records',
    'CDs', 'DVDs & Blu-rays', 'Musical Instruments', 'Guitars & Amps',
    'Keyboards & Pianos', 'Recording & Studio Equipment', 'DJ Equipment', 'Sheet Music',
  ]),
  defineCategory('art-handmade-craft-supplies', 'Art, Handmade & Craft Supplies', [
    'Original Artwork', 'Paintings & Drawings', 'Prints & Posters', 'Photography',
    'Sculptures & Pottery', 'Handmade Items', 'Sewing & Fabric', 'Yarn & Knitting',
    'Beading & Jewelry-Making Supplies', 'Scrapbooking', 'Painting & Drawing Supplies',
    'Woodworking Crafts', 'DIY Craft Kits', 'Vintage Craft Supplies',
  ]),
  defineCategory('kitchen-dining-specialty-household', 'Kitchen, Dining & Specialty Household', [
    'Plates, Bowls & Dinnerware', 'Glassware & Drinkware', 'Silverware & Flatware',
    'Coffee & Tea Accessories', 'Small Kitchen Appliances', 'Storage Containers',
    'Vintage Kitchenware', 'Barware & Serving Accessories', 'Cookbooks', 'Table Linens',
    'Baking Supplies', 'Kitchen Gadgets',
  ]),
  defineCategory('beauty-personal-care-accessories', 'Beauty, Personal Care & Accessories', [
    'Makeup & Cosmetics', 'Skincare', 'Hair Styling Tools', 'Hair Accessories',
    'Beauty Tools', 'Fragrance', 'Nail Art Supplies', 'Grooming Accessories',
    'Cosmetic Bags & Organizers', 'Mirrors & Vanity Accessories',
  ]),
  defineCategory('garage-sales-bundles-local-finds', 'Garage Sales, Bundles & Local Finds', [
    'Upcoming Garage Sales', 'Estate Sales', 'Moving Sales', 'Multi-Family Yard Sales',
    'Community & Neighborhood Sales', 'Flea Market Finds', 'Thrift & Resale Shop Finds',
    'Bulk Lots & Bundles', 'Free Items', 'Curb Alerts', 'Moving Clearance',
    'Miscellaneous Household Items',
  ]),
];

const LEGACY_ALIASES: Record<string, string> = {
  furniture: 'home-furniture-decor',
  'home & furniture': 'home-furniture-decor',
  home: 'home-furniture-decor',
  electronics: 'electronics-technology',
  tools: 'tools-diy-home-improvement',
  clothing: 'clothing-shoes-accessories',
  'clothing & accessories': 'clothing-shoes-accessories',
  other: 'garage-sales-bundles-local-finds',
  misc: 'garage-sales-bundles-local-finds',
  miscellaneous: 'garage-sales-bundles-local-finds',
  sports: 'sports-fitness-outdoors',
  'sports & outdoors': 'sports-fitness-outdoors',
  books: 'books-music-media',
  'books & media': 'books-music-media',
  toys: 'toys-collectibles-memorabilia',
  'toys & games': 'toys-collectibles-memorabilia',
  vehicles: 'vehicles-parts-transportation',
};

export function normalizeCategory(value: string): string {
  const key = value.trim().toLowerCase();
  return CATEGORIES.find(
    category => category.id === key || category.label.toLowerCase() === key,
  )?.id ?? LEGACY_ALIASES[key] ?? value;
}

export function getCategory(value: string): Category | undefined {
  const id = normalizeCategory(value);
  return CATEGORIES.find(category => category.id === id);
}

export function categoryLabel(value: string): string {
  return getCategory(value)?.label ?? value;
}

export function normalizeSubcategory(category: string, value: string): string {
  return getCategory(category)?.subcategories.find(
    child => child.id === value || child.label === value,
  )?.id ?? value;
}

export function subcategoryLabel(category: string, subcategory?: string): string {
  if (!subcategory) return '';
  const id = normalizeSubcategory(category, subcategory);
  return getCategory(category)?.subcategories.find(child => child.id === id)?.label
    ?? subcategory;
}

export function categoryFields(
  category: string,
  subcategory?: string,
  itemType?: string,
): { category: string; subcategory?: string; itemType?: string } {
  if (!category.trim()) throw new Error('A category is required.');
  const parent = getCategory(category);
  const fields: { category: string; subcategory?: string; itemType?: string } = {
    category: normalizeCategory(category),
  };
  if (!subcategory && !itemType) return fields;
  if (!parent) throw new Error('Invalid category.');
  if (!subcategory) throw new Error('An item type requires a subcategory.');
  const id = normalizeSubcategory(parent.id, subcategory);
  const child = parent.subcategories.find(candidate => candidate.id === id);
  if (!child) throw new Error('Invalid subcategory for this category.');
  fields.subcategory = child.id;
  if (itemType) {
    const type = child.itemTypes?.find(
      candidate => candidate.id === itemType || candidate.label === itemType,
    );
    if (!type) throw new Error('Invalid item type for this subcategory.');
    fields.itemType = type.id;
  }
  return fields;
}

export function categoryHref(category: string, subcategory?: string): string {
  const params = new URLSearchParams({ category: normalizeCategory(category) });
  if (subcategory) {
    params.set('subcategory', normalizeSubcategory(category, subcategory));
  }
  return `/items?${params.toString()}`;
}
