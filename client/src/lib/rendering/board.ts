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
// One plain plastic plate everywhere, so the floor never competes with what
// matters (units, cover, hazards, reach). The only variation is a faint
// checker to help count tiles.

function deckSprite(t: Tileset, shade: 0 | 1): HTMLCanvasElement {
  return sprite(`deck:${shade}:${t.floor.light}`, px => {
    const body = shade ? t.floor.dark : t.floor.light;
    rect(px, 0, 0, N, N, body);
    // A lit top edge and a dark bottom edge read as moulded plastic
    for (let i = 0; i < N; i++) { px(i, 0, 'rgba(255,255,255,0.14)'); px(i, N - 1, t.floor.seam); px(N - 1, i, t.floor.seam); }
  });
}

/** One deck tile: the chapter's plain plastic plate. */
export function drawDeckTile(ctx: Ctx, x: number, y: number, w: number, h: number, r: number, row: number, col: number, t: Tileset) {
  ctx.save();
  ctx.beginPath();
  ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
  ctx.clip();
  blit(ctx, deckSprite(t, ((row + col) % 2) as 0 | 1), x, y, w, h);
  ctx.restore();
}

/** Tidal mud: wet grey-brown silt with standing puddles and a tide line of scum. */
function mudSprite(shade: 0 | 1): HTMLCanvasElement {
  return sprite(`mud:${shade}`, px => {
    rect(px, 0, 0, N, N, shade ? '#4a4336' : '#524a3b');
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
      const h = hash(x, y, 11 + shade);
      if (h > 0.86) px(x, y, '#5f5644');
      else if (h < 0.08) px(x, y, '#3a3429');
    }
    // Puddles that catch the light
    const pools: [number, number, number][] = shade ? [[4, 5, 2], [11, 11, 2]] : [[10, 4, 2], [5, 11, 2]];
    for (const [cx, cy, r] of pools) { disc(px, cx, cy, r, '#2f4a50'); px(cx - 1, cy - 1, '#6f9aa0'); }
    for (let i = 0; i < N; i++) px(i, N - 1, '#2d281f');
  });
}

/** A mud-flat tile; `flooding` adds a pulsing waterline round it (the tide comes in next round). */
export function drawMudTile(ctx: Ctx, x: number, y: number, w: number, h: number, r: number, row: number, col: number, flooding: boolean, now: number) {
  ctx.save();
  ctx.beginPath();
  ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
  ctx.clip();
  blit(ctx, mudSprite(((row + col) % 2) as 0 | 1), x, y, w, h);
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

/** A hazard, drawn as what it is. Returns false if the art name isn't known. */
export function drawHazard(ctx: Ctx, art: string | undefined, cx: number, cy: number, s: number, now: number): boolean {
  const size = s * 0.86, x = cx - size / 2, y = cy - size / 2;
  const f = Math.floor(now / 160) % 3;
  switch (art) {
    case 'fire': blit(ctx, fireSprite(f), x, y, size, size); return true;
    case 'cable': blit(ctx, cableSprite(f), x, y, size, size); return true;
    case 'chem': blit(ctx, chemSprite(f), x, y, size, size); return true;
    case 'hole': case 'rot': blit(ctx, holeSprite(Math.floor(now / 400) % 4), x, y, size, size); return true;
    default: return false;
  }
}

// ── Cover ────────────────────────────────────────────────────────────────────

const COVER: Record<string, Paint> = {
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

/** A piece of cover, drawn as what it is. Returns false if the art name isn't known. */
export function drawObstacle(ctx: Ctx, art: string | undefined, cx: number, cy: number, s: number): boolean {
  const paint = art ? COVER[art] : undefined;
  if (!paint) return false;
  // Soft shadow on the deck, then the sprite
  ctx.save();
  ctx.fillStyle = 'rgba(0,0,0,0.28)';
  ctx.fillRect(cx - s * 0.36, cy + s * 0.26, s * 0.72, s * 0.1);
  ctx.restore();
  const size = s * 0.9;
  blit(ctx, sprite(`cover:${art}`, paint, '#071014'), cx - size / 2, cy - size / 2, size, size);
  return true;
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
