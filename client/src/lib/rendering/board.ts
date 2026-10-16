// The board, drawn to look like the place you're standing in. Chapter one is a
// raft deck lashed together on the Indian Ocean: planks over open sea, with
// hazards and cover drawn as what they are. Each function draws one thing into a
// tile-sized box; colours come from the chapter's tileset.

import type { Tileset } from '../combat/chapters';

type Ctx = CanvasRenderingContext2D;

/** A stable 0..1 number for a tile, so planks and scuffs don't flicker between frames. */
const hash = (a: number, b: number, salt = 0) => {
  const n = Math.sin(a * 127.1 + b * 311.7 + salt * 74.7) * 43758.5453;
  return n - Math.floor(n);
};

function rounded(ctx: Ctx, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

/** Open sea behind and between the decks, with slow swell lines. */
export function drawSea(ctx: Ctx, w: number, h: number, t: Tileset, now: number) {
  const g = ctx.createLinearGradient(0, 0, 0, h);
  g.addColorStop(0, t.sea.top);
  g.addColorStop(1, t.sea.bottom);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
  // Swell: soft broken lines drifting sideways
  ctx.save();
  ctx.strokeStyle = t.sea.foam;
  ctx.lineCap = 'round';
  for (let i = 0; i < 26; i++) {
    const y = (hash(i, 1) * h + now / 90 * (0.3 + hash(i, 2) * 0.4)) % h;
    const x = ((hash(i, 3) * w + now / 60 * (0.5 + hash(i, 4))) % (w + 80)) - 40;
    const len = 18 + hash(i, 5) * 40;
    ctx.globalAlpha = 0.08 + 0.1 * hash(i, 6);
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.quadraticCurveTo(x + len / 2, y - 3, x + len, y);
    ctx.stroke();
  }
  // Far rafts on the horizon line
  ctx.globalAlpha = 0.35;
  ctx.fillStyle = '#0a2028';
  for (let i = 0; i < 4; i++) {
    const x = hash(i, 9) * w, y = 10 + hash(i, 10) * 14, rw = 24 + hash(i, 11) * 40;
    ctx.fillRect(x, y, rw, 3);
    ctx.fillRect(x + rw * 0.3, y - 6 - hash(i, 12) * 6, 2, 6 + hash(i, 12) * 6);
  }
  ctx.restore();
}

/** One deck tile: lashed planks, running across or along by tile, with a little grain. */
export function drawDeckTile(ctx: Ctx, x: number, y: number, w: number, h: number, r: number, row: number, col: number, t: Tileset) {
  rounded(ctx, x, y, w, h, r);
  ctx.fillStyle = (row + col) % 2 === 0 ? t.floor.light : t.floor.dark;
  ctx.fill();
  ctx.save();
  rounded(ctx, x, y, w, h, r);
  ctx.clip();
  const across = hash(row, col) > 0.5;
  const planks = 3;
  ctx.strokeStyle = t.floor.seam;
  ctx.lineWidth = Math.max(1, w * 0.025);
  ctx.globalAlpha = 0.7;
  for (let k = 1; k < planks; k++) {
    ctx.beginPath();
    if (across) { ctx.moveTo(x, y + (h * k) / planks); ctx.lineTo(x + w, y + (h * k) / planks); }
    else { ctx.moveTo(x + (w * k) / planks, y); ctx.lineTo(x + (w * k) / planks, y + h); }
    ctx.stroke();
  }
  // Grain and the odd nail
  ctx.globalAlpha = 0.18;
  ctx.lineWidth = 1;
  for (let k = 0; k < 4; k++) {
    const o = hash(row, col, k + 1);
    ctx.beginPath();
    if (across) { const yy = y + o * h; ctx.moveTo(x + w * 0.1, yy); ctx.lineTo(x + w * (0.4 + o * 0.5), yy); }
    else { const xx = x + o * w; ctx.moveTo(xx, y + h * 0.1); ctx.lineTo(xx, y + h * (0.4 + o * 0.5)); }
    ctx.stroke();
  }
  ctx.globalAlpha = 0.5;
  ctx.fillStyle = '#2a241c';
  const nail = Math.max(1, w * 0.03);
  if (hash(row, col, 9) > 0.4) { ctx.beginPath(); ctx.arc(x + w * 0.2, y + h * 0.2, nail, 0, Math.PI * 2); ctx.fill(); }
  if (hash(row, col, 10) > 0.6) { ctx.beginPath(); ctx.arc(x + w * 0.8, y + h * 0.75, nail, 0, Math.PI * 2); ctx.fill(); }
  ctx.restore();
}

/** A hazard, drawn as what it is. Returns false if the art name isn't known. */
export function drawHazard(ctx: Ctx, art: string | undefined, cx: number, cy: number, s: number, now: number): boolean {
  ctx.save();
  switch (art) {
    case 'fire': {
      // An oily slick with flames licking up from it
      ctx.fillStyle = 'rgba(20,16,12,0.8)';
      ctx.beginPath(); ctx.ellipse(cx, cy + s * 0.18, s * 0.38, s * 0.16, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = 'rgba(140,90,200,0.25)';
      ctx.beginPath(); ctx.ellipse(cx - s * 0.08, cy + s * 0.16, s * 0.2, s * 0.06, 0, 0, Math.PI * 2); ctx.fill();
      for (let k = 0; k < 3; k++) {
        const fx = cx + (k - 1) * s * 0.17;
        const flick = Math.sin(now / 90 + k * 2.1) * 0.06 + Math.sin(now / 37 + k) * 0.03;
        const fh = s * (0.42 + 0.12 * (k === 1 ? 1 : 0) + flick);
        const grad = ctx.createLinearGradient(fx, cy + s * 0.18, fx, cy + s * 0.18 - fh);
        grad.addColorStop(0, '#ff5a1f'); grad.addColorStop(0.6, '#ffb02e'); grad.addColorStop(1, 'rgba(255,240,150,0)');
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.moveTo(fx - s * 0.1, cy + s * 0.18);
        ctx.quadraticCurveTo(fx - s * 0.12, cy + s * 0.18 - fh * 0.5, fx + Math.sin(now / 120 + k) * s * 0.03, cy + s * 0.18 - fh);
        ctx.quadraticCurveTo(fx + s * 0.12, cy + s * 0.18 - fh * 0.5, fx + s * 0.1, cy + s * 0.18);
        ctx.closePath(); ctx.fill();
      }
      break;
    }
    case 'cable': {
      // A puddle with a live cable coiled in it, sparking
      ctx.fillStyle = 'rgba(60,110,130,0.55)';
      ctx.beginPath(); ctx.ellipse(cx, cy + s * 0.08, s * 0.4, s * 0.24, 0, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = '#1c1c1c'; ctx.lineWidth = Math.max(2, s * 0.07); ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(cx - s * 0.46, cy - s * 0.3);
      ctx.bezierCurveTo(cx - s * 0.1, cy - s * 0.3, cx - s * 0.3, cy + s * 0.2, cx, cy + s * 0.1);
      ctx.bezierCurveTo(cx + s * 0.25, cy, cx + s * 0.1, cy - s * 0.2, cx + s * 0.18, cy + s * 0.06);
      ctx.stroke();
      ctx.fillStyle = '#c0782f';
      ctx.beginPath(); ctx.arc(cx + s * 0.18, cy + s * 0.06, s * 0.05, 0, Math.PI * 2); ctx.fill();
      const on = Math.sin(now / 70) > 0.2;
      if (on) {
        ctx.strokeStyle = '#bff3ff'; ctx.lineWidth = 1.5; ctx.shadowColor = '#7fe7ff'; ctx.shadowBlur = 8;
        for (let k = 0; k < 3; k++) {
          const a = now / 50 + k * 2.1;
          ctx.beginPath();
          ctx.moveTo(cx + s * 0.18, cy + s * 0.06);
          ctx.lineTo(cx + s * 0.18 + Math.cos(a) * s * 0.12, cy + s * 0.06 + Math.sin(a) * s * 0.12);
          ctx.lineTo(cx + s * 0.18 + Math.cos(a + 0.5) * s * 0.2, cy + s * 0.06 + Math.sin(a + 0.5) * s * 0.2);
          ctx.stroke();
        }
      }
      break;
    }
    case 'chem': {
      // A pool of chemical bilge, bubbling
      const g = ctx.createRadialGradient(cx, cy, s * 0.05, cx, cy, s * 0.42);
      g.addColorStop(0, 'rgba(200,240,60,0.85)'); g.addColorStop(1, 'rgba(90,140,20,0.55)');
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.ellipse(cx, cy + s * 0.04, s * 0.42, s * 0.3, 0.2, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = 'rgba(230,255,140,0.8)'; ctx.lineWidth = 1.2;
      for (let k = 0; k < 4; k++) {
        const ph = ((now / 900 + k * 0.27) % 1);
        const bx = cx + (hash(k, 3) - 0.5) * s * 0.5, by = cy + (hash(k, 4) - 0.5) * s * 0.3;
        ctx.globalAlpha = 1 - ph;
        ctx.beginPath(); ctx.arc(bx, by, s * (0.03 + ph * 0.06), 0, Math.PI * 2); ctx.stroke();
      }
      break;
    }
    case 'rot': {
      // Broken planks with the sea showing through
      ctx.fillStyle = '#0c2630';
      ctx.beginPath();
      ctx.moveTo(cx - s * 0.3, cy - s * 0.18); ctx.lineTo(cx + s * 0.05, cy - s * 0.3); ctx.lineTo(cx + s * 0.34, cy - s * 0.05);
      ctx.lineTo(cx + s * 0.18, cy + s * 0.3); ctx.lineTo(cx - s * 0.22, cy + s * 0.22); ctx.closePath(); ctx.fill();
      ctx.strokeStyle = 'rgba(95,143,153,0.6)'; ctx.lineWidth = 1;
      const sw = Math.sin(now / 500) * s * 0.03;
      ctx.beginPath(); ctx.moveTo(cx - s * 0.15, cy + sw); ctx.quadraticCurveTo(cx, cy - s * 0.04 + sw, cx + s * 0.15, cy + sw); ctx.stroke();
      ctx.strokeStyle = '#3a2e22'; ctx.lineWidth = Math.max(2, s * 0.06);
      ctx.beginPath(); ctx.moveTo(cx - s * 0.36, cy - s * 0.26); ctx.lineTo(cx - s * 0.12, cy - s * 0.02); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(cx + s * 0.38, cy + s * 0.12); ctx.lineTo(cx + s * 0.1, cy + s * 0.04); ctx.stroke();
      break;
    }
    default:
      ctx.restore();
      return false;
  }
  ctx.restore();
  return true;
}

/** A piece of cover, drawn as what it is. Returns false if the art name isn't known. */
export function drawObstacle(ctx: Ctx, art: string | undefined, cx: number, cy: number, s: number): boolean {
  ctx.save();
  // Every piece of cover casts a soft shadow on the deck
  ctx.fillStyle = 'rgba(0,0,0,0.3)';
  ctx.beginPath(); ctx.ellipse(cx, cy + s * 0.3, s * 0.36, s * 0.1, 0, 0, Math.PI * 2); ctx.fill();
  switch (art) {
    case 'crate': {
      const w = s * 0.62, h = s * 0.56, x = cx - w / 2, y = cy - h / 2;
      rounded(ctx, x, y, w, h, s * 0.05);
      ctx.fillStyle = '#8a6a3c'; ctx.fill();
      ctx.strokeStyle = '#4a3720'; ctx.lineWidth = Math.max(1.5, s * 0.035); ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(x, y + h / 3); ctx.lineTo(x + w, y + h / 3);
      ctx.moveTo(x, y + (2 * h) / 3); ctx.lineTo(x + w, y + (2 * h) / 3);
      ctx.moveTo(x + w * 0.08, y + h * 0.92); ctx.lineTo(x + w * 0.92, y + h * 0.08);
      ctx.stroke();
      ctx.fillStyle = 'rgba(255,255,255,0.12)';
      ctx.fillRect(x + w * 0.1, y + h * 0.42, w * 0.3, h * 0.12);
      break;
    }
    case 'drum': {
      const w = s * 0.46, h = s * 0.6, x = cx - w / 2, y = cy - h / 2;
      ctx.fillStyle = '#7a2e22';
      ctx.fillRect(x, y + s * 0.06, w, h - s * 0.06);
      ctx.beginPath(); ctx.ellipse(cx, y + h, w / 2, s * 0.06, 0, 0, Math.PI); ctx.fill();
      ctx.fillStyle = '#9c4030';
      ctx.beginPath(); ctx.ellipse(cx, y + s * 0.06, w / 2, s * 0.06, 0, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = '#3e1610'; ctx.lineWidth = Math.max(1.2, s * 0.03);
      ctx.beginPath(); ctx.moveTo(x, y + h * 0.4); ctx.lineTo(x + w, y + h * 0.4); ctx.moveTo(x, y + h * 0.72); ctx.lineTo(x + w, y + h * 0.72); ctx.stroke();
      ctx.fillStyle = 'rgba(240,200,60,0.75)';
      ctx.beginPath(); ctx.arc(cx, y + h * 0.56, s * 0.06, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.12)'; ctx.fillRect(x + w * 0.12, y + s * 0.1, w * 0.12, h * 0.8);
      break;
    }
    case 'nets': {
      ctx.fillStyle = '#3f5a4e';
      ctx.beginPath();
      ctx.moveTo(cx - s * 0.36, cy + s * 0.28);
      ctx.quadraticCurveTo(cx - s * 0.3, cy - s * 0.28, cx, cy - s * 0.3);
      ctx.quadraticCurveTo(cx + s * 0.34, cy - s * 0.24, cx + s * 0.36, cy + s * 0.28);
      ctx.closePath(); ctx.fill();
      ctx.save(); ctx.clip();
      ctx.strokeStyle = 'rgba(190,220,190,0.35)'; ctx.lineWidth = 1;
      for (let k = -6; k <= 6; k++) {
        ctx.beginPath(); ctx.moveTo(cx + k * s * 0.08, cy - s * 0.4); ctx.lineTo(cx + k * s * 0.08 + s * 0.4, cy + s * 0.4); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(cx + k * s * 0.08, cy - s * 0.4); ctx.lineTo(cx + k * s * 0.08 - s * 0.4, cy + s * 0.4); ctx.stroke();
      }
      ctx.restore();
      ctx.fillStyle = '#e0a030';
      ctx.beginPath(); ctx.arc(cx + s * 0.14, cy - s * 0.08, s * 0.06, 0, Math.PI * 2); ctx.fill();
      break;
    }
    case 'pump': {
      ctx.fillStyle = '#4b5a63';
      rounded(ctx, cx - s * 0.26, cy - s * 0.14, s * 0.52, s * 0.42, s * 0.06); ctx.fill();
      ctx.fillStyle = '#62737d';
      rounded(ctx, cx - s * 0.1, cy - s * 0.38, s * 0.2, s * 0.26, s * 0.04); ctx.fill();
      ctx.strokeStyle = '#2a343a'; ctx.lineWidth = Math.max(2, s * 0.06); ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(cx + s * 0.26, cy + s * 0.04); ctx.lineTo(cx + s * 0.4, cy + s * 0.04); ctx.lineTo(cx + s * 0.4, cy + s * 0.26); ctx.stroke();
      ctx.fillStyle = '#c03a2a';
      ctx.beginPath(); ctx.arc(cx, cy + s * 0.07, s * 0.08, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = '#7e1e14'; ctx.lineWidth = 1.2;
      ctx.beginPath(); ctx.moveTo(cx - s * 0.06, cy + s * 0.07); ctx.lineTo(cx + s * 0.06, cy + s * 0.07); ctx.moveTo(cx, cy + s * 0.01); ctx.lineTo(cx, cy + s * 0.13); ctx.stroke();
      break;
    }
    default:
      ctx.restore();
      return false;
  }
  ctx.restore();
  return true;
}
