// The board, in pixel art. Chapter one is a raft lashed together from plastic
// on the Indian Ocean: crate plates, bleached sheeting, bundled bottles and tarp,
// with hazards and cover drawn as what they are. Every sprite is painted once,
// pixel by pixel, at 16x16 and scaled up with smoothing off; animated ones
// (fire, sparks, bubbles) have a few frames.

import type { Tileset } from '../combat/chapters';

type Ctx = CanvasRenderingContext2D;
const N = 16;

/** A stable 0..1 number, so tiles keep their look between frames. */
const hash = (a: number, b: number, salt = 0) => {
  const n = Math.sin(a * 127.1 + b * 311.7 + salt * 74.7) * 43758.5453;
  return n - Math.floor(n);
};

// ── Sprite cache ─────────────────────────────────────────────────────────────

type Paint = (px: (x: number, y: number, c: string) => void) => void;
const cache = new Map<string, HTMLCanvasElement>();
function sprite(key: string, paint: Paint, outline?: string): HTMLCanvasElement {
  const hit = cache.get(key);
  if (hit) return hit;
  const c = document.createElement('canvas');
  c.width = N; c.height = N;
  const g = c.getContext('2d')!;
  paint((x, y, col) => { if (x >= 0 && y >= 0 && x < N && y < N) { g.fillStyle = col; g.fillRect(x, y, 1, 1); } });
  if (outline) {
    // A one-pixel dark outline round the shape, so cover stands off the deck
    const d = g.getImageData(0, 0, N, N).data;
    const solid = (x: number, y: number) => x >= 0 && y >= 0 && x < N && y < N && d[(y * N + x) * 4 + 3] > 0;
    g.fillStyle = outline;
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) if (!solid(x, y) && (solid(x + 1, y) || solid(x - 1, y) || solid(x, y + 1) || solid(x, y - 1))) g.fillRect(x, y, 1, 1);
  }
  cache.set(key, c);
  return c;
}
function blit(ctx: Ctx, img: HTMLCanvasElement, x: number, y: number, w: number, h: number) {
  const smooth = ctx.imageSmoothingEnabled;
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(img, x, y, w, h);
  ctx.imageSmoothingEnabled = smooth;
}
const rect = (px: (x: number, y: number, c: string) => void, x0: number, y0: number, w: number, h: number, c: string) => {
  for (let y = y0; y < y0 + h; y++) for (let x = x0; x < x0 + w; x++) px(x, y, c);
};
const disc = (px: (x: number, y: number, c: string) => void, cx: number, cy: number, r: number, c: string) => {
  for (let y = -r; y <= r; y++) for (let x = -r; x <= r; x++) if (x * x + y * y <= r * r + r * 0.6) px(cx + x, cy + y, c);
};

// ── Sea ──────────────────────────────────────────────────────────────────────

/** Open sea behind and between the decks: chunky pixel swell drifting sideways. */
export function drawSea(ctx: Ctx, w: number, h: number, t: Tileset, now: number) {
  const g = ctx.createLinearGradient(0, 0, 0, h);
  g.addColorStop(0, t.sea.top);
  g.addColorStop(1, t.sea.bottom);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
  const P = 4; // one sea pixel
  ctx.save();
  for (let i = 0; i < 34; i++) {
    const speed = 0.4 + hash(i, 4) * 0.8;
    const y = Math.floor(((hash(i, 1) * h + now / 140 * speed * 0.3) % h) / P) * P;
    const x = Math.floor(((((hash(i, 3) * w + now / 70 * speed) % (w + 60)) + w + 60) % (w + 60) - 30) / P) * P;
    const len = (3 + Math.floor(hash(i, 5) * 6)) * P;
    ctx.globalAlpha = 0.12 + 0.14 * hash(i, 6);
    ctx.fillStyle = t.sea.foam;
    ctx.fillRect(x, y, len, P);
    ctx.fillRect(x + P, y - P, len - 2 * P, P);
  }
  // Far raft silhouettes on the horizon
  ctx.globalAlpha = 0.4;
  ctx.fillStyle = '#081c24';
  for (let i = 0; i < 4; i++) {
    const x = Math.floor(hash(i, 9) * w / P) * P, y = 12 + Math.floor(hash(i, 10) * 4) * P, rw = (6 + Math.floor(hash(i, 11) * 10)) * P;
    ctx.fillRect(x, y, rw, P);
    ctx.fillRect(x + Math.floor(rw / 3 / P) * P, y - 2 * P, P, 2 * P);
  }
  ctx.restore();
}

// ── Deck ─────────────────────────────────────────────────────────────────────
// The board is one slab: plates butt up against each other with a thin seam,
// the outside corners are rounded, and the open edges show the slab's side and
// throw a shadow on whatever is below. The floor stays plain, so it never
// competes with what matters (units, cover, hazards, reach); the only
// variation is a faint checker to help count tiles.

/** Which sides of a tile have no tile next to them. */
export interface Open { up: boolean; down: boolean; left: boolean; right: boolean }

function deckSprite(t: Tileset, shade: 0 | 1): HTMLCanvasElement {
  return sprite(`deck:${shade}:${t.floor.light}:${t.floor.pattern ?? ''}`, px => {
    const body = shade ? t.floor.dark : t.floor.light;
    rect(px, 0, 0, N, N, body);
    // A few worn pixels so the plate reads as a surface, not a flat fill
    for (let y = 2; y < N - 2; y++) for (let x = 2; x < N - 2; x++) {
      const h = hash(x, y, 3 + shade);
      if (h > 0.97) px(x, y, 'rgba(255,255,255,0.05)');
      else if (h < 0.025) px(x, y, 'rgba(0,0,0,0.06)');
    }
    pressPattern(px, t.floor.pattern, shade);
    // The seams between plates are drawn as hairlines over the board
  });
}

const HI = 'rgba(255,255,255,0.07)', LO = 'rgba(0,0,0,0.13)';
/** The moulding pressed into a plate: faint light-and-shadow pairs, never a new colour. */
function pressPattern(px: (x: number, y: number, c: string) => void, pattern: Tileset['floor']['pattern'], shade: 0 | 1) {
  switch (pattern) {
    case 'plastic':
      // A crate lid: a raised rim, and a lashing hole in each corner
      for (let i = 2; i < N - 2; i++) { px(i, 2, HI); px(2, i, HI); px(i, N - 3, LO); px(N - 3, i, LO); }
      for (const [x, y] of [[1, 1], [N - 2, 1], [1, N - 2], [N - 2, N - 2]]) px(x, y, 'rgba(0,0,0,0.22)');
      break;
    case 'boards':
      // Three planks, staggered nails
      for (const y of [5, 10]) for (let x = 0; x < N; x++) { px(x, y, LO); px(x, y + 1, HI); }
      for (const [x, y] of [[2 + shade * 9, 2], [12 - shade * 9, 7], [2 + shade * 9, 13]]) px(x, y, 'rgba(0,0,0,0.25)');
      break;
    case 'ward':
      // Four small clinical tiles with grout between
      for (let i = 0; i < N; i++) { px(i, 8, LO); px(8, i, LO); px(i, 9, HI); px(9, i, HI); }
      break;
    case 'steel':
      // Tread plate: little raised bars, alternating direction
      for (let y = 2; y < N - 1; y += 4) for (let x = 2; x < N - 1; x += 4) {
        const flip = ((x + y) / 4) % 2;
        px(x, y, HI); px(x + (flip ? -1 : 1), y + 1, LO);
      }
      break;
    case 'panel':
      // An inset service panel held down by four screws
      for (let i = 3; i < N - 3; i++) { px(i, 3, LO); px(3, i, LO); px(i, N - 4, HI); px(N - 4, i, HI); }
      for (const [x, y] of [[1, 1], [N - 2, 1], [1, N - 2], [N - 2, N - 2]]) { px(x, y, 'rgba(255,255,255,0.12)'); px(x, y + 1, LO); }
      break;
  }
}

/** A path round one tile, rounding only the corners on the outside of the slab. */
export function tilePath(ctx: Ctx, x: number, y: number, w: number, h: number, open: Open, r: number) {
  const tl = open.up && open.left ? r : 0, tr = open.up && open.right ? r : 0;
  const br = open.down && open.right ? r : 0, bl = open.down && open.left ? r : 0;
  ctx.moveTo(x + tl, y);
  ctx.lineTo(x + w - tr, y); if (tr) ctx.arcTo(x + w, y, x + w, y + tr, tr);
  ctx.lineTo(x + w, y + h - br); if (br) ctx.arcTo(x + w, y + h, x + w - br, y + h, br);
  ctx.lineTo(x + bl, y + h); if (bl) ctx.arcTo(x, y + h, x, y + h - bl, bl);
  ctx.lineTo(x, y + tl); if (tl) ctx.arcTo(x, y, x + tl, y, tl);
  ctx.closePath();
}

const mix = (hex: string, k: number) => {
  // Darken (k < 1) or lighten (k > 1) a #rrggbb colour
  const n = parseInt(hex.slice(1), 16);
  const c = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map(v => Math.max(0, Math.min(255, Math.round(k > 1 ? v + (255 - v) * (k - 1) : v * k))));
  return `rgb(${c[0]},${c[1]},${c[2]})`;
};

/** How deep the slab's side is, for a given tile size. */
export const slabDepth = (s: number) => Math.round(s * 0.2);

/**
 * Under the tiles: the slab's shadow on the ground below, then its side wherever
 * a tile has nothing in front of it. Call before drawing any tile.
 */
export function drawSlab(ctx: Ctx, cells: { x: number; y: number; w: number; h: number; open: Open }[], t: Tileset, r: number) {
  if (!cells.length) return;
  const s = cells[0].w, d = slabDepth(s);
  // One shadow for the whole slab, cast down and to the right
  ctx.save();
  ctx.beginPath();
  for (const c of cells) tilePath(ctx, c.x + d * 0.5, c.y + d * 1.6, c.w, c.h, c.open, r);
  ctx.fillStyle = 'rgba(0,0,0,0.38)';
  ctx.filter = `blur(${Math.max(2, d * 0.5)}px)`;
  ctx.fill();
  ctx.restore();
  // The side: a darker face of the same material with a lit lip and a few lashings
  const face = mix(t.floor.dark, 0.55), lip = mix(t.floor.light, 0.8), foot = mix(t.floor.dark, 0.32);
  const P = Math.max(2, Math.round(s / 16));
  for (const c of cells) {
    if (!c.open.down) continue;
    ctx.save();
    ctx.beginPath();
    const bl = c.open.left ? r : 0, br = c.open.right ? r : 0;
    const y0 = c.y + c.h - r, y1 = c.y + c.h + d;
    ctx.moveTo(c.x, y0);
    ctx.lineTo(c.x + c.w, y0);
    ctx.lineTo(c.x + c.w, y1 - br); if (br) ctx.arcTo(c.x + c.w, y1, c.x + c.w - br, y1, br);
    ctx.lineTo(c.x + bl, y1); if (bl) ctx.arcTo(c.x, y1, c.x, y1 - bl, bl);
    ctx.closePath();
    ctx.clip();
    ctx.fillStyle = face; ctx.fillRect(c.x, y0, c.w, y1 - y0);
    ctx.fillStyle = lip; ctx.fillRect(c.x, c.y + c.h, c.w, P);
    ctx.fillStyle = foot; ctx.fillRect(c.x, y1 - P, c.w, P);
    // Vertical lashings where plates meet, and a pixel of wear between
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.fillRect(c.x + c.w - P, c.y + c.h, P, d);
    ctx.fillStyle = 'rgba(255,255,255,0.07)';
    ctx.fillRect(c.x + Math.round(c.w * (0.25 + hash(c.x, c.y, 8) * 0.4) / P) * P, c.y + c.h + 2 * P, P * 2, P);
    ctx.restore();
  }
}

/** One deck tile: the chapter's plain plate. */
export function drawDeckTile(ctx: Ctx, x: number, y: number, w: number, h: number, open: Open, r: number, row: number, col: number, t: Tileset) {
  ctx.save();
  ctx.beginPath();
  tilePath(ctx, x, y, w, h, open, r);
  ctx.clip();
  blit(ctx, deckSprite(t, ((row + col) % 2) as 0 | 1), x, y, w, h);
  ctx.restore();
}

/** Tidal mud: wet grey-brown silt with a puddle or two. Four versions, so no two neighbours match. */
function mudSprite(v: number): HTMLCanvasElement {
  return sprite(`mud:${v}`, px => {
    rect(px, 0, 0, N, N, v % 2 ? '#4d4638' : '#514a3b');
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
      const h = hash(x, y, 11 + v);
      if (h > 0.9) px(x, y, '#5c5443');
      else if (h < 0.06) px(x, y, '#3d372b');
    }
    // Puddles that catch the light, placed differently in each version
    const n = 1 + (v % 2);
    for (let k = 0; k < n; k++) {
      const cx = 3 + Math.floor(hash(v, k, 21) * 10), cy = 3 + Math.floor(hash(v, k, 22) * 10), r = 1 + Math.floor(hash(v, k, 23) * 2);
      disc(px, cx, cy, r, '#33494c');
      px(cx - 1, cy - 1, '#6f9aa0');
    }
  });
}

/** A mud-flat tile; `flooding` adds a pulsing waterline round it (the tide comes in next round). */
export function drawMudTile(ctx: Ctx, x: number, y: number, w: number, h: number, open: Open, r: number, row: number, col: number, flooding: boolean, now: number) {
  ctx.save();
  ctx.beginPath();
  tilePath(ctx, x, y, w, h, open, r);
  ctx.clip();
  blit(ctx, mudSprite(Math.floor(hash(row, col, 5) * 4)), x, y, w, h);
  if (flooding) {
    const a = 0.35 + 0.25 * Math.sin(now / 220);
    ctx.fillStyle = `rgba(70,150,190,${a * 0.9})`;
    ctx.fillRect(x, y, w, h);
    ctx.strokeStyle = `rgba(150,220,240,${a + 0.3})`;
    ctx.lineWidth = Math.max(2, w * 0.06);
    ctx.stroke();
  }
  ctx.restore();
}

// ── Hazards ──────────────────────────────────────────────────────────────────

const FIRE = ['#3a0d06', '#b8280f', '#ff5a1f', '#ffa22e', '#ffe08a'];
function fireSprite(f: number) {
  return sprite(`fire:${f}`, px => {
    // Oily slick
    for (let y = 10; y < 15; y++) for (let x = 2; x < 14; x++) if (Math.abs(x - 7.5) / 6 + Math.abs(y - 12) / 2.6 < 1) px(x, y, (x + y) % 5 === 0 ? '#3b2a4e' : '#14100c');
    // Flame columns: height wobbles by frame
    for (let x = 4; x < 12; x++) {
      const hgt = 4 + Math.floor(hash(x, f, 7) * 5) + (x > 5 && x < 10 ? 2 : 0);
      for (let k = 0; k < hgt; k++) {
        const y = 11 - k;
        const heat = k / hgt;
        px(x, y, heat < 0.25 ? FIRE[1] : heat < 0.5 ? FIRE[2] : heat < 0.8 ? FIRE[3] : FIRE[4]);
      }
    }
    // Embers
    px(5 + f, 2, FIRE[3]); px(10 - f, 3, FIRE[4]);
  });
}
function cableSprite(f: number) {
  return sprite(`cable:${f}`, px => {
    for (let y = 5; y < 15; y++) for (let x = 1; x < 15; x++) if (Math.abs(x - 8) / 7 + Math.abs(y - 10) / 5 < 1) px(x, y, y === 6 || (x + y) % 6 === 0 ? '#6fa3b5' : '#3f6f82');
    // The cable snakes in from the corner and coils in the water
    const path: [number, number][] = [[0, 2], [1, 2], [2, 3], [3, 4], [4, 5], [5, 6], [6, 7], [6, 8], [7, 9], [8, 9], [9, 9], [10, 8], [10, 7], [9, 7], [8, 8]];
    for (const [x, y] of path) { px(x, y, '#141414'); px(x, y + 1, '#2a2a2a'); }
    px(8, 8, '#c0782f'); px(9, 8, '#e09a4a');
    if (f % 2 === 0) {
      const sparks: [number, number][] = f === 0 ? [[10, 6], [11, 5], [7, 6], [11, 9], [12, 10]] : [[9, 5], [12, 7], [6, 9], [10, 11]];
      for (const [x, y] of sparks) px(x, y, '#d8fbff');
      px(9, 7, '#ffffff');
    }
  });
}
function chemSprite(f: number) {
  return sprite(`chem:${f}`, px => {
    for (let y = 3; y < 15; y++) for (let x = 1; x < 15; x++) {
      const d = Math.abs(x - 8) / 7 + Math.abs(y - 9) / 6;
      if (d < 1) px(x, y, d > 0.82 ? '#4f7a14' : d > 0.5 ? '#86b424' : '#c4e84a');
    }
    // Bubbles rise and pop over the frames
    const b: [number, number][] = [[5, 10 - f * 2], [10, 8 - f], [8, 12 - f * 3]];
    for (const [x, y] of b) if (y > 3) { px(x, y, '#ecffa8'); px(x + 1, y, '#ecffa8'); px(x, y - 1, '#ecffa8'); }
  });
}
function holeSprite(f: number) {
  return sprite(`hole:${f}`, px => {
    // A split in the decking with the sea below
    // A ragged split, wider across than down
    const shape = (x: number, y: number) => ((x - 7.5) / 7) ** 2 + ((y - 8) / 4.5) ** 2 + (hash(x, y, 4) - 0.5) * 0.7 + Math.sin(x * 1.7) * 0.12 < 0.85;
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) if (shape(x, y)) px(x, y, (y + f) % 4 === 0 && x % 3 ? '#2f6676' : '#0b2630');
    // Torn plastic lips
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) if (!shape(x, y) && (shape(x + 1, y) || shape(x - 1, y) || shape(x, y + 1) || shape(x, y - 1))) px(x, y, hash(x, y, 8) > 0.5 ? '#c9d2d6' : '#9aa6ad');
  });
}

function oilSprite(f: number) {
  return sprite(`oil:${f}`, px => {
    // A black slick with a rainbow sheen, low flames licking across it
    for (let y = 4; y < 15; y++) for (let x = 1; x < 15; x++) {
      const d = Math.abs(x - 8) / 7 + Math.abs(y - 10) / 5.5;
      if (d < 1) px(x, y, (x * 3 + y + f) % 11 === 0 ? '#5b3f7a' : (x + y * 2 + f) % 13 === 0 ? '#2f6a5e' : '#0e0c0a');
    }
    for (let x = 3; x < 14; x += 2) {
      const hgt = 2 + Math.floor(hash(x, f, 9) * 4);
      for (let k = 0; k < hgt; k++) px(x, 10 - k, k === hgt - 1 ? FIRE[4] : k > hgt / 2 ? FIRE[3] : FIRE[2]);
    }
  });
}
function sumpSprite(f: number) {
  return sprite(`sump:${f}`, px => {
    // A pit of grey-brown silt that sucks at your feet; slow bubbles
    for (let y = 2; y < 15; y++) for (let x = 1; x < 15; x++) {
      const d = Math.abs(x - 8) / 7 + Math.abs(y - 8.5) / 6.5;
      if (d < 1) px(x, y, d > 0.8 ? '#6b6250' : d > 0.45 ? '#4a4334' : '#2e2a20');
    }
    const b: [number, number][] = [[6, 9 - f], [10, 7 + f % 2], [8, 11 - f * 2]];
    for (const [x, y] of b) if (y > 3) { px(x, y, '#8a8266'); px(x + 1, y, '#8a8266'); px(x, y - 1, '#a49b7c'); }
  });
}

function steamSprite(f: number) {
  return sprite(`steam:${f}`, px => {
    // A floor vent with scalding steam rolling off it
    rect(px, 3, 11, 10, 3, '#2a2f33');
    for (let x = 4; x < 12; x += 2) px(x, 12, '#0d1012');
    for (let i = 0; i < 9; i++) {
      const x = 4 + Math.floor(hash(i, f, 3) * 8), y = 10 - Math.floor(hash(f, i, 5) * 8);
      px(x, y, i % 3 ? '#e6edf0' : '#b8c4c9'); px(x + 1, y, '#d3dcdf');
    }
  });
}
function coolantSprite(f: number) {
  return sprite(`coolant:${f}`, px => {
    // A spilled pool of blue-green coolant, frosting at the edge
    for (let y = 4; y < 15; y++) for (let x = 1; x < 15; x++) {
      const d = Math.abs(x - 8) / 7 + Math.abs(y - 9.5) / 5.5 + (hash(x, y, 2) - 0.5) * 0.15;
      if (d < 1) px(x, y, d > 0.82 ? '#e2f6fb' : d > 0.5 ? '#3fb8c9' : '#1d7f93');
    }
    px(6 + f, 8, '#bff3fb'); px(10 - f, 11, '#bff3fb');
  });
}
function lightSprite(f: number) {
  return sprite(`light:${f}`, px => {
    // A strip of focused sunlight burning on the floor, shimmering
    for (let y = 2; y < 15; y++) for (let x = 2; x < 14; x++) {
      const edge = Math.min(x - 2, 13 - x, y - 2, 14 - y);
      px(x, y, edge === 0 ? '#fde68a' : (x + y + f) % 4 === 0 ? '#ffffff' : '#fef3c7');
    }
    for (let x = 3; x < 13; x += 3) px(x, 6 + f, '#fffbeb');
  });
}
function grateSprite() {
  return sprite('grate', px => {
    // An open floor grate over a dark drop
    rect(px, 2, 2, 12, 12, '#0a0c0e');
    for (let i = 2; i < 14; i++) { px(i, 2, '#5e676d'); px(i, 13, '#5e676d'); px(2, i, '#5e676d'); px(13, i, '#5e676d'); }
    for (let x = 4; x < 13; x += 3) for (let y = 3; y < 13; y++) px(x, y, '#3a4146');
  });
}

/** A hazard, drawn as what it is. Returns false if the art name isn't known. */
export function drawHazard(ctx: Ctx, art: string | undefined, cx: number, cy: number, s: number, now: number): boolean {
  const size = s * 0.86, x = cx - size / 2, y = cy - size / 2;
  const f = Math.floor(now / 160) % 3;
  switch (art) {
    case 'fire': blit(ctx, fireSprite(f), x, y, size, size); return true;
    case 'cable': blit(ctx, cableSprite(f), x, y, size, size); return true;
    case 'chem': blit(ctx, chemSprite(f), x, y, size, size); return true;
    case 'oil': blit(ctx, oilSprite(f), x, y, size, size); return true;
    case 'sump': blit(ctx, sumpSprite(Math.floor(now / 300) % 3), x, y, size, size); return true;
    case 'steam': blit(ctx, steamSprite(f), x, y, size, size); return true;
    case 'coolant': blit(ctx, coolantSprite(Math.floor(now / 400) % 3), x, y, size, size); return true;
    case 'grate': blit(ctx, grateSprite(), x, y, size, size); return true;
    case 'light': blit(ctx, lightSprite(f), x, y, size, size); return true;
    case 'hole': case 'rot': blit(ctx, holeSprite(Math.floor(now / 400) % 4), x, y, size, size); return true;
    default: return false;
  }
}

// ── Cover ────────────────────────────────────────────────────────────────────

// Cover is seen from a little above and in front, lit from the top left (its
// shadow falls down and right): a bright top, a plain front, a dark right side
// and a darker foot where it meets the floor. Each material has five shades.

type Px = (x: number, y: number, c: string) => void;
/** One material's shades, lightest first: shine, lit, face, shade, deep. */
type Ramp = readonly [string, string, string, string, string];

const BLUE: Ramp = ['#a9d8f5', '#62a6d6', '#3c7fb3', '#295e8a', '#173c5c'];
const GREY: Ramp = ['#c7d0d6', '#97a4ad', '#707e88', '#505c65', '#333c43'];
const IRON: Ramp = ['#8a857d', '#66625b', '#4b4842', '#35322e', '#211f1c'];
const SLATE: Ramp = ['#a7b4c0', '#7d8b98', '#5d6a77', '#444f5a', '#2b333b'];
const OLIVE: Ramp = ['#d6e2ba', '#a9b98c', '#809168', '#5e6c4b', '#3e4731'];
const NET: Ramp = ['#93c9a3', '#5f9c75', '#417858', '#2d5841', '#1c3829'];
const STONE: Ramp = ['#b9bab2', '#97988f', '#7a7b73', '#5c5d56', '#3f403b'];
const CLOTH: Ramp = ['#e3ebee', '#bccad0', '#95a6ae', '#6f8089', '#4a5860'];
const STEEL: Ramp = ['#9aa6b4', '#6c7787', '#4b5463', '#343b47', '#1f242c'];
const RED: Ramp = ['#ff8a6e', '#e2513a', '#b0321f', '#7a1f13', '#4a120b'];

/** Shade for a spot across a round thing lit from the left (-1 left edge, 1 right edge). */
const roundShade = (t: number, r: Ramp) => t < -0.75 ? r[2] : t < -0.45 ? r[0] : t < -0.05 ? r[1] : t < 0.4 ? r[2] : t < 0.75 ? r[3] : r[4];

/** A box: lit top `top` rows deep, bright front lip, plain front, dark right edge, darker foot. */
function box(px: Px, x0: number, y0: number, w: number, h: number, top: number, r: Ramp) {
  for (let y = y0; y < y0 + h; y++) for (let x = x0; x < x0 + w; x++) {
    const right = x === x0 + w - 1, left = x === x0;
    let c: string;
    if (y < y0 + top) c = y === y0 + top - 1 ? r[0] : right ? r[2] : r[1];
    else if (y === y0 + h - 1) c = r[4];
    else c = right ? r[4] : left ? r[2] : y >= y0 + h - 2 ? r[3] : r[2];
    px(x, y, c);
  }
}

/** An upright cylinder: an oval top `ry` deep, body shaded left to right, rounded foot. */
function cylinder(px: Px, cx: number, y0: number, rx: number, h: number, ry: number, r: Ramp, lid = true) {
  const yb = y0 + h - 1 - ry; // centre of the foot's curve
  for (let y = y0; y < y0 + h; y++) for (let x = Math.floor(cx - rx); x <= Math.ceil(cx + rx); x++) {
    const t = (x + 0.5 - cx) / rx;
    if (Math.abs(t) > 1) continue;
    const yt = y0 + ry; // centre of the top's oval
    const inTop = t * t + ((y + 0.5 - yt) / ry) ** 2 <= 1;
    if (y < yt && !inTop) continue;
    if (y > yb && t * t + ((y + 0.5 - yb) / (ry + 0.5)) ** 2 > 1) continue;
    let c = roundShade(t, r);
    if (y >= yb) c = t < 0.4 ? r[3] : r[4];
    if (inTop && lid) {
      const inner = t * t * 1.35 + ((y + 0.5 - yt) / (ry - 0.6)) ** 2 <= 1;
      c = !inner ? (y + 0.5 >= yt ? r[0] : r[2]) : y + 0.5 < yt ? r[2] : r[1];
    }
    px(x, y, c);
  }
}

/** A little ball (a float, a knob): lit pixel top left, dark bottom right. */
function ball(px: Px, x: number, y: number, r: Ramp) {
  px(x, y, r[0]); px(x + 1, y, r[1]); px(x, y + 1, r[2]); px(x + 1, y + 1, r[3]);
}

const COVER: Record<string, Paint> = {
  rack: px => {
    // A server rack: a dark cabinet of drive bays, status lights down its face
    box(px, 3, 1, 10, 14, 2, STEEL);
    for (let x = 4; x < 12; x += 2) px(x, 1, STEEL[3]); // vents on the lid
    for (let y = 4; y < 13; y += 2) {
      for (let x = 4; x < 11; x++) px(x, y, '#2a303a');
      for (let x = 4; x < 11; x++) px(x, y + 1, x === 4 ? '#3b4351' : '#151920');
      px(10, y, (y * 7) % 3 ? '#4ade80' : '#a78bfa'); px(9, y, (y * 5) % 4 ? '#1d4d33' : '#4ade80');
    }
  },
  planter: px => {
    // A terrace planter: a concrete trough, muddy water, rice standing in it
    box(px, 1, 8, 14, 7, 3, STONE);
    for (let x = 2; x < 14; x++) { px(x, 9, '#3a4632'); px(x, 8, STONE[2]); }
    for (let x = 3; x < 13; x += 3) px(x, 9, '#55663f');
    for (let x = 2; x < 13; x += 2) {
      const tall = 2 + ((x * 5) % 4);
      for (let y = tall; y < 10; y++) px(x + (y < 5 && x % 4 === 0 ? 1 : 0), y, y < tall + 2 ? '#d9e77f' : y < 7 ? '#a8cc5a' : '#6f9a3b');
    }
    for (let x = 2; x < 14; x += 4) px(x, 12, STONE[3]); // stains
  },
  mast: px => {
    // A lattice antenna mast on a concrete block, a red light at the top
    box(px, 3, 11, 10, 4, 2, STONE);
    for (let y = 2; y < 11; y++) { px(6, y, GREY[1]); px(9, y, GREY[3]); }
    for (let y = 2; y < 11; y++) px(y % 4 < 2 ? 7 : 8, y, GREY[2]);
    for (const y of [4, 7]) { for (let x = 4; x < 12; x++) px(x, y, x < 8 ? GREY[1] : GREY[3]); }
    px(4, 5, GREY[0]); px(11, 8, GREY[2]); // little dishes
    rect(px, 7, 0, 2, 2, '#ef4444'); px(7, 0, '#ffb4a8');
  },
  locker: px => {
    // A dented staff locker, door ajar
    box(px, 3, 1, 10, 14, 2, SLATE);
    for (let y = 4; y < 7; y++) for (let x = 5; x < 10; x += 2) px(x, y, SLATE[4]); // vents
    for (let y = 3; y < 14; y++) px(11, y, '#0d1216'); // the gap of the open door
    px(10, 8, SLATE[0]); px(10, 9, SLATE[1]);
    px(6, 10, SLATE[3]); px(7, 11, SLATE[3]); px(6, 11, SLATE[1]); // a dent
  },
  canister: px => {
    // A tall gas canister with a hazard band
    cylinder(px, 8, 3, 3.5, 12, 1.5, OLIVE, false);
    for (let x = 5; x < 11; x++) { px(x, 3, x < 8 ? OLIVE[0] : OLIVE[2]); }
    for (let x = 5; x < 11; x++) for (const y of [7, 8]) {
      const t = (x + 0.5 - 8) / 3.5;
      px(x, y, (x + y) % 3 === 0 ? (t > 0.4 ? '#1a1a1a' : '#2b2b2b') : t > 0.4 ? '#b38a22' : t < -0.4 ? '#ffd65a' : '#e8b83a');
    }
    rect(px, 7, 1, 2, 2, GREY[2]); px(7, 1, GREY[0]); px(6, 1, GREY[3]); px(9, 1, GREY[3]);
  },
  cot: px => {
    // Two folding cots stacked, a strap hanging off the top one
    for (const y0 of [8, 3]) {
      for (let x = 1; x < 15; x++) for (let y = y0; y < y0 + 3; y++) px(x, y, y === y0 + 2 ? CLOTH[0] : x === 14 ? CLOTH[2] : CLOTH[1]);
      for (let x = 1; x < 15; x++) px(x, y0 + 3, x === 14 ? STEEL[4] : STEEL[2]);
      for (const x of [2, 13]) px(x, y0 + 4, STEEL[3]);
      for (let x = 3; x < 13; x += 3) px(x, y0 + 1, CLOTH[2]); // creases
    }
    px(3, 14, STEEL[3]); px(12, 14, STEEL[3]); px(2, 13, STEEL[3]); px(13, 13, STEEL[3]);
    for (let y = 7; y < 11; y++) px(5, y, y % 2 ? '#7a5a3a' : '#5b4230');
  },
  terminal: px => {
    // A ward terminal on a stand: one number on the screen, ticking down
    box(px, 2, 1, 12, 9, 1, STEEL);
    rect(px, 3, 2, 9, 7, '#0b3527');
    for (let x = 3; x < 12; x++) px(x, 2, '#12503a');
    // "07" in green
    const glyphs = ['111101101101111', '111001001010010'];
    glyphs.forEach((g, i) => { for (let k = 0; k < 15; k++) if (g[k] === '1') px(4 + i * 4 + (k % 3), 3 + Math.floor(k / 3), '#5df2a8'); });
    cylinder(px, 8, 9, 1.2, 4, 0.6, STEEL, false);
    box(px, 4, 12, 8, 3, 1, STEEL);
  },
  pod: px => {
    // An incubator pod on its side: frosted lid, a sleeper's shape inside, cold blue light
    box(px, 1, 9, 14, 6, 1, CLOTH);
    for (let y = 2; y < 10; y++) for (let x = 1; x < 15; x++) {
      const d = ((x + 0.5 - 8) / 7) ** 2 + ((y + 0.5 - 10) / 7.5) ** 2;
      if (d < 1) px(x, y, d > 0.82 ? '#8fb1c4' : x < 6 && y < 6 ? '#e6f7fd' : y < 6 ? '#bfe6f5' : '#86c8e0');
    }
    for (let x = 4; x < 12; x++) px(x, 8, '#4f7f96');
    px(5, 7, '#5f8ea4'); px(4, 7, '#5f8ea4');
    for (const x of [4, 11]) px(x, 12, '#8ff0ff');
  },
  cases: px => {
    // Sealed record cases stacked three high, steel clasps, a stencilled number
    box(px, 1, 9, 14, 6, 2, SLATE);
    box(px, 2, 5, 12, 5, 2, SLATE);
    box(px, 4, 1, 9, 5, 2, SLATE);
    for (const [x, y] of [[3, 12], [12, 12], [4, 8], [11, 8], [6, 4], [10, 4]]) { px(x, y, '#d9dee2'); px(x, y + 1, SLATE[4]); }
    px(7, 12, '#e8d27a'); px(8, 12, '#e8d27a'); px(9, 12, '#c9b25e'); // a label
    for (let x = 6; x < 9; x++) px(x, 1, SLATE[2]); // handle
  },
  bollard: px => {
    // An iron mooring bollard with a rope wound round it
    cylinder(px, 8, 4, 3.5, 11, 1.5, IRON);
    cylinder(px, 8, 1, 4.5, 4, 1.5, IRON);
    for (const y0 of [7, 10]) for (let y = y0; y < y0 + 2; y++) for (let x = 4; x < 12; x++) {
      const t = (x + 0.5 - 8) / 3.5;
      const twist = (x - y + 20) % 3 === 0;
      px(x, y, twist ? (t < 0.3 ? '#8d7647' : '#5e4c2b') : t < -0.3 ? '#ecd59c' : t < 0.4 ? '#c2a674' : '#86703f');
    }
    px(10, 6, '#8a4a2a'); px(5, 13, '#8a4a2a'); // rust
  },
  crate: px => {
    // Two plastic crates stacked, strapped together with yellow tape
    box(px, 1, 8, 14, 7, 1, BLUE);
    box(px, 2, 2, 12, 7, 3, BLUE);
    for (let x = 3; x < 13; x += 2) { px(x, 3, BLUE[3]); } // the lattice on top
    for (let x = 4; x < 12; x += 2) px(x, 2, BLUE[2]);
    for (const y0 of [6, 11]) for (let x = 4; x < 13; x += 2) px(x - (y0 === 11 ? 1 : 0), y0, BLUE[4]); // holes
    rect(px, 5, 12, 5, 1, BLUE[4]); px(5, 13, BLUE[2]); // handle slot
    for (let y = 2; y < 15; y++) px(9, y, y === 4 ? '#ffe68a' : y > 12 ? '#a8862a' : '#e0b83e');
  },
  drum: px => {
    // A blue plastic drum, sun-faded, two bungs on the lid
    cylinder(px, 8, 1, 5, 14, 2, BLUE);
    for (const y of [6, 10]) for (let x = 3; x < 13; x++) {
      const t = (x + 0.5 - 8) / 5;
      px(x, y, t < 0.4 ? BLUE[3] : BLUE[4]);
      px(x, y - 1, t < -0.45 && t > -0.75 ? BLUE[0] : roundShade(t, BLUE) === BLUE[2] ? BLUE[1] : roundShade(t, BLUE));
    }
    rect(px, 5, 7, 4, 2, '#e8e2c8'); px(9, 7, '#c8c1a6'); px(9, 8, '#c8c1a6'); px(5, 8, '#f6f1dc');
    px(5, 2, '#dfe7ec'); px(6, 2, '#9fb0bb'); px(10, 3, '#9fb0bb');
  },
  nets: px => {
    // A heap of green net, orange floats tangled in it, a rope end trailing
    const lumps = [[7.5, 15, 6.6, 10.5], [11.5, 15, 3.6, 6]];
    for (let y = 1; y < 15; y++) for (let x = 0; x < 16; x++) {
      let best = -2;
      for (const [cx, cy, rx, ry] of lumps) {
        const nx = (x + 0.5 - cx) / rx, ny = (y + 0.5 - cy) / ry, d = nx * nx + ny * ny;
        if (d > 1) continue;
        const nz = Math.sqrt(1 - d);
        best = Math.max(best, -0.55 * nx - 0.55 * ny + 0.63 * nz);
      }
      if (best < -1) continue;
      let i = best > 0.85 ? 0 : best > 0.6 ? 1 : best > 0.35 ? 2 : best > 0.1 ? 3 : 4;
      if (((x + y) % 3 === 0 || (x - y + 30) % 3 === 0) && i < 4) i++; // the mesh
      px(x, y, NET[i]);
    }
    const ORANGE: Ramp = ['#ffd08a', '#f59a3a', '#d06d1c', '#8e4210', '#5a280a'];
    ball(px, 5, 6, ORANGE); ball(px, 9, 9, ORANGE); ball(px, 3, 11, ORANGE); ball(px, 12, 11, ORANGE);
    for (const [x, y] of [[1, 14], [2, 13], [0, 14], [3, 13]]) px(x, y, '#d8c79a');
  },
  pump: px => {
    // A salvaged pump: a grey housing, motor on top, red valve wheel, a pipe down to the deck
    box(px, 2, 7, 11, 8, 2, GREY);
    cylinder(px, 6.5, 1, 3, 8, 1.2, GREY);
    for (let y = 3; y < 7; y += 2) for (let x = 4; x < 9; x++) px(x, y, (x + 0.5 - 6.5) / 3 > 0.3 ? GREY[4] : GREY[3]); // cooling fins
    // pipe out of the side, down to the floor
    for (let y = 9; y < 15; y++) { px(13, y, y === 9 ? GREY[2] : GREY[3]); px(14, y, GREY[4]); }
    px(13, 9, GREY[1]); px(13, 14, GREY[4]);
    // valve wheel on the front
    for (const [x, y] of [[5, 9], [6, 9], [7, 9], [4, 10], [8, 10], [4, 11], [8, 11], [5, 12], [6, 12], [7, 12]]) px(x, y, y < 11 ? (x < 7 ? RED[0] : RED[1]) : (x < 6 ? RED[1] : RED[2]));
    px(6, 10, RED[1]); px(6, 11, RED[3]); px(5, 11, RED[2]); px(7, 10, RED[2]);
    px(10, 10, '#e8e2c8'); px(11, 10, '#e8e2c8'); px(10, 11, '#3a2a1a'); // a dial
  },
};

/** The sprite's shape in flat black, for its shadow. */
function silhouette(art: string, img: HTMLCanvasElement): HTMLCanvasElement {
  const key = `shadow:${art}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const c = document.createElement('canvas');
  c.width = N; c.height = N;
  const g = c.getContext('2d')!;
  g.drawImage(img, 0, 0);
  g.globalCompositeOperation = 'source-in';
  g.fillStyle = '#000';
  g.fillRect(0, 0, N, N);
  cache.set(key, c);
  return c;
}

/** Cover art is known for this name. */
export const hasCover = (art: string | undefined) => !!art && !!COVER[art];

/**
 * A piece of cover standing on its tile: a dark footprint where it meets the
 * floor, its shadow falling down and to the right, then the thing itself with
 * its feet on the tile and its top rising a little into the tile behind.
 * Draw it in depth order with the units so whatever stands in front covers it.
 */
export function drawObstacle(ctx: Ctx, art: string | undefined, cx: number, cy: number, s: number): boolean {
  const paint = art ? COVER[art] : undefined;
  if (!paint || !art) return false;
  const img = sprite(`cover:${art}`, paint, '#071014');
  const size = s * 1.04;
  const base = cy + s * 0.44;           // where the sprite's feet touch the floor
  const top = base - size;
  ctx.save();
  // Contact shadow: soft and dark right under it
  const ao = ctx.createRadialGradient(cx, base - s * 0.04, 0, cx, base - s * 0.04, s * 0.5);
  ao.addColorStop(0, 'rgba(0,0,0,0.45)');
  ao.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = ao;
  ctx.beginPath();
  ctx.ellipse(cx, base - s * 0.04, s * 0.5, s * 0.17, 0, 0, Math.PI * 2);
  ctx.fill();
  // Cast shadow: its own shape, squashed flat and leaning away from the light
  ctx.globalAlpha = 0.2;
  ctx.translate(cx, base);
  ctx.transform(1, 0, -0.55, 0.26, 0, 0);
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(silhouette(art, img), -size / 2, -size, size, size);
  ctx.restore();
  blit(ctx, img, cx - size / 2, top, size, size);
  return true;
}

/** A soft dark ellipse on the floor under a unit's feet. */
export function drawFootShadow(ctx: Ctx, cx: number, cy: number, s: number) {
  ctx.save();
  const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, s * 0.42);
  g.addColorStop(0, 'rgba(0,0,0,0.42)');
  g.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.ellipse(cx, cy, s * 0.42, s * 0.14, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

// ── Status marks over units ──────────────────────────────────────────────────

/** Small pixel marks above a unit's head: a flame while burning, circling stars while stunned. */
export function drawStatus(ctx: Ctx, cx: number, top: number, size: number, burning: boolean, stunned: boolean, now: number) {
  const p = Math.max(2, Math.round(size / 24));
  ctx.save();
  if (burning) {
    const fx = Math.round(cx + size * 0.28), fy = Math.round(top + p * 2);
    const flick = Math.floor(now / 120) % 2;
    ctx.fillStyle = '#ff5a1f'; ctx.fillRect(fx - p, fy, p * 3, p * 2);
    ctx.fillStyle = '#ffa22e'; ctx.fillRect(fx, fy - p * (1 + flick), p, p * (2 + flick));
    ctx.fillStyle = '#ffe08a'; ctx.fillRect(fx, fy + p, p, p);
  }
  if (stunned) {
    ctx.fillStyle = '#ffe14a';
    for (let k = 0; k < 3; k++) {
      const a = now / 260 + (k * Math.PI * 2) / 3;
      const sx = Math.round(cx + Math.cos(a) * size * 0.22), sy = Math.round(top + Math.sin(a) * size * 0.06);
      ctx.fillRect(sx - p, sy, p * 3, p); ctx.fillRect(sx, sy - p, p, p * 3);
    }
  }
  ctx.restore();
}

/** A unit in the sea: water over its lower half and a pixel ripple round it. `top` is the sprite's top, `size` its size. */
export function drawSwimming(ctx: Ctx, cx: number, top: number, size: number, sea: { top: string; foam: string }, now: number) {
  const p = Math.max(2, Math.round(size / 24));
  const waterY = Math.round(top + size * 0.55);
  ctx.save();
  ctx.fillStyle = sea.top;
  ctx.globalAlpha = 0.92;
  ctx.fillRect(Math.round(cx - size * 0.45), waterY, Math.round(size * 0.9), Math.round(size * 0.5));
  ctx.globalAlpha = 1;
  ctx.fillStyle = sea.foam;
  const bob = Math.floor(now / 260) % 2;
  for (let k = -3; k <= 3; k++) {
    if ((k + bob) % 2 === 0) continue;
    ctx.fillRect(Math.round(cx + k * p * 2.5), waterY - p + (k % 2 === 0 ? 0 : p), p * 2, p);
  }
  ctx.restore();
}

/** Hairline seams where plates meet: a dark line with a faint lit line under it. */
export function drawSeams(ctx: Ctx, cells: { x: number; y: number; w: number; h: number; open: Open }[], seam: string) {
  ctx.save();
  ctx.lineWidth = 1;
  for (const c of cells) {
    const x = Math.round(c.x) + 0.5, y = Math.round(c.y) + 0.5;
    if (!c.open.up) {
      ctx.strokeStyle = seam; ctx.globalAlpha = 0.55;
      ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + c.w, y); ctx.stroke();
      ctx.strokeStyle = '#ffffff'; ctx.globalAlpha = 0.06;
      ctx.beginPath(); ctx.moveTo(x, y + 1); ctx.lineTo(x + c.w, y + 1); ctx.stroke();
    }
    if (!c.open.left) {
      ctx.strokeStyle = seam; ctx.globalAlpha = 0.55;
      ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x, y + c.h); ctx.stroke();
      ctx.strokeStyle = '#ffffff'; ctx.globalAlpha = 0.05;
      ctx.beginPath(); ctx.moveTo(x + 1, y); ctx.lineTo(x + 1, y + c.h); ctx.stroke();
    }
  }
  ctx.restore();
}

/** A unit's health bar on the board: a rounded dark trough with a lit fill. */
export function drawUnitBar(ctx: Ctx, cx: number, y: number, w: number, frac: number, color: string) {
  const h = 5, r = h / 2, x = cx - w / 2;
  const pill = (px: number, pw: number) => {
    ctx.beginPath();
    ctx.moveTo(px + r, y); ctx.lineTo(px + pw - r, y); ctx.arc(px + pw - r, y + r, r, -Math.PI / 2, Math.PI / 2);
    ctx.lineTo(px + r, y + h); ctx.arc(px + r, y + r, r, Math.PI / 2, Math.PI * 1.5); ctx.closePath();
  };
  ctx.save();
  pill(x - 1.5, w + 3); ctx.fillStyle = 'rgba(4,7,12,0.85)'; ctx.fill();
  const fw = Math.max(0, Math.min(1, frac)) * w;
  if (fw > 0.5) {
    pill(x, Math.max(fw, h)); ctx.fillStyle = color; ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.35)'; ctx.fillRect(x + r, y + 1, Math.max(0, fw - h), 1);
  }
  ctx.restore();
}
