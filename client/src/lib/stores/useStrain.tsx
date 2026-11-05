import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { saveStorage } from '../save';
import type { StrainId } from '../engine/strain';

// Strain (engine/strain.ts): unlocked by finishing any chapter. `chosen` is what the
// player has switched on; `active` is what this host lives under (copied when a host wakes).
interface StrainState {
  unlocked: boolean;
  chosen: StrainId[];
  active: StrainId[];
  unlock: () => void;
  toggle: (id: StrainId) => void;
  /** A new host wakes: the chosen strain takes hold. */
  wake: () => void;
  reset: () => void;
}

export const useStrain = create<StrainState>()(persist((set, get) => ({
  unlocked: false,
  chosen: [],
  active: [],
  unlock: () => set({ unlocked: true }),
  toggle: (id) => { const c = get().chosen; set({ chosen: c.includes(id) ? c.filter(x => x !== id) : [...c, id] }); },
  wake: () => set({ active: [...get().chosen] }),
  reset: () => set({ unlocked: false, chosen: [], active: [] }),
}), { name: '2059-strain', storage: createJSONStorage(() => saveStorage), version: 1 }));
