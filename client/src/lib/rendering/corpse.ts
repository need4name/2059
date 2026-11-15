// The last body where it fell, for the room card: a strip of deck, the body lying on it, aged by how long
// it's been (engine/clock.ts). Fresh: wet blood and the part glinting. Days: the blood browned, flies, a
// gull at it. Weeks: a stain, bones, plastic grown over it and washed up round it.

import { paintCorpse, type CorpseAge, type DollSpec } from './dolls';

type Ctx = CanvasRenderingContext2D;
const GULL = ['....ww......', '...wwwd.....', '.yywwww.....', '....wwwgg...', '...wwwwggg..', '....wwwwggd.', '.....o..o...', '.....o..o...'];
const GULL_COL: Record<string, string> = { w: '#f2f2ee', g: '#9aa3aa', d: '#2a2f34', y: '#f0c048', o: '#e88a3a' };
const hash = (n: number, k: number) => { let h = Math.imul(n ^ 0x9e3779b9, 0x85ebca6b) ^ Math.imul(k + 1, 0xc2b2ae35); h ^= h >>> 15; h = Math.imul(h, 0x27d4eb2f); return ((h ^ (h >>> 13)) >>> 0) / 4294967296; };

export function drawCorpseScene(ctx: Ctx, w: number, h: number, spec: DollSpec, age: CorpseAge, now: number, floor = { light: '#5c7380', dark: '#536975', seam: '#2c3d47' }) {
  const p = Math.max(2, Math.round(h / 40));
  ctx.save();
  ctx.imageSmoothingEnabled = false;
  // The deck: plates with hairline seams
  ctx.fillStyle = floor.light; ctx.fillRect(0, 0, w, h);
  const plate = p * 14;
  for (let x = 0; x < w; x += plate) for (let y = 0; y < h; y += plate) { if (((x / plate) + (y / plate)) % 2) { ctx.fillStyle = floor.dark; ctx.fillRect(x, y, plate, plate); } }
  ctx.fillStyle = floor.seam; ctx.globalAlpha = 0.5;
  for (let x = 0; x < w; x += plate) ctx.fillRect(x, 0, 1, h);
  for (let y = 0; y < h; y += plate) ctx.fillRect(0, y, w, 1);
  ctx.globalAlpha = 1;
  const cx = Math.round(w / 2), cy = Math.round(h / 2 + p * 2);
  // Blood under it: wet red, then brown, then a faint stain
  const pool = age === 'fresh' ? ['#5a0e0e', '#8a1a1a', '#b02a2a'] : age === 'days' ? ['#3a1a12', '#5a2a1a', '#6e3a24'] : ['#4a4a44', '#56564e', '#5e5e56'];
  // A pool spreading out from under the torso, wider than the body, ragged at the edge
  const rows = [0.35, 0.6, 0.78, 0.9, 0.97, 1, 1, 0.97, 0.9, 0.78, 0.62, 0.4, 0.2];
  rows.forEach((k, r) => {
    const rw = Math.round((w * 0.5 * k) / p) * p, x0 = Math.round((cx - rw / 2 - p * 2) / p) * p, y = cy - p * 9 + r * p * 1.5;
    ctx.globalAlpha = age === 'weeks' ? 0.5 : 0.95; ctx.fillStyle = pool[r > 2 && r < 10 ? 1 : 0];
    ctx.fillRect(x0, Math.round(y), rw, Math.ceil(p * 1.5));
    // ragged ends
    ctx.fillRect(x0 - p * Math.round(hash(r, 3) * 3), Math.round(y), p * 2, p);
  });
  ctx.fillStyle = pool[2]; ctx.globalAlpha = age === 'fresh' ? 0.9 : 0;
  for (let k = 0; k < 5; k++) ctx.fillRect(Math.round(cx - w * 0.15 + hash(k, 9) * w * 0.3), Math.round(cy - p * 6 + hash(k, 10) * p * 12), p * 2, p);
  if (age === 'fresh') { ctx.globalAlpha = 0.9; ctx.fillStyle = pool[2]; ctx.fillRect(cx + p * 10, cy - p, p * 6, p); ctx.fillStyle = '#ffffff'; ctx.globalAlpha = 0.5; ctx.fillRect(cx + p * 12, cy - p, p * 2, p); }
  ctx.globalAlpha = 1;
  // The body, lying on its back, head to the left
  const body = paintCorpse(spec, age), S = body.S;
  const img = document.createElement('canvas'); img.width = S; img.height = S;
  const ic = img.getContext('2d')!;
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) { const v = body.c[y][x]; if (v) { ic.fillStyle = v; ic.fillRect(x, y, 1, 1); } }
  const scale = p;
  ctx.save(); ctx.translate(cx, cy); ctx.rotate(-Math.PI / 2);
  ctx.drawImage(img, -S * scale / 2, -S * scale / 2 - p * 2, S * scale, S * scale);
  ctx.restore();
  // Where a grid pixel (gx, gy) of the body lands, after turning it
  const at = (gx: number, gy: number) => ({ x: cx + (gy - S / 2) * scale + p * 2, y: cy - (gx - S / 2) * scale });
  // The part still fitted: a glint, bright while fresh, faint after days
  if (body.glint) {
    const g = at(body.glint.x, body.glint.y), on = (Math.floor(now / 500) % 3) === 0;
    if (on) { ctx.fillStyle = '#ffffff'; ctx.globalAlpha = age === 'fresh' ? 1 : 0.5; const r = p * 2; ctx.fillRect(g.x - r, g.y, r * 2 + p, p); ctx.fillRect(g.x, g.y - r, p, r * 2 + p); ctx.globalAlpha = 1; }
  }
  if (age === 'days') {
    // Flies over it
    for (let i = 0; i < 16; i++) { const a = now / (220 + i * 31) + i * 2.1; ctx.fillStyle = i % 3 ? '#14161a' : '#2e3a2a'; const fx = Math.round(cx - w * 0.05 + Math.cos(a) * w * 0.16 + Math.sin(a * 2.3) * p * 4), fy = Math.round(cy - p * 4 + Math.sin(a * 1.4) * h * 0.26); ctx.fillRect(fx, fy, p, p); if (i % 2) { ctx.globalAlpha = 0.5; ctx.fillStyle = '#c8d2dc'; ctx.fillRect(fx - p, fy - p, p, p); ctx.fillRect(fx + p, fy - p, p, p); ctx.globalAlpha = 1; } }
    // A gull at its feet, pecking
    const peck = Math.floor(now / 380) % 4 === 0 ? p : 0, gx = Math.round(cx + w * 0.24), gy = Math.round(cy - p * 10);
    GULL.forEach((row, ry) => { for (let rx = 0; rx < row.length; rx++) { const ch = row[rx]; if (ch === '.') continue; ctx.fillStyle = GULL_COL[ch]; ctx.fillRect(gx + rx * p, gy + ry * p + (ry < 3 ? peck : 0), p, p); } });
  }
  if (age === 'weeks') {
    // Washed up round it: caps, a scrap of net, a bottle
    const cols = ['#e8503a', '#48c8dc', '#f0c048', '#e8e0d0', '#5a9a5a'];
    for (let i = 0; i < 14; i++) { ctx.fillStyle = cols[i % cols.length]; ctx.fillRect(Math.round(hash(i, 1) * w / p) * p, Math.round((0.15 + hash(i, 2) * 0.75) * h / p) * p, p, p); }
    ctx.fillStyle = '#3a6a5a'; for (let k = 0; k < 6; k++) ctx.fillRect(Math.round(w * 0.12) + k * p * 2, Math.round(h * 0.7) + (k % 2) * p, p, p);
    ctx.fillStyle = '#8ab8b0'; ctx.globalAlpha = 0.8; ctx.fillRect(Math.round(w * 0.82), Math.round(h * 0.3), p * 5, p * 2); ctx.fillRect(Math.round(w * 0.82) + p * 5, Math.round(h * 0.3), p, p); ctx.globalAlpha = 1;
  }
  ctx.restore();
}
