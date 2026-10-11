import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { Item } from '../combat/types';
import { generateMarketStock, buyPrice, sellPrice } from '../combat/economy';
import { useInventory } from './useInventory';

interface MarketState {
  /** Which visit the stock belongs to; a new key means new stock. */
  stockKey: string;
  stock: Item[];
  ensureStock: (key: string, level: number) => void;
  buy: (itemId: string) => boolean;
  sell: (itemId: string) => boolean;
  reset: () => void;
}

export const useMarket = create<MarketState>()(persist((set, get) => ({
  stockKey: '',
  stock: [],

  ensureStock: (key, level) => {
    if (get().stockKey === key && get().stock.length) return;
    set({ stockKey: key, stock: generateMarketStock(level) });
  },

  buy: (itemId) => {
    const item = get().stock.find(i => i.id === itemId);
    if (!item) return false;
    const price = buyPrice(item);
    if (!useInventory.getState().spendGold(price)) return false;
    useInventory.getState().addItems([item]);
    set({ stock: get().stock.filter(i => i.id !== itemId) });
    return true;
  },

  sell: (itemId) => {
    const inv = useInventory.getState();
    const item = inv.items.find(i => i.id === itemId);
    if (!item) return false;
    inv.removeItem(itemId);
    inv.addGold(sellPrice(item));
    return true;
  },

  reset: () => set({ stockKey: '', stock: [] }),
}), { name: '2059-market', version: 1 }));
