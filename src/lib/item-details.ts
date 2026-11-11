export interface ItemDetails {
  id: string;
  sellerId: string | null;
  title: string;
  price: number | null;
  photos: string[];
  description: string;
  category: string;
  subcategory: string;
  condition: string;
  location: string;
  isSold: boolean;
}

export function validItemId(id: string): boolean {
  return id.trim().length > 0 && !id.includes('/') && id !== '.' && id !== '..'
    && !/^__.*__$/.test(id) && new TextEncoder().encode(id).length <= 1500;
}

export function itemDetails(id: string, data: Record<string, unknown>): ItemDetails {
  const text = (value: unknown) => typeof value === 'string' ? value.trim() : '';
  const photos = Array.isArray(data.photoURLs)
    ? data.photoURLs.filter((value): value is string => {
      if (typeof value !== 'string') return false;
      try {
        return new URL(value).protocol === 'https:';
      } catch {
        return false;
      }
    })
    : [];
  return {
    id,
    sellerId: text(data.userId) || null,
    title: text(data.title) || 'Item listing',
    price: typeof data.price === 'number' && Number.isFinite(data.price) && data.price >= 0
      ? data.price : null,
    photos,
    description: text(data.description),
    category: text(data.category),
    subcategory: text(data.subcategory),
    condition: text(data.condition),
    location: text(data.location),
    isSold: data.isSold === true,
  };
}
