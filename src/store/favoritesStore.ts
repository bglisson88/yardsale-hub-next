import { create } from 'zustand';
import type { Favorite } from '@/types';

interface FavoritesStore {
  favorites: Favorite[];
  loading: boolean;
  error: string | null;
  setFavorites: (favorites: Favorite[]) => void;
  setLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;
}

export const useFavoritesStore = create<FavoritesStore>((set) => ({
  favorites: [],
  loading: false,
  error: null,
  setFavorites: (favorites) => set({ favorites }),
  setLoading: (loading) => set({ loading }),
  setError: (error) => set({ error }),
}));
