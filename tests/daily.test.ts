import { test } from 'node:test';
import assert from 'node:assert/strict';
import { dailySeed, recordDaily, todayKey, firstLifeAt } from '../client/src/lib/daily';

test('the daily seed is the same all day for everyone, and new each day', () => {
  assert.equal(dailySeed('2026-11-05'), dailySeed('2026-11-05'));
  assert.notEqual(dailySeed('2026-11-05'), dailySeed('2026-11-06'));
  assert.equal(todayKey(new Date('2026-11-05T23:59:00Z')), '2026-11-05', 'days are counted in UTC');
});

test('a day keeps its best level and counts its runs', () => {
  let r = recordDaily({}, '2026-11-05', 7);
  r = recordDaily(r, '2026-11-05', 4);
  r = recordDaily(r, '2026-11-05', 12);
  assert.deepEqual(r['2026-11-05'], { best: 12, runs: 3 });
  assert.deepEqual(recordDaily(r, '2026-11-06', 2)['2026-11-05'], { best: 12, runs: 3 }, 'other days untouched');
});

test('outside a daily run the first life still meets its set piece', () => {
  assert.equal(firstLifeAt(0, 3), true);
  assert.equal(firstLifeAt(1, 3), false);
});
