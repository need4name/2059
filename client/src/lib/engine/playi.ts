// The play-i tree: what the signal learns across hosts. The data lives in
// content/playi-tree.json; this file answers which nodes are open, deals the
// two-card offer after a death, and turns owned nodes into the modifiers the
// rules engine and the new host read.

import tree from '../../content/playi-tree.json';
import { random } from './rng';

export interface PlayiNode {
  id: string; branch: string; tier: number; name: string; effect: string;
  requires: string[]; capstone?: boolean; needsAlly?: boolean;
}
export interface PlayiBranch { id: string; name: string; theme: string }

export const PLAYI_BRANCHES = (tree as { branches: PlayiBranch[] }).branches;
export const PLAYI_NODES = (tree as { nodes: PlayiNode[] }).nodes;
const byId = new Map(PLAYI_NODES.map(n => [n.id, n]));
export const playiNode = (id: string) => byId.get(id);

/** Repeatable small reward offered when fewer than two nodes are open. */
export const FALLBACK_ID = 'fragment';
export const FALLBACK_NODE: PlayiNode = {
  id: FALLBACK_ID, branch: 'signal', tier: 0, name: 'Signal fragment', effect: '+5 max health (can be taken again)', requires: [],
};

/** Nodes not yet owned whose requirements are met (any one of `requires`). */
export function openNodes(owned: readonly string[], hasAlly: boolean): PlayiNode[] {
  const have = new Set(owned);
  return PLAYI_NODES.filter(n =>
    !have.has(n.id)
    && (!n.needsAlly || hasAlly)
    && (n.requires.length === 0 || n.requires.some(r => have.has(r))));
}

/** The two cards shown after a death: random open nodes, topped up with the fallback. */
export function dealOffer(owned: readonly string[], hasAlly: boolean): string[] {
  const pool = openNodes(owned, hasAlly).map(n => n.id);
  const picks: string[] = [];
  while (picks.length < 2 && pool.length) picks.push(pool.splice(Math.floor(random() * pool.length), 1)[0]);
  while (picks.length < 2) picks.push(FALLBACK_ID);
  return picks;
}

// ── What owned nodes do ──────────────────────────────────────────────────────

export interface Perks {
  moveBonus: number;          // extra movement tiles
  reflexMove: boolean;        // move 1 tile after attacking if you haven't moved
  hazardMult: number;         // damage you take from hazards
  sidestep: boolean;          // first heavy aimed at you each fight misses
  phaseStep: boolean;         // move through enemies and obstacles
  extraCooling: number;       // extra heat shed each round
  startHeat: number;          // heat at the start of each fight
  hotTakenMult: number;       // scales the extra damage taken while hot (1 = normal)
  doubleActionHeat: number;   // act twice at or below this heat
  ventBonus: number;          // extra cooling on brace
  runaway: boolean;           // move at 100 heat, critical crit chance 45%
  damageMult: number;         // all your damage
  extraSlots: number;         // extra fight-bar slots
  flankMult: number;          // multiplies flank bonuses
  firstStrikePrecise: boolean;
  finisherBonus: number;      // extra damage vs enemies under 30% health
  chain: boolean;             // a takedown gives another action
  healthCostMult: number;     // implant health costs
  structureMult: number;      // structure bar
  startImplant: boolean;      // new hosts start with a common active implant
  startPoints: number;        // new hosts start with upgrade points
  pickOfTwo: boolean;         // choose 1 of 2 when a win drops an implant
  braceRepair: number;        // share of structure a brace repairs
  maxHpBonus: number;
  startBioStims: number;
  priceMult: number;          // Grey Lane prices
  holdfast: boolean;          // once per host, survive a killing blow on 1 health
  damageTakenMult: number;    // everything you take
  allyHpMult: number;
  allyXpMult: number;
  coordinated: boolean;       // +20% vs an enemy your ally hit this round
  allySlots: number;
  braceHeal: number;          // share of max health a brace heals (Matron's link)
  partingTakenMult: number;   // damage you take from parting blows (Ward's link)
  collisionMult: number;      // collision damage enemies take from your knockbacks (Breaker's link)
}

export const NO_PERKS: Perks = {
  moveBonus: 0, reflexMove: false, hazardMult: 1, sidestep: false, phaseStep: false,
  extraCooling: 0, startHeat: 20, hotTakenMult: 1, doubleActionHeat: 15, ventBonus: 0, runaway: false,
  damageMult: 1, extraSlots: 0, flankMult: 1, firstStrikePrecise: false, finisherBonus: 0, chain: false,
  healthCostMult: 1, structureMult: 1, startImplant: false, startPoints: 0, pickOfTwo: false, braceRepair: 0.4,
  maxHpBonus: 0, startBioStims: 0, priceMult: 1, holdfast: false, damageTakenMult: 1,
  allyHpMult: 1, allyXpMult: 1, coordinated: false, allySlots: 1,
  braceHeal: 0, partingTakenMult: 1, collisionMult: 1,
};

/** Turns owned node ids (fallback fragments may repeat) into modifiers. */
export function perksFor(owned: readonly string[]): Perks {
  const p: Perks = { ...NO_PERKS };
  for (const id of owned) {
    switch (id) {
      case 'move_1': case 'move_3': p.moveBonus += 1; break;
      case 'move_2a': p.reflexMove = true; break;
      case 'move_2b': p.hazardMult = 0.5; break;
      case 'move_4': p.sidestep = true; break;
      case 'move_5': p.phaseStep = true; break;
      case 'heat_1': p.extraCooling += 3; break;
      case 'heat_2a': p.startHeat = 0; break;
      case 'heat_2b': p.hotTakenMult = 0.4; break;
      case 'heat_3': p.doubleActionHeat = 25; break;
      case 'heat_4': p.ventBonus += 10; break;
      case 'heat_5': p.runaway = true; break;
      case 'combat_1': p.damageMult *= 1.1; break;
      case 'combat_2a': p.extraSlots += 1; break;
      case 'combat_2b': p.flankMult = 1.5; break;
      case 'combat_3': p.firstStrikePrecise = true; break;
      case 'combat_4': p.finisherBonus = 0.25; break;
      case 'combat_5': p.chain = true; break;
      case 'graft_1': p.healthCostMult = 0.5; break;
      case 'graft_2a': p.structureMult = 1.25; break;
      case 'graft_2b': p.startImplant = true; break;
      case 'graft_3': p.startPoints += 2; break;
      case 'graft_4': p.pickOfTwo = true; break;
      case 'graft_5': p.braceRepair = 0.8; break;
      case 'signal_1': p.maxHpBonus += 20; break;
      case 'signal_2a': p.startBioStims += 2; break;
      case 'signal_2b': p.priceMult = 0.8; break;
      case 'signal_3': p.holdfast = true; break;
      case 'signal_4': p.maxHpBonus += 40; break;
      case 'signal_5': p.damageTakenMult = 0.9; break;
      case 'network_1': p.allyHpMult = 1.25; break;
      case 'network_2': p.allyXpMult = 2; break;
      case 'network_3': p.coordinated = true; break;
      case 'network_4': p.allySlots = 2; break;
      case FALLBACK_ID: p.maxHpBonus += 5; break;
    }
  }
  return p;
}
