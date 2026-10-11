// The fight rules, as pure functions: each takes the fight's state and returns
// the next state plus what happened (log lines, hits, a knockout). No React, no
// timers, no stores. The combat store decides *when* each step runs and handles
// sound, inventory and screens; the simulator and tests run these same rules.

import type { Character, CombatAction, CombatGrid, CombatLog, Item, PlayerClass, AttackPatternType } from '../combat/types';
import { getHeatMultipliers, getFlankBonus } from '../combat/types';
import {
  calculateDamage, scaleBossAction, CLASS_DEFINITIONS, BOSS_ATTACKS,
  getPatchworkKingAction, PATCHWORK_KING_MONOLOGUE,
} from '../combat/actions';
import { canHitTarget } from '../combat/patterns';
import { stepTowardAttackPosition, hazardDamageAt, chebyshev, tileAt } from '../combat/grid';
import { random } from './rng';

// ── Tuning ────────────────────────────────────────────────────────────────────

export const PLAYER_BASE_MOVE = 2;
export const BOSS_MOVE = 2;
/** Heat every combatant sheds at the start of each round. */
export const PASSIVE_COOLING = 6;
/** At or below this heat the player acts twice. */
export const DOUBLE_ACTION_HEAT = 15;
/** Heavy attacks only come out against a player at or above this heat. */
export const HEAVY_MIN_PLAYER_HEAT = 45;
/** Share of the structure bar a brace repairs. */
export const BRACE_REPAIR = 0.4;
/** Share of structural damage that lands on flesh when there are no implants. */
export const NO_IMPLANT_SPILL = 0.5;

/** Fallback for enemies whose moves can't reach an adjacent player. */
export const CLOSE_QUARTERS: CombatAction = {
  type: 'attack', name: 'Close-Quarters Strike', description: '', damage: 12,
  accuracy: 'variable', physicalRatio: 0.7, heatTransfer: 3, heatGenerated: 6, attackPattern: 'melee',
};

// ── State and events ─────────────────────────────────────────────────────────

export interface FightState {
  player: Character;
  boss: Character;
  grid: CombatGrid;
  playerHeat: number;
  bossHeat: number;
  playerDefenseBoost: number;
  bossDefenseBoost: number;
  playerMalfunctioning: boolean;
  bossMalfunctioning: boolean;
  overclockActive: boolean;
  kizunaJustFired: boolean;
  bossChargingHeavy: boolean;
  pendingBossAction: CombatAction | null;
  patchworkKingTurn: number;
  doubleActionReady: boolean;
}

export type FightEvent =
  | { kind: 'log'; message: string; type: CombatLog['type'] }
  | { kind: 'hit' }
  | { kind: 'playerDown' }
  | { kind: 'bossDown' };

export interface Step { state: FightState; events: FightEvent[] }

const clampHeat = (h: number) => Math.max(0, Math.min(100, h));
export const isMalfunctioning = (c: Character) => c.maxStructuralHp > 0 && c.currentStructuralHp <= 0;
const say = (message: string, type: CombatLog['type'] = 'info'): FightEvent => ({ kind: 'log', message, type });

// ── Round start ──────────────────────────────────────────────────────────────

/** Start of the player's turn: both sides cool off; a cool player acts twice. */
export function startPlayerTurn(s: FightState): FightState {
  const playerHeat = clampHeat(s.playerHeat - PASSIVE_COOLING);
  return { ...s, playerHeat, bossHeat: clampHeat(s.bossHeat - PASSIVE_COOLING), doubleActionReady: playerHeat <= DOUBLE_ACTION_HEAT };
}

// ── Player actions ───────────────────────────────────────────────────────────

/** Brace: guard up, cool down, repair part of the structure bar. */
export function resolveBrace(s: FightState, action: CombatAction): Step {
  const { player } = s;
  const wasMalfunctioning = isMalfunctioning(player);
  const structure = Math.min(player.maxStructuralHp, player.currentStructuralHp + Math.ceil(player.maxStructuralHp * BRACE_REPAIR));
  const events: FightEvent[] = [];
  if (wasMalfunctioning && structure > 0) events.push(say('STRUCTURAL INTEGRITY RESTORED -- system nominal'));
  events.push(say(`${action.name.toUpperCase()} -- guard up`));
  return {
    state: {
      ...s,
      player: { ...player, currentStructuralHp: structure },
      playerDefenseBoost: action.defenseBoost || 8,
      playerMalfunctioning: player.maxStructuralHp > 0 && structure <= 0,
      playerHeat: clampHeat(s.playerHeat + (action.heatGenerated ?? -25)),
    },
    events,
  };
}

/** The shape an attack uses, filling in class specials and the old default. */
export function attackPatternOf(action: CombatAction, playerClass: PlayerClass): AttackPatternType {
  return action.attackPattern
    ?? (action.type === 'special' ? (CLASS_DEFINITIONS[playerClass]?.specialAbility?.attackPattern || 'ranged') : 'melee_long');
}

export function canPlayerHit(s: FightState, action: CombatAction, playerClass: PlayerClass): boolean {
  const ignoresRange = action.ignoreRange || (action.type === 'special' && CLASS_DEFINITIONS[playerClass]?.specialAbility?.ignoreRange);
  return !!ignoresRange || canHitTarget(s.grid.playerPosition, s.grid.bossPosition, attackPatternOf(action, playerClass), s.grid);
}

/** An attack or special. Check canPlayerHit first; this assumes it reaches. */
export function resolvePlayerAttack(s: FightState, action: CombatAction): Step {
  const { player, boss, grid, playerHeat } = s;
  const heatMult = getHeatMultipliers(playerHeat);
  const flankBonus = getFlankBonus(grid.playerPosition, grid.bossPosition);
  const tileDistance = chebyshev(grid.playerPosition, grid.bossPosition);

  // Kizuna cold start: the first strike while cool is precise. Overclock is too.
  const kizunaFiredNow = !!player.hasKizuna && playerHeat <= 20 && !s.kizunaJustFired;
  let finalAction = kizunaFiredNow ? { ...action, accuracy: 'precise' as const } : action;
  if (s.overclockActive) finalAction = { ...finalAction, accuracy: 'precise' as const };
  const dmg = calculateDamage(
    player, boss, finalAction, s.bossDefenseBoost,
    s.overclockActive ? 2.0 : heatMult.dealt,
    flankBonus, tileDistance, s.playerMalfunctioning,
    s.overclockActive ? 100 : playerHeat,
    player.bypassStructuralDefense ?? false,
  );

  const events: FightEvent[] = [];
  if (kizunaFiredNow) events.push(say('KIZUNA ACTIVE -- cold-start precision lock'));
  if (s.playerMalfunctioning) events.push(say('MALFUNCTION', 'malfunction'));

  const bossHp = Math.max(0, boss.currentHp - dmg.bioDamage);
  const bossStructure = Math.max(0, boss.currentStructuralHp - dmg.structuralDamage);
  const bossBreaks = boss.currentStructuralHp > 0 && bossStructure <= 0;
  const adjacentHeat = tileDistance === 1 ? 2 : 0;
  const heatPush = action.heatTransfer ?? 0;
  const bossHeat = clampHeat(s.bossHeat + heatPush);
  const healed = action.healing && action.healing > 0 ? Math.min(player.maxHp, player.currentHp + action.healing) : player.currentHp;

  events.push({ kind: 'hit' });
  if (bossBreaks) events.push(say(`${boss.name}: MALFUNCTION`, 'malfunction'));
  if (heatPush !== 0) events.push(say(`${boss.name} heat: ${heatPush > 0 ? '+' : ''}${heatPush} (${bossHeat})`));
  events.push(say(`${dmg.isCrit ? 'CRITICAL! ' : ''}Dealt ${dmg.bioDamage} bio / ${dmg.structuralDamage} structural${dmg.isFlank ? ' [FLANK]' : ''}`, dmg.isCrit ? 'critical' : 'damage'));
  if (bossHp <= 0) events.push({ kind: 'bossDown' });

  return {
    state: {
      ...s,
      player: { ...player, currentHp: healed },
      boss: { ...boss, currentHp: bossHp, currentStructuralHp: bossStructure },
      bossMalfunctioning: bossStructure <= 0,
      bossDefenseBoost: 0,
      playerDefenseBoost: action.defenseBoost && action.defenseBoost > 0 ? action.defenseBoost : 0,
      overclockActive: false,
      kizunaJustFired: kizunaFiredNow || s.kizunaJustFired,
      playerHeat: clampHeat(playerHeat + (action.heatGenerated ?? 15) + adjacentHeat),
      bossHeat,
    },
    events,
  };
}

/** A stim. Returns whether it uses up the turn (Overclock doesn't). */
export function resolveConsumable(s: FightState, item: Item): Step & { endsTurn: boolean } {
  const { player } = s;
  const next = { ...player };
  let heat = s.playerHeat, overclock = false, msg: string;
  const effect = item.consumableEffect;
  if (effect === 'bio_stim') {
    const heal = Math.floor(player.maxHp * 0.6);
    next.currentHp = Math.min(player.maxHp, player.currentHp + heal);
    msg = `BIO-STIM -- +${heal} HP`;
  } else if (effect === 'structural_patch') {
    const repair = Math.floor(player.maxStructuralHp * 0.6);
    next.currentStructuralHp = Math.min(player.maxStructuralHp, player.currentStructuralHp + repair);
    msg = `STRUCTURAL PATCH -- +${repair} structural HP`;
  } else if (effect === 'heat_flush') {
    heat = 0;
    msg = 'HEAT FLUSH -- thermal systems purged to zero';
  } else if (effect === 'overclock') {
    overclock = true;
    msg = 'OVERCLOCK -- next attack is guaranteed critical';
  } else {
    const heal = item.hpBonus || 0;
    next.currentHp = Math.min(player.maxHp, player.currentHp + heal);
    heat = clampHeat(heat - 10);
    msg = `STIM -- +${heal} HP`;
  }
  return {
    state: { ...s, player: next, playerMalfunctioning: isMalfunctioning(next), playerHeat: heat, overclockActive: overclock || s.overclockActive },
    events: [say(msg, effect === 'bio_stim' ? 'heal' : 'info')],
    endsTurn: !overclock,
  };
}

// ── Enemy turn ───────────────────────────────────────────────────────────────

/** The enemy picks its next move from its roster, filtered by range and heat. */
export function chooseBossAction(s: FightState): Step & { action: CombatAction } {
  const { boss, grid, playerHeat } = s;
  if (boss.name === 'Patchwork King') {
    const turn = s.patchworkKingTurn + 1;
    const events: FightEvent[] = [];
    if (turn === 4) events.push(say(PATCHWORK_KING_MONOLOGUE[2]));
    if (turn === 7) events.push(say(PATCHWORK_KING_MONOLOGUE[3]));
    return { action: getPatchworkKingAction(turn), state: { ...s, patchworkKingTurn: turn }, events };
  }
  const roster = BOSS_ATTACKS[boss.name] ?? [];
  const dist = chebyshev(grid.bossPosition, grid.playerPosition);
  const filtered = roster.filter(a => {
    if (a.isHeavy && playerHeat < HEAVY_MIN_PLAYER_HEAT) return false;
    // Shields only come out when the enemy is hurt, and not every time
    if (a.type === 'defend' && (boss.currentHp > boss.maxHp * 0.5 || random() > 0.35)) return false;
    const pat = a.attackPattern;
    if (!pat) return true;
    if ((pat === 'charge' || pat === 'lunge') && dist < 2) return false;
    if ((pat === 'sweep_arc' || pat === 'melee') && dist > 2) return false;
    return true;
  });
  let pool = filtered.length ? filtered : roster.filter(a => a.type === 'attack');
  // Point blank with nothing that reaches: lash out instead of backing away
  if (dist <= 1 && !pool.some(a => a.type === 'defend' || a.isHeavy || canHitTarget(grid.bossPosition, grid.playerPosition, a.attackPattern ?? 'melee_long', grid))) {
    pool = [CLOSE_QUARTERS];
  }
  return { action: pool[Math.floor(random() * pool.length)], state: s, events: [] };
}

export function canBossHit(s: FightState, pattern: AttackPatternType | undefined): boolean {
  const g = s.grid;
  return canHitTarget(g.bossPosition, g.playerPosition, pattern ?? 'melee_long', g);
}

/** The enemy walks up to BOSS_MOVE tiles, stopping once it can strike. */
export function moveBossToward(s: FightState, pattern: AttackPatternType | undefined): Step & { moved: boolean } {
  if (s.bossHeat >= 100) return { state: s, events: [say(`${s.boss.name}: OVERHEATED -- movement locked`)], moved: false };
  let grid = s.grid, moved = false;
  for (let i = 0; i < BOSS_MOVE; i++) {
    const step = stepTowardAttackPosition(grid, pattern ?? 'melee_long');
    if (!step) break;
    grid = { ...grid, bossPosition: step };
    moved = true;
  }
  return { state: { ...s, grid }, events: [], moved };
}

/** A heavy attack: move into position and wind up; it fires next turn. */
export function telegraphHeavy(s: FightState, action: CombatAction): Step {
  const moved = moveBossToward(s, action.attackPattern);
  return {
    state: { ...moved.state, bossChargingHeavy: true, pendingBossAction: action },
    events: [...moved.events, say(`${s.boss.name} is charging ${action.name.toUpperCase()}!`, 'critical')],
  };
}

/** Fire a wound-up heavy. Returns whether it connects (stepping out dodges it). */
export function releaseHeavy(s: FightState): Step & { action: CombatAction | null; connects: boolean } {
  const action = s.pendingBossAction;
  const state = { ...s, bossChargingHeavy: false, pendingBossAction: null };
  if (!action) return { state, events: [], action: null, connects: false };
  const connects = canBossHit(state, action.attackPattern);
  return { state, action, connects, events: connects ? [] : [say(`${s.boss.name}'s ${action.name} misses -- you evaded`)] };
}

/** An enemy's attack or shield landing. `level` scales its move damage. */
export function resolveBossAction(s: FightState, action: CombatAction, level: number): Step {
  const { player, boss, grid } = s;
  if (action.type === 'defend') {
    return {
      state: { ...s, bossDefenseBoost: action.defenseBoost || 0, bossHeat: clampHeat(s.bossHeat + (action.heatGenerated ?? 0)) },
      events: [say(`${boss.name}: ${action.name.toUpperCase()} -- guard up`)],
    };
  }
  // Enemy heat doesn't scale enemy damage: heat is a player-side tactic
  const dmg = calculateDamage(boss, player, scaleBossAction(action, level), s.playerDefenseBoost, 1.0, 0, chebyshev(grid.playerPosition, grid.bossPosition), s.bossMalfunctioning);
  const spill = player.maxStructuralHp > 0 ? 0 : Math.ceil(dmg.structuralDamage * NO_IMPLANT_SPILL);
  const hp = Math.max(0, player.currentHp - dmg.bioDamage - spill);
  const structure = Math.max(0, player.currentStructuralHp - dmg.structuralDamage);
  const breaks = player.currentStructuralHp > 0 && structure <= 0;
  const playerHeat = clampHeat(s.playerHeat + (action.heatTransfer ?? 0));

  const events: FightEvent[] = [];
  if (playerHeat >= 100 && s.playerHeat < 100) events.push(say('OVERHEATED -- movement locked next turn'));
  events.push({ kind: 'hit' });
  events.push(say(spill
    ? `${boss.name} -- ${action.name}: ${dmg.bioDamage + spill} damage (no implants to absorb it)`
    : `${boss.name} -- ${action.name}: ${dmg.bioDamage} bio / ${dmg.structuralDamage} structural`, 'damage'));
  if (breaks) events.push(say('MALFUNCTION', 'malfunction'));
  if (hp <= 0) events.push({ kind: 'playerDown' });

  return {
    state: {
      ...s,
      player: { ...player, currentHp: hp, currentStructuralHp: structure },
      playerMalfunctioning: player.maxStructuralHp > 0 && structure <= 0,
      playerDefenseBoost: 0,
      playerHeat,
      bossHeat: clampHeat(s.bossHeat + (action.heatGenerated ?? 15)),
    },
    events,
  };
}

// ── Hazards ──────────────────────────────────────────────────────────────────

/** Damage from the tile a combatant ends its turn on. */
export function applyHazard(s: FightState, who: 'player' | 'boss'): Step {
  const pos = who === 'player' ? s.grid.playerPosition : s.grid.bossPosition;
  const dmg = hazardDamageAt(pos, s.grid);
  if (dmg <= 0) return { state: s, events: [] };
  const name = tileAt(pos, s.grid)?.name ?? 'Hazard';
  if (who === 'player') {
    const hp = Math.max(0, s.player.currentHp - dmg);
    const events: FightEvent[] = [say(`${name}: -${dmg} HP`, 'damage')];
    if (hp <= 0) events.push({ kind: 'playerDown' });
    return { state: { ...s, player: { ...s.player, currentHp: hp } }, events };
  }
  const hp = Math.max(0, s.boss.currentHp - dmg);
  const events: FightEvent[] = [say(`${s.boss.name} burns on ${name}: -${dmg}`, 'damage')];
  if (hp <= 0) events.push({ kind: 'bossDown' });
  return { state: { ...s, boss: { ...s.boss, currentHp: hp } }, events };
}

export const isOver = (step: Step) => step.events.some(e => e.kind === 'playerDown' || e.kind === 'bossDown');
