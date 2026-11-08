// Allies: other minds in metal bodies the signal can link with. The roster lives
// in content/allies.json. This file turns a roster entry and its level into a
// body and moves for the fight engine, and answers unlocks and levelling.

import data from '../../content/allies.json';
import type { Character, CombatAction, Item, ItemRarity, AugmentationSlot, DefendSpec, ActionEffects } from './types';
import { BOSS_SCALING, ENEMY_GROWTH, ENEMY_TUNING, scaleBossAction } from './actions';
import { actionForItem, makerOf, normaliseItem, structureOf, HOUSINGS, TRAITS, partsSpDef, type Maker } from './augments';
import { hashSeed } from '../engine/rng';
import type { Perks } from '../engine/playi';

export type AllyEffect = 'attack' | 'taunt' | 'heal' | 'mark' | 'guard' | 'defend';

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
  /** Three lines it lets slip as it levels (at ALLY_STORY_AT). */
  story: string[];
  /** How often it takes its own turn (SPEED.base, 10, is average). */
  speed: number;
  /** Its preset kit: an active implant (its attack) and a passive one, from fixed parts (never rolled). */
  kit: { active: KitPart; passive: KitPart };
}
interface KitPart { slot: AugmentationSlot; name: string; parts?: Item['parts']; passiveParts?: Item['passiveParts']; stats: Partial<Pick<Item, 'attackBonus' | 'defenseBonus' | 'hpBonus' | 'structuralAttackBonus' | 'structuralDefenseBonus' | 'evasionBonus'>> }

/** The grade of an ally's kit at a level: it grows with the ally (common at 1-2 up to legendary at 10). */
export function kitRarity(level: number): ItemRarity {
  return level >= 10 ? 'legendary' : level >= 7 ? 'epic' : level >= 5 ? 'rare' : level >= 3 ? 'uncommon' : 'common';
}
/** An ally's two preset implants at a level, as items (fixed parts; their stats brought to the grade's power). */
export function kitItems(def: AllyDef, level: number): Item[] {
  const maker = def.maker.toUpperCase();
  const rarity = kitRarity(level);
  return (['active', 'passive'] as const).map(k => {
    const part = def.kit[k];
    return normaliseItem({
      id: `kit-${def.id}-${k}`, name: `[${maker}] ${part.name}`, rarity, type: 'augmentation', slot: part.slot, icon: '',
      treeSeed: hashSeed(`${def.id}-${k}`), ...part.stats,
      ...(part.parts ? { parts: part.parts } : {}), ...(part.passiveParts ? { passiveParts: part.passiveParts } : {}),
    } as Item);
  });
}

/** The ally levels at which each story line comes out. */
export const ALLY_STORY_AT = [3, 6, 10];
/** The story lines an ally has let slip by this level. */
export const storySoFar = (def: AllyDef, level: number) => def.story.filter((_, k) => level >= ALLY_STORY_AT[k]);

/** The two implants you give an ally on top of its kit: any one active (`limb`: an extra move) and any one passive (`other`: stats). */
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
  ninety: (p) => { p.noFlinch = true; },
  dust: (p) => { p.windproof = true; },
};

/** Perks with the party's link bonuses added. */
export function withLinks(perks: Perks, party: string[]): Perks {
  const p = { ...perks };
  for (const id of party) ALLY_LINKS[id]?.(p);
  return p;
}

/** Which ally slot an implant goes in: any active implant is its extra move (limb), any passive its stats (other). */
export function allySlotFor(item: Item): AllySlot | null {
  if (item.type !== 'augmentation' || !item.slot) return null;
  return ACTIVE_ALLY.includes(item.slot) ? 'limb' : 'other';
}
const ACTIVE_ALLY: string[] = ['left_arm', 'right_arm', 'left_leg', 'right_leg', 'eyes'];

export const fitsAlly = (def: AllyDef, item: Item) => def.affinity.includes(makerOf(item));
/** Its structure bar against an enemy's of the same unlock level: the bar its implants give, grown with the level it was built for. */
export const ALLY_STRUCTURE = { perLevel: 0.1 };

/** The ally's body at a level, built like a regular enemy of its unlock level, plus its kit's and your implants' stats and structure. */
export function allyUnit(def: AllyDef, level: number, hpMult = 1, gear: AllyGear = {}): Character {
  const L = def.unlockLevel, S = BOSS_SCALING;
  const lv = Math.pow(ALLY_LEVEL_GROWTH, level - 1);
  const gHp = ENEMY_TUNING.hp * Math.pow(ENEMY_GROWTH.hp, L - 1);
  const gAtk = ENEMY_TUNING.atk * Math.pow(ENEMY_GROWTH.atk, L - 1);
  const hp = Math.round((S.hpBase + L * S.hpPerLevel + L * L * S.hpQuadratic) * gHp * def.hp * lv * hpMult * ALLY_TUNING.hp);
  const atk = (def.attack + (L - 1) * S.atkPerLevel) * gAtk * lv * ALLY_TUNING.atk;
  const dfn = (def.defense + (L - 1) * S.defPerLevel) * lv;
  const b = { hp: 0, pa: 0, sa: 0, pd: 0, sd: 0, ev: 0, st: 0 };
  const worn = [...kitItems(def, level).map(it => ({ it, m: 1 })), ...[gear.limb, gear.other].filter((x): x is Item => !!x).map(it => ({ it, m: fitsAlly(def, it) ? AFFINITY.stats : 1 }))];
  for (const { it, m } of worn) {
    b.hp += (it.hpBonus ?? 0) * m; b.pa += (it.attackBonus ?? 0) * m; b.sa += (it.structuralAttackBonus ?? 0) * m;
    b.pd += (it.defenseBonus ?? 0) * m; b.sd += (it.structuralDefenseBonus ?? 0) * m; b.ev += (it.evasionBonus ?? 0) * m;
    // Passive parts: a light housing dodges, a sealed one turns special hits, a Tough trait adds health
    const pp = it.passiveParts;
    if (pp) { b.ev += HOUSINGS[pp.housing]?.evasion ?? 0; b.sd += partsSpDef(it); b.hp += pp.trait ? TRAITS[pp.trait]?.hp ?? 0 : 0; }
    b.st += structureOf(it);
  }
  const maxHp = hp + Math.round(b.hp);
  const structure = Math.round(b.st * (1 + ALLY_STRUCTURE.perLevel * L));
  return {
    id: `ally_${def.id}`, name: def.name,
    maxHp, currentHp: maxHp,
    // A structure bar from the implants it wears, like yours: physical hits wear it first
    maxStructuralHp: structure, currentStructuralHp: structure,
    // What its implants add (they fade as its structure bar empties)
    implantStats: { pa: Math.round(b.pa), sa: Math.round(b.sa), pd: Math.round(b.pd), sd: Math.round(b.sd) },
    physicalAttack: Math.round(atk * 0.6 + b.pa), structuralAttack: Math.round(atk * 0.4 + b.sa),
    physicalDefense: Math.round(dfn * 0.5 + b.pd), structuralDefense: Math.round(dfn * 0.5 + b.sd),
    evasion: Math.round(b.ev), spriteColor: def.color,
  };
}

/** Side effects an ally's attack keeps: what it does to them (moving yourself, haste and venting are the player's). */
const ALLY_FX: (keyof ActionEffects)[] = ['knock', 'pull', 'bleed', 'stun', 'slow', 'ignite', 'crush', 'drain', 'ignoreCover'];

/** An implant's move as an ally uses it: an attack scaled like the ally's own moves (no heat), or a defensive move. */
function allyMoveFrom(def: AllyDef, action: CombatAction, source: Item, own: boolean): AllyMove {
  if (action.type === 'defend' && action.defend) {
    return { type: 'defend', effect: 'defend', name: action.name, description: `${action.description}`, defend: { ...action.defend, step: undefined, haste: undefined, overload: undefined, needs: undefined } as DefendSpec, heatGenerated: 0, heatTransfer: 0, cooldown: 1 };
  }
  const fx: ActionEffects = {};
  for (const k of ALLY_FX) if (action.effects?.[k] !== undefined) (fx as Record<string, unknown>)[k] = action.effects[k];
  return {
    type: 'attack', effect: 'attack', name: action.name, description: action.description,
    damage: Math.round((scaleBossAction(action, def.unlockLevel).damage ?? 0) * ALLY_TUNING.atk * (!own && fitsAlly(def, source) ? AFFINITY.damage : 1)),
    accuracy: action.accuracy, physicalRatio: action.physicalRatio, attackPattern: action.attackPattern ?? 'melee',
    ...(Object.keys(fx).length ? { effects: fx } : {}),
    ...(action.maxTargets ? { maxTargets: action.maxTargets } : {}), ...(action.focused ? { focused: true } : {}),
    heatGenerated: 0, heatTransfer: action.heatTransfer ?? 0,
  };
}

/**
 * The ally's moves at a level: its kit's active implant is its attack (growing with the kit's grade),
 * its own support move stays (numbers grow with its level), and an active implant you give it adds a third move.
 */
export function allyMoves(def: AllyDef, level: number, gear: AllyGear = {}): AllyMove[] {
  const lv = Math.pow(ALLY_LEVEL_GROWTH, level - 1);
  const [kitActive] = kitItems(def, level);
  const kitMove = actionForItem(kitActive);
  const first = def.moves.findIndex(m => m.effect === 'attack');
  const own = def.moves.map((m, n) => {
    if (kitMove && n === first) return { ...allyMoveFrom(def, kitMove, kitActive, true), name: m.name, description: m.description };
    const scaled = scaleBossAction(m, def.unlockLevel);
    return { ...m, ...(scaled.damage ? { damage: Math.round(scaled.damage * lv * ALLY_TUNING.atk) } : {}), heatGenerated: 0, heatTransfer: 0 };
  });
  const given = gear.limb ? actionForItem(gear.limb) : null;
  return given && (given.damage || given.defend) ? [...own, allyMoveFrom(def, given, gear.limb!, false)] : own;
}
