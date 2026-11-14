import { test } from 'node:test';
import assert from 'node:assert/strict';
import { NO_PERKS } from '../client/src/lib/engine/playi';
import * as FW from '../client/src/lib/engine/firmware';
import { basicAttack, PLAYER_ACTIONS } from '../client/src/lib/combat/actions';

test('bosses teach a firmware most, elites more, anyone else a little', () => {
  assert.equal(FW.firmwareXpFor(10), FW.FIRMWARE_XP.boss);
  assert.equal(FW.firmwareXpFor(25), FW.FIRMWARE_XP.elite);
  assert.equal(FW.firmwareXpFor(7), FW.FIRMWARE_XP.win);
  assert.ok(FW.FIRMWARE_XP.boss > FW.FIRMWARE_XP.elite && FW.FIRMWARE_XP.elite > FW.FIRMWARE_XP.win);
});

test('each firmware is held by a boss: chapter one\'s first boss and King, then each later chapter\'s first boss', () => {
  assert.equal(FW.firmwareHeldAt('indian-ocean', 5), 'melee');
  assert.equal(FW.firmwareHeldAt('indian-ocean', 10), 'ranged');
  assert.equal(FW.firmwareHeldAt('deltas', 5), 'swift');
  assert.equal(FW.firmwareHeldAt('helix-hills', 5), 'crowd');
  assert.equal(FW.firmwareHeldAt('rain-machine', 5), 'wretch');
  assert.equal(FW.firmwareHeldAt('corridor', 5), 'splice');
  assert.equal(FW.firmwareHeldAt('deltas', 10), null, 'later set pieces hold none');
  assert.equal(FW.firmwareHeldAt('indian-ocean', 3), null);
});

test('no firmware until a boss gives one up; it opens for the next host, who has to wake with it', async () => {
  const { useCombat, availableFirmware } = await import('../client/src/lib/stores/useCombat');
  const { useFirmware } = await import('../client/src/lib/stores/useFirmware');
  const { useMap } = await import('../client/src/lib/stores/useMap');
  useCombat.getState().resetAll();
  assert.deepEqual(availableFirmware(), [], 'a new signal has nothing to load');
  useCombat.getState().rebirth('melee');
  assert.equal(useCombat.getState().playerClass, 'none');
  // The first boss fights with the firmware it holds
  useMap.setState({ room: 'weigh' });
  useCombat.getState().startRoomFight();
  const boss = useCombat.getState().foes[0].unit;
  assert.equal(boss.name, 'Volkov Operator');
  assert.deepEqual(boss.moves?.map(m => m.name), ['Hydraulic Slam', 'Piledriver', 'Pain Suppression']);
  useCombat.getState().resetCombat();
  // Beaten, it opens: nothing changes for this host; the next one wakes with it (going without isn't offered)
  useFirmware.getState().open('melee');
  assert.deepEqual(useFirmware.getState().fresh, ['melee']);
  assert.deepEqual(availableFirmware(), ['melee']);
  useCombat.getState().rebirth('none');
  assert.equal(useCombat.getState().playerClass, 'melee');
  assert.deepEqual(useFirmware.getState().fresh, [], 'no longer new once a host has woken');
  useCombat.getState().resetAll();
});

test('only elites, bosses and set pieces leave a first impression', async () => {
  const { isNotable } = await import('../client/src/lib/combat/actions');
  const { useJournal } = await import('../client/src/lib/stores/useJournal');
  assert.equal(isNotable('Cartel Enforcer'), true);
  assert.equal(isNotable('Patchwork King'), true);
  assert.equal(isNotable('Limbic Cartel Scavenger'), false);
  useJournal.getState().reset();
  assert.equal(useJournal.getState().sight('Limbic Cartel Scavenger', 1), null, 'an ordinary enemy leaves no note');
  assert.ok(useJournal.getState().seen.includes('Limbic Cartel Scavenger'), 'but it counts as met');
  assert.ok(useJournal.getState().sight('Cartel Enforcer', 1), 'an elite does');
});

test('Splice: compatible pairs in passive slots, both count, each pair costs heat and structure', async () => {
  const { canSplice, makerOf } = await import('../client/src/lib/combat/augments');
  const { ITEMS_2059 } = await import('../client/src/lib/combat/items2059');
  const { useInventory } = await import('../client/src/lib/stores/useInventory');
  const passives = ITEMS_2059.filter(i => i.type === 'augmentation' && i.slot === 'brain' && !i.signature);
  const helix = passives.find(i => makerOf(i) === 'KIZUNA')!;
  const crown = passives.find(i => makerOf(i) === 'CROWN')!;
  const volkov = passives.find(i => makerOf(i) === 'VOLKOV')!;
  assert.ok(canSplice(helix, { ...crown, id: 'c2' }), 'Kizuna and Crown take to each other');
  assert.ok(!canSplice(helix, { ...volkov, id: 'v2' }), 'Kizuna and Volkov do not');
  const arm = ITEMS_2059.find(i => i.type === 'augmentation' && i.slot === 'right_arm')!;
  assert.ok(!canSplice(arm, { ...arm, id: 'a2' }), 'active slots never splice');
  // Both count
  const inv = useInventory.getState();
  inv.clearInventory();
  const main = { ...helix, id: 'm1' }, extra = { ...crown, id: 'e1' };
  inv.addItems([main, extra]);
  useInventory.getState().equipAugmentation(main);
  const before = useInventory.getState().getTotalAugmentationBonuses();
  useInventory.getState().spliceIn(useInventory.getState().items.find(i => i.id === 'e1')!);
  const after = useInventory.getState().getTotalAugmentationBonuses();
  assert.ok(after.hp + after.physicalDefense + after.physicalAttack > before.hp + before.physicalDefense + before.physicalAttack, 'the spliced part adds its stats');
  // Taking the main part out brings its partner out too
  useInventory.getState().unequipAugmentation('brain');
  assert.equal(useInventory.getState().spliced.brain, null);
  assert.equal(useInventory.getState().items.length, 2);
  useInventory.getState().clearInventory();
  // Cost: 2 heat a turn and 10% structure per pair; Tolerance and Symbiote cut the heat
  const two = FW.withSplice(FW.withClass(NO_PERKS, 'splice', {}), 2);
  assert.equal(two.extraCooling, -4);
  assert.ok(Math.abs(two.structureMult - 0.8) < 1e-9);
  assert.equal(two.splicedNow, 2);
  assert.equal(FW.withClass(NO_PERKS, 'splice', {}).splicePairs, 2, 'two pairs to start');
});

test('the Wretch: weak, but implant moves hit harder, cost less to grow, and a fifth slot', async () => {
  const w = FW.withClass(NO_PERKS, 'wretch', {});
  assert.ok(w.implantDamage >= 0.35);
  assert.equal(w.implantTreeDiscount, 1);
  assert.equal(w.extraSlots, 1);
  assert.ok(w.healthCostMult > 1, 'implants cost it more health');
  // Its lane: Tolerance brings health costs back to normal; Kinship doubles mods
  const lane = { A: 1, F1a: 1, C: 1, D: 1, F3a: 1 };
  assert.ok(Math.abs(FW.withClass(NO_PERKS, 'wretch', lane).healthCostMult - 1) < 0.02);
  assert.equal(FW.withClass(NO_PERKS, 'wretch', lane).kinship, true);
  // Resonance: every firmware's rule grows its own way
  const res = { ...NO_PERKS, resonance: true };
  assert.equal(FW.withResonance(res, 'melee').chainVent, 15);
  assert.equal(FW.withResonance({ ...res, doubleActionHeat: 25 }, 'ranged').doubleActionHeat, 35);
  assert.ok(FW.withResonance(res, 'swift').reflexReach >= 2);
  assert.equal(FW.withResonance(res, 'crowd').overheatSpread, 20);
  assert.equal(FW.withResonance(res, 'none').strikeHot, true);
  assert.equal(FW.withResonance({ ...NO_PERKS }, 'melee').chainVent, 0, 'only with the node');
});

// ── Lanes: each firmware's own points, spent on its own lane ────────────────
const all = (cls: Parameters<typeof FW.laneOf>[0]) => Object.fromEntries(FW.laneOf(cls).map(n => [n.id, n.ranks]));

test('a firmware starts plain; its lane makes its move stronger, never weaker', () => {
  const plain = FW.firmwareAttack('ranged', {})!;
  assert.equal(plain.accuracy, 'variable'); assert.equal(plain.attackPattern, 'bolt');
  const lane = FW.laneOf('ranged');
  let ranks: Record<string, number> = {}, last = plain.damage!;
  for (const n of lane.filter(x => !x.fork)) for (let r = 0; r < n.ranks; r++) {
    ranks = { ...ranks, [n.id]: (ranks[n.id] ?? 0) + 1 };
    const d = FW.firmwareAttack('ranged', ranks)!.damage!;
    assert.ok(d >= last, 'never weaker for a rank'); last = d;
  }
  const top = FW.firmwareAttack('ranged', all('ranged'))!;
  assert.ok(top.damage! > plain.damage! * 1.7, 'much harder with the whole lane');
  assert.equal(top.accuracy, 'precise'); assert.ok(top.effects?.ignoreCover);
});

test('Hydraulic Slam: knockback, crush, and stun chances that add up rank by rank', () => {
  assert.equal(FW.firmwareAttack('melee', {})!.effects, undefined);
  assert.ok(FW.firmwareAttack('melee', { A: 1, B: 1 })!.effects?.knock);
  assert.ok(FW.firmwareAttack('melee', { A: 1, B: 1, F1a: 1 })!.effects?.crush);
  assert.equal(FW.firmwareAttack('melee', { A: 1, B: 1, C: 1, F2a: 3 })!.effects?.stun, 0.15);
  assert.equal(FW.firmwareAttack('melee', { A: 1, B: 1, C: 1, F2a: 5, D: 1, F3a: 1 })!.effects?.stun, 0.6);
  assert.equal(FW.withClass(NO_PERKS, 'melee', { A: 1, B: 1, C: 1, F2b: 3 }).maxHpBonus, 30, 'Bulk: health per rank');
});

test('Courier gets quicker, then acts twice while cool, then every turn', () => {
  assert.deepEqual(FW.firmwarePassives('swift', {}), { speed: 0, twin: null });
  assert.equal(FW.firmwarePassives('swift', { A: 1, B: 1 }).speed, 1);
  assert.equal(FW.firmwarePassives('swift', { A: 1, B: 1, C: 1, F2a: 2 }).speed, 3);
  assert.equal(FW.firmwarePassives('swift', { A: 1, B: 1, C: 1, D: 1 }).twin, 'cool');
  assert.equal(FW.firmwarePassives('swift', { A: 1, B: 1, C: 1, D: 1, F3a: 1 }).twin, 'always');
  assert.ok(FW.firmwareAttack('swift', { A: 1, B: 1, F1a: 1 })!.effects?.retreat);
  assert.deepEqual(FW.firmwarePassives('melee', all('melee')), { speed: 0, twin: null }, 'other firmware stays at its speed');
});

test('Foreman sweeps, then hits all around, then blasts a square at range', () => {
  assert.equal(FW.firmwareAttack('crowd', {})!.attackPattern, 'sweep_arc');
  assert.equal(FW.firmwareAttack('crowd', { A: 1, B: 1, F1a: 1 })!.attackPattern, 'burst');
  assert.equal(FW.firmwareAttack('crowd', { A: 1, B: 1, C: 1, D: 1, F3a: 1 })!.attackPattern, 'aoe');
});

test('a lane node needs the one before it, its stage open, and a rank left', () => {
  assert.ok(FW.laneOpen('melee', 'A', {}, 1));
  assert.ok(!FW.laneOpen('melee', 'B', {}, 1), 'not before Hits harder');
  assert.ok(FW.laneOpen('melee', 'B', { A: 1 }, 1));
  assert.ok(FW.laneOpen('melee', 'F1a', { A: 1, B: 1 }, 1) && FW.laneOpen('melee', 'F1b', { A: 1, B: 1, F1a: 1 }, 1), 'both sides of a fork');
  assert.ok(!FW.laneOpen('melee', 'C', { A: 1, B: 1 }, 1), 'stage two waits for chapter two');
  assert.ok(FW.laneOpen('melee', 'C', { A: 1, B: 1 }, 2));
  assert.ok(!FW.laneOpen('melee', 'B', { A: 1, B: 1 }, 1), 'full');
  assert.equal(FW.laneStageFor(0), 1); assert.equal(FW.laneStageFor(1), 2); assert.equal(FW.laneStageFor(4), 3);
});

test('a firmware earns its own points while loaded, opens with some, and spends them on its lane', async () => {
  const { useFirmware } = await import('../client/src/lib/stores/useFirmware');
  const f = useFirmware.getState();
  f.reset();
  f.open('melee'); f.open('swift');
  assert.equal(useFirmware.getState().points.melee, FW.openingPoints('melee'));
  assert.equal(useFirmware.getState().points.swift, FW.openingPoints('swift'));
  assert.ok(FW.openingPoints('splice') > FW.openingPoints('melee'), 'a later firmware arrives ready to grow');
  assert.equal(useFirmware.getState().gain('melee', FW.POINT_XP * 2 + 1), 2);
  assert.equal(useFirmware.getState().xp.melee, 1, 'the rest carries toward the next');
  const before = useFirmware.getState().points.melee!;
  assert.ok(useFirmware.getState().learn('melee', 'A', 1));
  assert.equal(useFirmware.getState().points.melee, before - 1);
  assert.equal(FW.laneRanksOf('melee').A, 1, 'the engine sees what was bought');
  assert.ok(!useFirmware.getState().learn('melee', 'C', 1), 'not this chapter');
  useFirmware.getState().reset();
  assert.deepEqual(FW.laneRanksOf('melee'), {});
});

test('every lane says only what it adds, and its links run along the lane', () => {
  for (const cls of Object.keys(FW.FIRMWARE) as Parameters<typeof FW.laneOf>[0][]) {
    const lane = FW.laneOf(cls);
    assert.ok(lane.length >= 4);
    lane.forEach((n, k) => {
      assert.ok(!/instead of|, a rank/.test(n.text), `${cls} ${n.id} says what it adds`);
      if (n.after) assert.ok(lane.slice(0, k).some(m => m.id === n.after && !m.fork), `${cls} ${n.id} hangs off a main node ahead of it`);
    });
  }
});
