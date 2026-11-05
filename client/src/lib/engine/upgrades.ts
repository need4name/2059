// Implant upgrade trees (content/upgrades.json). Every implant grows its own
// tree, worked out from the implant itself, so the same part always grows the
// same tree: its rarity sets the size, depth and strength, its maker which
// upgrades turn up, and only a legendary part ends its deepest branch in a
// legendary capstone. A node needs its parent, and the children of one node are
// a fork, so taking one closes the others. Nodes cost more the deeper they sit.
// Points come from winning fights and come back when the implant is sold or
// given away. Pure functions; the store keeps who owns what.
//
// The tree's own dice come from a hash of the implant's id, never from the
// run's random(), so looking at a tree can't change a seeded run.

import data from '../../content/upgrades.json';
import type { ActionEffects, Item, ItemRarity } from '../combat/types';
import { makerOf } from '../combat/augments';
import { hashSeed } from './rng';

export type TreeKind = 'attack' | 'brace' | 'passive';
export interface UpgradeEffect {
  dmg?: number; heat?: number; steady?: boolean; precise?: boolean; guard?: number;
  attack?: number; defense?: number; hp?: number; move?: number; evasion?: number;
  fx?: ActionEffects;
}
/** A node in an implant's tree. `cap` marks the end of a branch (legendary only on legendary parts). */
export interface UpgradeNode { id: string; parent?: string; name: string; effect: UpgradeEffect; cap?: 'cap' | 'legendary' }

interface Kind { id: string; name: string; makers: string[]; effect: UpgradeEffect }
interface Shape { nodes: number; depth: number; leaves: number; rootKids: number; scale: number }
const D = data as unknown as {
  costs: number[]; winsPerPoint: number; shapes: Record<ItemRarity, Shape>;
  kinds: Record<TreeKind, Kind[]>; capstones: Record<TreeKind, Kind[]>; legendary: Record<TreeKind, Kind[]>;
};
export const COSTS = D.costs;
/** Fights won per upgrade point. */
export const WINS_PER_POINT = D.winsPerPoint;
export const SHAPES = D.shapes;

/** Which tree an implant grows: attack moves, Helix braces, or everything else. */
export const treeKind = (active: boolean, brace: boolean): TreeKind => (!active ? 'passive' : brace ? 'brace' : 'attack');

/** A small dice of its own, seeded from text (so a tree never touches the run's random()). */
function dice(text: string) {
  let s = hashSeed(text) || 1;
  return () => { s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; };
}

/** A kind's numbers at a strength (whole numbers stay whole, true/false stay as they are). */
function scaled(e: UpgradeEffect, m: number): UpgradeEffect {
  const out: UpgradeEffect = { ...e };
  for (const k of ['attack', 'defense', 'hp', 'evasion'] as const) if (e[k]) out[k] = Math.sign(e[k]!) * Math.max(1, Math.round(Math.abs(e[k]!) * m));
  for (const k of ['dmg', 'guard'] as const) if (e[k]) out[k] = Math.round(e[k]! * m * 100) / 100;
  if (e.heat) out.heat = Math.round(e.heat * (e.heat < 0 ? m : 1));
  if (e.fx) {
    const fx = { ...e.fx };
    if (fx.drain) fx.drain = Math.round(fx.drain * m * 100) / 100;
    if (fx.stun) fx.stun = Math.min(0.6, Math.round(fx.stun * m * 100) / 100);
    if (fx.cool) fx.cool = Math.max(1, Math.round(fx.cool * m));
    out.fx = fx;
  }
  return out;
}

const cache = new Map<string, UpgradeNode[]>();

/** The tree an implant grows (the same every time for the same part). */
export function treeFor(item: Item, kind: TreeKind): UpgradeNode[] {
  const key = `${item.id}:${item.templateId ?? item.name}:${kind}:${item.rarity}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const roll = dice(`tree:${item.id}`);
  const shape = SHAPES[item.rarity] ?? SHAPES.common;
  const maker = makerOf(item);

  // The shape: a root that forks, then branches that mostly grow longer and now and then fork again
  const parent: (number | undefined)[] = [undefined];
  const depth = [0];
  const kids = (i: number) => parent.filter(p => p === i).length;
  for (let k = 0; k < shape.rootKids; k++) { parent.push(0); depth.push(1); }
  while (parent.length < shape.nodes) {
    const leaves = parent.map((_, i) => i).filter(i => kids(i) === 0).length;
    const open = parent.map((_, i) => i).filter(i => i > 0 && depth[i] < shape.depth && kids(i) < 2 && !(kids(i) === 1 && leaves >= shape.leaves));
    if (!open.length) break;
    // Growing a branch longer is three times as likely as forking it
    const weights = open.map(i => (kids(i) === 0 ? 3 : 1));
    let r = roll() * weights.reduce((a, b) => a + b, 0), pick = open[0];
    for (let k = 0; k < open.length; k++) { r -= weights[k]; if (r <= 0) { pick = open[k]; break; } }
    parent.push(pick); depth.push(depth[pick] + 1);
  }

  // What each node is: the maker's kinds three times as often as anyone's, never the same kind twice
  // down one branch, and rarely one already used elsewhere in the tree (capstones never repeat while
  // there are others to pick)
  const used: Record<string, number> = {};
  const choose = (pool: Kind[], avoid: Set<string>, fresh = false) => {
    const ok = (k: Kind) => !avoid.has(k.id) && !(fresh && used[k.id]);
    let fits = pool.filter(k => ok(k) && (k.makers.includes(maker) || k.makers.includes('any')));
    if (!fits.length) fits = pool.filter(ok);
    if (!fits.length) fits = pool.filter(k => !avoid.has(k.id));
    const list = fits.length ? fits : pool;
    const w = list.map(k => (k.makers.includes(maker) ? 3 : 1) / (1 + 3 * (used[k.id] ?? 0)));
    let r = roll() * w.reduce((a, b) => a + b, 0);
    for (let k = 0; k < list.length; k++) { r -= w[k]; if (r <= 0) return list[k]; }
    return list[list.length - 1];
  };
  const leaf = (i: number) => kids(i) === 0;
  const deepest = Math.max(...parent.map((_, i) => (leaf(i) ? depth[i] : -1)));
  const legendaryAt = item.rarity === 'legendary' ? parent.findIndex((_, i) => leaf(i) && depth[i] === deepest) : -1;
  let moved = false;
  const kindOf: string[] = [];
  const nodes: UpgradeNode[] = parent.map((p, i) => {
    const avoid = new Set<string>();
    for (let a = p; a !== undefined; a = parent[a]) avoid.add(kindOf[a]);
    if (moved) avoid.add('stride').add('reflex');
    let k: Kind, cap: UpgradeNode['cap'], m = shape.scale;
    if (i === legendaryAt) { k = choose(D.legendary[kind], avoid); cap = 'legendary'; }
    else if (leaf(i)) { k = choose(D.capstones[kind], avoid, true); cap = 'cap'; m *= 0.6 + 0.4 * (depth[i] / shape.depth); }
    else k = choose(D.kinds[kind], avoid);
    if (k.effect.move) moved = true;
    used[k.id] = (used[k.id] ?? 0) + 1;
    kindOf[i] = k.id;
    return { id: `n${i}`, ...(p !== undefined ? { parent: `n${p}` } : {}), name: k.name, effect: scaled(k.effect, m), ...(cap ? { cap } : {}) };
  });
  cache.set(key, nodes);
  return nodes;
}

export const nodeIn = (tree: UpgradeNode[], id: string) => tree.find(n => n.id === id);
/** Steps from the root (the root is 0). */
export function depthIn(tree: UpgradeNode[], id: string): number {
  let d = 0, n = nodeIn(tree, id);
  while (n?.parent) { d++; n = nodeIn(tree, n.parent); }
  return d;
}
export const costIn = (tree: UpgradeNode[], id: string) => COSTS[Math.min(COSTS.length - 1, depthIn(tree, id))];
/** Points sunk into an implant's tree (what selling it gives back). */
export const spentIn = (tree: UpgradeNode[], owned: string[]) => owned.reduce((n, id) => n + (nodeIn(tree, id) ? costIn(tree, id) : 0), 0);

export type Why = 'owned' | 'parent' | 'fork' | 'points';
/** Whether a node can be taken now, or why not. */
export function blockedIn(tree: UpgradeNode[], owned: string[], id: string, points: number): Why | null {
  const n = nodeIn(tree, id);
  if (!n) return 'parent';
  if (owned.includes(id)) return 'owned';
  if (n.parent && !owned.includes(n.parent)) return 'parent';
  if (tree.some(s => s.parent === n.parent && s.id !== id && owned.includes(s.id))) return 'fork';
  if (points < costIn(tree, id)) return 'points';
  return null;
}
/** A node closed off for good because its fork went another way (or one above it did). */
export function closedIn(tree: UpgradeNode[], owned: string[], id: string): boolean {
  let n = nodeIn(tree, id);
  while (n) {
    const here = n;
    if (!owned.includes(here.id) && tree.some(s => s.parent === here.parent && s.id !== here.id && owned.includes(s.id))) return true;
    n = here.parent ? nodeIn(tree, here.parent) : undefined;
  }
  return false;
}

/** Everything an implant's owned nodes add up to (side effects: deeper nodes win). */
export function effectIn(tree: UpgradeNode[], owned: string[]): UpgradeEffect {
  const out: UpgradeEffect = {};
  const nodes = tree.filter(n => owned.includes(n.id)).sort((a, b) => depthIn(tree, a.id) - depthIn(tree, b.id));
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
  const sgn = (x: number) => `${x > 0 ? '+' : ''}${x}`;
  const f = e.fx ?? {};
  return [
    e.dmg && `+${pct(e.dmg)} damage`,
    e.guard && `+${pct(e.guard)} guard`,
    e.heat && `${sgn(e.heat)} heat`,
    e.steady && 'steadier aim',
    e.precise && 'always full damage',
    e.attack && `${sgn(e.attack)} attack`,
    e.defense && `${sgn(e.defense)} defence`,
    e.hp && `${sgn(e.hp)} health`,
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
    f.hotBonus && `+${pct(f.hotBonus)} damage while you run hot`,
    f.lowBonus && `${f.lowBonus >= 1 ? 'double' : `+${pct(f.lowBonus)}`} damage while you're low`,
    f.reap && 'a takedown vents your heat and guards you',
  ].filter(Boolean).join(', ');
}
