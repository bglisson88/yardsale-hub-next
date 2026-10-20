'use client';

const COLORS = ['bg-orange-500', 'bg-teal-600', 'bg-cyan-600', 'bg-pink-500', 'bg-amber-500', 'bg-emerald-600', 'bg-violet-600'];

export function Avatar({ src, name, size = 40 }: { src?: string | null; name?: string | null; size?: number }) {
  const parts = (name || '').trim().split(/\s+/).filter(Boolean);
  const initials = parts.length ? (parts[0][0] + (parts.length > 1 ? parts[parts.length - 1][0] : '')).toUpperCase() : '?';
  let hash = 0;
  for (const character of name || '') hash = (hash * 31 + character.charCodeAt(0)) >>> 0;
  const style = { width: size, height: size, fontSize: Math.max(10, Math.round(size * 0.4)) };
  const label = name ? `${name}'s avatar` : 'User avatar';

  return src ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={src} alt={label} style={style} className="rounded-full object-cover bg-gray-100 flex-shrink-0" />
  ) : (
    <span role="img" aria-label={label} style={style} className={`rounded-full flex items-center justify-center font-bold text-white flex-shrink-0 ${COLORS[hash % COLORS.length]}`}>
      {initials}
    </span>
  );
}
