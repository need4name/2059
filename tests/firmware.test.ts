import { test } from 'node:test';
import assert from 'node:assert/strict';
import { NO_PERKS } from '../client/src/lib/engine/playi';
import * as FW from '../client/src/lib/engine/firmware';
import { basicAttack, PLAYER_ACTIONS } from '../client/src/lib/combat/actions';

test('firmware levels come from xp, and stop at the top', () => {
  assert.deepEqual(FW.firmwareLevel(0), { level: 1, into: 0, need: FW.XP_TO_NEXT[0] });
  assert.equal(FW.firmwareLevel(FW.XP_TO_NEXT[0]).level, 2);
  const all = FW.XP_TO_NEXT.reduce((a, b) => a + b, 0);
  assert.equal(FW.firmwareLevel(all - 1).level, FW.MAX_FIRMWARE_LEVEL - 1);
  assert.equal(FW.firmwareLevel(all).level, FW.MAX_FIRMWARE_LEVEL);
  assert.equal(FW.firmwareLevel(all * 5).level, FW.MAX_FIRMWARE_LEVEL);
});

test('bosses teach a firmware most, elites more, anyone else a little', () => {
  assert.equal(FW.firmwareXpFor(10), FW.FIRMWARE_XP.boss);
  assert.equal(FW.firmwareXpFor(25), FW.FIRMWARE_XP.elite);
  assert.equal(FW.firmwareXpFor(7), FW.FIRMWARE_XP.win);
  assert.ok(FW.FIRMWARE_XP.boss > FW.FIRMWARE_XP.elite && FW.FIRMWARE_XP.elite > FW.FIRMWARE_XP.win);
});

test('Precision Shot starts modest and earns its strength', () => {
  const at = (lv: number) => FW.firmwareAttack('ranged', lv, 40)!;
  assert.equal(at(1).accuracy, 'variable', 'not a sure hit at first');
  assert.equal(at(1).attackPattern, 'bolt');
  assert.equal(at(5).accuracy, 'precise', 'the optical lock comes at level 5');
  assert.equal(at(7).attackPattern, 'pierce', 'through every body from level 7');
  assert.ok(at(10).effects?.ignoreCover);
  assert.ok(at(10).damage! > at(1).damage! * 1.7, 'much harder at the top');
  for (let lv = 2; lv <= FW.MAX_FIRMWARE_LEVEL; lv++) assert.ok(at(lv).damage! >= at(lv - 1).damage!, 'never weaker for a level');
});

test('Hydraulic Slam grows knockback, crush and stun', () => {
  const at = (lv: number) => FW.firmwareAttack('melee', lv, 40)!;
  assert.equal(at(1).effects, undefined);
  assert.ok(at(3).effects?.knock);
  assert.ok(at(5).effects?.crush);
  assert.equal(at(10).effects?.stun, 0.35);
});

test('no firmware keeps Strike', () => {
  assert.equal(basicAttack('none', 40, 10), PLAYER_ACTIONS[0]);
  assert.equal(basicAttack('ranged', 40, 5).name, 'Precision Shot');
});

test('Courier gets quicker, then acts twice while cool, then every turn', () => {
  assert.deepEqual(FW.firmwarePassives('swift', 1), { speed: 0, twin: null }, 'its base speed (13) covers the head start');
  assert.equal(FW.firmwarePassives('swift', 3).speed, 1);
  assert.equal(FW.firmwarePassives('swift', 9).twin, 'cool');
  assert.equal(FW.firmwarePassives('swift', 10).twin, 'always');
  assert.equal(FW.firmwarePassives('swift', 10).speed, 3, 'the Quicker fork (the default side) adds 2');
  assert.ok(FW.firmwareAttack('swift', 5, 40)!.effects?.retreat, 'hit and run from level 5');
  assert.deepEqual(FW.firmwarePassives('melee', 10), { speed: 0, twin: null }, 'other firmware stays at its speed');
});

test('Foreman sweeps, then hits all around, then blasts a square at range', () => {
  assert.equal(FW.firmwareAttack('crowd', 1, 40)!.attackPattern, 'sweep_arc');
  assert.equal(FW.firmwareAttack('crowd', 4, 40)!.attackPattern, 'burst');
  assert.equal(FW.firmwareAttack('crowd', 10, 40)!.attackPattern, 'aoe');
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

test('a firmware opens at its own level, or the best level reached, whichever is higher', () => {
  assert.equal(FW.firmwareLevel(FW.openingXp('melee', {})).level, 1);
  assert.equal(FW.firmwareLevel(FW.openingXp('swift', {})).level, 3);
  assert.equal(FW.firmwareLevel(FW.openingXp('swift', { melee: FW.xpForLevel(7) })).level, 7);
  assert.equal(FW.firmwareLevel(FW.openingXp('splice', { melee: FW.xpForLevel(2) })).level, 6);
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

test('firmware forks: levels 4, 7 and 10 offer two sides; the one taken shapes the firmware', () => {
  assert.ok(FW.levelOptions('melee', 4) && FW.levelOptions('melee', 7) && FW.levelOptions('melee', 10));
  assert.equal(FW.levelOptions('melee', 5), null);
  // Enforcer level 10: Piledriver (default) keeps its line; Earthshaker hits all round
  FW.setForkChoices({});
  assert.equal(FW.firmwareAttack('melee', 10, 40)!.attackPattern, 'melee_long');
  FW.setForkChoices({ melee: { 10: 1 } });
  assert.equal(FW.firmwareAttack('melee', 10, 40)!.attackPattern, 'burst');
  // A fork's perk and health reach the host: Bulk adds 30 health
  FW.setForkChoices({ melee: { 7: 1 } });
  assert.equal(FW.withClass(NO_PERKS, 'melee', 7).maxHpBonus, 30);
  assert.equal(FW.withClass(NO_PERKS, 'melee', 6).maxHpBonus, 0, 'not before the level is reached');
  FW.setForkChoices({});
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
  const two = FW.withSplice(FW.withClass(NO_PERKS, 'splice', 1), 2);
  assert.equal(two.extraCooling, -4);
  assert.ok(Math.abs(two.structureMult - 0.8) < 1e-9);
  assert.equal(two.splicedNow, 2);
  assert.equal(FW.withClass(NO_PERKS, 'splice', 1).splicePairs, 2, 'two pairs to start');
});

test('the Wretch: weak, but implant moves hit harder, cost less to grow, and a fifth slot', async () => {
  const w = FW.withClass(NO_PERKS, 'wretch', 1);
  assert.ok(w.implantDamage >= 0.35);
  assert.equal(w.implantTreeDiscount, 1);
  assert.equal(w.extraSlots, 1);
  assert.ok(w.healthCostMult > 1, 'implants cost it more health');
  // Its forks: Tolerance brings health costs back to normal; Kinship doubles mods
  FW.setForkChoices({ wretch: { 4: 0, 10: 0 } });
  assert.ok(Math.abs(FW.withClass(NO_PERKS, 'wretch', 10).healthCostMult - 1) < 0.02);
  assert.equal(FW.withClass(NO_PERKS, 'wretch', 10).kinship, true);
  FW.setForkChoices({});
  // Resonance: every firmware's rule grows its own way
  const res = { ...NO_PERKS, resonance: true };
  assert.equal(FW.withResonance(res, 'melee').chainVent, 15);
  assert.equal(FW.withResonance({ ...res, doubleActionHeat: 25 }, 'ranged').doubleActionHeat, 35);
  assert.ok(FW.withResonance(res, 'swift').reflexReach >= 2);
  assert.equal(FW.withResonance(res, 'crowd').overheatSpread, 20);
  assert.equal(FW.withResonance(res, 'none').strikeHot, true);
  assert.equal(FW.withResonance({ ...NO_PERKS }, 'melee').chainVent, 0, 'only with the node');
});
