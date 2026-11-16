// What's earned across runs, kept on the device (not in a save), so all three slots share it:
// Hard (finish chapter one on Normal or Hard) and, later, challenges.

const KEY = '2059-unlocks';
export interface Unlocks { hard: boolean; challenges: string[] }

function ls(): Storage | null {
  try { return typeof localStorage === 'undefined' ? null : localStorage; } catch { return null; }
}
export function readUnlocks(): Unlocks {
  try { const u = JSON.parse(ls()?.getItem(KEY) ?? '{}'); return { hard: !!u.hard, challenges: Array.isArray(u.challenges) ? u.challenges : [] }; } catch { return { hard: false, challenges: [] }; }
}
export function unlock(patch: Partial<Unlocks>) {
  const s = ls(); if (!s) return;
  const u = readUnlocks();
  s.setItem(KEY, JSON.stringify({ hard: u.hard || !!patch.hard, challenges: Array.from(new Set([...u.challenges, ...(patch.challenges ?? [])])) }));
}
