// Implant upgrade trees (content/upgrades.json). Each implant grows a tree of
// nodes: a node needs its parent, and the children of one node are a fork, so
// taking one closes the others. Nodes cost more the deeper they sit. Points come
// from winning fights (one per `winsPerPoint` wins) and come back when the
// implant is sold or given away. Pure functions; the store keeps who owns what.

import data from '../../content/upgrades.json';
import type { ActionEffects } from '../combat/types';

export type TreeKind = 'attack' | 'brace' | 'passive';
export interface UpgradeEffect {
  dmg?: number; heat?: number; steady?: boolean; precise?: boolean; guard?: number;
  attack?: number; defense?: number; hp?: number; move?: number; evasion?: number;
  fx?: ActionEffects;
}
export interface UpgradeNode { id: string; parent?: string; name: string; effect: UpgradeEffect }

const D = data as unknown as { costs: number[]; winsPerPoint: number; trees: Record<TreeKind, UpgradeNode[]> };
export const TREES = D.trees;
export const COSTS = D.costs;
/** Fights won per upgrade point. */
export const WINS_PER_POINT = D.winsPerPoint;

/** Which tree an implant grows: attack moves, Helix braces, or everything else. */
export const treeKind = (active: boolean, brace: boolean): TreeKind => (!active ? 'passive' : brace ? 'brace' : 'attack');

export const nodeOf = (kind: TreeKind, id: string) => TREES[kind].find(n => n.id === id);
/** Steps from the root (the root is 0). */
export function depthOf(kind: TreeKind, id: string): number {
  let d = 0, n = nodeOf(kind, id);
  while (n?.parent) { d++; n = nodeOf(kind, n.parent); }
  return d;
}
export const costOf = (kind: TreeKind, id: string) => COSTS[Math.min(COSTS.length - 1, depthOf(kind, id))];
/** Points sunk into an implant's tree (what selling it gives back). */
export const spent = (kind: TreeKind, owned: string[]) => owned.reduce((n, id) => n + costOf(kind, id), 0);

export type Why = 'owned' | 'parent' | 'fork' | 'points';
/** Whether a node can be taken now, or why not. */
export function blockedBy(kind: TreeKind, owned: string[], id: string, points: number): Why | null {
  const n = nodeOf(kind, id);
  if (!n) return 'parent';
  if (owned.includes(id)) return 'owned';
  if (n.parent && !owned.includes(n.parent)) return 'parent';
  if (TREES[kind].some(s => s.parent === n.parent && s.id !== id && owned.includes(s.id))) return 'fork';
  if (points < costOf(kind, id)) return 'points';
  return null;
}
/** A node closed off for good because its fork went another way (or one above it did). */
export function closed(kind: TreeKind, owned: string[], id: string): boolean {
  let n = nodeOf(kind, id);
  while (n) {
    const here = n;
    if (!owned.includes(here.id) && TREES[kind].some(s => s.parent === here.parent && s.id !== here.id && owned.includes(s.id))) return true;
    n = here.parent ? nodeOf(kind, here.parent) : undefined;
  }
  return false;
}

/** Everything an implant's owned nodes add up to (side effects: deeper nodes win). */
export function effectOf(kind: TreeKind, owned: string[]): UpgradeEffect {
  const out: UpgradeEffect = {};
  const nodes = TREES[kind].filter(n => owned.includes(n.id)).sort((a, b) => depthOf(kind, a.id) - depthOf(kind, b.id));
  for (const { effect: e } of nodes) {
    for (const k of ['dmg', 'heat', 'guard', 'attack', 'defense', 'hp', 'move', 'evasion'] as const) if (e[k]) out[k] = (out[k] ?? 0) + e[k]!;
    if (e.steady) out.steady = true;
    if (e.precise) out.precise = true;
    if (e.fx) out.fx = { ...(out.fx ?? {}), ...e.fx };
  }
  return out;
}

/** What a node does, in a few plain words: "+15% damage, +2 heat". */
export function effectText(e: UpgradeEffect): string {
  const pct = (x: number) => `${Math.round(x * 100)}%`;
  const f = e.fx ?? {};
  return [
    e.dmg && `+${pct(e.dmg)} damage`,
    e.guard && `+${pct(e.guard)} guard`,
    e.heat && `${e.heat > 0 ? '+' : ''}${e.heat} heat`,
    e.steady && 'steadier aim',
    e.precise && 'always full damage',
    e.attack && `+${e.attack} attack`,
    e.defense && `+${e.defense} defence`,
    e.hp && `+${e.hp} health`,
    e.move && `+${e.move} move`,
    e.evasion && `+${e.evasion} dodge`,
    f.knock && 'knocks back',
    f.crush && 'crushes into things',
    f.bleed && 'makes them bleed',
    f.drain && `heals ${pct(f.drain)} of damage`,
    f.stun && `${pct(f.stun)} stun`,
    f.cool && `vents ${f.cool} heat`,
    f.haste && 'you act sooner',
    f.slow && 'slows them',
    f.ignite && 'sets them alight',
  ].filter(Boolean).join(', ');
}
