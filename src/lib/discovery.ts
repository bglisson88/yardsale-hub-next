import {
  categoryFields, getCategory, normalizeCategory, normalizeSubcategory,
} from './categories';

export const DISCOVERY_SHORTCUTS = [
  { id: 'fashion', label: 'Fashion & Accessories', href: '/items?discovery=fashion', image: '/category-tiles/fashion.jpg' },
  { id: 'home', label: 'Home & Furniture', href: '/items?discovery=home', image: '/category-tiles/home-furniture.jpg' },
  { id: 'electronics-gaming', label: 'Electronics & Gaming', href: '/items?discovery=electronics-gaming', image: '/category-tiles/electronics-gaming.jpg' },
  { id: 'collectibles-vintage', label: 'Collectibles & Vintage', href: '/items?discovery=collectibles-vintage', image: '/category-tiles/collectibles-vintage.jpg' },
  { id: 'events', label: 'Garage Sales Near Me', href: '/events', image: '/category-tiles/garage-sales.jpg' },
] as const;

export const DISCOVERY_GROUPS: Record<string, { label: string; description: string }> = {
  fashion: {
    label: 'Fashion & Accessories',
    description: 'Clothing, shoes, jewelry, bags, and accessories.',
  },
  home: {
    label: 'Home & Furniture',
    description: 'Furniture, home goods, kitchenware, and outdoor living.',
  },
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
  itemType?: string;
  discovery?: string;
}

interface BrowsableItem {
  title: string;
  location: string;
  category: string;
  subcategory?: string;
  itemType?: string;
  isSold: boolean;
}

function matchesDiscovery(item: BrowsableItem, discovery: string): boolean {
  const category = normalizeCategory(item.category);
  const subcategory = normalizeSubcategory(category, item.subcategory ?? '');
  if (discovery === 'fashion') {
    if (category === 'clothing-shoes-accessories') return true;
    if (category === 'women' || category === 'men') {
      return !subcategory || [
        `${category}/clothing`,
        `${category}/shoes`,
        `${category}/jewelry`,
        `${category}/bags`,
        `${category}/accessories`,
      ].includes(subcategory);
    }
    if (category === 'kids-baby') {
      return [
        'kids-baby/girls-clothing',
        'kids-baby/girls-shoes',
        'kids-baby/boys-clothing',
        'kids-baby/boys-shoes',
        'kids-baby/maternity',
      ].includes(subcategory);
    }
    if (category === 'baby-kids-parenting') {
      return [
        'baby-kids-parenting/baby-clothing',
        'baby-kids-parenting/kids-clothing',
        'baby-kids-parenting/baby-shoes-accessories',
        'baby-kids-parenting/maternity-clothing-accessories',
      ].includes(subcategory);
    }
    return false;
  }
  if (discovery === 'home') {
    return [
      'home-garden',
      'home-furniture-decor',
      'kitchen-dining-specialty-household',
    ].includes(category);
  }
  if (discovery === 'electronics-gaming') {
    return [
      'electronics-and-accessories',
      'electronics-technology',
      'video-games-gaming',
    ].includes(category);
  }
  if (discovery === 'collectibles-vintage') {
    if (category === 'toys-collectibles-memorabilia') return true;
    return [
      'clothing-shoes-accessories/vintage-y2k-fashion',
      'kitchen-dining-specialty-household/vintage-kitchenware',
      'art-handmade-craft-supplies/vintage-craft-supplies',
    ].includes(subcategory);
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
  if (params.itemType) {
    if (!params.category || !params.subcategory || !item.itemType) return false;
    try {
      const selected = categoryFields(params.category, params.subcategory, params.itemType);
      const actual = categoryFields(item.category, item.subcategory, item.itemType);
      if (actual.itemType !== selected.itemType) return false;
    } catch {
      return false;
    }
  }
  return true;
}
