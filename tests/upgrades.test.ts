import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as U from '../client/src/lib/engine/upgrades';
import { actionForItem } from '../client/src/lib/combat/augments';
import { ITEMS_2059 } from '../client/src/lib/combat/items2059';
import type { Item, ItemRarity } from '../client/src/lib/combat/types';
import { NO_PERKS } from '../client/src/lib/engine/playi';

const armOf = (rarity: ItemRarity, prefix = '') => ITEMS_2059.find(i => i.type === 'augmentation' && i.slot === 'right_arm' && !i.signature && !i.id.startsWith('hx') && i.id.startsWith(prefix))!;
const part = (base: Item, id: string, rarity: ItemRarity = base.rarity): Item => ({ ...base, id, rarity, parts: { head: 'jab', mods: [] } });
const leaves = (t: U.UpgradeNode[]) => t.filter(n => !t.some(c => c.parent === n.id));
const depth = (t: U.UpgradeNode[]) => Math.max(...t.map(n => U.depthIn(t, n.id)));

test('the same part always grows the same tree; different parts grow different ones', () => {
  const base = armOf('rare');
  const a = U.treeFor(part(base, 'x-1', 'rare'), 'attack');
  assert.deepEqual(U.treeFor(part(base, 'x-1', 'rare'), 'attack'), a);
  const shapes = new Set(Array.from({ length: 30 }, (_, k) => JSON.stringify(U.treeFor(part(base, `y-${k}`, 'rare'), 'attack').map(n => [n.parent, n.name]))));
  assert.ok(shapes.size > 20, 'trees vary from part to part');
});

test('rarity sets the size, depth and branch ends; only legendary parts get a legendary capstone', () => {
  const base = armOf('rare');
  for (const r of ['common', 'uncommon', 'rare', 'epic', 'legendary'] as ItemRarity[]) {
    const sh = U.SHAPES[r];
    for (let k = 0; k < 40; k++) {
      const t = U.treeFor(part(base, `${r}-${k}`, r), 'attack');
      assert.ok(t.length <= sh.nodes && t.length >= sh.rootKids + 1);
      assert.ok(depth(t) <= sh.depth);
      assert.ok(leaves(t).length <= Math.max(sh.leaves, sh.rootKids));
      assert.ok(leaves(t).every(n => n.cap), 'every branch ends in a capstone');
      assert.equal(t.filter(n => n.cap === 'legendary').length, r === 'legendary' ? 1 : 0);
      assert.equal(t.filter(n => !n.parent).length, 1);
      assert.ok(t.filter(n => n.parent === t[0].id).length >= 2, 'the root forks');
    }
  }
});

test("a part's maker leans its tree toward that maker's upgrades", () => {
  const kizuna = ITEMS_2059.find(i => i.type === 'augmentation' && i.slot === 'right_arm' && !i.signature && /KIZUNA/i.test(i.name))!;
  const volkov = ITEMS_2059.find(i => i.type === 'augmentation' && i.slot === 'right_arm' && !i.signature && /VOLKOV/i.test(i.name))!;
  const count = (base: Item, names: string[]) => { let n = 0; for (let k = 0; k < 40; k++) n += U.treeFor(part(base, `m-${k}`, 'epic'), 'attack').filter(x => names.includes(x.name)).length; return n; };
  assert.ok(count(kizuna, ['Gyro sight', 'Target lock']) > count(volkov, ['Gyro sight', 'Target lock']));
  assert.ok(count(volkov, ['Servo boost', 'Hydraulic ram']) > count(kizuna, ['Servo boost', 'Hydraulic ram']));
});

test('a node needs its parent, a fork takes one side, and deeper nodes cost more', () => {
  const t = U.treeFor(part(armOf('rare'), 'fork-1', 'epic'), 'attack');
  const root = t[0], [a, b] = t.filter(n => n.parent === root.id);
  assert.equal(U.blockedIn(t, [], a.id, 9), 'parent');
  assert.equal(U.blockedIn(t, [], root.id, 0), 'points');
  assert.equal(U.blockedIn(t, [root.id, a.id], b.id, 9), 'fork');
  assert.ok(t.filter(n => n.parent === b.id).every(n => U.closedIn(t, [root.id, a.id], n.id)), 'everything under the closed side closes');
  assert.equal(U.costIn(t, root.id), U.COSTS[0]);
  assert.equal(U.spentIn(t, [root.id, a.id]), U.COSTS[0] + U.COSTS[1]);
});

test("an attack implant's tree really changes its move", () => {
  const item = part(armOf('rare'), 'move-1', 'rare');
  const t = U.treeFor(item, 'attack');
  const base = actionForItem(item)!;
  // Take a whole branch, root to capstone
  const end = t.find(n => n.cap)!;
  const chain: string[] = [];
  for (let n: U.UpgradeNode | undefined = end; n; n = n.parent ? U.nodeIn(t, n.parent) : undefined) chain.unshift(n.id);
  const up = actionForItem(item, U.effectIn(t, chain))!;
  assert.notDeepEqual(up, base);
  assert.ok(U.effectText(end.effect).length > 0);
});

test('wins earn points, and an implant that leaves gives its points back', async () => {
  const { useAugmentTrees, nodesOf } = await import('../client/src/lib/stores/useAugmentTrees');
  const { useInventory } = await import('../client/src/lib/stores/useInventory');
  const T = useAugmentTrees.getState, I = useInventory.getState;
  T().resetTrees(); I().clearInventory();
  for (let k = 0; k < U.WINS_PER_POINT * 4; k++) T().winFight();
  assert.equal(T().availablePoints, 4, `one point per ${U.WINS_PER_POINT} wins`);
  const arm = part(armOf('rare'), 'arm-1', 'rare');
  I().addItems([arm]); I().equipAugmentation(arm);
  const t = nodesOf(arm)!;
  const [a, b] = t.filter(n => n.parent === t[0].id);
  assert.ok(T().take('right_arm', t[0].id));
  assert.ok(T().take('right_arm', a.id));
  assert.equal(T().take('right_arm', b.id), false, 'the fork is closed');
  const left = T().availablePoints;
  T().forget(arm);
  assert.equal(T().availablePoints, left + U.COSTS[0] + U.COSTS[1], 'the points come back');
  assert.equal(T().owned['arm-1'], undefined);
});

test('the two sides of a fork are always different upgrades', () => {
  const base = armOf('rare');
  for (const r of ['common', 'uncommon', 'rare', 'epic', 'legendary'] as ItemRarity[]) for (let k = 0; k < 60; k++) {
    const t = U.treeFor(part(base, `fork-${r}-${k}`, r), 'attack');
    for (const n of t) {
      const kids = t.filter(c => c.parent === n.id).map(c => c.name);
      assert.equal(new Set(kids).size, kids.length, `${r} ${k}: a fork offers ${kids.join(' / ')}`);
    }
  }
});

test("each body slot grows its own upgrades, and they change how the host plays", () => {
  const ear = ITEMS_2059.find(i => i.type === 'augmentation' && i.slot === 'ears' && !i.signature)!;
  const names = new Set<string>();
  for (let k = 0; k < 20; k++) U.treeFor({ ...ear, id: `ear-${k}`, rarity: 'rare' }, 'passive').forEach(n => names.add(n.name));
  assert.ok(names.has('Sound map') || names.has('Inner ear') || names.has('Echo sense'), 'ear upgrades turn up on ears');
  assert.ok(!names.has('Filters') && !names.has('Cold logic'), "another slot's upgrades never do");
  // A slot upgrade's perk reaches the host's perks
  const p = U.withTreePerks(NO_PERKS, U.addPerks({ partingCut: 0.3 }, { cooling: 3, coolAct: 30 }));
  assert.equal(Math.round(p.partingTakenMult * 100), 70);
  assert.equal(p.extraCooling, 3);
  assert.equal(p.doubleActionHeat, 30);
  assert.match(U.effectText({ perk: { hazardCut: 1 } }), /hazards can't hurt you/);
});
