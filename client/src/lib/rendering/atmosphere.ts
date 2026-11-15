// The light and weather a host wakes to, laid over the fight board and the signal's map. Pixel-stepped,
// no soft blobs: a tint for the time of day, lights that carry at night, and rain, fog or overcast on top.
// Visual only (see engine/clock.ts).

import type { DayPart, Weather } from '../engine/clock';

type Ctx = CanvasRenderingContext2D;
/** What the light does, by time of day: a multiply tint (colour, strength) and how much lights carry. */
const LIGHT: Record<DayPart, { tint: string; k: number; glow: number }> = {
  dawn:  { tint: '#ffcfa8', k: 0.55, glow: 0.25 },
  day:   { tint: '#ffffff', k: 0,    glow: 0 },
  dusk:  { tint: '#e0909a', k: 0.6,  glow: 0.4 },
  night: { tint: '#33406e', k: 0.82, glow: 1 },
};
const hash = (n: number, k: number) => { let h = Math.imul(n ^ 0x9e3779b9, 0x85ebca6b) ^ Math.imul(k + 1, 0xc2b2ae35); h ^= h >>> 15; h = Math.imul(h, 0x27d4eb2f); return ((h ^ (h >>> 13)) >>> 0) / 4294967296; };

/** A wake's light: multiply tints (colour, strength), one after the other, and how much lights carry in it. */
export interface Light { key: string; steps: { tint: string; k: number }[]; glow: number; dayPart: DayPart; weather: Weather }
export function lightOf(dayPart: DayPart, weather: Weather): Light {
  const steps: { tint: string; k: number }[] = [];
  if (weather === 'overcast' || weather === 'rain') steps.push({ tint: '#8f9aa6', k: weather === 'rain' ? 0.45 : 0.3 });
  if (LIGHT[dayPart].k > 0) steps.push({ tint: LIGHT[dayPart].tint, k: LIGHT[dayPart].k });
  return { key: `${dayPart}-${weather}`, steps, glow: LIGHT[dayPart].glow, dayPart, weather };
}
const rgb = (hex: string) => { const n = parseInt(hex.slice(1, 7), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };
/** A colour as it looks in this light (the same multiply the sprites get). */
export function litColor(hex: string, light: Light): string {
  if (!light.steps.length || !/^#[0-9a-f]{6}/i.test(hex)) return hex;
  let c = rgb(hex);
  for (const s of light.steps) { const t = rgb(s.tint); c = c.map((v, i) => v * (1 - s.k + s.k * t[i] / 255)); }
  return `#${c.map(v => Math.round(v).toString(16).padStart(2, '0')).join('')}${hex.length === 9 ? hex.slice(7) : ''}`;
}
/** Every colour in a tileset (floor, sea, slab), lit. */
const litSets = new Map<string, unknown>();
export function litTileset<T>(t: T, light: Light): T {
  if (!light.steps.length) return t;
  const key = `${light.key}|${JSON.stringify(t)}`;
  const hit = litSets.get(key); if (hit) return hit as T;
  const walk = (v: unknown): unknown => typeof v === 'string' ? (v.startsWith('#') ? litColor(v, light) : v) : Array.isArray(v) ? v.map(walk) : v && typeof v === 'object' ? Object.fromEntries(Object.entries(v).map(([k, x]) => [k, walk(x)])) : v;
  const out = walk(t) as T;
  if (litSets.size > 40) litSets.clear();
  litSets.set(key, out);
  return out;
}
/** A sprite drawn in this light: multiplied, its transparency kept. Cached by whatever key the caller gives. */
const litSprites = new Map<string, HTMLCanvasElement>();
export function litCanvas(src: HTMLCanvasElement, key: string, light: Light): HTMLCanvasElement {
  if (!light.steps.length) return src;
  const k = `${light.key}|${key}`;
  const hit = litSprites.get(k); if (hit) return hit;
  const c = document.createElement('canvas'); c.width = src.width; c.height = src.height;
  const x = c.getContext('2d')!;
  x.drawImage(src, 0, 0);
  x.globalCompositeOperation = 'multiply';
  for (const s of light.steps) { x.globalAlpha = s.k; x.fillStyle = s.tint; x.fillRect(0, 0, c.width, c.height); }
  x.globalCompositeOperation = 'destination-in'; x.globalAlpha = 1; x.drawImage(src, 0, 0);
  if (litSprites.size > 400) litSprites.clear();
  litSprites.set(k, c);
  return c;
}

/**
 * The weather over the board, and the lights that carry in the dark (no tint: the board lights its own colours,
 * so what it shows about play stays as bright as ever). `lights` are glowing points in the same space.
 */
export function drawWeather(ctx: Ctx, w: number, h: number, light: Light, now: number, lights: { x: number; y: number; r: number; color: string }[] = [], px = 2) {
  ctx.save();
  if (light.glow > 0 && lights.length) {
    ctx.globalCompositeOperation = 'lighter';
    for (const l of lights) {
      const flick = 0.85 + 0.15 * Math.sin(now / 180 + l.x * 0.13);
      for (let s = 3; s >= 1; s--) {
        const r = Math.round(l.r * (s / 3) / px) * px;
        ctx.globalAlpha = 0.09 * light.glow * flick * (4 - s) / 2;
        ctx.fillStyle = l.color;
        ctx.beginPath(); ctx.arc(l.x, l.y, r, 0, Math.PI * 2); ctx.fill();
      }
    }
    ctx.globalCompositeOperation = 'source-over';
  }
  ctx.restore();
  particles(ctx, w, h, light.dayPart, light.weather, now, px);
}

/**
 * Lay the wake's light and weather over (0, 0, w, h). `lights` are points that glow in the dark (fires,
 * implant lights, lit windows), in the same space; `px` is one art pixel on screen.
 */
export function drawAtmosphere(ctx: Ctx, w: number, h: number, dayPart: DayPart, weather: Weather, now: number, lights: { x: number; y: number; r: number; color: string }[] = [], px = 2) {
  ctx.save();
  const L = LIGHT[dayPart];
  // Overcast: everything a little greyer and flatter
  if (weather === 'overcast' || weather === 'rain') { ctx.globalCompositeOperation = 'multiply'; ctx.globalAlpha = weather === 'rain' ? 0.45 : 0.3; ctx.fillStyle = '#8f9aa6'; ctx.fillRect(0, 0, w, h); }
  // The time of day
  if (L.k > 0) {
    ctx.globalCompositeOperation = 'multiply'; ctx.globalAlpha = L.k; ctx.fillStyle = L.tint; ctx.fillRect(0, 0, w, h);
    // Dawn and dusk: the low sun warms one side
    if (dayPart !== 'night') {
      ctx.globalCompositeOperation = 'soft-light'; ctx.fillStyle = dayPart === 'dawn' ? '#ffb070' : '#ff7a50';
      for (let b = 0; b < 4; b++) { ctx.globalAlpha = 0.18 - b * 0.04; ctx.fillRect(0, (h / 4) * b, w, h / 4); }
    }
  }
  // Lights carry in the dark: stepped rings, brighter the darker it is
  if (L.glow > 0 && lights.length) {
    ctx.globalCompositeOperation = 'lighter';
    for (const l of lights) {
      const flick = 0.85 + 0.15 * Math.sin(now / 180 + l.x * 0.13);
      for (let s = 3; s >= 1; s--) {
        const r = Math.round(l.r * (s / 3) / px) * px;
        ctx.globalAlpha = 0.11 * L.glow * flick * (4 - s) / 2;
        ctx.fillStyle = l.color;
        ctx.beginPath(); ctx.arc(l.x, l.y, r, 0, Math.PI * 2); ctx.fill();
      }
    }
  }
  ctx.globalCompositeOperation = 'source-over';
  ctx.restore();
  particles(ctx, w, h, dayPart, weather, now, px);
}

/** Rain and fog. */
function particles(ctx: Ctx, w: number, h: number, dayPart: DayPart, weather: Weather, now: number, px: number) {
  ctx.save();
  // Rain: slanted streaks falling, and small splashes on the deck
  if (weather === 'rain') {
    const n = Math.round((w * h) / 2600);
    for (let i = 0; i < n; i++) {
      const sp = 0.5 + hash(i, 1) * 0.4, len = px * (5 + Math.floor(hash(i, 2) * 4));
      const t = ((now * sp * 0.9) / h + hash(i, 3)) % 1;
      const x0 = hash(i, 4) * (w + h * 0.3), y = t * (h + len) - len, x = x0 - t * h * 0.3;
      ctx.globalAlpha = 0.28 + hash(i, 5) * 0.2; ctx.fillStyle = dayPart === 'night' ? '#7f93b8' : '#c9dbe8';
      for (let k = 0; k < len; k += px) ctx.fillRect(Math.round(x - k * 0.3), Math.round(y + k), Math.max(1, px / 2), px);
    }
    for (let i = 0; i < n / 4; i++) {
      const k = ((now / 420) + hash(i, 6)) % 1; if (k > 0.35) continue;
      ctx.globalAlpha = 0.5 * (1 - k / 0.35); ctx.fillStyle = '#d8e8f2';
      const x = Math.round(hash(i, 7 + Math.floor(now / 420)) * w), y = Math.round(hash(i, 8 + Math.floor(now / 420)) * h), r = px * (1 + Math.round(k * 4));
      ctx.fillRect(x - r, y, px, px); ctx.fillRect(x + r, y, px, px); ctx.fillRect(x, y - Math.round(r / 2), px, px);
    }
  }
  // Fog: pale bands thickest at the far edge (the top), drifting slowly
  if (weather === 'fog') {
    ctx.fillStyle = dayPart === 'night' ? '#5a6680' : '#d6dee4';
    const bands = 6;
    for (let b = 0; b < bands; b++) { ctx.globalAlpha = 0.42 * (1 - b / bands) ** 1.5; ctx.fillRect(0, Math.round((h * 0.75 * b) / bands), w, Math.ceil((h * 0.75) / bands)); }
    for (let i = 0; i < 9; i++) {
      const x = ((hash(i, 9) * w + now * 0.006 * (0.5 + hash(i, 10))) % (w + 120)) - 60, y = hash(i, 11) * h * 0.85;
      ctx.globalAlpha = 0.12; ctx.fillRect(Math.round(x / px) * px, Math.round(y / px) * px, Math.round((40 + hash(i, 12) * 70) / px) * px, px * 3);
    }
  }
  ctx.restore();
}
