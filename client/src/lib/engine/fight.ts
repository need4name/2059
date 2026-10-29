// The fight rules, as pure functions: each takes the fight's state and returns
// the next state plus what happened (log lines, hits, a knockout). No React, no
// timers, no stores. The combat store decides *when* each step runs and handles
// sound, inventory and screens; the simulator and tests run these same rules.
//
// A fight is the player against one or more foes. The player picks a target;
// area moves also hit any other foe standing in the struck tiles. On the enemy
// turn each living foe acts in order, treating the others as obstacles.
//
// Allies stand with the player. The player moves them and picks one of their
// fixed moves during their own turn. Each foe aims at whoever is nearest (the
// player wins ties) unless an ally is drawing fire.

import type { Character, CombatAction, CombatGrid, CombatLog, Item, PlayerClass, AttackPatternType, TilePosition } from '../combat/types';
import { getHeatMultipliers, getFlankBonus } from '../combat/types';
import {
  calculateDamage, scaleBossAction, CLASS_DEFINITIONS, BOSS_ATTACKS,
  getPatchworkKingAction, PATCHWORK_KING_MONOLOGUE,
} from '../combat/actions';
import { canHitTarget, getHitTiles } from '../combat/patterns';
import { isImpassable, inBounds } from '../combat/grid';
import { stepTowardAttackPosition, hazardDamageAt, chebyshev, tileAt, getReachableTiles } from '../combat/grid';
import type { AllyMove } from '../combat/allies';
import { random } from './rng';
import { makerOf, type Maker } from '../combat/augments';
import { NO_PERKS, type Perks } from './playi';

// ── Tuning ────────────────────────────────────────────────────────────────────

export const PLAYER_BASE_MOVE = 1;
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

/** One enemy on the field. */
export interface Foe {
  unit: Character;
  pos: TilePosition;
  heat: number;
  defenseBoost: number;
  malfunctioning: boolean;
  chargingHeavy: boolean;
  pendingAction: CombatAction | null;
  /** Turn counter for scripted bosses (the Patchwork King). */
  scriptTurn: number;
  /** Who a wound-up heavy is aimed at: -1 the player, otherwise an ally's index. */
  pendingVictim: number | null;
  /** The exact tiles a wound-up heavy will strike. Anyone on them when it fires is hit. */
  pendingTiles: TilePosition[] | null;
  /** Turns of burning left (from ending a turn on a fuel fire). */
  burning: number;
  /** Loses its next turn (slammed into something solid). */
  stunned: boolean;
  /** Knocked into the sea: can't be hit, and spends its next turn climbing out. */
  swimming?: boolean;
  /** Turns of bleeding left (from a Bleed mod). */
  bleeding?: number;
  /** Rounds left acting slower / faster (see SPEED). */
  slowed?: number;
  hasted?: number;
  /** A boss has passed its half-health turn. */
  enraged: boolean;
}

/** An ally on the field. Knocked out allies sit out the rest of the fight. */
export interface Ally {
  id: string;
  unit: Character;
  pos: TilePosition;
  moves: AllyMove[];
  /** Tiles it can move each round. */
  move: number;
  /** Rounds until each move can be used again. */
  cooldowns: number[];
  moved: boolean;
  acted: boolean;
  /** Draw fire: every foe aims at this ally until the player's next turn. */
  taunting: boolean;
  defenseBoost: number;
  burning: number;
  stunned: boolean;
  /** Knocked into the sea: can't be hit, and spends its next turn climbing out. */
  swimming?: boolean;
}

export interface FightState {
  player: Character;
  foes: Foe[];
  /** Index of the foe the player is aiming at. */
  target: number;
  grid: CombatGrid;
  playerHeat: number;
  playerDefenseBoost: number;
  playerMalfunctioning: boolean;
  overclockActive: boolean;
  kizunaJustFired: boolean;
  doubleActionReady: boolean;
  /** What the signal has learned (play-i tree). */
  perks: Perks;
  /** Clean first strike: has this fight's first attack happened yet? */
  firstStrikeUsed: boolean;
  /** Sidestep: the next heavy aimed at you misses. */
  sidestepReady: boolean;
  /** Holdfast: survive one killing blow this host. */
  holdfastReady: boolean;
  allies: Ally[];
  /** Paint target: the player's hits on this foe do extra damage this round. */
  mark: { foe: number; bonus: number } | null;
  /** Foes an ally hit this round (for Coordinated). */
  allyHitFoes: number[];
  /** Guard an ally put on the player; soaks the next hit. */
  allyGuard: number;
  /** Turns of burning left on the player. */
  playerBurning: number;
  /** The player loses their next turn. */
  playerStunned: boolean;
  /** The player is in the sea (see swimming on foes). */
  playerSwimming?: boolean;
  /** Turns of bleeding left on the player. */
  playerBleeding?: number;
  /** Rounds left acting slower / faster (see SPEED). */
  playerSlowed?: number;
  playerHasted?: number;
  /** The host's implants' average drive (see DRIVE): speed above the base. */
  playerDrive?: number;
  /** Tides, on boards with mud flats: whether the water is up, and rounds until it turns. */
  tide?: { high: boolean; turnsLeft: number } | null;
  /** The alarm, in chapters that have one: whether it has tripped, and rounds until it does. */
  alarm?: { on: boolean; turnsLeft: number } | null;
  /** The dreamer inside the host has flinched this fight (once at most). */
  flinchUsed?: boolean;
  /** This turn's move away came from a hit-and-run step: no parting blows. */
  noParting?: boolean;
  /** Overload, 0 to 100: fills from trading blows; full unlocks one Signal Surge. */
  overload: number;
}

export type FightEvent =
  | { kind: 'log'; message: string; type: CombatLog['type'] }
  | { kind: 'hit' }
  | { kind: 'foeDown'; foe: number }
  | { kind: 'playerDown' }
  | { kind: 'allFoesDown' }
  /** Chain: a takedown earned the player another action. */
  | { kind: 'extraAction' }
  /** Holdfast spent: the player survived a killing blow. */
  | { kind: 'holdfast' }
  | { kind: 'allyDown'; ally: number }
  /** Sound cues only: a body thrown into something, a burn tick, a heavy wound up, a Surge. */
  | { kind: 'collide' } | { kind: 'burn' } | { kind: 'telegraph' } | { kind: 'surge' };

export interface Step { state: FightState; events: FightEvent[] }

const clampHeat = (h: number) => Math.max(0, Math.min(100, h));
export const isMalfunctioning = (c: Character) => c.maxStructuralHp > 0 && c.currentStructuralHp <= 0;
const say = (message: string, type: CombatLog['type'] = 'info'): FightEvent => ({ kind: 'log', message, type });
const same = (a: TilePosition, b: TilePosition) => a.row === b.row && a.col === b.col;

export const isAlive = (f: Foe) => f.unit.currentHp > 0;
/** Alive and on deck: something attacks can reach (a unit in the sea can't be hit). */
const hittable = (f: Foe) => isAlive(f) && !f.swimming;
/** Does this enemy carry an implant that gives it this trait? */
export const hasTrait = (f: Foe | undefined, t: string) => !!f?.unit.traits?.includes(t);
/** Damage an enemy takes: a spine brace cuts it. */
const takenBy = (f: Foe) => (hasTrait(f, 'braced') ? 0.9 : 1);
/** An optic lets an enemy without a gun shoot: a shot at 80% of its usual hit. */
export function foeRoster(f: Foe): CombatAction[] {
  const roster = f.unit.moves ?? BOSS_ATTACKS[f.unit.name] ?? [];
  if (!hasTrait(f, 'sighted') || roster.some(a => a.attackPattern === 'ranged')) return roster;
  const base = roster.find(a => a.type === 'attack' && !a.isHeavy);
  return [...roster, { type: 'attack', name: 'Optic shot', description: '', damage: Math.round((base?.damage ?? 10) * 0.8), accuracy: 'variable', physicalRatio: 0.7, heatTransfer: 2, heatGenerated: 6, attackPattern: 'ranged' }];
}

/** A fight state with no play-i perks, for tests and set pieces. */
export const BASE_FIGHT_FLAGS = {
  perks: NO_PERKS, firstStrikeUsed: false, sidestepReady: false, holdfastReady: false,
  allies: [] as Ally[], mark: null as FightState['mark'], allyHitFoes: [] as number[], allyGuard: 0,
  playerBurning: 0, playerStunned: false, playerSwimming: false, playerBleeding: 0, overload: 0,
  playerSlowed: 0, playerHasted: 0, playerDrive: 0, tide: null as FightState['tide'], alarm: null as FightState['alarm'], flinchUsed: false,
};

/** Damage that would drop the player to 0 leaves them on 1 instead, once per host. */
function holdOn(s: FightState, hp: number, events: FightEvent[]): { hp: number; holdfastReady: boolean } {
  if (hp > 0 || !s.holdfastReady) return { hp, holdfastReady: s.holdfastReady };
  events.push(say('HOLDFAST -- the signal refuses to let go (1 HP)', 'critical'));
  events.push({ kind: 'holdfast' });
  return { hp: 1, holdfastReady: false };
}
export const livingFoes = (s: FightState) => s.foes.map((f, i) => ({ f, i })).filter(x => isAlive(x.f));

export function newFoe(unit: Character, pos: TilePosition, heat: number): Foe {
  return { unit, pos, heat, defenseBoost: 0, malfunctioning: false, chargingHeavy: false, pendingAction: null, scriptTurn: 0, pendingVictim: null, pendingTiles: null, burning: 0, stunned: false, enraged: false };
}

export const allyAlive = (a: Ally) => a.unit.currentHp > 0;

// ── Tides ────────────────────────────────────────────────────────────────────
// Boards with mud flats ('m' in a drawn arena) have a tide. Fights start at low
// tide; every TIDE.every rounds it turns. When it comes in, the mud becomes open
// sea and anyone standing on it is in the water (no damage: it just costs their
// next turn climbing out, and they can't be hit meanwhile). When it goes out,
// the mud is ground again.

export const TIDE = { every: 3 };

/** The tide a fight starts with: low, or none if the board has no mud flats. */
export const startTide = (grid: CombatGrid): FightState['tide'] =>
  grid.tiles.some(row => row.some(t => t.tidal)) ? { high: false, turnsLeft: TIDE.every } : null;

/** A new round: the tide counts down, and turns when it reaches zero. */
export function tideTick(s: FightState): Step {
  if (!s.tide) return { state: s, events: [] };
  const left = s.tide.turnsLeft - 1;
  if (left > 0) return { state: { ...s, tide: { ...s.tide, turnsLeft: left } }, events: [] };
  const high = !s.tide.high;
  const tiles = s.grid.tiles.map(row => row.map(t => (t.tidal ? (high ? { type: 'void' as const, tidal: true } : { type: 'empty' as const, art: 'mud', tidal: true }) : t)));
  let state: FightState = { ...s, grid: { ...s.grid, tiles }, tide: { high, turnsLeft: TIDE.every } };
  const events: FightEvent[] = [say(high ? 'The tide comes in over the mud' : 'The tide goes out')];
  if (high) {
    const flooded = (p: TilePosition) => !!tileAt(p, s.grid)?.tidal;
    if (flooded(s.grid.playerPosition) && !s.playerSwimming) { state = { ...state, playerSwimming: true }; events.push(say('The water takes your feet: you are in the sea', 'critical')); }
    state.foes.forEach((f, i) => {
      if (isAlive(f) && !f.swimming && flooded(f.pos)) { state = setFoe(state, i, { swimming: true, chargingHeavy: false, pendingAction: null, pendingVictim: null, pendingTiles: null }); events.push(say(`${f.unit.name} is swept off its feet`)); }
    });
    state = { ...state, allies: state.allies.map(a => (allyAlive(a) && !a.swimming && flooded(a.pos) ? { ...a, swimming: true, taunting: false } : a)) };
  }
  return { state, events };
}

// ── The alarm ────────────────────────────────────────────────────────────────
// In chapters with an alarm, it trips at the start of round ALARM.after + 1: the
// lights and the air go off. From the next round on, everyone's heat climbs by
// ALARM.heat at the start of every round, and anyone beside a cold pod sheds
// ALARM.cold instead of gaining. Fights become a race before bodies cook.

export const ALARM = { after: 2, heat: 7, cold: 14 };

export const startAlarm = (has: boolean): FightState['alarm'] => (has ? { on: false, turnsLeft: ALARM.after } : null);

/** Is p beside (or on) a cold pod? */
export const besideColdPod = (s: FightState, p: TilePosition) => {
  for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) if (tileAt({ row: p.row + dr, col: p.col + dc }, s.grid)?.cold) return true;
  return false;
};

/** A new round: the alarm counts down and trips; once tripped, the ward heats everyone up. */
export function alarmTick(s: FightState): Step {
  if (!s.alarm) return { state: s, events: [] };
  if (!s.alarm.on) {
    const left = s.alarm.turnsLeft - 1;
    if (left > 0) return { state: { ...s, alarm: { on: false, turnsLeft: left } }, events: [] };
    return { state: { ...s, alarm: { on: true, turnsLeft: 0 } }, events: [say('The alarm trips. The lights go out and the air stops moving', 'critical')] };
  }
  const shift = (p: TilePosition) => (besideColdPod(s, p) ? -ALARM.cold : ALARM.heat);
  const cooled = besideColdPod(s, s.grid.playerPosition);
  const state: FightState = {
    ...s,
    playerHeat: clampHeat(s.playerHeat + shift(s.grid.playerPosition)),
    foes: s.foes.map(f => (isAlive(f) ? { ...f, heat: clampHeat(f.heat + shift(f.pos)) } : f)),
  };
  return { state, events: [say(cooled ? 'The ward is an oven. The pod beside you is cold' : `The ward is an oven: +${ALARM.heat} heat`)] };
}

// ── Dreamers ─────────────────────────────────────────────────────────────────
// In chapters whose hosts still have someone asleep inside, the sleeper may
// flinch at the start of your turn (FLINCH.chance, once a fight): you take one
// step you didn't choose, onto open ground beside you.

export const FLINCH = { chance: 0.2 };

export function dreamerFlinch(s: FightState): Step {
  if (s.flinchUsed || s.playerSwimming || random() >= FLINCH.chance) return { state: s, events: [] };
  const me = s.grid.playerPosition;
  const open: TilePosition[] = [];
  for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) {
    const p = { row: me.row + dr, col: me.col + dc };
    if ((dr || dc) && inBounds(p, s.grid) && tileAt(p, s.grid)?.type === 'empty' && !bodyAt(s, p)) open.push(p);
  }
  if (!open.length) return { state: s, events: [] };
  const to = open[Math.floor(random() * open.length)];
  return { state: { ...s, grid: { ...s.grid, playerPosition: to }, flinchUsed: true }, events: [say("The sleeper inside flinches. You take a step you didn't choose", 'critical')] };
}

// ── Speed and turn order ─────────────────────────────────────────────────────
// Every round, everyone is sorted by speed (the player winning ties, allies
// acting in the player's slot), so the order can change mid-fight. A fast
// enemy that acts last one round and first the next gets two turns in a row.

/** Speed is base + the average drive of the body's implants; very hot bodies and Slowed are slower, Hasted faster. */
export const SPEED = { base: 10, hot: 85, hotPenalty: 2, status: 4, statusRounds: 2, fast: 1 };
/** How much each maker's implants push their wearer's speed. */
export const DRIVE: Record<Maker, number> = { VOLKOV: 3, IOA: 2, KIZUNA: 2, TIANXIA: 1, CBN: 1, CROWN: 1, PATCHWORK: 0, PARSU: -1, HELIX: -2 };

/** Average drive of a set of implants (0 for none). */
export function implantDrive(items: Item[]): number {
  const imps = items.filter(i => i.type === 'augmentation');
  return imps.length ? imps.reduce((n, i) => n + DRIVE[makerOf(i)], 0) / imps.length : 0;
}

/** Who takes a turn: the player (with allies) or foe i. */
export type Actor = 'player' | number;

/** Speed right now, rounded to one decimal. */
export function speedOf(s: FightState, a: Actor): number {
  let v: number;
  if (a === 'player') {
    v = SPEED.base + (s.playerDrive ?? 0) - (s.playerHeat >= SPEED.hot ? SPEED.hotPenalty : 0)
      + ((s.playerHasted ?? 0) > 0 ? SPEED.status : 0) - ((s.playerSlowed ?? 0) > 0 ? SPEED.status : 0);
  } else {
    const f = s.foes[a];
    v = SPEED.base + implantDrive(f.unit.carried ?? []) + (hasTrait(f, 'fast') ? SPEED.fast : 0) - (f.heat >= SPEED.hot ? SPEED.hotPenalty : 0)
      + ((f.hasted ?? 0) > 0 ? SPEED.status : 0) - ((f.slowed ?? 0) > 0 ? SPEED.status : 0);
  }
  return Math.round(v * 10) / 10;
}

/** This round's order: fastest first; the player wins ties, then foes in their order. */
export function roundOrder(s: FightState): Actor[] {
  const actors: Actor[] = ['player', ...s.foes.map((_, i) => i).filter(i => isAlive(s.foes[i]))];
  return actors.map((a, n) => ({ a, n, v: speedOf(s, a) })).sort((x, y) => y.v - x.v || x.n - y.n).map(x => x.a);
}

/** A new round starts: Slowed and Hasted count down a round. */
export function tickSpeed(s: FightState): FightState {
  const dec = (n?: number) => Math.max(0, (n ?? 0) - 1);
  return { ...s, playerSlowed: dec(s.playerSlowed), playerHasted: dec(s.playerHasted), foes: s.foes.map(f => (f.slowed || f.hasted ? { ...f, slowed: dec(f.slowed), hasted: dec(f.hasted) } : f)) };
}

/**
 * Foes that will act twice before the player's next turn: given who is still to
 * act this round (`rest`, player excluded), and next round's order as things stand.
 */
export function doubleTurns(s: FightState, rest: Actor[]): number[] {
  const next = roundOrder(tickSpeed(s));
  const before = [...rest.filter(a => a !== 'player'), ...next.slice(0, next.indexOf('player'))] as number[];
  return Array.from(new Set(before.filter((i, n) => before.indexOf(i) !== n))).filter(i => isAlive(s.foes[i]));
}

/** The grid with foe i as the enemy position and every other unit (foes, allies) in the way. */
export function viewFor(s: FightState, i: number): CombatGrid {
  const occupied = [
    ...s.foes.filter((f, k) => k !== i && isAlive(f)).map(f => f.pos),
    ...s.allies.filter(allyAlive).map(a => a.pos),
  ];
  return { ...s.grid, bossPosition: s.foes[i]?.pos ?? s.grid.bossPosition, occupied };
}

/** Who foe i goes for: -1 for the player, or an ally's index. */
export function victimOf(s: FightState, i: number): number {
  const taunt = s.allies.findIndex(a => allyAlive(a) && !a.swimming && a.taunting);
  if (taunt >= 0) return taunt;
  const from = s.foes[i].pos;
  // Nobody in the sea can be reached: the player only counts while on deck
  let best = -1, bestDist = s.playerSwimming ? Infinity : chebyshev(from, s.grid.playerPosition);
  s.allies.forEach((a, k) => {
    if (!allyAlive(a) || a.swimming) return;
    const d = chebyshev(from, a.pos);
    if (d < bestDist) { best = k; bestDist = d; }
  });
  return best;
}

/** The grid as foe i sees it: its victim in the target spot, everyone else in the way. */
export function foeView(s: FightState, i: number, victim = victimOf(s, i)): CombatGrid {
  const g = viewFor(s, i);
  const ally = s.allies[victim];
  if (victim < 0 || !ally) return g;
  return {
    ...g, playerPosition: ally.pos,
    occupied: [...(g.occupied ?? []).filter(p => !same(p, ally.pos)), s.grid.playerPosition],
  };
}

/** The grid as the player sees it while aiming at a foe. */
export function playerView(s: FightState, i = s.target): CombatGrid {
  return viewFor(s, i);
}

const setFoe = (s: FightState, i: number, patch: Partial<Foe>): FightState =>
  ({ ...s, foes: s.foes.map((f, k) => (k === i ? { ...f, ...patch } : f)) });

/** After a foe falls: pick a new living target and say if the fight is won. */
function afterFoeChanges(s: FightState, events: FightEvent[]): FightState {
  if (!s.foes.some(isAlive)) { events.push({ kind: 'allFoesDown' }); return s; }
  if (!isAlive(s.foes[s.target])) {
    const next = s.foes.findIndex(isAlive);
    return { ...s, target: next };
  }
  return s;
}

// ── Round start ──────────────────────────────────────────────────────────────

/** Start of the player's turn: everyone cools off; a cool player acts twice. */
export function startPlayerTurn(s: FightState): FightState {
  const playerHeat = clampHeat(s.playerHeat - PASSIVE_COOLING - s.perks.extraCooling);
  return {
    ...s,
    playerHeat,
    allies: s.allies.map(a => ({ ...a, moved: false, acted: false, taunting: false, defenseBoost: 0, cooldowns: a.cooldowns.map(c => Math.max(0, c - 1)) })),
    mark: null, allyHitFoes: [], allyGuard: 0,
    foes: s.foes.map(f => ({ ...f, heat: clampHeat(f.heat - PASSIVE_COOLING) })),
    doubleActionReady: playerHeat <= s.perks.doubleActionHeat,
    noParting: false,
  };
}

// ── Overload ─────────────────────────────────────────────────────────────────

/**
 * Overload fills as blows are traded: a share of each hit you land (relative to the
 * target's health) and more for each hit you take (relative to yours). Full = one Surge.
 */
export const OVERLOAD = { dealt: 25, taken: 50, full: 100, reach: 2, mult: 1.5 };
const gainOverload = (s: FightState, amount: number): FightState => ({ ...s, overload: Math.min(OVERLOAD.full, s.overload + Math.max(0, Math.round(amount))) });
const SURGE: CombatAction = { type: 'special', name: 'Signal Surge', description: '', damage: 0, accuracy: 'precise', physicalRatio: 0.5 };

export const surgeTargets = (s: FightState) => livingFoes(s).filter(x => !x.f.swimming && chebyshev(x.f.pos, s.grid.playerPosition) <= OVERLOAD.reach).map(x => x.i);
export const canSurge = (s: FightState) => s.overload >= OVERLOAD.full && surgeTargets(s).length > 0;

/** Signal Surge: every enemy within 2 tiles takes 1.5x your best move's damage, and your heat vents to zero. */
export function resolveSurge(s: FightState, bestDamage: number): Step {
  const events: FightEvent[] = [say('SIGNAL SURGE -- the body screams and everything near it reels', 'critical'), { kind: 'surge' }];
  let state: FightState = { ...s, overload: 0, playerHeat: 0 };
  const action = { ...SURGE, damage: Math.max(20, Math.round(bestDamage * OVERLOAD.mult)) };
  for (const i of surgeTargets(s)) {
    const foe = state.foes[i];
    const dmg = calculateDamage(s.player, foe.unit, action, foe.defenseBoost, s.perks.damageMult * takenBy(foe), 0, chebyshev(s.grid.playerPosition, foe.pos), false, 0);
    const hp = Math.max(0, foe.unit.currentHp - dmg.bioDamage);
    const structure = Math.max(0, foe.unit.currentStructuralHp - dmg.structuralDamage);
    state = setFoe(state, i, { unit: { ...foe.unit, currentHp: hp, currentStructuralHp: structure }, malfunctioning: structure <= 0, defenseBoost: 0 });
    events.push(say(`${foe.unit.name}: ${dmg.bioDamage} bio / ${dmg.structuralDamage} structural`, 'damage'));
    if (hp <= 0) { events.push(say(`${foe.unit.name} is down`, 'critical')); events.push({ kind: 'foeDown', foe: i }); }
  }
  return { state: afterFoeChanges(state, events), events };
}

// ── Conditions ───────────────────────────────────────────────────────────────

/** Knockback into something solid: share of the hit dealt again as collision damage (at least the minimum). */
export const COLLISION = { share: 0.3, min: 4 };
/** Burning: a share of max health each turn, for this many turns. */
export const BURN = { share: 0.04, min: 3, turns: 2 };
const burnDamage = (maxHp: number) => Math.max(BURN.min, Math.round(maxHp * BURN.share));

type Body = { kind: 'player' } | { kind: 'foe'; i: number } | { kind: 'ally'; k: number };
function bodyAt(s: FightState, p: TilePosition): Body | null {
  if (same(s.grid.playerPosition, p)) return { kind: 'player' };
  const i = s.foes.findIndex(f => isAlive(f) && same(f.pos, p));
  if (i >= 0) return { kind: 'foe', i };
  const k = s.allies.findIndex(a => allyAlive(a) && same(a.pos, p));
  return k >= 0 ? { kind: 'ally', k } : null;
}
const posOf = (s: FightState, b: Body) => (b.kind === 'player' ? s.grid.playerPosition : b.kind === 'foe' ? s.foes[b.i].pos : s.allies[b.k].pos);
const nameOf = (s: FightState, b: Body) => (b.kind === 'player' ? 'You' : b.kind === 'foe' ? s.foes[b.i].unit.name : s.allies[b.k].unit.name);

/** Take damage that ignores defence (collisions, burning), with the right knockout events. */
function hurt(s: FightState, b: Body, dmg: number, events: FightEvent[]): FightState {
  if (b.kind === 'player') {
    const held = holdOn(s, Math.max(0, s.player.currentHp - dmg), events);
    if (held.hp <= 0) events.push({ kind: 'playerDown' });
    return { ...s, player: { ...s.player, currentHp: held.hp }, holdfastReady: held.holdfastReady };
  }
  if (b.kind === 'foe') {
    const f = s.foes[b.i];
    const hp = Math.max(0, f.unit.currentHp - dmg);
    if (hp <= 0 && f.unit.currentHp > 0) { events.push(say(`${f.unit.name} is down`, 'critical')); events.push({ kind: 'foeDown', foe: b.i }); }
    return setFoe(s, b.i, { unit: { ...f.unit, currentHp: hp } });
  }
  const a = s.allies[b.k];
  const hp = Math.max(0, a.unit.currentHp - dmg);
  if (hp <= 0 && a.unit.currentHp > 0) { events.push(say(`${a.unit.name} is knocked out`, 'critical')); events.push({ kind: 'allyDown', ally: b.k }); }
  return { ...s, allies: s.allies.map((x, n) => (n === b.k ? { ...x, unit: { ...x.unit, currentHp: hp } } : x)) };
}
const stun = (s: FightState, b: Body): FightState =>
  b.kind === 'player' ? { ...s, playerStunned: true }
  : b.kind === 'foe' ? setFoe(s, b.i, { stunned: true })
  : { ...s, allies: s.allies.map((x, n) => (n === b.k ? { ...x, stunned: true } : x)) };

/**
 * Knockback from `from`: the body is pushed a tile straight on. Open water swallows
 * it (see swimming). If something solid is there (cover, the rail, another body) it slams into it instead: collision
 * damage and a stun, and a body it hits takes the same damage.
 */
export function knockBack(s: FightState, from: TilePosition, who: Body, hit: number, events: FightEvent[], crush = 1): FightState {
  const at = posOf(s, who);
  const step = { row: Math.sign(at.row - from.row), col: Math.sign(at.col - from.col) };
  const to = { row: at.row + step.row, col: at.col + step.col };
  const other = inBounds(to, s.grid) ? bodyAt(s, to) : null;
  // Open water: in it goes. It hurts, and it spends its next turn climbing out (unhittable meanwhile)
  if (inBounds(to, s.grid) && tileAt(to, s.grid)?.type === 'void' && !other) {
    const dmg = Math.max(COLLISION.min, Math.round(hit * COLLISION.share * crush * (who.kind === 'foe' ? s.perks.collisionMult : 1)));
    events.push(say(`${who.kind === 'player' ? 'You go' : `${nameOf(s, who)} goes`} into the sea: -${dmg}`, 'critical'), { kind: 'collide' });
    const wet = hurt(s, who, dmg, events);
    if (who.kind === 'player') return { ...wet, grid: { ...wet.grid, playerPosition: to }, playerSwimming: true };
    if (who.kind === 'foe') return setFoe(wet, who.i, { pos: to, swimming: true, chargingHeavy: false, pendingAction: null, pendingVictim: null, pendingTiles: null });
    return { ...wet, allies: wet.allies.map((x, n) => (n === who.k ? { ...x, pos: to, swimming: true, taunting: false } : x)) };
  }
  const solid = !inBounds(to, s.grid) || isImpassable(to, s.grid) || other !== null;
  if (!solid) {
    events.push(say(who.kind === 'player' ? 'Knocked back a tile' : `${nameOf(s, who)} is knocked back`));
    if (who.kind === 'player') return { ...s, grid: { ...s.grid, playerPosition: to } };
    if (who.kind === 'foe') return setFoe(s, who.i, { pos: to });
    return { ...s, allies: s.allies.map((x, n) => (n === who.k ? { ...x, pos: to } : x)) };
  }
  const dmg = Math.max(COLLISION.min, Math.round(hit * COLLISION.share * crush * (who.kind === 'foe' ? s.perks.collisionMult : 1)));
  const into = other ? nameOf(s, other) : !inBounds(to, s.grid) ? 'the rail' : tileAt(to, s.grid)?.type === 'void' ? 'the water' : (tileAt(to, s.grid)?.name ?? 'cover');
  events.push(say(`${who.kind === 'player' ? 'You slam' : `${nameOf(s, who)} slams`} into ${other?.kind === 'player' ? 'you' : into}: -${dmg}, stunned`, 'critical'), { kind: 'collide' });
  let state = stun(hurt(s, who, dmg, events), who);
  if (other) { events.push(say(`${nameOf(s, other)} takes ${dmg} from the impact`, 'damage')); state = hurt(state, other, dmg, events); }
  return state;
}

/** Out of the sea onto the nearest open deck tile (nobody on it). */
function climbOut(s: FightState, b: Body, events: FightEvent[]): FightState {
  const from = posOf(s, b);
  let best: TilePosition | null = null, bestD = Infinity;
  for (let row = 0; row < s.grid.rows; row++) for (let col = 0; col < s.grid.cols; col++) {
    const p = { row, col };
    if (isImpassable(p, s.grid) || bodyAt(s, p)) continue;
    const d = chebyshev(p, from) + (tileAt(p, s.grid)?.type === 'hazard' ? 0.5 : 0);
    if (d < bestD) { bestD = d; best = p; }
  }
  events.push(say(`${b.kind === 'player' ? 'You climb' : `${nameOf(s, b)} climbs`} out of the sea`));
  const to = best ?? from;
  if (b.kind === 'player') return { ...s, grid: { ...s.grid, playerPosition: to }, playerSwimming: false };
  if (b.kind === 'foe') return setFoe(s, b.i, { pos: to, swimming: false });
  return { ...s, allies: s.allies.map((x, n) => (n === b.k ? { ...x, pos: to, swimming: false, acted: true, moved: true } : x)) };
}

/** Start of the player's turn, after cooling: burning ticks; a stun or a climb out of the sea costs the whole turn. */
export function playerConditions(s: FightState): Step & { skipTurn: boolean } {
  const events: FightEvent[] = [];
  let state = s;
  if (s.playerBurning > 0) {
    const dmg = burnDamage(s.player.maxHp);
    events.push(say(`Burning: -${dmg} HP`, 'damage'), { kind: 'burn' });
    state = { ...hurt(state, { kind: 'player' }, dmg, events), playerBurning: s.playerBurning - 1 };
  }
  if ((s.playerBleeding ?? 0) > 0) {
    const dmg = Math.max(BLEED.min, Math.round(s.player.maxHp * BLEED.share));
    events.push(say(`Bleeding: -${dmg} HP`, 'damage'));
    state = { ...hurt(state, { kind: 'player' }, dmg, events), playerBleeding: (s.playerBleeding ?? 0) - 1 };
  }
  // Allies burn too, and a stunned ally sits this round out
  state.allies.forEach((a, k) => {
    if (!allyAlive(a) || a.burning <= 0) return;
    const dmg = burnDamage(a.unit.maxHp);
    events.push(say(`${a.unit.name} is burning: -${dmg}`, 'damage'), { kind: 'burn' });
    state = hurt(state, { kind: 'ally', k }, dmg, events);
    state = { ...state, allies: state.allies.map((x, n) => (n === k ? { ...x, burning: x.burning - 1 } : x)) };
  });
  state = { ...state, allies: state.allies.map(a => (a.stunned ? { ...a, stunned: false, acted: true, moved: true } : a)) };
  state.allies.forEach((a, k) => { if (allyAlive(a) && a.swimming) state = climbOut(state, { kind: 'ally', k }, events); });
  const down = events.some(e => e.kind === 'playerDown');
  const swam = !!s.playerSwimming && !down;
  if (swam) state = climbOut(state, { kind: 'player' }, events);
  const skipTurn = (s.playerStunned || swam) && !down;
  if (s.playerStunned && skipTurn) { events.push(say('STUNNED -- you lose this turn', 'critical')); state = { ...state, playerStunned: false }; }
  return { state, events, skipTurn };
}

/** Aim at a different foe (only living ones). */
export function setTarget(s: FightState, i: number): FightState {
  return s.foes[i] && isAlive(s.foes[i]) ? { ...s, target: i } : s;
}

// ── Player actions ───────────────────────────────────────────────────────────

/** Brace: guard up, cool down, repair part of the structure bar. */
export function resolveBrace(s: FightState, action: CombatAction): Step {
  const { player } = s;
  const wasMalfunctioning = isMalfunctioning(player);
  const structure = Math.min(player.maxStructuralHp, player.currentStructuralHp + Math.ceil(player.maxStructuralHp * s.perks.braceRepair));
  const heal = Math.min(player.maxHp - player.currentHp, Math.round(player.maxHp * s.perks.braceHeal));
  const events: FightEvent[] = [];
  if (wasMalfunctioning && structure > 0) events.push(say('STRUCTURAL INTEGRITY RESTORED -- system nominal'));
  events.push(say(`${action.name.toUpperCase()} -- guard up${heal > 0 ? `, +${heal} HP` : ''}`, heal > 0 ? 'heal' : 'info'));
  return {
    state: {
      ...s,
      player: { ...player, currentStructuralHp: structure, currentHp: player.currentHp + Math.max(0, heal) },
      playerDefenseBoost: action.defenseBoost || 8,
      playerMalfunctioning: player.maxStructuralHp > 0 && structure <= 0,
      playerHeat: clampHeat(s.playerHeat + (action.heatGenerated ?? -25) - s.perks.ventBonus),
    },
    events,
  };
}

/** The shape an attack uses, filling in class specials and the old default. */
export function attackPatternOf(action: CombatAction, playerClass: PlayerClass): AttackPatternType {
  return action.attackPattern
    ?? (action.type === 'special' ? (CLASS_DEFINITIONS[playerClass]?.specialAbility?.attackPattern || 'ranged') : 'melee_long');
}

const ignoresRange = (action: CombatAction, playerClass: PlayerClass) =>
  !!(action.ignoreRange || (action.type === 'special' && CLASS_DEFINITIONS[playerClass]?.specialAbility?.ignoreRange));

// Aiming: the player aims an attack at a tile, and every enemy standing on the
// tiles it lands on is hit. There's no target to pick first.

/** Arm moves only reach their own side: left arm left, right arm right; straight up and down are both. */
const onSide = (action: CombatAction, from: TilePosition, to: TilePosition) =>
  action.side === 'left' ? to.col <= from.col : action.side === 'right' ? to.col >= from.col : true;
const foeAt = (s: FightState, p: TilePosition) => s.foes.findIndex(f => isAlive(f) && same(f.pos, p));

/** The tiles an attack aimed at `aim` lands on, or [] if it can't be aimed there. */
export function aimTiles(s: FightState, action: CombatAction, playerClass: PlayerClass, aim: TilePosition): TilePosition[] {
  const from = s.grid.playerPosition;
  if (same(from, aim) || !onSide(action, from, aim)) return [];
  if (ignoresRange(action, playerClass)) return foeAt(s, aim) >= 0 ? [aim] : [];
  const view = playerView(s);
  // An "ignores cover" mod: shots fly as if the cover weren't there
  const seen = action.effects?.ignoreCover ? { ...view, tiles: view.tiles.map(r => r.map(t => (t.type === 'obstacle' ? { type: 'empty' as const } : t))) } : view;
  return getHitTiles(from, aim, attackPatternOf(action, playerClass), seen);
}

/** Every living foe standing on the tiles an aim lands on. */
export function struckAt(s: FightState, action: CombatAction, playerClass: PlayerClass, aim: TilePosition): number[] {
  const tiles = aimTiles(s, action, playerClass, aim);
  const hit = s.foes.map((_, i) => i).filter(i => hittable(s.foes[i]) && tiles.some(t => same(t, s.foes[i].pos)));
  // Cheap parts only manage the nearest one in the shape
  if (action.effects?.focus && hit.length > 1) {
    const d = (i: number) => chebyshev(s.grid.playerPosition, s.foes[i].pos);
    return [hit.reduce((a, b) => (d(b) < d(a) ? b : a))];
  }
  return hit;
}

/** Every tile the attack can be aimed at from where the player stands. */
export function aimableTiles(s: FightState, action: CombatAction, playerClass: PlayerClass): TilePosition[] {
  const out: TilePosition[] = [];
  for (let row = 0; row < s.grid.rows; row++) for (let col = 0; col < s.grid.cols; col++) {
    if (aimTiles(s, action, playerClass, { row, col }).length) out.push({ row, col });
  }
  return out;
}

/** The aim that hits the most enemies (the current target, then the nearest, winning ties), or null if nothing is in reach. */
export function bestAim(s: FightState, action: CombatAction, playerClass: PlayerClass): TilePosition | null {
  let best: TilePosition | null = null, score = -Infinity;
  for (const t of aimableTiles(s, action, playerClass)) {
    const hit = struckAt(s, action, playerClass, t);
    if (!hit.length) continue;
    const near = Math.min(...hit.map(i => chebyshev(s.grid.playerPosition, s.foes[i].pos)));
    const sc = hit.length * 100 + (hit.includes(s.target) ? 10 : 0) - near - chebyshev(s.grid.playerPosition, t) * 0.01;
    if (sc > score) { score = sc; best = t; }
  }
  return best;
}

/** Can the player hit foe i (the current target by default) with this action from where they stand? */
export function canPlayerHit(s: FightState, action: CombatAction, playerClass: PlayerClass, i = s.target): boolean {
  if (!s.foes[i] || !isAlive(s.foes[i])) return false;
  return aimableTiles(s, action, playerClass).some(t => struckAt(s, action, playerClass, t).includes(i));
}

/** Can this attack hit anyone from here? */
export const canPlayerHitAny = (s: FightState, action: CombatAction, playerClass: PlayerClass) => bestAim(s, action, playerClass) !== null;

/** Which foes an attack lands on: everyone on the aimed tiles (the best aim if none is given). */
export function foesStruck(s: FightState, action: CombatAction, playerClass: PlayerClass, aim: TilePosition | null = bestAim(s, action, playerClass)): number[] {
  return aim ? struckAt(s, action, playerClass, aim) : [];
}

/** Drag a body straight toward `toward`, tile by tile, until a body, cover or water is in the way. */
function pullBody(s: FightState, b: Body, toward: TilePosition, events: FightEvent[]): FightState {
  let at = posOf(s, b);
  const step = { row: Math.sign(toward.row - at.row), col: Math.sign(toward.col - at.col) };
  let moved = 0;
  for (;;) {
    const next = { row: at.row + step.row, col: at.col + step.col };
    if (same(next, toward) || !inBounds(next, s.grid) || isImpassable(next, s.grid) || bodyAt(s, next)) break;
    at = next; moved++;
  }
  if (!moved) return s;
  events.push(say(`${b.kind === 'player' ? 'You are' : `${nameOf(s, b)} is`} dragged ${moved} tile${moved > 1 ? 's' : ''}`, 'critical'));
  if (b.kind === 'player') return { ...s, grid: { ...s.grid, playerPosition: at } };
  if (b.kind === 'foe') return setFoe(s, b.i, { pos: at });
  return { ...s, allies: s.allies.map((x, n) => (n === b.k ? { ...x, pos: at } : x)) };
}

/**
 * An enemy move's side effects on whoever it hit (after the damage): bleed, a
 * stun chance, knockback, or being dragged toward the attacker.
 */
function foeHitEffects(s: FightState, i: number, who: Body, action: CombatAction, dealt: number, events: FightEvent[]): FightState {
  const fx = action.effects;
  if (!fx) return s;
  const alive = who.kind === 'player' ? s.player.currentHp > 0 : who.kind === 'ally' ? allyAlive(s.allies[who.k]) : true;
  if (!alive) return s;
  let state = s;
  if (fx.bleed && who.kind === 'player') { state = { ...state, playerBleeding: BLEED.turns }; events.push(say('You are bleeding', 'critical')); }
  if (fx.stun && random() < fx.stun) { state = stun(state, who); events.push(say(`${who.kind === 'player' ? 'You are' : `${nameOf(state, who)} is`} stunned`, 'critical')); }
  if (fx.knock && action.attackPattern !== 'knockback') state = knockBack(state, state.foes[i].pos, who, dealt, events);
  if (fx.pull) state = pullBody(state, who, state.foes[i].pos, events);
  if (fx.slow && who.kind === 'player') { state = { ...state, playerSlowed: SPEED.statusRounds }; events.push(say('You are slowed: you act later for 2 rounds', 'critical')); }
  if (fx.slow && who.kind === 'foe') state = setFoe(state, who.i, { slowed: SPEED.statusRounds });
  return state;
}

/** Bleeding: a share of max health at the start of each of the next turns. */
export const BLEED = { share: 0.05, min: 3, turns: 2 };

/**
 * Side effects of a player attack, once its damage has landed (`before` is the
 * state the attack started from): bleed, stun, knockback, pull, drain, and moving
 * yourself (dash down the lane, or a hit-and-run step back).
 */
function applyHitEffects(state: FightState, before: FightState, action: CombatAction, struck: number[], dealt: number, aim: TilePosition | null, events: FightEvent[]): FightState {
  const fx = action.effects;
  if (!fx) return state;
  const me = before.grid.playerPosition;
  const free = (p: TilePosition) => inBounds(p, state.grid) && !isImpassable(p, state.grid) && !bodyAt(state, p);
  for (const i of struck) {
    if (!isAlive(state.foes[i])) continue;
    const name = state.foes[i].unit.name;
    if (fx.bleed) { state = setFoe(state, i, { bleeding: BLEED.turns }); events.push(say(`${name} is bleeding`)); }
    if (fx.stun && random() < fx.stun) { state = setFoe(state, i, { stunned: true }); events.push(say(`${name} is stunned`, 'critical')); }
    if (fx.slow) { state = setFoe(state, i, { slowed: SPEED.statusRounds }); events.push(say(`${name} is slowed`)); }
    if (fx.knock && action.attackPattern !== 'knockback') state = knockBack(state, me, { kind: 'foe', i }, Math.round(dealt / Math.max(1, struck.length)), events, fx.crush ? 2 : 1);
  }
  if (fx.haste && struck.length) { state = { ...state, playerHasted: SPEED.statusRounds }; events.push(say('Hasted: you act sooner for 2 rounds')); }
  // Pull: drag the first one caught toward you until something is in the way
  if (fx.pull && struck.length && isAlive(state.foes[struck[0]])) state = pullBody(state, { kind: 'foe', i: struck[0] }, me, events);
  if (fx.drain && dealt > 0) {
    const heal = Math.min(state.player.maxHp - state.player.currentHp, Math.round(dealt * fx.drain));
    if (heal > 0) { state = { ...state, player: { ...state.player, currentHp: state.player.currentHp + heal } }; events.push(say(`Drained ${heal} HP`, 'heal')); }
  }
  // Dash: you end at the far end of the lane you struck down
  if (fx.dash && aim) {
    const step = { row: Math.sign(aim.row - me.row), col: Math.sign(aim.col - me.col) };
    let end = me;
    for (let k = 1; k <= 3; k++) {
      const p = { row: me.row + step.row * k, col: me.col + step.col * k };
      if (!inBounds(p, state.grid) || isImpassable(p, state.grid)) break;
      if (!bodyAt(state, p)) end = p;
    }
    if (!same(end, me)) { state = { ...state, grid: { ...state.grid, playerPosition: end }, noParting: true }; events.push(say('You dash through')); }
  }
  // Hit and run: a step straight back from whoever you hit
  if (fx.retreat && struck.length) {
    const from = state.foes[struck[0]].pos;
    const back = { row: me.row + Math.sign(me.row - from.row), col: me.col + Math.sign(me.col - from.col) };
    if (free(back) && tileAt(back, state.grid)?.type !== 'hazard') { state = { ...state, grid: { ...state.grid, playerPosition: back }, noParting: true }; events.push(say('You step back out of reach')); }
  }
  return state;
}

/** An attack or special aimed at a tile (the best aim if none is given). Everyone on the struck tiles is hit. */
export function resolvePlayerAttack(s: FightState, action: CombatAction, playerClass: PlayerClass = 'none', aim: TilePosition | null = bestAim(s, action, playerClass)): Step {
  const { player, grid, playerHeat } = s;
  const heatMult = getHeatMultipliers(playerHeat);

  // Kizuna cold start: the first strike while cool is precise. Overclock is too.
  const kizunaFiredNow = !!player.hasKizuna && playerHeat <= 20 && !s.kizunaJustFired;
  const cleanFirst = s.perks.firstStrikePrecise && !s.firstStrikeUsed;
  let finalAction = kizunaFiredNow || cleanFirst ? { ...action, accuracy: 'precise' as const } : action;
  if (s.overclockActive) finalAction = { ...finalAction, accuracy: 'precise' as const };

  const events: FightEvent[] = [];
  if (kizunaFiredNow) events.push(say('KIZUNA ACTIVE -- cold-start precision lock'));
  if (s.playerMalfunctioning) events.push(say('MALFUNCTION', 'malfunction'));

  let state: FightState = s;
  const struck = foesStruck(s, action, playerClass, aim);
  // A knockback shoves the nearest one it hits
  const pushed = struck.slice().sort((a, b) => chebyshev(grid.playerPosition, s.foes[a].pos) - chebyshev(grid.playerPosition, s.foes[b].pos))[0];
  const heatPush = action.heatTransfer ?? 0;
  let nearest = Infinity, dealtTotal = 0;
  events.push({ kind: 'hit' });
  for (const i of struck) {
    const foe = state.foes[i];
    const dist = chebyshev(grid.playerPosition, foe.pos);
    nearest = Math.min(nearest, dist);
    const finishing = s.perks.finisherBonus > 0 && foe.unit.currentHp < foe.unit.maxHp * 0.3 ? 1 + s.perks.finisherBonus : 1;
    const marked = s.mark?.foe === i ? 1 + s.mark.bonus : 1;
    const coordinated = s.perks.coordinated && s.allyHitFoes.includes(i) ? 1.2 : 1;
    const dmg = calculateDamage(
      player, foe.unit, finalAction, foe.defenseBoost,
      (s.overclockActive ? 2.0 : heatMult.dealt) * s.perks.damageMult * finishing * marked * coordinated * takenBy(foe),
      hasTrait(foe, 'alert') ? 0 : getFlankBonus(grid.playerPosition, foe.pos) * s.perks.flankMult, dist, s.playerMalfunctioning,
      s.overclockActive ? 100 : playerHeat,
      player.bypassStructuralDefense ?? false,
      s.perks.runaway ? 0.45 : 0.30,
    );
    const hp = Math.max(0, foe.unit.currentHp - dmg.bioDamage);
    dealtTotal += foe.unit.currentHp - hp;
    const structure = Math.max(0, foe.unit.currentStructuralHp - dmg.structuralDamage);
    const heat = clampHeat(foe.heat + heatPush);
    state = setFoe(state, i, {
      unit: { ...foe.unit, currentHp: hp, currentStructuralHp: structure },
      malfunctioning: structure <= 0, defenseBoost: 0, heat,
    });
    state = gainOverload(state, (dmg.bioDamage / Math.max(1, foe.unit.maxHp)) * OVERLOAD.dealt);
    if (attackPatternOf(action, playerClass) === 'knockback' && hp > 0 && i === pushed) state = knockBack(state, grid.playerPosition, { kind: 'foe', i }, dmg.bioDamage, events);
    const who = struck.length > 1 ? `${foe.unit.name}: ` : '';
    if (foe.unit.currentStructuralHp > 0 && structure <= 0) events.push(say(`${foe.unit.name}: MALFUNCTION`, 'malfunction'));
    if (heatPush !== 0) events.push(say(`${foe.unit.name} heat: ${heatPush > 0 ? '+' : ''}${heatPush} (${heat})`));
    events.push(say(`${who}${dmg.isCrit ? 'CRITICAL! ' : ''}Dealt ${dmg.bioDamage} bio / ${dmg.structuralDamage} structural${dmg.isFlank ? ' [FLANK]' : ''}`, dmg.isCrit ? 'critical' : 'damage'));
    if (hp <= 0) { events.push(say(`${foe.unit.name} is down`, 'critical')); events.push({ kind: 'foeDown', foe: i }); }
  }

  state = applyHitEffects(state, s, action, struck, dealtTotal, aim, events);
  const adjacentHeat = nearest === 1 ? 2 : 0;
  const healed = action.healing && action.healing > 0 ? Math.min(player.maxHp, state.player.currentHp + action.healing) : state.player.currentHp;
  state = {
    ...state,
    player: { ...state.player, currentHp: healed },
    playerDefenseBoost: action.defenseBoost && action.defenseBoost > 0 ? action.defenseBoost : 0,
    overclockActive: false,
    kizunaJustFired: kizunaFiredNow || s.kizunaJustFired,
    firstStrikeUsed: true,
    playerHeat: clampHeat(playerHeat + (action.heatGenerated ?? 15) + adjacentHeat - (action.effects?.cool ?? 0)),
  };
  // The screens follow whoever was hit
  if (struck.length && !struck.includes(state.target)) state = { ...state, target: struck[0] };
  state = afterFoeChanges(state, events);
  // Chain: a takedown earns another action, unless that was the last enemy
  if (s.perks.chain && events.some(e => e.kind === 'foeDown') && !events.some(e => e.kind === 'allFoesDown')) {
    events.push(say('CHAIN -- takedown, act again', 'critical'));
    events.push({ kind: 'extraAction' });
  }
  return { state, events };
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

/** Foe i picks its next move from its roster, filtered by range and heat. */
export function chooseFoeAction(s: FightState, i: number): Step & { action: CombatAction | null } {
  const foe = s.foes[i];
  const { unit } = foe;
  const grid = foeView(s, i);
  if (unit.name === 'Patchwork King') {
    const turn = foe.scriptTurn + 1;
    const events: FightEvent[] = [];
    if (turn === 4) events.push(say(PATCHWORK_KING_MONOLOGUE[2]));
    if (turn === 7) events.push(say(PATCHWORK_KING_MONOLOGUE[3]));
    return { action: getPatchworkKingAction(turn), state: setFoe(s, i, { scriptTurn: turn }), events };
  }
  // Its victim is in the sea: nothing to hit this turn
  if (victimOf(s, i) === -1 && s.playerSwimming) return { action: null, state: s, events: [] };
  const roster = foeRoster(foe);
  const dist = chebyshev(foe.pos, grid.playerPosition);
  const heavyFrom = hasTrait(foe, 'focused') ? 30 : HEAVY_MIN_PLAYER_HEAT;
  const filtered = roster.filter(a => {
    if (a.isHeavy && s.playerHeat < heavyFrom) return false;
    // Shields only come out when the enemy is hurt, and not every time
    if (a.type === 'defend' && (unit.currentHp > unit.maxHp * 0.5 || random() > 0.35)) return false;
    const pat = a.attackPattern;
    if (!pat) return true;
    if ((pat === 'charge' || pat === 'lunge') && dist < 2) return false;
    if ((pat === 'sweep_arc' || pat === 'melee') && dist > 2) return false;
    return true;
  });
  // Enemies attack from where they stand, then move: only what reaches right now is on the table
  const reaches = (a: CombatAction) => canHitTarget(foe.pos, grid.playerPosition, a.attackPattern ?? 'melee_long', grid);
  let pool = filtered.filter(a => a.type === 'defend' || reaches(a));
  // Point blank with nothing that reaches: lash out instead of backing away
  if (dist <= 1 && !pool.some(a => a.type !== 'defend')) pool = [CLOSE_QUARTERS];
  if (!pool.length) return { action: null, state: s, events: [] };
  return { action: pool[Math.floor(random() * pool.length)], state: s, events: [] };
}

/** The shape foe i walks to get in reach with: its first ordinary attack. */
const approachPattern = (f: Foe): AttackPatternType | undefined =>
  foeRoster(f).find(a => a.type === 'attack' && !a.isHeavy)?.attackPattern ?? 'melee';

/**
 * Every tile foe i could hit on its next turn. Enemies attack before they move,
 * so ending your turn outside these tiles means it can't touch you. Other
 * enemies don't count as cover here (they may walk away first).
 */
export function foeThreatTiles(s: FightState, i: number, onlyShoves = false): Set<string> {
  const out = new Set<string>();
  const f = s.foes[i];
  if (!f || !isAlive(f) || f.pendingAction || f.stunned || f.swimming) return out;
  const shoves = (a: CombatAction) => a.attackPattern === 'knockback' || !!a.effects?.knock || !!a.effects?.pull;
  const moves = [...foeRoster(f).filter(a => a.type === 'attack' && !a.isHeavy), CLOSE_QUARTERS].filter(a => !onlyShoves || shoves(a));
  const occupied = s.allies.filter(allyAlive).map(a => a.pos);
  for (let row = 0; row < s.grid.rows; row++) for (let col = 0; col < s.grid.cols; col++) {
    const t = { row, col };
    if (same(t, f.pos)) continue;
    const view: CombatGrid = { ...s.grid, bossPosition: f.pos, playerPosition: t, occupied: occupied.filter(p => !same(p, t)) };
    for (const a of moves) {
      const tiles = getHitTiles(f.pos, t, a.attackPattern ?? 'melee_long', view);
      if (tiles.some(x => same(x, t))) tiles.forEach(x => out.add(`${x.row},${x.col}`));
    }
  }
  return out;
}

export function canFoeHit(s: FightState, i: number, pattern: AttackPatternType | undefined, victim = victimOf(s, i)): boolean {
  const g = foeView(s, i, victim);
  return canHitTarget(s.foes[i].pos, g.playerPosition, pattern ?? 'melee_long', g);
}

/** Foe i walks up to BOSS_MOVE tiles, stopping once it can strike. */
export function moveFoeToward(s: FightState, i: number, pattern: AttackPatternType | undefined): Step & { moved: boolean } {
  const foe = s.foes[i];
  if (foe.heat >= 100) return { state: s, events: [say(`${foe.unit.name}: OVERHEATED -- movement locked`)], moved: false };
  const view = foeView(s, i);
  const path = [foe.pos];
  for (let k = 0; k < BOSS_MOVE + (hasTrait(foe, 'fast') ? 1 : 0); k++) {
    const step = stepTowardAttackPosition({ ...view, bossPosition: path[path.length - 1] }, pattern ?? 'melee_long');
    if (!step) break;
    path.push(step);
  }
  // Don't stop on mud the tide takes at the start of next round: stop short instead
  const flooding = !!s.tide && !s.tide.high && s.tide.turnsLeft === 1;
  while (flooding && path.length > 1 && tileAt(path[path.length - 1], s.grid)?.tidal) path.pop();
  const pos = path[path.length - 1];
  return { state: setFoe(s, i, { pos }), events: [], moved: path.length > 1 };
}

/** A heavy attack: wind up where it stands; it fires next turn at the tiles it locks now. */
export function telegraphHeavy(s: FightState, i: number, action: CombatAction): Step {
  // Winds up where it stands
  const moved: Step = { state: s, events: [] };
  const victim = victimOf(moved.state, i);
  const view = foeView(moved.state, i, victim);
  // The heavy is aimed where its target stands now; those tiles are locked in
  const tiles = getHitTiles(moved.state.foes[i].pos, view.playerPosition, action.attackPattern ?? 'melee_long', view);
  if (!tiles.length) return { state: moved.state, events: moved.events };
  const at = victim >= 0 ? ` at ${s.allies[victim].unit.name}` : '';
  return {
    state: setFoe(moved.state, i, { chargingHeavy: true, pendingAction: action, pendingVictim: victim, pendingTiles: tiles }),
    events: [...moved.events, say(`${s.foes[i].unit.name} is charging ${action.name.toUpperCase()}${at}!`, 'critical'), { kind: 'telegraph' }],
  };
}

/** Fire foe i's wound-up heavy at its locked tiles. Everyone standing on them is hit (-1 = the player, else an ally). */
export function releaseHeavy(s: FightState, i: number): Step & { action: CombatAction | null; connects: boolean; victims: number[] } {
  const foe = s.foes[i];
  const action = foe.pendingAction;
  const tiles = foe.pendingTiles ?? [];
  let state = setFoe(s, i, { chargingHeavy: false, pendingAction: null, pendingVictim: null, pendingTiles: null });
  if (!action) return { state, events: [], action: null, connects: false, victims: [] };
  const on = (p: TilePosition) => tiles.some(t => same(t, p));
  const events: FightEvent[] = [];
  let victims: number[] = [];
  if (on(s.grid.playerPosition) && !s.playerSwimming) {
    if (s.sidestepReady) {
      state = { ...state, sidestepReady: false };
      events.push(say(`SIDESTEP -- ${foe.unit.name}'s ${action.name} slides past you`));
    } else victims.push(-1);
  }
  s.allies.forEach((a, k) => { if (allyAlive(a) && !a.swimming && on(a.pos)) victims.push(k); });
  // A charge carries the attacker down its lane, stopping short of anything in the way
  if (action.attackPattern === 'charge') {
    const blocked = (p: TilePosition) => isImpassable(p, s.grid) || same(p, s.grid.playerPosition)
      || s.allies.some(a => allyAlive(a) && same(a.pos, p)) || s.foes.some((f, k) => k !== i && isAlive(f) && same(f.pos, p));
    let end = foe.pos;
    for (const t of tiles) { if (blocked(t)) break; end = t; }
    state = setFoe(state, i, { pos: end });
  }
  if (!victims.length && !events.length) events.push(say(`${foe.unit.name}'s ${action.name} hits empty deck -- you evaded`));
  victims = victims.slice().sort((a, b) => a - b);
  return { state, events, action, connects: victims.length > 0, victims };
}

/** Foe i's attack or shield landing. `level` scales its move damage. */
export function resolveFoeAction(s: FightState, i: number, action: CombatAction, level: number, victim = victimOf(s, i)): Step {
  const foe = s.foes[i];
  const { player, grid } = s;
  if (action.type === 'defend') {
    return {
      state: setFoe(s, i, { defenseBoost: action.defenseBoost || 0, heat: clampHeat(foe.heat + (action.heatGenerated ?? 0)) }),
      events: [say(`${foe.unit.name}: ${action.name.toUpperCase()} -- guard up`)],
    };
  }
  if (victim >= 0 && s.allies[victim]) return hitAlly(s, i, victim, action, level);
  // Enemy heat doesn't scale enemy damage, but a hot player takes more of it
  const taken = (1 + (getHeatMultipliers(s.playerHeat).received - 1) * s.perks.hotTakenMult) * s.perks.damageTakenMult * (hasTrait(foe, 'armed') ? 1.1 : 1);
  const dmg = calculateDamage(foe.unit, player, scaleBossAction(action, level), s.playerDefenseBoost + s.allyGuard, taken, 0, chebyshev(grid.playerPosition, foe.pos), foe.malfunctioning);
  const spill = player.maxStructuralHp > 0 ? 0 : Math.ceil(dmg.structuralDamage * NO_IMPLANT_SPILL);
  const events: FightEvent[] = [];
  const held = holdOn(s, Math.max(0, player.currentHp - dmg.bioDamage - spill), events);
  const hp = held.hp;
  const structure = Math.max(0, player.currentStructuralHp - dmg.structuralDamage);
  const breaks = player.currentStructuralHp > 0 && structure <= 0;
  const playerHeat = clampHeat(s.playerHeat + (action.heatTransfer ?? 0));

  if (playerHeat >= 100 && s.playerHeat < 100) events.push(say('OVERHEATED -- movement locked next turn'));
  events.push({ kind: 'hit' });
  events.push(say(spill
    ? `${foe.unit.name} -- ${action.name}: ${dmg.bioDamage + spill} damage (no implants to absorb it)`
    : `${foe.unit.name} -- ${action.name}: ${dmg.bioDamage} bio / ${dmg.structuralDamage} structural`, 'damage'));
  if (breaks) events.push(say('MALFUNCTION', 'malfunction'));
  if (hp <= 0) events.push({ kind: 'playerDown' });

  let state = setFoe({
    ...s,
    player: { ...player, currentHp: hp, currentStructuralHp: structure },
    playerMalfunctioning: player.maxStructuralHp > 0 && structure <= 0,
    // A guard soaks one hit, so a crowd can't all hit a braced player at full guard
    playerDefenseBoost: 0, allyGuard: 0,
    playerHeat,
    holdfastReady: held.holdfastReady,
  }, i, { heat: clampHeat(foe.heat + (action.heatGenerated ?? 15)) });
  state = gainOverload(state, ((player.currentHp - hp) / Math.max(1, player.maxHp)) * OVERLOAD.taken);
  // Knockback shoves you a tile straight back, or into whatever is behind you
  if (action.attackPattern === 'knockback' && hp > 0) state = knockBack(state, foe.pos, { kind: 'player' }, dmg.bioDamage, events);
  state = foeHitEffects(state, i, { kind: 'player' }, action, dmg.bioDamage, events);
  return { state, events };
}

/** Foe i's attack landing on an ally. Allies have no structure bar: half the structural part spills onto the body. */
function hitAlly(s: FightState, i: number, k: number, action: CombatAction, level: number): Step {
  const foe = s.foes[i], ally = s.allies[k];
  const dmg = calculateDamage(foe.unit, ally.unit, scaleBossAction(action, level), ally.defenseBoost, hasTrait(foe, 'armed') ? 1.1 : 1, 0, chebyshev(ally.pos, foe.pos), foe.malfunctioning);
  const lost = dmg.bioDamage + Math.ceil(dmg.structuralDamage * NO_IMPLANT_SPILL);
  const hp = Math.max(0, ally.unit.currentHp - lost);
  const events: FightEvent[] = [{ kind: 'hit' }, say(`${foe.unit.name} -- ${action.name}: ${lost} damage to ${ally.unit.name}`, 'damage')];
  if (hp <= 0) { events.push(say(`${ally.unit.name} is knocked out`, 'critical')); events.push({ kind: 'allyDown', ally: k }); }
  const allies = s.allies.map((a, n) => (n === k ? { ...a, unit: { ...a.unit, currentHp: hp }, defenseBoost: 0, taunting: hp > 0 && a.taunting } : a));
  let state = setFoe({ ...s, allies }, i, { heat: clampHeat(foe.heat + (action.heatGenerated ?? 15)) });
  if (action.attackPattern === 'knockback' && hp > 0) state = knockBack(state, foe.pos, { kind: 'ally', k }, lost, events);
  state = foeHitEffects(state, i, { kind: 'ally', k }, action, lost, events);
  return { state, events };
}

/**
 * The first half of foe i's turn: fire a wound-up heavy, shield, wind up a new
 * heavy, or attack from where it stands. Then it walks: `walkAfter` tells the
 * store to call foeWalk after a beat. With nothing in reach it just walks.
 */
export function foeTurn(s: FightState, i: number, level: number): Step & { walkAfter: boolean } {
  if (!isAlive(s.foes[i])) return { state: s, events: [], walkAfter: false };
  // Start of its turn: a lung pack heals, burning ticks, and a stun costs the turn (and any wound-up heavy)
  const events: FightEvent[] = [];
  let state = s;
  // A boss's turn: below its threshold it gains traits, once
  const e = s.foes[i].unit.enrage;
  if (e && !s.foes[i].enraged && s.foes[i].unit.currentHp <= s.foes[i].unit.maxHp * e.at) {
    const u = s.foes[i].unit;
    state = setFoe(state, i, { enraged: true, unit: { ...u, traits: [...(u.traits ?? []), ...e.gain.filter(t => !u.traits?.includes(t))] } });
    events.push(say(e.line, 'critical'));
  }
  const f = state.foes[i];
  if (hasTrait(f, 'enduring') && f.unit.currentHp < f.unit.maxHp) {
    const heal = Math.min(f.unit.maxHp - f.unit.currentHp, Math.max(2, Math.round(f.unit.maxHp * 0.02)));
    state = setFoe(state, i, { unit: { ...f.unit, currentHp: f.unit.currentHp + heal } });
    events.push(say(`${f.unit.name} patches up: +${heal}`, 'heal'));
  }
  if (f.burning > 0) {
    const dmg = burnDamage(f.unit.maxHp);
    events.push(say(`${f.unit.name} is burning: -${dmg}`, 'damage'), { kind: 'burn' });
    state = setFoe(hurt(state, { kind: 'foe', i }, dmg, events), i, { burning: f.burning - 1 });
    if (!isAlive(state.foes[i])) return { state: afterFoeChanges(state, events), events, walkAfter: false };
  }
  if ((f.bleeding ?? 0) > 0) {
    const dmg = Math.max(BLEED.min, Math.round(f.unit.maxHp * BLEED.share));
    events.push(say(`${f.unit.name} is bleeding: -${dmg}`, 'damage'));
    state = setFoe(hurt(state, { kind: 'foe', i }, dmg, events), i, { bleeding: (f.bleeding ?? 0) - 1 });
    if (!isAlive(state.foes[i])) return { state: afterFoeChanges(state, events), events, walkAfter: false };
  }
  if (f.swimming) {
    state = climbOut(state, { kind: 'foe', i }, events);
    return { state, events, walkAfter: false };
  }
  if (f.stunned) {
    events.push(say(`${f.unit.name} is stunned`, 'info'));
    state = setFoe(state, i, { stunned: false, chargingHeavy: false, pendingAction: null, pendingVictim: null, pendingTiles: null });
    return { state, events, walkAfter: false };
  }
  const act = foeAct(state, i, level);
  return { ...act, events: [...events, ...act.events] };
}

/** The foe's action itself, once start-of-turn effects are done. */
function foeAct(s: FightState, i: number, level: number): Step & { walkAfter: boolean } {
  if (s.foes[i].pendingAction) {
    const rel = releaseHeavy(s, i);
    let state = rel.state;
    const events = [...rel.events];
    if (rel.action) for (const v of rel.victims) {
      const hit = resolveFoeAction(state, i, rel.action, level, v);
      state = hit.state; events.push(...hit.events);
      if (hit.events.some(e => e.kind === 'playerDown')) break;
    }
    return { state, events, walkAfter: false };
  }
  const choice = chooseFoeAction(s, i);
  const action = choice.action;
  // Nothing reaches from here (a scripted move included): walk instead
  if (!action || (action.type !== 'defend' && !action.isHeavy && !canFoeHit(choice.state, i, action.attackPattern))) {
    const walk = foeWalk(choice.state, i);
    return { state: walk.state, events: [...choice.events, ...walk.events], walkAfter: false };
  }
  if (action.isHeavy) {
    const next = telegraphHeavy(choice.state, i, action);
    return { state: next.state, events: [...choice.events, ...next.events], walkAfter: false };
  }
  const hit = resolveFoeAction(choice.state, i, action, level);
  return { state: hit.state, events: [...choice.events, ...hit.events], walkAfter: true };
}

/**
 * The second half: after attacking (or when nothing reached), foe i walks. It
 * hunts: of the tiles it can reach, it ends where its attacks cover its
 * victim's tile and the tiles the victim could step to, so getting out of the
 * red takes cover or a kill rather than one free step.
 */
export function foeWalk(s: FightState, i: number): Step {
  const foe = s.foes[i];
  if (!foe || !isAlive(foe)) return { state: s, events: [] };
  if (foe.heat >= 100) return { state: s, events: [say(`${foe.unit.name}: OVERHEATED -- movement locked`)] };
  const view = foeView(s, i);
  const prey = view.playerPosition;
  const patterns = Array.from(new Set([...foeRoster(foe).filter(a => a.type === 'attack' && !a.isHeavy), CLOSE_QUARTERS].map(a => a.attackPattern ?? 'melee_long')));
  const keyOf = (k: string) => { const [row, col] = k.split(',').map(Number); return { row, col }; };
  const escape = [prey, ...Array.from(getReachableTiles(prey, { ...view, bossPosition: foe.pos }, PLAYER_BASE_MOVE + s.perks.moveBonus)).map(keyOf)];
  const offBoard = { row: -9, col: -9 };
  const range = BOSS_MOVE + (hasTrait(foe, 'fast') ? 1 : 0);
  const spots = [foe.pos, ...Array.from(getReachableTiles(foe.pos, { ...view, bossPosition: offBoard }, range)).map(keyOf)].filter(p => !same(p, prey));
  const covers = (from: TilePosition, t: TilePosition) =>
    patterns.some(p => canHitTarget(from, t, p, { ...view, bossPosition: from, playerPosition: t, occupied: (view.occupied ?? []).filter(o => !same(o, t)) }));
  let best = foe.pos, bestScore = -Infinity, onPrey = false;
  // Mud that floods at the start of next round is a bad place to stop
  const flooding = !!s.tide && !s.tide.high && s.tide.turnsLeft === 1;
  for (const p of spots) {
    const hitsPrey = covers(p, prey);
    const hits = escape.reduce((n, t, k) => n + (k > 0 && covers(p, t) ? 1 : 0), hitsPrey ? 10 : 0);
    const hazard = s.grid.tiles?.[p.row]?.[p.col]?.type === 'hazard' && !hasTrait(foe, 'filtered') ? 2 : 0;
    const mud = flooding && s.grid.tiles?.[p.row]?.[p.col]?.tidal ? 12 : 0;
    const score = hits - hazard - mud - chebyshev(p, prey) * 0.05 - (same(p, foe.pos) ? 0 : 0.01);
    if (score > bestScore) { bestScore = score; best = p; onPrey = hitsPrey; }
  }
  // Nowhere it can reach covers the victim yet: close the distance the usual way
  if (!onPrey) {
    const walk = moveFoeToward(s, i, approachPattern(foe));
    return { state: walk.state, events: walk.events };
  }
  return { state: setFoe(s, i, { pos: best }), events: [] };
}

/** Who gets a parting blow if the player walks from `from` to `to`: enemies beside `from` but not beside `to` (stunned or winding up, they don't). */
export function partingFoes(s: FightState, from: TilePosition, to: TilePosition): number[] {
  return livingFoes(s).filter(({ f }) => !f.stunned && !f.swimming && !f.pendingAction && chebyshev(f.pos, from) === 1 && chebyshev(f.pos, to) > 1).map(x => x.i);
}

/**
 * Walking away from an enemy you started next to lets it hit you as you go.
 * Without this, hit-and-step-away beats anything that attacks before it moves.
 * Called once the player's turn is done, so a kill on the way out escapes it.
 */
export function partingBlows(s: FightState, from: TilePosition, level: number): Step {
  let state = s;
  const events: FightEvent[] = [];
  if (s.noParting) return { state, events };
  for (const i of partingFoes(s, from, s.grid.playerPosition)) {
    if (!isAlive(state.foes[i])) continue;
    events.push(say(`${state.foes[i].unit.name} catches you as you pull away`, 'critical'));
    const hit = resolveFoeAction(state, i, { ...CLOSE_QUARTERS, name: 'Parting blow', damage: Math.round((CLOSE_QUARTERS.damage ?? 12) * 0.6 * s.perks.partingTakenMult) }, level, -1);
    state = hit.state; events.push(...hit.events);
    if (hit.events.some(e => e.kind === 'playerDown')) break;
  }
  return { state, events };
}

// ── Allies ───────────────────────────────────────────────────────────────────

const setAlly = (s: FightState, k: number, patch: Partial<Ally>): FightState =>
  ({ ...s, allies: s.allies.map((a, n) => (n === k ? { ...a, ...patch } : a)) });

/** The grid from ally k's spot: the target foe as the enemy, every other unit (the player too) in the way. */
function allyView(s: FightState, k: number, i = s.target): CombatGrid {
  const g = viewFor(s, i);
  const me = s.allies[k].pos;
  return { ...g, playerPosition: me, occupied: [...(g.occupied ?? []).filter(p => !same(p, me)), s.grid.playerPosition] };
}

/** Tiles ally k can move to this round. Empty once it has moved or acted. */
export function allyReach(s: FightState, k: number): Set<string> {
  const a = s.allies[k];
  if (!a || !allyAlive(a) || a.moved || a.acted) return new Set();
  const living = s.foes.filter(isAlive);
  const g: CombatGrid = {
    ...s.grid, playerPosition: a.pos, bossPosition: living[0]?.pos ?? s.grid.bossPosition,
    occupied: [...living.slice(1).map(f => f.pos), s.grid.playerPosition, ...s.allies.filter((o, n) => n !== k && allyAlive(o)).map(o => o.pos)],
  };
  return getReachableTiles(a.pos, g, a.move);
}

/** Move ally k (once a round, before it acts). Returns the state unchanged if it can't go there. */
export function moveAlly(s: FightState, k: number, pos: TilePosition): FightState {
  if (!allyReach(s, k).has(`${pos.row},${pos.col}`)) return s;
  return setAlly(s, k, { pos, moved: true });
}

/** Can ally k use move m now (on the current target for attacks)? */
export function canAllyUse(s: FightState, k: number, m: number): boolean {
  const a = s.allies[k], move = a?.moves[m];
  if (!a || !move || !allyAlive(a) || a.acted || (a.cooldowns[m] ?? 0) > 0) return false;
  const foe = s.foes[s.target];
  if (move.effect === 'attack') return !!foe && isAlive(foe) && canHitTarget(a.pos, foe.pos, move.attackPattern ?? 'melee', allyView(s, k));
  if (move.effect === 'mark') return !!foe && isAlive(foe);
  return true;
}

/** Ally k uses move m. Check canAllyUse first. */
export function resolveAllyMove(s: FightState, k: number, m: number): Step {
  const a = s.allies[k], move = a.moves[m];
  const events: FightEvent[] = [];
  let state = setAlly(s, k, { acted: true, cooldowns: a.cooldowns.map((c, n) => (n === m ? move.cooldown ?? 0 : c)) });
  const i = s.target, foe = s.foes[i];
  if (move.effect === 'attack') {
    const dist = chebyshev(a.pos, foe.pos);
    const dmg = calculateDamage(a.unit, foe.unit, move, foe.defenseBoost, takenBy(foe), hasTrait(foe, 'alert') ? 0 : getFlankBonus(a.pos, foe.pos), dist, false, 0);
    const hp = Math.max(0, foe.unit.currentHp - dmg.bioDamage);
    const structure = Math.max(0, foe.unit.currentStructuralHp - dmg.structuralDamage);
    state = setFoe(state, i, { unit: { ...foe.unit, currentHp: hp, currentStructuralHp: structure }, malfunctioning: structure <= 0, defenseBoost: 0 });
    state = { ...state, allyHitFoes: [...state.allyHitFoes, i] };
    events.push({ kind: 'hit' });
    events.push(say(`${a.unit.name} -- ${move.name}: ${dmg.bioDamage} bio / ${dmg.structuralDamage} structural${dmg.isFlank ? ' [FLANK]' : ''}`, 'damage'));
    if (foe.unit.currentStructuralHp > 0 && structure <= 0) events.push(say(`${foe.unit.name}: MALFUNCTION`, 'malfunction'));
    if (hp <= 0) { events.push(say(`${foe.unit.name} is down`, 'critical')); events.push({ kind: 'foeDown', foe: i }); }
    state = afterFoeChanges(state, events);
  } else if (move.effect === 'taunt') {
    state = setAlly(state, k, { taunting: true, defenseBoost: move.defenseBoost ?? 0 });
    events.push(say(`${a.unit.name} -- ${move.name.toUpperCase()}: every enemy turns on ${a.unit.name}`));
  } else if (move.effect === 'heal') {
    const heal = Math.round(s.player.maxHp * (move.amount ?? 0));
    state = { ...state, player: { ...state.player, currentHp: Math.min(state.player.maxHp, state.player.currentHp + heal) } };
    events.push(say(`${a.unit.name} -- ${move.name}: +${heal} HP`, 'heal'));
  } else if (move.effect === 'mark') {
    state = { ...state, mark: { foe: i, bonus: move.amount ?? 0 } };
    events.push(say(`${a.unit.name} -- ${move.name}: ${foe.unit.name} is marked`));
  } else if (move.effect === 'guard') {
    state = { ...state, allyGuard: Math.max(state.allyGuard, move.defenseBoost ?? 0) };
    events.push(say(`${a.unit.name} -- ${move.name}: you guard +${move.defenseBoost ?? 0}`));
  }
  return { state, events };
}

// ── Hazards ──────────────────────────────────────────────────────────────────

/** Hazard art that sets whoever ends a turn on it alight (fuel fire, burning oil). */
export const BURNING_ART = ['fire', 'oil'];

/** Damage to the player from the tile they end their turn on. */
export function applyPlayerHazard(s: FightState): Step {
  const pos = s.grid.playerPosition;
  const dmg = Math.round(hazardDamageAt(pos, s.grid) * s.perks.hazardMult);
  if (dmg <= 0) return { state: s, events: [] };
  const name = tileAt(pos, s.grid)?.name ?? 'Hazard';
  const fire = BURNING_ART.includes(tileAt(pos, s.grid)?.art ?? '');
  const events: FightEvent[] = [say(`${name}: -${dmg} HP${fire ? ', you catch fire' : ''}`, 'damage')];
  const held = holdOn(s, Math.max(0, s.player.currentHp - dmg), events);
  if (held.hp <= 0) events.push({ kind: 'playerDown' });
  return { state: { ...s, player: { ...s.player, currentHp: held.hp }, holdfastReady: held.holdfastReady, playerBurning: fire ? BURN.turns : s.playerBurning }, events };
}

/** Damage to foe i from the tile it ends its turn on. */
export function applyFoeHazard(s: FightState, i: number): Step {
  const foe = s.foes[i];
  if (!foe || !isAlive(foe)) return { state: s, events: [] };
  const dmg = hasTrait(foe, 'filtered') ? 0 : hazardDamageAt(foe.pos, s.grid);
  if (dmg <= 0) return { state: s, events: [] };
  const name = tileAt(foe.pos, s.grid)?.name ?? 'Hazard';
  const fire = BURNING_ART.includes(tileAt(foe.pos, s.grid)?.art ?? '');
  const hp = Math.max(0, foe.unit.currentHp - dmg);
  const events: FightEvent[] = [say(`${foe.unit.name} on ${name}: -${dmg}${fire ? ', catches fire' : ''}`, 'damage')];
  let state = setFoe(s, i, { unit: { ...foe.unit, currentHp: hp }, ...(fire ? { burning: BURN.turns } : {}) });
  if (hp <= 0) { events.push({ kind: 'foeDown', foe: i }); state = afterFoeChanges(state, events); }
  return { state, events };
}

export const isOver = (step: Step) => step.events.some(e => e.kind === 'playerDown' || e.kind === 'allFoesDown');
