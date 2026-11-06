import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sellPrice, recallCost } from '../client/src/lib/combat/economy';
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

test('the map remembers rooms across hosts, glimpses the doors beyond, and marks where hosts fell', () => {
  const s = walk(M.newMapState(), 'deck', 'walkway');
  const host = M.newHost(s);
  assert.deepEqual(host.fell, ['walkway']);
  const view = M.mapView(host);
  const seen = view.rooms.filter(r => r.seen).map(r => r.id).sort();
  assert.deepEqual(seen, ['deck', 'dock', 'walkway']);
  for (const r of view.rooms.filter(r => !r.seen)) assert.ok([s.room, 'deck', 'dock'].some(id => M.roomById(id).exits.some(e => e.to === r.id)), `${r.id} is behind a door the signal has seen`);
  assert.ok(view.rooms.find(r => r.id === 'walkway')!.fell);
  assert.equal(view.rooms.find(r => r.id === 'dock')!.mark, 'market');
  // Each way is drawn once
  const keys = view.links.map(l => [...l].sort().join('>'));
  assert.equal(new Set(keys).size, keys.length);
  // Dying in the same room twice marks it once, as the latest
  assert.deepEqual(M.newHost({ ...M.newHost({ ...host, room: 'deck' }), room: 'walkway' }).fell, ['deck', 'walkway']);
});

test('found rooms show what is there, most pressing first; glimpsed rooms show nothing', () => {
  const s = M.newMapState();
  const rooms = M.chapterMap().rooms;
  const plain = rooms.find(r => r.threat !== undefined && r.threat % 5 !== 0 && !r.look && !r.cache && !r.ally)!;
  assert.equal(M.roomMark(s, plain), 'fight', 'a fight waits for this host');
  const won = { ...s, cleared: [plain.id] };
  assert.equal(M.roomMark(won, plain), 'cleared');
  assert.equal(M.roomMark(M.newHost(won), plain), 'fight', 'a new host finds it full again');
  const boss = rooms.find(r => r.threat !== undefined && r.threat % 10 === 0)!;
  const elite = rooms.find(r => r.threat !== undefined && r.threat % 5 === 0 && r.threat % 10 !== 0)!;
  assert.equal(M.roomMark(s, boss), 'boss');
  assert.equal(M.roomMark(s, elite), 'elite');
  const ally = rooms.find(r => r.ally)!;
  const clear = { ...s, cleared: rooms.map(r => r.id) };
  assert.equal(M.roomMark(clear, ally), 'ally');
  assert.notEqual(M.roomMark(clear, ally, [ally.ally!]), 'ally', 'linked: it stops calling');
  const cache = rooms.find(r => r.cache)!;
  assert.equal(M.roomMark(clear, cache), 'cache');
  const lookRoom = rooms.find(r => r.look && !r.ally && !r.cache)!;
  assert.equal(M.roomMark(clear, lookRoom), 'look');
  assert.notEqual(M.roomMark({ ...clear, looked: [lookRoom.id] }, lookRoom), 'look');
  for (const r of M.mapView(s).rooms.filter(r => !r.seen)) assert.equal(r.mark, null);
});

test('a door that needs every goal shows its room as sealed until they are found', () => {
  const m = M.chapterMap();
  const from = m.rooms.find(r => r.exits.some(e => e.requires === 'goals'))!;
  const to = from.exits.find(e => e.requires === 'goals')!.to;
  const s = { ...M.newMapState(), visited: [m.entry, from.id] };
  assert.ok(M.mapView(s).rooms.find(r => r.id === to)!.sealed);
  assert.ok(!M.mapView({ ...s, goals: [...m.goals] }).rooms.find(r => r.id === to)!.sealed);
});

test('every room has its own spot on the drawn map', () => {
  for (const m of Object.values(M.MAPS)) {
    const spots = new Set(m.rooms.map(r => r.at.join(',')));
    assert.equal(spots.size, m.rooms.length, m.chapter);
  }
});

test('threat rises with depth: elites and bosses sit on the 5s and 10s', () => {
  for (const r of M.chapterMap().rooms) if (r.threat !== undefined && r.threat % 5 === 0) assert.ok(['weigh', 'throne', 'checkpoint', 'foundry', 'theatre', 'spire'].includes(r.id), r.id);
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
  const s: M.MapState = { ...M.newMapState(), room: M.chapterMap().end };
  assert.ok(M.isChapterEnd(s));
  assert.ok(M.hasFight(s));
  const done = M.finishChapter(M.clearRoom(s));
  assert.equal(M.isChapterEnd(done), false);
  const next = { ...M.newHost(done), room: M.chapterMap().end };
  assert.equal(M.hasFight(next), false, 'the end room stays quiet');
  assert.equal(M.roomText(next), M.roomById(M.chapterMap().end).quiet);
  assert.equal(M.roomText(s), M.roomById(M.chapterMap().end).text);
  assert.ok(M.hasFight({ ...next, room: 'deck' }), 'other rooms fill up again');
});

test('every fight room has its own drawn arena, the same each run apart from loose crates', async () => {
  const { buildArena, spawnFoePositions } = await import('../client/src/lib/combat/grid');
  const { seedRandom } = await import('../client/src/lib/engine/rng');
  for (const room of Object.values(M.MAPS).flatMap(m => m.rooms).filter(r => r.threat !== undefined)) {
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

test('chapters: the map state knows its chapter; travel starts a fresh map there', async () => {
  const { CHAPTERS, nextChapter, setActiveChapter, activeChapter } = await import('../client/src/lib/combat/chapters');
  assert.equal(M.newMapState().chapter, CHAPTERS[0].id);
  assert.equal(CHAPTERS[0].ready, true);
  // Only a chapter marked ready is offered next
  const next = CHAPTERS[1];
  assert.equal(nextChapter(CHAPTERS[0].id), next && next.ready ? next : null);
  assert.equal(nextChapter('nowhere'), null);
  setActiveChapter('nowhere');
  assert.equal(activeChapter().id, CHAPTERS[0].id, 'unknown ids fall back to chapter one');
  for (const c of CHAPTERS) {
    const m = M.mapOf(c.id);
    assert.ok(m, `${c.id} has a map`);
    const s = M.newMapState(c.id);
    assert.equal(s.room, m.entry);
    assert.deepEqual(s.visited, [m.entry]);
  }
});

test('a lost host leaves its part on its body; the next host can take it back once', () => {
  const part = { id: 'x-1', name: 'Test Arm', type: 'augmentation', rarity: 'rare' } as any;
  let s = M.newMapState('indian-ocean');
  s = { ...s, room: 'walkway' };
  s = M.newHost(s, part);
  assert.deepEqual(s.corpse, { room: 'walkway', item: part });
  // Not from the entry room, and not while the room's fight is still waiting
  assert.equal(M.takeCorpse(s).item, null);
  s = { ...s, room: 'walkway' };
  if (M.hasFight(s)) assert.equal(M.takeCorpse(s).item, null);
  s = M.clearRoom(s);
  const r = M.takeCorpse(s);
  assert.equal(r.item, part);
  assert.equal(r.state.corpse, null);
  assert.equal(M.takeCorpse(r.state).item, null);
  assert.equal(M.mapView({ ...s, visited: [...s.visited, 'walkway'] }).rooms.find(x => x.id === 'walkway')?.corpse, true);
});

test('losing another host first loses the last body\'s part', () => {
  const a = { id: 'a', name: 'A' } as any, b = { id: 'b', name: 'B' } as any;
  let s = { ...M.newMapState('indian-ocean'), room: 'walkway' };
  s = M.newHost(s, a);
  s = M.newHost({ ...s, room: 'dock' }, b);
  assert.deepEqual(s.corpse, { room: 'dock', item: b });
  assert.equal(M.newHost(s, null).corpse, null);
});

test('a fresh map forgets everything, so a new game or the next chapter starts clean', () => {
  const fresh = M.newMapState('deltas');
  assert.equal(fresh.done, false);
  assert.deepEqual(fresh.fell, []);
  assert.equal(fresh.corpse, null);
  // Merged over a finished chapter's state (as the store does), nothing old survives
  const old = { ...M.newMapState('indian-ocean'), done: true, fell: ['walkway'], corpse: { room: 'walkway', item: { id: 'x' } as any } };
  const merged = { ...old, ...fresh };
  assert.equal(merged.done, false);
  assert.deepEqual(merged.fell, []);
  assert.equal(merged.corpse, null);
});

test('rooms sit at heights the exits agree with: up climbs, down drops', () => {
  for (const id of Object.keys(M.MAPS)) {
    const m = M.MAPS[id], z = M.roomHeights(m);
    assert.equal(z[m.entry], 0);
    let ups = 0, upright = 0;
    for (const r of m.rooms) for (const e of r.exits) {
      if (e.dir === 'up') { ups++; if (z[e.to] > z[r.id]) upright++; }
      if (e.dir === 'down') { ups++; if (z[e.to] < z[r.id]) upright++; }
    }
    assert.equal(upright, ups, `${id}: every up exit climbs and every down exit drops`);
  }
});

// The way from the entry to a room, by the fewest doors
const pathTo = (target: string) => {
  const m = M.chapterMap();
  const back = new Map<string, string>([[m.entry, '']]);
  const queue = [m.entry];
  while (queue.length) { const a = queue.shift()!; for (const e of M.roomById(a).exits) if (!back.has(e.to)) { back.set(e.to, a); queue.push(e.to); } }
  const out: string[] = [];
  for (let r = target; r !== m.entry; r = back.get(r)!) out.unshift(r);
  return out;
};

test('a beaten boss stays down, its room becomes a server, and it can be called back', () => {
  const server = M.chapterMap().rooms.find(r => r.server)!;
  assert.ok(server.threat! % 10 === 0, 'servers sit in boss rooms');
  // Walk to the boss and beat it
  let s = walk(M.newMapState(), ...pathTo(server.id));
  assert.equal(s.room, server.id);
  assert.deepEqual(s.beaten, [server.id], 'beating it keeps it down');
  assert.deepEqual(M.wakePlaces(s), [M.chapterMap().entry, server.id]);
  assert.equal(M.roomMark(s, server), 'server');
  // A new host finds every other fight full again, but the boss still down
  const next = M.newHost(s);
  assert.ok(!M.hasFight(next, server), 'the boss stays dead for later hosts');
  assert.equal(M.newHost(s, null, server.id).room, server.id, 'a new host can wake at it');
  // Resting: heal, this host's won fights come back, the boss doesn't; caches and events stay used
  const rested = M.rest({ ...s, taken: ['x'], spent: ['y'], hurt: 40 });
  assert.deepEqual(rested.cleared, []);
  assert.equal(rested.hurt, 0);
  assert.ok(!M.hasFight(rested, server));
  assert.deepEqual([rested.taken, rested.spent], [['x'], ['y']]);
  // Calling it back: the fight is on for this host; winning again keeps it beaten
  const called = M.recall(s);
  assert.ok(M.hasFight(called, server));
  assert.ok(!M.hasFight(M.newHost(called), server), 'a call-back only lasts for that host');
  const won = M.clearRoom(called);
  assert.ok(!M.hasFight(won, server));
  assert.deepEqual(won.beaten, [server.id]);
  // No waking at a boss nobody has beaten, and no resting anywhere else
  assert.equal(M.newHost(M.newMapState(), null, server.id).room, M.chapterMap().entry);
  const elsewhere = { ...s, room: M.chapterMap().entry };
  assert.equal(M.rest(elsewhere), elsewhere);
});

test('health carries between fights: a win gives some back, resting and a new host heal it all', () => {
  const max = 100;
  assert.equal(M.hurtAfterWin(40, max), 60 - Math.round(max * M.WIN_RECOVER));
  assert.equal(M.hurtAfterWin(95, max), 0, 'never below nothing missing');
  const server = M.chapterMap().rooms.find(r => r.server)!;
  const s = { ...walk(M.newMapState(), ...pathTo(server.id)), hurt: 70 };
  assert.equal(M.healthNow(s, max), 30);
  assert.equal(M.healthNow({ ...s, hurt: 500 }, max), 1, 'a host never starts a fight dead');
  assert.equal(M.rest(s).hurt, 0);
  assert.equal(M.newHost(s).hurt, 0);
});

test('a boss implant sells for a little less than calling its boss back', () => {
  const crown = { id: 'c', name: 'Crown', type: 'augmentation', rarity: 'legendary', signature: true } as any;
  assert.ok(sellPrice({ ...crown, bossThreat: 10 }) < recallCost(10));
  assert.ok(sellPrice({ ...crown, bossThreat: 10 }) >= recallCost(10) * 0.85);
  assert.ok(sellPrice(crown) < sellPrice({ ...crown, bossThreat: 10 }), 'only a boss-dropped one is worth that');
});
