import { SEARCH_RADII } from '@/lib/location';

export function ZipFields({
  zip, radius, onZipChange, onRadiusChange, dark = false,
}: {
  zip: string; radius: number; onZipChange: (value: string) => void;
  onRadiusChange: (value: number) => void; dark?: boolean;
}) {
  const style = dark
    ? 'bg-slate-900 text-white border-slate-700 focus:ring-emerald-400'
    : 'bg-white text-gray-900 border-gray-300 focus:ring-brand-500';
  return (
    <div className="flex flex-wrap gap-2">
      <input
        aria-label="US ZIP code" name="zip" type="text" inputMode="numeric"
        autoComplete="postal-code" pattern="[0-9]{5}" maxLength={5}
        title="Enter a 5-digit US ZIP code" placeholder="ZIP code"
        value={zip} onChange={(event) => onZipChange(event.target.value)}
        className={`w-32 min-w-0 px-3 py-2.5 border rounded-xl focus:ring-2 ${style}`}
      />
      <select
        aria-label="Search distance" name="radius" value={radius}
        onChange={(event) => onRadiusChange(Number(event.target.value))}
        className={`px-3 py-2.5 border rounded-xl focus:ring-2 ${style}`}
      >
        {SEARCH_RADII.map((value) => <option key={value} value={value}>Within {value} miles</option>)}
      </select>
    </div>
  );
}
