export const SEARCH_RADII = [5, 10, 25, 50, 100] as const;
export const DEFAULT_RADIUS = 10;
export const isValidZip = (zip: string) => /^\d{5}$/.test(zip);
export const searchRadius = (value: string | null) =>
  SEARCH_RADII.find((radius) => String(radius) === value) ?? DEFAULT_RADIUS;

export interface Coordinates {
  latitude: number;
  longitude: number;
}

export interface SearchLocation {
  location?: string;
  zipCode?: string;
  latitude?: number;
  longitude?: number;
}

export const recordZip = (record: SearchLocation) =>
  record.zipCode || (isValidZip(record.location || '') ? record.location! : '');

export function hasCoordinates(record: SearchLocation): record is SearchLocation & Coordinates {
  return Number.isFinite(record.latitude) && Math.abs(record.latitude!) <= 90 &&
    Number.isFinite(record.longitude) && Math.abs(record.longitude!) <= 180;
}

const zipCache = new Map<string, Promise<Coordinates>>();

export function lookupZip(zip: string): Promise<Coordinates> {
  if (!isValidZip(zip)) return Promise.reject(new Error('Enter a valid 5-digit US ZIP code.'));
  const cached = zipCache.get(zip);
  if (cached) return cached;
  const request = (async () => {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);
    try {
      const response = await fetch(`https://api.zippopotam.us/us/${zip}`, { signal: controller.signal });
      if (response.status === 404) throw new Error(`ZIP code ${zip} was not found.`);
      if (!response.ok) throw new Error('ZIP lookup is unavailable. Please try again.');
      const data = await response.json();
      const place = data.places?.[0];
      const coordinates = {
        latitude: Number.parseFloat(place?.latitude),
        longitude: Number.parseFloat(place?.longitude),
      };
      if (!hasCoordinates(coordinates)) throw new Error('ZIP lookup returned no usable coordinates.');
      return coordinates;
    } catch (error) {
      zipCache.delete(zip);
      if (error instanceof Error && error.name !== 'AbortError' && error.name !== 'TypeError') throw error;
      throw new Error('ZIP lookup is unavailable. Check your connection and try again.');
    } finally {
      clearTimeout(timeout);
    }
  })();
  zipCache.set(zip, request);
  return request;
}

export function distanceMiles(a: Coordinates, b: Coordinates): number {
  const radians = (degrees: number) => degrees * Math.PI / 180;
  const h = Math.sin(radians(b.latitude - a.latitude) / 2) ** 2 +
    Math.cos(radians(a.latitude)) * Math.cos(radians(b.latitude)) *
    Math.sin(radians(b.longitude - a.longitude) / 2) ** 2;
  return 3958.8 * 2 * Math.asin(Math.sqrt(Math.min(1, Math.max(0, h))));
}

export function withinRadius(
  record: SearchLocation, zip: string, origin: Coordinates, radius: number,
  centers: Map<string, Coordinates>,
): boolean {
  const candidateZip = recordZip(record);
  if (candidateZip === zip) return true;
  const coordinates = hasCoordinates(record) ? record : centers.get(candidateZip);
  return !!coordinates && distanceMiles(origin, coordinates) <= radius;
}
