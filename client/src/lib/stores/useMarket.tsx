import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { saveStorage } from '../save';
import { useAugmentTrees } from './useAugmentTrees';
import type { Item, Weapon } from '../combat/types';
import { generateMarketStock, generateGunRack, buyPrice, sellPrice } from '../combat/economy';
import { useInventory } from './useInventory';
import { useCombat } from './useCombat';
import { seedRandom, mixSeed, hashSeed, getRandomState } from '../engine/rng';
import { usePlayi } from './usePlayi';

/** What the Grey Lane charges you (Haggler knocks 20% off). */
export const marketPrice = (item: Item) => Math.max(1, Math.round(buyPrice(item) * usePlayi.getState().perks().priceMult));

interface MarketState {
  /** Which visit the stock belongs to; a new key means new stock. */
  stockKey: string;
  stock: Item[];
  ensureStock: (key: string, level: number) => void;
  /** The gun rack and which host and rest it belongs to (it restocks only when that changes, so fights can't cycle it). */
  gunKey: string;
  guns: Weapon[];
  ensureGuns: (key: string, level: number) => void;
  /** Buy a gun off the rack: it's yours and in your hand. */
  buyGun: (id: string) => Weapon | null;
  buy: (itemId: string) => boolean;
  sell: (itemId: string) => boolean;
  reset: () => void;
}

export const useMarket = create<MarketState>()(persist((set, get) => ({
  stockKey: '',
  stock: [],
  gunKey: '',
  guns: [],

  ensureGuns: (key, level) => {
    if (get().gunKey === key) return;
    // The rack is part of the run (the same seed and rest give the same guns), but stocking it leaves the fights' dice alone
    const keep = getRandomState();
    seedRandom(mixSeed(useCombat.getState().runSeed, hashSeed(`guns:${key}`)));
    set({ gunKey: key, guns: generateGunRack(level) });
    seedRandom(keep);
  },

  buyGun: (id) => {
    const w = get().guns.find(g => g.id === id);
    if (!w) return null;
    const priced = { ...w, price: Math.max(1, Math.round(w.price * usePlayi.getState().perks().priceMult)) };
    if (!useInventory.getState().buyWeapon(priced)) return null;
    useInventory.getState().equipWeapon(priced);
    set({ guns: get().guns.filter(g => g.id !== id) });
    return priced;
  },

  ensureStock: (key, level) => {
    if (get().stockKey === key && get().stock.length) return;
    // Stock is part of the run: the same seed and visit give the same stall
    seedRandom(mixSeed(useCombat.getState().runSeed, hashSeed(key)));
    set({ stockKey: key, stock: generateMarketStock(level, usePlayi.getState().perks().marketExtra) });
  },

  buy: (itemId) => {
    const item = get().stock.find(i => i.id === itemId);
    if (!item) return false;
    const price = marketPrice(item);
    if (!useInventory.getState().spendGold(price)) return false;
    useInventory.getState().receive([item]);
    set({ stock: get().stock.filter(i => i.id !== itemId) });
    return true;
  },

  sell: (itemId) => {
    const inv = useInventory.getState();
    const item = inv.items.find(i => i.id === itemId);
    if (!item) return false;
    inv.removeItem(itemId);
    inv.addGold(sellPrice(item));
    // The points sunk into its upgrade tree come back
    useAugmentTrees.getState().forget(item);
    return true;
  },

  reset: () => set({ stockKey: '', stock: [], gunKey: '', guns: [] }),
}), { name: '2059-market', storage: createJSONStorage(() => saveStorage), version: 1 }));
