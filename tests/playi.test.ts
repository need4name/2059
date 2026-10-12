import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openNodes, dealOffer, perksFor, PLAYI_NODES, FALLBACK_ID, NO_PERKS } from '../client/src/lib/engine/playi';
import * as Fight from '../client/src/lib/engine/fight';
import type { FightState } from '../client/src/lib/engine/fight';
import { seedRandom } from '../client/src/lib/engine/rng';
import { createPlayer, createBoss, PLAYER_ACTIONS } from '../client/src/lib/combat/actions';
import type { CombatGrid, CombatAction } from '../client/src/lib/combat/types';

test('the tree data is sound: unique ids, requirements exist, one capstone per branch', () => {
  const ids = new Set(PLAYI_NODES.map(n => n.id));
  assert.equal(ids.size, PLAYI_NODES.length);
  for (const n of PLAYI_NODES) for (const r of n.requires) assert.ok(ids.has(r), `${n.id} requires missing ${r}`);
  const branches = new Set(PLAYI_NODES.map(n => n.branch));
  for (const b of Array.from(branches)) assert.equal(PLAYI_NODES.filter(n => n.branch === b && n.capstone).length, 1, b);
});

test('a new signal can only learn tier 1 nodes, and Network waits for an ally', () => {
  const open = openNodes([], false);
  assert.ok(open.every(n => n.tier === 1));
  assert.ok(!open.some(n => n.branch === 'network'));
  assert.ok(openNodes([], true).some(n => n.id === 'network_1'));
});

test('a fork opens the next tier with either node', () => {
  assert.ok(!openNodes(['move_1'], false).some(n => n.id === 'move_3'));
  assert.ok(openNodes(['move_1', 'move_2a'], false).some(n => n.id === 'move_3'));
  assert.ok(openNodes(['move_1', 'move_2b'], false).some(n => n.id === 'move_3'));
});

test('the offer is two different open nodes, topped up with fragments when the tree runs dry', () => {
  for (let k = 0; k < 30; k++) {
    seedRandom(k);
    const offer = dealOffer([], false);
    assert.equal(offer.length, 2);
    assert.notEqual(offer[0], offer[1]);
  }
  const all = PLAYI_NODES.map(n => n.id);
  assert.deepEqual(dealOffer(all, true), [FALLBACK_ID, FALLBACK_ID]);
  assert.equal(dealOffer(all.filter(id => id !== 'move_5'), true).filter(id => id === FALLBACK_ID).length, 1);
});

test('owned nodes turn into perks; fragments stack', () => {
  const p = perksFor(['move_1', 'move_3', 'combat_1', 'signal_1', 'signal_4', FALLBACK_ID, FALLBACK_ID]);
  assert.equal(p.moveBonus, 2);
  assert.ok(Math.abs(p.damageMult - 1.1) < 1e-9);
  assert.equal(p.maxHpBonus, 70);
  assert.deepEqual(perksFor([]), NO_PERKS);
});

// ── Perks in a fight ─────────────────────────────────────────────────────────

function arena(): CombatGrid {
  const tiles = Array.from({ length: 9 }, () => Array.from({ length: 7 }, () => ({ type: 'empty' as const })) as any[]);
  return { rows: 9, cols: 7, tiles, playerPosition: { row: 5, col: 3 }, bossPosition: { row: 4, col: 3 } } as CombatGrid;
}
function fight(owned: string[], over: Partial<FightState> = {}): FightState {
  const perks = perksFor(owned);
  const grid = arena();
  return {
    player: createPlayer(), foes: [Fight.newFoe(createBoss(3), grid.bossPosition, 40)], target: 0, grid,
    playerHeat: 30, playerDefenseBoost: 0, playerMalfunctioning: false, overclockActive: false, kizunaJustFired: false, doubleActionReady: false,
    ...Fight.BASE_FIGHT_FLAGS, perks, firstStrikeUsed: false, sidestepReady: perks.sidestep, holdfastReady: perks.holdfast, ...over,
  };
}
const blow = (damage: number): CombatAction => ({ type: 'attack', name: 'Blow', description: '', damage, physicalRatio: 1, accuracy: 'precise', attackPattern: 'melee' });

test('Heat sink sheds more heat; Overclocked core acts twice when warmer', () => {
  assert.equal(Fight.startPlayerTurn(fight(['heat_1'], { playerHeat: 30 })).playerHeat, 30 - Fight.PASSIVE_COOLING - 3);
  assert.equal(Fight.startPlayerTurn(fight([], { playerHeat: 30 })).doubleActionReady, false);
  assert.equal(Fight.startPlayerTurn(fight(['heat_3'], { playerHeat: 30 })).doubleActionReady, true);
});

test('Holdfast survives one killing blow per host', () => {
  seedRandom(1);
  const s = fight(['signal_3'], { player: { ...createPlayer(), currentHp: 3 } });
  const first = Fight.resolveFoeAction(s, 0, blow(80), 5);
  assert.equal(first.state.player.currentHp, 1);
  assert.equal(first.state.holdfastReady, false);
  assert.ok(!first.events.some(e => e.kind === 'playerDown'));
  const second = Fight.resolveFoeAction(first.state, 0, blow(80), 5);
  assert.ok(second.events.some(e => e.kind === 'playerDown'));
});

test('Sidestep makes the first heavy miss even when you stay in it', () => {
  const heavy = { ...blow(40), isHeavy: true };
  const wound = Fight.telegraphHeavy(fight(['move_4']), 0, heavy).state;
  const r = Fight.releaseHeavy(wound, 0);
  assert.equal(r.connects, false);
  assert.equal(r.state.sidestepReady, false);
  const again = Fight.releaseHeavy(Fight.telegraphHeavy(r.state, 0, heavy).state, 0);
  assert.equal(again.connects, true);
});

test('Chain: taking down one of several enemies earns another action', () => {
  const base = fight(['combat_5']);
  const s = { ...base, foes: [{ ...base.foes[0], unit: { ...base.foes[0].unit, currentHp: 1 } }, Fight.newFoe(createBoss(3), { row: 0, col: 0 }, 40)] };
  seedRandom(2);
  const step = Fight.resolvePlayerAttack(s, { ...PLAYER_ACTIONS[0], accuracy: 'precise' });
  assert.ok(step.events.some(e => e.kind === 'extraAction'));
});

test('Targeting adds 10% damage', () => {
  const strike = { ...PLAYER_ACTIONS[0], damage: 100, accuracy: 'precise' as const };
  // A sturdy target so neither hit takes it down
  const sturdy = (owned: string[]) => { const s = fight(owned, { playerHeat: 0 }); return { ...s, foes: [{ ...s.foes[0], unit: { ...s.foes[0].unit, maxHp: 5000, currentHp: 5000 } }] }; };
  seedRandom(3); const plain = Fight.resolvePlayerAttack(sturdy([]), strike).state.foes[0].unit.currentHp;
  seedRandom(3); const boosted = Fight.resolvePlayerAttack(sturdy(['combat_1']), strike).state.foes[0].unit.currentHp;
  assert.ok(boosted < plain);
});
