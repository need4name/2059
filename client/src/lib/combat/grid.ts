import type { CombatGrid, TileData, TilePosition, AttackPatternType } from './types';
import { canHitTarget } from './patterns';

// ── Tile helpers ──────────────────────────────────────────────────────────────

const OBSTACLE_TYPES = [
  { icon: '🧱', name: 'Debris' },
  { icon: '📦', name: 'Crate' },
  { icon: '🛢️', name: 'Barrel' },
  { icon: '⚡', name: 'Generator' },
];

const HAZARD_TYPES = [
  { icon: '☢️', name: 'Toxic Pool', damage: 5 },
  { icon: '🔥', name: 'Fire',       damage: 8 },
  { icon: '⚡', name: 'Live Wire',  damage: 6 },
];

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
export function getReachableTiles(from: TilePosition, grid: CombatGrid, range: number): Set<string> {
  const dist = stepDistances(from, grid, [grid.bossPosition]);
  const out = new Set<string>();
  dist.forEach((d, k) => { if (d > 0 && d <= range) out.add(k); });
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
    const fromBoss = stepDistances(boss, grid, [player], avoidHazards);
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
    const toGoal = stepDistances(goal, grid, [player], avoidHazards);
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

type ArenaShape = NonNullable<CombatGrid['arenaShape']>;

function generateGridSize(bossLevel: number) {
  const progress = Math.min((bossLevel - 1) / 49, 1);
  const cols = Math.min(7, Math.max(4, Math.floor(4 + Math.random() * (0.3 + progress * 0.7) * 4)));
  const rows = Math.min(5, Math.max(3, Math.floor(3 + Math.random() * (0.2 + progress * 0.8) * 3)));
  return { rows, cols };
}

// Returns set of 'row,col' keys that are void (impassable, not drawn)
function getVoidMask(shape: ArenaShape, rows: number, cols: number): Set<string> {
  const voids = new Set<string>();
  if (shape === 'corridor') {
    const keepMin = Math.floor(rows / 2) - (rows >= 4 ? 1 : 0);
    const keepMax = Math.floor(rows / 2) + (rows >= 4 ? 1 : 0);
    for (let r = 0; r < rows; r++) {
      if (r < keepMin || r > keepMax) for (let c = 0; c < cols; c++) voids.add(`${r},${c}`);
    }
  } else if (shape === 'l_shape') {
    const cutRow = Math.floor(rows * 0.5);
    const cutCol = Math.floor(cols * 0.5);
    for (let r = 0; r < cutRow; r++) for (let c = cutCol; c < cols; c++) voids.add(`${r},${c}`);
  } else if (shape === 'cross') {
    const midRow = Math.floor(rows / 2);
    const midCol = Math.floor(cols / 2);
    for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
      if (r !== midRow && c !== midCol) voids.add(`${r},${c}`);
    }
  }
  return voids;
}

function pickShape(bossLevel: number): ArenaShape {
  const roll = Math.random();
  if (bossLevel < 3 || roll < 0.45) return 'open';
  if (bossLevel < 5 || roll < 0.65) return 'corridor';
  if (bossLevel < 7 || roll < 0.80) return 'l_shape';
  return 'cross';
}

function randomOf<T>(arr: T[]): T { return arr[Math.floor(Math.random() * arr.length)]; }

export function generateBattlefield(bossLevel: number): CombatGrid {
  let { rows, cols } = generateGridSize(bossLevel);
  let shape = pickShape(bossLevel);
  // A cross needs room for both arms; fall back if the grid is too small.
  if (shape === 'cross' && (rows < 3 || cols < 5)) shape = 'corridor';
  const progress = Math.min((bossLevel - 1) / 49, 1);
  const voidSet = getVoidMask(shape, rows, cols);

  const tiles: TileData[][] = Array.from({ length: rows }, (_, r) =>
    Array.from({ length: cols }, (_, c) => (voidSet.has(`${r},${c}`) ? { type: 'void' as const } : { type: 'empty' as const })),
  );

  // Place the two combatants first, on non-void tiles at opposite edges.
  const playerRows = Array.from({ length: rows }, (_, i) => i).filter(r => !voidSet.has(`${r},0`));
  const bossRows = Array.from({ length: rows }, (_, i) => i).filter(r => !voidSet.has(`${r},${cols - 1}`));
  let playerPosition = { row: randomOf(playerRows), col: 0 };
  let bossPosition = { row: Math.random() < 0.5 && bossRows.includes(playerPosition.row) ? playerPosition.row : randomOf(bossRows), col: cols - 1 };
  // Cross arenas only have the middle row at each edge.
  if (shape === 'cross') {
    const mid = Math.floor(rows / 2);
    playerPosition = { row: mid, col: 0 };
    bossPosition = { row: mid, col: cols - 1 };
  }

  const grid: CombatGrid = { rows, cols, tiles, arenaShape: shape, playerPosition, bossPosition };
  const connected = () => stepDistances(playerPosition, grid).has(key(bossPosition));

  const numObstacles = Math.max(1, Math.floor(progress * 2)) + Math.floor(Math.random() * (2 + Math.floor(progress * 3)));
  const numHazards = Math.floor(Math.random() * Math.min(3, 1 + Math.floor(progress * 3)));

  const place = (count: number, make: () => TileData, mustStayConnected: boolean) => {
    let n = 0;
    for (let attempts = 0; n < count && attempts < 60; attempts++) {
      const r = Math.floor(Math.random() * rows);
      const c = 1 + Math.floor(Math.random() * (cols - 2));
      if (tiles[r][c].type !== 'empty') continue;
      tiles[r][c] = make();
      if (mustStayConnected && !connected()) { tiles[r][c] = { type: 'empty' }; continue; }
      n++;
    }
  };

  place(numObstacles, () => { const o = randomOf(OBSTACLE_TYPES); return { type: 'obstacle', icon: o.icon, name: o.name }; }, true);
  place(numHazards, () => { const h = randomOf(HAZARD_TYPES); return { type: 'hazard', icon: h.icon, name: h.name, hazardDamage: h.damage }; }, false);

  return grid;
}

export function emptyGrid(): CombatGrid {
  return {
    rows: 3, cols: 7,
    playerPosition: { row: 1, col: 0 },
    bossPosition: { row: 1, col: 6 },
    tiles: Array.from({ length: 3 }, () => Array.from({ length: 7 }, () => ({ type: 'empty' as const }))),
  };
}
