import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { saveStorage } from '../save';
import { dealOffer, perksFor, FALLBACK_ID, playiNode, type Perks } from '../engine/playi';

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
  reset: () => void;
}

export const usePlayi = create<PlayiState>()(persist((set, get) => ({
  owned: [],
  offer: null,

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

  reset: () => set({ owned: [], offer: null }),
}), { name: '2059-playi', storage: createJSONStorage(() => saveStorage), version: 1 }));
