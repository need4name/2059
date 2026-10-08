import { useCombat } from '@/lib/stores/useCombat';
import { useInventory } from '@/lib/stores/useInventory';
import { useAugmentTrees } from '@/lib/stores/useAugmentTrees';
import type { TilePosition } from '@/lib/combat/types';
import { getHitTiles, ATTACK_PATTERNS } from '@/lib/combat/patterns';
import { CLASS_DEFINITIONS } from '@/lib/combat/actions';
import { isValidMove, isTileOccupied, isTileBlocked } from '@/lib/combat/movement';

export function TileGrid() {
const {
grid, phase, moveTentatively, undoMove, originalPosition,
selectedAction, playerClass, player, boss,
getTotalSkillBonus, bossDefenseBoost, hasMoved, playerHeat
} = useCombat();
const { equippedAugmentations } = useInventory();
const { getTreeStatBonuses } = useAugmentTrees();

if (phase !== 'player_turn') return null;

// Read moveRange from augment trees
const equippedSlots = Object.keys(equippedAugmentations).filter(
s => (equippedAugmentations as any)[s] !== null
) as any[];
const treeBonus = getTreeStatBonuses(equippedSlots);
const moveRange = 1 + (treeBonus.moveRange ?? 0);

// ── Attack pattern helpers ──────────────────────────────────────────────────

const getPatternType = () => {
if (!selectedAction) return null;
if (selectedAction.type === 'brace') return null;
return (selectedAction as any).attackPattern
?? (selectedAction.type === 'special'
? (CLASS_DEFINITIONS[playerClass]?.specialAbility?.attackPattern ?? 'ranged')
: 'melee_long');
};

// Tiles the attack WILL hit given current positions.
// Sweep/area patterns show their full footprint regardless of boss distance.
const SWEEP_PATTERNS = new Set(['melee', 'aoe', 'sweep_arc']);

const getHitTileSet = (): Set<string> => {
const pattern = getPatternType();
if (!pattern) return new Set();
try {
if (SWEEP_PATTERNS.has(pattern)) {
// Use any adjacent tile as the target -- sweep patterns ignore target direction
// and always return their full area. Pick right, or up if at right edge.
const pp = grid.playerPosition;
const adj = pp.col < grid.cols - 1
? { row: pp.row, col: pp.col + 1 }
: { row: Math.max(0, pp.row - 1), col: pp.col };
const tiles = getHitTiles(pp, adj, pattern, grid);
return new Set(tiles.map((t: TilePosition) => `${t.row}-${t.col}`));
}
const tiles = getHitTiles(grid.playerPosition, grid.bossPosition, pattern, grid);
return new Set(tiles.map((t: TilePosition) => `${t.row}-${t.col}`));
} catch { return new Set(); }
};

// All tiles reachable by this pattern from player (shape footprint preview)
const getReachableTileSet = (): Set<string> => {
const pattern = getPatternType();
if (!pattern) return new Set();
const reachable = new Set<string>();
for (let r = 0; r < grid.rows; r++) {
for (let c = 0; c < grid.cols; c++) {
try {
const tiles = getHitTiles(grid.playerPosition, { row: r, col: c }, pattern, grid);
if (tiles.length > 0) reachable.add(`${r}-${c}`);
} catch { /* skip */ }
}
}
return reachable;
};

const hitTiles     = getHitTileSet();
const reachable    = getReachableTileSet();
const patternType  = getPatternType();
const patternLabel = patternType ? ATTACK_PATTERNS[patternType]?.name : null;

// ── Damage preview ──────────────────────────────────────────────────────────

const getPreviewDamage = (): number | null => {
if (!selectedAction || selectedAction.type === 'brace') return null;
if (!hitTiles.has(`${grid.bossPosition.row}-${grid.bossPosition.col}`)) return null;

const skillBonus = getTotalSkillBonus();
let baseDamage = (player.physicalAttack + player.structuralAttack) + (selectedAction.damage || 0);
if (player.currentHp === player.maxHp && skillBonus.firstStrikeBonus > 0) {
baseDamage *= (1 + skillBonus.firstStrikeBonus);
}
const effectiveDefense = Math.max(0, (boss.physicalDefense + boss.structuralDefense) + bossDefenseBoost);
let damage = Math.max(1, baseDamage - effectiveDefense);
const critMultiplier = 1 + (skillBonus.critChance * skillBonus.critDamage);
damage *= critMultiplier;
return Math.floor(damage);

};

const previewDamage = getPreviewDamage();

// ── Movement ────────────────────────────────────────────────────────────────

const canMoveToTile = (row: number, col: number): boolean => {
if (!originalPosition) return false;
if (playerHeat >= 100) return false;  // overheated: movement locked
const pos = { row, col };
return isValidMove(originalPosition, pos, moveRange) &&
!isTileOccupied(pos, grid) &&
!isTileBlocked(pos, grid);
};

// ── Tile styling ────────────────────────────────────────────────────────────

const getTileClass = (row: number, col: number): string => {
const tile     = grid.tiles?.[row]?.[col];
const isPlayer = grid.playerPosition.row === row && grid.playerPosition.col === col;
const isBoss   = grid.bossPosition.row   === row && grid.bossPosition.col   === col;
const isObs    = tile?.type === 'obstacle';
const isHaz    = tile?.type === 'hazard';
const isVoid   = tile?.type === 'void';
const isValid  = canMoveToTile(row, col);
const key      = `${row}-${col}`;
const willHit  = hitTiles.has(key);
const inReach  = reachable.has(key);

if (isVoid)   return 'bg-transparent border-transparent opacity-0 pointer-events-none';
if (isPlayer) return 'bg-cyan-700 border-cyan-400 shadow-cyan-500/40 scale-105';
if (isObs)    return 'bg-amber-900/80 border-amber-600/50';
if (isHaz)    return 'bg-orange-700/60 border-orange-400/50 animate-pulse';
if (isBoss) {
return willHit
? 'bg-red-700 border-red-300 ring-2 ring-red-400/80 animate-pulse'
: 'bg-red-900/70 border-red-500/50';
}
if (willHit) {
// vivid pattern-specific highlight - unmissable on mobile
if (!patternType) return 'bg-orange-600/70 border-orange-300 ring-2 ring-orange-400/80';
if (patternType === 'melee' || patternType === 'aoe' || patternType === 'sweep_arc')
return 'bg-amber-600/70 border-amber-300 ring-2 ring-amber-400/80';
if (patternType === 'diagonal_cross')
return 'bg-teal-600/70 border-teal-300 ring-2 ring-teal-400/80';
if (patternType === 'lunge' || patternType === 'charge' || patternType === 'knockback')
return 'bg-purple-600/70 border-purple-300 ring-2 ring-purple-400/80';
return 'bg-red-600/70 border-red-300 ring-2 ring-red-400/80';
}
if (inReach && patternType) {
// Footprint glow - brighter than before, still distinct from willHit
if (patternType === 'melee' || patternType === 'aoe' || patternType === 'sweep_arc')
return 'bg-amber-900/40 border-amber-600/50';
if (patternType === 'diagonal_cross')
return 'bg-teal-900/40 border-teal-600/50';
if (patternType === 'lunge' || patternType === 'charge' || patternType === 'knockback')
return 'bg-purple-900/40 border-purple-600/50';
return 'bg-red-900/30 border-red-700/50';
}
if (isValid)  return 'bg-blue-700/25 border-blue-400/40 hover:bg-blue-600/40 cursor-pointer active:scale-95';
return 'bg-slate-900/30 border-slate-700/25 opacity-40';

};

return (

<div className="flex flex-col items-center gap-2 py-1">
{/* Status label */}
<div className="h-5 flex items-center justify-center">
{selectedAction?.type === 'brace' ? (
<span className="text-xs font-mono text-cyan-500/70 tracking-wider">
BRACE · DEFENSE MODE
</span>
) : selectedAction && patternLabel ? (
<span className="text-xs font-mono tracking-wider flex items-center gap-2" style={{
  color: patternType === 'melee' || patternType === 'sweep_arc' || patternType === 'aoe' ? '#fbbf24' :
         patternType === 'diagonal_cross' ? '#2dd4bf' :
         patternType === 'lunge' || patternType === 'charge' || patternType === 'knockback' ? '#c084fc' :
         '#f87171'
}}>
<span className="w-2 h-2 rounded-full flex-shrink-0" style={{
  backgroundColor: patternType === 'melee' || patternType === 'sweep_arc' || patternType === 'aoe' ? '#fbbf24' :
                   patternType === 'diagonal_cross' ? '#2dd4bf' :
                   patternType === 'lunge' || patternType === 'charge' || patternType === 'knockback' ? '#c084fc' :
                   '#f87171'
}} />
{selectedAction.name.toUpperCase()} · {patternLabel.toUpperCase()}
{previewDamage !== null && (
<span className="text-red-400/80 ml-1">~{previewDamage}</span>
)}
</span>
) : (
<span className="text-xs font-mono text-slate-600 tracking-wider">
{hasMoved ? 'POSITION SET' : 'TAP TO REPOSITION'}
</span>
)}
</div>

{/* Grid */}

  <div className="flex flex-col gap-1.5">
    {Array.from({ length: grid.rows }).map((_, row) => (
      <div key={row} className="flex gap-1.5 justify-center">
        {Array.from({ length: grid.cols }).map((_, col) => {
          const tile    = grid.tiles?.[row]?.[col];
          const isP     = grid.playerPosition.row === row && grid.playerPosition.col === col;
          const isB     = grid.bossPosition.row   === row && grid.bossPosition.col   === col;
          const isObs   = tile?.type === 'obstacle';
          const isHaz   = tile?.type === 'hazard';
          const isVoid  = tile?.type === 'void';
          const willHit = hitTiles.has(`${row}-${col}`);
          const showDmg = isB && willHit && previewDamage !== null;

return (
<button
key={`${row}-${col}`}
onClick={() => !isVoid && canMoveToTile(row, col) && moveTentatively({ row, col })}
disabled={isVoid || !canMoveToTile(row, col)}
className={`w-14 h-14 rounded-sm border-2 flex flex-col items-center justify-center transition-all duration-150 relative font-mono ${getTileClass(row, col)}`}

>
{!isVoid && isP && <span className="text-cyan-100 font-black text-base leading-none">P</span>}
{!isVoid && isB && (
<>
<span className="text-red-100 font-black text-base leading-none">B</span>
{showDmg && (
<span className="absolute -top-2.5 left-1/2 -translate-x-1/2 bg-red-600 text-white text-xs font-black px-1.5 py-0.5 rounded-sm border border-red-300 shadow z-10 whitespace-nowrap">
-{previewDamage}
</span>
)}
</>
)}
{!isVoid && isObs && <span className="text-lg leading-none">{tile?.icon ?? '▪'}</span>}
{!isVoid && isHaz && !isP && !isB && <span className="text-lg leading-none">{tile?.icon ?? '⚠'}</span>}
{!isVoid && willHit && !isB && !isObs && !isHaz && !isP && (
<span className="text-white/80 text-lg leading-none select-none">
{patternType === 'melee' || patternType === 'sweep_arc' ? '◉' :
patternType === 'diagonal_cross' ? '◈' :
patternType === 'aoe' ? '✦' :
patternType === 'lunge' || patternType === 'charge' ? '▶' :
patternType === 'knockback' ? '»' :
patternType === 'ranged' ? '◎' : '●'}
</span>
)}
</button>
);
})}

  </div>
))}

  </div>

{/* Undo move */}
{hasMoved && (
<button
onClick={undoMove}
className="text-xs font-mono text-amber-500/60 hover:text-amber-400 tracking-wider transition-colors mt-0.5"

>
↺ UNDO MOVE
</button>
)}

</div>

);
}