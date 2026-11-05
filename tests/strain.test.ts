import { test } from 'node:test';
import assert from 'node:assert/strict';
import { strainUnit, strainHeat, strainCredits, strainPicks, STRAIN_NUMBERS } from '../client/src/lib/engine/strain';
import { createBoss } from '../client/src/lib/combat/actions';

test('strain makes enemies tougher, fiercer and hotter only when switched on', () => {
  const u = createBoss(8);
  assert.equal(strainUnit(u, []), u);
  const tough = strainUnit(u, ['tough']);
  assert.equal(tough.maxHp, Math.round(u.maxHp * STRAIN_NUMBERS.hp));
  assert.equal(tough.currentHp, tough.maxHp);
  assert.equal(tough.physicalAttack, u.physicalAttack);
  const fierce = strainUnit(u, ['fierce']);
  assert.equal(fierce.maxHp, u.maxHp);
  assert.equal(fierce.physicalAttack, Math.round(u.physicalAttack * STRAIN_NUMBERS.atk));
  assert.equal(strainHeat(20, []), 20);
  assert.equal(strainHeat(20, ['hot']), 50);
  assert.equal(strainHeat(90, ['hot']), 95, 'never starts past 95');
});

test('each switch pays a quarter more credits; two or more give an extra part', () => {
  assert.equal(strainCredits(100, []), 100);
  assert.equal(strainCredits(100, ['tough', 'shut']), 150);
  assert.equal(strainPicks(['tough']), 0);
  assert.equal(strainPicks(['tough', 'hot']), 1);
});
