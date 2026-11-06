import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { saveStorage } from '../save';
import { emptyStats, addStats, type RunStats } from '../engine/runStats';

// The Self page's numbers (engine/runStats.ts): this host's, and every host's together.
// A new host starts its own at zero; only a full save wipe clears the totals.
interface RunStatsState {
  host: RunStats;
  total: RunStats;
  add: (d: Partial<RunStats>) => void;
  /** A new host: its numbers start from zero. */
  newHost: () => void;
  reset: () => void;
}

export const useRunStats = create<RunStatsState>()(persist((set, get) => ({
  host: emptyStats(),
  total: emptyStats(),
  add: (d) => { if (Object.keys(d).length) set({ host: addStats(get().host, d), total: addStats(get().total, d) }); },
  newHost: () => set({ host: emptyStats() }),
  reset: () => set({ host: emptyStats(), total: emptyStats() }),
}), { name: '2059-stats', storage: createJSONStorage(() => saveStorage), version: 1, partialize: (s) => ({ host: s.host, total: s.total }) }));
