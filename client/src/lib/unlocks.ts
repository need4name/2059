// What's earned across runs, kept on the device (not in a save), so all three slots share it:
// Hard (finish chapter one on Normal or Hard), later challenges, and the fewest hosts each chapter took.

const KEY = '2059-unlocks';
export interface Unlocks {
  hard: boolean;
  challenges: string[];
  /** Fewest hosts a chapter has taken, per setting (`fewestKey`). */
  fewest: Record<string, number>;
}

function ls(): Storage | null {
  try { return typeof localStorage === 'undefined' ? null : localStorage; } catch { return null; }
}
export function readUnlocks(): Unlocks {
  try {
    const u = JSON.parse(ls()?.getItem(KEY) ?? '{}');
    return { hard: !!u.hard, challenges: Array.isArray(u.challenges) ? u.challenges : [], fewest: u.fewest && typeof u.fewest === 'object' ? u.fewest : {} };
  } catch { return { hard: false, challenges: [], fewest: {} }; }
}
function write(u: Unlocks) { ls()?.setItem(KEY, JSON.stringify(u)); }

export function unlock(patch: Partial<Pick<Unlocks, 'hard' | 'challenges'>>) {
  if (!ls()) return;
  const u = readUnlocks();
  write({ ...u, hard: u.hard || !!patch.hard, challenges: Array.from(new Set([...u.challenges, ...(patch.challenges ?? [])])) });
}

/** A host count is only compared with runs on the same setting: the chapter, the difficulty and any challenges carried. */
export const fewestKey = (chapter: string, difficulty: string, challenges: string[] = []) =>
  [chapter, difficulty, ...[...challenges].sort()].join('|');

/** Keep a chapter's host count if it's the fewest on its setting. Returns the fewest before it (null the first time). */
export function recordHosts(chapter: string, difficulty: string, challenges: string[], hosts: number): number | null {
  const u = readUnlocks(), k = fewestKey(chapter, difficulty, challenges);
  const before = typeof u.fewest[k] === 'number' ? u.fewest[k] : null;
  if (ls() && (before === null || hosts < before)) write({ ...u, fewest: { ...u.fewest, [k]: hosts } });
  return before;
}
