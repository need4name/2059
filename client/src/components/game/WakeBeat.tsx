import { useEffect, useRef } from 'react';
import { drawAtmosphere } from '@/lib/rendering/atmosphere';
import type { DayPart, Weather } from '@/lib/engine/clock';

// The moment a host wakes: no words. Black, then the eyelids open (a half-blink or two), and the sky and sea
// come into focus from coarse blocks to fine, in the light and weather this host woke to; then it fades into
// the hub. About three and a half seconds.
const SKY: Record<DayPart, string[]> = {
  dawn:  ['#2a3458', '#5a4a78', '#b0607a', '#e8906a', '#ffc27a'],
  day:   ['#3a78b8', '#4f8cc8', '#6aa2d4', '#8cbadf', '#b4d2e8'],
  dusk:  ['#1e1a3a', '#3e2a5a', '#7a3a6a', '#c0505a', '#e8805a'],
  night: ['#05070e', '#080c18', '#0c1222', '#111a2e', '#16223a'],
};
const SEA: Record<DayPart, string[]> = {
  dawn: ['#3a4a6a', '#2e3c58', '#243048'], day: ['#2a6a8a', '#225a78', '#1a4a66'],
  dusk: ['#3a2e4a', '#2c2440', '#201a32'], night: ['#0a1220', '#08101a', '#060c14'],
};
const hash = (n: number, k: number) => { let h = Math.imul(n ^ 0x9e3779b9, 0x85ebca6b) ^ Math.imul(k + 1, 0xc2b2ae35); h ^= h >>> 15; h = Math.imul(h, 0x27d4eb2f); return ((h ^ (h >>> 13)) >>> 0) / 4294967296; };

/** Paint the view at `px` screen pixels per art pixel (big while the eyes still focus). */
function paintView(ctx: CanvasRenderingContext2D, w: number, h: number, part: DayPart, weather: Weather, now: number, px: number) {
  const horizon = Math.round(h * 0.62 / px) * px;
  const sky = SKY[part];
  for (let i = 0; i < sky.length; i++) { ctx.fillStyle = sky[i]; ctx.fillRect(0, Math.round((horizon * i) / sky.length / px) * px, w, Math.ceil(horizon / sky.length / px) * px + px); }
  // Sun or moon, and stars at night
  if (part === 'night') {
    for (let i = 0; i < 60; i++) { if ((Math.floor(now / 400) + i) % 7 === 0) continue; ctx.fillStyle = i % 5 ? '#c8d2e8' : '#ffffff'; ctx.fillRect(Math.round(hash(i, 1) * w / px) * px, Math.round(hash(i, 2) * horizon * 0.9 / px) * px, px, px); }
    ctx.fillStyle = '#e8ecf4'; const mx = Math.round(w * 0.72 / px) * px, my = Math.round(horizon * 0.25 / px) * px;
    for (let y = -4; y <= 4; y++) for (let x = -4; x <= 4; x++) if (x * x + y * y <= 17 && (x + 2) * (x + 2) + y * y > 12) ctx.fillRect(mx + x * px, my + y * px, px, px);
  } else if (weather === 'clear') {
    const sx = Math.round(w * (part === 'dawn' ? 0.2 : part === 'dusk' ? 0.8 : 0.6) / px) * px, sy = part === 'day' ? Math.round(horizon * 0.25 / px) * px : horizon - px * 6;
    ctx.fillStyle = part === 'day' ? '#fff6d8' : '#ffd08a';
    for (let y = -5; y <= 5; y++) for (let x = -5; x <= 5; x++) if (x * x + y * y <= 26) ctx.fillRect(sx + x * px, sy + y * px, px, px);
  }
  // The archipelago on the horizon: stacked plastic, a crane, lights at night
  ctx.fillStyle = part === 'night' ? '#05080e' : part === 'day' ? '#3a4a58' : '#2a2438';
  for (let x = 0; x < w; x += px) { const k = Math.floor(x / (px * 6)); const hh = (2 + Math.floor(hash(k, 3) * 7)) * px; if (hash(k, 4) < 0.7) ctx.fillRect(x, horizon - hh, px, hh); }
  ctx.fillRect(Math.round(w * 0.3 / px) * px, horizon - px * 16, px, px * 16); ctx.fillRect(Math.round(w * 0.3 / px) * px, horizon - px * 16, px * 9, px);
  if (part === 'night' || part === 'dusk') for (let i = 0; i < 12; i++) { ctx.fillStyle = i % 3 ? '#ffb85a' : '#ff5a4a'; ctx.globalAlpha = (Math.floor(now / 600) + i) % 4 ? 0.9 : 0.3; ctx.fillRect(Math.round(hash(i, 5) * w / px) * px, horizon - Math.round((1 + hash(i, 6) * 6)) * px, px, px); }
  ctx.globalAlpha = 1;
  // The sea, with glints moving on it
  const sea = SEA[part];
  for (let i = 0; i < sea.length; i++) { ctx.fillStyle = sea[i]; ctx.fillRect(0, horizon + Math.round(((h - horizon) * i) / sea.length / px) * px, w, Math.ceil((h - horizon) / sea.length / px) * px + px); }
  ctx.fillStyle = part === 'night' ? '#4a5a7a' : '#d8e8f2';
  for (let i = 0; i < 40; i++) { const k = ((now / 2600) + hash(i, 7)) % 1; ctx.globalAlpha = Math.sin(k * Math.PI) * 0.7; ctx.fillRect(Math.round(hash(i, 8) * w / px) * px, horizon + Math.round((0.1 + hash(i, 9) * 0.85) * (h - horizon) / px) * px, px * (2 + Math.floor(hash(i, 10) * 3)), px); }
  ctx.globalAlpha = 1;
  // Gulls at dawn and in the day
  if ((part === 'dawn' || part === 'day') && weather !== 'rain') for (let i = 0; i < 3; i++) {
    const gx = Math.round((((now / 40) * (0.6 + i * 0.2) + hash(i, 11) * w) % (w + 40) - 20) / px) * px, gy = Math.round((horizon * (0.3 + i * 0.12)) / px) * px, flap = Math.floor(now / 200 + i) % 2;
    ctx.fillStyle = '#f2f2ee'; ctx.fillRect(gx, gy, px, px); ctx.fillRect(gx - px, gy - flap * px, px, px); ctx.fillRect(gx + px, gy - flap * px, px, px); ctx.fillRect(gx - px * 2, gy - px + flap * px, px, px); ctx.fillRect(gx + px * 2, gy - px + flap * px, px, px);
  }
  // Weather over all of it (the light is already in the sky's own colours)
  if (weather !== 'clear') drawAtmosphere(ctx, w, h, 'day', weather, now, [], px);
}

export function WakeBeat({ dayPart, weather, onDone }: { dayPart: DayPart; weather: Weather; onDone: () => void }) {
  const ref = useRef<HTMLCanvasElement | null>(null);
  // Held in a ref so the hub re-rendering underneath doesn't start the beat over
  const done = useRef(onDone); done.current = onDone;
  useEffect(() => {
    const c = ref.current; if (!c) return;
    const dpr = window.devicePixelRatio || 1, w = c.clientWidth * dpr, h = c.clientHeight * dpr;
    c.width = w; c.height = h;
    const ctx = c.getContext('2d')!; ctx.imageSmoothingEnabled = false;
    const t0 = performance.now(); let raf = 0;
    const frame = () => {
      const t = performance.now() - t0, now = Date.now();
      // Focus: from coarse blocks to fine
      const focus = Math.min(1, Math.max(0, (t - 500) / 1900));
      const px = Math.max(Math.round(2 * dpr), Math.round((2 + (1 - focus) * 22) * dpr));
      ctx.fillStyle = '#000'; ctx.fillRect(0, 0, w, h);
      paintView(ctx, w, h, dayPart, weather, now, px);
      // The eyelids: closed, open, a half-blink, open, a smaller one, open
      const open = t < 500 ? 0 : t < 1100 ? (t - 500) / 600 : t < 1300 ? 1 - (t - 1100) / 200 * 0.55 : t < 1600 ? 0.45 + (t - 1300) / 300 * 0.55 : t < 1750 ? 1 - (t - 1600) / 150 * 0.25 : t < 1950 ? 0.75 + (t - 1750) / 200 * 0.25 : 1;
      const lid = Math.round((h / 2) * (1 - Math.max(0, Math.min(1, open))) / (4 * dpr)) * 4 * dpr;
      ctx.fillStyle = '#000'; ctx.fillRect(0, 0, w, lid); ctx.fillRect(0, h - lid, w, lid);
      // A dark vignette at the edges while it's still coming (stepped, not soft)
      for (let s = 0; s < 4; s++) { ctx.globalAlpha = (0.35 - s * 0.08) * (1 - focus * 0.6); ctx.fillStyle = '#000'; const b = Math.round((s + 1) * 10 * dpr); ctx.fillRect(0, 0, b, h); ctx.fillRect(w - b, 0, b, h); }
      ctx.globalAlpha = 1;
      // Then away into the hub
      c.style.opacity = String(t < 2900 ? 1 : Math.max(0, 1 - (t - 2900) / 600));
      if (t < 3500) raf = requestAnimationFrame(frame); else done.current();
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [dayPart, weather]);
  return <canvas ref={ref} className="pointer-events-none fixed inset-0 z-[60] h-full w-full" />;
}
