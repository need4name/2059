import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { saveStorage } from '../save';
import { ALLIES, ALLY_MAX_LEVEL, allyDef, allyMoves, allyUnit, allyXpToNext, alliesUnlockedBy } from '../combat/allies';
import type { Perks } from '../engine/playi';

export interface AllyProgress { level: number; xp: number }

// Allies the signal has met, how far each has grown, and who rides with this
// host. Survives death; only a full save wipe clears it.
interface AlliesState {
  /** Highest level any host has cleared. Unlocks follow from it. */
  bestCleared: number;
  levels: Record<string, AllyProgress>;
  /** Allies with the current host (chosen when a host starts). */
  party: string[];
  unlocked: () => string[];
  progress: (id: string) => AllyProgress;
  /** Note a cleared level. Returns allies it unlocked for the first time. */
  recordClear: (level: number) => string[];
  setParty: (ids: string[], slots: number) => void;
  /** Wins for the party. Returns the allies that went up a level. */
  gainXp: (amount: number) => string[];
  reset: () => void;
}

export const useAllies = create<AlliesState>()(persist((set, get) => ({
  bestCleared: 0,
  levels: {},
  party: [],

  unlocked: () => alliesUnlockedBy(get().bestCleared),
  progress: (id) => get().levels[id] ?? { level: 1, xp: 0 },

  recordClear: (level) => {
    const before = get().unlocked();
    if (level <= get().bestCleared) return [];
    set({ bestCleared: level });
    return get().unlocked().filter(id => !before.includes(id));
  },

  setParty: (ids, slots) => {
    const open = get().unlocked();
    set({ party: ids.filter((id, n) => ids.indexOf(id) === n).filter(id => open.includes(id)).slice(0, Math.max(1, slots)) });
  },

  gainXp: (amount) => {
    const levels = { ...get().levels };
    const up: string[] = [];
    for (const id of get().party) {
      let { level, xp } = levels[id] ?? { level: 1, xp: 0 };
      if (level >= ALLY_MAX_LEVEL) continue;
      xp += amount;
      while (level < ALLY_MAX_LEVEL && xp >= allyXpToNext(level)) { xp -= allyXpToNext(level); level++; if (!up.includes(id)) up.push(id); }
      levels[id] = { level, xp: level >= ALLY_MAX_LEVEL ? 0 : xp };
    }
    set({ levels });
    return up;
  },

  reset: () => set({ bestCleared: 0, levels: {}, party: [] }),
}), { name: '2059-allies', storage: createJSONStorage(() => saveStorage), version: 1 }));

/** The party as fight-ready allies (positions are filled in when the fight starts). */
export function partyForFight(perks: Perks) {
  const st = useAllies.getState();
  return st.party.map(id => allyDef(id)).filter(d => !!d).map(def => {
    const { level } = st.progress(def!.id);
    const moves = allyMoves(def!, level);
    return { id: def!.id, unit: allyUnit(def!, level, perks.allyHpMult), moves, move: def!.move, cooldowns: moves.map(() => 0) };
  });
}

export { ALLIES };
