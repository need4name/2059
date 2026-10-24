import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { saveStorage } from '../save';
import { ALLIES, ALLY_MAX_LEVEL, allyDef, allyMoves, allySlotFor, allyUnit, allyXpToNext, alliesUnlockedBy, type AllyGear, type AllySlot } from '../combat/allies';
import type { Perks } from '../engine/playi';
import type { Item } from '../combat/types';
import { useInventory } from './useInventory';

export interface AllyProgress { level: number; xp: number }

// Allies the signal has met, how far each has grown, and who rides with this
// host. Survives death; only a full save wipe clears it.
interface AlliesState {
  /** Allies the signal has met in rooms on the map (kept across hosts). */
  met: string[];
  levels: Record<string, AllyProgress>;
  /** Allies with the current host (chosen when a host starts). */
  party: string[];
  /** Implants each ally wears. Allies keep them when a host is lost. */
  gear: Record<string, AllyGear>;
  unlocked: () => string[];
  progress: (id: string) => AllyProgress;
  /** Meet an ally in a room. Returns true the first time. */
  meet: (id: string) => boolean;
  setParty: (ids: string[], slots: number) => void;
  /** Wins for the party. Returns the allies that went up a level. */
  gainXp: (amount: number) => string[];
  /** Put an implant from the stash (or off your body) on a met ally. Whatever it wore there goes to the stash. */
  giveImplant: (id: string, item: Item) => boolean;
  /** Take an ally's implant back into the stash. */
  takeImplant: (id: string, slot: AllySlot) => void;
  reset: () => void;
}

export const useAllies = create<AlliesState>()(persist((set, get) => ({
  met: [],
  levels: {},
  party: [],
  gear: {},

  // In roster order, whatever order they were met in
  unlocked: () => ALLIES.map(a => a.id).filter(id => get().met.includes(id)),
  progress: (id) => get().levels[id] ?? { level: 1, xp: 0 },

  meet: (id) => {
    if (get().met.includes(id) || !allyDef(id)) return false;
    set({ met: [...get().met, id] });
    return true;
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

  giveImplant: (id, item) => {
    const slot = allySlotFor(item);
    if (!slot || !get().met.includes(id)) return false;
    const inv = useInventory.getState();
    if (inv.items.some(i => i.id === item.id)) inv.removeItem(item.id);
    else if (item.slot && inv.equippedAugmentations[item.slot]?.id === item.id) { inv.unequipAugmentation(item.slot); useInventory.getState().removeItem(item.id); }
    else return false;
    const old = get().gear[id]?.[slot];
    if (old) useInventory.getState().addItems([old]);
    set({ gear: { ...get().gear, [id]: { ...get().gear[id], [slot]: item } } });
    return true;
  },

  takeImplant: (id, slot) => {
    const item = get().gear[id]?.[slot];
    if (!item) return;
    useInventory.getState().addItems([item]);
    const { [slot]: _gone, ...rest } = get().gear[id] ?? {};
    set({ gear: { ...get().gear, [id]: rest } });
  },

  reset: () => set({ met: [], levels: {}, party: [], gear: {} }),
}), {
  name: '2059-allies', storage: createJSONStorage(() => saveStorage), version: 3,
  // Version 1 unlocked allies by best level cleared; those count as met. Version 3 added gear
  migrate: (old: any, version) => {
    let s = old;
    if (version < 2) s = { ...s, met: alliesUnlockedBy(s?.bestCleared ?? 0), bestCleared: undefined };
    if (version < 3) s = { ...s, gear: s?.gear ?? {} };
    return s;
  },
}));

/** The party as fight-ready allies (positions are filled in when the fight starts). */
export function partyForFight(perks: Perks) {
  const st = useAllies.getState();
  return st.party.map(id => allyDef(id)).filter(d => !!d).map(def => {
    const { level } = st.progress(def!.id);
    const gear = st.gear[def!.id] ?? {};
    const moves = allyMoves(def!, level, gear);
    return { id: def!.id, unit: allyUnit(def!, level, perks.allyHpMult, gear), moves, move: def!.move, cooldowns: moves.map(() => 0) };
  });
}

export { ALLIES };
