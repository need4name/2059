// Firmware (content/firmware.json): with firmware loaded, its attack takes Strike's
// place, and the firmware grows over many hosts. Room fights won with it loaded give it
// xp (elites more, bosses and set pieces most), and every pointXp of it is a point that
// firmware alone can spend, on its own lane: a main chain of steps and forks hanging off
// it (both sides can be bought), opening a stage a chapter. Nothing resets on death.
// Pure functions; the firmware store keeps the points and ranks and hands the ranks here.

import data from '../../content/firmware.json';
import type { ActionEffects, AccuracyTier, AttackPatternType, CombatAction, PlayerClass } from '../combat/types';
import type { Perks, SurgeKind } from './playi';

export interface FirmwareStep { perk?: FirmwareIdentity['perks']; hp?: number; text: string; scale?: number; heat?: number; accuracy?: AccuracyTier; pattern?: AttackPatternType; fx?: ActionEffects; speed?: number; twin?: 'cool' | 'always' }
/** A firmware's class: its own rule, heat style and Overload ultimate. */
export interface FirmwareIdentity { rule: string; heat: string; ultimate: string; surge: SurgeKind; perks: { chain?: boolean; heatGenBonus?: number; ventMult?: number; coolAct?: number; extraCooling?: number; reflexMove?: boolean; transferBonus?: number; splicePairs?: number; spliceHeatCut?: number; implantDamage?: number; implantTreeDiscount?: number; extraSlots?: number; healthCostScale?: number; implantHeatCut?: number; kinship?: boolean; activeStatMult?: number } }
/** A neuron on a firmware's lane: what one rank adds (`step`), what a rank costs in that firmware's points, its stage. */
export interface LaneNode { id: string; name: string; text: string; cost: number; ranks: number; stage: number; step: Omit<FirmwareStep, 'text'>; after?: string; fork?: boolean }
/** The boss that holds a firmware: who it is, the traits the firmware gives it, and what it fights with
 *  (`implants`: its own implants' moves; neither: its own roster, as the King keeps his phases). */
export interface FirmwareHolder { enemy: string; traits?: string[]; moves?: CombatAction[]; implants?: boolean }
interface FirmwareDef { identity: FirmwareIdentity; base: CombatAction; scale: number; /** Its lane's colour on the Memory page. */ color: string; lane: LaneNode[]; /** The boss that opens it: its chapter and threat, and the points it opens with. */ opens: { chapter: string; threat: number; points: number }; holder: FirmwareHolder; /** Speed it gives from the start. */ speed?: number }
const D = data as unknown as { xp: { win: number; elite: number; boss: number }; pointXp: number; firmware: Partial<Record<PlayerClass, FirmwareDef>> };

export const FIRMWARE = D.firmware;

/** Ranks bought on each firmware's lane. The store keeps them and sets them here. */
export type LaneRanks = Record<string, number>;
let laneRanks: Partial<Record<PlayerClass, LaneRanks>> = {};
export const setLaneRanks = (r: typeof laneRanks) => { laneRanks = r; };
export const laneRanksOf = (cls: PlayerClass): LaneRanks => laneRanks[cls] ?? {};

/** A firmware's lane. */
export const laneOf = (cls: PlayerClass): LaneNode[] => FIRMWARE[cls]?.lane ?? [];
/** The lane's stages open a chapter at a time: stage 1 in chapter one, 2 in chapter two, 3 from chapter three. */
export const laneStageFor = (chapterIndex: number) => Math.min(3, Math.max(1, chapterIndex + 1));
/** Could a rank of this lane node be bought (points aside)? The node before it must be kept, its stage open, a rank left. */
export function laneOpen(cls: PlayerClass, id: string, ranks: LaneRanks, stage: number): boolean {
  const n = laneOf(cls).find(x => x.id === id);
  if (!n || n.stage > stage || (ranks[id] ?? 0) >= n.ranks) return false;
  return !n.after || (ranks[n.after] ?? 0) > 0;
}
/** The steps a firmware's lane has bought, a step for each rank. */
export function stepsOf(cls: PlayerClass, ranks: LaneRanks = laneRanksOf(cls)): FirmwareStep[] {
  return laneOf(cls).flatMap(n => Array.from({ length: Math.min(n.ranks, ranks[n.id] ?? 0) }, () => ({ ...n.step, text: n.name })));
}
/** Whose firmware each is (sets what its attack does extra when you're hot). */
export const FIRMWARE_MAKER: Partial<Record<PlayerClass, string>> = { melee: 'VOLKOV', ranged: 'KIZUNA', swift: 'IOA', crowd: 'TIANXIA', splice: 'PATCHWORK' };
// (the Wretch has no maker of its own: its Strike stays plain; its implants carry theirs)
export const FIRMWARE_XP = D.xp;
/** Xp a firmware earns for each of its own points. */
export const POINT_XP = D.pointXp;

/** XP a won room fight gives the loaded firmware: a boss or set piece most, an elite more, anyone else one. */
export const firmwareXpFor = (threat: number) => (threat % 10 === 0 ? FIRMWARE_XP.boss : threat % 5 === 0 ? FIRMWARE_XP.elite : FIRMWARE_XP.win);

/** A firmware's attack, with what its lane has bought. Null with no firmware. */
export function firmwareAttack(cls: PlayerClass, ranks: LaneRanks = laneRanksOf(cls)): CombatAction | null {
  const def = FIRMWARE[cls];
  if (!def) return null;
  let scale = def.scale, heat = def.base.heatGenerated ?? 0;
  let accuracy = def.base.accuracy, pattern = def.base.attackPattern;
  let effects: ActionEffects = { ...(def.base.effects ?? {}) };
  for (const step of stepsOf(cls, ranks)) {
    scale += step.scale ?? 0;
    heat += step.heat ?? 0;
    if (step.accuracy) accuracy = step.accuracy;
    if (step.pattern) pattern = step.pattern;
    // Chances add up rank by rank (a stun, a drain); the rest switch on
    for (const [k, v] of Object.entries(step.fx ?? {})) {
      const was = (effects as Record<string, unknown>)[k];
      (effects as Record<string, unknown>)[k] = typeof v === 'number' && typeof was === 'number' ? Math.round((was + v) * 1000) / 1000 : v;
    }
  }
  return {
    ...def.base,
    firmware: true,
    maker: FIRMWARE_MAKER[cls],
    // The attack's own damage grows with what its lane has bought; your Attack already counts in every hit, so it isn't counted twice
    damage: Math.round((def.base.damage ?? 10) * scale),
    heatGenerated: heat, accuracy, attackPattern: pattern,
    effects: Object.keys(effects).length ? effects : undefined,
  };
}

/** What a firmware does for its wearer besides the attack: extra speed, and acting twice ('cool': at 40 heat or less; 'always'). */
export function firmwarePassives(cls: PlayerClass, ranks: LaneRanks = laneRanksOf(cls)): { speed: number; twin: 'cool' | 'always' | null } {
  const def = FIRMWARE[cls];
  if (!def) return { speed: 0, twin: null };
  let speed = def.speed ?? 0, twin: 'cool' | 'always' | null = null;
  for (const step of stepsOf(cls, ranks)) {
    speed += step.speed ?? 0;
    if (step.twin === 'always' || (step.twin === 'cool' && twin !== 'always')) twin = step.twin;
  }
  return { speed, twin };
}
/** The heat at or below which the wearer acts twice in a turn (100: every turn), or null. */
export const TWIN_HEAT = { cool: 40, always: 100 };

/** The firmware the boss at this chapter's threat holds, if any (chapter one's threat 5 and King, each later chapter's threat 5). */
export function firmwareHeldAt(chapter: string, threat: number): PlayerClass | null {
  const hit = (Object.entries(FIRMWARE) as [PlayerClass, FirmwareDef][]).find(([, d]) => d.opens.chapter === chapter && d.opens.threat === threat);
  return hit ? hit[0] : null;
}
/** Who holds a firmware, and how it fights. */
export const holderOf = (cls: PlayerClass): FirmwareHolder | null => FIRMWARE[cls]?.holder ?? null;
/** The points a firmware opens with (a later chapter's firmware arrives ready to grow). */
export const openingPoints = (cls: PlayerClass) => FIRMWARE[cls]?.opens.points ?? 0;

/** A firmware's class (rule, heat style, ultimate), or null with none loaded. */
export const identityOf = (cls: PlayerClass): FirmwareIdentity | null => FIRMWARE[cls]?.identity ?? null;
/** The host's perks with its firmware's class rules on top. */
export function withClass(p: Perks, cls: PlayerClass, ranks: LaneRanks = laneRanksOf(cls)): Perks {
  const id = identityOf(cls);
  if (!id) return p;
  // The class's own perks, plus what its lane has bought
  const k = { ...id.perks };
  let hp = 0;
  for (const st of stepsOf(cls, ranks)) {
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
