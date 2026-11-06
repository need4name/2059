// Gives every room in the chapter maps a place on the drawn map (`at: [x, y]`), so the
// hideout can draw the rooms the signal has seen. A good layout reads at a glance:
// every way between two rooms is one short hall between neighbours, rooms that don't
// connect don't sit side by side (so they don't look joined), and the map stays compact.
//   npx tsx scripts/layout-maps.ts            fill in missing places (rooms with one keep it)
//   npx tsx scripts/layout-maps.ts --redo     lay every map out again from scratch, then point
//                                             north/south/east/west exits the way they're drawn
// Up, down, in and out exits keep their direction (a shaft down stays down); the solver only
// prefers drawing up a step north and down a step south. Seeded, so it gives the same result every run.
import fs from 'node:fs';
import path from 'node:path';

type Exit = { dir: string; to: string; label?: string; hint: string };
type Room = { id: string; exits: Exit[]; at?: [number, number] };
type ChapterMap = { entry: string; rooms: Room[] };
type Spot = [number, number];
interface Link { a: number; b: number; dir: string }

const STEP: Record<string, Spot> = { north: [0, -1], south: [0, 1], east: [1, 0], west: [-1, 0] };
const OPPOSITE: Record<string, string> = { north: 'south', south: 'north', east: 'west', west: 'east', up: 'down', down: 'up', in: 'out', out: 'in' };
const COMPASS = new Set(Object.keys(STEP));
const key = (x: number, y: number) => x * 4096 + y;

function rng(seed: number) {
  let s = seed >>> 0;
  return () => { s = (Math.imul(s ^ (s >>> 15), 2246822507) + 0x9e3779b9) >>> 0; return (s % 1000003) / 1000003; };
}

/** The ways between rooms, once each (from the room listed first). */
function linksOf(map: ChapterMap): Link[] {
  const idx = new Map(map.rooms.map((r, i) => [r.id, i]));
  const seen = new Set<string>(), out: Link[] = [];
  map.rooms.forEach((r, i) => r.exits.forEach(e => {
    const j = idx.get(e.to)!, k = i < j ? `${i}-${j}` : `${j}-${i}`;
    if (seen.has(k)) return;
    seen.add(k); out.push({ a: i, b: j, dir: e.dir });
  }));
  return out;
}

/**
 * How badly a layout reads (lower is better). `keepDirs` charges a little for drawing a compass
 * exit some other way than it's written (used when filling in, so written directions survive).
 */
function cost(pos: Spot[], links: Link[], linked: Set<number>, keepDirs: boolean) {
  const n = pos.length;
  const cell = new Map<number, number>();
  pos.forEach((p, i) => cell.set(key(p[0], p[1]), i));
  let c = 0;
  for (const l of links) {
    const [ax, ay] = pos[l.a], [bx, by] = pos[l.b], dx = bx - ax, dy = by - ay, d = Math.abs(dx) + Math.abs(dy);
    if (d === 1) {
      if (l.dir === 'up' && dy !== -1) c += 0.4;
      if (l.dir === 'down' && dy !== 1) c += 0.4;
      if (keepDirs && COMPASS.has(l.dir) && (STEP[l.dir][0] !== dx || STEP[l.dir][1] !== dy)) c += 0.6;
    } else if (d === 2 && (dx === 0 || dy === 0)) {
      // A longer straight hall: fine if nothing stands in the middle of it
      c += 8 + (cell.has(key(ax + dx / 2, ay + dy / 2)) ? 40 : 0);
    } else c += 30 + 10 * d;
  }
  // Rooms side by side that don't connect look as if they do
  for (let i = 0; i < n; i++) {
    const [x, y] = pos[i];
    for (const [dx, dy] of [[1, 0], [0, 1]]) {
      const j = cell.get(key(x + dx, y + dy));
      if (j !== undefined && !linked.has(i * 1024 + j)) c += 5;
    }
  }
  // Compact, a little taller than wide (the turned map reads down the screen)
  const xs = pos.map(p => p[0]), ys = pos.map(p => p[1]);
  const w = Math.max(...xs) - Math.min(...xs) + 1, h = Math.max(...ys) - Math.min(...ys) + 1;
  c += 0.04 * w * h + 0.3 * Math.max(0, w - h);
  return c;
}

/** A first guess: walk out from the entry, each room on the free cell nearest where its exit points. */
function seedLayout(map: ChapterMap, rand: () => number): Spot[] {
  const idx = new Map(map.rooms.map((r, i) => [r.id, i]));
  const pos: (Spot | undefined)[] = map.rooms.map(r => r.at);
  const used = new Set<number>();
  for (const p of pos) if (p) used.add(key(p[0], p[1]));
  const start = idx.get(map.entry)!;
  if (!pos[start]) { pos[start] = [0, 0]; used.add(key(0, 0)); }
  const queue = pos.map((p, i) => (p ? i : -1)).filter(i => i >= 0);
  while (queue.length) {
    const i = queue.shift()!;
    const [hx, hy] = pos[i]!;
    for (const e of map.rooms[i].exits) {
      const j = idx.get(e.to)!;
      if (pos[j]) continue;
      const want = STEP[e.dir] ?? (e.dir === 'up' ? [0, -1] : e.dir === 'down' ? [0, 1] : [[1, 0], [-1, 0], [0, 1], [0, -1]][Math.floor(rand() * 4)] as Spot);
      let spot: Spot = [0, 0], best = Infinity;
      for (let dy = -5; dy <= 5; dy++) for (let dx = -5; dx <= 5; dx++) {
        const p: Spot = [hx + want[0] + dx, hy + want[1] + dy];
        if (used.has(key(p[0], p[1]))) continue;
        const c = Math.abs(dx) + Math.abs(dy) + rand() * 0.3;
        if (c < best) { best = c; spot = p; }
      }
      pos[j] = spot; used.add(key(spot[0], spot[1])); queue.push(j);
    }
  }
  return pos.map(p => p ?? [0, 0]);
}

/** Settle a layout by annealing: move a room next to one of its neighbours (or swap two), keep what helps. */
function anneal(map: ChapterMap, links: Link[], start: Spot[], fixed: Set<number>, keepDirs: boolean, seed: number) {
  const rand = rng(seed);
  const n = start.length;
  const linked = new Set<number>();
  const nbrs: number[][] = Array.from({ length: n }, () => []);
  for (const l of links) { linked.add(l.a * 1024 + l.b); linked.add(l.b * 1024 + l.a); nbrs[l.a].push(l.b); nbrs[l.b].push(l.a); }
  let pos = start.map(p => [...p] as Spot);
  let cur = cost(pos, links, linked, keepDirs);
  let best = pos.map(p => [...p] as Spot), bestCost = cur;
  const free = Array.from({ length: n }, (_, i) => i).filter(i => !fixed.has(i));
  if (!free.length) return { pos, cost: cur };
  const STEPS = 250000;
  for (let t = 0; t < STEPS; t++) {
    const temp = 6 * Math.pow(0.002, t / STEPS);
    const i = free[Math.floor(rand() * free.length)];
    const near = nbrs[i].length ? pos[nbrs[i][Math.floor(rand() * nbrs[i].length)]] : pos[i];
    const target: Spot = [near[0] + Math.floor(rand() * 5) - 2, near[1] + Math.floor(rand() * 5) - 2];
    const other = pos.findIndex(p => p[0] === target[0] && p[1] === target[1]);
    if (other === i || (other >= 0 && fixed.has(other))) continue;
    const was = pos[i];
    pos[i] = target;
    if (other >= 0) pos[other] = was;
    const next = cost(pos, links, linked, keepDirs);
    if (next <= cur || rand() < Math.exp((cur - next) / temp)) {
      cur = next;
      if (cur < bestCost) { bestCost = cur; best = pos.map(p => [...p] as Spot); }
    } else { pos[i] = was; if (other >= 0) pos[other] = target; }
  }
  return { pos: best, cost: bestCost };
}

function layout(map: ChapterMap, redo: boolean) {
  const links = linksOf(map);
  const fixed = new Set<number>();
  if (!redo) map.rooms.forEach((r, i) => { if (r.at) fixed.add(i); });
  let best: Spot[] | null = null, bestCost = Infinity;
  for (let trial = 0; trial < 10; trial++) {
    const start = seedLayout(map, rng(trial * 7919 + 13));
    const r = anneal(map, links, start, fixed, !redo, trial * 104729 + 7);
    if (r.cost < bestCost) { bestCost = r.cost; best = r.pos; }
  }
  // Shift so the top-left room sits at 0,0 (only when everything moved)
  const xs = best!.map(p => p[0]), ys = best!.map(p => p[1]);
  const mx = redo ? Math.min(...xs) : 0, my = redo ? Math.min(...ys) : 0;
  map.rooms.forEach((r, i) => { r.at = [best![i][0] - mx, best![i][1] - my]; });
  // Point compass exits the way they're drawn, and their way back the opposite way
  if (redo) {
    const byId = new Map(map.rooms.map(r => [r.id, r]));
    for (const r of map.rooms) for (const e of r.exits) {
      if (!COMPASS.has(e.dir)) continue;
      const b = byId.get(e.to)!, dx = Math.sign(b.at![0] - r.at![0]), dy = Math.sign(b.at![1] - r.at![1]);
      if (dx !== 0 && dy !== 0) continue; // not a straight hall: leave it as written
      const dir = dx > 0 ? 'east' : dx < 0 ? 'west' : dy > 0 ? 'south' : 'north';
      if (dir === e.dir) continue;
      if (e.label) e.label = e.label.replace(new RegExp(`\\b${e.dir}\\b`, 'i'), dir);
      e.dir = dir;
      const back = b.exits.find(x => x.to === r.id);
      if (back && COMPASS.has(back.dir)) { if (back.label) back.label = back.label.replace(new RegExp(`\\b${back.dir}\\b`, 'i'), OPPOSITE[dir]); back.dir = OPPOSITE[dir]; }
    }
  }
  return bestCost;
}

const redo = process.argv.includes('--redo');
const only = process.argv.find(a => a.startsWith('--only='))?.slice(7);
const dir = path.join(import.meta.dirname, '../client/src/content');
for (const file of fs.readdirSync(dir).filter(f => f.startsWith('map-') && (!only || f.includes(only)))) {
  const full = path.join(dir, file);
  const map = JSON.parse(fs.readFileSync(full, 'utf8')) as ChapterMap;
  if (!redo && map.rooms.every(r => r.at)) { console.log(`${file}: already laid out`); continue; }
  const bad = layout(map, redo);
  // Put `at` right after the room's id so it's easy to find and tune
  map.rooms = map.rooms.map(r => { const { id, at, ...more } = r as any; return { id, ...(more.server ? { server: more.server } : {}), at, ...more }; });
  fs.writeFileSync(full, JSON.stringify(map, null, 2).replace(/"at": \[\s*(-?\d+),\s*(-?\d+)\s*\]/g, '"at": [$1, $2]') + '\n');
  console.log(`${file}: laid out (score ${bad.toFixed(1)})`);
}
