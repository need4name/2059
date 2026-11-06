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
