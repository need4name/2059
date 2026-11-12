// What the screen plays back after each step of a fight: the blows thrown (from the
// engine's 'strike' events) and what changed for every body (health, structure,
// where it stands, whether it went down or into the water). Built from the state
// before and after the step, so the board can show the hit landing before the
// numbers move. For the screen only: nothing here touches the rules.

import type { FightEvent, FightState } from '../engine/fight';
import type { TilePosition } from './types';

export type FxStrike = Extract<FightEvent, { kind: 'strike' }>;
/** One body's change in a step. key: 'player', 'foe:<i>' or 'ally:<k>'. */
export interface FxChange {
  key: string;
  hp: [number, number]; structure: [number, number]; maxHp: number; maxStructure: number;
  pos: [TilePosition, TilePosition];
  down: boolean; wet: boolean;
}
export interface FxPacket {
  id: number;
  strikes: FxStrike[];
  changes: FxChange[];
  crit: boolean;
  /** Someone slammed into something solid. */
  collide: boolean;
  surge: boolean;
  /** Enemies that started winding up a heavy this step. */
  windups: number[];
  /** Bodies that raised a guard this step (brace, a shield move, an ally's cover). */
  guards: string[];
}

let seq = 0;
const same = (a: TilePosition, b: TilePosition) => a.row === b.row && a.col === b.col;

export function buildFx(before: FightState, after: FightState, events: FightEvent[]): FxPacket | null {
  const changes: FxChange[] = [];
  const add = (key: string, b: { currentHp: number; currentStructuralHp: number; maxHp: number; maxStructuralHp: number }, a: typeof b, p0: TilePosition, p1: TilePosition, wet0: boolean, wet1: boolean) => {
    if (b.currentHp === a.currentHp && b.currentStructuralHp === a.currentStructuralHp && same(p0, p1) && wet0 === wet1) return;
    changes.push({ key, hp: [b.currentHp, a.currentHp], structure: [b.currentStructuralHp, a.currentStructuralHp], maxHp: a.maxHp, maxStructure: a.maxStructuralHp, pos: [p0, p1], down: b.currentHp > 0 && a.currentHp <= 0, wet: !wet0 && wet1 });
  };
  add('player', before.player, after.player, before.grid.playerPosition, after.grid.playerPosition, !!before.playerSwimming, !!after.playerSwimming);
  after.foes.forEach((f, i) => { const b = before.foes[i]; if (b) add(`foe:${i}`, b.unit, f.unit, b.pos, f.pos, !!b.swimming, !!f.swimming); });
  after.allies.forEach((a, k) => { const b = before.allies[k]; if (b) add(`ally:${k}`, b.unit, a.unit, b.pos, a.pos, !!b.swimming, !!a.swimming); });
  const strikes = events.filter((e): e is FxStrike => e.kind === 'strike');
  const windups = after.foes.map((f, i) => (f.pendingAction && !before.foes[i]?.pendingAction ? i : -1)).filter(i => i >= 0);
  const guards: string[] = [];
  if (after.playerDefenseBoost + after.allyGuard > before.playerDefenseBoost + before.allyGuard || (!!after.ward && !before.ward)) guards.push('player');
  after.foes.forEach((f, i) => { if (f.defenseBoost > (before.foes[i]?.defenseBoost ?? 0)) guards.push(`foe:${i}`); });
  after.allies.forEach((a, k) => { if (a.defenseBoost > (before.allies[k]?.defenseBoost ?? 0) || (!!a.ward && !before.allies[k]?.ward)) guards.push(`ally:${k}`); });
  if (!strikes.length && !changes.length && !windups.length && !guards.length) return null;
  return {
    id: ++seq, strikes, changes, windups, guards,
    crit: events.some(e => e.kind === 'log' && /CRITICAL/.test(e.message)),
    collide: events.some(e => e.kind === 'collide'),
    surge: events.some(e => e.kind === 'surge'),
  };
}
