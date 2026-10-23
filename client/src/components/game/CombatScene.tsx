import { useEffect, useRef, useState, useMemo } from 'react';
import { useCombat } from '@/lib/stores/useCombat';
import { drawDamageNumber, drawFloatingMessage, FloatingMessageType } from '@/lib/rendering/sprites';
import { drawWanderer, drawDrunkard, SpriteAnimator, AnimationState } from '@/lib/rendering/pixelSprites';
import { ATTACK_PATTERNS, canHitTarget } from '@/lib/combat/patterns';
import { CLASS_DEFINITIONS, ENEMY_GRADES } from '@/lib/combat/actions';
import { getReachableTiles } from '@/lib/combat/grid';
import * as Fight from '@/lib/engine/fight';
import { drawSea, drawDeckTile, drawHazard, drawObstacle, drawStatus, drawSwimming } from '@/lib/rendering/board';
import { drawFigure } from '@/lib/rendering/figures';
import { currentChapter } from '@/lib/combat/chapters';
import type { AttackPatternType, TilePosition, CombatGrid } from '@/lib/combat/types';

// Helper to get all tiles that can be TARGETED from a position with a given pattern
// Uses canHitTarget to identify tiles the player can select, NOT spillover tiles
function getTargetableTiles(
from: TilePosition,
patternType: AttackPatternType,
grid: CombatGrid
): Set<string> {
const targetable = new Set<string>();

// Check every tile on the grid as a potential target
for (let row = 0; row < grid.rows; row++) {
for (let col = 0; col < grid.cols; col++) {
const targetPos = { row, col };

// canHitTarget returns true if this tile can be selected and will be hit
if (canHitTarget(from, targetPos, patternType, grid)) {
targetable.add(`${row},${col}`);
}
}

}

return targetable;
}

// Rounded rectangle path for the softer tile look
function roundRectPath(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
const rr = Math.min(r, w / 2, h / 2);
ctx.beginPath();
ctx.moveTo(x + rr, y);
ctx.arcTo(x + w, y, x + w, y + h, rr);
ctx.arcTo(x + w, y + h, x, y + h, rr);
ctx.arcTo(x, y + h, x, y, rr);
ctx.arcTo(x, y, x + w, y, rr);
ctx.closePath();
}

interface DamageEffect {
id: string;
damage: number;
x: number;
y: number;
startTime: number;
}

interface FloatingEffect {
id: string;
message: string;
type: FloatingMessageType;
x: number;
y: number;
startTime: number;
duration: number;
}

// Movement animation state
interface MovementAnim {
fromRow: number;
fromCol: number;
toRow: number;
toCol: number;
startTime: number;
duration: number; // ms
}

// Ease-out cubic for smooth deceleration
function easeOutCubic(t: number): number {
return 1 - Math.pow(1 - t, 3);
}

export function CombatScene() {
const canvasRef = useRef<HTMLCanvasElement>(null);
const { player, boss, phase, grid, playerClass, combatLog, selectedAction, aim, inputLocked, originalPosition, playerMoveRange, foes, target, fightId, reflexMoveOpen, perks, allies, allyMoveMode, playerBurning, playerStunned } = useCombat();
const living = foes.map((f, i) => ({ f, i })).filter(x => x.f.unit.currentHp > 0);
const charging = living.filter(x => x.f.pendingAction);
const damageEffectsRef = useRef<DamageEffect[]>([]);
const floatingEffectsRef = useRef<FloatingEffect[]>([]);
const animationRef = useRef<number>();
const prevPlayerHp = useRef(player.currentHp);
const prevPhase = useRef(phase);
const prevLogLength = useRef(combatLog.length);
const [hoveredTile, setHoveredTile] = useState<{ row: number; col: number } | null>(null);

// Movement animation state for smooth sliding
const playerMoveAnim = useRef<MovementAnim | null>(null);
const prevPlayerPos = useRef({ row: grid.playerPosition.row, col: grid.playerPosition.col });

// Sprite animators for characters
// Player has normal animation speed, drunkard has slow lazy idle
const playerAnimator = useRef(new SpriteAnimator(false));
const allyAnimator = useRef(new SpriteAnimator(false));

// Each enemy has its own animator, slide animation and damage tracking
interface FoeVisual { animator: SpriteAnimator; moveAnim: MovementAnim | null; prevPos: { row: number; col: number }; prevHp: number }
const foeVisuals = useRef(new Map<number, FoeVisual>());
const foeVisual = (i: number) => {
let v = foeVisuals.current.get(i);
if (!v) {
const f = useCombat.getState().foes[i];
v = { animator: new SpriteAnimator(true), moveAnim: null, prevPos: f ? { ...f.pos } : { row: 0, col: 0 }, prevHp: f?.unit.currentHp ?? 0 };
foeVisuals.current.set(i, v);
}
return v;
};
useEffect(() => { foeVisuals.current.clear(); }, [fightId]);
const foeSignature = foes.map(f => `${f.pos.row},${f.pos.col},${f.unit.currentHp}`).join('|');

// Helper function to convert grid position to screen position (rectangular grid)
// Mobile-first: accounts for HUD at top (~60px) and action bar at bottom (~140px)
// The walkable part of the arena (void tiles aren't drawn), so narrow shapes get bigger tiles
const bounds = useMemo(() => {
let r0 = grid.rows, r1 = -1, c0 = grid.cols, c1 = -1;
for (let r = 0; r < grid.rows; r++) for (let c = 0; c < grid.cols; c++) {
if (grid.tiles?.[r]?.[c]?.type === 'void') continue;
r0 = Math.min(r0, r); r1 = Math.max(r1, r); c0 = Math.min(c0, c); c1 = Math.max(c1, c);
}
return r1 < 0 ? { r0: 0, c0: 0, rows: grid.rows, cols: grid.cols } : { r0, c0, rows: r1 - r0 + 1, cols: c1 - c0 + 1 };
}, [grid.tiles, grid.rows, grid.cols]);

const gridToScreen = (row: number, col: number, canvasWidth: number, canvasHeight: number) => {
// The canvas sits between the HUD and the action bar: small margins, room for labels above units
const topReserved = 18;
const bottomReserved = 12;
const availableHeight = canvasHeight - topReserved - bottomReserved;
// Keep clear of the heat gauge on the left edge
const leftReserved = 46;
const rightReserved = 8;
const maxTileSizeByWidth = (canvasWidth - leftReserved - rightReserved) / bounds.cols;
const maxTileSizeByHeight = availableHeight / bounds.rows;
const tileSize = Math.min(84, maxTileSizeByWidth, maxTileSizeByHeight);
const tileW = tileSize;
const tileH = tileSize;

// Centre the walkable shape in the space left over
const gridWidth = bounds.cols * tileW;
const gridHeight = bounds.rows * tileH;
const offsetX = leftReserved + (canvasWidth - leftReserved - rightReserved - gridWidth) / 2;
const offsetY = topReserved + (availableHeight - gridHeight) / 2;

const x = offsetX + (col - bounds.c0) * tileW + tileW / 2;
const y = offsetY + (row - bounds.r0) * tileH + tileH / 2;

return { x, y, tileW, tileH };

};

// Track damage and create effects
useEffect(() => {
const canvas = canvasRef.current;
if (!canvas || !canvas.width || !canvas.height) return;

const width = canvas.width / (window.devicePixelRatio || 1);
const height = canvas.height / (window.devicePixelRatio || 1);

if (player.currentHp < prevPlayerHp.current) {
const damage = prevPlayerHp.current - player.currentHp;
const pos = gridToScreen(grid.playerPosition.row, grid.playerPosition.col, width, height);

damageEffectsRef.current.push({
id: Math.random().toString(),
damage,
x: pos.x,
y: pos.y - 50,
startTime: Date.now(),
});
}
prevPlayerHp.current = player.currentHp;

foes.forEach((f, i) => {
const v = foeVisual(i);
if (f.unit.currentHp < v.prevHp) {
const pos = gridToScreen(f.pos.row, f.pos.col, width, height);
damageEffectsRef.current.push({ id: Math.random().toString(), damage: v.prevHp - f.unit.currentHp, x: pos.x, y: pos.y - 50, startTime: Date.now() });
v.animator.setState('hurt');
}
v.prevHp = f.unit.currentHp;
});

}, [player.currentHp, foeSignature, grid.playerPosition, grid.cols, grid.rows]);

// Track phase changes and combat log for floating messages
useEffect(() => {
const canvas = canvasRef.current;
if (!canvas || !canvas.width || !canvas.height) return;

const width = canvas.width / (window.devicePixelRatio || 1);
const height = canvas.height / (window.devicePixelRatio || 1);
const centerX = width / 2;
const centerY = height / 3;

// Handle combat resets: when log length decreases, reset our tracking
if (combatLog.length < prevLogLength.current) {
prevLogLength.current = combatLog.length;
floatingEffectsRef.current = []; // Clear old effects on reset
}

// Phase change messages
if (phase !== prevPhase.current) {
// Clear effects when entering a new combat
if (phase === 'player_turn' && prevPhase.current === 'menu') {
floatingEffectsRef.current = [];
}

if (phase === 'player_turn' && prevPhase.current === 'enemy_turn') {
floatingEffectsRef.current.push({
id: Math.random().toString(),
message: 'YOUR TURN!',
type: 'info',
x: centerX,
y: centerY,
startTime: Date.now(),
duration: 1200,
});
} else if (phase === 'victory') {
floatingEffectsRef.current.push({
id: Math.random().toString(),
message: 'VICTORY!',
type: 'victory',
x: centerX,
y: centerY,
startTime: Date.now(),
duration: 2500,
});
} else if (phase === 'defeat') {
floatingEffectsRef.current.push({
id: Math.random().toString(),
message: 'DEFEAT!',
type: 'defeat',
x: centerX,
y: centerY,
startTime: Date.now(),
duration: 2500,
});
}
prevPhase.current = phase;
}

// Check for new combat log messages
if (combatLog.length > prevLogLength.current) {
const newLogs = combatLog.slice(prevLogLength.current);

for (const log of newLogs) {
// Show critical/important messages as floating text
if (log.type === 'critical' && !log.message.includes('Victory') && !log.message.includes('Defeat')) {
floatingEffectsRef.current.push({
id: Math.random().toString(),
message: 'CRITICAL HIT!',
type: 'critical',
x: centerX,
y: centerY + 40,
startTime: Date.now(),
duration: 1000,
});
} else if (log.type === 'malfunction') {
const playerPos = gridToScreen(grid.playerPosition.row, grid.playerPosition.col, width, height);
floatingEffectsRef.current.push({
id: Math.random().toString(),
message: 'MALFUNCTION',
type: 'critical',
x: playerPos.x,
y: playerPos.y - 60,
startTime: Date.now(),
duration: 1500,
});
} else if (log.type === 'heal') {
const healMatch = log.message.match(/healed? (?:for )?(\d+)/i);
if (healMatch) {
const playerPos = gridToScreen(grid.playerPosition.row, grid.playerPosition.col, width, height);
floatingEffectsRef.current.push({
id: Math.random().toString(),
message: `+${healMatch[1]} HP`,
type: 'heal',
x: playerPos.x,
y: playerPos.y - 60,
startTime: Date.now(),
duration: 1200,
});
}
}
}
}

// Always update to current length
prevLogLength.current = combatLog.length;

}, [phase, combatLog.length, grid.playerPosition, grid.cols, grid.rows]);

// Trigger animation states based on combat events
useEffect(() => {
// Detect player taking damage (hurt animation)
if (player.currentHp < prevPlayerHp.current) {
playerAnimator.current.setState('hurt');
}

// Phase-based animations
if (phase === 'enemy_turn') {
foes.forEach((f, i) => { if (f.unit.currentHp > 0) foeVisual(i).animator.setState('attack'); });
} else if (phase === 'player_turn') {
// Both idle
if (playerAnimator.current.getState() !== 'hurt' && playerAnimator.current.getState() !== 'attack') {
playerAnimator.current.setState('idle');
}
foes.forEach((_, i) => { const a = foeVisual(i).animator; if (a.getState() !== 'hurt') a.setState('idle'); });
}

}, [phase, player.currentHp, foeSignature]);

// Trigger player attack animation when action is executed
useEffect(() => {
if (selectedAction && (selectedAction.type === 'attack' || selectedAction.type === 'special')) {
// Attack animation will be triggered when turn ends
} else if (selectedAction?.type === 'defend') {
playerAnimator.current.setState('defend');
}
}, [selectedAction]);

// Detect position changes and trigger smooth movement animations
useEffect(() => {
const MOVE_DURATION = 250; // 250ms for smooth slide

// Check if player position changed
if (prevPlayerPos.current.row !== grid.playerPosition.row ||
prevPlayerPos.current.col !== grid.playerPosition.col) {
playerMoveAnim.current = {
fromRow: prevPlayerPos.current.row,
fromCol: prevPlayerPos.current.col,
toRow: grid.playerPosition.row,
toCol: grid.playerPosition.col,
startTime: Date.now(),
duration: MOVE_DURATION,
};
playerAnimator.current.setState('walk');
prevPlayerPos.current = { row: grid.playerPosition.row, col: grid.playerPosition.col };
}

foes.forEach((f, i) => {
const v = foeVisual(i);
if (v.prevPos.row !== f.pos.row || v.prevPos.col !== f.pos.col) {
v.moveAnim = { fromRow: v.prevPos.row, fromCol: v.prevPos.col, toRow: f.pos.row, toCol: f.pos.col, startTime: Date.now(), duration: MOVE_DURATION };
v.animator.setState('walk');
v.prevPos = { ...f.pos };
}
});

}, [grid.playerPosition.row, grid.playerPosition.col, foeSignature]);

useEffect(() => {
const canvas = canvasRef.current;
if (!canvas) return;

// Setup canvas with pixel-perfect rendering (no smoothing)
const ctx = canvas.getContext('2d');
if (!ctx) return;

// CRITICAL: Disable all image smoothing for crisp pixel art
ctx.imageSmoothingEnabled = false;
(ctx as any).webkitImageSmoothingEnabled = false;
(ctx as any).mozImageSmoothingEnabled = false;
(ctx as any).msImageSmoothingEnabled = false;

let lastWidth = 0;
let lastHeight = 0;

const resize = () => {
const dpr = window.devicePixelRatio || 1;
const rect = canvas.getBoundingClientRect();
canvas.width = rect.width * dpr;
canvas.height = rect.height * dpr;
ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

// Re-apply after resize (some browsers reset this)
ctx.imageSmoothingEnabled = false;
(ctx as any).webkitImageSmoothingEnabled = false;
(ctx as any).mozImageSmoothingEnabled = false;
(ctx as any).msImageSmoothingEnabled = false;

lastWidth = rect.width;
lastHeight = rect.height;
};

resize();

// Observe both canvas and its parent for better mobile support
const resizeObserver = new ResizeObserver(resize);
resizeObserver.observe(canvas);
if (canvas.parentElement) {
resizeObserver.observe(canvas.parentElement);
}

// Zones are worked out once per change, not every frame (they loop over the whole board)
let reachableTiles: Set<string> | null = null;
let currentAttackPattern: AttackPatternType | null = null;
let aimedTiles: Set<string> | null = null;

if (selectedAction && phase === 'player_turn' && (selectedAction.type === 'attack' || selectedAction.type === 'special')) {
// Read attack pattern directly from the action - this is the single source of truth.
// Falls back to class special pattern for 'special' type, then melee_long as last resort.
const classDef = CLASS_DEFINITIONS[playerClass];
currentAttackPattern = (
(selectedAction as any).attackPattern ||
(selectedAction.type === 'special' ? classDef?.specialAbility?.attackPattern : null) ||
'melee_long'
) as AttackPatternType;

// Where it can be aimed (dim), and where the current aim lands (bright)
const fs = useCombat.getState();
reachableTiles = new Set(Fight.aimableTiles(fs, selectedAction, playerClass).map(t => `${t.row},${t.col}`));
if (fs.aim) aimedTiles = new Set(Fight.aimTiles(fs, selectedAction, playerClass, fs.aim).map(t => `${t.row},${t.col}`));

}

// Every tile an enemy can hit on its next turn. Enemies attack before they
// move, so standing outside these at the end of your turn is safe.
const enemyReachableTiles = phase === 'player_turn' ? (() => {
const st = useCombat.getState();
const union = new Set<string>();
for (const { i } of living) Fight.foeThreatTiles(st, i).forEach(k => union.add(k));
return union.size ? union : null;
})() : null;
// Of those, the tiles where the hit also drags or shoves you (a purple edge): mind the water behind you
const enemyShoveTiles = phase === 'player_turn' ? (() => {
const st = useCombat.getState();
const union = new Set<string>();
for (const { i } of living) Fight.foeThreatTiles(st, i, true).forEach(k => union.add(k));
return union;
})() : null;

// Tiles the player (or the ally being moved) can still move to this turn
const allyTiles = allyMoveMode !== null && phase === 'player_turn' && !inputLocked
? (() => { const t = Fight.allyReach(useCombat.getState(), allyMoveMode); if (originalPosition) t.delete(`${originalPosition.row},${originalPosition.col}`); return t; })()
: null;
const moveTiles = allyTiles ?? (phase === 'player_turn' && !inputLocked && !reachableTiles && originalPosition
? (reflexMoveOpen
  ? getReachableTiles(grid.playerPosition, grid, 1, perks.phaseStep)
  : getReachableTiles(originalPosition, { ...grid, playerPosition: originalPosition }, playerMoveRange, perks.phaseStep))
: null);
const moveColor = allyMoveMode !== null ? (allies[allyMoveMode]?.unit.spriteColor ?? '#38d6f0') : null;
// Move tiles that walk away from an enemy beside you (a parting blow): drawn orange
const partingTiles = new Set<string>();
if (moveTiles && allyMoveMode === null && originalPosition) {
  const st = useCombat.getState();
  moveTiles.forEach(k => { const [row, col] = k.split(',').map(Number); if (Fight.partingFoes(st, originalPosition, { row, col }).length) partingTiles.add(k); });
}

const animate = () => {
// Fallback: check if size changed and resize if needed (handles Safari toolbar collapse)
const rect = canvas.getBoundingClientRect();
if (rect.width !== lastWidth || rect.height !== lastHeight) {
resize();
}

// Derive dimensions from canvas buffer size
const dpr = window.devicePixelRatio || 1;
const width = canvas.width / dpr;
const height = canvas.height / dpr;

// === BACKDROP: the chapter's ground (chapter one: open sea under the raft decks) ===
const tileset = currentChapter().tileset;
const now = Date.now();
drawSea(ctx, width, height, tileset, now);

// Vignette for focus
const vignette = ctx.createRadialGradient(width/2, height/2, 0, width/2, height/2, Math.max(width, height) * 0.7);
vignette.addColorStop(0, 'transparent');
vignette.addColorStop(0.5, 'transparent');
vignette.addColorStop(0.8, 'rgba(30, 25, 15, 0.2)');
vignette.addColorStop(1, 'rgba(20, 15, 10, 0.5)');
ctx.fillStyle = vignette;
ctx.fillRect(0, 0, width, height);

// Get tile size dynamically for portrait/landscape
const firstTilePos = gridToScreen(0, 0, width, height);
const tileW = firstTilePos.tileW;
const tileH = firstTilePos.tileH;


// Where a charged heavy attack will land next turn - step out of it to dodge
const heavyZone = charging.length ? (() => {
const zone = new Set<string>();
for (const { f } of charging) (f.pendingTiles ?? []).forEach(t => zone.add(`${t.row},${t.col}`));
return zone;
})() : null;
const pulse = 0.55 + 0.45 * Math.sin(Date.now() / 180);

// Draw tiles (rectangular grid) with industrial worn tones
for (let row = 0; row < grid.rows; row++) {
for (let col = 0; col < grid.cols; col++) {
const pos = gridToScreen(row, col, width, height);
if (grid.tiles?.[row]?.[col]?.type === 'void') continue;

  const isPlayerTile = grid.playerPosition.row === row && grid.playerPosition.col === col;
  const isBossTile = living.some(x => x.f.pos.row === row && x.f.pos.col === col);
  const isHovered = hoveredTile && hoveredTile.row === row && hoveredTile.col === col;

  // Check if tile is in player's attack range using pre-calculated set
  const isInAttackRange = reachableTiles ? reachableTiles.has(`${row},${col}`) : false;
  const isAimed = aimedTiles ? aimedTiles.has(`${row},${col}`) : false;

  // Check if tile is in enemy's attack range (danger zone for player)
  const isInEnemyRange = enemyReachableTiles ? enemyReachableTiles.has(`${row},${col}`) : false;

  // Attack pattern color palette - vivid and pattern-coded
  // Sweep/melee: amber-orange  Diagonal: teal  Charge/lunge: purple  Ranged/line: red
  const getAttackColor = (): { fill: string; stroke: string } => {
    if (!currentAttackPattern) return { fill: '#c04030', stroke: '#ff5040' };
    const p = currentAttackPattern;
    if (p === 'melee' || p === 'aoe' || p === 'sweep_arc')
      return { fill: 'rgba(214,138,24,0.55)', stroke: '#ffb43a' };  // amber
    if (p === 'diagonal_cross')
      return { fill: 'rgba(16,140,140,0.55)', stroke: '#3ff2e6' };  // teal
    if (p === 'lunge' || p === 'charge' || p === 'knockback')
      return { fill: 'rgba(120,50,190,0.55)', stroke: '#d070ff' };  // purple
    return { fill: 'rgba(170,40,40,0.55)', stroke: '#ff6060' };     // red (ranged/line)
  };
  const attackColors = getAttackColor();

  // The deck itself, then a tint for what the tile means right now
  const gap = Math.max(2, tileW * 0.04);
  const radius = tileW * 0.16;
  drawDeckTile(ctx, pos.x - tileW / 2 + gap, pos.y - tileH / 2 + gap, tileW - gap * 2, tileH - gap * 2, radius, row, col, tileset);
  const tint = isHovered && phase === 'player_turn' ? 'rgba(255,240,200,0.25)'
    : isAimed ? attackColors.fill
    : isInEnemyRange && !isBossTile ? 'rgba(150,20,40,0.42)'
    : null;
  roundRectPath(ctx, pos.x - tileW / 2 + gap, pos.y - tileH / 2 + gap, tileW - gap * 2, tileH - gap * 2, radius);
  if (tint) { ctx.fillStyle = tint; ctx.fill(); }

  // Tile border - vivid glow on attack range tiles
  if (isAimed) {
    ctx.strokeStyle = attackColors.stroke;
    ctx.lineWidth = 2.5;
  } else if (isInAttackRange) {
    // Somewhere else it could be aimed: a faint outline, tap to aim there
    ctx.strokeStyle = attackColors.stroke;
    ctx.globalAlpha = 0.45;
    ctx.lineWidth = 1.5;
  } else if (isHovered) {
    ctx.strokeStyle = '#d8c89a';
    ctx.lineWidth = 2;
  } else if (isInEnemyRange) {
    ctx.strokeStyle = 'rgba(240,82,79,0.7)'; // red border for enemy reach
    ctx.lineWidth = 1.5;
  } else {
    ctx.strokeStyle = 'rgba(0,0,0,0.25)';
    ctx.lineWidth = 1;
  }
  ctx.stroke();
  ctx.globalAlpha = 1;
  if (enemyShoveTiles?.has(`${row},${col}`) && !isAimed) {
    ctx.strokeStyle = '#b07cff';
    ctx.lineWidth = 2;
    roundRectPath(ctx, pos.x - tileW / 2 + gap + 3, pos.y - tileH / 2 + gap + 3, tileW - gap * 2 - 6, tileH - gap * 2 - 6, radius * 0.7);
    ctx.stroke();
  }

  // Charged heavy attack danger zone
  if (heavyZone?.has(`${row},${col}`)) {
    ctx.globalAlpha = 0.4 * pulse + 0.35;
    ctx.fillStyle = '#ff7a00';
    roundRectPath(ctx, pos.x - tileW / 2 + gap, pos.y - tileH / 2 + gap, tileW - gap * 2, tileH - gap * 2, radius);
    ctx.fill();
    ctx.globalAlpha = 1;
    ctx.strokeStyle = '#ffb347';
    ctx.lineWidth = 2;
    ctx.stroke();
  }

  // Movement options: a soft cyan marker on each reachable tile
  if (moveTiles?.has(`${row},${col}`) && !isBossTile) {
    // Orange: stepping here walks away from an enemy beside you, and it gets a parting blow
    const parting = partingTiles.has(`${row},${col}`);
    const markColor = parting ? '#f97316' : moveColor;
    ctx.strokeStyle = markColor ?? 'rgba(56, 214, 240, 0.85)';
    ctx.lineWidth = 2;
    roundRectPath(ctx, pos.x - tileW / 2 + gap + 2, pos.y - tileH / 2 + gap + 2, tileW - gap * 2 - 4, tileH - gap * 2 - 4, radius * 0.8);
    ctx.stroke();
    ctx.fillStyle = markColor ?? 'rgba(56, 214, 240, 0.55)';
    ctx.beginPath();
    ctx.arc(pos.x, pos.y, Math.max(3, tileW * 0.06), 0, Math.PI * 2);
    ctx.fill();
  }

  // Draw obstacles and hazards with simple markers
  const tile = grid.tiles?.[row]?.[col];
  if (tile?.type === 'obstacle' && drawObstacle(ctx, tile.art, pos.x, pos.y, tileW)) {
    // Drawn as what it is
  } else if (tile?.type === 'hazard' && drawHazard(ctx, tile.art, pos.x, pos.y, tileW, now)) {
    ctx.fillStyle = '#ffd2a0';
    ctx.strokeStyle = 'rgba(0,0,0,0.7)';
    ctx.lineWidth = 3;
    ctx.font = `800 ${Math.max(9, Math.floor(tileW * 0.17))}px Manrope, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'bottom';
    ctx.strokeText(`-${tile.hazardDamage ?? 0}`, pos.x, pos.y + tileH * 0.47);
    ctx.fillText(`-${tile.hazardDamage ?? 0}`, pos.x, pos.y + tileH * 0.47);
  } else if (tile?.type === 'obstacle') {
    // Obstacle: a dark block with a soft X
    roundRectPath(ctx, pos.x - tileW / 2 + gap * 2, pos.y - tileH / 2 + gap * 2, tileW - gap * 4, tileH - gap * 4, radius);
    ctx.fillStyle = 'rgba(20,24,32,0.75)';
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,110,110,0.75)';
    ctx.lineCap = 'round';
    ctx.lineWidth = 3;
    const margin = tileW * 0.32;
    ctx.beginPath();
    ctx.moveTo(pos.x - tileW/2 + margin, pos.y - tileH/2 + margin);
    ctx.lineTo(pos.x + tileW/2 - margin, pos.y + tileH/2 - margin);
    ctx.moveTo(pos.x + tileW/2 - margin, pos.y - tileH/2 + margin);
    ctx.lineTo(pos.x - tileW/2 + margin, pos.y + tileH/2 - margin);
    ctx.stroke();
  } else if (tile?.type === 'hazard') {
    // Draw orange warning triangle for hazards
    ctx.fillStyle = '#ff8800';
    ctx.beginPath();
    ctx.moveTo(pos.x, pos.y - tileH * 0.3);
    ctx.lineTo(pos.x - tileW * 0.25, pos.y + tileH * 0.2);
    ctx.lineTo(pos.x + tileW * 0.25, pos.y + tileH * 0.2);
    ctx.closePath();
    ctx.fill();
    // Exclamation mark
    ctx.fillStyle = '#000';
    ctx.font = '800 12px Manrope, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('!', pos.x, pos.y);
    ctx.fillStyle = '#ffb066';
    ctx.font = `700 ${Math.max(9, Math.floor(tileW * 0.16))}px Manrope, sans-serif`;
    ctx.textBaseline = 'bottom';
    ctx.fillText(`-${tile.hazardDamage ?? 0}`, pos.x, pos.y + tileH * 0.47);
  }
}

}

// Update sprite animations
playerAnimator.current.update();
allyAnimator.current.update();
living.forEach(({ i }) => foeVisual(i).animator.update());

// Calculate interpolated player position for smooth movement
let playerVisualRow = grid.playerPosition.row;
let playerVisualCol = grid.playerPosition.col;

if (playerMoveAnim.current) {
const elapsed = Date.now() - playerMoveAnim.current.startTime;
const progress = Math.min(1, elapsed / playerMoveAnim.current.duration);
const eased = easeOutCubic(progress);

playerVisualRow = playerMoveAnim.current.fromRow + 
  (playerMoveAnim.current.toRow - playerMoveAnim.current.fromRow) * eased;
playerVisualCol = playerMoveAnim.current.fromCol + 
  (playerMoveAnim.current.toCol - playerMoveAnim.current.fromCol) * eased;

// Clear animation when complete
if (progress >= 1) {
  playerMoveAnim.current = null;
  playerAnimator.current.setState('idle');
}

}

// Draw player character (Wanderer) using pixel sprites
const playerPos = gridToScreen(playerVisualRow, playerVisualCol, width, height);
const spriteSize = Math.max(tileW * 1.2, 30);
const playerFacingLeft = grid.playerPosition.col > grid.bossPosition.col;

drawFigure(
ctx,
'host',
playerPos.x - spriteSize / 2,
playerPos.y - spriteSize / 2 - 8,
spriteSize,
playerAnimator.current.getState(),
playerAnimator.current.getFrame(),
playerFacingLeft
);

drawStatus(ctx, playerPos.x, playerPos.y - spriteSize / 2 - 8, spriteSize, playerBurning > 0, playerStunned, now);
if (useCombat.getState().playerSwimming) drawSwimming(ctx, playerPos.x, playerPos.y - spriteSize / 2 - 8, spriteSize, tileset.sea, now);

// Player HP bar below character
const playerHpPercent = player.currentHp / player.maxHp;
const barWidth = tileW * 0.9;
const barHeight = 6;
const barY = playerPos.y + tileH / 2 + 5;

// HP bar background
ctx.fillStyle = '#374151';
ctx.fillRect(playerPos.x - barWidth / 2, barY, barWidth, barHeight);

// HP bar fill
ctx.fillStyle = '#4ade80';
ctx.fillRect(playerPos.x - barWidth / 2, barY, barWidth * playerHpPercent, barHeight);

// HP bar border
ctx.strokeStyle = '#1f2937';
ctx.lineWidth = 1;
ctx.strokeRect(playerPos.x - barWidth / 2, barY, barWidth, barHeight);

// Allies: a host body in the ally's colour ring, with a bar in its colour
allies.forEach((a, k) => {
if (a.unit.currentHp <= 0) return;
const ap = gridToScreen(a.pos.row, a.pos.col, width, height);
const color = a.unit.spriteColor || '#38d6f0';
ctx.save();
ctx.strokeStyle = color;
ctx.lineWidth = allyMoveMode === k ? 3 : 2;
ctx.globalAlpha = allyMoveMode === k ? 0.6 + 0.4 * pulse : 0.9;
ctx.beginPath();
ctx.ellipse(ap.x, ap.y + tileH * 0.32, tileW * 0.42, tileH * 0.16, 0, 0, Math.PI * 2);
ctx.stroke();
ctx.restore();
const size = Math.max(tileW * 1.05, 28);
ctx.save();
ctx.globalAlpha = a.acted ? 0.7 : 1;
drawFigure(ctx, a.id, ap.x - size / 2, ap.y - size / 2 - 6, size, allyAnimator.current.getState(), allyAnimator.current.getFrame(), a.pos.col > grid.bossPosition.col);
drawStatus(ctx, ap.x, ap.y - size / 2 - 6, size, a.burning > 0, a.stunned, now);
if (a.swimming) drawSwimming(ctx, ap.x, ap.y - size / 2 - 6, size, tileset.sea, now);
ctx.restore();
const bw = tileW * 0.9, bh = 6, by = ap.y + tileH / 2 + 5;
ctx.fillStyle = '#374151';
ctx.fillRect(ap.x - bw / 2, by, bw, bh);
ctx.fillStyle = color;
ctx.fillRect(ap.x - bw / 2, by, bw * (a.unit.currentHp / a.unit.maxHp), bh);
ctx.font = `700 ${Math.max(10, Math.floor(tileW * 0.2))}px Manrope, sans-serif`;
ctx.textAlign = 'center';
ctx.textBaseline = 'bottom';
ctx.lineWidth = 3;
ctx.strokeStyle = '#000';
ctx.strokeText(a.unit.name, ap.x, ap.y - size / 2 - 4);
ctx.fillStyle = color;
ctx.fillText(a.unit.name, ap.x, ap.y - size / 2 - 4);
});

// Draw every living enemy, with a ring under the one you're aiming at
for (const { f, i } of living) {
const v = foeVisual(i);
let visRow = f.pos.row, visCol = f.pos.col;
if (v.moveAnim) {
const progress = Math.min(1, (Date.now() - v.moveAnim.startTime) / v.moveAnim.duration);
const eased = easeOutCubic(progress);
visRow = v.moveAnim.fromRow + (v.moveAnim.toRow - v.moveAnim.fromRow) * eased;
visCol = v.moveAnim.fromCol + (v.moveAnim.toCol - v.moveAnim.fromCol) * eased;
if (progress >= 1) { v.moveAnim = null; v.animator.setState('idle'); }
}
const fp = gridToScreen(visRow, visCol, width, height);
const isTarget = i === target;
const size = Math.max(tileW * (living.length > 1 ? 1.2 : 1.4), 30);

if (isTarget && foes.length > 1 && !reachableTiles) {
ctx.save();
ctx.strokeStyle = 'rgba(248,113,113,0.9)';
ctx.lineWidth = 2;
ctx.beginPath();
ctx.ellipse(fp.x, fp.y + tileH * 0.32, tileW * 0.42, tileH * 0.16, 0, 0, Math.PI * 2);
ctx.stroke();
ctx.restore();
}

const stumble = v.animator.getStumbleOffset();
ctx.save();
if (stumble.rot !== 0) { ctx.translate(fp.x, fp.y); ctx.rotate(stumble.rot); ctx.translate(-fp.x, -fp.y); }
drawFigure(ctx, f.unit.name, fp.x - size / 2 + stumble.x, fp.y - size / 2 - 8 + stumble.y, size,
v.animator.getState(), v.animator.getFrame(), f.pos.col > grid.playerPosition.col);
ctx.restore();
drawStatus(ctx, fp.x, fp.y - size / 2 - 8, size, f.burning > 0, f.stunned, now);
if (f.swimming) drawSwimming(ctx, fp.x, fp.y - size / 2 - 8, size, tileset.sea, now);
// Implant glows: one per implant carried, in the colour of its grade, so upgraded enemies look upgraded
if (f.unit.grade !== undefined && f.unit.implants?.length) {
const gc = ENEMY_GRADES[f.unit.grade].color;
const spots: [number, number][] = [[-0.12, -0.28], [0.16, -0.02], [-0.16, 0.12], [0.1, 0.26]];
ctx.save();
ctx.shadowColor = gc; ctx.shadowBlur = 6 + f.unit.grade * 3;
ctx.fillStyle = gc;
f.unit.implants.slice(0, 4).forEach((_, n) => {
const [ox, oy] = spots[n];
ctx.globalAlpha = 0.65 + 0.35 * Math.sin(Date.now() / 300 + n);
ctx.beginPath();
ctx.arc(fp.x + ox * size, fp.y - 8 + oy * size, Math.max(1.6, size * (0.03 + f.unit.grade! * 0.006)), 0, Math.PI * 2);
ctx.fill();
});
ctx.restore();
}

const barW = tileW * 0.9, barH = 6, barY = fp.y + tileH / 2 + 5;
ctx.fillStyle = '#374151';
ctx.fillRect(fp.x - barW / 2, barY, barW, barH);
// With several enemies, each bar takes the enemy's colour so it matches its chip in the HUD
ctx.fillStyle = living.length > 1 ? (f.unit.spriteColor || '#ef4444') : '#ef4444';
ctx.fillRect(fp.x - barW / 2, barY, barW * (f.unit.currentHp / f.unit.maxHp), barH);
ctx.strokeStyle = '#1f2937';
ctx.lineWidth = 1;
ctx.strokeRect(fp.x - barW / 2, barY, barW, barH);

// "Hit" over every enemy the current aim lands on
if (aimedTiles?.has(`${f.pos.row},${f.pos.col}`) && phase === 'player_turn') {
const label = 'Hit';
ctx.font = '700 13px Manrope, sans-serif';
ctx.textAlign = 'center';
ctx.fillStyle = '#22c55e';
ctx.strokeStyle = '#000';
ctx.lineWidth = 3;
ctx.strokeText(label, fp.x, fp.y - tileH * 0.8);
ctx.fillText(label, fp.x, fp.y - tileH * 0.8);
}
}

// Draw damage numbers
// (now: the frame time set at the top of the frame)
damageEffectsRef.current = damageEffectsRef.current.filter(effect => now - effect.startTime < 1000);

damageEffectsRef.current.forEach(effect => {
const elapsed = now - effect.startTime;
const progress = elapsed / 1000;
const alpha = 1 - progress;
const y = effect.y - (progress * 80);

drawDamageNumber(ctx, effect.damage, { x: effect.x, y }, alpha);

});

// Draw floating messages (phase announcements, critical hits, heals, etc.)
floatingEffectsRef.current = floatingEffectsRef.current.filter(effect => now - effect.startTime < effect.duration);

floatingEffectsRef.current.forEach(effect => {
const elapsed = now - effect.startTime;
const progress = elapsed / effect.duration;

// Fade in quickly, stay, then fade out
let alpha = 1;
if (progress < 0.1) {
  alpha = progress / 0.1; // Fade in
} else if (progress > 0.7) {
  alpha = (1 - progress) / 0.3; // Fade out
}

// Scale animation (pop in effect)
let scale = 1;
if (progress < 0.15) {
  scale = 0.5 + (progress / 0.15) * 0.7; // Scale up from 0.5 to 1.2
} else if (progress < 0.25) {
  scale = 1.2 - ((progress - 0.15) / 0.1) * 0.2; // Scale back to 1.0
}

// Slight upward float
const y = effect.y - (progress * 20);

drawFloatingMessage(ctx, effect.message, { x: effect.x, y }, effect.type, alpha, scale);

});

animationRef.current = requestAnimationFrame(animate);
};

animate();

return () => {
if (animationRef.current) {
cancelAnimationFrame(animationRef.current);
}
resizeObserver.disconnect();
};

}, [player, boss, phase, grid, playerClass, hoveredTile, selectedAction, aim, foes, target, inputLocked, originalPosition, playerMoveRange, reflexMoveOpen, perks, allies, allyMoveMode, playerBurning, playerStunned]);

// Handle mouse/touch move for hover preview
const handleCanvasMove = (event: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
const canvas = canvasRef.current;
if (!canvas || phase !== 'player_turn') {
setHoveredTile(null);
return;
}

const rect = canvas.getBoundingClientRect();
const clientX = 'touches' in event ? event.touches[0]?.clientX : event.clientX;
const clientY = 'touches' in event ? event.touches[0]?.clientY : event.clientY;

if (clientX == null || clientY == null) {
setHoveredTile(null);
return;
}

const x = clientX - rect.left;
const y = clientY - rect.top;

// Check which tile is being hovered
for (let row = 0; row < grid.rows; row++) {
for (let col = 0; col < grid.cols; col++) {
if (grid.tiles?.[row]?.[col]?.type === 'void') continue;
const pos = gridToScreen(row, col, rect.width, rect.height);
const tileW = pos.tileW;
const tileH = pos.tileH;

const tileLeft = pos.x - tileW / 2;
const tileRight = pos.x + tileW / 2;
const tileTop = pos.y - tileH / 2;
const tileBottom = pos.y + tileH / 2;

if (x >= tileLeft && x <= tileRight && y >= tileTop && y <= tileBottom) {
  // Only update if tile actually changed to avoid unnecessary renders
  setHoveredTile(prev => {
    if (!prev || prev.row !== row || prev.col !== col) {
      return { row, col };
    }
    return prev;
  });
  return;
}

}
}

setHoveredTile(null);

};

// Handle tile clicks for movement
const handleCanvasClick = (event: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
const canvas = canvasRef.current;
if (!canvas || phase !== 'player_turn' || inputLocked) return;

const rect = canvas.getBoundingClientRect();
const clientX = 'touches' in event ? event.touches[0]?.clientX : event.clientX;
const clientY = 'touches' in event ? event.touches[0]?.clientY : event.clientY;

if (clientX == null || clientY == null) return;

const x = clientX - rect.left;
const y = clientY - rect.top;

// Check which tile was clicked (rectangular hitbox)
for (let row = 0; row < grid.rows; row++) {
for (let col = 0; col < grid.cols; col++) {
if (grid.tiles?.[row]?.[col]?.type === 'void') continue;
const pos = gridToScreen(row, col, rect.width, rect.height);
const tileW = pos.tileW;
const tileH = pos.tileH;

// Rectangular hitbox check
const tileLeft = pos.x - tileW / 2;
const tileRight = pos.x + tileW / 2;
const tileTop = pos.y - tileH / 2;
const tileBottom = pos.y + tileH / 2;

if (x >= tileLeft && x <= tileRight && y >= tileTop && y <= tileBottom) {
  // Tapping an enemy aims at it; tapping a tile moves (can be undone)
  const st = useCombat.getState();
  // With an attack picked, a tap inside its reach aims it there
  if (st.setAim({ row, col })) return;
  const hit = st.foes.findIndex(f => f.unit.currentHp > 0 && f.pos.row === row && f.pos.col === col);
  if (hit >= 0) { st.setTarget(hit); return; }
  // Moving an ally: the tap picks its tile. Tapping an ally starts moving it.
  if (st.allyMoveMode !== null) { st.moveAlly({ row, col }); return; }
  const ally = st.allies.findIndex(a => a.unit.currentHp > 0 && a.pos.row === row && a.pos.col === col);
  if (ally >= 0) { st.toggleAllyMove(ally); return; }
  st.moveTentatively({ row, col });
  return;
}

}
}

};

return (
<canvas
ref={canvasRef}
className="w-full h-full cursor-pointer"
style={{
imageRendering: 'pixelated',
// Fallbacks for different browsers - crisp nearest-neighbor scaling
WebkitImageRendering: 'pixelated',
msInterpolationMode: 'nearest-neighbor',
} as React.CSSProperties}
onClick={handleCanvasClick}
onTouchStart={handleCanvasClick}
onMouseMove={handleCanvasMove}
onTouchMove={handleCanvasMove}
onMouseLeave={() => setHoveredTile(null)}
/>
);
}