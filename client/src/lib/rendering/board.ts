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
  return sprite(`deck:${shade}:${t.floor.light}`, px => {
    const body = shade ? t.floor.dark : t.floor.light;
    rect(px, 0, 0, N, N, body);
    // A few worn pixels so the plate reads as a surface, not a flat fill
    for (let y = 2; y < N - 2; y++) for (let x = 2; x < N - 2; x++) {
      const h = hash(x, y, 3 + shade);
      if (h > 0.97) px(x, y, 'rgba(255,255,255,0.05)');
      else if (h < 0.025) px(x, y, 'rgba(0,0,0,0.06)');
    }
    // A soft lit edge at the top; the seams between plates are drawn as hairlines over the board
  });
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

const COVER: Record<string, Paint> = {
  rack: px => {
    // A server rack: a dark cabinet of slots, status lights blinking down its face
    rect(px, 3, 1, 10, 14, '#1d2129');
    for (let y = 1; y < 15; y++) { px(3, y, '#3a404c'); px(12, y, '#0d0f13'); }
    for (let y = 3; y < 14; y += 2) { for (let x = 5; x < 11; x++) px(x, y, '#2b313b'); px(10, y, (y * 7) % 3 ? '#4ade80' : '#a78bfa'); }
  },
  planter: px => {
    // A terrace planter: a concrete trough with rice standing in muddy water
    rect(px, 1, 9, 14, 6, '#7d7f78');
    for (let x = 1; x < 15; x++) { px(x, 9, '#a3a59d'); px(x, 14, '#4f514b'); }
    rect(px, 2, 10, 12, 2, '#4a5a3a');
    for (let x = 2; x < 14; x += 2) for (let y = 3 + (x % 3); y < 10; y++) px(x, y, y < 6 ? '#b5d86a' : '#7fa83f');
  },
  mast: px => {
    // An antenna mast on a weighted base, a red light at the top
    rect(px, 7, 2, 2, 12, '#8a939a');
    for (let y = 2; y < 14; y++) px(7, y, '#b5bec4');
    for (const y of [5, 9]) for (let x = 4; x < 12; x++) px(x, y, '#6b747a');
    px(7, 1, '#ef4444'); px(8, 1, '#f87171');
    rect(px, 4, 14, 8, 1, '#3e4448'); rect(px, 5, 13, 6, 1, '#555c61');
  },
  locker: px => {
    // A dented staff locker, door ajar
    rect(px, 4, 1, 8, 14, '#6d7c86');
    for (let y = 1; y < 15; y++) { px(4, y, '#93a3ad'); px(11, y, '#3f4a51'); }
    for (const y of [3, 4, 5]) for (let x = 6; x < 10; x++) px(x, y, '#3f4a51');
    px(10, 8, '#d5dde2'); px(10, 9, '#d5dde2');
  },
  canister: px => {
    // A tall gas canister with a hazard band
    rect(px, 5, 3, 6, 12, '#7d8f6e');
    for (let y = 3; y < 15; y++) { px(5, y, '#a1b38f'); px(10, y, '#4f5c44'); }
    for (let x = 5; x < 11; x++) { px(x, 7, '#e0b43a'); px(x, 8, '#2b2b2b'); }
    rect(px, 7, 1, 2, 2, '#9aa0a4');
  },
  cot: px => {
    // Stacked folding cots, straps hanging
    for (const y0 of [5, 9]) {
      rect(px, 1, y0, 14, 2, '#7a8b94');
      for (let x = 1; x < 15; x++) px(x, y0, '#a8b8bf');
      px(2, y0 + 2, '#3b4448'); px(13, y0 + 2, '#3b4448'); px(2, y0 + 3, '#3b4448'); px(13, y0 + 3, '#3b4448');
    }
    px(7, 7, '#5b4632'); px(7, 8, '#5b4632'); px(8, 11, '#5b4632'); px(8, 12, '#5b4632');
  },
  terminal: px => {
    // A ward terminal on a stand: one number on the screen, ticking down
    rect(px, 3, 2, 10, 8, '#1f272c');
    rect(px, 4, 3, 8, 6, '#0d3b2e');
    for (let x = 5; x < 11; x++) px(x, 6, x % 2 ? '#5df2a8' : '#2fa874');
    rect(px, 7, 10, 2, 4, '#3a4449');
    rect(px, 4, 14, 8, 1, '#2a3236');
  },
  pod: px => {
    // An incubator pod on its side: frosted glass lid, a sleeper's shape inside, cold blue light
    for (let y = 3; y < 14; y++) for (let x = 1; x < 15; x++) {
      const d = ((x - 7.5) / 7) ** 2 + ((y - 8.5) / 5.5) ** 2;
      if (d < 1) px(x, y, d > 0.75 ? '#9fb4c4' : y < 8 ? '#bfe6f5' : '#7cc4de');
    }
    for (let x = 4; x < 12; x++) px(x, 9, '#4f7f96');
    px(5, 8, '#e8f7fd'); px(6, 8, '#e8f7fd'); px(10, 9, '#3a6075');
    rect(px, 3, 13, 10, 2, '#46525c');
    px(4, 13, '#8ff0ff'); px(11, 13, '#8ff0ff');
  },
  cases: px => {
    // Sealed record cases stacked three high, steel clasps, a stencilled number
    const box = (y0: number, w: number, x0: number, c: string, hi: string, lo: string) => {
      rect(px, x0, y0, w, 4, c);
      for (let i = x0; i < x0 + w; i++) { px(i, y0, hi); px(i, y0 + 3, lo); }
      px(x0 + 2, y0 + 1, '#c9ced2'); px(x0 + w - 3, y0 + 1, '#c9ced2');
    };
    box(11, 12, 2, '#54606b', '#7b8894', '#2b333a');
    box(7, 11, 3, '#5d6975', '#8592a0', '#2f373f');
    box(3, 9, 4, '#4f5a64', '#76838f', '#283038');
    px(7, 12, '#d6dade'); px(8, 12, '#d6dade'); px(8, 8, '#d6dade');
  },
  bollard: px => {
    // An iron mooring bollard with a rope wound round it
    rect(px, 5, 4, 6, 11, '#3d3b38');
    for (let y = 4; y < 15; y++) { px(5, y, '#5a5753'); px(10, y, '#24221f'); }
    rect(px, 4, 3, 8, 2, '#4a4844');
    for (let x = 4; x < 12; x++) px(x, 3, '#6e6a64');
    for (const y of [7, 9, 11]) for (let x = 4; x < 12; x++) px(x, y + ((x % 2) ? 0 : 1) - 1, (x + y) % 3 ? '#b49a6a' : '#8a7448');
    rect(px, 3, 14, 10, 1, '#1d1b19');
  },
  crate: px => {
    // A stack of two plastic crates with handle slots
    rect(px, 2, 3, 12, 12, '#2f6c94');
    for (let i = 2; i < 14; i++) { px(i, 3, '#5f9cc2'); px(i, 14, '#173a52'); }
    for (let j = 3; j < 15; j++) { px(2, j, '#4a88b0'); px(13, j, '#173a52'); }
    for (let i = 2; i < 14; i++) px(i, 8, '#173a52');
    rect(px, 6, 5, 4, 1, '#0e2232'); rect(px, 6, 10, 4, 1, '#0e2232');
    for (let i = 3; i < 13; i += 2) px(i, 12, '#24577a');
  },
  drum: px => {
    // A white-and-blue plastic drum, sun-faded
    rect(px, 4, 3, 8, 12, '#3f7fb0');
    for (let j = 3; j < 15; j++) { px(4, j, '#2a5a80'); px(11, j, '#2a5a80'); px(5, j, '#6aa6d4'); }
    rect(px, 4, 2, 8, 2, '#8fc0e2'); px(9, 2, '#1a3a52');
    rect(px, 4, 7, 8, 1, '#24507a'); rect(px, 4, 11, 8, 1, '#24507a');
    rect(px, 6, 8, 4, 3, '#e8e2c8');
  },
  nets: px => {
    // A heap of green net with orange floats
    for (let y = 4; y < 15; y++) for (let x = 1; x < 15; x++) if (Math.abs(x - 7.5) / 7 + (14 - y) / 11 < 1.05) px(x, y, (x + y) % 2 ? '#2f4c3e' : '#3f6650');
    for (let y = 5; y < 15; y++) for (let x = 2; x < 14; x++) if ((x * 3 + y * 5) % 7 === 0 && Math.abs(x - 7.5) / 7 + (14 - y) / 11 < 1) px(x, y, '#a9c9a2');
    rect(px, 4, 9, 2, 2, '#e88a2a'); rect(px, 10, 7, 2, 2, '#e88a2a'); rect(px, 7, 12, 2, 2, '#e88a2a');
  },
  pump: px => {
    // A salvaged pump: grey housing, red valve wheel, pipe
    rect(px, 3, 6, 10, 8, '#56656e');
    for (let i = 3; i < 13; i++) { px(i, 6, '#7d8e98'); px(i, 13, '#2c363c'); }
    rect(px, 6, 2, 4, 4, '#6a7a84'); px(6, 2, '#8fa0aa');
    rect(px, 13, 8, 2, 2, '#2c363c'); rect(px, 14, 10, 1, 4, '#2c363c');
    rect(px, 6, 8, 4, 4, '#c03a2a'); px(7, 9, '#7e1e14'); px(8, 10, '#7e1e14'); px(7, 10, '#e05a40');
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
