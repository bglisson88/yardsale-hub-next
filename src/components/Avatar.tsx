'use client';

const COLORS = [
  'bg-orange-500',
  'bg-teal-600',
  'bg-accent-600',
  'bg-pink-500',
  'bg-amber-500',
  'bg-emerald-600',
  'bg-violet-600',
];

export function getInitials(name?: string | null) {
  const parts = (name || '').trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  const first = parts[0][0];
  const last = parts.length > 1 ? parts[parts.length - 1][0] : '';
  return (first + last).toUpperCase();
}

export function getAvatarColorIndex(name?: string | null) {
  const s = name || '';
  let hash = 0;
  for (let i = 0; i < s.length; i++) hash = (hash * 31 + s.charCodeAt(i)) >>> 0;
  return hash % COLORS.length;
}

interface AvatarProps {
  src?: string | null;
  name?: string | null;
  size?: number;
  className?: string;
}

export function Avatar({ src, name, size = 40, className = '' }: AvatarProps) {
  const style = { width: size, height: size, fontSize: Math.max(10, Math.round(size * 0.4)) };

  if (src) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={src}
        alt={name ? `${name}'s avatar` : 'User avatar'}
        style={style}
        className={`rounded-full object-cover bg-gray-100 flex-shrink-0 ${className}`}
      />
    );
  }

  return (
    <span
      role="img"
      aria-label={name ? `${name}'s avatar` : 'User avatar'}
      style={style}
      className={`rounded-full flex items-center justify-center font-bold text-white flex-shrink-0 ${COLORS[getAvatarColorIndex(name)]} ${className}`}
    >
      {getInitials(name)}
    </span>
  );
}
