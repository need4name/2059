// Firmware (content/firmware.json): with firmware loaded, its attack takes Strike's
// place, and the firmware grows over many hosts. Room fights won with it loaded give
// it xp (elites more, bosses and set pieces most); its level never resets on death.
// Each level from 2 adds one thing to its attack, so the strong version is earned.
// Pure functions; the firmware store keeps the xp.

import data from '../../content/firmware.json';
import type { ActionEffects, AccuracyTier, AttackPatternType, CombatAction, PlayerClass } from '../combat/types';
import type { Perks, SurgeKind } from './playi';

export interface FirmwareStep { text: string; scale?: number; heat?: number; accuracy?: AccuracyTier; pattern?: AttackPatternType; fx?: ActionEffects; speed?: number; twin?: 'cool' | 'always' }
/** A firmware's class: its own rule, heat style and Overload ultimate. */
export interface FirmwareIdentity { rule: string; heat: string; ultimate: string; surge: SurgeKind; perks: { chain?: boolean; heatGenBonus?: number; ventMult?: number; coolAct?: number; extraCooling?: number; reflexMove?: boolean; transferBonus?: number } }
interface FirmwareDef { identity: FirmwareIdentity; base: CombatAction; scale: number; levels: FirmwareStep[]; /** Opens when a host wins a room fight at this threat or deeper (none: opens with a death; see handlePlayerDefeated). */ unlockAt?: number; /** Speed it gives from level 1. */ speed?: number }
const D = data as unknown as { xp: { win: number; elite: number; boss: number }; xpToNext: number[]; firmware: Partial<Record<PlayerClass, FirmwareDef>> };

export const FIRMWARE = D.firmware;
/** Whose firmware each is (sets what its attack does extra when you're hot). */
export const FIRMWARE_MAKER: Partial<Record<PlayerClass, string>> = { melee: 'VOLKOV', ranged: 'KIZUNA', swift: 'IOA', crowd: 'TIANXIA' };
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
export const levelStep = (cls: PlayerClass, level: number): FirmwareStep | null => FIRMWARE[cls]?.levels[level - 2] ?? null;

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
  for (const step of def.levels.slice(0, Math.max(0, level - 1))) {
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
  for (const step of def.levels.slice(0, Math.max(0, level - 1))) {
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
export function withClass(p: Perks, cls: PlayerClass): Perks {
  const id = identityOf(cls);
  if (!id) return p;
  const k = id.perks;
  return {
    ...p,
    chain: p.chain || !!k.chain,
    reflexMove: p.reflexMove || !!k.reflexMove,
    doubleActionHeat: Math.max(p.doubleActionHeat, k.coolAct ?? 0),
    extraCooling: p.extraCooling + (k.extraCooling ?? 0),
    heatGenBonus: p.heatGenBonus + (k.heatGenBonus ?? 0),
    ventMult: p.ventMult * (k.ventMult ?? 1),
    transferBonus: p.transferBonus + (k.transferBonus ?? 0),
    surgeKind: id.surge,
  };
}
