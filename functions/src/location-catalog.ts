import type { DocumentData } from 'firebase-admin/firestore';

export function validCatalogLocation(data: DocumentData | undefined, display: string): boolean {
  if (!data || ![
    'kind', 'displayName', 'active', 'approvedAliases', 'countryCode', 'regionCode',
  ].every(key => Object.hasOwn(data, key)) || Object.keys(data).length !== 6) return false;
  return ['city', 'state', 'postalCode', 'area'].includes(data.kind) &&
    typeof data.displayName === 'string' &&
    data.displayName.length > 0 &&
    data.displayName.length <= 200 &&
    data.displayName === display &&
    data.active === true &&
    Array.isArray(data.approvedAliases) &&
    typeof data.countryCode === 'string' &&
    /^[A-Z]{2}$/.test(data.countryCode) &&
    typeof data.regionCode === 'string' &&
    data.regionCode.length <= 32;
}
