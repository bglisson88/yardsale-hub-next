'use client';

import { useState } from 'react';
import { Heart } from 'lucide-react';
import toast from 'react-hot-toast';
import { useAuthStore } from '@/store';
import { useFavorites } from '@/hooks/useFavorites';
import { useFavoriteCount } from '@/hooks/useFavoriteCount';
import type { FavoriteType } from '@/types';

export function FavoriteButton({
  type,
  targetId,
  className = '',
}: {
  type: FavoriteType;
  targetId: string;
  className?: string;
}) {
  const user = useAuthStore((s) => s.user);
  const { isFavorite, addFavorite, removeFavorite } = useFavorites();
  const [busy, setBusy] = useState(false);
  const count = useFavoriteCount(type, targetId);
  const active = isFavorite(type, targetId);
  const label = type;

  const toggle = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!user || busy) return;
    setBusy(true);
    try {
      if (active) {
        await removeFavorite(type, targetId);
        toast.success(`Removed ${label} from favorites`);
      } else {
        await addFavorite(type, targetId);
        toast.success(`Saved ${label} to favorites`);
      }
    } catch (error) {
      console.error('Error updating favorite:', error);
      toast.error('Could not update favorites');
    } finally {
      setBusy(false);
    }
  };

  const title = !user
    ? 'Sign in to save favorites'
    : active
      ? 'Remove from favorites'
      : 'Add to favorites';

  return (
    <button
      type="button"
      onClick={toggle}
      disabled={!user || busy}
      title={title}
      aria-label={title}
      aria-pressed={active}
      className={`flex items-center gap-1 p-2 rounded-full bg-white/90 shadow text-red-500 hover:bg-white transition disabled:opacity-60 disabled:cursor-not-allowed ${className}`}
    >
      <Heart size={18} fill={active ? 'currentColor' : 'none'} aria-hidden="true" />
      {count > 0 && (
        <span className="text-xs font-semibold text-gray-700" aria-label={`${count} favorites`}>
          {count}
        </span>
      )}
    </button>
  );
}
