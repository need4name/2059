import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as U from '../client/src/lib/engine/upgrades';
import { actionForItem } from '../client/src/lib/combat/augments';
import { ITEMS_2059 } from '../client/src/lib/combat/items2059';
import { seedRandom } from '../client/src/lib/engine/rng';

test('a node needs its parent, a fork takes one side, and deeper nodes cost more', () => {
  const k: U.TreeKind = 'attack';
  assert.equal(U.blockedBy(k, [], 'force', 9), 'parent');
  assert.equal(U.blockedBy(k, [], 'root', 0), 'points');
  assert.equal(U.blockedBy(k, [], 'root', 1), null);
  assert.equal(U.blockedBy(k, ['root', 'force'], 'finesse', 9), 'fork', 'the other side of the fork closes');
  assert.ok(U.closed(k, ['root', 'force'], 'surgeon'), 'and everything under it');
  assert.equal(U.blockedBy(k, ['root'], 'root', 9), 'owned');
  assert.deepEqual(['root', 'force', 'breaker', 'wrecker'].map(id => U.costOf(k, id)), U.COSTS);
  assert.equal(U.spent(k, ['root', 'force', 'breaker', 'wrecker']), U.COSTS.reduce((a, b) => a + b, 0));
});

test('every tree has one root and forks at each of its first two levels', () => {
  for (const kind of ['attack', 'brace', 'passive'] as const) {
    const nodes = U.TREES[kind];
    assert.equal(nodes.filter(n => !n.parent).length, 1);
    const root = nodes.find(n => !n.parent)!;
    const kids = (id: string) => nodes.filter(n => n.parent === id);
    assert.equal(kids(root.id).length, 2, `${kind}: the root forks`);
    for (const c of kids(root.id)) assert.equal(kids(c.id).length, 2, `${kind}: each side forks again`);
  }
});

test("an attack implant's tree really changes its move", () => {
  seedRandom(3);
  const arm = ITEMS_2059.find(i => i.type === 'augmentation' && i.slot === 'right_arm' && i.rarity === 'rare' && !i.signature && !i.id.startsWith('hx'))!;
  const item = { ...arm, parts: { head: 'jab', mods: [] } };
  const base = actionForItem(item)!;
  const force = actionForItem(item, U.effectOf('attack', ['root', 'force']))!;
  assert.ok(force.damage! > base.damage!, 'more damage');
  assert.ok(force.heatGenerated! > base.heatGenerated!, 'runs hotter');
  const surgeon = actionForItem(item, U.effectOf('attack', ['root', 'finesse', 'surgeon']))!;
  assert.equal(surgeon.accuracy, 'precise');
  const breaker = actionForItem(item, U.effectOf('attack', ['root', 'force', 'breaker']))!;
  assert.ok(breaker.effects?.knock && breaker.effects?.crush);
  assert.equal(U.effectText(U.nodeOf('attack', 'force')!.effect), '+25% damage, +2 heat, +3 attack');
});

test('wins earn points, and an implant that leaves gives its points back', async () => {
  const { useAugmentTrees } = await import('../client/src/lib/stores/useAugmentTrees');
  const { useInventory } = await import('../client/src/lib/stores/useInventory');
  const T = useAugmentTrees.getState, I = useInventory.getState;
  T().resetTrees(); I().clearInventory();
  for (let k = 0; k < U.WINS_PER_POINT * 4; k++) T().winFight();
  assert.equal(T().availablePoints, 4, `one point per ${U.WINS_PER_POINT} wins`);
  const arm = { ...ITEMS_2059.find(i => i.type === 'augmentation' && i.slot === 'right_arm' && !i.signature && !i.id.startsWith('hx'))!, id: 'arm-1', parts: { head: 'jab', mods: [] } };
  I().addItems([arm]); I().equipAugmentation(arm);
  assert.ok(T().take('right_arm', 'root'));
  assert.ok(T().take('right_arm', 'force'));
  assert.ok(T().take('right_arm', 'breaker'));
  assert.equal(T().availablePoints, 0);
  assert.equal(T().take('right_arm', 'finesse'), false, 'the fork is closed');
  T().forget(arm);
  assert.equal(T().availablePoints, 4, 'all four points back');
  assert.equal(T().owned['arm-1'], undefined);
});
