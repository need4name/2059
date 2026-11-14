// The memory network: what the signal keeps across hosts. One point a lost host, saved
// and spent on neurons. A neuron has ranks; at full rank its specialisations open; an
// endless neuron never fills (each rank gives less and costs more, on its own curve).
// Something can be learned once a neuron it links to is kept (the core always is).
// The data is content/memory.json; this file answers what can be learned, what it
// costs, and what everything kept adds up to (Perks).

import data from '../../content/memory.json';
import { NO_PERKS, type Perks } from './playi';

export interface MemoryFx { perk: string; per?: number; on?: boolean }
export interface MemorySpec { id: string; name: string; text: string; cost: number; ranks: number; fx: MemoryFx[] }
export interface MemoryCurve { give: [number, number][]; price: [number, number][] }
export interface MemoryNeuron {
  id: string; branch: string; branch2?: string; at: [number, number]; fog?: boolean;
  name: string; text: string; cost: number; ranks: number; fx: MemoryFx[];
  curve?: MemoryCurve; needsAlly?: boolean; specs?: MemorySpec[];
}
export interface MemoryState {
  /** Unspent points (never more than MAX_POINTS). */
  points: number;
  /** Ranks kept, by neuron or specialisation id. */
  ranks: Record<string, number>;
  /** The branch the last lost host taught: a point cheaper until the next host is lost. */
  taught: string | null;
}
export type DeathCause = keyof typeof data.taught;

export const MAX_POINTS = 999;
export const MEMORY = data as unknown as { core: [number, number]; size: [number, number]; branches: { id: string; color: string }[]; taught: Record<string, string>; neurons: MemoryNeuron[]; links: [string, string][] };
export const NEURONS = MEMORY.neurons.filter(n => !n.fog);
const byId = new Map(NEURONS.map(n => [n.id, n]));
const specParent = new Map(NEURONS.flatMap(n => (n.specs ?? []).map(s => [s.id, n] as const)));
const specById = new Map(NEURONS.flatMap(n => (n.specs ?? []).map(s => [s.id, s] as const)));
export const neuron = (id: string) => byId.get(id);
export const specOf = (id: string) => specById.get(id);
export const newMemory = (): MemoryState => ({ points: 0, ranks: {}, taught: null });

const rankOf = (ranks: Record<string, number>, id: string) => ranks[id] ?? 0;
/** A curve's value at a rank: the last step at or before it. */
const stepAt = (steps: [number, number][], rank: number) => steps.reduce((v, [from, x]) => (rank >= from ? x : v), steps[0][1]);
/** A neuron at full rank: its specialisations are open (an endless one keeps going). */
export const specsOpen = (n: MemoryNeuron, ranks: Record<string, number>) => rankOf(ranks, n.id) >= n.ranks;
const isFull = (ranks: Record<string, number>, id: string) => {
  const n = byId.get(id), sp = specById.get(id);
  return n ? !n.curve && rankOf(ranks, id) >= n.ranks : !!sp && rankOf(ranks, id) >= sp.ranks;
};

/** Linked to the core or to something kept (and, for the allies' neurons, someone to link with). */
export function reachable(n: MemoryNeuron, ranks: Record<string, number>, hasAlly: boolean): boolean {
  if (n.needsAlly && !hasAlly) return false;
  return MEMORY.links.some(([a, b]) => (b === n.id && (a === 'core' || rankOf(ranks, a) > 0)) || (a === n.id && rankOf(ranks, b) > 0));
}

/** What the next rank of a neuron or specialisation costs, before any discount. */
export function basePrice(id: string, ranks: Record<string, number>): number {
  const n = byId.get(id);
  if (n) return n.curve ? stepAt(n.curve.price, rankOf(ranks, id) + 1) : n.cost;
  return specById.get(id)?.cost ?? 0;
}
/** ... and with what the last host taught: its branch is a point cheaper, never free. */
export function priceOf(s: MemoryState, id: string): number {
  const n = byId.get(id) ?? specParent.get(id);
  const base = basePrice(id, s.ranks);
  return n && s.taught && (n.branch === s.taught || n.branch2 === s.taught) ? Math.max(1, base - 1) : base;
}

/** Could this be learned now, were there points for it? */
export function open(s: MemoryState, id: string, hasAlly: boolean): boolean {
  if (isFull(s.ranks, id)) return false;
  const n = byId.get(id);
  if (n) return reachable(n, s.ranks, hasAlly);
  const parent = specParent.get(id);
  return !!parent && specsOpen(parent, s.ranks) && (!parent.needsAlly || hasAlly);
}
export const canLearn = (s: MemoryState, id: string, hasAlly: boolean) => open(s, id, hasAlly) && priceOf(s, id) <= s.points;

/** Learn one rank. Returns the state unchanged if it can't be. */
export function learn(s: MemoryState, id: string, hasAlly: boolean): MemoryState {
  if (!canLearn(s, id, hasAlly)) return s;
  return { ...s, points: s.points - priceOf(s, id), ranks: { ...s.ranks, [id]: rankOf(s.ranks, id) + 1 } };
}

/** A host is lost: one more point, and how it was lost teaches a branch. */
export function hostLost(s: MemoryState, cause: DeathCause): MemoryState {
  return { ...s, points: Math.min(MAX_POINTS, s.points + 1), taught: MEMORY.taught[cause] ?? null };
}

/** How a host was lost, from what the fight looked like at the end. */
export function causeOf(end: { heat: number; by: 'heavy' | 'hazard' | 'sea' | 'other'; structureBroken: boolean; rounds: number; allyDown: boolean }): DeathCause {
  if (end.heat >= 70) return 'hot';
  if (end.by === 'heavy') return 'heavy';
  if (end.by === 'hazard' || end.by === 'sea') return 'hazard';
  if (end.structureBroken) return 'broken';
  if (end.allyDown) return 'ally';
  if (end.rounds > 12) return 'long';
  return 'other';
}

/** What one neuron's ranks add to a perk it raises (an endless one: its curve, summed). */
function amount(n: MemoryNeuron, fx: MemoryFx, rank: number): number {
  if (!n.curve) return (fx.per ?? 0) * rank;
  let total = 0;
  for (let r = 1; r <= rank; r++) total += stepAt(n.curve.give, r);
  return total;
}

/** Everything kept, as modifiers. */
export function memoryPerks(ranks: Record<string, number>): Perks {
  const p: Record<string, number | boolean | string> = { ...NO_PERKS };
  const apply = (fx: MemoryFx, add: number, has: boolean) => {
    if (!has) return;
    if (fx.on) p[fx.perk] = true;
    else p[fx.perk] = Math.round(((p[fx.perk] as number) + add) * 10000) / 10000;
  };
  for (const n of NEURONS) {
    const r = rankOf(ranks, n.id);
    for (const fx of n.fx) apply(fx, amount(n, fx, r), r > 0);
    for (const sp of n.specs ?? []) { const sr = rankOf(ranks, sp.id); for (const fx of sp.fx) apply(fx, (fx.per ?? 0) * sr, sr > 0); }
  }
  const perks = p as unknown as Perks;
  // Things that can't go below nothing
  for (const k of ['damageTakenMult', 'priceMult', 'healthCostMult', 'hazardMult', 'partingTakenMult', 'hotTakenMult', 'burnoutMult', 'climbMult'] as const) perks[k] = Math.max(0, perks[k]);
  perks.startHeat = Math.max(0, perks.startHeat);
  perks.coordinated = perks.coordinatedBonus > 0;
  return perks;
}

/** Points spent so far (for the run numbers and the simulator). */
export function spent(ranks: Record<string, number>): number {
  let total = 0;
  for (const [id, r] of Object.entries(ranks)) for (let k = 0; k < r; k++) total += basePrice(id, { ...ranks, [id]: k });
  return total;
}
