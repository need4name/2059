import { test } from 'node:test';
import assert from 'node:assert/strict';
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
  assert.deepEqual(FW.firmwarePassives('swift', 1), { speed: 2, twin: null });
  assert.equal(FW.firmwarePassives('swift', 3).speed, 3);
  assert.equal(FW.firmwarePassives('swift', 9).twin, 'cool');
  assert.equal(FW.firmwarePassives('swift', 10).twin, 'always');
  assert.equal(FW.firmwarePassives('swift', 10).speed, 4);
  assert.ok(FW.firmwareAttack('swift', 5, 40)!.effects?.retreat, 'hit and run from level 5');
  assert.deepEqual(FW.firmwarePassives('melee', 10), { speed: 0, twin: null }, 'other firmware stays at its speed');
});

test('Foreman sweeps, then hits all around, then blasts a square at range', () => {
  assert.equal(FW.firmwareAttack('crowd', 1, 40)!.attackPattern, 'sweep_arc');
  assert.equal(FW.firmwareAttack('crowd', 4, 40)!.attackPattern, 'burst');
  assert.equal(FW.firmwareAttack('crowd', 10, 40)!.attackPattern, 'aoe');
});

test('Courier and Foreman open by going deep, Courier first', () => {
  assert.deepEqual(FW.DEEP_FIRMWARE.map(f => f.cls), ['swift', 'crowd']);
  assert.deepEqual(FW.opensAt(14, []), []);
  assert.deepEqual(FW.opensAt(15, []), ['swift']);
  assert.deepEqual(FW.opensAt(22, ['swift']), ['crowd']);
  assert.deepEqual(FW.opensAt(30, ['swift', 'crowd']), []);
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
