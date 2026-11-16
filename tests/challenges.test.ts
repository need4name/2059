import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CHALLENGES, earnedByChapterOne, runEndsOnLoss, hostsLeft, toggleChallenge, SHORT_HOSTS } from '../client/src/lib/challenges';

test('eight challenges, each with what it changes and how it is earned', () => {
  assert.equal(CHALLENGES.length, 8);
  assert.equal(new Set(CHALLENGES.map(c => c.id)).size, 8);
  for (const c of CHALLENGES) assert.ok(c.name && c.mod && c.need, c.id);
});

test('finishing chapter one earns challenges by how few hosts it took, the difficulty and the firmware', () => {
  assert.deepEqual(earnedByChapterOne(12, 'easy', 'ranged'), ['short']);
  assert.deepEqual(earnedByChapterOne(8, 'normal', 'ranged'), ['short', 'glass']);
  assert.deepEqual(earnedByChapterOne(6, 'normal', 'ranged'), ['short', 'glass', 'unclassified']);
  assert.deepEqual(earnedByChapterOne(4, 'normal', 'ranged'), ['short', 'glass', 'unclassified', 'bare']);
  assert.ok(earnedByChapterOne(20, 'normal', 'melee').includes('enforcer'), 'the King beaten as an Enforcer');
  assert.ok(earnedByChapterOne(20, 'hard', 'ranged').includes('onebreath'));
  assert.ok(!earnedByChapterOne(20, 'normal', 'ranged').includes('onebreath'));
});

test('a run with only so many hosts ends when the last is lost, and says how many are left', () => {
  assert.equal(runEndsOnLoss(0, []), false);
  assert.equal(runEndsOnLoss(0, ['onebreath']), true, 'One breath: the first loss ends it');
  assert.equal(runEndsOnLoss(SHORT_HOSTS - 2, ['short']), false);
  assert.equal(runEndsOnLoss(SHORT_HOSTS - 1, ['short']), true, 'Short on bodies: the tenth loss ends it');
  assert.equal(hostsLeft(0, []), null);
  assert.equal(hostsLeft(3, ['short']), SHORT_HOSTS - 4);
});

test('clashing challenges switch each other off', () => {
  assert.deepEqual(toggleChallenge(['unclassified'], 'enforcer'), ['enforcer']);
  assert.deepEqual(toggleChallenge(['short', 'glass'], 'onebreath'), ['glass', 'onebreath']);
  assert.deepEqual(toggleChallenge(['glass'], 'glass'), []);
  assert.deepEqual(toggleChallenge(['bare'], 'glass'), ['glass', 'bare'], 'kept in list order');
});
