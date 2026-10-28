import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { saveStorage } from '../save';

export type HintId =
  | 'intro' | 'move' | 'attack' | 'enemy_reach' | 'heat' | 'brace' | 'structure'
  | 'malfunction' | 'telegraph' | 'stims' | 'victory' | 'base' | 'implants'
  | 'upgrades' | 'market' | 'death' | 'enforcer'
  | 'look' | 'ally' | 'ally_gear' | 'speed' | 'tide' | 'cache' | 'sealed' | 'reborn' | 'surge' | 'burning' | 'stunned' | 'turns' | 'traits' | 'parting' | 'shove';

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
}), { name: '2059-tutorial', storage: createJSONStorage(() => saveStorage), version: 1, partialize: (s) => ({ enabled: s.enabled, seen: s.seen }) }));
