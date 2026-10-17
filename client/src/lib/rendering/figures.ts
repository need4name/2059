// Pixel-art people. Every character is a 32x32 figure built from parts (build,
// head, arms, legs, chest extras, weapon) described in content/figures.json,
// so each faction, ally and the player's host reads differently at a glance
// while sharing one set of animations. Frames are painted once and cached.

import data from '../../content/figures.json';
import type { AnimationState } from './pixelSprites';

export interface FigureSpec {
  build: 'slim' | 'medium' | 'heavy' | 'hunched';
  skin: string; cloth: string; accent: string; eyes: string; hair: string;
  head: 'bare' | 'hood' | 'helmet' | 'visor' | 'mask' | 'surgical' | 'cap' | 'scarf' | 'crown' | 'blank';
  arms: [ArmKind, ArmKind];
  legs: 'flesh' | 'metal';
  chest: string[];
  weapon: 'none' | 'hook' | 'baton' | 'gun' | 'scalpel' | 'shield';
}
export type ArmKind = 'flesh' | 'metal' | 'crane' | 'claw' | 'blade' | 'pump';

export const FIGURES = (data as unknown as { figures: Record<string, FigureSpec> }).figures;
export const HEAD_KINDS = ['bare', 'hood', 'helmet', 'visor', 'mask', 'surgical', 'cap', 'scarf', 'crown', 'blank'] as const;
export const ARM_KINDS = ['flesh', 'metal', 'crane', 'claw', 'blade', 'pump'] as const;
export const CHEST_KINDS = ['chip', 'rags', 'belt', 'stripes', 'pump', 'robe', 'antenna', 'stitches', 'apron', 'tank', 'badge', 'pads', 'number', 'chain', 'coat', 'cape', 'cross'] as const;
export const WEAPON_KINDS = ['none', 'hook', 'baton', 'gun', 'scalpel', 'shield'] as const;

const S = 32;
const OUTLINE = '#0a0f14';
const METAL = '#8a96a0', METAL_DARK = '#4a545c', METAL_LIT = '#b8c4cc';

/** Lighten (amt > 0) or darken (amt < 0) a hex colour. */
function shade(hex: string, amt: number): string {
  const n = parseInt(hex.slice(1), 16);
  const f = (c: number) => Math.max(0, Math.min(255, Math.round(c + (amt > 0 ? (255 - c) * amt : c * amt))));
  return `#${[(n >> 16) & 255, (n >> 8) & 255, n & 255].map(c => f(c).toString(16).padStart(2, '0')).join('')}`;
}

type Grid = (string | null)[][];

/** Paint one frame of a figure into a 32x32 grid of colours. */
export function paintFigure(spec: FigureSpec, state: AnimationState, frame: number): Grid {
  const g: Grid = Array.from({ length: S }, () => Array(S).fill(null));
  const px = (x: number, y: number, c: string) => { x = Math.round(x); y = Math.round(y); if (x >= 0 && y >= 0 && x < S && y < S) g[y][x] = c; };
  const rect = (x: number, y: number, w: number, h: number, c: string) => { for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) px(x + i, y + j, c); };
  const oval = (cx: number, cy: number, rx: number, ry: number, c: string) => {
    for (let y = -ry; y <= ry; y++) for (let x = -rx; x <= rx; x++) if ((x * x) / (rx * rx + 0.3) + (y * y) / (ry * ry + 0.3) <= 1) px(cx + x, cy + y, c);
  };

  // Pose from the animation state
  const f = frame;
  let dx = 0, by = 0, legPhase = 0, reach = 0, guard = false;
  if (state === 'idle') by = f % 2;
  else if (state === 'walk') { by = f % 2; legPhase = [0, 1, 0, -1, 0, 1][f % 6]; }
  else if (state === 'attack') { dx = [0, 1, 3, 2, 1][f % 5]; reach = f >= 1 && f <= 3 ? 1 : 0; }
  else if (state === 'defend') { by = 1; guard = true; }
  else if (state === 'hurt') dx = [-2, -1, 0][f % 3];

  const wide = { slim: 7, medium: 9, heavy: 11, hunched: 9 }[spec.build];
  const hunch = spec.build === 'hunched' ? 2 : 0;
  const tl = Math.round(15.5 - wide / 2) + dx, tr = tl + wide - 1;
  const cx = Math.round((tl + tr) / 2);
  const top = 13 + by + hunch, bot = (spec.build === 'heavy' ? 22 : 21) + by;
  const hx = cx + hunch + (spec.build === 'heavy' ? 0 : 0), hy = 8 + by + hunch;
  const cloth = spec.cloth, clothDark = shade(cloth, -0.35), clothLit = shade(cloth, 0.2);
  const skin = spec.skin, skinDark = shade(skin, -0.3);
  const has = (k: string) => spec.chest.includes(k);

  // ── Behind the body ──
  if (has('cape')) for (let y = top; y <= 28; y++) rect(tl - 2 - Math.floor((y - top) / 5), y, wide + 2 + Math.floor((y - top) / 5), 1, clothDark);
  if (has('tank')) { rect(tl - 3, top + 1, 3, 7, spec.accent); rect(tl - 3, top + 1, 1, 7, shade(spec.accent, -0.3)); px(tl - 2, top, METAL_DARK); }

  // ── Arms (back arm first, darker) ──
  const arm = (kind: ArmKind, front: boolean) => {
    const x0 = front ? tr : tl - 2;
    const dim = (c: string) => (front ? c : shade(c, -0.25));
    const y0 = top + 1;
    const forward = front && (reach || (guard && false));
    if (forward) {
      // Thrust forward at shoulder height
      const len = kind === 'crane' || kind === 'blade' ? 8 : 6;
      const armCol = kind === 'flesh' ? cloth : kind === 'pump' ? spec.accent : METAL;
      rect(tr, y0 + 1, len, 2, dim(armCol));
      const hx2 = tr + len;
      if (kind === 'blade') rect(hx2, y0 + 1, 4, 1, METAL_LIT);
      else if (kind === 'claw') { px(hx2, y0, METAL_LIT); px(hx2, y0 + 3, METAL_LIT); px(hx2 + 1, y0 + 1, METAL_LIT); }
      else if (kind === 'crane') { rect(hx2, y0, 1, 4, spec.accent); px(hx2 - 1, y0 + 4, spec.accent); }
      else rect(hx2, y0 + 1, 2, 2, kind === 'flesh' ? skin : METAL_DARK);
      return;
    }
    if (kind === 'flesh') {
      rect(x0, y0, 3, 5, dim(cloth)); rect(x0, y0 + 5, 3, 3, dim(skin)); rect(x0, y0 + 8, 3, 1, dim(skinDark));
    } else if (kind === 'metal') {
      rect(x0, y0, 3, 8, dim(METAL)); rect(x0, y0 + 3, 3, 1, dim(METAL_DARK)); px(x0 + 1, y0 + 1, METAL_LIT); rect(x0, y0 + 8, 3, 1, dim(METAL_DARK));
    } else if (kind === 'crane') {
      rect(x0, y0, 4, 11, dim(METAL)); rect(x0, y0 + 4, 4, 1, dim(METAL_DARK)); px(x0 + 1, y0 + 1, METAL_LIT);
      rect(x0 + 1, y0 + 11, 1, 3, spec.accent); px(x0 + 2, y0 + 14, spec.accent); px(x0 + 3, y0 + 13, spec.accent);
    } else if (kind === 'claw') {
      rect(x0, y0, 3, 5, dim(cloth)); rect(x0, y0 + 5, 3, 3, dim(METAL));
      px(x0, y0 + 8, METAL_LIT); px(x0 + 1, y0 + 9, METAL_LIT); px(x0 + 2, y0 + 8, METAL_LIT); px(x0 + 2, y0 + 10, METAL_LIT); px(x0, y0 + 10, METAL_LIT);
    } else if (kind === 'blade') {
      rect(x0, y0, 3, 7, dim(METAL)); rect(x0, y0 + 3, 3, 1, dim(METAL_DARK));
      rect(x0 + 1, y0 + 7, 1, 6, METAL_LIT); px(x0 + 1, y0 + 13, '#ffffff');
    } else if (kind === 'pump') {
      rect(x0, y0, 4, 8, dim(spec.accent)); rect(x0, y0 + 2, 4, 1, dim(shade(spec.accent, -0.4))); rect(x0, y0 + 5, 4, 1, dim(shade(spec.accent, -0.4)));
      rect(x0 + 1, y0 + 8, 2, 1, dim(skin));
    }
  };
  arm(spec.arms[0], false);

  // ── Legs ──
  const legCol = spec.legs === 'metal' ? METAL : clothDark;
  const legTop = bot + 1;
  const leg = (x: number, shift: number, back: boolean) => {
    const c = back ? shade(legCol, -0.2) : legCol;
    rect(x + shift, legTop, 3, 28 - legTop, c);
    if (spec.legs === 'metal') px(x + shift + 1, legTop + 2, METAL_LIT);
    rect(x + shift, 28, 4, 2, back ? '#14181c' : '#1e2328');
  };
  leg(cx - 3, -legPhase, true);
  leg(cx + 1, legPhase, false);

  // ── Torso, shaded left to right ──
  rect(tl, top, wide, bot - top + 1, cloth);
  rect(tl, top, 1, bot - top + 1, clothDark);
  rect(tr, top, 1, bot - top + 1, clothLit);
  rect(tl + 1, top, wide - 2, 1, clothLit);
  if (has('coat') || has('robe')) { rect(tl, bot + 1, wide, has('robe') ? 6 : 5, has('robe') ? cloth : clothDark); px(cx, bot + 3, clothDark); px(cx, bot + 4, clothDark); }
  if (has('apron')) rect(tl + 2, top + 3, wide - 4, bot - top + 4, shade(cloth, 0.35));
  if (has('rags')) for (let i = 0; i < wide; i += 2) px(tl + i, bot + 1, clothDark);
  if (has('stripes')) { rect(tl + 1, top + 3, wide - 2, 1, spec.accent); rect(tl + 1, top + 6, wide - 2, 1, spec.accent); }
  if (has('belt')) { rect(tl, bot - 1, wide, 1, '#1a1e22'); px(cx, bot - 1, spec.accent); }
  if (has('pump')) { const py = top + 4; rect(cx - 1, py - 1, 3, 3, '#1a2626'); px(cx, py, spec.accent); px(cx - 1, py - 1, shade(spec.accent, 0.4)); rect(cx + 2, py - 3, 1, 3, spec.accent); }
  if (has('badge')) px(tl + 2, top + 2, spec.accent);
  if (has('number')) { px(cx - 1, top + 3, '#1a1a14'); px(cx + 1, top + 3, '#1a1a14'); px(cx - 1, top + 4, '#1a1a14'); px(cx + 1, top + 4, '#1a1a14'); px(cx, top + 4, '#1a1a14'); }
  if (has('chain')) for (let i = 1; i < wide - 1; i += 2) px(tl + i, top + 2 + (i % 4 === 1 ? 1 : 0), spec.accent);
  if (has('stitches')) for (let i = 0; i < 4; i++) px(tl + 2 + i, top + 3 + (i % 2), '#2a0e0e');
  if (has('cross')) { rect(cx - 1, top + 3, 3, 1, spec.accent); rect(cx, top + 2, 1, 3, spec.accent); }
  if (has('pads')) { rect(tl - 2, top, 3, 2, shade(cloth, 0.15)); rect(tr, top, 3, 2, shade(cloth, 0.15)); }

  // ── Head ──
  const hr = spec.build === 'heavy' ? 4 : 3;
  rect(hx - 1, hy + 3, 3, top - (hy + 3), skinDark); // neck
  const face = () => { oval(hx, hy, hr, 4, skin); rect(hx - hr, hy - 1, 1, 4, skinDark); };
  const eyes = (c = spec.eyes) => { px(hx + 1, hy, c); px(hx + 3, hy, c); };
  switch (spec.head) {
    case 'bare': face(); rect(hx - hr, hy - 4, hr * 2 + 1, 2, spec.hair); px(hx - hr, hy - 2, spec.hair); eyes(); px(hx + 2, hy + 2, skinDark); break;
    case 'hood': oval(hx, hy, hr + 1, 5, clothDark); oval(hx + 1, hy + 1, hr - 1, 3, '#14181c'); eyes(); break;
    case 'helmet': face(); oval(hx, hy - 2, hr + 1, 3, spec.hair); rect(hx - hr - 1, hy - 1, hr * 2 + 3, 1, shade(spec.hair, -0.3)); eyes(); break;
    case 'visor': oval(hx, hy, hr, 4, shade(cloth, -0.2)); rect(hx - 1, hy - 1, hr + 3, 2, spec.accent); px(hx + hr, hy - 1, shade(spec.accent, 0.5)); break;
    case 'mask': oval(hx, hy, hr, 4, '#c8ccc4'); rect(hx, hy, hr + 2, 1, spec.accent); rect(hx - hr, hy - 1, 1, 4, '#8a8e86'); break;
    case 'surgical': face(); oval(hx, hy - 3, hr, 2, shade(cloth, 0.2)); rect(hx - 1, hy + 1, hr + 2, 3, spec.accent); eyes(); break;
    case 'cap': face(); rect(hx - hr, hy - 4, hr * 2 + 1, 2, cloth); rect(hx, hy - 2, hr + 3, 1, clothDark); px(hx - 1, hy - 3, spec.accent); eyes(); break;
    case 'scarf': face(); oval(hx - 1, hy - 2, hr, 3, cloth); rect(hx - hr, hy + 1, hr * 2 + 2, 3, clothDark); eyes(); break;
    case 'crown': face(); rect(hx - hr, hy - 4, hr * 2 + 1, 1, spec.accent); for (let i = -hr; i <= hr; i += 2) px(hx + i, hy - 5, spec.accent); px(hx + 1, hy, spec.eyes); px(hx + 3, hy, '#ff3a3a'); break;
    case 'blank': oval(hx, hy, hr, 4, skin); rect(hx - hr, hy - 1, 1, 4, skinDark); px(hx + 2, hy, shade(skin, 0.25)); break;
  }
  if (has('antenna')) { rect(hx - 2, hy - 8, 1, 4, METAL_DARK); px(hx - 2, hy - 9, spec.accent); }
  if (has('chip')) { px(hx - hr - 1, hy + 3, spec.accent); px(hx - hr, hy + 3, shade(spec.accent, 0.5)); px(hx - hr - 1, hy + 2, shade(spec.accent, -0.2)); }

  // ── Front arm and weapon ──
  arm(spec.arms[1], true);
  const hand = reach ? { x: tr + 6, y: top + 2 } : { x: tr + 1, y: top + 9 };
  switch (spec.weapon) {
    case 'hook': rect(hand.x + 1, hand.y - 1, 1, 4, METAL_LIT); px(hand.x + 2, hand.y + 3, METAL_LIT); px(hand.x + 3, hand.y + 2, METAL_LIT); break;
    case 'baton': rect(hand.x + 1, hand.y - 3, 1, 6, '#2a2e32'); px(hand.x + 1, hand.y - 4, spec.accent); break;
    case 'gun': rect(hand.x + 1, hand.y, 4, 1, '#22262a'); rect(hand.x + 1, hand.y + 1, 1, 2, '#22262a'); break;
    case 'scalpel': rect(hand.x + 1, hand.y, 3, 1, METAL_LIT); break;
    case 'shield': {
      const sx = guard ? tr + 1 : tr + 2;
      rect(sx, top - 1, 3, 12, shade(cloth, 0.1)); rect(sx, top - 1, 3, 1, spec.accent); rect(sx + 2, top - 1, 1, 12, spec.accent); px(sx + 1, top + 4, spec.accent);
      break;
    }
  }

  // ── Outline: one dark pixel round the whole silhouette ──
  const out: Grid = g.map(r => r.slice());
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    if (g[y][x]) continue;
    if ((g[y - 1]?.[x]) || (g[y + 1]?.[x]) || g[y][x - 1] || g[y][x + 1]) out[y][x] = OUTLINE;
  }
  return out;
}

// ── Drawing ──────────────────────────────────────────────────────────────────

const cache = new Map<string, HTMLCanvasElement>();
function frameCanvas(id: string, spec: FigureSpec, state: AnimationState, frame: number): HTMLCanvasElement {
  const key = `${id}:${state}:${frame}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const c = document.createElement('canvas');
  c.width = S; c.height = S;
  const ctx = c.getContext('2d')!;
  const grid = paintFigure(spec, state, frame);
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) { const col = grid[y][x]; if (col) { ctx.fillStyle = col; ctx.fillRect(x, y, 1, 1); } }
  cache.set(key, c);
  return c;
}

/** Draw a character by id (an enemy's name, an ally's id, or 'host'). Faces right unless flipped. */
export function drawFigure(ctx: CanvasRenderingContext2D, id: string, x: number, y: number, size: number, state: AnimationState, frame: number, faceLeft = false) {
  const spec = FIGURES[id] ?? FIGURES.host;
  const img = frameCanvas(FIGURES[id] ? id : 'host', spec, state, frame);
  ctx.save();
  const smooth = ctx.imageSmoothingEnabled;
  ctx.imageSmoothingEnabled = false;
  if (faceLeft) { ctx.translate(x + size, y); ctx.scale(-1, 1); ctx.drawImage(img, 0, 0, size, size); }
  else ctx.drawImage(img, x, y, size, size);
  ctx.imageSmoothingEnabled = smooth;
  ctx.restore();
}
