import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { saveStorage } from '../save';
import type { Perks } from '../engine/playi';
import * as M from '../engine/memory';
import type { Item } from '../combat/types';
import { challengeOn } from './useRun';

// What the signal keeps across every host: its memory (points, and the neurons they've
// bought) and the last body's implants. Survives death; only a full save wipe clears it.
interface PlayiState extends M.MemoryState {
  /** A host is lost: a point, and a branch taught by how it went. */
  hostLost: (cause: M.DeathCause) => void;
  /** Spend points on one rank of a neuron or specialisation. */
  learn: (id: string, hasAlly: boolean) => boolean;
  perks: () => Perks;
  /** The implants the last host was wearing when the signal left it (the Echo wears them). */
  lastBody: Item[];
  rememberBody: (items: Item[]) => void;
  /** What killed the last host (Last word). */
  lastKiller: string | null;
  rememberKiller: (name: string | null) => void;
  reset: () => void;
}

export const usePlayi = create<PlayiState>()(persist((set, get) => ({
  ...M.newMemory(),
  lastBody: [],
  lastKiller: null,
  rememberKiller: (name) => set({ lastKiller: name }),

  hostLost: (cause) => set(M.hostLost({ points: get().points, ranks: get().ranks, taught: get().taught }, cause)),
  learn: (id, hasAlly) => {
    // Bare (a challenge): no memory network
    if (challengeOn('bare')) return false;
    const now = { points: get().points, ranks: get().ranks, taught: get().taught };
    const next = M.learn(now, id, hasAlly);
    if (next === now) return false;
    set(next);
    return true;
  },
  perks: () => M.memoryPerks(get().ranks),

  rememberBody: (items) => set({ lastBody: items }),
  reset: () => set({ ...M.newMemory(), lastBody: [], lastKiller: null }),
}), {
  name: '2059-playi', storage: createJSONStorage(() => saveStorage), version: 3,
  // Version 3 is the memory network: the old tree's cards don't carry over
  migrate: (old: any, version) => (version < 3 ? { ...M.newMemory(), lastBody: old?.lastBody ?? [] } : old),
}));
