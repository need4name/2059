import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { saveStorage } from '../save';
import type { PlayerClass } from '../combat/types';
import { firmwareLevel, openingXp, setForkChoices } from '../engine/firmware';

// What each firmware has learned (engine/firmware.ts): xp per firmware, kept across
// hosts. Only a full save wipe clears it.
interface FirmwareState {
  xp: Partial<Record<PlayerClass, number>>;
  /** Firmware opened, in the order it opened: each from the boss that held it. */
  opened: PlayerClass[];
  /** Opened since the last host woke: the next host is the first that can load it. */
  fresh: PlayerClass[];
  /** Which side of each fork the player took, per firmware and level. */
  forks: Partial<Record<PlayerClass, Record<number, 0 | 1>>>;
  /** Take one side of a fork (out of a fight). */
  setFork: (cls: PlayerClass, level: number, side: 0 | 1) => void;
  /** Open a firmware (a boss that held it is beaten): it starts at its own level or the best one reached, whichever is higher. */
  open: (cls: PlayerClass) => void;
  /** A host woke: what opened is no longer new. */
  woke: () => void;
  /** The firmware's level now. */
  level: (cls: PlayerClass) => number;
  /** A won fight teaches the loaded firmware. Returns the level it reached if that went up, else null. */
  gain: (cls: PlayerClass, xp: number) => number | null;
  reset: () => void;
}

export const useFirmware = create<FirmwareState>()(persist((set, get) => ({
  xp: {},
  opened: [],
  fresh: [],
  forks: {},
  setFork: (cls, level, side) => {
    const forks = { ...get().forks, [cls]: { ...(get().forks[cls] ?? {}), [level]: side } };
    setForkChoices(forks);
    set({ forks });
  },
  open: (cls) => {
    if (cls === 'none' || get().opened.includes(cls)) return;
    set({ opened: [...get().opened, cls], fresh: [...get().fresh, cls], xp: { ...get().xp, [cls]: Math.max(get().xp[cls] ?? 0, openingXp(cls, get().xp)) } });
  },
  woke: () => set({ fresh: [] }),
  level: (cls) => firmwareLevel(get().xp[cls] ?? 0).level,
  gain: (cls, n) => {
    if (cls === 'none' || n <= 0) return null;
    const before = get().level(cls);
    set({ xp: { ...get().xp, [cls]: (get().xp[cls] ?? 0) + n } });
    const after = get().level(cls);
    return after > before ? after : null;
  },
  reset: () => { setForkChoices({}); set({ xp: {}, opened: [], fresh: [], forks: {} }); },
}), { name: '2059-firmware', storage: createJSONStorage(() => saveStorage), version: 1, partialize: (s) => ({ xp: s.xp, opened: s.opened, fresh: s.fresh, forks: s.forks }),
  // The engine reads fork choices: hand them over once the save is loaded
  onRehydrateStorage: () => (state) => { if (state) setForkChoices(state.forks ?? {}); },
}));
