import { test } from 'node:test';
import assert from 'node:assert/strict';
import { random, seedRandom, mixSeed } from '../client/src/lib/engine/rng';
import { mitigate, ACCURACY_RANGE, estimateDamage, createPlayer, createBoss, createPatchworkKing, PLAYER_ACTIONS, PLAYER_STAT_WEIGHT, STAT_MIX, CLASS_DEFINITIONS, FIRMWARE_LIFT } from '../client/src/lib/combat/actions';
import { powerOf, structureOf, healthCostOf, actionForItem, makerOf, CONDITION_MULT, MIN_PLAYER_HP } from '../client/src/lib/combat/augments';
import { ITEMS_2059 } from '../client/src/lib/combat/items2059';
import { generateLoot, generatePatchworkKingLoot, rollCarried } from '../client/src/lib/combat/loot';
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
  const strike = { ...PLAYER_ACTIONS[0], accuracy: 'precise' as const, physicalRatio: 1 };
  const weak = estimateDamage({ ...createPlayer(), physicalAttack: 0, structuralAttack: 0 }, boss, strike);
  const strong = estimateDamage({ ...createPlayer(), physicalAttack: 20, structuralAttack: 0 }, boss, strike);
  assert.equal(strong.max - weak.max, Math.floor(20 * PLAYER_STAT_WEIGHT * STAT_MIX));
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

test('every class has a structure bar of its own before implants', () => {
  for (const cls of Object.keys(CLASS_DEFINITIONS) as (keyof typeof CLASS_DEFINITIONS)[]) {
    // Loaded firmware lifts the whole body, structure too
    assert.equal(createPlayer(undefined, cls).maxStructuralHp, Math.round(CLASS_DEFINITIONS[cls].baseStructure * (cls === 'none' ? 1 : FIRMWARE_LIFT.structure)));
    assert.ok(CLASS_DEFINITIONS[cls].baseStructure > 0);
  }
});

test('first life: the first enemy carries an active implant, the second a passive one', () => {
  seedRandom(7);
  for (let k = 0; k < 20; k++) {
    const a = rollCarried(1, 1, 'normal', true);
    assert.equal(a.length, 1); assert.equal(augmentKind(a[0].slot!), 'active');
    const b = rollCarried(2, 1, 'normal', true);
    assert.equal(b.length, 1); assert.equal(augmentKind(b[0].slot!), 'passive');
  }
});

test('the Patchwork King wears the Patchwork Crown, rare or epic (the first rung up), and his purse is a stim and credits', () => {
  seedRandom(9);
  for (let k = 0; k < 20; k++) {
    const king = createPatchworkKing();
    const crown = king.carried!.find(i => i.name.includes('Patchwork Crown'))!;
    assert.ok(crown && (crown.rarity === 'rare' || crown.rarity === 'epic'));
    assert.ok(generatePatchworkKingLoot().items.every(i => i.type === 'consumable'));
  }
});

test('enemies carry real implants built from parts; bosses and elites wear their signature', () => {
  seedRandom(10);
  const scav = createBoss(8);
  assert.equal(scav.carried!.length, 2, 'two implants up to threat 10');
  assert.ok(scav.carried!.every(i => i.type === 'augmentation' && !i.signature));
  assert.ok(scav.carried!.every(i => augmentKind(i.slot!) === 'passive' || i.name.startsWith('[HELIX]') || i.parts), 'actives come with parts');
  assert.equal(new Set(scav.carried!.map(i => i.slot)).size, scav.carried!.length, 'one per body slot');
  const listener = createBoss(30);
  const sig = listener.carried!.find(i => i.signature)!;
  assert.ok(sig && /Listener/.test(sig.name) && ['rare', 'epic'].includes(sig.rarity), 'a boss low on the ladder: rare or epic');
  assert.ok(['lance', 'scope', 'mortar', 'longshot'].includes(sig.parts!.head), 'rolls from its own heads');
  assert.ok(createBoss(15).carried!.some(i => i.signature), 'the threat-15 elite wears one too');
  assert.ok(generateLoot(8).items.every(i => i.type === 'consumable'), 'implants only come off bodies now');
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

test('a fractional move reach still builds a whole board (no crash laying out cover)', async () => {
  const { arenaSize, generateBattlefield } = await import('../client/src/lib/combat/grid');
  for (const move of [2, 2.26, 2.5, 2.74, 3.4]) {
    const { cols, rows } = arenaSize({ move, units: 3 });
    assert.ok(Number.isInteger(cols) && Number.isInteger(rows), `${move}: ${cols} x ${rows}`);
    for (let k = 0; k < 20; k++) { const g = generateBattlefield(5, { move, units: 3 }); assert.equal(g.tiles[0].length, g.cols); }
  }
});

test('the first life meets its set piece at threat 2, whichever room it waits in; early threats bite harder', async () => {
  const { EARLY_BITE, FIRST_SET_PIECE } = await import('../client/src/lib/combat/actions');
  assert.equal(FIRST_SET_PIECE, 2);
  seedRandom(5); const first = createBoss(2, true, 'Pump-Fleet Cadre');
  seedRandom(5); const later = createBoss(2, false, 'Pump-Fleet Cadre');
  assert.ok(first.maxHp > later.maxHp * 1.4 && first.physicalAttack > later.physicalAttack * 1.4, 'a named room still holds the set piece on a first life');
  assert.ok(EARLY_BITE.bite > 0 && EARLY_BITE.until > 1);
});

test('there is no way out of a fight once it starts', async () => {
  const { useCombat } = await import('../client/src/lib/stores/useCombat');
  assert.equal((useCombat.getState() as unknown as Record<string, unknown>).retreat, undefined, 'no retreat action in the fight store');
  const fs = await import('node:fs');
  const view = fs.readFileSync(new URL('../client/src/components/game/screens/CombatView.tsx', import.meta.url), 'utf8');
  assert.ok(!/>\s*(Retreat|Flee|Escape|Run away|Leave fight)\s*</i.test(view), 'no retreat button on the fight screen');
});

test('firmware loaded is a massive upgrade: the same body runs harder with it than without', () => {
  const bare = createPlayer(undefined, 'none'), loaded = createPlayer(undefined, 'melee');
  assert.equal(loaded.maxHp, Math.round(CLASS_DEFINITIONS.melee.baseHp * FIRMWARE_LIFT.hp));
  assert.ok(loaded.maxHp > bare.maxHp * 1.5 && loaded.physicalAttack > bare.physicalAttack * 1.5);
});

test('the loot ladder runs across chapters: chapter one is commons and a few uncommons, rares open in chapter two, legendaries come late', async () => {
  const { rarityWeights } = await import('../client/src/lib/combat/loot');
  const { ladderDepth, CHAPTERS } = await import('../client/src/lib/combat/chapters');
  assert.equal(ladderDepth(10, CHAPTERS[0]), 10);
  assert.equal(ladderDepth(1, CHAPTERS[1]), 11, 'chapter two carries on from the King');
  assert.equal(ladderDepth(1, CHAPTERS[2]), 41);
  for (let d = 1; d <= 10; d++) assert.ok(rarityWeights(d).rare <= 3 && rarityWeights(d).epic === 0 && rarityWeights(d).legendary === 0, `chapter one stays low (${d})`);
  assert.equal(rarityWeights(4).uncommon, 5);
  assert.ok(rarityWeights(20).rare > 0 && rarityWeights(20).legendary === 0);
  assert.ok(rarityWeights(80).legendary > rarityWeights(30).legendary);
});
