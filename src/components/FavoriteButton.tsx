'use client';

import { useState } from 'react';
import { Heart } from 'lucide-react';
import toast from 'react-hot-toast';
import { useFavorites } from '@/hooks';
import { useAuthStore } from '@/store';
import type { Favorite } from '@/types';

export function FavoriteButton({
  type,
  targetId,
  className = '',
  size = 20,
}: {
  type: Favorite['type'];
  targetId: string;
  className?: string;
  size?: number;
}) {
  const user = useAuthStore((s) => s.user);
  const { isFavorite, addFavorite, removeFavorite } = useFavorites();
  const [busy, setBusy] = useState(false);
  const active = !!user && isFavorite(type, targetId);
  const label = type === 'item' ? 'item' : 'seller';
  const disabled = !user || busy;

  const toggle = async (e: React.MouseEvent) => {
    // Button may sit inside a card link
    e.preventDefault();
    e.stopPropagation();
    if (!user) return;
    setBusy(true);
    try {
      if (active) {
        await removeFavorite(type, targetId);
        toast.success(`Removed ${label} from favorites`);
      } else {
        await addFavorite(type, targetId);
        toast.success(`Added ${label} to favorites`);
      }
    } catch (error) {
      console.error('Failed to update favorite:', error);
      toast.error('Failed to update favorites');
    } finally {
      setBusy(false);
    }
  };

  return (
    <button
      type="button"
      onClick={toggle}
      disabled={disabled}
      aria-pressed={active}
      aria-label={active ? `Remove ${label} from favorites` : `Add ${label} to favorites`}
      title={user ? (active ? 'Remove from favorites' : 'Add to favorites') : 'Sign in to save favorites'}
      className={`inline-flex items-center justify-center rounded-full bg-white/90 shadow p-2 text-red-500 hover:bg-white transition disabled:opacity-60 disabled:cursor-not-allowed ${className}`}
    >
      <Heart size={size} fill={active ? 'currentColor' : 'none'} aria-hidden="true" />
    </button>
  );
}
