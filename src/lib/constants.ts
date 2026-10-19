export const DEFAULT_MAP_CENTER = { lat: 39.8283, lng: -98.5795 };

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
