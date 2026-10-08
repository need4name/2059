import { useEffect, useRef, useState, useMemo } from 'react';
import { useCombat } from '@/lib/stores/useCombat';
import { drawDamageNumber, drawFloatingMessage, FloatingMessageType } from '@/lib/rendering/sprites';
import { drawWanderer, drawDrunkard, SpriteAnimator, AnimationState } from '@/lib/rendering/pixelSprites';
import { ATTACK_PATTERNS, canHitTarget } from '@/lib/combat/patterns';
import { CLASS_DEFINITIONS, BOSS_ATTACKS } from '@/lib/combat/actions';
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
const { player, boss, phase, grid, playerClass, combatLog, selectedAction, pendingBossAction } = useCombat();
const damageEffectsRef = useRef<DamageEffect[]>([]);
const floatingEffectsRef = useRef<FloatingEffect[]>([]);
const animationRef = useRef<number>();
const prevPlayerHp = useRef(player.currentHp);
const prevBossHp = useRef(boss.currentHp);
const prevPhase = useRef(phase);
const prevLogLength = useRef(combatLog.length);
const [hoveredTile, setHoveredTile] = useState<{ row: number; col: number } | null>(null);

// Movement animation state for smooth sliding
const playerMoveAnim = useRef<MovementAnim | null>(null);
const bossMoveAnim = useRef<MovementAnim | null>(null);
const prevPlayerPos = useRef({ row: grid.playerPosition.row, col: grid.playerPosition.col });
const prevBossPos = useRef({ row: grid.bossPosition.row, col: grid.bossPosition.col });

// Sprite animators for characters
// Player has normal animation speed, drunkard has slow lazy idle
const playerAnimator = useRef(new SpriteAnimator(false));
const bossAnimator = useRef(new SpriteAnimator(true)); // slow idle for drunkard

// Helper function to convert grid position to screen position (rectangular grid)
// Mobile-first: accounts for HUD at top (~60px) and action bar at bottom (~140px)
const gridToScreen = (row: number, col: number, canvasWidth: number, canvasHeight: number) => {
const isPortrait = canvasHeight > canvasWidth;

// Reserve space for UI elements (HUD bar and action bar)
// HUD: ~40px, Action bar: ~120px on mobile
const topReserved = 50;
const bottomReserved = isPortrait ? 150 : 100;
const availableHeight = canvasHeight - topReserved - bottomReserved;

// Calculate tile size to fit available space
// Fit based on whichever dimension is more constraining
const maxTileSizeByWidth = (canvasWidth * 0.90) / grid.cols;
const maxTileSizeByHeight = availableHeight / grid.rows;
const tileSize = Math.min(55, maxTileSizeByWidth, maxTileSizeByHeight); // Cap at 55px max
const tileW = tileSize;
const tileH = tileSize;

// Center the grid horizontally and vertically within available space
const gridWidth = grid.cols * tileW;
const gridHeight = grid.rows * tileH;
const offsetX = (canvasWidth - gridWidth) / 2;

// Vertically center within the available middle space
const middleStart = topReserved;
const offsetY = middleStart + (availableHeight - gridHeight) / 2;

const x = offsetX + col * tileW + tileW / 2;
const y = offsetY + row * tileH + tileH / 2;

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

if (boss.currentHp < prevBossHp.current) {
const damage = prevBossHp.current - boss.currentHp;
const pos = gridToScreen(grid.bossPosition.row, grid.bossPosition.col, width, height);

damageEffectsRef.current.push({
id: Math.random().toString(),
damage,
x: pos.x,
y: pos.y - 50,
startTime: Date.now(),
});
}
prevBossHp.current = boss.currentHp;

}, [player.currentHp, boss.currentHp, grid.playerPosition, grid.bossPosition, grid.cols, grid.rows]);

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

// Detect boss taking damage (hurt animation)
if (boss.currentHp < prevBossHp.current) {
bossAnimator.current.setState('hurt');
}

// Phase-based animations
if (phase === 'enemy_turn') {
// Boss attacks
bossAnimator.current.setState('attack');
} else if (phase === 'player_turn') {
// Both idle
if (playerAnimator.current.getState() !== 'hurt' && playerAnimator.current.getState() !== 'attack') {
playerAnimator.current.setState('idle');
}
if (bossAnimator.current.getState() !== 'hurt') {
bossAnimator.current.setState('idle');
}
}

}, [phase, player.currentHp, boss.currentHp]);

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

// Check if boss position changed
if (prevBossPos.current.row !== grid.bossPosition.row ||
prevBossPos.current.col !== grid.bossPosition.col) {
bossMoveAnim.current = {
fromRow: prevBossPos.current.row,
fromCol: prevBossPos.current.col,
toRow: grid.bossPosition.row,
toCol: grid.bossPosition.col,
startTime: Date.now(),
duration: MOVE_DURATION,
};
bossAnimator.current.setState('walk');
prevBossPos.current = { row: grid.bossPosition.row, col: grid.bossPosition.col };
}

}, [grid.playerPosition.row, grid.playerPosition.col, grid.bossPosition.row, grid.bossPosition.col]);

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

// === LAYERED BATTLEFIELD BACKGROUND ===

// Layer 1: Sky gradient with subtle warmth
const skyGradient = ctx.createLinearGradient(0, 0, 0, height * 0.4);
skyGradient.addColorStop(0, '#7a8590'); // Cool gray-blue at top
skyGradient.addColorStop(0.4, '#9a9585'); // Warming
skyGradient.addColorStop(0.7, '#a8a090'); // Hazy horizon
skyGradient.addColorStop(1, '#b5a890'); // Dusty horizon blend
ctx.fillStyle = skyGradient;
ctx.fillRect(0, 0, width, height * 0.4);

// Layer 2: Distant hills silhouettes (adds depth)
const hillColor1 = '#8a8070';
const hillColor2 = '#7a7060';
const horizonY = height * 0.35;

// Far hills (lighter, more distant)
ctx.fillStyle = hillColor1;
ctx.beginPath();
ctx.moveTo(0, horizonY + 10);
for (let x = 0; x <= width; x += width / 8) {
const hillHeight = 15 + Math.sin(x * 0.02) * 10 + Math.sin(x * 0.05) * 5;
ctx.lineTo(x, horizonY - hillHeight);
}
ctx.lineTo(width, horizonY + 20);
ctx.lineTo(0, horizonY + 20);
ctx.fill();

// Near hills (darker, closer)
ctx.fillStyle = hillColor2;
ctx.beginPath();
ctx.moveTo(0, horizonY + 20);
for (let x = 0; x <= width; x += width / 6) {
const hillHeight = 8 + Math.sin(x * 0.03 + 1) * 8 + Math.sin(x * 0.07) * 4;
ctx.lineTo(x, horizonY + 5 - hillHeight);
}
ctx.lineTo(width, horizonY + 25);
ctx.lineTo(0, horizonY + 25);
ctx.fill();

// Layer 3: Main ground with texture variation
const groundGradient = ctx.createLinearGradient(0, height * 0.35, 0, height);
groundGradient.addColorStop(0, '#6a6050'); // Lighter at horizon
groundGradient.addColorStop(0.15, '#5a5545'); //
groundGradient.addColorStop(0.4, '#504a40'); // Main field
groundGradient.addColorStop(0.7, '#454038'); // Darker
groundGradient.addColorStop(1, '#3a3530'); // Shadow at bottom
ctx.fillStyle = groundGradient;
ctx.fillRect(0, height * 0.35, width, height * 0.65);

// Layer 4: Ground texture - sparse grass tufts and stones
// Use deterministic pseudo-random based on position for consistency
const seed = 12345;
const seededRandom = (x: number, y: number) => {
const n = Math.sin(x * 12.9898 + y * 78.233 + seed) * 43758.5453;
return n - Math.floor(n);
};

// Grass tufts (small, muted)
const grassColors = ['#5a6048', '#4a5040', '#555845'];
for (let i = 0; i < 40; i++) {
const gx = seededRandom(i, 1) * width;
const gy = height * 0.4 + seededRandom(i, 2) * height * 0.5;
const gw = 3 + seededRandom(i, 3) * 4;
const gh = 4 + seededRandom(i, 4) * 6;

ctx.fillStyle = grassColors[Math.floor(seededRandom(i, 5) * 3)];
ctx.beginPath();
ctx.moveTo(gx, gy);
ctx.lineTo(gx + gw/2, gy - gh);
ctx.lineTo(gx + gw, gy);
ctx.fill();

}

// Small stones scattered
const stoneColors = ['#5a5550', '#4a4540', '#605850'];
for (let i = 0; i < 20; i++) {
const sx = seededRandom(i + 100, 1) * width;
const sy = height * 0.45 + seededRandom(i + 100, 2) * height * 0.45;
const sw = 4 + seededRandom(i + 100, 3) * 6;
const sh = 3 + seededRandom(i + 100, 4) * 4;

ctx.fillStyle = stoneColors[Math.floor(seededRandom(i + 100, 5) * 3)];
ctx.beginPath();
ctx.ellipse(sx, sy, sw, sh, 0, 0, Math.PI * 2);
ctx.fill();

// Stone highlight
ctx.fillStyle = '#6a6560';
ctx.beginPath();
ctx.ellipse(sx - sw * 0.2, sy - sh * 0.3, sw * 0.4, sh * 0.3, 0, 0, Math.PI * 2);
ctx.fill();

}

// Layer 5: Worn dirt path through center of field
const pathY = height * 0.55;
const pathGradient = ctx.createLinearGradient(0, pathY - 25, 0, pathY + 25);
pathGradient.addColorStop(0, '#5a5040');
pathGradient.addColorStop(0.3, '#655848');
pathGradient.addColorStop(0.5, '#6a5c4a'); // Center - more worn
pathGradient.addColorStop(0.7, '#655848');
pathGradient.addColorStop(1, '#5a5040');
ctx.fillStyle = pathGradient;
ctx.fillRect(0, pathY - 25, width, 50);

// Path ruts/wear marks
ctx.fillStyle = '#554a3a';
for (let x = 0; x < width; x += 30 + seededRandom(x, 200) * 20) {
const rutWidth = 8 + seededRandom(x, 201) * 10;
ctx.fillRect(x, pathY - 3, rutWidth, 2);
ctx.fillRect(x + 5, pathY + 2, rutWidth - 3, 2);
}

// Layer 6: Atmospheric effects
// Subtle dust/haze overlay
const haze = ctx.createLinearGradient(0, height * 0.3, 0, height * 0.6);
haze.addColorStop(0, 'rgba(180, 170, 150, 0.15)');
haze.addColorStop(1, 'transparent');
ctx.fillStyle = haze;
ctx.fillRect(0, height * 0.3, width, height * 0.3);

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

// Pre-calculate reachable tiles once for attack range preview
let reachableTiles: Set<string> | null = null;
let currentAttackPattern: AttackPatternType | null = null;

if (selectedAction && phase === 'player_turn' && (selectedAction.type === 'attack' || selectedAction.type === 'special')) {
// Read attack pattern directly from the action - this is the single source of truth.
// Falls back to class special pattern for 'special' type, then melee_long as last resort.
const classDef = CLASS_DEFINITIONS[playerClass];
currentAttackPattern = (
(selectedAction as any).attackPattern ||
(selectedAction.type === 'special' ? classDef?.specialAbility?.attackPattern : null) ||
'melee_long'
) as AttackPatternType;

reachableTiles = getTargetableTiles(grid.playerPosition, currentAttackPattern, grid);

}

// Pre-calculate enemy attack range: union of ALL patterns this boss can use.
// This ensures every tile the boss might hit is shown as a danger zone.
const enemyReachableTiles = phase === 'player_turn' ? (() => {
const bossActions = BOSS_ATTACKS[boss.name] || [];
const union = new Set<string>();
// Collect all unique attack patterns this boss has
const patterns = new Set<AttackPatternType>();
bossActions.forEach(a => {
const pat = (a as any).attackPattern as AttackPatternType | undefined;
if (pat) patterns.add(pat);
});
// Always include melee_long as fallback (boss can always move and melee)
patterns.add('melee_long');
// Union all reachable tiles across all patterns
patterns.forEach(pat => {
const tiles = getTargetableTiles(grid.bossPosition, pat, grid);
tiles.forEach(k => union.add(k));
});
return union;
})() : null;

// Draw tiles (rectangular grid) with industrial worn tones
for (let row = 0; row < grid.rows; row++) {
for (let col = 0; col < grid.cols; col++) {
const pos = gridToScreen(row, col, width, height);

  const isPlayerTile = grid.playerPosition.row === row && grid.playerPosition.col === col;
  const isBossTile = grid.bossPosition.row === row && grid.bossPosition.col === col;
  const isHovered = hoveredTile && hoveredTile.row === row && hoveredTile.col === col;

  // Check if tile is in player's attack range using pre-calculated set
  const isInAttackRange = reachableTiles ? reachableTiles.has(`${row},${col}`) : false;

  // Check if tile is in enemy's attack range (danger zone for player)
  const isInEnemyRange = enemyReachableTiles ? enemyReachableTiles.has(`${row},${col}`) : false;

  // Attack pattern color palette - vivid and pattern-coded
  // Sweep/melee: amber-orange  Diagonal: teal  Charge/lunge: purple  Ranged/line: red
  const getAttackColor = (): { fill: string; stroke: string } => {
    if (!currentAttackPattern) return { fill: '#c04030', stroke: '#ff5040' };
    const p = currentAttackPattern;
    if (p === 'melee' || p === 'aoe' || p === 'sweep_arc')
      return { fill: '#a06010', stroke: '#ffaa00' };  // amber
    if (p === 'diagonal_cross')
      return { fill: '#107070', stroke: '#00ffee' };  // teal
    if (p === 'lunge' || p === 'charge' || p === 'knockback')
      return { fill: '#6020a0', stroke: '#cc44ff' };  // purple
    return { fill: '#901010', stroke: '#ff3030' };     // red (ranged/line)
  };
  const attackColors = getAttackColor();

  // Industrial worn tile colors - muted soot and rust tones
  if (isHovered && phase === 'player_turn') {
    ctx.fillStyle = '#c8b898';
  } else if (isInAttackRange) {
    ctx.fillStyle = attackColors.fill;
  } else if (isInEnemyRange && !isBossTile) {
    ctx.fillStyle = '#5a1a1a'; // danger red tint - boss can reach this tile
  } else if (isPlayerTile) {
    ctx.fillStyle = '#7a7a5a';
  } else if (isBossTile) {
    ctx.fillStyle = '#7a5040';
  } else {
    const isOdd = (row + col) % 2 === 0;
    ctx.fillStyle = isOdd ? '#6a6050' : '#5a5040';
  }

  ctx.fillRect(pos.x - tileW / 2, pos.y - tileH / 2, tileW, tileH);

  // Tile border - vivid glow on attack range tiles
  if (isInAttackRange) {
    ctx.strokeStyle = attackColors.stroke;
    ctx.lineWidth = 3;
  } else if (isHovered) {
    ctx.strokeStyle = '#a89050';
    ctx.lineWidth = 3;
  } else if (isInEnemyRange) {
    ctx.strokeStyle = '#cc2222'; // vivid red border for enemy reach
    ctx.lineWidth = 2;
  } else {
    ctx.strokeStyle = '#4a4030';
    ctx.lineWidth = 1;
  }
  ctx.strokeRect(pos.x - tileW / 2, pos.y - tileH / 2, tileW, tileH);

  // Pattern label on attack range tiles - small text showing pattern type
  if (isInAttackRange && currentAttackPattern && tileW > 40) {
    ctx.fillStyle = attackColors.stroke;
    ctx.globalAlpha = 0.7;
    ctx.font = `bold ${Math.floor(tileW * 0.18)}px monospace`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'bottom';
    const label = currentAttackPattern.replace('_', ' ').toUpperCase().slice(0, 6);
    ctx.fillText(label, pos.x, pos.y + tileH * 0.45);
    ctx.globalAlpha = 1.0;
  }

  // Draw obstacles and hazards with simple markers
  const tile = grid.tiles?.[row]?.[col];
  if (tile?.type === 'obstacle') {
    // Draw red X for obstacles
    ctx.strokeStyle = '#ff3333';
    ctx.lineWidth = 4;
    const margin = tileW * 0.2;
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
    ctx.font = 'bold 12px monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('!', pos.x, pos.y);
  }
}

}

// Update sprite animations
playerAnimator.current.update();
bossAnimator.current.update();

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
const spriteSize = Math.max(tileW * 1.2, 48);
const playerFacingLeft = grid.playerPosition.col > grid.bossPosition.col;

drawWanderer(
ctx,
playerPos.x - spriteSize / 2,
playerPos.y - spriteSize / 2 - 8,
spriteSize,
playerAnimator.current.getState(),
playerAnimator.current.getFrame(),
playerFacingLeft
);

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

// Calculate interpolated boss position for smooth movement
let bossVisualRow = grid.bossPosition.row;
let bossVisualCol = grid.bossPosition.col;

if (bossMoveAnim.current) {
const elapsed = Date.now() - bossMoveAnim.current.startTime;
const progress = Math.min(1, elapsed / bossMoveAnim.current.duration);
const eased = easeOutCubic(progress);

bossVisualRow = bossMoveAnim.current.fromRow + 
  (bossMoveAnim.current.toRow - bossMoveAnim.current.fromRow) * eased;
bossVisualCol = bossMoveAnim.current.fromCol + 
  (bossMoveAnim.current.toCol - bossMoveAnim.current.fromCol) * eased;

// Clear animation when complete
if (progress >= 1) {
  bossMoveAnim.current = null;
  bossAnimator.current.setState('idle');
}

}

// Draw boss character (Drunkard) using pixel sprites
const bossPos = gridToScreen(bossVisualRow, bossVisualCol, width, height);
const bossSpriteSize = Math.max(tileW * 1.4, 56);
const bossFacingLeft = grid.bossPosition.col > grid.playerPosition.col;

// Get random stumble offset for drunkard animation
const stumble = bossAnimator.current.getStumbleOffset();

ctx.save();
// Apply stumble rotation and translation
if (stumble.rot !== 0) {
ctx.translate(bossPos.x, bossPos.y);
ctx.rotate(stumble.rot);
ctx.translate(-bossPos.x, -bossPos.y);
}

drawDrunkard(
ctx,
bossPos.x - bossSpriteSize / 2 + stumble.x,
bossPos.y - bossSpriteSize / 2 - 8 + stumble.y,
bossSpriteSize,
bossAnimator.current.getState(),
bossAnimator.current.getFrame(),
bossFacingLeft,
bossAnimator.current.getRandomSeed()
);

ctx.restore();

// Boss HP bar below character
const bossHpPercent = boss.currentHp / boss.maxHp;
const bossBarWidth = tileW * 0.9;
const bossBarHeight = 6;
const bossBarY = bossPos.y + tileH / 2 + 5;

// HP bar background
ctx.fillStyle = '#374151';
ctx.fillRect(bossPos.x - bossBarWidth / 2, bossBarY, bossBarWidth, bossBarHeight);

// HP bar fill
ctx.fillStyle = '#ef4444';
ctx.fillRect(bossPos.x - bossBarWidth / 2, bossBarY, bossBarWidth * bossHpPercent, bossBarHeight);

// HP bar border
ctx.strokeStyle = '#1f2937';
ctx.lineWidth = 1;
ctx.strokeRect(bossPos.x - bossBarWidth / 2, bossBarY, bossBarWidth, bossBarHeight);

// Attack range indicator above boss when attack action is selected
// Uses the same pre-calculated reachable tiles for consistency
if (reachableTiles && phase === 'player_turn') {
const bossKey = `${grid.bossPosition.row},${grid.bossPosition.col}`;
const inRange = reachableTiles.has(bossKey);

ctx.font = 'bold 14px Inter, sans-serif';
ctx.textAlign = 'center';

if (inRange) {
  // Green "TARGET" indicator
  ctx.fillStyle = '#22c55e';
  ctx.strokeStyle = '#000';
  ctx.lineWidth = 3;
  ctx.strokeText('[TARGET]', bossPos.x, bossPos.y - tileH * 0.8);
  ctx.fillText('[TARGET]', bossPos.x, bossPos.y - tileH * 0.8);
} else {
  // Red "OUT OF RANGE" indicator
  ctx.fillStyle = '#ef4444';
  ctx.strokeStyle = '#000';
  ctx.lineWidth = 3;
  ctx.strokeText('[OUT OF RANGE]', bossPos.x, bossPos.y - tileH * 0.8);
  ctx.fillText('[OUT OF RANGE]', bossPos.x, bossPos.y - tileH * 0.8);
}

}

// Draw damage numbers
const now = Date.now();
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

}, [player, boss, phase, grid, playerClass, hoveredTile, selectedAction]);

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
if (!canvas || phase !== 'player_turn') return;

const rect = canvas.getBoundingClientRect();
const clientX = 'touches' in event ? event.touches[0]?.clientX : event.clientX;
const clientY = 'touches' in event ? event.touches[0]?.clientY : event.clientY;

if (clientX == null || clientY == null) return;

const x = clientX - rect.left;
const y = clientY - rect.top;

// Check which tile was clicked (rectangular hitbox)
for (let row = 0; row < grid.rows; row++) {
for (let col = 0; col < grid.cols; col++) {
const pos = gridToScreen(row, col, rect.width, rect.height);
const tileW = pos.tileW;
const tileH = pos.tileH;

// Rectangular hitbox check
const tileLeft = pos.x - tileW / 2;
const tileRight = pos.x + tileW / 2;
const tileTop = pos.y - tileH / 2;
const tileBottom = pos.y + tileH / 2;

if (x >= tileLeft && x <= tileRight && y >= tileTop && y <= tileBottom) {
  // Clicked on this tile - attempt tentative move (can be undone)
  const { moveTentatively } = useCombat.getState();
  moveTentatively({ row, col });
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