import type { TilePosition, CombatGrid } from './types';

export function isValidMove(from: TilePosition, to: TilePosition, moveRange: number = 1): boolean {
const rowDiff = Math.abs(to.row - from.row);
const colDiff = Math.abs(to.col - from.col);
// Chebyshev distance: max of row/col diffs. Allows diagonal moves within range.
const chebyshev = Math.max(rowDiff, colDiff);
return chebyshev <= moveRange && chebyshev > 0;
}

export function isTileOccupied(position: TilePosition, grid: CombatGrid): boolean {
return (grid.playerPosition.row === position.row && grid.playerPosition.col === position.col) ||
(grid.bossPosition.row === position.row && grid.bossPosition.col === position.col);
}

export function isWithinBounds(position: TilePosition, grid: CombatGrid): boolean {
return position.row >= 0 && position.row < grid.rows &&
position.col >= 0 && position.col < grid.cols;
}

export function isTileBlocked(position: TilePosition, grid: CombatGrid): boolean {
if (!isWithinBounds(position, grid)) return true;
if (!grid.tiles) return false;

const tile = grid.tiles[position.row]?.[position.col];
return tile?.type === 'obstacle';
}

export function isTileHazard(position: TilePosition, grid: CombatGrid): boolean {
if (!isWithinBounds(position, grid)) return false;
if (!grid.tiles) return false;

const tile = grid.tiles[position.row]?.[position.col];
return tile?.type === 'hazard';
}

export function getHazardDamage(position: TilePosition, grid: CombatGrid): number {
if (!isTileHazard(position, grid)) return 0;
return grid.tiles[position.row]?.[position.col]?.hazardDamage || 0;
}