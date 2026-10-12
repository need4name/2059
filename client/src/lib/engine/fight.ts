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
import { stepTowardAttackPosition, hazardDamageAt, chebyshev, tileAt, getReachableTiles } from '../combat/grid';
import type { AllyMove } from '../combat/allies';
import { random } from './rng';
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
  | { kind: 'allyDown'; ally: number };

export interface Step { state: FightState; events: FightEvent[] }

const clampHeat = (h: number) => Math.max(0, Math.min(100, h));
export const isMalfunctioning = (c: Character) => c.maxStructuralHp > 0 && c.currentStructuralHp <= 0;
const say = (message: string, type: CombatLog['type'] = 'info'): FightEvent => ({ kind: 'log', message, type });
const same = (a: TilePosition, b: TilePosition) => a.row === b.row && a.col === b.col;

export const isAlive = (f: Foe) => f.unit.currentHp > 0;

/** A fight state with no play-i perks, for tests and set pieces. */
export const BASE_FIGHT_FLAGS = {
  perks: NO_PERKS, firstStrikeUsed: false, sidestepReady: false, holdfastReady: false,
  allies: [] as Ally[], mark: null as FightState['mark'], allyHitFoes: [] as number[], allyGuard: 0,
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
  return { unit, pos, heat, defenseBoost: 0, malfunctioning: false, chargingHeavy: false, pendingAction: null, scriptTurn: 0, pendingVictim: null };
}

export const allyAlive = (a: Ally) => a.unit.currentHp > 0;

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
  const taunt = s.allies.findIndex(a => allyAlive(a) && a.taunting);
  if (taunt >= 0) return taunt;
  const from = s.foes[i].pos;
  let best = -1, bestDist = chebyshev(from, s.grid.playerPosition);
  s.allies.forEach((a, k) => {
    if (!allyAlive(a)) return;
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
  };
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
  const events: FightEvent[] = [];
  if (wasMalfunctioning && structure > 0) events.push(say('STRUCTURAL INTEGRITY RESTORED -- system nominal'));
  events.push(say(`${action.name.toUpperCase()} -- guard up`));
  return {
    state: {
      ...s,
      player: { ...player, currentStructuralHp: structure },
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

/** Can the player hit foe i (the current target by default) with this action from where they stand? */
export function canPlayerHit(s: FightState, action: CombatAction, playerClass: PlayerClass, i = s.target): boolean {
  const foe = s.foes[i];
  if (!foe || !isAlive(foe)) return false;
  return ignoresRange(action, playerClass) || canHitTarget(s.grid.playerPosition, foe.pos, attackPatternOf(action, playerClass), playerView(s, i));
}

/** Which foes an attack on the current target lands on: the target, plus anyone else in the struck tiles. */
export function foesStruck(s: FightState, action: CombatAction, playerClass: PlayerClass): number[] {
  const target = s.foes[s.target];
  if (!target) return [];
  if (ignoresRange(action, playerClass)) return [s.target];
  const tiles = getHitTiles(s.grid.playerPosition, target.pos, attackPatternOf(action, playerClass), playerView(s));
  const others = s.foes.map((f, i) => i).filter(i => i !== s.target && isAlive(s.foes[i]) && tiles.some(t => same(t, s.foes[i].pos)));
  return [s.target, ...others];
}

/** An attack or special. Check canPlayerHit first; this assumes it reaches the target. */
export function resolvePlayerAttack(s: FightState, action: CombatAction, playerClass: PlayerClass = 'none'): Step {
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
  const struck = foesStruck(s, action, playerClass);
  const heatPush = action.heatTransfer ?? 0;
  let nearest = Infinity;
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
      (s.overclockActive ? 2.0 : heatMult.dealt) * s.perks.damageMult * finishing * marked * coordinated,
      getFlankBonus(grid.playerPosition, foe.pos) * s.perks.flankMult, dist, s.playerMalfunctioning,
      s.overclockActive ? 100 : playerHeat,
      player.bypassStructuralDefense ?? false,
      s.perks.runaway ? 0.45 : 0.30,
    );
    const hp = Math.max(0, foe.unit.currentHp - dmg.bioDamage);
    const structure = Math.max(0, foe.unit.currentStructuralHp - dmg.structuralDamage);
    const heat = clampHeat(foe.heat + heatPush);
    state = setFoe(state, i, {
      unit: { ...foe.unit, currentHp: hp, currentStructuralHp: structure },
      malfunctioning: structure <= 0, defenseBoost: 0, heat,
    });
    const who = struck.length > 1 ? `${foe.unit.name}: ` : '';
    if (foe.unit.currentStructuralHp > 0 && structure <= 0) events.push(say(`${foe.unit.name}: MALFUNCTION`, 'malfunction'));
    if (heatPush !== 0) events.push(say(`${foe.unit.name} heat: ${heatPush > 0 ? '+' : ''}${heatPush} (${heat})`));
    events.push(say(`${who}${dmg.isCrit ? 'CRITICAL! ' : ''}Dealt ${dmg.bioDamage} bio / ${dmg.structuralDamage} structural${dmg.isFlank ? ' [FLANK]' : ''}`, dmg.isCrit ? 'critical' : 'damage'));
    if (hp <= 0) { events.push(say(`${foe.unit.name} is down`, 'critical')); events.push({ kind: 'foeDown', foe: i }); }
  }

  const adjacentHeat = nearest === 1 ? 2 : 0;
  const healed = action.healing && action.healing > 0 ? Math.min(player.maxHp, player.currentHp + action.healing) : player.currentHp;
  state = {
    ...state,
    player: { ...player, currentHp: healed },
    playerDefenseBoost: action.defenseBoost && action.defenseBoost > 0 ? action.defenseBoost : 0,
    overclockActive: false,
    kizunaJustFired: kizunaFiredNow || s.kizunaJustFired,
    firstStrikeUsed: true,
    playerHeat: clampHeat(playerHeat + (action.heatGenerated ?? 15) + adjacentHeat),
  };
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
export function chooseFoeAction(s: FightState, i: number): Step & { action: CombatAction } {
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
  const roster = BOSS_ATTACKS[unit.name] ?? [];
  const dist = chebyshev(foe.pos, grid.playerPosition);
  const filtered = roster.filter(a => {
    if (a.isHeavy && s.playerHeat < HEAVY_MIN_PLAYER_HEAT) return false;
    // Shields only come out when the enemy is hurt, and not every time
    if (a.type === 'defend' && (unit.currentHp > unit.maxHp * 0.5 || random() > 0.35)) return false;
    const pat = a.attackPattern;
    if (!pat) return true;
    if ((pat === 'charge' || pat === 'lunge') && dist < 2) return false;
    if ((pat === 'sweep_arc' || pat === 'melee') && dist > 2) return false;
    return true;
  });
  let pool = filtered.length ? filtered : roster.filter(a => a.type === 'attack');
  // Point blank with nothing that reaches: lash out instead of backing away
  if (dist <= 1 && !pool.some(a => a.type === 'defend' || a.isHeavy || canHitTarget(foe.pos, grid.playerPosition, a.attackPattern ?? 'melee_long', grid))) {
    pool = [CLOSE_QUARTERS];
  }
  return { action: pool[Math.floor(random() * pool.length)], state: s, events: [] };
}

export function canFoeHit(s: FightState, i: number, pattern: AttackPatternType | undefined, victim = victimOf(s, i)): boolean {
  const g = foeView(s, i, victim);
  return canHitTarget(s.foes[i].pos, g.playerPosition, pattern ?? 'melee_long', g);
}

/** Foe i walks up to BOSS_MOVE tiles, stopping once it can strike. */
export function moveFoeToward(s: FightState, i: number, pattern: AttackPatternType | undefined): Step & { moved: boolean } {
  const foe = s.foes[i];
  if (foe.heat >= 100) return { state: s, events: [say(`${foe.unit.name}: OVERHEATED -- movement locked`)], moved: false };
  let pos = foe.pos, moved = false;
  const view = foeView(s, i);
  for (let k = 0; k < BOSS_MOVE; k++) {
    const step = stepTowardAttackPosition({ ...view, bossPosition: pos }, pattern ?? 'melee_long');
    if (!step) break;
    pos = step; moved = true;
  }
  return { state: setFoe(s, i, { pos }), events: [], moved };
}

/** A heavy attack: move into position and wind up; it fires next turn. */
export function telegraphHeavy(s: FightState, i: number, action: CombatAction): Step {
  const moved = moveFoeToward(s, i, action.attackPattern);
  const victim = victimOf(moved.state, i);
  const at = victim >= 0 ? ` at ${s.allies[victim].unit.name}` : '';
  return {
    state: setFoe(moved.state, i, { chargingHeavy: true, pendingAction: action, pendingVictim: victim }),
    events: [...moved.events, say(`${s.foes[i].unit.name} is charging ${action.name.toUpperCase()}${at}!`, 'critical')],
  };
}

/** Fire foe i's wound-up heavy. Returns whether it connects (stepping out dodges it). */
export function releaseHeavy(s: FightState, i: number): Step & { action: CombatAction | null; connects: boolean; victim: number } {
  const action = s.foes[i].pendingAction;
  const victim = s.foes[i].pendingVictim ?? -1;
  const state = setFoe(s, i, { chargingHeavy: false, pendingAction: null, pendingVictim: null });
  if (!action) return { state, events: [], action: null, connects: false, victim };
  if (victim >= 0) {
    const ally = s.allies[victim];
    const inReach = !!ally && allyAlive(ally) && canFoeHit(state, i, action.attackPattern, victim);
    return { state, action, connects: inReach, victim, events: inReach ? [] : [say(`${s.foes[i].unit.name}'s ${action.name} misses${ally ? ` ${ally.unit.name}` : ''}`)] };
  }
  const inReach = canFoeHit(state, i, action.attackPattern, -1);
  if (inReach && s.sidestepReady) {
    return { state: { ...state, sidestepReady: false }, action, connects: false, victim, events: [say(`SIDESTEP -- ${s.foes[i].unit.name}'s ${action.name} slides past you`)] };
  }
  return { state, action, connects: inReach, victim, events: inReach ? [] : [say(`${s.foes[i].unit.name}'s ${action.name} misses -- you evaded`)] };
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
  const taken = (1 + (getHeatMultipliers(s.playerHeat).received - 1) * s.perks.hotTakenMult) * s.perks.damageTakenMult;
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

  const state = setFoe({
    ...s,
    player: { ...player, currentHp: hp, currentStructuralHp: structure },
    playerMalfunctioning: player.maxStructuralHp > 0 && structure <= 0,
    // A guard soaks one hit, so a crowd can't all hit a braced player at full guard
    playerDefenseBoost: 0, allyGuard: 0,
    playerHeat,
    holdfastReady: held.holdfastReady,
  }, i, { heat: clampHeat(foe.heat + (action.heatGenerated ?? 15)) });
  return { state, events };
}

/** Foe i's attack landing on an ally. Allies have no structure bar: half the structural part spills onto the body. */
function hitAlly(s: FightState, i: number, k: number, action: CombatAction, level: number): Step {
  const foe = s.foes[i], ally = s.allies[k];
  const dmg = calculateDamage(foe.unit, ally.unit, scaleBossAction(action, level), ally.defenseBoost, 1, 0, chebyshev(ally.pos, foe.pos), foe.malfunctioning);
  const lost = dmg.bioDamage + Math.ceil(dmg.structuralDamage * NO_IMPLANT_SPILL);
  const hp = Math.max(0, ally.unit.currentHp - lost);
  const events: FightEvent[] = [{ kind: 'hit' }, say(`${foe.unit.name} -- ${action.name}: ${lost} damage to ${ally.unit.name}`, 'damage')];
  if (hp <= 0) { events.push(say(`${ally.unit.name} is knocked out`, 'critical')); events.push({ kind: 'allyDown', ally: k }); }
  const allies = s.allies.map((a, n) => (n === k ? { ...a, unit: { ...a.unit, currentHp: hp }, defenseBoost: 0, taunting: hp > 0 && a.taunting } : a));
  return { state: setFoe({ ...s, allies }, i, { heat: clampHeat(foe.heat + (action.heatGenerated ?? 15)) }), events };
}

/**
 * The first half of foe i's turn: fire a wound-up heavy, shield, wind up a new
 * heavy, attack if already in reach, or walk. When it walks into reach, the
 * attack comes back as `strikeAfterMove` for the store to land after a beat.
 */
export function foeTurn(s: FightState, i: number, level: number): Step & { strikeAfterMove: CombatAction | null } {
  if (!isAlive(s.foes[i])) return { state: s, events: [], strikeAfterMove: null };
  if (s.foes[i].pendingAction) {
    const rel = releaseHeavy(s, i);
    if (rel.connects && rel.action) {
      const hit = resolveFoeAction(rel.state, i, rel.action, level, rel.victim);
      return { state: hit.state, events: [...rel.events, ...hit.events], strikeAfterMove: null };
    }
    return { state: rel.state, events: rel.events, strikeAfterMove: null };
  }
  const choice = chooseFoeAction(s, i);
  const action = choice.action;
  if (action.type === 'defend' || action.isHeavy) {
    const next = action.type === 'defend' ? resolveFoeAction(choice.state, i, action, level) : telegraphHeavy(choice.state, i, action);
    return { state: next.state, events: [...choice.events, ...next.events], strikeAfterMove: null };
  }
  if (canFoeHit(choice.state, i, action.attackPattern)) {
    const hit = resolveFoeAction(choice.state, i, action, level);
    return { state: hit.state, events: [...choice.events, ...hit.events], strikeAfterMove: null };
  }
  const walk = moveFoeToward(choice.state, i, action.attackPattern);
  return { state: walk.state, events: [...choice.events, ...walk.events], strikeAfterMove: walk.moved ? action : null };
}

/** The second half: land the attack if the walk brought foe i into reach. */
export function foeStrikeAfterMove(s: FightState, i: number, action: CombatAction, level: number): Step {
  if (!isAlive(s.foes[i]) || !canFoeHit(s, i, action.attackPattern)) return { state: s, events: [] };
  return resolveFoeAction(s, i, action, level);
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
    const dmg = calculateDamage(a.unit, foe.unit, move, foe.defenseBoost, 1, getFlankBonus(a.pos, foe.pos), dist, false, 0);
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

/** Damage to the player from the tile they end their turn on. */
export function applyPlayerHazard(s: FightState): Step {
  const pos = s.grid.playerPosition;
  const dmg = Math.round(hazardDamageAt(pos, s.grid) * s.perks.hazardMult);
  if (dmg <= 0) return { state: s, events: [] };
  const name = tileAt(pos, s.grid)?.name ?? 'Hazard';
  const events: FightEvent[] = [say(`${name}: -${dmg} HP`, 'damage')];
  const held = holdOn(s, Math.max(0, s.player.currentHp - dmg), events);
  if (held.hp <= 0) events.push({ kind: 'playerDown' });
  return { state: { ...s, player: { ...s.player, currentHp: held.hp }, holdfastReady: held.holdfastReady }, events };
}

/** Damage to foe i from the tile it ends its turn on. */
export function applyFoeHazard(s: FightState, i: number): Step {
  const foe = s.foes[i];
  if (!foe || !isAlive(foe)) return { state: s, events: [] };
  const dmg = hazardDamageAt(foe.pos, s.grid);
  if (dmg <= 0) return { state: s, events: [] };
  const name = tileAt(foe.pos, s.grid)?.name ?? 'Hazard';
  const hp = Math.max(0, foe.unit.currentHp - dmg);
  const events: FightEvent[] = [say(`${foe.unit.name} burns on ${name}: -${dmg}`, 'damage')];
  let state = setFoe(s, i, { unit: { ...foe.unit, currentHp: hp } });
  if (hp <= 0) { events.push({ kind: 'foeDown', foe: i }); state = afterFoeChanges(state, events); }
  return { state, events };
}

export const isOver = (step: Step) => step.events.some(e => e.kind === 'playerDown' || e.kind === 'allFoesDown');
