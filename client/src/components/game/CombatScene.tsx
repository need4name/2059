import { useEffect, useRef, useState, useMemo } from 'react';
import { useCombat } from '@/lib/stores/useCombat';
import { drawDamageNumber, drawFloatingMessage, FloatingMessageType } from '@/lib/rendering/sprites';
import { SpriteAnimator, AnimationState } from '@/lib/rendering/pixelSprites';
import { ATTACK_PATTERNS, canHitTarget } from '@/lib/combat/patterns';
import { getPlayerReach } from '@/lib/combat/grid';
import * as Fight from '@/lib/engine/fight';
import { moveKind, damageTypeRgb } from './hud';
import { getFlankBonus } from '@/lib/combat/types';
import { drawSea, drawDeckTile, drawMudTile, drawLoosePart, drawBreaking, drawHazard, drawObstacle, drawStatus, drawSwimming, drawSlab, drawSeams, drawFootShadow, drawUnitBar, UNIT_BAR, hasCover, tilePath, type Open } from '@/lib/rendering/board';
import { drawDoll } from '@/lib/rendering/dolls';
import { hostDoll, allyDoll, foeDoll } from '@/lib/rendering/dollSpecs';
import { useInventory } from '@/lib/stores/useInventory';
import { useAugmentTrees } from '@/lib/stores/useAugmentTrees';
import { activeChapter, chapterById } from '@/lib/combat/chapters';
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
/**
 * Who moves, the way Into the Breach shows it: a bold arrow sitting on the edge between a unit's
 * tile and the tile it will go to, nudging that way. If something is in the way (the board's
 * edge, cover, another body), a short bar stops the arrow there: it will slam into it instead.
 */
function drawMoveArrow(ctx: CanvasRenderingContext2D, x: number, y: number, dx: number, dy: number, tileW: number, tileH: number, now: number, color: string, blocked = false) {
  const len = Math.hypot(dx, dy) || 1, ux = dx / len, uy = dy / len;
  const nudge = (Math.sin(now / 220) * 0.5 + 0.5) * tileW * 0.06;
  const s = tileW * 0.2;
  const cx = x + ux * (tileW * 0.42 + nudge), cy = y + uy * (tileH * 0.42 + nudge);
  ctx.save();
  ctx.lineJoin = 'round';
  ctx.beginPath();
  ctx.moveTo(cx + ux * s, cy + uy * s);
  ctx.lineTo(cx - ux * s * 0.5 - uy * s * 0.8, cy - uy * s * 0.5 + ux * s * 0.8);
  ctx.lineTo(cx - ux * s * 0.15, cy - uy * s * 0.15);
  ctx.lineTo(cx - ux * s * 0.5 + uy * s * 0.8, cy - uy * s * 0.5 - ux * s * 0.8);
  ctx.closePath();
  ctx.lineWidth = Math.max(2, tileW * 0.05);
  ctx.strokeStyle = 'rgba(4,7,12,0.9)';
  ctx.stroke();
  ctx.fillStyle = color;
  ctx.fill();
  if (blocked) {
    const bx = cx + ux * s * 1.35, by = cy + uy * s * 1.35, w = s * 0.9;
    ctx.beginPath();
    ctx.moveTo(bx - uy * w, by + ux * w); ctx.lineTo(bx + uy * w, by - ux * w);
    ctx.lineCap = 'round';
    ctx.lineWidth = Math.max(5, tileW * 0.09); ctx.strokeStyle = 'rgba(4,7,12,0.9)'; ctx.stroke();
    ctx.lineWidth = Math.max(3, tileW * 0.055); ctx.strokeStyle = '#ff9a3c'; ctx.stroke();
  }
  ctx.restore();
}

/** What a defensive move will give back, flashing in green on the empty part of a bar: bright for now, faint for what drips in later. */
function drawGainFlash(ctx: CanvasRenderingContext2D, cx: number, y: number, w: number, h: number, cur: number, now: number, later: number, now_ms: number) {
  if (now <= 0 && later <= 0) return;
  const x0 = cx - w / 2, at = (f: number) => x0 + w * Math.max(0, Math.min(1, f));
  const blink = 0.5 + 0.5 * Math.sin(now_ms / 160);
  ctx.save();
  if (later > 0) { ctx.fillStyle = `rgba(134,239,172,${0.25 + 0.15 * blink})`; ctx.fillRect(at(cur + now), y, at(cur + now + later) - at(cur + now), h); }
  if (now > 0) { ctx.fillStyle = `rgba(187,247,208,${0.6 + 0.35 * blink})`; ctx.fillRect(at(cur), y, at(cur + now) - at(cur), h); }
  ctx.restore();
}

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

/** Which way each wind direction points on screen. */
const WIND_VEC: Record<string, { dx: number; dy: number }> = { north: { dx: 0, dy: -1 }, south: { dx: 0, dy: 1 }, east: { dx: 1, dy: 0 }, west: { dx: -1, dy: 0 } };

export function CombatScene() {
const canvasRef = useRef<HTMLCanvasElement>(null);
const { player, boss, phase, grid, playerClass, combatLog, selectedAction, aim, inputLocked, originalPosition, playerMoveRange, foes, target, fightId, reflexMoveOpen, perks, allies, allyMoveMode, playerBurning, playerStunned, allyTurn, allyPicked } = useCombat();
const living = foes.map((f, i) => ({ f, i })).filter(x => x.f.unit.currentHp > 0);
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
// Tidal ground counts even when the sea is over it, and so does raft that has broken away, so the board doesn't resize
const t = grid.tiles?.[r]?.[c];
if (t?.type === 'void' && !t.tidal && !t.breaks) continue;
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
message: (() => { const st = useCombat.getState(); const a = st.allyTurn !== null ? st.allies[st.allyTurn] : null; return a ? `${a.unit.name.toUpperCase()}'S TURN` : 'YOUR TURN!'; })(),
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
let aimedTiles: Set<string> | null = null;
const aimedWeight = new Map<string, number>();
let aimedMove: ReturnType<typeof moveKind> = null;
// Who the aim actually hits (the targeting part can cap it)
let struckFoes: Set<number> | null = null;
let aimedAccuracy: string | undefined;
let aimedAim: TilePosition | null = null;
const hitPreview = new Map<number, { min: number; max: number; sMin: number; sMax: number }>();
// Where the previewed attack comes from: you, or the ally whose turn it is
let attackFrom: TilePosition = grid.playerPosition;
// A defensive move's preview: what each one it covers gets back (shares of their bars), the outline of its guard, where it steps you
type Gain = { now: number; later: number; sNow: number; sLater: number };
const defendGain = new Map<string, Gain>();       // 'player' or 'ally:k'
const guardOutline = new Map<string, { color: string; dashed: boolean }>(); // tile -> outline
let defendPick: Set<string> | null = null;        // tiles you can tap to choose who it covers
let defendStepTo: TilePosition | null = null;
// Brace: the structure (and any health) it mends flashes on your bars while it's picked
if (selectedAction?.type === 'brace' && phase === 'player_turn') {
  const b = Fight.braceAmounts(useCombat.getState());
  if (b.structure || b.heal) defendGain.set('player', { now: b.heal, later: 0, sNow: b.structure, sLater: 0 });
}
if (selectedAction?.defend && phase === 'player_turn') {
  const fs = useCombat.getState(), d = selectedAction.defend;
  const { who, mult } = Fight.defendTargets(fs, selectedAction, fs.aim);
  const a = Fight.defendAmounts(fs, selectedAction, mult);
  const turns = d.turns ?? 0;
  const guard = a.physCut > 0 && a.specialCut > 0 ? '#ffffff' : a.physCut > 0 ? '#ffb43a' : a.specialCut > 0 ? '#a78bfa' : d.counter || d.anchor ? '#ffffff' : null;
  for (const w of who) {
    const ally = w.kind === 'ally';
    defendGain.set(ally ? `ally:${w.k}` : 'player', ally
      ? { now: a.heal + a.repair * 0.5, later: (a.healOver + a.repairOver * 0.5) * turns, sNow: 0, sLater: 0 }
      : { now: a.heal, later: a.healOver * turns, sNow: a.repair, sLater: a.repairOver * turns });
    const p = ally ? fs.allies[w.k].pos : fs.grid.playerPosition;
    if (guard) guardOutline.set(`${p.row},${p.col}`, { color: guard, dashed: !a.physCut && !a.specialCut });
  }
  if (d.reach && (d.targets === 'focused' || d.targets === 'split2')) defendPick = new Set(Fight.defendCandidates(fs, selectedAction).map(w => { const p = w.kind === 'player' ? fs.grid.playerPosition : fs.allies[w.k].pos; return `${p.row},${p.col}`; }));
  defendStepTo = Fight.defendStep(fs, selectedAction);
}
// An ally's turn, with a move picked: the same previews from its tile
if (allyTurn !== null && allyPicked !== null && phase === 'player_turn') {
  const fs = useCombat.getState(), al = fs.allies[allyTurn], mv = al?.moves[allyPicked];
  if (al && mv?.effect === 'attack') {
    attackFrom = al.pos;
    struckFoes = new Set(Fight.allyStruck(fs, allyTurn, allyPicked));
    for (const i of Array.from(struckFoes)) { const e = Fight.estimateAllyHit(fs, allyTurn, allyPicked, i); if (e) hitPreview.set(i, { min: e.healthMin, max: e.healthMax, sMin: Math.max(0, e.min - e.healthMin), sMax: Math.max(0, e.max - e.healthMax) }); }
    aimedMove = moveKind(mv);
    aimedTiles = new Set(Array.from(struckFoes).map(i => `${fs.foes[i].pos.row},${fs.foes[i].pos.col}`));
  } else if (al && mv?.effect === 'defend' && mv.defend) {
    const { who, mult } = Fight.allyDefendTargets(fs, allyTurn, allyPicked);
    const a = Fight.defendAmounts(fs, mv, mult), turns = mv.defend.turns ?? 0;
    const guard = a.physCut > 0 && a.specialCut > 0 ? '#ffffff' : a.physCut > 0 ? '#ffb43a' : a.specialCut > 0 ? '#a78bfa' : mv.defend.counter || mv.defend.anchor ? '#ffffff' : null;
    for (const w of who) {
      const c = w.kind === 'player' ? fs.player : fs.allies[w.k].unit, bar = c.maxStructuralHp > 0;
      defendGain.set(w.kind === 'ally' ? `ally:${w.k}` : 'player', { now: a.heal + (bar ? 0 : a.repair * 0.5), later: (a.healOver + (bar ? 0 : a.repairOver * 0.5)) * turns, sNow: bar ? a.repair : 0, sLater: bar ? a.repairOver * turns : 0 });
      const p = w.kind === 'player' ? fs.grid.playerPosition : fs.allies[w.k].pos;
      if (guard) guardOutline.set(`${p.row},${p.col}`, { color: guard, dashed: !a.physCut && !a.specialCut });
    }
  }
}
// Into the Breach's preview: how much of each struck enemy's health this hit will take (no crits)
// Is a tile somewhere a shoved body can't go (off the board, cover, a wall, someone standing there)?
const blockedAt = (r: number, c: number) => r < 0 || c < 0 || r >= grid.rows || c >= grid.cols
  || ['obstacle', 'void'].includes(grid.tiles?.[r]?.[c]?.type ?? '')
  || living.some(x => x.f.pos.row === r && x.f.pos.col === c)
  || (grid.playerPosition.row === r && grid.playerPosition.col === c);

if (selectedAction && phase === 'player_turn' && (selectedAction.type === 'attack' || selectedAction.type === 'special')) {

// Where it can be aimed (dim), and where the current aim lands (bright)
const fs = useCombat.getState();
reachableTiles = new Set(Fight.aimableTiles(fs, selectedAction, playerClass).map(t => `${t.row},${t.col}`));
if (fs.aim) {
  const tiles = Fight.aimTiles(fs, selectedAction, playerClass, fs.aim);
  aimedTiles = new Set(tiles.map(t => `${t.row},${t.col}`));
  // How hard it lands on each of those tiles (side, back and the shape's sweet spot): bolder where it hits harder
  for (const t of tiles) aimedWeight.set(`${t.row},${t.col}`, (1 + getFlankBonus(grid.playerPosition, t)) * Fight.sweetSpot(selectedAction, playerClass, grid.playerPosition, fs.aim, t));
  aimedMove = moveKind(selectedAction, playerClass);
  struckFoes = new Set(Fight.struckAt(fs, selectedAction, playerClass, fs.aim));
  aimedAccuracy = selectedAction.accuracy;
  aimedAim = fs.aim;
  for (const i of Array.from(struckFoes)) { const e = Fight.estimateHit(fs, selectedAction, playerClass, fs.aim, i); if (e) hitPreview.set(i, { min: e.healthMin, max: e.healthMax, sMin: Math.max(0, e.min - e.healthMin), sMax: Math.max(0, e.max - e.healthMax) }); }
}

}

// Every tile an enemy can hit on its next turn. Enemies attack before they
// move, so standing outside these at the end of your turn is safe.
// Enemies that act twice before your next turn walk between their two actions: their second reach counts too
const twiceNow = phase === 'player_turn' ? Fight.doubleTurns(useCombat.getState(), useCombat.getState().clock, 'player') : [];
// Where an enemy can hit you on its first go, from where it stands now (solid red)
const enemyNowTiles = phase === 'player_turn' ? Fight.dangerTiles(useCombat.getState()) : null;
const enemyReachableTiles = phase === 'player_turn' ? (() => {
const union = Fight.dangerTiles(useCombat.getState(), false, twiceNow);
return union.size ? union : null;
})() : null;
// What each red tile says: the damage you'd take there (its number in the corner, its darkness against your health now),
// a white arrow if the hit would shove or drag you, stripes where a wound-up heavy is locked on, a skull if it would kill you
const enemyDanger = phase === 'player_turn' ? Fight.dangerInfo(useCombat.getState(), useCombat.getState().farmLevel ?? useCombat.getState().bossLevel) : null;

// Tiles the player (or the ally being moved) can still move to this turn
const allyTiles = allyMoveMode !== null && phase === 'player_turn' && !inputLocked
? (() => { const st = useCombat.getState(); const o = st.allyOrigin; const t = Fight.allyReach(st, allyMoveMode, o ?? undefined); if (o) t.add(`${o.row},${o.col}`); return t; })()
: null;
const moveTiles = allyTiles ?? (phase === 'player_turn' && !inputLocked && !reachableTiles && originalPosition && (!useCombat.getState().moveSpent || reflexMoveOpen) && useCombat.getState().orders?.now !== 'hold' && useCombat.getState().allyTurn === null
? (reflexMoveOpen
  ? getPlayerReach(grid.playerPosition, grid, Math.max(Fight.STEP_REACH, perks.reflexReach ?? 0), perks.phaseStep)
  : getPlayerReach(originalPosition, { ...grid, playerPosition: originalPosition }, playerMoveRange, perks.phaseStep))
: null);
const moveColor = allyMoveMode !== null ? (allies[allyMoveMode]?.unit.spriteColor ?? '#38d6f0') : null;
// Move tiles where going there hurts: a parting blow (walking away from an enemy beside you),
// ending your turn inside an enemy's reach, or a hazard underfoot. Drawn red; the rest blue.
const hurtTiles = new Set<string>();
if (moveTiles && allyMoveMode === null && originalPosition) {
  const st = useCombat.getState();
  moveTiles.forEach(k => {
    const [row, col] = k.split(',').map(Number);
    const t = grid.tiles?.[row]?.[col];
    if (Fight.partingFoes(st, originalPosition, { row, col }).length || enemyReachableTiles?.has(k) || (t?.type === 'hazard' && (t.hazardDamage ?? 0) > 0 && perks.hazardMult > 0)) hurtTiles.add(k);
  });
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
const tileset = (grid.tilesetOf ? chapterById(grid.tilesetOf) : activeChapter()).tileset;
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


const pulse = 0.55 + 0.45 * Math.sin(Date.now() / 180);
// Mud flats about to go under (the tide comes in at the start of next round)
const tideNow = useCombat.getState().tide;
const floodNext = !!tideNow && !tideNow.high && tideNow.turnsLeft === 1;
const kingNow = useCombat.getState().king;
const alarmOn = !!useCombat.getState().alarm?.on;
const windNow = useCombat.getState().wind;
const dimPulse = 0.5 + 0.5 * Math.sin(now / 600);
const besideCold = (row: number, col: number) => {
  for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) if (grid.tiles?.[row + dr]?.[col + dc]?.cold) return true;
  return false;
};

// The board is one slab: which sides of each tile are open, its side and shadow first
const isFloor = (r: number, c: number) => r >= 0 && c >= 0 && r < grid.rows && c < grid.cols && grid.tiles?.[r]?.[c]?.type !== 'void';
const openOf = (r: number, c: number): Open => ({ up: !isFloor(r - 1, c), down: !isFloor(r + 1, c), left: !isFloor(r, c - 1), right: !isFloor(r, c + 1) });
const cornerR = tileW * 0.14;
const cells: { x: number; y: number; w: number; h: number; open: Open }[] = [];
for (let row = 0; row < grid.rows; row++) for (let col = 0; col < grid.cols; col++) {
  if (!isFloor(row, col)) continue;
  const p = gridToScreen(row, col, width, height);
  cells.push({ x: p.x - tileW / 2, y: p.y - tileH / 2, w: tileW, h: tileH, open: openOf(row, col) });
}
drawSlab(ctx, cells, tileset, cornerR);
// Things that stand up (cover, units) are drawn after the floor, back to front
const depth: { y: number; draw: () => void }[] = [];
const overlay: (() => void)[] = [];

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
  // Only an enemy's second go reaches here (it acts twice: hits, walks, hits again): a fainter, dashed red
  const isLaterOnly = isInEnemyRange && !!enemyNowTiles && !enemyNowTiles.has(`${row},${col}`);
  const danger = enemyDanger?.get(`${row},${col}`);
  // Solid red: something will hit you here on its next go (a wound-up heavy always does)
  const isRed = !isBossTile && !!danger && danger.damage > 0 && ((isInEnemyRange && !isLaterOnly) || !!danger.heavy);

  // Aimed tiles take the move's damage type: amber physical, violet special, blended between
  const getAttackColor = (): { fill: string; stroke: string } => {
    const [r, g, b] = damageTypeRgb(selectedAction?.physicalRatio);
    return { fill: `rgba(${Math.round(r * 0.8)},${Math.round(g * 0.75)},${Math.round(b * 0.6)},0.55)`, stroke: `rgb(${r},${g},${b})` };
  };
  const attackColors = getAttackColor();

  // The deck itself, then a tint for what the tile means right now
  // Markers sit just inside the tile, painted on the floor
  const gap = Math.max(2, tileW * 0.05);
  const radius = tileW * 0.14;
  const open = openOf(row, col);
  if (grid.tiles?.[row]?.[col]?.art === 'mud') drawMudTile(ctx, pos.x - tileW / 2, pos.y - tileH / 2, tileW, tileH, open, cornerR, row, col, floodNext, now);
  else drawDeckTile(ctx, pos.x - tileW / 2, pos.y - tileH / 2, tileW, tileH, open, cornerR, row, col, tileset);
  // The King's raft: the ring that breaks away when he next loses a part
  if (kingNow && kingNow.rings < 3 && grid.tiles?.[row]?.[col]?.breaks === kingNow.rings + 1) drawBreaking(ctx, pos.x - tileW / 2, pos.y - tileH / 2, tileW, tileH, open, cornerR, now);
  const tint = isHovered && phase === 'player_turn' ? 'rgba(255,240,200,0.25)'
    : isAimed ? attackColors.fill
    : isRed ? 'rgb(200,24,48)'
    : isInEnemyRange && !isBossTile && isLaterOnly ? 'rgba(150,20,40,0.08)'
    : null;
  roundRectPath(ctx, pos.x - tileW / 2 + gap, pos.y - tileH / 2 + gap, tileW - gap * 2, tileH - gap * 2, radius);
  // Lights out: once the alarm trips the floor goes dark (never red: red means danger); tiles beside a cold pod stay cool blue
  if (alarmOn) {
    ctx.save();
    ctx.beginPath();
    tilePath(ctx, pos.x - tileW / 2, pos.y - tileH / 2, tileW, tileH, open, cornerR);
    ctx.fillStyle = besideCold(row, col) ? 'rgba(60,150,200,0.30)' : `rgba(4,6,10,${0.42 + 0.06 * dimPulse})`;
    ctx.fill();
    ctx.restore();
    roundRectPath(ctx, pos.x - tileW / 2 + gap, pos.y - tileH / 2 + gap, tileW - gap * 2, tileH - gap * 2, radius);
  }
  if (tint) {
    ctx.fillStyle = tint;
    if (isAimed && !isHovered) ctx.globalAlpha = Math.max(0.3, Math.min(1, 0.35 + ((aimedWeight.get(`${row},${col}`) ?? 1) - 0.7) * 0.9));
    else if (!isAimed && !isHovered && isRed) ctx.globalAlpha = Fight.dangerShade(danger!.damage, player.currentHp);
    ctx.fill();
    ctx.globalAlpha = 1;
    const showDanger = isRed && !isAimed && !isHovered;
    // A wound-up heavy: the same red, striped (it's locked: it lands here for sure)
    if (showDanger && danger!.heavy) {
      ctx.save();
      roundRectPath(ctx, pos.x - tileW / 2 + gap, pos.y - tileH / 2 + gap, tileW - gap * 2, tileH - gap * 2, radius);
      ctx.clip();
      ctx.strokeStyle = `rgba(255,220,220,${0.4 + 0.2 * pulse})`;
      ctx.lineWidth = Math.max(2, tileW * 0.05);
      const step = tileW * 0.2;
      for (let i = -tileW; i < tileW; i += step) { ctx.beginPath(); ctx.moveTo(pos.x - tileW / 2 + i, pos.y + tileH / 2); ctx.lineTo(pos.x - tileW / 2 + i + tileW, pos.y - tileH / 2); ctx.stroke(); }
      ctx.restore();
    }
    // A shove or drag: a small white arrow the way you'd go
    if (showDanger && danger!.shove && (danger!.shove.dr || danger!.shove.dc)) {
      const { dr, dc } = danger!.shove;
      ctx.save();
      ctx.translate(pos.x + dc * tileW * 0.22, pos.y + dr * tileH * 0.22);
      ctx.rotate(Math.atan2(dr, dc));
      const a = tileW * 0.13;
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(-a, -a * 0.25, a * 1.2, a * 0.5);
      ctx.beginPath(); ctx.moveTo(a * 0.2, -a * 0.75); ctx.lineTo(a, 0); ctx.lineTo(a * 0.2, a * 0.75); ctx.closePath(); ctx.fill();
      ctx.restore();
    }
    // What you'd lose here, in the corner
    if (showDanger) {
      ctx.save();
      ctx.font = `700 ${Math.max(9, Math.floor(tileW * 0.17))}px Manrope, sans-serif`;
      ctx.textAlign = 'right'; ctx.textBaseline = 'bottom';
      ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(0,0,0,0.55)'; ctx.fillStyle = '#ffffff';
      const tx = pos.x + tileW / 2 - gap - tileW * 0.06, ty = pos.y + tileH / 2 - gap - tileH * 0.04;
      ctx.strokeText(`-${danger!.damage}`, tx, ty); ctx.fillText(`-${danger!.damage}`, tx, ty);
      ctx.restore();
    }
    // A hit here would kill you: a small pixel skull on the floor
    const lethal = showDanger && danger!.damage >= player.currentHp;
    if (lethal) {
      const u = Math.max(1, Math.round(tileW / 22)), sx = Math.round(pos.x - 2.5 * u), sy = Math.round(pos.y - 2.5 * u);
      ctx.fillStyle = 'rgba(255,225,225,0.85)';
      for (const [x, y, w] of [[1, 0, 3], [0, 1, 5], [0, 2, 1], [2, 2, 1], [4, 2, 1], [1, 3, 3], [1, 4, 1], [3, 4, 1]]) ctx.fillRect(sx + x * u, sy + y * u, w * u, u);
    }
    if (isLaterOnly && !isAimed && !isHovered && !isBossTile) {
      ctx.save();
      ctx.setLineDash([Math.max(2, tileW * 0.06), Math.max(2, tileW * 0.06)]);
      ctx.lineWidth = Math.max(1.5, tileW * 0.04);
      ctx.strokeStyle = 'rgba(235,70,90,0.85)';
      roundRectPath(ctx, pos.x - tileW / 2 + gap * 1.6, pos.y - tileH / 2 + gap * 1.6, tileW - gap * 3.2, tileH - gap * 3.2, radius * 0.8);
      ctx.stroke();
      ctx.restore();
    }
  }
  // ...and on your own tile when the move carries you: a dash or leap toward the aim, a step back away from it
  if (isPlayerTile && aimedTiles && aimedAim && (aimedMove === 'dash' || aimedMove === 'leap' || aimedMove === 'retreat')) {
    const away = aimedMove === 'retreat' ? -1 : 1;
    const dx = Math.sign(aimedAim.col - col) * away, dy = Math.sign(aimedAim.row - row) * away;
    const at = { x: pos.x, y: pos.y };
    if (dx || dy) overlay.push(() => drawMoveArrow(ctx, at.x, at.y, dx, dy, tileW, tileH, now, '#38d6f0', blockedAt(row + dy, col + dx)));
  }
  // A defensive move: its guard outlined on whoever it covers (amber physical, violet special, white both; dashed for a counter or anchor alone),
  // a faint outline on everyone you could tap to cover instead, and an arrow where it steps you
  const go = guardOutline.get(`${row},${col}`);
  if (go || defendPick?.has(`${row},${col}`)) {
    ctx.save();
    roundRectPath(ctx, pos.x - tileW / 2 + gap + 2, pos.y - tileH / 2 + gap + 2, tileW - gap * 2 - 4, tileH - gap * 2 - 4, radius * 0.8);
    if (go) { ctx.strokeStyle = go.color; ctx.lineWidth = 3; ctx.globalAlpha = 0.75 + 0.25 * pulse; if (go.dashed) ctx.setLineDash([tileW * 0.1, tileW * 0.07]); }
    else { ctx.strokeStyle = 'rgba(134,239,172,0.6)'; ctx.lineWidth = 1.5; ctx.setLineDash([tileW * 0.06, tileW * 0.06]); }
    ctx.stroke();
    ctx.restore();
  }
  if (isPlayerTile && defendStepTo) {
    const dx = Math.sign(defendStepTo.col - col), dy = Math.sign(defendStepTo.row - row), at = { x: pos.x, y: pos.y };
    if (dx || dy) overlay.push(() => drawMoveArrow(ctx, at.x, at.y, dx, dy, tileW, tileH, now, '#38d6f0'));
  }
  if (defendStepTo && defendStepTo.row === row && defendStepTo.col === col) {
    ctx.save();
    roundRectPath(ctx, pos.x - tileW / 2 + gap + 2, pos.y - tileH / 2 + gap + 2, tileW - gap * 2 - 4, tileH - gap * 2 - 4, radius * 0.8);
    ctx.strokeStyle = '#38d6f0'; ctx.lineWidth = 2; ctx.setLineDash([tileW * 0.08, tileW * 0.06]); ctx.globalAlpha = 0.85; ctx.stroke();
    ctx.restore();
  }
  // Wind: two faint streaks drifting across every tile the way it blows
  if (windNow && grid.tiles?.[row]?.[col]?.type !== 'obstacle') {
    const { dx, dy } = WIND_VEC[windNow.dir];
    const t = ((now / 900 + (row * 7 + col * 3) * 0.13) % 1);
    ctx.strokeStyle = 'rgba(235,245,250,0.32)';
    ctx.lineWidth = Math.max(1.5, tileW * 0.035);
    for (const k of [0, 0.5]) {
      const u = ((t + k) % 1) - 0.5, off = (k ? 0.18 : -0.18);
      const cx = pos.x + (dx ? u * tileW * 0.8 : off * tileW), cy = pos.y + (dy ? u * tileH * 0.8 : off * tileH);
      ctx.beginPath(); ctx.moveTo(cx - dx * tileW * 0.12, cy - dy * tileH * 0.12); ctx.lineTo(cx + dx * tileW * 0.12, cy + dy * tileH * 0.12); ctx.stroke();
    }
  }

  // Tile border - vivid glow on attack range tiles
  if (isAimed) {
    ctx.strokeStyle = attackColors.stroke;
    ctx.lineWidth = 2.5;
    // How it aims: a broken border when the hit can roll low, a second inner line when it always lands in full
    if (aimedAccuracy === 'unreliable') ctx.setLineDash([Math.max(3, tileW * 0.08), Math.max(3, tileW * 0.06)]);
    if (aimedAccuracy === 'precise') {
      ctx.save();
      const inset = Math.max(4, tileW * 0.1);
      roundRectPath(ctx, pos.x - tileW / 2 + gap + inset, pos.y - tileH / 2 + gap + inset, tileW - (gap + inset) * 2, tileH - (gap + inset) * 2, radius * 0.6);
      ctx.lineWidth = 1.5; ctx.strokeStyle = 'rgba(255,255,255,0.85)'; ctx.stroke();
      ctx.restore();
      roundRectPath(ctx, pos.x - tileW / 2 + gap, pos.y - tileH / 2 + gap, tileW - gap * 2, tileH - gap * 2, radius);
    }
  } else if (isInAttackRange) {
    // Somewhere else it could be aimed: a faint outline, tap to aim there
    ctx.strokeStyle = attackColors.stroke;
    ctx.globalAlpha = 0.45;
    ctx.lineWidth = 1.5;
  } else if (isHovered) {
    ctx.strokeStyle = '#d8c89a';
    ctx.lineWidth = 2;
  } else {
    ctx.strokeStyle = 'rgba(0,0,0,0)';
    ctx.lineWidth = 0;
  }
  if (ctx.lineWidth) ctx.stroke();
  ctx.setLineDash([]);
  ctx.globalAlpha = 1;
  // Movement options: a soft cyan marker on each reachable tile
  if (moveTiles?.has(`${row},${col}`) && !isBossTile) {
    // Red: going here hurts (parting blow, an enemy's reach, a hazard). Blue: it's safe
    const hurts = hurtTiles.has(`${row},${col}`);
    const markColor = moveColor ?? (hurts ? '#ff5a52' : '#4aa8ff');
    ctx.strokeStyle = markColor;
    ctx.lineWidth = 2;
    roundRectPath(ctx, pos.x - tileW / 2 + gap + 2, pos.y - tileH / 2 + gap + 2, tileW - gap * 2 - 4, tileH - gap * 2 - 4, radius * 0.8);
    ctx.stroke();
    ctx.fillStyle = markColor;
    ctx.beginPath();
    ctx.arc(pos.x, pos.y, Math.max(3, tileW * 0.06), 0, Math.PI * 2);
    ctx.fill();
  }

  // A part torn off the King, waiting for whoever gets there first
  const loose = kingNow?.loose.find(l => l.pos.row === row && l.pos.col === col);
  if (loose) drawLoosePart(ctx, loose.id, pos.x, pos.y, tileW, now);

  // Draw obstacles and hazards with simple markers
  const tile = grid.tiles?.[row]?.[col];
  if (tile?.type === 'obstacle' && hasCover(tile.art)) {
    // Drawn as what it is, standing up, in depth order with the units
    const art = tile.art, x = pos.x, y = pos.y;
    depth.push({ y, draw: () => { drawObstacle(ctx, art, x, y, tileW); } });
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

// One light over the whole floor: a touch brighter at the back, darker at the front
if (cells.length) {
  drawSeams(ctx, cells, tileset.floor.seam);
  const top = cells[0].y, bottom = cells[cells.length - 1].y + tileH;
  ctx.save();
  ctx.beginPath();
  for (const c of cells) tilePath(ctx, c.x, c.y, c.w, c.h, c.open, cornerR);
  ctx.clip();
  const light = ctx.createLinearGradient(0, top, 0, bottom);
  light.addColorStop(0, 'rgba(255,250,235,0.07)');
  light.addColorStop(1, 'rgba(0,0,0,0.16)');
  ctx.fillStyle = light;
  ctx.fillRect(0, top, width, bottom - top);
  ctx.restore();
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
// Characters stand about 1.45 tiles tall, over the tile behind them, feet where the shadow is
const DOLL = 1.45;
const spriteSize = Math.max(tileW * DOLL, 34);
const dollTop = (cy: number, size: number) => cy + tileH * 0.36 - size + size / 48 * 2;
const playerFacingLeft = grid.playerPosition.col > grid.bossPosition.col;

depth.push({ y: playerPos.y, draw: () => {
drawFootShadow(ctx, playerPos.x, playerPos.y + tileH * 0.36, tileW);
// The host: its firmware's body, wearing what it has fitted
const owned = useAugmentTrees.getState().owned;
const hostSpec = hostDoll(playerClass, useInventory.getState().equippedAugmentations as Record<string, any>, it => owned[it.id]?.length ?? 0);
const pTop = dollTop(playerPos.y, spriteSize);
drawDoll(ctx, hostSpec, playerPos.x - spriteSize / 2, pTop, spriteSize, playerAnimator.current.getState(), playerAnimator.current.getFrame(), playerFacingLeft);

drawStatus(ctx, playerPos.x, pTop + spriteSize * 0.12, spriteSize * 0.8, playerBurning > 0, playerStunned, now);
if (useCombat.getState().playerSwimming) drawSwimming(ctx, playerPos.x, pTop + spriteSize * 0.12, spriteSize * 0.8, tileset.sea, now);
} });

overlay.push(() => {
// Player HP bar below character
const playerHpPercent = player.currentHp / player.maxHp;
const barWidth = tileW * 0.9;
const barY = playerPos.y + tileH / 2 + 5;

// Health, and the structure bar under it
const playerSf = player.maxStructuralHp > 0 ? player.currentStructuralHp / player.maxStructuralHp : null;
drawUnitBar(ctx, playerPos.x, barY, barWidth, playerHpPercent, '#4ade80', playerSf);
const gain = defendGain.get('player');
if (gain) {
  drawGainFlash(ctx, playerPos.x, barY, barWidth, UNIT_BAR.h, playerHpPercent, gain.now, gain.later, now);
  // Repairs flash on the structure bar while you choose
  if ((gain.sNow || gain.sLater) && playerSf !== null) drawGainFlash(ctx, playerPos.x, barY + UNIT_BAR.h + UNIT_BAR.gap, barWidth, UNIT_BAR.s, playerSf, gain.sNow, gain.sLater, now);
}
});

// Allies: a host body in the ally's colour ring, with a bar in its colour
allies.forEach((a, k) => {
if (a.unit.currentHp <= 0) return;
const ap = gridToScreen(a.pos.row, a.pos.col, width, height);
const color = a.unit.spriteColor || '#38d6f0';
depth.push({ y: ap.y, draw: () => {
drawFootShadow(ctx, ap.x, ap.y + tileH * 0.36, tileW);
ctx.save();
ctx.strokeStyle = color;
ctx.lineWidth = allyMoveMode === k ? 3 : 2;
ctx.globalAlpha = allyMoveMode === k ? 0.6 + 0.4 * pulse : 0.9;
ctx.beginPath();
ctx.ellipse(ap.x, ap.y + tileH * 0.32, tileW * 0.42, tileH * 0.16, 0, 0, Math.PI * 2);
ctx.stroke();
ctx.restore();
const size = Math.max(tileW * DOLL, 34);
const aTop = dollTop(ap.y, size);
ctx.save();
ctx.globalAlpha = a.acted ? 0.7 : 1;
drawDoll(ctx, allyDoll(a.id, a.unit), ap.x - size / 2, aTop, size, allyAnimator.current.getState(), allyAnimator.current.getFrame(), a.pos.col > grid.bossPosition.col);
drawStatus(ctx, ap.x, aTop + size * 0.12, size * 0.8, a.burning > 0, a.stunned, now);
if (a.swimming) drawSwimming(ctx, ap.x, aTop + size * 0.12, size * 0.8, tileset.sea, now);
ctx.restore();
} });
overlay.push(() => {
const size = Math.max(tileW * DOLL, 34);
const bw = tileW * 0.9, by = ap.y + tileH / 2 + 5;
drawUnitBar(ctx, ap.x, by, bw, a.unit.currentHp / a.unit.maxHp, color, a.unit.maxStructuralHp > 0 ? a.unit.currentStructuralHp / a.unit.maxStructuralHp : null);
const ag = defendGain.get(`ally:${k}`);
if (ag) drawGainFlash(ctx, ap.x, by, bw, 5, a.unit.currentHp / a.unit.maxHp, ag.now, ag.later, now);
ctx.font = `700 ${Math.max(10, Math.floor(tileW * 0.2))}px Manrope, sans-serif`;
ctx.textAlign = 'center';
ctx.textBaseline = 'bottom';
ctx.lineWidth = 3;
ctx.strokeStyle = '#000';
ctx.strokeText(a.unit.name, ap.x, dollTop(ap.y, size) + size * 0.1);
ctx.fillStyle = color;
ctx.fillText(a.unit.name, ap.x, dollTop(ap.y, size) + size * 0.1);
});
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
const size = Math.max(tileW * DOLL, 34);
const fTop = dollTop(fp.y, size);

depth.push({ y: fp.y, draw: () => {
drawFootShadow(ctx, fp.x, fp.y + tileH * 0.36, tileW);
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
drawDoll(ctx, foeDoll(f.unit, f.parts), fp.x - size / 2 + stumble.x, fTop + stumble.y, size,
v.animator.getState(), v.animator.getFrame(), f.pos.col > grid.playerPosition.col);
ctx.restore();
drawStatus(ctx, fp.x, fTop + size * 0.12, size * 0.8, f.burning > 0, f.stunned, now);
if (f.swimming) drawSwimming(ctx, fp.x, fTop + size * 0.12, size * 0.8, tileset.sea, now);
} });
overlay.push(() => {
const barW = tileW * 0.9, barY = fp.y + tileH / 2 + 5;
drawUnitBar(ctx, fp.x, barY, barW, f.unit.currentHp / f.unit.maxHp, living.length > 1 ? (f.unit.spriteColor || '#ef4444') : '#ef4444', f.unit.maxStructuralHp > 0 ? f.unit.currentStructuralHp / f.unit.maxStructuralHp : null);
// The health this hit will take flashes on the bar: bright for what it will surely take, faint for what it might
const pv = phase === 'player_turn' ? hitPreview.get(i) : undefined;
if (pv && f.unit.maxHp > 0) {
  const hp = f.unit.currentHp, x0 = fp.x - barW / 2, at = (v: number) => x0 + barW * Math.max(0, Math.min(1, v / f.unit.maxHp));
  const blink = 0.5 + 0.5 * Math.sin(now / 160);
  ctx.save();
  ctx.fillStyle = `rgba(255,255,255,${0.25 + 0.2 * blink})`;
  ctx.fillRect(at(hp - pv.max), barY, at(hp - pv.min) - at(hp - pv.max), 5);
  ctx.fillStyle = `rgba(255,255,255,${0.55 + 0.4 * blink})`;
  ctx.fillRect(at(hp - pv.min), barY, at(hp) - at(hp - pv.min), 5);
  // ...and the structure it will wear away, on the thin bar under it
  if (f.unit.maxStructuralHp > 0 && pv.sMax > 0) {
    const sp = f.unit.currentStructuralHp, sy = barY + UNIT_BAR.h + UNIT_BAR.gap, sat = (v: number) => x0 + barW * Math.max(0, Math.min(1, v / f.unit.maxStructuralHp));
    ctx.fillStyle = `rgba(255,255,255,${0.25 + 0.2 * blink})`;
    ctx.fillRect(sat(sp - pv.sMax), sy, sat(sp - pv.sMin) - sat(sp - pv.sMax), UNIT_BAR.s);
    ctx.fillStyle = `rgba(255,255,255,${0.55 + 0.4 * blink})`;
    ctx.fillRect(sat(sp - pv.sMin), sy, sat(sp) - sat(sp - pv.sMin), UNIT_BAR.s);
  }
  ctx.restore();
}
// A shove or a drag: the arrow on the edge it will cross, stopped by a bar if something's in the way
if (pv !== undefined || (struckFoes?.has(i) && phase === 'player_turn')) {
  if (aimedMove === 'push' || aimedMove === 'pull') {
    const away = aimedMove === 'push' ? 1 : -1;
    const dx = Math.sign(f.pos.col - attackFrom.col) * away, dy = Math.sign(f.pos.row - attackFrom.row) * away;
    const c = gridToScreen(f.pos.row, f.pos.col, width, height);
    if (dx || dy) drawMoveArrow(ctx, c.x, c.y, dx, dy, tileW, tileH, now, '#ffffff', aimedMove === 'push' && blockedAt(f.pos.row + dy, f.pos.col + dx));
  }
}

// "Hit" over every enemy the current aim lands on (only as many as its targeting part locks)
if ((struckFoes ? struckFoes.has(i) : aimedTiles?.has(`${f.pos.row},${f.pos.col}`)) && phase === 'player_turn') {
const label = 'Hit';
ctx.font = '700 13px Manrope, sans-serif';
ctx.textAlign = 'center';
ctx.fillStyle = '#22c55e';
ctx.strokeStyle = '#000';
ctx.lineWidth = 3;
const ly = Math.max(14, fp.y - tileH * 0.8); // never above the board's top
ctx.strokeText(label, fp.x, ly);
ctx.fillText(label, fp.x, ly);
}
});
}

// Back to front: whatever stands nearer the bottom covers what's behind it
depth.sort((a, b) => a.y - b.y).forEach(d => d.draw());
overlay.forEach(o => o());

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