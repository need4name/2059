import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { saveStorage } from '../save';
import type { PlayerClass } from '../combat/types';
import { firmwareLevel } from '../engine/firmware';

// What each firmware has learned (engine/firmware.ts): xp per firmware, kept across
// hosts. Only a full save wipe clears it.
interface FirmwareState {
  xp: Partial<Record<PlayerClass, number>>;
  /** Firmware opened by going deep (Courier, Foreman); Enforcer and Operative open with a death (classesUnlocked). */
  opened: PlayerClass[];
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
  open: (cls) => { if (!get().opened.includes(cls)) set({ opened: [...get().opened, cls] }); },
  level: (cls) => firmwareLevel(get().xp[cls] ?? 0).level,
  gain: (cls, n) => {
    if (cls === 'none' || n <= 0) return null;
    const before = get().level(cls);
    set({ xp: { ...get().xp, [cls]: (get().xp[cls] ?? 0) + n } });
    const after = get().level(cls);
    return after > before ? after : null;
  },
  reset: () => set({ xp: {}, opened: [] }),
}), { name: '2059-firmware', storage: createJSONStorage(() => saveStorage), version: 1, partialize: (s) => ({ xp: s.xp, opened: s.opened }) }));
