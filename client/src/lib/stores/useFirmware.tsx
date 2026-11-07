import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { saveStorage } from '../save';
import type { PlayerClass } from '../combat/types';
import { firmwareLevel, setForkChoices } from '../engine/firmware';

// What each firmware has learned (engine/firmware.ts): xp per firmware, kept across
// hosts. Only a full save wipe clears it.
interface FirmwareState {
  xp: Partial<Record<PlayerClass, number>>;
  /** Firmware opened outside classesUnlocked: Courier and Foreman by going deep, the Enforcer by a death after 5 kills. */
  opened: PlayerClass[];
  /** Which side of each fork the player took, per firmware and level. */
  forks: Partial<Record<PlayerClass, Record<number, 0 | 1>>>;
  /** Take one side of a fork (out of a fight). */
  setFork: (cls: PlayerClass, level: number, side: 0 | 1) => void;
  open: (cls: PlayerClass) => void;
  /** The firmware's level now. */
  level: (cls: PlayerClass) => number;
  /** A won fight teaches the loaded firmware. Returns the level it reached if that went up, else null. */
  gain: (cls: PlayerClass, xp: number) => number | null;
  reset: () => void;
}

export const useFirmware = create<FirmwareState>()(persist((set, get) => ({
  xp: {},
  opened: [],
  forks: {},
  setFork: (cls, level, side) => {
    const forks = { ...get().forks, [cls]: { ...(get().forks[cls] ?? {}), [level]: side } };
    setForkChoices(forks);
    set({ forks });
  },
  open: (cls) => { if (!get().opened.includes(cls)) set({ opened: [...get().opened, cls] }); },
  level: (cls) => firmwareLevel(get().xp[cls] ?? 0).level,
  gain: (cls, n) => {
    if (cls === 'none' || n <= 0) return null;
    const before = get().level(cls);
    set({ xp: { ...get().xp, [cls]: (get().xp[cls] ?? 0) + n } });
    const after = get().level(cls);
    return after > before ? after : null;
  },
  reset: () => { setForkChoices({}); set({ xp: {}, opened: [], forks: {} }); },
}), { name: '2059-firmware', storage: createJSONStorage(() => saveStorage), version: 1, partialize: (s) => ({ xp: s.xp, opened: s.opened, forks: s.forks }),
  // The engine reads fork choices: hand them over once the save is loaded
  onRehydrateStorage: () => (state) => { if (state) setForkChoices(state.forks ?? {}); },
}));
