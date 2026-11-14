// What a body's structure bar looks like on the body itself. The painted wear (cracks,
// chips, dead lights) lives in dolls.ts; this file draws what moves: sparks spitting
// from failing implants, smoke from broken ones, the picture glitching, and the burst
// of a misfire. Visual only, so Math.random-free but not seeded either: it runs on time.

import { dollPoint, implantSpots, type DollSpec } from './dolls';

export type Wear = 0 | 1 | 2 | 3;
/** How worn a body looks: whole at two thirds or more, cracked under, failing under a third, broken at none. */
export function wearOf(current: number, max: number): Wear {
  if (max <= 0) return 0;
  if (current <= 0) return 3;
  const f = current / max;
  return f < 1 / 3 ? 2 : f < 2 / 3 ? 1 : 0;
}

const hash = (n: number, k: number) => { let h = Math.imul(n ^ 0x9e3779b9, 0x85ebca6b) ^ Math.imul(k + 1, 0xc2b2ae35); h ^= h >>> 15; h = Math.imul(h, 0x27d4eb2f); return ((h ^ (h >>> 13)) >>> 0) / 4294967296; };
const SPARK = ['#ffffff', '#fff3b0', '#ffd24a', '#ff8a2a'];

/** A spray of sparks from (x, y), t ms after it started. */
function spray(ctx: CanvasRenderingContext2D, x: number, y: number, unit: number, t: number, n: number, seed: number, life = 380, reach = 1, grain = 1) {
  if (t < 0 || t > life) return;
  const k = t / life, p = Math.max(1, Math.round(unit * grain));
  for (let i = 0; i < n; i++) {
    const a = -Math.PI * (0.15 + 0.7 * hash(seed, i)) - (hash(seed, i + 40) < 0.5 ? 0 : Math.PI * 0.0);
    const side = hash(seed, i + 80) < 0.5 ? -1 : 1;
    const v = unit * (0.06 + 0.1 * hash(seed, i + 20)) * reach;
    const sx = x + Math.cos(a) * v * t * side, sy = y + Math.sin(a) * v * t + 0.00009 * unit * t * t * 6;
    ctx.globalAlpha = 1 - k * k;
    ctx.fillStyle = SPARK[Math.min(3, Math.floor(k * 4 + hash(seed, i + 60)))];
    ctx.fillRect(Math.round(sx), Math.round(sy), p, p);
  }
  // The flash where it left
  if (k < 0.25) { const f = p * (grain > 1 ? 2 : 1); ctx.globalAlpha = 1 - k * 4; ctx.fillStyle = '#ffffff'; ctx.fillRect(Math.round(x - f), Math.round(y - f), f * 2, f * 2); }
  ctx.globalAlpha = 1;
}

/**
 * The moving part of wear, drawn over a body drawn with drawDoll(x, y, size, faceLeft):
 * failing implants spit a spark now and then; broken ones spit often, smoke, and the
 * picture glitches (`redraw` draws the body again, shifted by dx screen pixels).
 */
export function drawWearFx(ctx: CanvasRenderingContext2D, spec: DollSpec, wear: Wear, x: number, y: number, size: number, faceLeft: boolean, now: number, seed: number,
  redraw?: (dx: number) => void) {
  if (wear < 2) return;
  const spots = implantSpots(spec);
  if (!spots.length) return;
  const at = (i: number) => { const s = spots[Math.floor(i * spots.length) % spots.length]; return dollPoint(spec, x, y, size, faceLeft, s.x, s.y); };
  ctx.save();
  // Sparks: every so often, from somewhere on the implants
  const every = wear === 3 ? 620 : 1500;
  for (let j = 0; j < 2; j++) {
    const ev = Math.floor(now / every) - j, start = ev * every + hash(ev, seed) * every * 0.5;
    const p = at(hash(ev, seed + 7));
    spray(ctx, p.x, p.y, p.unit, now - start, wear === 3 ? 6 : 4, ev * 13 + seed);
  }
  if (wear === 3) {
    // Smoke: a thin grey thread from the highest implant
    const top = spots.reduce((m, s) => (s.y < m.y ? s : m), spots[0]);
    const o = dollPoint(spec, x, y, size, faceLeft, top.x, top.y);
    for (let i = 0; i < 5; i++) {
      const k = ((now / 1700) + i / 5) % 1, r = Math.max(1, Math.round(o.unit * (1 + k * 2.2)));
      ctx.globalAlpha = 0.38 * (1 - k);
      ctx.fillStyle = i % 2 ? '#4a4f55' : '#5c6268';
      ctx.fillRect(Math.round(o.x + Math.sin(now / 420 + i * 1.7) * o.unit * 2 - r / 2), Math.round(o.y - k * size * 0.55 - r / 2), r, r);
    }
    // Glitch: now and then a band of the picture slips sideways for a moment
    const tick = Math.floor(now / 130);
    if (redraw && hash(tick, seed + 3) < 0.13) {
      const unit = size / 48, band = size * (0.08 + 0.1 * hash(tick, seed + 4)), by = y + size * (0.15 + 0.65 * hash(tick, seed + 5));
      const dx = (hash(tick, seed + 6) < 0.5 ? -1 : 1) * Math.round(unit * (2 + 2 * hash(tick, seed + 8)));
      ctx.globalAlpha = 1;
      ctx.save(); ctx.beginPath(); ctx.rect(x - size, by, size * 3, band); ctx.clip(); redraw(dx); ctx.restore();
      // A thin cyan and magenta edge on the slipped band, about as wide as the body
      const bw = size * 0.42, bx = x + size / 2 - bw / 2;
      ctx.globalAlpha = 0.6; ctx.fillStyle = '#5ff0ff'; ctx.fillRect(Math.round(bx + dx), Math.round(by), Math.round(bw), Math.max(1, Math.round(unit)));
      ctx.fillStyle = '#ff4ad8'; ctx.fillRect(Math.round(bx - dx), Math.round(by + band), Math.round(bw), Math.max(1, Math.round(unit)));
    }
  }
  ctx.restore();
}

/** A misfire, t ms in: a hard burst of sparks and a puff from the implant that failed. */
export function drawMisfire(ctx: CanvasRenderingContext2D, spec: DollSpec, x: number, y: number, size: number, faceLeft: boolean, t: number, slot: { x: number; y: number }) {
  const p = dollPoint(spec, x, y, size, faceLeft, slot.x, slot.y);
  ctx.save();
  // A hard white pop, a spray of fat sparks, a few fine ones, then a puff of dark smoke
  if (t >= 0 && t < 90) { const r = p.unit * (5 - t / 30); ctx.globalAlpha = 0.9; ctx.fillStyle = '#ffffff'; ctx.fillRect(Math.round(p.x - r), Math.round(p.y - r / 2), Math.round(r * 2), Math.round(r)); ctx.fillRect(Math.round(p.x - r / 2), Math.round(p.y - r), Math.round(r), Math.round(r * 2)); }
  spray(ctx, p.x, p.y, p.unit, t, 12, 99, 560, 2.4, 2);
  spray(ctx, p.x, p.y, p.unit, t, 10, 57, 420, 1.6);
  if (t >= 0 && t < 900) {
    const k = t / 900;
    for (let i = 0; i < 5; i++) {
      const r = Math.round(p.unit * (2.5 + k * 5));
      ctx.globalAlpha = 0.55 * (1 - k); ctx.fillStyle = i % 2 ? '#3e4348' : '#5c6268';
      ctx.fillRect(Math.round(p.x + (i - 1.5) * p.unit * 2.5 - r / 2), Math.round(p.y - k * size * 0.3 - (i % 2) * p.unit * 2 - r / 2), r, r);
    }
  }
  ctx.restore();
}
