import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as R from '../client/src/lib/engine/runStats';

const body = (hp: number) => ({ unit: { currentHp: hp } });
const state = (playerHp: number, foes: number[], allies: number[] = []) => ({ player: { currentHp: playerHp }, foes: foes.map(body), allies: allies.map(body) }) as any;

test("the player's hits count as damage dealt to that move, kills and crits too", () => {
  const d = R.tally(state(100, [50, 30]), state(100, [20, 0]), { kind: 'player', move: 'Strike' }, [{ kind: 'log', message: 'CRITICAL! Dealt 30', type: 'critical' } as any]);
  assert.equal(d.damageDealt, 60);
  assert.equal(d.biggestHit, 60);
  assert.equal(d.enemiesKilled, 1);
  assert.equal(d.crits, 1);
  assert.deepEqual(d.moves, { Strike: { uses: 1, damage: 60 } });
});

test("an enemy's turn counts as damage taken; an ally's hits and hurts count for allies", () => {
  const foe = R.tally(state(100, [50], [40]), state(80, [50], [30]), { kind: 'foe' }, []);
  assert.equal(foe.damageTaken, 20);
  assert.equal(foe.allyDamageTaken, 10);
  assert.equal(foe.damageDealt, undefined);
  const ally = R.tally(state(100, [50]), state(100, [35]), { kind: 'ally' }, []);
  assert.equal(ally.allyDamageDealt, 15);
  assert.equal(ally.damageDealt, undefined);
  const heal = R.tally(state(60, [50]), state(75, [50]), { kind: 'other' }, []);
  assert.equal(heal.healed, 15);
});

test('totals add up, the biggest hit is kept, and the favourite move is the most used', () => {
  let s = R.emptyStats();
  s = R.addStats(s, { damageDealt: 30, biggestHit: 30, moves: { Strike: { uses: 1, damage: 30 } } });
  s = R.addStats(s, { damageDealt: 10, biggestHit: 10, moves: { Brace: { uses: 1, damage: 0 } } });
  s = R.addStats(s, { damageDealt: 20, biggestHit: 20, moves: { Strike: { uses: 1, damage: 20 } }, enemiesKilled: 1 });
  assert.equal(s.damageDealt, 60);
  assert.equal(s.biggestHit, 30);
  assert.equal(s.enemiesKilled, 1);
  assert.deepEqual(R.favouriteMove(s), { name: 'Strike', uses: 2, damage: 50 });
  assert.equal(R.favouriteMove(R.emptyStats()), null);
});
