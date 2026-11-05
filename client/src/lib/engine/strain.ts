// Strain: harder play you switch on once a chapter is done (like Heat in Hades).
// Each switch makes fights harder and pays better. What you pick takes hold when
// the next host wakes, so it can't be dropped right before a hard fight. Pure.

import type { Character } from '../combat/types';

export type StrainId = 'tough' | 'fierce' | 'hot' | 'shut';
export const STRAIN: { id: StrainId; name: string; text: string }[] = [
  { id: 'tough', name: 'Thick skin', text: 'Enemies have 25% more health' },
  { id: 'fierce', name: 'Hard hitters', text: 'Enemies hit 20% harder' },
  { id: 'hot', name: 'Running hot', text: 'Enemies start every fight 30 heat hotter' },
  { id: 'shut', name: 'Shuttered', text: 'The Grey Lane is closed' },
];
/** The numbers: enemy health and attack, extra starting heat, credits per switch on. */
export const STRAIN_NUMBERS = { hp: 1.25, atk: 1.2, heat: 30, credits: 0.25, extraPickAt: 2 };

/** An enemy as the strain makes it. */
export function strainUnit(u: Character, on: StrainId[]): Character {
  if (!on.length) return u;
  const hp = on.includes('tough') ? Math.round(u.maxHp * STRAIN_NUMBERS.hp) : u.maxHp;
  const atk = on.includes('fierce') ? STRAIN_NUMBERS.atk : 1;
  return { ...u, maxHp: hp, currentHp: hp, physicalAttack: Math.round(u.physicalAttack * atk), structuralAttack: Math.round(u.structuralAttack * atk) };
}
/** An enemy's starting heat under the strain. */
export const strainHeat = (heat: number, on: StrainId[]) => (on.includes('hot') ? Math.min(95, heat + STRAIN_NUMBERS.heat) : heat);
/** A win's credits under the strain: +25% a switch. */
export const strainCredits = (credits: number, on: StrainId[]) => Math.round(credits * (1 + STRAIN_NUMBERS.credits * on.length));
/** Extra parts you may take off the bodies after a win (one from two switches on). */
export const strainPicks = (on: StrainId[]) => (on.length >= STRAIN_NUMBERS.extraPickAt ? 1 : 0);
