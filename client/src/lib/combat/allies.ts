// Allies: other minds in metal bodies the signal can link with. The roster lives
// in content/allies.json. This file turns a roster entry and its level into a
// body and moves for the fight engine, and answers unlocks and levelling.

import data from '../../content/allies.json';
import type { Character, CombatAction } from './types';
import { BOSS_SCALING, ENEMY_GROWTH, ENEMY_TUNING, scaleBossAction } from './actions';

export type AllyEffect = 'attack' | 'taunt' | 'heal' | 'mark' | 'guard';

/** An ally's move. Moves never change; only their numbers grow with level. */
export interface AllyMove extends CombatAction {
  effect: AllyEffect;
  /** Rounds before it can be used again. */
  cooldown?: number;
  /** Heal share of your max health, or the mark's damage bonus. */
  amount?: number;
}

export interface AllyDef {
  id: string; name: string; maker: string; role: string; unlockLevel: number; color: string; blurb: string;
  /** Health relative to a regular enemy of the unlock level. */
  hp: number;
  /** Base attack and defence, before the unlock level's scaling. */
  attack: number; defense: number;
  /** Tiles it can move each round. */
  move: number;
  moves: AllyMove[];
}

export const ALLIES = (data as { allies: AllyDef[] }).allies;
export const allyDef = (id: string) => ALLIES.find(a => a.id === id);

export const ALLY_MAX_LEVEL = 10;
/** Each ally level adds this much to health, attack, defence and move damage. */
export const ALLY_LEVEL_GROWTH = 1.08;
/** Overall ally strength: the main knob for how much an ally carries a host. */
export const ALLY_TUNING = { hp: 0.55, atk: 0.75 };
/** Fights won to go from level n to n + 1. */
export const allyXpToNext = (level: number) => level + 1;

/** Allies a best-ever cleared level has unlocked. */
export const alliesUnlockedBy = (bestCleared: number) => ALLIES.filter(a => bestCleared >= a.unlockLevel).map(a => a.id);

/** The ally's body at a level, built like a regular enemy of its unlock level. */
export function allyUnit(def: AllyDef, level: number, hpMult = 1): Character {
  const L = def.unlockLevel, S = BOSS_SCALING;
  const lv = Math.pow(ALLY_LEVEL_GROWTH, level - 1);
  const gHp = ENEMY_TUNING.hp * Math.pow(ENEMY_GROWTH.hp, L - 1);
  const gAtk = ENEMY_TUNING.atk * Math.pow(ENEMY_GROWTH.atk, L - 1);
  const hp = Math.round((S.hpBase + L * S.hpPerLevel + L * L * S.hpQuadratic) * gHp * def.hp * lv * hpMult * ALLY_TUNING.hp);
  const atk = (def.attack + (L - 1) * S.atkPerLevel) * gAtk * lv * ALLY_TUNING.atk;
  const dfn = (def.defense + (L - 1) * S.defPerLevel) * lv;
  return {
    id: `ally_${def.id}`, name: def.name,
    maxHp: hp, currentHp: hp,
    // No structure bar: hits land on the body (half the structural part spills over)
    maxStructuralHp: 0, currentStructuralHp: 0,
    physicalAttack: Math.round(atk * 0.6), structuralAttack: Math.round(atk * 0.4),
    physicalDefense: Math.round(dfn * 0.5), structuralDefense: Math.round(dfn * 0.5),
    evasion: 0, spriteColor: def.color,
  };
}

/** The ally's moves at a level: damage scales like an enemy's of its unlock level. */
export function allyMoves(def: AllyDef, level: number): AllyMove[] {
  const lv = Math.pow(ALLY_LEVEL_GROWTH, level - 1);
  return def.moves.map(m => {
    const scaled = scaleBossAction(m, def.unlockLevel);
    return { ...m, ...(scaled.damage ? { damage: Math.round(scaled.damage * lv * ALLY_TUNING.atk) } : {}), heatGenerated: 0, heatTransfer: 0 };
  });
}
