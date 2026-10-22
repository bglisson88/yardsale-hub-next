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

function slug(value: string): string {
  return value.toLowerCase().replace(/['’]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

function defineCategory(
  id: string,
  label: string,
  children: (string | { label: string; itemTypes: string[] })[],
): Category {
  return {
    id,
    label,
    subcategories: children.map(child => {
      const label = typeof child === 'string' ? child : child.label;
      const childId = `${id}/${slug(label)}`;
      return {
        id: childId,
        label,
        ...(typeof child !== 'string' && {
          itemTypes: child.itemTypes.map(label => ({ id: `${childId}/${slug(label)}`, label })),
        }),
      };
    }),
  };
}

export const CATEGORIES: Category[] = [
  defineCategory('garage-sales-estate-sales-and-events', 'Garage Sales, Estate Sales, and Events', [
    'Yard Sales', 'Garage Sales', 'Estate Sales', 'Multi-Family', 'Neighborhood Sales',
    'Auctions', 'Live Sales', 'Other Events',
  ]),
  defineCategory('women', 'Women', [
    { label: 'Clothing', itemTypes: ['Tops', 'Bottoms', 'Skirts', 'Dresses', 'Activewear', 'Formal Wear', 'Jackets & Winter Wear', "Other Women's Clothing"] },
    { label: 'Shoes', itemTypes: ['Sneakers', 'Sandals & Slides', 'Boots', 'Formal', "Other Women's Shoes"] },
    { label: 'Jewelry', itemTypes: ['Watches', 'Bracelets', 'Rings', 'Necklaces', 'Earrings', "Other Women's Jewelry"] },
    { label: 'Bags', itemTypes: ['Purses', 'Handbags', 'Wristlets', 'Beach Bags', 'Duffel Bags', 'Backpacks', 'Wallets', "Other Women's Bags"] },
    { label: 'Accessories', itemTypes: ['Hair Accessories', 'Hats', 'Belts', 'Sunglasses', "Other Women's Accessories"] },
    { label: 'Beauty Supplies', itemTypes: ['Hair', 'Nails', 'Skin', 'Face', 'Beauty Tools', 'Perfumes', "Other Women's Beauty Supplies"] },
  ]),
  defineCategory('men', 'Men', [
    { label: 'Clothing', itemTypes: ['Shirts', 'Jeans', 'Shorts', 'Activewear', 'Formal Wear', 'Jackets & Winter Wear', "Other Men's Clothing"] },
    { label: 'Shoes', itemTypes: ['Sneakers', 'Sandals & Slides', 'Boots', 'Formal', "Other Men's Shoes"] },
    { label: 'Jewelry', itemTypes: ['Watches', 'Bracelets', 'Rings', 'Necklaces', 'Earrings', "Other Men's Jewelry"] },
    { label: 'Bags', itemTypes: ['Duffel Bags', 'Backpacks', 'Wallets', 'Suitcases', "Other Men's Bags"] },
    { label: 'Accessories', itemTypes: ['Hats', 'Belts', 'Sunglasses', "Other Men's Accessories"] },
    { label: 'Grooming Supplies', itemTypes: ['Hair', 'Skin', 'Face', 'Grooming Tools', 'Colognes', "Other Men's Grooming Supplies"] },
  ]),
  defineCategory('kids-baby', 'Kids & Baby', [
    'Girls Clothing', 'Girls Shoes', 'Boys Clothing', 'Boys Shoes', 'Car Seats',
    'Strollers & Carriers', 'Baby Safety', 'Nursery Furniture', 'Baby Essentials',
    'Maternity', 'Toys', 'Other Kids & Baby',
  ]),
  defineCategory('electronics-and-accessories', 'Electronics', [
    { label: 'Phones & Tablets', itemTypes: ['Cell Phones', 'Tablets', 'E-Readers', 'Landlines', 'Chargers & Cables', 'Phone & Tablet Accessories', 'Other Cell Phones & Tablets'] },
    { label: 'Computers & Accessories', itemTypes: ['Desktop', 'Laptop', 'Gaming PC', 'Monitors', 'Desks & Chairs', 'Computer Accessories', 'Other Computers & Accessories'] },
    { label: 'TVs & Projectors', itemTypes: ['Televisions', 'Projectors', 'Media Players', 'Streaming Devices', 'TV & Projector Accessories', 'Other TVs & Projectors'] },
    { label: 'Audio', itemTypes: ['Home Audio', 'Car Audio', 'Headphones & Earbuds', 'Outdoor Audio', 'Portable Audio', 'Audio Accessories', 'Other Audio'] },
    { label: 'Video Games', itemTypes: ['Consoles', 'Gaming Computers', 'VR', 'Games', 'Retro Gaming', 'Handheld Gaming', 'Video Game Accessories', 'Other Video Games'] },
    { label: 'Wearables', itemTypes: ['Fitness Trackers', 'Smart Rings', 'Smart Glasses', 'Wearable Accessories', 'Other Wearables'] },
    'Other Electronics',
  ]),
  defineCategory('home-garden', 'Home & Garden', [
    'Indoor Furniture', 'Outdoor Furniture', 'Decorations & Accessories', 'Bedding',
    'Linens', 'Tools', 'Gas Powered Lawn Equipment', 'Battery Powered Lawn Equipment',
    'Lawn Tools', 'Seasonal Decorations & Items', 'Office',
  ]),
  defineCategory('books-media', 'Books & Media', [
    { label: 'Reading', itemTypes: ['Fiction', 'Nonfiction', "Children's Books", 'Comics & Graphic Novels', 'Magazines'] },
    { label: 'Music', itemTypes: ['Record Players & Records', 'CDs', 'Cassettes', '8-Track'] },
    { label: 'Video', itemTypes: ['DVDs & DVD Players', 'Blu-ray & Blu-ray Players', 'VCRs & VHS Tapes'] },
  ]),
  defineCategory('sports-outdoors', 'Sports & Outdoors', [
    { label: 'Team Sports', itemTypes: ['Baseball', 'Football', 'Basketball', 'Track & Field', 'Hockey', 'Soccer', 'Other Team Sports'] },
    'Racket Sports', 'Hunting', 'Fishing', 'Camping', 'Health & Fitness',
    'Sports on Wheels', 'Water Sports',
  ]),
  defineCategory('more', 'More', ['Pet Supplies', 'Vehicles', 'Boats', 'Motorcycles', 'General']),
];

// Retain historical IDs and children for saved URLs and existing listings, not the header.
const LEGACY_CATEGORIES: Category[] = [
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
  // Historical free-text aliases keep their original meaning; new links use canonical IDs.
  if (LEGACY_ALIASES[key]) return LEGACY_ALIASES[key];
  return [...CATEGORIES, ...LEGACY_CATEGORIES].find(
    category => category.id === key || category.label.toLowerCase() === key,
  )?.id ?? value;
}

export function getCategory(value: string): Category | undefined {
  const id = normalizeCategory(value);
  return [...CATEGORIES, ...LEGACY_CATEGORIES].find(category => category.id === id);
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

export function categoryHref(category: string, subcategory?: string, itemType?: string): string {
  const params = new URLSearchParams({ category: normalizeCategory(category) });
  if (subcategory) {
    params.set('subcategory', normalizeSubcategory(category, subcategory));
  }
  if (itemType) {
    params.set('itemType', categoryFields(category, subcategory, itemType).itemType!);
  }
  return `/items?${params.toString()}`;
}
