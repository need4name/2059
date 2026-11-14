import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { saveStorage } from '../save';
import type { PlayerClass } from '../combat/types';
import { POINT_XP, laneOf, laneOpen, openingPoints, setLaneRanks, type LaneRanks } from '../engine/firmware';

// What each firmware has learned (engine/firmware.ts): its own points, earned only while
// it's loaded, and the ranks bought on its lane. Kept across hosts; only a full save wipe clears it.
interface FirmwareState {
  /** Firmware opened, in the order it opened: each from the boss that held it. */
  opened: PlayerClass[];
  /** Opened since the last host woke: the next host is the first that can load it. */
  fresh: PlayerClass[];
  /** Xp toward each firmware's next point. */
  xp: Partial<Record<PlayerClass, number>>;
  /** Each firmware's points to spend. */
  points: Partial<Record<PlayerClass, number>>;
  /** Ranks bought on each firmware's lane. */
  ranks: Partial<Record<PlayerClass, LaneRanks>>;
  /** Open a firmware (a boss that held it is beaten): it arrives with its opening points. */
  open: (cls: PlayerClass) => void;
  /** A host woke: what opened is no longer new. */
  woke: () => void;
  /** A won fight teaches the loaded firmware. Returns the points that earned (0 if none). */
  gain: (cls: PlayerClass, xp: number) => number;
  /** Buy a rank on a firmware's lane, if it's open at this stage and there are points for it. */
  learn: (cls: PlayerClass, id: string, stage: number) => boolean;
  reset: () => void;
}

export const useFirmware = create<FirmwareState>()(persist((set, get) => ({
  opened: [],
  fresh: [],
  xp: {},
  points: {},
  ranks: {},
  open: (cls) => {
    if (cls === 'none' || get().opened.includes(cls)) return;
    set({ opened: [...get().opened, cls], fresh: [...get().fresh, cls], points: { ...get().points, [cls]: (get().points[cls] ?? 0) + openingPoints(cls) } });
  },
  woke: () => set({ fresh: [] }),
  gain: (cls, n) => {
    if (cls === 'none' || n <= 0) return 0;
    const total = (get().xp[cls] ?? 0) + n, earned = Math.floor(total / POINT_XP);
    set({ xp: { ...get().xp, [cls]: total - earned * POINT_XP }, points: { ...get().points, [cls]: (get().points[cls] ?? 0) + earned } });
    return earned;
  },
  learn: (cls, id, stage) => {
    const mine = get().ranks[cls] ?? {}, node = laneOf(cls).find(n => n.id === id), have = get().points[cls] ?? 0;
    if (!node || !laneOpen(cls, id, mine, stage) || node.cost > have) return false;
    const ranks = { ...get().ranks, [cls]: { ...mine, [id]: (mine[id] ?? 0) + 1 } };
    setLaneRanks(ranks);
    set({ ranks, points: { ...get().points, [cls]: have - node.cost } });
    return true;
  },
  reset: () => { setLaneRanks({}); set({ opened: [], fresh: [], xp: {}, points: {}, ranks: {} }); },
}), {
  name: '2059-firmware', storage: createJSONStorage(() => saveStorage), version: 2,
  partialize: (s) => ({ opened: s.opened, fresh: s.fresh, xp: s.xp, points: s.points, ranks: s.ranks }),
  // Version 2: lanes replace levels (an old save keeps what it opened, with each one's opening points)
  migrate: (old: any, version) => (version < 2
    ? { opened: old?.opened ?? [], fresh: old?.fresh ?? [], xp: {}, points: Object.fromEntries((old?.opened ?? []).map((c: PlayerClass) => [c, openingPoints(c)])), ranks: {} }
    : old),
  // The engine reads the lanes' ranks: hand them over once the save is loaded
  onRehydrateStorage: () => (state) => { if (state) setLaneRanks(state.ranks ?? {}); },
}));
