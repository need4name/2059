import { AttackPattern, TilePosition, CombatGrid, AttackPatternType } from './types';

// Helper to check if position is valid in grid
function isValidPosition(pos: TilePosition, grid: CombatGrid): boolean {
return pos.row >= 0 && pos.row < grid.rows && pos.col >= 0 && pos.col < grid.cols;
}

// Calculate direction from attacker to target
function getDirection(from: TilePosition, to: TilePosition): { row: number; col: number } {
const rowDiff = to.row - from.row;
const colDiff = to.col - from.col;

// Normalize to -1, 0, or 1
return {
row: rowDiff === 0 ? 0 : rowDiff / Math.abs(rowDiff),
col: colDiff === 0 ? 0 : colDiff / Math.abs(colDiff),
};
}

// Calculate Manhattan distance
function getDistance(from: TilePosition, to: TilePosition): number {
return Math.abs(from.row - to.row) + Math.abs(from.col - to.col);
}

// Each shape has one job and one way to beat it (docs/DESIGN.md, Attack shapes).
// getTargetTiles(from, to) returns the tiles an attack aimed at `to` strikes,
// or [] when `to` can't be aimed at from `from`.

const cheb = (a: TilePosition, b: TilePosition) => Math.max(Math.abs(a.row - b.row), Math.abs(a.col - b.col));
const sign = (n: number) => (n === 0 ? 0 : n / Math.abs(n));
const inside = (tiles: TilePosition[], grid: CombatGrid) => tiles.filter(p => isValidPosition(p, grid));
/** On a row, column or diagonal through `from`? Returns the unit step, or null. */
function lineStep(from: TilePosition, to: TilePosition): { row: number; col: number } | null {
  const dr = to.row - from.row, dc = to.col - from.col;
  if (dr === 0 && dc === 0) return null;
  if (dr !== 0 && dc !== 0 && Math.abs(dr) !== Math.abs(dc)) return null;
  return { row: sign(dr), col: sign(dc) };
}
/** Nothing solid (cover, void, a body) on the tiles strictly between from and to. */
function clearLine(from: TilePosition, to: TilePosition, grid: CombatGrid): boolean {
  const step = lineStep(from, to);
  if (!step) return false;
  const bodies = [grid.playerPosition, grid.bossPosition, ...(grid.occupied ?? [])];
  for (let p = { row: from.row + step.row, col: from.col + step.col }; p.row !== to.row || p.col !== to.col; p = { row: p.row + step.row, col: p.col + step.col }) {
    const t = grid.tiles?.[p.row]?.[p.col];
    if (t?.type === 'obstacle' || t?.type === 'void') return false;
    if (bodies.some(b => b.row === p.row && b.col === p.col)) return false;
  }
  return true;
}
const line = (from: TilePosition, step: { row: number; col: number }, n: number) =>
  Array.from({ length: n }, (_, i) => ({ row: from.row + step.row * (i + 1), col: from.col + step.col * (i + 1) }));

export const ATTACK_PATTERNS: Record<AttackPatternType, AttackPattern> = {
// Strike: the one tile next to the attacker that you're standing on
melee: {
type: 'melee', name: 'Strike', range: 1,
getTargetTiles: (from, to) => (cheb(from, to) === 1 ? [to] : []),
},

// Reach: a straight line of 2 (no diagonals)
melee_long: {
type: 'melee_long', name: 'Reach', range: 2,
getTargetTiles: (from, to, grid) => {
  const step = lineStep(from, to);
  const d = cheb(from, to);
  if (!step || (step.row !== 0 && step.col !== 0) || d > 2) return [];
  return inside(line(from, step, d), grid);
},
},

// X-burst: the four diagonals, two deep, all at once
diagonal_cross: {
type: 'diagonal_cross', name: 'X-burst', range: 2,
getTargetTiles: (from, to, grid) => {
  const step = lineStep(from, to);
  if (!step || step.row === 0 || step.col === 0 || cheb(from, to) > 2) return [];
  return inside([[-1, -1], [-1, 1], [1, -1], [1, 1]].flatMap(([r, c]) => line(from, { row: r, col: c }, 2)), grid);
},
},

// Cone: a widening wedge, 1 tile then 3, along a row or column
cone: {
type: 'cone', name: 'Cone', range: 2,
getTargetTiles: (from, to, grid) => {
  const dr = to.row - from.row, dc = to.col - from.col;
  if (dr === 0 && dc === 0) return [];
  // Point the cone along the longer axis
  const dir = Math.abs(dr) >= Math.abs(dc) ? { row: sign(dr), col: 0 } : { row: 0, col: sign(dc) };
  const side = dir.row === 0 ? { row: 1, col: 0 } : { row: 0, col: 1 };
  const a = { row: from.row + dir.row, col: from.col + dir.col };
  const b = { row: from.row + dir.row * 2, col: from.col + dir.col * 2 };
  const tiles = inside([a, b, { row: b.row + side.row, col: b.col + side.col }, { row: b.row - side.row, col: b.col - side.col }], grid);
  return tiles.some(t => t.row === to.row && t.col === to.col) ? tiles : [];
},
},

// Blast: a 3x3 square centred on a tile up to 3 steps away (heavies only)
aoe: {
type: 'aoe', name: 'Blast', range: 3,
getTargetTiles: (from, to, grid) => {
  if (getDistance(from, to) > 3) return [];
  const out: TilePosition[] = [];
  for (let r = -1; r <= 1; r++) for (let c = -1; c <= 1; c++) out.push({ row: to.row + r, col: to.col + c });
  return inside(out, grid);
},
},

// Shot: one tile 2-4 away along a row, column or diagonal, with nothing in the way
ranged: {
type: 'ranged', name: 'Shot', range: 4,
getTargetTiles: (from, to, grid) => {
  const d = cheb(from, to);
  return d >= 2 && d <= 4 && clearLine(from, to, grid) ? [to] : [];
},
},

// Sweep: a 3-tile arc in front of the attacker
sweep_arc: {
type: 'sweep_arc', name: 'Sweep', range: 1,
getTargetTiles: (from, to, grid) => {
  if (cheb(from, to) !== 1) return [];
  const dir = getDirection(from, to);
  const c: TilePosition[] = [{ row: from.row + dir.row, col: from.col + dir.col }];
  if (dir.row === 0) { c.push({ row: from.row + 1, col: from.col + dir.col }, { row: from.row - 1, col: from.col + dir.col }); }
  else if (dir.col === 0) { c.push({ row: from.row + dir.row, col: from.col + 1 }, { row: from.row + dir.row, col: from.col - 1 }); }
  else { c.push({ row: from.row + dir.row, col: from.col }, { row: from.row, col: from.col + dir.col }); }
  return inside(c, grid);
},
},

// Lunge: only the tile exactly 2 away, in any of 8 directions
lunge: {
type: 'lunge', name: 'Lunge', range: 2,
getTargetTiles: (from, to) => (lineStep(from, to) && cheb(from, to) === 2 ? [to] : []),
},

// Knockback: a straight line of up to 3; the one hit is pushed a tile back
knockback: {
type: 'knockback', name: 'Knockback', range: 3,
getTargetTiles: (from, to, grid) => {
  const step = lineStep(from, to);
  const d = cheb(from, to);
  if (!step || (step.row !== 0 && step.col !== 0) || d > 3) return [];
  return inside(line(from, step, d), grid);
},
},

// Charge: a lane of 2-3 tiles toward the target (heavies lock it in place)
charge: {
type: 'charge', name: 'Charge', range: 3,
getTargetTiles: (from, to, grid) => {
  const step = lineStep(from, to);
  const d = cheb(from, to);
  if (!step || d < 2 || d > 3) return [];
  return inside(line(from, step, 3), grid);
},
},

// Ring: every tile exactly 2 away, all round
ring: {
type: 'ring', name: 'Ring', range: 2,
getTargetTiles: (from, to, grid) => {
  if (cheb(from, to) !== 2) return [];
  const out: TilePosition[] = [];
  for (let r = -2; r <= 2; r++) for (let c = -2; c <= 2; c++) if (Math.max(Math.abs(r), Math.abs(c)) === 2) out.push({ row: from.row + r, col: from.col + c });
  return inside(out, grid);
},
},

// Beam: the whole row or column toward the target, to the edge of the arena
beam: {
type: 'beam', name: 'Beam', range: 12,
getTargetTiles: (from, to, grid) => {
  const step = lineStep(from, to);
  if (!step || (step.row !== 0 && step.col !== 0)) return [];
  return inside(line(from, step, Math.max(grid.rows, grid.cols)), grid);
},
},

};

// Helper to check if an attack can hit a target
export function canHitTarget(
attackerPos: TilePosition,
targetPos: TilePosition,
patternType: AttackPatternType,
grid: CombatGrid
): boolean {
const pattern = ATTACK_PATTERNS[patternType];
const targetTiles = pattern.getTargetTiles(attackerPos, targetPos, grid);

return targetTiles.some(
tile => tile.row === targetPos.row && tile.col === targetPos.col
);
}

// Get all tiles that would be hit by an attack
export function getHitTiles(
attackerPos: TilePosition,
targetPos: TilePosition,
patternType: AttackPatternType,
grid: CombatGrid
): TilePosition[] {
const pattern = ATTACK_PATTERNS[patternType];
return pattern.getTargetTiles(attackerPos, targetPos, grid);
}