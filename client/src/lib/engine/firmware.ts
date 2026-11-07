// Firmware (content/firmware.json): with firmware loaded, its attack takes Strike's
// place, and the firmware grows over many hosts. Room fights won with it loaded give
// it xp (elites more, bosses and set pieces most); its level never resets on death.
// Each level from 2 adds one thing to its attack, so the strong version is earned.
// Pure functions; the firmware store keeps the xp.

import data from '../../content/firmware.json';
import type { ActionEffects, AccuracyTier, AttackPatternType, CombatAction, PlayerClass } from '../combat/types';
import type { Perks, SurgeKind } from './playi';

export interface FirmwareStep { perk?: FirmwareIdentity['perks']; hp?: number; text: string; scale?: number; heat?: number; accuracy?: AccuracyTier; pattern?: AttackPatternType; fx?: ActionEffects; speed?: number; twin?: 'cool' | 'always' }
/** A firmware's class: its own rule, heat style and Overload ultimate. */
export interface FirmwareIdentity { rule: string; heat: string; ultimate: string; surge: SurgeKind; perks: { chain?: boolean; heatGenBonus?: number; ventMult?: number; coolAct?: number; extraCooling?: number; reflexMove?: boolean; transferBonus?: number; splicePairs?: number; spliceHeatCut?: number; implantDamage?: number; implantTreeDiscount?: number; extraSlots?: number; healthCostScale?: number; implantHeatCut?: number; kinship?: boolean; activeStatMult?: number } }
/** A level: one step, or a fork of two the player picks between. */
export type FirmwareLevel = FirmwareStep | { choose: [FirmwareStep, FirmwareStep] };
interface FirmwareDef { identity: FirmwareIdentity; base: CombatAction; scale: number; levels: FirmwareLevel[]; /** Opens when a host wins a room fight at this threat or deeper (none: opens with a death; see handlePlayerDefeated). */ unlockAt?: number; /** Speed it gives from level 1. */ speed?: number }
const D = data as unknown as { xp: { win: number; elite: number; boss: number }; xpToNext: number[]; firmware: Partial<Record<PlayerClass, FirmwareDef>> };

export const FIRMWARE = D.firmware;

/** Which side of each fork the player took, per firmware and level (0 or 1; 0 if never chosen). The store keeps it and sets it here. */
let forkChoices: Partial<Record<PlayerClass, Record<number, 0 | 1>>> = {};
export const setForkChoices = (c: typeof forkChoices) => { forkChoices = c; };
export const forkChoice = (cls: PlayerClass, level: number): 0 | 1 => forkChoices[cls]?.[level] ?? 0;
/** The two options at a forked level, or null if the level is a single step. */
export function levelOptions(cls: PlayerClass, level: number): [FirmwareStep, FirmwareStep] | null {
  const l = FIRMWARE[cls]?.levels[level - 2];
  return l && 'choose' in l ? l.choose : null;
}
/** The steps a firmware has taken by this level, forks resolved by the player's choices. */
export function stepsTo(cls: PlayerClass, level: number): FirmwareStep[] {
  return (FIRMWARE[cls]?.levels ?? []).slice(0, Math.max(0, level - 1)).map((l, k) => ('choose' in l ? l.choose[forkChoice(cls, k + 2)] : l));
}
/** Whose firmware each is (sets what its attack does extra when you're hot). */
export const FIRMWARE_MAKER: Partial<Record<PlayerClass, string>> = { melee: 'VOLKOV', ranged: 'KIZUNA', swift: 'IOA', crowd: 'TIANXIA', splice: 'PATCHWORK' };
// (the Wretch has no maker of its own: its Strike stays plain; its implants carry theirs)
export const FIRMWARE_XP = D.xp;
export const XP_TO_NEXT = D.xpToNext;
/** The highest level a firmware reaches. */
export const MAX_FIRMWARE_LEVEL = D.xpToNext.length + 1;

/** The level a firmware is at with this much xp, and how far it is to the next. */
export function firmwareLevel(xp: number): { level: number; into: number; need: number } {
  let level = 1, left = xp;
  while (level < MAX_FIRMWARE_LEVEL && left >= XP_TO_NEXT[level - 1]) { left -= XP_TO_NEXT[level - 1]; level++; }
  return { level, into: level >= MAX_FIRMWARE_LEVEL ? 0 : left, need: level >= MAX_FIRMWARE_LEVEL ? 0 : XP_TO_NEXT[level - 1] };
}

/** XP a won room fight gives the loaded firmware: a boss or set piece most, an elite more, anyone else one. */
export const firmwareXpFor = (threat: number) => (threat % 10 === 0 ? FIRMWARE_XP.boss : threat % 5 === 0 ? FIRMWARE_XP.elite : FIRMWARE_XP.win);

/** What a level adds, for the screen: "Level 5: Optical lock: always full damage". */
export const levelStep = (cls: PlayerClass, level: number): FirmwareStep | null => (level >= 2 ? stepsTo(cls, level)[level - 2] ?? null : null);

/**
 * A firmware's attack at a level. Its damage is the level's scale times the wearer's
 * physical attack (pass it; without, the base damage stands). Null with no firmware.
 */
export function firmwareAttack(cls: PlayerClass, level: number, physicalAttack?: number): CombatAction | null {
  const def = FIRMWARE[cls];
  if (!def) return null;
  let scale = def.scale, heat = def.base.heatGenerated ?? 0;
  let accuracy = def.base.accuracy, pattern = def.base.attackPattern;
  let effects: ActionEffects = { ...(def.base.effects ?? {}) };
  for (const step of stepsTo(cls, level)) {
    scale += step.scale ?? 0;
    heat += step.heat ?? 0;
    if (step.accuracy) accuracy = step.accuracy;
    if (step.pattern) pattern = step.pattern;
    if (step.fx) effects = { ...effects, ...step.fx };
  }
  return {
    ...def.base,
    maker: FIRMWARE_MAKER[cls],
    damage: physicalAttack !== undefined ? Math.floor(physicalAttack * scale) : def.base.damage,
    heatGenerated: heat, accuracy, attackPattern: pattern,
    effects: Object.keys(effects).length ? effects : undefined,
  };
}

/** What a firmware does for its wearer besides the attack: extra speed, and acting twice ('cool': at 40 heat or less; 'always'). */
export function firmwarePassives(cls: PlayerClass, level: number): { speed: number; twin: 'cool' | 'always' | null } {
  const def = FIRMWARE[cls];
  if (!def) return { speed: 0, twin: null };
  let speed = def.speed ?? 0, twin: 'cool' | 'always' | null = null;
  for (const step of stepsTo(cls, level)) {
    speed += step.speed ?? 0;
    if (step.twin === 'always' || (step.twin === 'cool' && twin !== 'always')) twin = step.twin;
  }
  return { speed, twin };
}
/** The heat at or below which the wearer acts twice in a turn (100: every turn), or null. */
export const TWIN_HEAT = { cool: 40, always: 100 };

/** Firmware that opens by going deep (a won room fight at its `unlockAt` threat or deeper), in the order they open. */
export const DEEP_FIRMWARE = (Object.entries(FIRMWARE) as [PlayerClass, FirmwareDef][]).filter(([, d]) => d.unlockAt !== undefined).sort((a, b) => a[1].unlockAt! - b[1].unlockAt!).map(([cls, d]) => ({ cls, at: d.unlockAt! }));
/** Firmware a won room fight at this threat opens (that isn't open yet). */
export const opensAt = (threat: number, open: PlayerClass[]) => DEEP_FIRMWARE.filter(f => threat >= f.at && !open.includes(f.cls)).map(f => f.cls);

/** A firmware's class (rule, heat style, ultimate), or null with none loaded. */
export const identityOf = (cls: PlayerClass): FirmwareIdentity | null => FIRMWARE[cls]?.identity ?? null;
/** The host's perks with its firmware's class rules on top. */
export function withClass(p: Perks, cls: PlayerClass, level = 1): Perks {
  const id = identityOf(cls);
  if (!id) return p;
  // The class's own perks, plus what its levels (and the forks taken) add
  const k = { ...id.perks };
  let hp = 0;
  for (const st of stepsTo(cls, level)) {
    hp += st.hp ?? 0;
    for (const [key, v] of Object.entries(st.perk ?? {}) as [keyof FirmwareIdentity['perks'], number | boolean][]) {
      if (typeof v === 'boolean') (k as Record<string, unknown>)[key] = v;
      else if (key === 'coolAct') k.coolAct = Math.max(k.coolAct ?? 0, v);
      else if (key === 'ventMult' || key === 'healthCostScale' || key === 'activeStatMult') (k as Record<string, number>)[key] = ((k as Record<string, number>)[key] ?? 1) * v;
      else (k as Record<string, number>)[key] = ((k as Record<string, number>)[key] ?? 0) + v;
    }
  }
  return {
    ...p,
    chain: p.chain || !!k.chain,
    reflexMove: p.reflexMove || !!k.reflexMove,
    doubleActionHeat: Math.max(p.doubleActionHeat, k.coolAct ?? 0),
    extraCooling: p.extraCooling + (k.extraCooling ?? 0),
    heatGenBonus: p.heatGenBonus + (k.heatGenBonus ?? 0),
    ventMult: p.ventMult * (k.ventMult ?? 1),
    transferBonus: p.transferBonus + (k.transferBonus ?? 0),
    splicePairs: p.splicePairs + (k.splicePairs ?? 0),
    spliceHeatCut: p.spliceHeatCut + (k.spliceHeatCut ?? 0),
    surgeKind: id.surge,
    maxHpBonus: p.maxHpBonus + hp,
    // The Wretch: implants hit harder, grow cheaper, cost it more health
    implantDamage: p.implantDamage + (k.implantDamage ?? 0),
    implantTreeDiscount: p.implantTreeDiscount + (k.implantTreeDiscount ?? 0),
    extraSlots: p.extraSlots + (k.extraSlots ?? 0),
    healthCostMult: p.healthCostMult * (k.healthCostScale ?? 1),
    implantHeatCut: p.implantHeatCut + (k.implantHeatCut ?? 0),
    kinship: p.kinship || !!k.kinship,
    activeStatMult: p.activeStatMult * (k.activeStatMult ?? 1),
  };
}

/** Splice: what each spliced pair costs (heat every turn, before any Tolerance or Symbiote cut; a share off the structure bar). */
export const SPLICE = { heatPerPair: 2, structureCut: 0.1 };
/** The host's perks with the cost of the spliced pairs it wears (Splice only; any other firmware wears none). */
export function withSplice(p: Perks, pairs: number): Perks {
  if (pairs <= 0) return p;
  return {
    ...p,
    splicedNow: pairs,
    extraCooling: p.extraCooling - pairs * Math.max(0, SPLICE.heatPerPair - p.spliceHeatCut),
    structureMult: p.structureMult * Math.max(0.3, 1 - SPLICE.structureCut * pairs),
  };
}

/** Firmware resonance (play-i node): each firmware's own rule grows stronger, its own way. */
export function withResonance(p: Perks, cls: PlayerClass): Perks {
  if (!p.resonance) return p;
  switch (cls) {
    case 'melee': return { ...p, chainVent: p.chainVent + 15 };                                                    // takedowns chain and vent
    case 'ranged': return { ...p, doubleActionHeat: p.doubleActionHeat > 0 ? p.doubleActionHeat + 10 : 0 };       // act twice up to 35
    case 'swift': return { ...p, reflexReach: Math.max(p.reflexReach, 2.05) };                                    // the free step is 2 tiles
    case 'crowd': return { ...p, overheatSpread: p.overheatSpread + 20 };                                         // overheating spreads
    case 'splice': return { ...p, splicePairs: p.splicePairs + 1 };                                                // one more pair
    case 'wretch': return { ...p, implantDamage: p.implantDamage + 0.1 };                                         // implants hit harder still
    case 'none': return { ...p, strikeHot: true };                                                                 // a hot Strike sets them alight
    default: return p;
  }
}
