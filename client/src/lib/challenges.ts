// Challenges: earned once on this device (lib/unlocks.ts), then switched on when a new run starts. Like the
// difficulty, they hold for the whole run, and the host count is marked with every one the run carried.

import type { Difficulty } from './slots';
import type { PlayerClass } from './combat/types';

export type ChallengeId = 'short' | 'glass' | 'unclassified' | 'bare' | 'enforcer' | 'weather' | 'nolook' | 'onebreath';
export interface Challenge { id: ChallengeId; name: string; /** What it changes, once earned. */ mod: string; /** How it's earned. */ need: string }

export const CHALLENGES: Challenge[] = [
  { id: 'short', name: 'Short on bodies', mod: 'Ten hosts. No more.', need: 'Finish chapter one' },
  { id: 'glass', name: 'Glass', mod: 'Everyone deals double damage.', need: 'Finish chapter one in 8 hosts or fewer' },
  { id: 'unclassified', name: 'Unclassified', mod: 'No firmware, ever.', need: 'Finish chapter one in 6 hosts or fewer' },
  { id: 'bare', name: 'Bare', mod: 'Three move slots. No memory network.', need: 'Finish chapter one in 4 hosts or fewer' },
  { id: 'enforcer', name: 'Enforcer only', mod: 'Every host wakes as an Enforcer.', need: 'Beat the King as an Enforcer' },
  { id: 'weather', name: 'Bad weather', mod: 'It always rains, and it is always night.', need: 'Beat a boss in the rain' },
  { id: 'nolook', name: 'No second look', mod: 'The last body keeps nothing.', need: 'Take back five parts from your own bodies' },
  { id: 'onebreath', name: 'One breath', mod: 'One host. Lose it and the run ends.', need: 'Finish chapter one on Hard' },
];
export const challengeOf = (id: string) => CHALLENGES.find(c => c.id === id);

/** Short on bodies: the run ends when this many hosts are lost. */
export const SHORT_HOSTS = 10;
/** No second look is earned by taking back this many parts from your own bodies (across every run on the device). */
export const TAKE_BACK_NEED = 5;
/** Bare: the move bar's size. */
export const BARE_SLOTS = 3;
/** Glass: every hit is this many times as hard. */
export const GLASS_MULT = 2;

/** What finishing chapter one earns: from its host count, the difficulty and the firmware that beat the King. */
export function earnedByChapterOne(hosts: number, difficulty: Difficulty, cls: PlayerClass): ChallengeId[] {
  const out: ChallengeId[] = ['short'];
  if (hosts <= 8) out.push('glass');
  if (hosts <= 6) out.push('unclassified');
  if (hosts <= 4) out.push('bare');
  if (cls === 'melee') out.push('enforcer');
  if (difficulty === 'hard') out.push('onebreath');
  return out;
}

/** Hosts lost before the one awake now, and the run's challenges: is losing this one the end of the run? */
export const runEndsOnLoss = (lostBefore: number, on: string[]) =>
  on.includes('onebreath') || (on.includes('short') && lostBefore + 1 >= SHORT_HOSTS);

/** How many hosts the run has left after the one awake now, or null when there's no limit. */
export function hostsLeft(lostBefore: number, on: string[]): number | null {
  if (on.includes('onebreath')) return 0;
  if (on.includes('short')) return Math.max(0, SHORT_HOSTS - lostBefore - 1);
  return null;
}

/** Pairs that can't both be on: switching one on switches the other off. */
export const CLASHES: [ChallengeId, ChallengeId][] = [['unclassified', 'enforcer'], ['short', 'onebreath']];
export function toggleChallenge(on: ChallengeId[], id: ChallengeId): ChallengeId[] {
  if (on.includes(id)) return on.filter(c => c !== id);
  const out = CLASHES.flatMap(([a, b]) => (a === id ? [b] : b === id ? [a] : []));
  return [...on.filter(c => !out.includes(c)), id].sort((a, b) => CHALLENGES.findIndex(c => c.id === a) - CHALLENGES.findIndex(c => c.id === b));
}
