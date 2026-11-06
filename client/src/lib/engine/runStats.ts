// What a host did, and what every host has done: fights, kills, damage both ways,
// favourite moves, allies. Counted from the fight state before and after each step
// (health that went down, bodies that dropped), credited to whoever acted. Pure.

import type { FightState, FightEvent } from './fight';

export interface MoveTally { uses: number; damage: number }
export interface RunStats {
  fightsWon: number; enemiesKilled: number; elitesKilled: number; bossesKilled: number;
  damageDealt: number; biggestHit: number; crits: number;
  damageTaken: number; healed: number;
  allyDamageDealt: number; allyDamageTaken: number;
  surges: number; stimsUsed: number; credits: number; partsTaken: number;
  moves: Record<string, MoveTally>;
}
export const emptyStats = (): RunStats => ({
  fightsWon: 0, enemiesKilled: 0, elitesKilled: 0, bossesKilled: 0,
  damageDealt: 0, biggestHit: 0, crits: 0, damageTaken: 0, healed: 0,
  allyDamageDealt: 0, allyDamageTaken: 0, surges: 0, stimsUsed: 0, credits: 0, partsTaken: 0, moves: {},
});

/** Who a step belongs to: the player using a move, an ally, an enemy, or nobody (hazards, burning, the tide). */
export type Doer = { kind: 'player'; move: string } | { kind: 'ally' } | { kind: 'foe' } | { kind: 'other' };

const foeHp = (s: FightState) => s.foes.reduce((n, f) => n + Math.max(0, f.unit.currentHp), 0);
const allyHp = (s: FightState) => s.allies.reduce((n, a) => n + Math.max(0, a.unit.currentHp), 0);
const alive = (s: FightState) => s.foes.filter(f => f.unit.currentHp > 0).length;

/** What one step adds to the tally. Enemies that join mid-fight don't count as damage healed back. */
export function tally(before: FightState, after: FightState, by: Doer, events: FightEvent[]): Partial<RunStats> {
  const sameFoes = before.foes.length === after.foes.length;
  const dealt = sameFoes ? Math.max(0, foeHp(before) - foeHp(after)) : 0;
  const tookHp = after.player.currentHp - before.player.currentHp;
  const allyLost = Math.max(0, allyHp(before) - allyHp(after));
  const kills = sameFoes ? Math.max(0, alive(before) - alive(after)) : 0;
  const out: Partial<RunStats> = {};
  if (kills) out.enemiesKilled = kills;
  if (tookHp < 0) out.damageTaken = -tookHp;
  if (tookHp > 0) out.healed = tookHp;
  if (allyLost) out.allyDamageTaken = allyLost;
  if (by.kind === 'player') {
    out.damageDealt = dealt;
    out.biggestHit = dealt;
    out.crits = events.filter(e => e.kind === 'log' && /CRITICAL/.test(e.message)).length;
    out.moves = { [by.move]: { uses: 1, damage: dealt } };
  } else if (by.kind === 'ally') out.allyDamageDealt = dealt;
  return out;
}

/** Add a tally in (the biggest hit is kept, not added). */
export function addStats(s: RunStats, d: Partial<RunStats>): RunStats {
  const out: RunStats = { ...s, moves: { ...s.moves } };
  for (const [k, v] of Object.entries(d)) {
    if (k === 'moves') for (const [m, t] of Object.entries(v as Record<string, MoveTally>)) {
      const was = out.moves[m] ?? { uses: 0, damage: 0 };
      out.moves[m] = { uses: was.uses + t.uses, damage: was.damage + t.damage };
    }
    else if (k === 'biggestHit') out.biggestHit = Math.max(out.biggestHit, v as number);
    else (out as unknown as Record<string, number>)[k] = ((out as unknown as Record<string, number>)[k] ?? 0) + (v as number);
  }
  return out;
}

/** The move used most (ties: the one that did more damage). */
export function favouriteMove(s: RunStats): { name: string; uses: number; damage: number } | null {
  const list = Object.entries(s.moves).sort((a, b) => b[1].uses - a[1].uses || b[1].damage - a[1].damage);
  return list.length ? { name: list[0][0], ...list[0][1] } : null;
}
