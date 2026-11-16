// Difficulty changes the enemies, never your rules, so what you learn carries across: Easy enemies are
// softer and hit lighter; Hard ones are tougher, hit harder, and every one of them hunts (ends its turn
// where it also covers the tiles you could step to, as elites and bosses always do). Fixed for a run.

import type { Character } from '../combat/types';
import type { Difficulty } from '../slots';

export const DIFFICULTY: Record<Difficulty, { hp: number; atk: number; hunt: boolean; label: string; text: string }> = {
  easy: { hp: 0.8, atk: 0.8, hunt: false, label: 'Easy', text: 'Enemies are softer and hit lighter.' },
  normal: { hp: 1, atk: 1, hunt: false, label: 'Normal', text: 'As it is meant to be played.' },
  hard: { hp: 1.2, atk: 1.15, hunt: true, label: 'Hard', text: 'Enemies are tougher, hit harder and hunt you.' },
};

/** An enemy as this difficulty makes it. */
export function difficultyUnit(u: Character, d: Difficulty): Character {
  const k = DIFFICULTY[d];
  if (k.hp === 1 && k.atk === 1) return u;
  const hp = Math.max(1, Math.round(u.maxHp * k.hp)), st = Math.round(u.maxStructuralHp * k.hp);
  return { ...u, maxHp: hp, currentHp: hp, maxStructuralHp: st, currentStructuralHp: st, physicalAttack: Math.round(u.physicalAttack * k.atk), structuralAttack: Math.round(u.structuralAttack * k.atk) };
}
