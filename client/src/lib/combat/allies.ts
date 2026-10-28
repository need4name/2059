// Allies: other minds in metal bodies the signal can link with. The roster lives
// in content/allies.json. This file turns a roster entry and its level into a
// body and moves for the fight engine, and answers unlocks and levelling.

import data from '../../content/allies.json';
import type { Character, CombatAction, Item } from './types';
import { BOSS_SCALING, ENEMY_GROWTH, ENEMY_TUNING, scaleBossAction } from './actions';
import { actionForItem, makerOf, type Maker } from './augments';
import type { Perks } from '../engine/playi';

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
  /** Makers it gets more out of. */
  affinity: Maker[];
  /** What riding with it does for you (the effect is ALLY_LINKS[id]). */
  link: string;
  moves: AllyMove[];
}

/** The two implants an ally wears: a limb (its attack) and one other (stats only). */
export interface AllyGear { limb?: Item; other?: Item }
export type AllySlot = keyof AllyGear;

export const ALLIES = (data as { allies: AllyDef[] }).allies;
export const allyDef = (id: string) => ALLIES.find(a => a.id === id);

export const ALLY_MAX_LEVEL = 10;
/** Each ally level adds this much to health, attack, defence and move damage. */
export const ALLY_LEVEL_GROWTH = 1.08;
/** Overall ally strength: the main knob for how much an ally carries a host. */
export const ALLY_TUNING = { hp: 0.55, atk: 0.75 };
/** Fights won to go from level n to n + 1. */
export const allyXpToNext = (level: number) => level + 1;

/** Allies a best-ever cleared level unlocked, for upgrading old saves (only the five there were then). */
const FIRST_ROSTER = ['bale', 'matron', 'ghostline', 'ward', 'breaker'];
export const alliesUnlockedBy = (bestCleared: number) => ALLIES.filter(a => FIRST_ROSTER.includes(a.id) && bestCleared >= a.unlockLevel).map(a => a.id);

/** An implant from an affinity maker: its stats count this much more, a limb hits this much harder. */
export const AFFINITY = { stats: 1.5, damage: 1.25 };

/** What each ally does for you while it rides with the host (text in allies.json). */
export const ALLY_LINKS: Record<string, (p: Perks) => void> = {
  bale: (p) => { p.structureMult *= 1.1; },
  matron: (p) => { p.braceHeal += 0.05; },
  ghostline: (p) => { p.firstStrikePrecise = true; },
  ward: (p) => { p.partingTakenMult *= 0.5; },
  breaker: (p) => { p.collisionMult *= 1.5; },
  tally: (p) => { p.sidestep = true; },
};

/** Perks with the party's link bonuses added. */
export function withLinks(perks: Perks, party: string[]): Perks {
  const p = { ...perks };
  for (const id of party) ALLY_LINKS[id]?.(p);
  return p;
}

/** Which ally slot an implant goes in: a damaging active implant is a limb, anything else the other slot. */
export function allySlotFor(item: Item): AllySlot | null {
  if (item.type !== 'augmentation' || !item.slot) return null;
  return (actionForItem(item)?.damage ?? 0) > 0 ? 'limb' : 'other';
}

export const fitsAlly = (def: AllyDef, item: Item) => def.affinity.includes(makerOf(item));

/** The ally's body at a level, built like a regular enemy of its unlock level, plus its implants' stats. */
export function allyUnit(def: AllyDef, level: number, hpMult = 1, gear: AllyGear = {}): Character {
  const L = def.unlockLevel, S = BOSS_SCALING;
  const lv = Math.pow(ALLY_LEVEL_GROWTH, level - 1);
  const gHp = ENEMY_TUNING.hp * Math.pow(ENEMY_GROWTH.hp, L - 1);
  const gAtk = ENEMY_TUNING.atk * Math.pow(ENEMY_GROWTH.atk, L - 1);
  const hp = Math.round((S.hpBase + L * S.hpPerLevel + L * L * S.hpQuadratic) * gHp * def.hp * lv * hpMult * ALLY_TUNING.hp);
  const atk = (def.attack + (L - 1) * S.atkPerLevel) * gAtk * lv * ALLY_TUNING.atk;
  const dfn = (def.defense + (L - 1) * S.defPerLevel) * lv;
  const b = { hp: 0, pa: 0, sa: 0, pd: 0, sd: 0 };
  for (const it of [gear.limb, gear.other]) {
    if (!it) continue;
    const m = fitsAlly(def, it) ? AFFINITY.stats : 1;
    b.hp += (it.hpBonus ?? 0) * m; b.pa += (it.attackBonus ?? 0) * m; b.sa += (it.structuralAttackBonus ?? 0) * m;
    b.pd += (it.defenseBonus ?? 0) * m; b.sd += (it.structuralDefenseBonus ?? 0) * m;
  }
  const maxHp = hp + Math.round(b.hp);
  return {
    id: `ally_${def.id}`, name: def.name,
    maxHp, currentHp: maxHp,
    // No structure bar: hits land on the body (half the structural part spills over)
    maxStructuralHp: 0, currentStructuralHp: 0,
    physicalAttack: Math.round(atk * 0.6 + b.pa), structuralAttack: Math.round(atk * 0.4 + b.sa),
    physicalDefense: Math.round(dfn * 0.5 + b.pd), structuralDefense: Math.round(dfn * 0.5 + b.sd),
    evasion: 0, spriteColor: def.color,
  };
}

/** The ally's moves at a level: damage scales like an enemy's of its unlock level. A limb implant replaces its first attack. */
export function allyMoves(def: AllyDef, level: number, gear: AllyGear = {}): AllyMove[] {
  const lv = Math.pow(ALLY_LEVEL_GROWTH, level - 1);
  const limb = gear.limb ? actionForItem(gear.limb) : null;
  const first = def.moves.findIndex(m => m.effect === 'attack');
  return def.moves.map((m, n) => {
    if (limb && n === first && limb.damage) {
      return {
        type: 'attack', effect: 'attack', name: limb.name, description: `${gear.limb!.name}, worn by ${def.name}`,
        // Scaled like the ally's own moves, so a better implant out-hits its built-in attack
        damage: Math.round((scaleBossAction(limb, def.unlockLevel).damage ?? 0) * lv * ALLY_TUNING.atk * (fitsAlly(def, gear.limb!) ? AFFINITY.damage : 1)),
        accuracy: limb.accuracy, physicalRatio: limb.physicalRatio, attackPattern: limb.attackPattern ?? 'melee',
        heatGenerated: 0, heatTransfer: 0,
      };
    }
    const scaled = scaleBossAction(m, def.unlockLevel);
    return { ...m, ...(scaled.damage ? { damage: Math.round(scaled.damage * lv * ALLY_TUNING.atk) } : {}), heatGenerated: 0, heatTransfer: 0 };
  });
}
