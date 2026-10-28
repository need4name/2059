import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { saveStorage } from '../save';
import { dealOffer, perksFor, FALLBACK_ID, playiNode, type Perks } from '../engine/playi';
import type { Item } from '../combat/types';

// What the signal has learned across every host. Survives death; only a full
// save wipe clears it.
interface PlayiState {
  owned: string[];
  /** The two cards waiting to be picked after a death, or null. */
  offer: string[] | null;
  /** Deal the post-death offer (does nothing if one is already waiting). */
  makeOffer: (hasAlly: boolean) => void;
  pick: (id: string) => boolean;
  perks: () => Perks;
  /** The implants the last host was wearing when the signal left it (the Echo wears them). */
  lastBody: Item[];
  rememberBody: (items: Item[]) => void;
  reset: () => void;
}

export const usePlayi = create<PlayiState>()(persist((set, get) => ({
  owned: [],
  offer: null,
  lastBody: [],

  makeOffer: (hasAlly) => {
    if (get().offer) return;
    set({ offer: dealOffer(get().owned, hasAlly) });
  },

  pick: (id) => {
    const { offer, owned } = get();
    if (!offer?.includes(id)) return false;
    if (id !== FALLBACK_ID && (!playiNode(id) || owned.includes(id))) return false;
    set({ owned: [...owned, id], offer: null });
    return true;
  },

  perks: () => perksFor(get().owned),

  rememberBody: (items) => set({ lastBody: items }),

  reset: () => set({ owned: [], offer: null, lastBody: [] }),
}), {
  name: '2059-playi', storage: createJSONStorage(() => saveStorage), version: 2,
  // Version 2 remembers the last body's implants
  migrate: (old: any, version) => (version < 2 ? { ...old, lastBody: [] } : old),
}));
