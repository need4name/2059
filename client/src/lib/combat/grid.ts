import type { CombatGrid, TileData, TilePosition, AttackPatternType } from './types';
import { canHitTarget } from './patterns';

// ── Tile helpers ──────────────────────────────────────────────────────────────

// Cover found on the plastic archipelago and the platforms tethered to it
const OBSTACLE_TYPES = [
  { icon: '🧱', name: 'Debris bale' },
  { icon: '📦', name: 'Salvage crate' },
  { icon: '🛢️', name: 'Pump drum' },
  { icon: '⚙️', name: 'Turbine strut' },
  { icon: '🧵', name: 'Cable spool' },
];

const HAZARD_TYPES = [
  { icon: '☣️', name: 'Leachate pool', damage: 5 },
  { icon: '🔥', name: 'Fuel fire',     damage: 8 },
  { icon: '⚡', name: 'Stolen power tap', damage: 6 },
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
// Arenas are portrait (taller than wide) to fit a phone. The player starts on the
// bottom edge and the enemy on the top edge, so there is ground to cover.

type ArenaShape = NonNullable<CombatGrid['arenaShape']>;

function generateGridSize(bossLevel: number) {
  // Grows from about 7x9 on the first fights to 9x13 by threat 12
  const progress = Math.min((bossLevel - 1) / 11, 1);
  const cols = Math.round(7 + progress * 2 - Math.random() * 0.8);
  const rows = Math.round(9 + progress * 4 - Math.random() * 1.2);
  return { cols: Math.max(7, Math.min(9, cols)), rows: Math.max(9, Math.min(13, rows)) };
}

// Returns set of 'row,col' keys that are void (impassable, not drawn)
function getVoidMask(shape: ArenaShape, rows: number, cols: number): Set<string> {
  const voids = new Set<string>();
  const add = (r: number, c: number) => voids.add(`${r},${c}`);
  if (shape === 'corridor') {
    // A walkway three tiles wide running top to bottom, like a gantry between platforms
    const keepMin = Math.floor((cols - 3) / 2);
    const keepMax = keepMin + 2;
    for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) if (c < keepMin || c > keepMax) add(r, c);
  } else if (shape === 'l_shape') {
    // One corner of the deck has collapsed into the sea
    const cutRows = Math.floor(rows * 0.45);
    const cutCols = Math.floor(cols * 0.5);
    const left = Math.random() < 0.5;
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
  const roll = Math.random();
  if (bossLevel < 3 || roll < 0.45) return 'open';
  if (bossLevel < 5 || roll < 0.65) return 'corridor';
  if (bossLevel < 7 || roll < 0.82) return 'l_shape';
  return 'cross';
}

function randomOf<T>(arr: T[]): T { return arr[Math.floor(Math.random() * arr.length)]; }

export function generateBattlefield(bossLevel: number): CombatGrid {
  const { rows, cols } = generateGridSize(bossLevel);
  const shape = pickShape(bossLevel);
  const voidSet = getVoidMask(shape, rows, cols);

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
  const numObstacles = Math.round(walkable * (0.08 + progress * 0.06) + Math.random() * 2);
  const numHazards = bossLevel < 2 ? 0 : Math.round(walkable * (0.02 + progress * 0.04) + Math.random());

  const place = (count: number, make: () => TileData, mustStayConnected: boolean) => {
    let n = 0;
    for (let attempts = 0; n < count && attempts < count * 25; attempts++) {
      // Keep the two spawn rows clear so nobody starts boxed in
      const r = 1 + Math.floor(Math.random() * (rows - 2));
      const c = Math.floor(Math.random() * cols);
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
    rows: 7, cols: 6,
    playerPosition: { row: 6, col: 2 },
    bossPosition: { row: 0, col: 3 },
    tiles: Array.from({ length: 7 }, () => Array.from({ length: 6 }, () => ({ type: 'empty' as const }))),
  };
}
