import { create } from 'zustand';
import type { Item } from '@/types';

interface ItemStore {
  items: Item[];
  loading: boolean;
  error: string | null;
  setItems: (items: Item[]) => void;
  addItem: (item: Item) => void;
  setLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;
}

export const useItemStore = create<ItemStore>((set) => ({
  items: [],
  loading: false,
  error: null,
  setItems: (items) => set({ items }),
  addItem: (item) => set((state) => ({ items: [item, ...state.items] })),
  setLoading: (loading) => set({ loading }),
  setError: (error) => set({ error }),
}));
