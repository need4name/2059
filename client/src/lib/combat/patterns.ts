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

export const ATTACK_PATTERNS: Record<AttackPatternType, AttackPattern> = {
// Basic melee - hits 1 adjacent tile (orthogonal or diagonal)
melee: {
type: 'melee',
name: 'Full Sweep',
range: 1,
// Sweeps all 8 adjacent tiles simultaneously. Attack fires if boss is within range 1.
// Preview always shows the full ring of adjacent tiles in orange.
getTargetTiles: (from, to, grid) => {
const rowDiff = Math.abs(from.row - to.row);
const colDiff = Math.abs(from.col - to.col);
const maxDist = Math.max(rowDiff, colDiff);
// Only activates when targeting within range 1
if (maxDist > 1 || maxDist === 0) return [];
// Return ALL 8 adjacent tiles (the full sweep area)
const offsets = [[-1,-1],[-1,0],[-1,1],[0,-1],[0,1],[1,-1],[1,0],[1,1]];
return offsets
.map(([dr,dc]) => ({ row: from.row + dr, col: from.col + dc }))
.filter(p => isValidPosition(p, grid));
},
},

// Long melee - hits up to 2 tiles in a straight line (no diagonals)
melee_long: {
type: 'melee_long',
name: 'Long Reach',
range: 2,
getTargetTiles: (from, to, grid) => {
const rowDiff = to.row - from.row;
const colDiff = to.col - from.col;

  // Must be in a straight line (no diagonals)
  if (rowDiff !== 0 && colDiff !== 0) return [];

  const distance = Math.abs(rowDiff) + Math.abs(colDiff);
  if (distance > 2 || distance === 0) return [];

  const tiles: TilePosition[] = [];
  const dir = { row: rowDiff === 0 ? 0 : rowDiff / Math.abs(rowDiff), col: colDiff === 0 ? 0 : colDiff / Math.abs(colDiff) };

  // Add all tiles in the line up to target
  for (let i = 1; i <= distance; i++) {
    tiles.push({ row: from.row + dir.row * i, col: from.col + dir.col * i });
  }

  return tiles;
},

},

// Diagonal cross - hits diagonal tiles up to 2 tiles away
diagonal_cross: {
type: 'diagonal_cross',
name: 'Diagonal Arc',
range: 2,
getTargetTiles: (from, to, grid) => {
const rowDiff = to.row - from.row;
const colDiff = to.col - from.col;

  // Must be diagonal (row and col both non-zero and equal distance)
  if (Math.abs(rowDiff) !== Math.abs(colDiff) || rowDiff === 0) return [];

  const distance = Math.abs(rowDiff);
  if (distance > 2) return [];

  const tiles: TilePosition[] = [];
  const dir = { row: rowDiff / Math.abs(rowDiff), col: colDiff / Math.abs(colDiff) };

  // Add all diagonal tiles in the path
  for (let i = 1; i <= distance; i++) {
    tiles.push({ row: from.row + dir.row * i, col: from.col + dir.col * i });
  }

  return tiles;
},

},

// Cone - hits 3 tiles in a cone shape (1 straight ahead + 2 adjacent)
cone: {
type: 'cone',
name: 'Cone',
range: 2,
getTargetTiles: (from, to, grid) => {
const rowDiff = to.row - from.row;
const colDiff = to.col - from.col;

  // Must be in straight line (not diagonal)
  if (rowDiff !== 0 && colDiff !== 0) return [];

  const distance = Math.abs(rowDiff) + Math.abs(colDiff);
  if (distance > 2 || distance === 0) return [];

  const tiles: TilePosition[] = [];
  const dir = { row: rowDiff === 0 ? 0 : rowDiff / Math.abs(rowDiff), col: colDiff === 0 ? 0 : colDiff / Math.abs(colDiff) };

  // Add main tile
  const mainPos = { row: from.row + dir.row, col: from.col + dir.col };
  if (isValidPosition(mainPos, grid)) {
    tiles.push(mainPos);

    // Add perpendicular adjacent tiles
    if (dir.row === 0) {
      // Horizontal attack - add top and bottom
      const top = { row: mainPos.row - 1, col: mainPos.col };
      const bottom = { row: mainPos.row + 1, col: mainPos.col };
      if (isValidPosition(top, grid)) tiles.push(top);
      if (isValidPosition(bottom, grid)) tiles.push(bottom);
    } else {
      // Vertical attack - add left and right
      const left = { row: mainPos.row, col: mainPos.col - 1 };
      const right = { row: mainPos.row, col: mainPos.col + 1 };
      if (isValidPosition(left, grid)) tiles.push(left);
      if (isValidPosition(right, grid)) tiles.push(right);
    }

    // If distance is 2, also add the second tile in main direction
    if (distance === 2) {
      const secondPos = { row: from.row + dir.row * 2, col: from.col + dir.col * 2 };
      if (isValidPosition(secondPos, grid)) tiles.push(secondPos);
    }
  }

  return tiles;
},

},

// AOE - hits target and surrounding tiles
aoe: {
type: 'aoe',
name: 'Area Effect',
range: 3,
getTargetTiles: (from, to, grid) => {
const dist = getDistance(from, to);
if (dist > 3) return [];

  const tiles: TilePosition[] = [to];

  // Add all adjacent tiles to target
  const offsets = [
    { row: -1, col: 0 },
    { row: 1, col: 0 },
    { row: 0, col: -1 },
    { row: 0, col: 1 },
    { row: -1, col: -1 },
    { row: -1, col: 1 },
    { row: 1, col: -1 },
    { row: 1, col: 1 },
  ];

  for (const offset of offsets) {
    const pos = {
      row: to.row + offset.row,
      col: to.col + offset.col,
    };
    if (isValidPosition(pos, grid)) {
      tiles.push(pos);
    }
  }

  return tiles;
},

},

// Ranged - hits any tile in range
ranged: {
type: 'ranged',
name: 'Ranged',
range: 4,
getTargetTiles: (from, to, grid) => {
const dist = getDistance(from, to);
if (dist >= 2 && dist <= 4) {
return [to];
}
return [];
},
},
// sweep_arc - 180-degree arc in front of attacker (toward target). Range 1.
// Hits up to 3 tiles: the tile directly toward target + both diagonal-adjacent tiles.
sweep_arc: {
type: 'sweep_arc',
name: 'Sweep Arc',
range: 1,
getTargetTiles: (from, to, grid) => {
const dir = getDirection(from, to);
// Primary direction + the two perpendicular diagonals in that half
const candidates: TilePosition[] = [];
if (dir.row !== 0 || dir.col !== 0) {
// straight ahead
candidates.push({ row: from.row + dir.row, col: from.col + dir.col });
// diagonals in the arc
if (dir.row === 0) {
candidates.push({ row: from.row + 1, col: from.col + dir.col });
candidates.push({ row: from.row - 1, col: from.col + dir.col });
} else if (dir.col === 0) {
candidates.push({ row: from.row + dir.row, col: from.col + 1 });
candidates.push({ row: from.row + dir.row, col: from.col - 1 });
} else {
// diagonal direction: add the two orthogonals
candidates.push({ row: from.row + dir.row, col: from.col });
candidates.push({ row: from.row, col: from.col + dir.col });
}
}
return candidates.filter(p => isValidPosition(p, grid));
},
},

// lunge - moves toward target and hits. Range 2. Hits the target tile and
// the tile between (straight or diagonal path).
lunge: {
type: 'lunge',
name: 'Lunge',
range: 2,
getTargetTiles: (from, to, grid) => {
const rowDiff = to.row - from.row;
const colDiff = to.col - from.col;
const dist = Math.max(Math.abs(rowDiff), Math.abs(colDiff));
if (dist === 0 || dist > 2) return [];
const dir = {
row: rowDiff === 0 ? 0 : rowDiff / Math.abs(rowDiff),
col: colDiff === 0 ? 0 : colDiff / Math.abs(colDiff),
};
const tiles: TilePosition[] = [];
for (let i = 1; i <= dist; i++) {
tiles.push({ row: from.row + dir.row * i, col: from.col + dir.col * i });
}
return tiles.filter(p => isValidPosition(p, grid));
},
},

// knockback - straight-line hit that also marks the tile behind the target
// (used for displacement UI). Range 1-3 straight only.
knockback: {
type: 'knockback',
name: 'Knockback',
range: 3,
getTargetTiles: (from, to, grid) => {
const rowDiff = to.row - from.row;
const colDiff = to.col - from.col;
if (rowDiff !== 0 && colDiff !== 0) return []; // straight lines only
const dist = Math.abs(rowDiff) + Math.abs(colDiff);
if (dist === 0 || dist > 3) return [];
const dir = {
row: rowDiff === 0 ? 0 : rowDiff / Math.abs(rowDiff),
col: colDiff === 0 ? 0 : colDiff / Math.abs(colDiff),
};
const tiles: TilePosition[] = [];
for (let i = 1; i <= dist; i++) {
tiles.push({ row: from.row + dir.row * i, col: from.col + dir.col * i });
}
return tiles.filter(p => isValidPosition(p, grid));
},
},

// charge - attacker closes distance, hits entire path. Range 2-3, any direction.
charge: {
type: 'charge',
name: 'Charge',
range: 3,
getTargetTiles: (from, to, grid) => {
const rowDiff = to.row - from.row;
const colDiff = to.col - from.col;
const dist = Math.max(Math.abs(rowDiff), Math.abs(colDiff));
if (dist < 2 || dist > 3) return [];
const dir = {
row: rowDiff === 0 ? 0 : rowDiff / Math.abs(rowDiff),
col: colDiff === 0 ? 0 : colDiff / Math.abs(colDiff),
};
const tiles: TilePosition[] = [];
for (let i = 1; i <= dist; i++) {
tiles.push({ row: from.row + dir.row * i, col: from.col + dir.col * i });
}
return tiles.filter(p => isValidPosition(p, grid));
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