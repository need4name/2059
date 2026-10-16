import { test } from 'node:test';
import assert from 'node:assert/strict';
import { random, seedRandom, mixSeed } from '../client/src/lib/engine/rng';
import { mitigate, ACCURACY_RANGE, estimateDamage, createPlayer, createBoss, PLAYER_ACTIONS, PLAYER_STAT_WEIGHT } from '../client/src/lib/combat/actions';
import { powerOf, structureOf, healthCostOf, actionForItem, makerOf, CONDITION_MULT, MIN_PLAYER_HP } from '../client/src/lib/combat/augments';
import { ITEMS_2059 } from '../client/src/lib/combat/items2059';
import { generateLoot, generatePatchworkKingLoot } from '../client/src/lib/combat/loot';
import { generateBattlefield, stepDistances, arenaSize } from '../client/src/lib/combat/grid';
import { augmentKind, AUGMENTATION_SLOTS } from '../client/src/lib/combat/types';
import type { Item } from '../client/src/lib/combat/types';

const implants = ITEMS_2059.filter(i => i.type === 'augmentation');
const roll = (n: number) => Array.from({ length: n }, () => random());

test('seeded random repeats exactly for the same seed', () => {
  seedRandom(42); const a = roll(20);
  seedRandom(42); const b = roll(20);
  seedRandom(43); const c = roll(20);
  assert.deepEqual(a, b);
  assert.notDeepEqual(a, c);
  assert.ok(a.every(x => x >= 0 && x < 1));
  assert.notEqual(mixSeed(1, 2), mixSeed(2, 1));
});

test('defence mitigation: 40 defence halves damage, 0 changes nothing', () => {
  assert.equal(mitigate(100, 0), 100);
  assert.equal(mitigate(100, 40), 50);
  assert.ok(mitigate(100, 400) > 0);
});

test('accuracy ranges stay ordered and malfunction is the harshest', () => {
  assert.deepEqual(ACCURACY_RANGE.precise, [1, 1]);
  for (const [lo, hi] of Object.values(ACCURACY_RANGE)) assert.ok(lo > 0 && lo <= hi && hi <= 1);
  assert.ok(ACCURACY_RANGE.malfunction[1] < ACCURACY_RANGE.variable[1]);
  assert.ok(ACCURACY_RANGE.unreliable[1] >= ACCURACY_RANGE.variable[1], 'an unreliable hit can match a good roll');
});

test('player attack stat counts at its weight in damage previews', () => {
  const boss = { ...createBoss(1), physicalDefense: 0, structuralDefense: 0 };
  const strike = { ...PLAYER_ACTIONS[0], accuracy: 'precise' as const };
  const weak = estimateDamage({ ...createPlayer(), physicalAttack: 0, structuralAttack: 0 }, boss, strike);
  const strong = estimateDamage({ ...createPlayer(), physicalAttack: 20, structuralAttack: 0 }, boss, strike);
  assert.equal(strong.max - weak.max, Math.floor(20 * PLAYER_STAT_WEIGHT));
});

test('every implant has a slot, a known maker and a valid rarity', () => {
  const ids = new Set<string>();
  for (const i of implants) {
    assert.ok(i.slot && AUGMENTATION_SLOTS.includes(i.slot), `${i.id} slot`);
    assert.ok(!ids.has(i.id), `${i.id} duplicated`); ids.add(i.id);
    assert.ok(i.name.match(/^\[[A-Z]+\]/), `${i.id} name needs a [MAKER] prefix`);
    assert.ok(makerOf(i));
  }
});

test('rarity power bands do not overlap', () => {
  const order = ['common', 'uncommon', 'rare', 'epic', 'legendary'] as const;
  const band = (r: string) => implants.filter(i => i.rarity === r).map(i => powerOf(i));
  for (let k = 1; k < order.length; k++) {
    assert.ok(Math.max(...band(order[k - 1])) < Math.min(...band(order.at(k)!)), `${order[k - 1]} vs ${order[k]}`);
  }
});

test('active implants give a move, passive ones never do', () => {
  for (const i of implants) {
    const move = actionForItem(i);
    if (augmentKind(i.slot) === 'active') assert.ok(move, `${i.id} should give a move`);
    else assert.equal(move, null, `${i.id} is passive`);
  }
});

test('Helix active implants are defensive only', () => {
  for (const i of implants.filter(x => makerOf(x) === 'HELIX' && augmentKind(x.slot) === 'active')) {
    assert.equal(actionForItem(i)!.type, 'brace', i.id);
  }
});

test('structure and health cost follow the rules', () => {
  const base: Item = { id: 't', name: '[CBN] Test', rarity: 'rare', type: 'augmentation', slot: 'left_arm', icon: '' };
  assert.ok(structureOf({ ...base, name: '[HELIX] Test' }) > structureOf({ ...base, name: '[KIZUNA] Test' }));
  assert.ok(structureOf(base) > structureOf({ ...base, slot: 'eyes' }));
  assert.ok(healthCostOf(base) > 0, 'CBN grafts cost health');
  assert.equal(healthCostOf({ ...base, name: '[CROWN] Test' }), 0);
  assert.ok(healthCostOf({ ...base, name: '[CROWN] Test', condition: 'corroded' }) > 0);
  assert.ok(Object.values(CONDITION_MULT).every(m => m > 0), 'condition never makes stats negative');
});

test('max health never drops below the floor', () => {
  const p = createPlayer({ physicalAttack: 0, structuralAttack: 0, physicalDefense: 0, structuralDefense: 0, hp: 0, evasion: 0, hpCost: 9999, bypassStructuralDefense: false, hasKizuna: false, treeAttack: 0, treeDefense: 0, treeHp: 0 });
  assert.equal(p.maxHp, MIN_PLAYER_HP);
});

test('no implants means no structure bar', () => {
  assert.equal(createPlayer().maxStructuralHp, 0);
});

test('first life: threat 1 gives an active implant, threat 2 a passive one', () => {
  seedRandom(7);
  for (let k = 0; k < 20; k++) {
    const a = generateLoot(1, true).items.filter(i => i.type === 'augmentation');
    assert.equal(a.length, 1); assert.equal(augmentKind(a[0].slot), 'active');
    const b = generateLoot(2, true).items.filter(i => i.type === 'augmentation');
    assert.equal(b.length, 1); assert.equal(augmentKind(b[0].slot), 'passive');
  }
});

test('the Patchwork King always drops an epic and a rare', () => {
  seedRandom(9);
  for (let k = 0; k < 50; k++) {
    const r = generatePatchworkKingLoot().items.map(i => i.rarity);
    assert.ok(r.includes('epic') && r.includes('rare'));
  }
});

test('arenas grow with movement and crowd size, up to 9x13', () => {
  assert.deepEqual(arenaSize({ move: 1, units: 2 }), { cols: 7, rows: 9 });
  assert.deepEqual(arenaSize({ move: 2, units: 2 }), { cols: 8, rows: 11 });
  assert.deepEqual(arenaSize({ move: 1, units: 5 }), { cols: 8, rows: 12 });
  assert.deepEqual(arenaSize({ move: 4, units: 6 }), { cols: 9, rows: 13 });
});

test('every arena has a walkable path from player to enemy', () => {
  for (let lvl = 1; lvl <= 24; lvl++) for (let s = 0; s < 10; s++) {
    seedRandom(mixSeed(lvl, s));
    const g = generateBattlefield(lvl, { move: 1 + (s % 3), units: 2 + (s % 4) });
    const dist = stepDistances(g.playerPosition, g);
    const near = [[-1, 0], [1, 0], [0, -1], [0, 1], [-1, -1], [-1, 1], [1, -1], [1, 1]].some(([dr, dc]) => dist.has(`${g.bossPosition.row + dr},${g.bossPosition.col + dc}`));
    assert.ok(near, `threat ${lvl} seed ${s}: no path`);
  }
});
