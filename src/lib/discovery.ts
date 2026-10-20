import {
  categoryHref, getCategory, normalizeCategory, normalizeSubcategory,
} from './categories';

export const DISCOVERY_SHORTCUTS = [
  { id: 'fashion', label: 'Fashion & Accessories', href: categoryHref('Clothing') },
  { id: 'home', label: 'Home & Furniture', href: categoryHref('Furniture') },
  { id: 'electronics-gaming', label: 'Electronics & Gaming', href: '/items?discovery=electronics-gaming' },
  { id: 'collectibles-vintage', label: 'Collectibles & Vintage', href: '/items?discovery=collectibles-vintage' },
  { id: 'events', label: 'Garage Sales Near Me', href: '/events' },
] as const;

export const DISCOVERY_GROUPS: Record<string, { label: string; description: string }> = {
  'electronics-gaming': {
    label: 'Electronics & Gaming',
    description: 'All Electronics & Technology and Video Games & Gaming listings.',
  },
  'collectibles-vintage': {
    label: 'Collectibles & Vintage',
    description: 'All Toys, Collectibles & Memorabilia, plus Vintage & Y2K Fashion, Vintage Kitchenware, and Vintage Craft Supplies.',
  },
};

export interface BrowseParams {
  search?: string;
  location?: string;
  category?: string;
  subcategory?: string;
  discovery?: string;
}

interface BrowsableItem {
  title: string;
  location: string;
  category: string;
  subcategory?: string;
  isSold: boolean;
}

function matchesDiscovery(item: BrowsableItem, discovery: string): boolean {
  const category = normalizeCategory(item.category);
  if (discovery === 'electronics-gaming') {
    return category === 'electronics-technology' || category === 'video-games-gaming';
  }
  if (discovery === 'collectibles-vintage') {
    if (category === 'toys-collectibles-memorabilia') return true;
    const child = normalizeSubcategory(category, item.subcategory ?? '');
    return [
      'clothing-shoes-accessories/vintage-y2k-fashion',
      'kitchen-dining-specialty-household/vintage-kitchenware',
      'art-handmade-craft-supplies/vintage-craft-supplies',
    ].includes(child);
  }
  return false;
}

export function matchesItem(item: BrowsableItem, params: BrowseParams): boolean {
  if (item.isSold) return false;
  if (params.search && !item.title.toLowerCase().includes(params.search.trim().toLowerCase())) return false;
  if (params.location && item.location.trim().toLowerCase() !== params.location.trim().toLowerCase()) return false;
  if (params.discovery && !matchesDiscovery(item, params.discovery)) return false;
  const category = normalizeCategory(item.category);
  if (params.category && category !== normalizeCategory(params.category)) return false;
  if (params.subcategory) {
    const parent = getCategory(params.category || category);
    const child = normalizeSubcategory(parent?.id ?? '', params.subcategory);
    if (!parent?.subcategories.some(candidate => candidate.id === child)) return false;
    if (normalizeSubcategory(category, item.subcategory ?? '') !== child) return false;
  }
  return true;
}
