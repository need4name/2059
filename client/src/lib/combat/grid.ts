import type { CombatGrid, TileData, TilePosition, AttackPatternType } from './types';
import { canHitTarget } from './patterns';

import { random } from '../engine/rng';
import { activeChapter } from './chapters';
// ── Tile helpers ──────────────────────────────────────────────────────────────

// Cover and hazards come from the current chapter's tileset (content/chapters.json)
const OBSTACLE_TYPES = () => activeChapter().tileset.obstacles;
const HAZARD_TYPES = () => activeChapter().tileset.hazards;

const NEIGHBOURS = [
  { row: -1, col: 0 }, { row: 1, col: 0 }, { row: 0, col: -1 }, { row: 0, col: 1 },
  { row: -1, col: -1 }, { row: -1, col: 1 }, { row: 1, col: -1 }, { row: 1, col: 1 },
];

const key = (p: TilePosition) => `${p.row},${p.col}`;
const samePos = (a: TilePosition, b: TilePosition) => a.row === b.row && a.col === b.col;

export function chebyshev(a: TilePosition, b: TilePosition): number {
  return Math.max(Math.abs(a.row - b.row), Math.abs(a.col - b.col));
}

export function inBounds(p: TilePosition, grid: CombatGrid): boolean {
  return p.row >= 0 && p.row < grid.rows && p.col >= 0 && p.col < grid.cols;
}

export function tileAt(p: TilePosition, grid: CombatGrid): TileData | undefined {
  return grid.tiles?.[p.row]?.[p.col];
}

/** Obstacles, void and out-of-bounds tiles can never be stood on. */
export function isImpassable(p: TilePosition, grid: CombatGrid): boolean {
  if (!inBounds(p, grid)) return true;
  const t = tileAt(p, grid)?.type;
  return t === 'obstacle' || t === 'void';
}

export function hazardDamageAt(p: TilePosition, grid: CombatGrid): number {
  const t = tileAt(p, grid);
  return t?.type === 'hazard' ? t.hazardDamage ?? 0 : 0;
}

/**
 * Breadth-first step counts (8-directional) from `from` over passable tiles.
 * `blocked` positions (e.g. the other combatant) can't be entered.
 * When `avoidHazards` is set, hazard tiles are treated as walls.
 */
export function stepDistances(
  from: TilePosition,
  grid: CombatGrid,
  blocked: TilePosition[] = [],
  avoidHazards = false,
): Map<string, number> {
  const dist = new Map<string, number>([[key(from), 0]]);
  const queue: TilePosition[] = [from];
  const blockedKeys = new Set(blocked.map(key));
  while (queue.length) {
    const cur = queue.shift()!;
    const d = dist.get(key(cur))!;
    for (const o of NEIGHBOURS) {
      const np = { row: cur.row + o.row, col: cur.col + o.col };
      const k = key(np);
      if (dist.has(k) || blockedKeys.has(k) || isImpassable(np, grid)) continue;
      if (avoidHazards && hazardDamageAt(np, grid) > 0) continue;
      dist.set(k, d + 1);
      queue.push(np);
    }
  }
  return dist;
}

/** Tiles the player can move to this turn (not counting the start tile). */
export function getReachableTiles(from: TilePosition, grid: CombatGrid, range: number, passThrough = false): Set<string> {
  const others = [grid.bossPosition, ...(grid.occupied ?? [])];
  const out = new Set<string>();
  if (!passThrough) {
    const dist = stepDistances(from, grid, others);
    dist.forEach((d, k) => { if (d > 0 && d <= range) out.add(k); });
    return out;
  }
  // Phase step: walk through units and obstacles, but only stop on open ground
  const taken = new Set(others.map(key));
  const seen = new Map<string, number>([[key(from), 0]]);
  const queue: TilePosition[] = [from];
  while (queue.length) {
    const cur = queue.shift()!;
    const d = seen.get(key(cur))!;
    if (d >= range) continue;
    for (const o of NEIGHBOURS) {
      const np = { row: cur.row + o.row, col: cur.col + o.col };
      const k = key(np);
      if (seen.has(k) || !inBounds(np, grid) || tileAt(np, grid)?.type === 'void') continue;
      seen.set(k, d + 1);
      queue.push(np);
      if (!taken.has(k) && !isImpassable(np, grid)) out.add(k);
    }
  }
  return out;
}

/**
 * One step for the boss toward a tile from which `pattern` can hit the player.
 * Returns null when it is already in position or no route exists.
 */
export function stepTowardAttackPosition(grid: CombatGrid, pattern: AttackPatternType): TilePosition | null {
  const { bossPosition: boss, playerPosition: player } = grid;
  if (canHitTarget(boss, player, pattern, grid)) return null;

  // Distance from every tile back to the boss, preferring routes around hazards.
  for (const avoidHazards of [true, false]) {
    const blockers = [player, ...(grid.occupied ?? [])];
    const fromBoss = stepDistances(boss, grid, blockers, avoidHazards);
    let goal: TilePosition | null = null;
    let goalDist = Infinity;
    for (const [k, d] of Array.from(fromBoss.entries())) {
      const [row, col] = k.split(',').map(Number);
      const p = { row, col };
      if (d === 0 || !canHitTarget(p, player, pattern, grid)) continue;
      if (d < goalDist || (d === goalDist && goal && chebyshev(p, player) < chebyshev(goal, player))) {
        goal = p; goalDist = d;
      }
    }
    // No firing position reachable: just close the distance.
    if (!goal) {
      for (const [k, d] of Array.from(fromBoss.entries())) {
        const [row, col] = k.split(',').map(Number);
        const p = { row, col };
        if (d === 0) continue;
        if (!goal || chebyshev(p, player) < chebyshev(goal, player)) goal = p;
      }
      if (goal && chebyshev(goal, player) >= chebyshev(boss, player)) goal = null;
    }
    if (!goal) continue;
    // Walk back from the goal to find the first step.
    const toGoal = stepDistances(goal, grid, blockers, avoidHazards);
    let best: TilePosition | null = null;
    let bestD = Infinity;
    for (const o of NEIGHBOURS) {
      const np = { row: boss.row + o.row, col: boss.col + o.col };
      const d = toGoal.get(key(np));
      if (d === undefined || samePos(np, player)) continue;
      if (d < bestD) { bestD = d; best = np; }
    }
    if (best) return best;
  }
  return null;
}

// ── Battlefield generation ───────────────────────────────────────────────────
// Arenas are portrait (taller than wide) to fit a phone. The player starts on the
// bottom edge and the enemy on the top edge, so there is ground to cover.

type ArenaShape = NonNullable<CombatGrid['arenaShape']>;

/** What an arena has to make room for: the player's movement and how many bodies are on it. */
export interface ArenaNeeds { move: number; units: number }
const DEFAULT_NEEDS: ArenaNeeds = { move: 1, units: 2 };

// About 7x9 suits a player who moves 1 tile against one enemy. Each extra tile of
// movement adds a column and two rows; each extra body adds a row (and a column
// every two). Capped at 9x13 so tiles stay big enough to read on a phone.
export function arenaSize(needs: ArenaNeeds = DEFAULT_NEEDS) {
  const extraMove = Math.max(0, needs.move - 1);
  const extraUnits = Math.max(0, needs.units - 2);
  const cols = 7 + Math.min(2, extraMove + Math.floor(extraUnits / 2));
  const rows = 9 + Math.min(4, extraMove * 2 + extraUnits);
  return { cols, rows };
}

function generateGridSize(needs: ArenaNeeds) {
  const { cols, rows } = arenaSize(needs);
  // A little variety: sometimes one row longer
  return { cols, rows: Math.min(13, rows + (random() < 0.35 ? 1 : 0)) };
}

// Returns set of 'row,col' keys that are void (impassable, not drawn)
function getVoidMask(shape: ArenaShape, rows: number, cols: number, crowded = false): Set<string> {
  const voids = new Set<string>();
  const add = (r: number, c: number) => voids.add(`${r},${c}`);
  if (shape === 'corridor') {
    // A walkway running top to bottom, like a gantry between platforms (wider when crowded)
    const width = crowded ? 4 : 3;
    const keepMin = Math.floor((cols - width) / 2);
    const keepMax = keepMin + width - 1;
    for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) if (c < keepMin || c > keepMax) add(r, c);
  } else if (shape === 'l_shape') {
    // One corner of the deck has collapsed into the sea
    const cutRows = Math.floor(rows * 0.45);
    const cutCols = Math.floor(cols * 0.5);
    const left = random() < 0.5;
    for (let r = Math.floor((rows - cutRows) / 2); r < Math.floor((rows - cutRows) / 2) + cutRows; r++)
      for (let c = 0; c < cutCols; c++) add(r, left ? c : cols - 1 - c);
  } else if (shape === 'cross') {
    // Two crossing walkways two tiles wide
    const midRow = Math.floor(rows / 2), midCol = Math.floor(cols / 2);
    for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
      const onRow = r === midRow || r === midRow - 1;
      const onCol = c === midCol || c === midCol - 1;
      if (!onRow && !onCol) add(r, c);
    }
  }
  return voids;
}

function pickShape(bossLevel: number): ArenaShape {
  const roll = random();
  if (bossLevel < 3 || roll < 0.45) return 'open';
  if (bossLevel < 5 || roll < 0.65) return 'corridor';
  if (bossLevel < 7 || roll < 0.82) return 'l_shape';
  return 'cross';
}

function randomOf<T>(arr: T[]): T { return arr[Math.floor(random() * arr.length)]; }

export function generateBattlefield(bossLevel: number, needs: ArenaNeeds = DEFAULT_NEEDS): CombatGrid {
  const { rows, cols } = generateGridSize(needs);
  const shape = pickShape(bossLevel);
  const voidSet = getVoidMask(shape, rows, cols, needs.units >= 4);

  const tiles: TileData[][] = Array.from({ length: rows }, (_, r) =>
    Array.from({ length: cols }, (_, c) => (voidSet.has(`${r},${c}`) ? { type: 'void' as const } : { type: 'empty' as const })),
  );

  // Player on the bottom edge, enemy on the top edge, on solid tiles
  const bottomCols = Array.from({ length: cols }, (_, i) => i).filter(c => !voidSet.has(`${rows - 1},${c}`));
  const topCols = Array.from({ length: cols }, (_, i) => i).filter(c => !voidSet.has(`0,${c}`));
  const playerPosition = { row: rows - 1, col: randomOf(bottomCols) };
  const bossPosition = { row: 0, col: randomOf(topCols) };

  const grid: CombatGrid = { rows, cols, tiles, arenaShape: shape, playerPosition, bossPosition };
  const connected = () => stepDistances(playerPosition, grid).has(key(bossPosition));

  // Cover and hazards scale with the walkable area
  const walkable = rows * cols - voidSet.size;
  const progress = Math.min((bossLevel - 1) / 15, 1);
  const numObstacles = Math.round(walkable * (0.08 + progress * 0.06) + random() * 2);
  const numHazards = bossLevel < 2 ? 0 : Math.round(walkable * (0.02 + progress * 0.04) + random());

  const place = (count: number, make: () => TileData, mustStayConnected: boolean) => {
    let n = 0;
    for (let attempts = 0; n < count && attempts < count * 25; attempts++) {
      // Keep the two spawn rows clear so nobody starts boxed in
      const r = 1 + Math.floor(random() * (rows - 2));
      const c = Math.floor(random() * cols);
      if (tiles[r][c].type !== 'empty') continue;
      tiles[r][c] = make();
      if (mustStayConnected && !connected()) { tiles[r][c] = { type: 'empty' }; continue; }
      n++;
    }
  };

  place(numObstacles, () => { const o = randomOf(OBSTACLE_TYPES()); return { type: 'obstacle', art: o.art, name: o.name }; }, true);
  place(numHazards, () => { const h = randomOf(HAZARD_TYPES()); return { type: 'hazard', art: h.art, name: h.name, hazardDamage: h.damage }; }, false);

  return grid;
}

// ── Drawn arenas ─────────────────────────────────────────────────────────────
// Fight rooms carry their own board, drawn as text in the map file, so a place
// is the same place every run. Only loose crates ('?') vary.

const COVER_ART: Record<string, string> = { '#': 'crate', d: 'drum', n: 'nets', p: 'pump' };
const HAZARD_ART: Record<string, string> = { f: 'fire', c: 'cable', b: 'chem', h: 'hole' };
export const ARENA_CHARS = '.~#dnp?fcbhPE';

/** Build a board from a drawn layout (see the map file's notes for the characters). */
export function buildArena(layout: string[]): CombatGrid {
  const rows = layout.length, cols = layout[0].length;
  const cover = OBSTACLE_TYPES(), hazards = HAZARD_TYPES();
  const coverOf = (art: string) => cover.find(o => o.art === art) ?? cover[0];
  const hazardOf = (art: string) => hazards.find(h => h.art === art) ?? hazards[0];
  let playerPosition = { row: rows - 1, col: Math.floor(cols / 2) };
  const spawns: TilePosition[] = [];
  const tiles: TileData[][] = layout.map((line, r) => Array.from(line).map((ch, c): TileData => {
    if (ch === 'P') playerPosition = { row: r, col: c };
    if (ch === 'E') spawns.push({ row: r, col: c });
    if (ch === '~') return { type: 'void' };
    if (ch === '?') {
      if (random() >= 0.5) return { type: 'empty' };
      const o = randomOf(cover);
      return { type: 'obstacle', art: o.art, name: o.name };
    }
    if (COVER_ART[ch]) { const o = coverOf(COVER_ART[ch]); return { type: 'obstacle', art: o.art, name: o.name }; }
    if (HAZARD_ART[ch]) { const h = hazardOf(HAZARD_ART[ch]); return { type: 'hazard', art: h.art, name: h.name, hazardDamage: h.damage }; }
    return { type: 'empty' };
  }));
  return { rows, cols, tiles, arenaShape: 'drawn', playerPosition, bossPosition: spawns[0] ?? { row: 0, col: Math.floor(cols / 2) }, spawns };
}

/**
 * Where a fight's foes start: the first at the grid's enemy spawn, the rest on
 * nearby open tiles in the top rows, spread out and reachable.
 */
export function spawnFoePositions(grid: CombatGrid, count: number): TilePosition[] {
  const out: TilePosition[] = [grid.bossPosition];
  // A drawn arena says where enemies start; extra enemies stand near those spots
  for (const p of grid.spawns ?? []) if (out.length < count && !out.some(o => samePos(o, p))) out.push(p);
  const reach = stepDistances(grid.playerPosition, grid);
  const candidates: TilePosition[] = [];
  const near = (p: TilePosition) => grid.spawns?.length ? grid.spawns.some(s => chebyshev(s, p) <= 2) : p.row < Math.min(3, grid.rows);
  for (let r = 0; r < grid.rows; r++) for (let c = 0; c < grid.cols; c++) {
    if (!near({ row: r, col: c }) || chebyshev({ row: r, col: c }, grid.playerPosition) < 2) continue;
    const p = { row: r, col: c };
    if (tileAt(p, grid)?.type === 'empty' && reach.has(key(p))) candidates.push(p);
  }
  while (out.length < count) {
    const free = candidates.filter(p => !out.some(o => samePos(o, p)));
    if (!free.length) break;
    // Prefer tiles two or more away from every foe already placed
    const spread = free.filter(p => out.every(o => chebyshev(o, p) >= 2));
    out.push(randomOf(spread.length ? spread : free));
  }
  return out;
}

/** Open tiles next to the player for allies to start on (nearest first, avoiding `taken`). */
export function allySpawnPositions(grid: CombatGrid, count: number, taken: TilePosition[]): TilePosition[] {
  const out: TilePosition[] = [];
  const reach = stepDistances(grid.playerPosition, grid);
  const spots = Array.from(reach.entries()).filter(([, d]) => d > 0).sort((a, b) => a[1] - b[1]).map(([k]) => { const [row, col] = k.split(',').map(Number); return { row, col }; });
  for (const p of spots) {
    if (out.length >= count) break;
    if (tileAt(p, grid)?.type !== 'empty' || samePos(p, grid.bossPosition) || [...taken, ...out].some(o => samePos(o, p))) continue;
    out.push(p);
  }
  return out;
}

export function emptyGrid(): CombatGrid {
  return {
    rows: 7, cols: 6,
    playerPosition: { row: 6, col: 2 },
    bossPosition: { row: 0, col: 3 },
    tiles: Array.from({ length: 7 }, () => Array.from({ length: 6 }, () => ({ type: 'empty' as const }))),
  };
}
