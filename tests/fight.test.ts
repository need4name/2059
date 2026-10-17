import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as Fight from '../client/src/lib/engine/fight';
import type { FightState } from '../client/src/lib/engine/fight';
import { seedRandom } from '../client/src/lib/engine/rng';
import { createPlayer, createBoss, PLAYER_ACTIONS } from '../client/src/lib/combat/actions';
import type { CombatGrid, CombatAction } from '../client/src/lib/combat/types';
import { getReachableTiles } from '../client/src/lib/combat/grid';
import { canHitTarget, getHitTiles } from '../client/src/lib/combat/patterns';

function arena(player: [number, number], boss: [number, number], hazard?: [number, number, number]): CombatGrid {
  const rows = 9, cols = 7;
  const tiles = Array.from({ length: rows }, () => Array.from({ length: cols }, () => ({ type: 'empty' as const })) as any[]);
  if (hazard) tiles[hazard[0]][hazard[1]] = { type: 'hazard', name: 'Fuel fire', hazardDamage: hazard[2] };
  return { rows, cols, tiles, playerPosition: { row: player[0], col: player[1] }, bossPosition: { row: boss[0], col: boss[1] } } as CombatGrid;
}

function fight(over: Partial<FightState> = {}): FightState {
  const grid = over.grid ?? arena([5, 3], [4, 3]);
  return {
    player: createPlayer(), foes: [Fight.newFoe(createBoss(3), grid.bossPosition, 40)], target: 0, grid,
    playerHeat: 30, playerDefenseBoost: 0, playerMalfunctioning: false,
    overclockActive: false, kizunaJustFired: false, doubleActionReady: false,
    ...Fight.BASE_FIGHT_FLAGS,
    ...over,
  };
}
const withImplants = () => ({ ...createPlayer(), maxStructuralHp: 50, currentStructuralHp: 10 });
const hitFor = (damage: number, phys = 0.5): CombatAction => ({ type: 'attack', name: 'Test Blow', description: '', damage, physicalRatio: phys, accuracy: 'precise', attackPattern: 'melee' });

test('both sides cool down at the start of a round; cool players act twice', () => {
  const base = fight({ playerHeat: 20 });
  const s = Fight.startPlayerTurn({ ...base, foes: [{ ...base.foes[0], heat: 3 }] });
  assert.equal(s.playerHeat, 20 - Fight.PASSIVE_COOLING);
  assert.equal(s.foes[0].heat, 0);
  assert.equal(s.doubleActionReady, true);
  assert.equal(Fight.startPlayerTurn(fight({ playerHeat: 60 })).doubleActionReady, false);
});

test('brace cools you, raises guard and repairs 40% of structure', () => {
  const { state } = Fight.resolveBrace(fight({ player: withImplants(), playerHeat: 50 }), PLAYER_ACTIONS[1]);
  assert.equal(state.player.currentStructuralHp, 30);
  assert.equal(state.playerHeat, 25);
  assert.equal(state.playerDefenseBoost, 8);
});

test('a player attack damages the enemy and heats you up', () => {
  seedRandom(1);
  const before = fight();
  const step = Fight.resolvePlayerAttack(before, { ...PLAYER_ACTIONS[0], accuracy: 'precise' });
  assert.ok(step.state.foes[0].unit.currentHp < before.foes[0].unit.currentHp);
  assert.ok(step.state.playerHeat > before.playerHeat);
  assert.ok(step.events.some(e => e.kind === 'hit'));
});

test('out-of-range attacks are caught before they resolve', () => {
  const far = fight({ grid: arena([8, 0], [0, 6]) });
  assert.equal(Fight.canPlayerHit(far, PLAYER_ACTIONS[0], 'none'), false);
  assert.equal(Fight.canPlayerHit(fight(), PLAYER_ACTIONS[0], 'none'), true);
});

test('with no implants, structural hits spill onto health at half strength', () => {
  seedRandom(2);
  const bare = fight({ player: createPlayer() });
  const step = Fight.resolveFoeAction(bare, 0, hitFor(30, 0), 1);
  assert.ok(step.state.player.currentHp < bare.player.currentHp, 'flesh takes the spill');
  assert.equal(step.state.playerMalfunctioning, false, 'no implants, no malfunction');
});

test('implants absorb structural hits and malfunction at zero', () => {
  seedRandom(3);
  const s = fight({ player: withImplants() });
  const step = Fight.resolveFoeAction(s, 0, hitFor(60, 0), 1);
  assert.equal(step.state.player.currentStructuralHp, 0);
  assert.equal(step.state.playerMalfunctioning, true);
});

test('stepping out of a telegraphed heavy dodges it', () => {
  const heavy: CombatAction = { ...hitFor(40), isHeavy: true, attackPattern: 'melee' };
  const wound = Fight.telegraphHeavy(fight(), 0, heavy).state;
  assert.equal(wound.foes[0].chargingHeavy, true);
  const stayed = Fight.releaseHeavy(wound, 0);
  assert.equal(stayed.connects, true);
  const moved = Fight.releaseHeavy({ ...wound, grid: { ...wound.grid, playerPosition: { row: 8, col: 0 } } }, 0);
  assert.equal(moved.connects, false);
  assert.equal(moved.state.foes[0].pendingAction, null);
});

test('enemies hold heavy attacks against a cool player', () => {
  for (let k = 0; k < 40; k++) {
    seedRandom(k);
    const { action } = Fight.chooseFoeAction(fight({ playerHeat: 0 }), 0);
    assert.ok(!action.isHeavy);
  }
});

test('ending a turn on a hazard burns you, and can finish you', () => {
  const s = fight({ grid: arena([5, 3], [0, 3], [5, 3, 8]) });
  assert.equal(Fight.applyPlayerHazard(s).state.player.currentHp, s.player.currentHp - 8);
  const low = { ...s, player: { ...s.player, currentHp: 5 } };
  assert.ok(Fight.isOver(Fight.applyPlayerHazard(low)));
});

test('Overclock does not use up the turn; other stims do', () => {
  const s = fight();
  const oc = Fight.resolveConsumable(s, { id: 'o', name: 'Overclock', rarity: 'rare', type: 'consumable', consumableEffect: 'overclock', icon: '' });
  assert.equal(oc.endsTurn, false); assert.equal(oc.state.overclockActive, true);
  const flush = Fight.resolveConsumable({ ...s, playerHeat: 80 }, { id: 'h', name: 'Heat Flush', rarity: 'common', type: 'consumable', consumableEffect: 'heat_flush', icon: '' });
  assert.equal(flush.endsTurn, true); assert.equal(flush.state.playerHeat, 0);
});

test('a hot player takes more damage than a cool one', () => {
  const cool = fight({ playerHeat: 10 }), hot = fight({ playerHeat: 95 });
  seedRandom(5); const a = Fight.resolveFoeAction(cool, 0, hitFor(30, 1), 5);
  seedRandom(5); const b = Fight.resolveFoeAction(hot, 0, hitFor(30, 1), 5);
  assert.ok(cool.player.currentHp - a.state.player.currentHp < hot.player.currentHp - b.state.player.currentHp);
});

// ── Several enemies ──────────────────────────────────────────────────────────

function crowd(): FightState {
  const grid = arena([5, 3], [4, 3]);
  return fight({ grid, foes: [Fight.newFoe(createBoss(3), { row: 4, col: 3 }, 40), Fight.newFoe(createBoss(3), { row: 4, col: 4 }, 40), Fight.newFoe(createBoss(3), { row: 0, col: 0 }, 40)] });
}

test('an area attack hits every enemy in the struck tiles, not just the target', () => {
  seedRandom(11);
  const s = crowd();
  const strike = { ...PLAYER_ACTIONS[0], accuracy: 'precise' as const, attackPattern: 'sweep_arc' as const }; // the arc in front
  assert.deepEqual(Fight.foesStruck(s, strike, 'none'), [0, 1]);
  const after = Fight.resolvePlayerAttack(s, strike).state;
  assert.ok(after.foes[0].unit.currentHp < s.foes[0].unit.currentHp);
  assert.ok(after.foes[1].unit.currentHp < s.foes[1].unit.currentHp);
  assert.equal(after.foes[2].unit.currentHp, s.foes[2].unit.currentHp, 'the far enemy is untouched');
});

test('when the target falls, aim moves to a living enemy; the last one ends the fight', () => {
  const s = crowd();
  const dying = { ...s, foes: s.foes.map((f, i) => (i === 0 ? { ...f, unit: { ...f.unit, currentHp: 1 } } : f)) };
  seedRandom(12);
  const step = Fight.resolvePlayerAttack(dying, { ...PLAYER_ACTIONS[0], accuracy: 'precise', attackPattern: 'melee_long' });
  assert.ok(step.events.some(e => e.kind === 'foeDown'));
  assert.notEqual(step.state.target, 0);
  assert.ok(!step.events.some(e => e.kind === 'allFoesDown'));
  const last = { ...s, foes: [{ ...s.foes[0], unit: { ...s.foes[0].unit, currentHp: 1 } }] };
  seedRandom(13);
  assert.ok(Fight.resolvePlayerAttack(last, { ...PLAYER_ACTIONS[0], accuracy: 'precise' }).events.some(e => e.kind === 'allFoesDown'));
});

test('you can only aim at living enemies', () => {
  const s = crowd();
  const dead = { ...s, foes: s.foes.map((f, i) => (i === 1 ? { ...f, unit: { ...f.unit, currentHp: 0 } } : f)) };
  assert.equal(Fight.setTarget(dead, 1).target, 0);
  assert.equal(Fight.setTarget(dead, 2).target, 2);
});

test('enemies block movement and each other', () => {
  const s = crowd();
  const reach = getReachableTiles(s.grid.playerPosition, Fight.playerView(s), 2);
  assert.ok(!reach.has('4,3') && !reach.has('4,4'), 'cannot walk onto an enemy');
  const walked = Fight.moveFoeToward(s, 2, 'melee').state.foes[2].pos;
  assert.ok(!s.foes.slice(0, 2).some(f => f.pos.row === walked.row && f.pos.col === walked.col));
});

test('shapes: a strike hits one tile, a lunge only 2 away, a shot needs a clear line', () => {
  const g = arena([5, 3], [4, 3]);
  assert.deepEqual(getHitTiles({ row: 5, col: 3 }, { row: 4, col: 3 }, 'melee', g), [{ row: 4, col: 3 }]);
  assert.equal(canHitTarget({ row: 5, col: 3 }, { row: 4, col: 3 }, 'lunge', g), false);
  assert.equal(canHitTarget({ row: 5, col: 3 }, { row: 3, col: 5 }, 'lunge', g), true);
  const open = { ...g, bossPosition: { row: 1, col: 3 } };
  assert.equal(canHitTarget({ row: 5, col: 3 }, { row: 1, col: 3 }, 'ranged', open), true);
  const tiles = open.tiles.map(r => r.slice());
  tiles[3][3] = { type: 'obstacle', name: 'Crate' } as any;
  assert.equal(canHitTarget({ row: 5, col: 3 }, { row: 1, col: 3 }, 'ranged', { ...open, tiles }), false, 'cover blocks the shot');
  assert.equal(canHitTarget({ row: 5, col: 3 }, { row: 2, col: 4 }, 'ranged', open), false, 'not on a line');
  assert.equal(getHitTiles({ row: 4, col: 3 }, { row: 6, col: 3 }, 'ring', g).length, 16);
  assert.equal(getHitTiles({ row: 0, col: 3 }, { row: 5, col: 3 }, 'beam', g).length, 8);
});

test('a heavy locks its tiles: a beam hits whoever is in that column, not where you go', () => {
  const beam: CombatAction = { ...hitFor(30), isHeavy: true, attackPattern: 'beam' };
  const s = fight({ grid: arena([6, 3], [1, 3]) });
  const wound = Fight.telegraphHeavy(s, 0, beam).state;
  assert.ok(wound.foes[0].pendingTiles!.every(t => t.col === 3));
  const stepped = { ...wound, grid: { ...wound.grid, playerPosition: { row: 6, col: 4 } } };
  assert.equal(Fight.releaseHeavy(stepped, 0).connects, false, 'one step sideways dodges it');
  assert.equal(Fight.releaseHeavy({ ...wound, grid: { ...wound.grid, playerPosition: { row: 8, col: 3 } } }, 0).connects, true, 'backing off down the column does not');
});

test('knockback pushes you a tile straight back when there is room', () => {
  const kick: CombatAction = { ...hitFor(5), attackPattern: 'knockback' };
  seedRandom(5);
  const r = Fight.resolveFoeAction(fight(), 0, kick, 1);
  assert.deepEqual(r.state.grid.playerPosition, { row: 6, col: 3 });
});

test('knockback into cover: no move, collision damage, stunned', () => {
  const kick: CombatAction = { ...hitFor(20), attackPattern: 'knockback' };
  const g = arena([5, 3], [4, 3]);
  g.tiles[6][3] = { type: 'obstacle', name: 'Crate stack' } as any;
  seedRandom(5);
  const plain = Fight.resolveFoeAction(fight({ grid: arena([5, 3], [4, 3]) }), 0, kick, 1).state;
  seedRandom(5);
  const r = Fight.resolveFoeAction(fight({ grid: g }), 0, kick, 1);
  assert.deepEqual(r.state.grid.playerPosition, { row: 5, col: 3 });
  assert.ok(r.state.player.currentHp <= plain.player.currentHp - Fight.COLLISION.min);
  assert.equal(r.state.playerStunned, true);
});

test('knocked into another body: both take the impact', () => {
  const kick: CombatAction = { ...hitFor(20), attackPattern: 'knockback' };
  const s = fight();
  const behind = Fight.newFoe(createBoss(3), { row: 2, col: 3 }, 40);
  const crowd = { ...s, grid: arena([5, 3], [3, 3]), foes: [{ ...s.foes[0], pos: { row: 3, col: 3 } }, behind] };
  seedRandom(6);
  const r = Fight.resolvePlayerAttack(crowd, { ...kick, accuracy: 'precise' }).state;
  assert.deepEqual(r.foes[0].pos, { row: 3, col: 3 }, 'nowhere to go');
  assert.equal(r.foes[0].stunned, true);
  assert.ok(r.foes[1].unit.currentHp < behind.unit.currentHp, 'the one behind is hurt too');
});

test('a stunned enemy loses its turn and any wound-up heavy', () => {
  const heavy: CombatAction = { ...hitFor(40), isHeavy: true, attackPattern: 'melee' };
  const wound = Fight.telegraphHeavy(fight(), 0, heavy).state;
  const stunned = { ...wound, foes: [{ ...wound.foes[0], stunned: true }] };
  const r = Fight.foeTurn(stunned, 0, 1);
  assert.equal(r.state.player.currentHp, stunned.player.currentHp);
  assert.equal(r.state.foes[0].pendingAction, null);
  assert.equal(r.state.foes[0].stunned, false);
});

test('ending a turn on a fuel fire sets you burning, which ticks for two turns', () => {
  const g = arena([5, 3], [1, 3]);
  g.tiles[5][3] = { type: 'hazard', name: 'Fuel fire', hazardDamage: 8, art: 'fire' } as any;
  const lit = Fight.applyPlayerHazard(fight({ grid: g })).state;
  assert.equal(lit.playerBurning, Fight.BURN.turns);
  const t1 = Fight.playerConditions(lit);
  assert.ok(t1.state.player.currentHp < lit.player.currentHp);
  assert.equal(t1.state.playerBurning, 1);
  assert.equal(Fight.playerConditions(Fight.playerConditions(t1.state).state).state.playerBurning, 0);
});

test('a stunned player loses one turn, then acts normally', () => {
  const r = Fight.playerConditions(fight({ playerStunned: true }));
  assert.equal(r.skipTurn, true);
  assert.equal(r.state.playerStunned, false);
  assert.equal(Fight.playerConditions(r.state).skipTurn, false);
});

test('overload fills from trading blows; a full meter surges every enemy within 2 tiles', () => {
  seedRandom(7);
  const hit = Fight.resolveFoeAction(fight(), 0, hitFor(30), 3).state;
  assert.ok(hit.overload > 0, 'taking a hit fills it');
  const s = fight({ overload: 100, playerHeat: 70 });
  const far = Fight.newFoe(createBoss(3), { row: 0, col: 0 }, 40);
  const crowd = { ...s, foes: [s.foes[0], far] };
  assert.equal(Fight.canSurge(crowd), true);
  assert.deepEqual(Fight.surgeTargets(crowd), [0]);
  const r = Fight.resolveSurge(crowd, 20).state;
  assert.ok(r.foes[0].unit.currentHp < crowd.foes[0].unit.currentHp);
  assert.equal(r.foes[1].unit.currentHp, far.unit.currentHp, 'out of reach');
  assert.equal(r.overload, 0);
  assert.equal(r.playerHeat, 0, 'heat vents');
  assert.equal(Fight.canSurge({ ...crowd, overload: 99 }), false);
});
