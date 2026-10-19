'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { searchRadius } from '@/lib/location';
import { ZipFields } from './ZipFields';

export function LocationSearch() {
  const params = useSearchParams();
  const pathname = usePathname();
  const router = useRouter();
  const urlZip = params.get('zip') || '';
  const urlRadius = searchRadius(params.get('radius'));
  const [zip, setZip] = useState(urlZip);
  const [radius, setRadius] = useState<number>(urlRadius);
  useEffect(() => { setZip(urlZip); setRadius(urlRadius); }, [urlZip, urlRadius]);
  const other = pathname === '/items' ? '/events' : '/items';
  const shared = new URLSearchParams();
  for (const key of ['zip', 'radius', 'search']) {
    const value = params.get(key);
    if (value) shared.set(key, value);
  }
  return (
    <div className="space-y-2">
      <form className="flex flex-wrap items-center gap-2" onSubmit={(event) => {
        event.preventDefault();
        const next = new URLSearchParams(params.toString());
        next.delete('location');
        if (zip) { next.set('zip', zip); next.set('radius', String(radius)); }
        else { next.delete('zip'); next.delete('radius'); }
        router.replace(`${pathname}?${next}`, { scroll: false });
      }}>
        <ZipFields zip={zip} radius={radius} onZipChange={setZip} onRadiusChange={setRadius} />
        <button className="btn-primary !py-2" type="submit">Apply location</button>
        <Link className="text-brand-700 underline text-sm" href={`${other}?${shared}`}>
          {other === '/events' ? 'Search events' : 'Search items'}
        </Link>
      </form>
      <p className="text-xs text-gray-600">Enter a US ZIP code, or leave blank to search everywhere.</p>
    </div>
  );
}
