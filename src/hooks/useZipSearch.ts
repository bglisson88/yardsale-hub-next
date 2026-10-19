'use client';

import { useEffect, useState } from 'react';
import {
  Coordinates, SearchLocation, hasCoordinates, lookupZip, recordZip, withinRadius,
} from '@/lib/location';

export function useZipSearch<T extends SearchLocation>(records: T[], zip: string, radius: number) {
  const [attempt, setAttempt] = useState(0);
  const [result, setResult] = useState<{
    records: T[]; zip: string; radius: number; source: T[]; error: string; warning: string;
  } | null>(null);

  useEffect(() => {
    if (!zip) return;
    let cancelled = false;
    (async () => {
      try {
        const origin = await lookupZip(zip);
        const centers = new Map<string, Coordinates>();
        const zips = Array.from(new Set(records.filter((record) => !hasCoordinates(record)).map(recordZip)))
          .filter((value) => value && value !== zip);
        let failed = false;
        for (let i = 0; i < zips.length; i += 5) {
          if (cancelled) return;
          await Promise.all(zips.slice(i, i + 5).map(async (value) => {
            try { centers.set(value, await lookupZip(value)); }
            catch { failed = true; }
          }));
        }
        const missing = records.some((record) => !recordZip(record) && !hasCoordinates(record));
        if (!cancelled) setResult({
          records: records.filter((record) => withinRadius(record, zip, origin, radius, centers)),
          zip, radius, source: records, error: '',
          warning: [
            'Distances use ZIP-area centers; matches in the same ZIP are included.',
            missing ? 'Older posts without a ZIP or coordinates are excluded from location searches.' : '',
            failed ? 'Some ZIP lookups failed, so nearby results may be incomplete. Try searching again.' : '',
          ].filter(Boolean).join(' '),
        });
      } catch (error) {
        if (!cancelled) setResult({
          records: [], zip, radius, source: records,
          error: error instanceof Error ? error.message : 'Unable to search this ZIP code.', warning: '',
        });
      }
    })();
    return () => { cancelled = true; };
  }, [records, zip, radius, attempt]);

  const current = result?.zip === zip && result.radius === radius && result.source === records;
  return {
    records: !zip ? records : current ? result.records : [],
    loading: !!zip && !current,
    error: zip && current ? result.error : '',
    warning: zip && current ? result.warning : '',
    retry: () => { setResult(null); setAttempt((value) => value + 1); },
  };
}
