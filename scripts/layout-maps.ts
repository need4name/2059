// Gives every room in the chapter maps a place on the drawn map (`at: [x, y]`),
// so the hideout can draw the rooms the signal has seen. Rooms that already
// have a place keep it, so hand-tuned layouts survive; run it after adding rooms.
//   npx tsx scripts/layout-maps.ts            fill in missing places
//   npx tsx scripts/layout-maps.ts --redo     lay every map out from scratch
import fs from 'node:fs';
import path from 'node:path';

type Exit = { dir: string; to: string };
type Room = { id: string; exits: Exit[]; at?: [number, number] };
type Map = { entry: string; rooms: Room[] };

const STEP: Record<string, [number, number] | undefined> = {
  north: [0, -1], up: [0, -1], south: [0, 1], down: [0, 1], east: [1, 0], west: [-1, 0],
};
const key = (x: number, y: number) => `${x},${y}`;

/** How badly a layout draws the map: 0 per exit drawn as a neighbour in its own direction. */
function score(rooms: Room[], at: globalThis.Map<string, [number, number]>) {
  let bad = 0;
  for (const r of rooms) for (const e of r.exits) {
    const a = at.get(r.id), b = at.get(e.to);
    if (!a || !b) continue;
    const dx = b[0] - a[0], dy = b[1] - a[1];
    const dist = Math.abs(dx) + Math.abs(dy);
    const want = STEP[e.dir];
    if (dist === 1) bad += !want || (want[0] === dx && want[1] === dy) ? 0 : 1;
    else bad += 2 + dist + (dx !== 0 && dy !== 0 ? 2 : 0);
  }
  return bad;
}

function rng(seed: number) {
  let s = seed >>> 0;
  return () => ((s = Math.imul(s ^ (s >>> 15), 2246822507) + 0x9e3779b9 >>> 0) % 100000) / 100000;
}

function layout(map: Map, keep: boolean) {
  const byId = new globalThis.Map(map.rooms.map(r => [r.id, r]));
  let best: globalThis.Map<string, [number, number]> | null = null, bestScore = Infinity;
  for (let trial = 0; trial < 400; trial++) {
    const rand = rng(trial * 7919 + 1);
    const at = new globalThis.Map<string, [number, number]>();
    const used = new Set<string>();
    const put = (id: string, p: [number, number]) => { at.set(id, p); used.add(key(...p)); };
    if (keep) for (const r of map.rooms) if (r.at) put(r.id, r.at);
    if (!at.has(map.entry)) put(map.entry, [0, 0]);
    const queue = Array.from(at.keys());
    while (queue.length) {
      const id = queue.splice(Math.floor(rand() * Math.min(queue.length, 2)), 1)[0];
      const here = at.get(id)!;
      const exits = [...byId.get(id)!.exits].sort(() => rand() - 0.5);
      for (const e of exits) {
        if (at.has(e.to)) continue;
        const want = STEP[e.dir] ?? [[1, 0], [-1, 0], [0, 1], [0, -1]][Math.floor(rand() * 4)] as [number, number];
        // Nearest free cell to where the exit points, preferring the same side
        let spot: [number, number] | null = null, spotCost = Infinity;
        for (let dy = -4; dy <= 4; dy++) for (let dx = -4; dx <= 4; dx++) {
          const p: [number, number] = [here[0] + want[0] + dx, here[1] + want[1] + dy];
          if (used.has(key(...p))) continue;
          const cost = Math.abs(dx) + Math.abs(dy) + (Math.sign(p[0] - here[0]) === -want[0] && want[0] ? 3 : 0) + (Math.sign(p[1] - here[1]) === -want[1] && want[1] ? 3 : 0) + rand() * 0.5;
          if (cost < spotCost) { spotCost = cost; spot = p; }
        }
        put(e.to, spot!);
        queue.push(e.to);
      }
    }
    // Then nudge rooms one at a time while it helps
    for (let pass = 0; pass < 6; pass++) {
      let moved = false;
      for (const r of map.rooms) {
        if (keep && r.at) continue;
        if (r.id === map.entry) continue;
        const cur = at.get(r.id)!;
        let s0 = score(map.rooms, at);
        for (const e of r.exits) {
          const n = at.get(e.to)!;
          for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
            const p: [number, number] = [n[0] + dx, n[1] + dy];
            if (used.has(key(...p))) continue;
            const was = at.get(r.id)!;
            used.delete(key(...was)); at.set(r.id, p); used.add(key(...p));
            const s1 = score(map.rooms, at);
            if (s1 < s0) { s0 = s1; moved = true; }
            else { used.delete(key(...p)); at.set(r.id, was); used.add(key(...was)); }
          }
        }
        void cur;
      }
      if (!moved) break;
    }
    const s = score(map.rooms, at);
    if (s < bestScore) { bestScore = s; best = at; }
  }
  // Shift so the top-left room sits at 0,0
  const spots = Array.from(best!.values()), xs = spots.map(p => p[0]), ys = spots.map(p => p[1]);
  const mx = keep && map.rooms.some(r => r.at) ? 0 : Math.min(...xs), my = keep && map.rooms.some(r => r.at) ? 0 : Math.min(...ys);
  for (const r of map.rooms) { const p = best!.get(r.id)!; r.at = [p[0] - mx, p[1] - my]; }
  return bestScore;
}

const redo = process.argv.includes('--redo');
const dir = path.join(import.meta.dirname, '../client/src/content');
for (const file of fs.readdirSync(dir).filter(f => f.startsWith('map-'))) {
  const full = path.join(dir, file);
  const map = JSON.parse(fs.readFileSync(full, 'utf8')) as Map;
  if (!redo && map.rooms.every(r => r.at)) { console.log(`${file}: already laid out`); continue; }
  if (redo) for (const r of map.rooms) delete r.at;
  const bad = layout(map, !redo);
  // Put `at` right after the room's id/name so it's easy to find and tune
  map.rooms = map.rooms.map(r => { const { at, ...rest } = r; const { id, ...more } = rest as any; return { id, at, ...more }; });
  fs.writeFileSync(full, JSON.stringify(map, null, 2).replace(/"at": \[\s*(-?\d+),\s*(-?\d+)\s*\]/g, '"at": [$1, $2]') + '\n');
  console.log(`${file}: laid out (${bad} off)`);
}
