import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export type HintId =
  | 'intro' | 'move' | 'attack' | 'enemy_reach' | 'heat' | 'brace' | 'structure'
  | 'malfunction' | 'telegraph' | 'stims' | 'victory' | 'base' | 'implants'
  | 'upgrades' | 'market' | 'death' | 'enforcer';

interface TutorialState {
  enabled: boolean;
  seen: Partial<Record<HintId, true>>;
  active: HintId | null;
  show: (id: HintId) => void;
  dismiss: () => void;
  skipAll: () => void;
  restart: () => void;
}

export const useTutorial = create<TutorialState>()(persist((set, get) => ({
  enabled: true,
  seen: {},
  active: null,

  show: (id) => {
    const s = get();
    if (!s.enabled || s.seen[id] || s.active) return;
    set({ active: id });
  },

  dismiss: () => {
    const id = get().active;
    if (!id) return;
    set({ active: null, seen: { ...get().seen, [id]: true } });
  },

  skipAll: () => set({ enabled: false, active: null }),

  restart: () => set({ enabled: true, seen: {}, active: null }),
}), { name: '2059-tutorial', version: 1, partialize: (s) => ({ enabled: s.enabled, seen: s.seen }) }));
