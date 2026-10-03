// Single source of truth for cities and categories. Add new entries here
// (and a matching CITY_CENTERS entry) to expand beyond the local area.
export const CITIES = ['Mid-County', 'Orange', 'Beaumont'] as const;

export type City = (typeof CITIES)[number];

export const CITY_CENTERS: Record<string, { lat: number; lng: number }> = {
  'Mid-County': { lat: 29.9774, lng: -93.9488 }, // Nederland / Port Neches / Groves area
  Orange: { lat: 30.0929, lng: -93.7366 },
  Beaumont: { lat: 30.0802, lng: -94.1266 },
};

export const DEFAULT_MAP_CENTER = { lat: 30.0299, lng: -93.9 };

export const CATEGORIES = [
  'Furniture',
  'Electronics',
  'Tools',
  'Clothing',
  'Sports & Outdoors',
  'Books',
  'Other',
] as const;

export const SUBCATEGORIES: Record<string, string[]> = {
  Furniture: ['Living Room', 'Bedroom', 'Dining Room', 'Office', 'Outdoor/Patio', 'Kitchen'],
  Electronics: ['TVs', 'Computers', 'Phones', 'Audio', 'Gaming', 'Appliances'],
  Tools: ['Power Tools', 'Hand Tools', 'Garden', 'Automotive', 'Ladders'],
  Clothing: ['Men', 'Women', 'Kids', 'Shoes', 'Accessories'],
  'Sports & Outdoors': ['Fitness', 'Camping', 'Fishing', 'Bikes', 'Team Sports'],
  Books: ['Fiction', 'Non-Fiction', 'Kids', 'Textbooks', 'Magazines'],
  Other: ['Toys', 'Collectibles', 'Decor', 'Misc'],
};

export const CONDITIONS = ['new', 'like-new', 'good', 'fair', 'poor'] as const;

export const PRESET_AVATARS = [
  'https://api.dicebear.com/7.x/fun-emoji/svg?seed=Sunny',
  'https://api.dicebear.com/7.x/fun-emoji/svg?seed=Treasure',
  'https://api.dicebear.com/7.x/fun-emoji/svg?seed=Bargain',
  'https://api.dicebear.com/7.x/fun-emoji/svg?seed=Garage',
  'https://api.dicebear.com/7.x/fun-emoji/svg?seed=Picker',
  'https://api.dicebear.com/7.x/fun-emoji/svg?seed=Vintage',
];

export const CATEGORY_ICONS: Record<string, string> = {
  Furniture: '🛋️',
  Electronics: '📺',
  Tools: '🔧',
  Clothing: '👕',
  'Sports & Outdoors': '⚽',
  Books: '📚',
  Other: '🎁',
};
