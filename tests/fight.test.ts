import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as Fight from '../client/src/lib/engine/fight';
import type { FightState } from '../client/src/lib/engine/fight';
import { seedRandom } from '../client/src/lib/engine/rng';
import { createPlayer, createBoss, PLAYER_ACTIONS } from '../client/src/lib/combat/actions';
import type { CombatGrid, CombatAction } from '../client/src/lib/combat/types';
import { getReachableTiles } from '../client/src/lib/combat/grid';

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
  const strike = { ...PLAYER_ACTIONS[0], accuracy: 'precise' as const }; // all 8 adjacent tiles
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
