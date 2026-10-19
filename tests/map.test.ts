import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as M from '../client/src/lib/engine/map';

const exitTo = (s: M.MapState, to: string) => M.roomById(s.room).exits.findIndex(e => e.to === to);
const walk = (s: M.MapState, ...rooms: string[]) => rooms.reduce((st, r) => {
  const i = exitTo(st, r);
  assert.ok(i >= 0, `no exit from ${st.room} to ${r}`);
  const next = M.go(st, i);
  assert.equal(next.room, r, `blocked going ${st.room} -> ${r}`);
  return M.hasFight(next) ? M.clearRoom(next) : next;
}, s);

test('a new signal wakes at the body dock and can walk south', () => {
  const s = M.newMapState();
  assert.equal(s.room, 'dock');
  const next = M.go(s, exitTo(s, 'deck'));
  assert.equal(next.room, 'deck');
  assert.ok(next.visited.includes('deck'));
});

test('an uncleared fight blocks every way but the one you came in by', () => {
  const s = M.go(M.newMapState(), 0); // into the bleached deck
  assert.equal(M.exitState(s, M.roomById('deck').exits[exitTo(s, 'walkway')]), 'blocked');
  assert.equal(M.go(s, exitTo(s, 'walkway')).room, 'deck', 'nothing happens');
  assert.equal(M.go(s, exitTo(s, 'dock')).room, 'dock', 'you can always back out');
  const cleared = M.clearRoom(s);
  assert.equal(M.go(cleared, exitTo(cleared, 'walkway')).room, 'walkway');
});

test('the way to the chapter boss stays sealed until all three goals are found', () => {
  let s: M.MapState = { ...M.newMapState(), room: 'wake', cameFrom: 'drift', cleared: ['wake'] };
  const down = exitTo(s, 'spire');
  assert.equal(M.exitState(s, M.roomById('wake').exits[down]), 'sealed');
  s = { ...s, goals: ['slab', 'manifest', 'mother'] };
  assert.equal(M.go(s, down).room, 'spire');
});

test('looking finds a goal once, and only once the room is clear', () => {
  let s = walk(M.newMapState(), 'deck', 'walkway', 'stall', 'weigh', 'lanes');
  s = M.go(s, exitTo(s, 'barge'));
  assert.equal(M.look(s).found, null, 'not while the enemy is still there');
  s = M.clearRoom(s);
  const r = M.look(s);
  assert.equal(r.found, 'slab');
  assert.equal(M.look(r.state).found, null);
});

test('a new host wakes at the dock with fights refilled, remembering rooms and goals', () => {
  let s = walk(M.newMapState(), 'deck', 'walkway');
  s = { ...s, goals: ['slab'] };
  const host = M.newHost(s);
  assert.equal(host.room, 'dock');
  assert.deepEqual(host.cleared, []);
  assert.ok(host.visited.includes('walkway'));
  assert.deepEqual(host.goals, ['slab']);
});

test('threat rises with depth: elites and bosses sit on the 5s and 10s', () => {
  for (const r of M.CHAPTER_MAP.rooms) if (r.threat !== undefined && r.threat % 5 === 0) assert.ok(['weigh', 'throne', 'checkpoint', 'foundry', 'theatre', 'spire'].includes(r.id), r.id);
  assert.equal(M.roomById('throne').threat, 10);
});

test('a supply cache can be searched once per host, once its room is clear', () => {
  let s: M.MapState = { ...M.newMapState(), room: 'pumps', cameFrom: 'hull' };
  assert.equal(M.cacheReady(s), false, 'not while the enemy holds the room');
  s = M.clearRoom(s);
  assert.equal(M.cacheReady(s), true);
  s = M.takeCache(s);
  assert.equal(M.cacheReady(s), false);
  assert.equal(M.cacheReady(M.clearRoom({ ...M.newHost(s), room: 'pumps' })), true, 'a new host finds it restocked');
});

test('winning the end room finishes the chapter and leaves it quiet for every later host', () => {
  const s: M.MapState = { ...M.newMapState(), room: M.CHAPTER_MAP.end };
  assert.ok(M.isChapterEnd(s));
  assert.ok(M.hasFight(s));
  const done = M.finishChapter(M.clearRoom(s));
  assert.equal(M.isChapterEnd(done), false);
  const next = { ...M.newHost(done), room: M.CHAPTER_MAP.end };
  assert.equal(M.hasFight(next), false, 'the end room stays quiet');
  assert.equal(M.roomText(next), M.roomById(M.CHAPTER_MAP.end).quiet);
  assert.equal(M.roomText(s), M.roomById(M.CHAPTER_MAP.end).text);
  assert.ok(M.hasFight({ ...next, room: 'deck' }), 'other rooms fill up again');
});

test('every fight room has its own drawn arena, the same each run apart from loose crates', async () => {
  const { buildArena, spawnFoePositions } = await import('../client/src/lib/combat/grid');
  const { seedRandom } = await import('../client/src/lib/engine/rng');
  for (const room of M.CHAPTER_MAP.rooms.filter(r => r.threat !== undefined)) {
    assert.ok(room.arena, `${room.id} has an arena`);
    seedRandom(1); const a = buildArena(room.arena!);
    seedRandom(2); const b = buildArena(room.arena!);
    assert.equal(a.arenaShape, 'drawn');
    assert.deepEqual(a.playerPosition, b.playerPosition, 'same start every run');
    const fixed = (g: typeof a) => g.tiles.map((row, r) => row.map((t, c) => (room.arena![r][c] === '?' ? '?' : t.type)).join('')).join('/');
    assert.equal(fixed(a), fixed(b), `${room.id}: only loose crates change`);
    const spots = spawnFoePositions(a, 3);
    assert.deepEqual(spots[0], a.spawns![0], 'the lead starts on the first E');
    assert.ok(spots.every(p => a.tiles[p.row][p.col].type !== 'void' && a.tiles[p.row][p.col].type !== 'obstacle'));
  }
});
