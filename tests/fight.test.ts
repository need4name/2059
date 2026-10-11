import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as Fight from '../client/src/lib/engine/fight';
import type { FightState } from '../client/src/lib/engine/fight';
import { seedRandom } from '../client/src/lib/engine/rng';
import { createPlayer, createBoss, PLAYER_ACTIONS } from '../client/src/lib/combat/actions';
import type { CombatGrid, CombatAction } from '../client/src/lib/combat/types';

function arena(player: [number, number], boss: [number, number], hazard?: [number, number, number]): CombatGrid {
  const rows = 9, cols = 7;
  const tiles = Array.from({ length: rows }, () => Array.from({ length: cols }, () => ({ type: 'empty' as const })) as any[]);
  if (hazard) tiles[hazard[0]][hazard[1]] = { type: 'hazard', name: 'Fuel fire', hazardDamage: hazard[2] };
  return { rows, cols, tiles, playerPosition: { row: player[0], col: player[1] }, bossPosition: { row: boss[0], col: boss[1] } } as CombatGrid;
}

function fight(over: Partial<FightState> = {}): FightState {
  return {
    player: createPlayer(), boss: createBoss(3), grid: arena([5, 3], [4, 3]),
    playerHeat: 30, bossHeat: 40, playerDefenseBoost: 0, bossDefenseBoost: 0,
    playerMalfunctioning: false, bossMalfunctioning: false, overclockActive: false, kizunaJustFired: false,
    bossChargingHeavy: false, pendingBossAction: null, patchworkKingTurn: 0, doubleActionReady: false,
    ...over,
  };
}
const withImplants = () => ({ ...createPlayer(), maxStructuralHp: 50, currentStructuralHp: 10 });
const hitFor = (damage: number, phys = 0.5): CombatAction => ({ type: 'attack', name: 'Test Blow', description: '', damage, physicalRatio: phys, accuracy: 'precise', attackPattern: 'melee' });

test('both sides cool down at the start of a round; cool players act twice', () => {
  const s = Fight.startPlayerTurn(fight({ playerHeat: 20, bossHeat: 3 }));
  assert.equal(s.playerHeat, 20 - Fight.PASSIVE_COOLING);
  assert.equal(s.bossHeat, 0);
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
  assert.ok(step.state.boss.currentHp < before.boss.currentHp);
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
  const step = Fight.resolveBossAction(bare, hitFor(30, 0), 1);
  assert.ok(step.state.player.currentHp < bare.player.currentHp, 'flesh takes the spill');
  assert.equal(step.state.playerMalfunctioning, false, 'no implants, no malfunction');
});

test('implants absorb structural hits and malfunction at zero', () => {
  seedRandom(3);
  const s = fight({ player: withImplants() });
  const step = Fight.resolveBossAction(s, hitFor(60, 0), 1);
  assert.equal(step.state.player.currentStructuralHp, 0);
  assert.equal(step.state.playerMalfunctioning, true);
});

test('stepping out of a telegraphed heavy dodges it', () => {
  const heavy: CombatAction = { ...hitFor(40), isHeavy: true, attackPattern: 'melee' };
  const wound = Fight.telegraphHeavy(fight(), heavy).state;
  assert.equal(wound.bossChargingHeavy, true);
  const stayed = Fight.releaseHeavy(wound);
  assert.equal(stayed.connects, true);
  const moved = Fight.releaseHeavy({ ...wound, grid: { ...wound.grid, playerPosition: { row: 8, col: 0 } } });
  assert.equal(moved.connects, false);
  assert.equal(moved.state.pendingBossAction, null);
});

test('enemies hold heavy attacks against a cool player', () => {
  for (let k = 0; k < 40; k++) {
    seedRandom(k);
    const { action } = Fight.chooseBossAction(fight({ playerHeat: 0 }));
    assert.ok(!action.isHeavy);
  }
});

test('ending a turn on a hazard burns you, and can finish you', () => {
  const s = fight({ grid: arena([5, 3], [0, 3], [5, 3, 8]) });
  assert.equal(Fight.applyHazard(s, 'player').state.player.currentHp, s.player.currentHp - 8);
  const low = { ...s, player: { ...s.player, currentHp: 5 } };
  assert.ok(Fight.isOver(Fight.applyHazard(low, 'player')));
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
  seedRandom(5); const a = Fight.resolveBossAction(cool, hitFor(30, 1), 5);
  seedRandom(5); const b = Fight.resolveBossAction(hot, hitFor(30, 1), 5);
  assert.ok(cool.player.currentHp - a.state.player.currentHp < hot.player.currentHp - b.state.player.currentHp);
});
