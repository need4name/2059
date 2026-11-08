import { useEffect, useRef, useState } from 'react';
import { useMap } from '@/lib/stores/useMap';
import { mapView, mapOf, roomHeights, type MapRoom, type RoomMark } from '@/lib/engine/map';
import type { GlyphName } from '../hud';
import { useAllies } from '@/lib/stores/useAllies';
import { allyDef } from '@/lib/combat/allies';

// The map the signal draws as it goes, at the top of the room card: every room any host has walked into, the
// doors it has seen but not gone through, what waits in each room found, and where hosts were lost. It is kept
// across hosts, so each life fills in a little more. Drawn in 2.5D: the room grid turned a little (TILT, so north
// points up and slightly right) and seen from above at an angle (SQUASH). Each room is a slab floating at its height
// (up exits climb, down exits drop; roomHeights in map.ts) on a post over its shadow, halls run between slab tops
// (ramps between levels), and slabs are drawn back to front. Pixel art on a small canvas, scaled up without smoothing.

const ZOOMS = [2, 3, 4, 5]; // screen pixels per map pixel, from the +/- buttons
const TILT = (30 * Math.PI) / 180; // how far the grid is turned (0: north straight up, 45: a diamond)
const SQUASH = 0.62;  // how flat the ground looks from the viewing angle (1: straight down)
const STEP = 21;      // map pixels from one room to the next on the ground, before the turn and squash
const SIDE = 13;      // a room's top, on the ground, before the turn and squash
const TW = 14, TH = 9; // roughly how wide and deep a room's top shows (for the camera and culling)
const ZH = 5;         // map pixels per level of height
const BASE = 3;       // how thick a block at the lowest level is

/**
 * Which way the hall from one room to another runs on the drawn map, as one of eight pixel
 * arrows (`flip`: mirror it for the west-facing ones). The exits list shows it so each way on
 * matches a hall on the map, whatever the exit is called.
 */
export function wayArrow(chapter: string, from: string, to: string): { glyph: GlyphName; flip: boolean } | null {
  const m = mapOf(chapter), a = m.rooms.find(r => r.id === from), b = m.rooms.find(r => r.id === to);
  if (!a || !b) return null;
  const z = roomHeights(m), gx = b.at[0] - a.at[0], gy = b.at[1] - a.at[1];
  const x = (gx * Math.cos(TILT) - gy * Math.sin(TILT)) * STEP;
  const y = (gx * Math.sin(TILT) + gy * Math.cos(TILT)) * STEP * SQUASH - ((z[to] ?? 0) - (z[from] ?? 0)) * ZH;
  const sector = (Math.round(Math.atan2(-y, x) / (Math.PI / 4)) + 8) % 8; // 0 east, 2 north, 4 west, 6 south
  return ([
    { glyph: 'way_e', flip: false }, { glyph: 'way_ne', flip: false }, { glyph: 'way_n', flip: false }, { glyph: 'way_ne', flip: true },
    { glyph: 'way_e', flip: true }, { glyph: 'way_se', flip: true }, { glyph: 'way_s', flip: false }, { glyph: 'way_se', flip: false },
  ] as const)[sector];
}
const C = {
  ground: '#070b10', dot: '#121c26',
  edge: '#03060a', room: '#263646', lit: '#3d566c', shade: '#18232f',
  hall: '#1d2a37', hallLit: '#2c3e50', glimpse: '#34495d',
  here: '#0f4450', hereLit: '#38d6f0', hereShade: '#0a2f38',
  cred: '#f2b33d', credLit: '#ffe08a', blood: '#8a2b2b', bloodDark: '#511818',
  hair: '#1a1d22', skin: '#b98a6a', eye: '#38d6f0', cloth: '#3a4250', clothDark: '#262c36', out: '#020407',
};

// The host, small enough to stand in a room (h hair, s skin, e eye, c cloth, d dark cloth)
const HOST = [
  '.hhh.',
  'hhhhh',
  '.sse.',
  '..s..',
  '.ccc.',
  'sccdc',
  '.ccc.',
  '.d.d.',
];
const HOST_COL: Record<string, string> = { h: C.hair, s: C.skin, e: C.eye, c: C.cloth, d: C.clothDark };

// What waits in a found room, one small symbol each (x the colour, o a darker shade, l a highlight).
// Fights are red and grow with the threat; things to do are warm or bright; what's spent is dim.
const MARKS: Record<RoomMark | 'sealed', { rows: string[]; x: string; o?: string; l?: string }> = {
  // A small blade mark: someone holds the room
  fight: { x: '#d2463f', o: '#842424', rows: ['x.x', '.x.', 'o.o'] },
  // A skull
  elite: { x: '#f0524f', o: '#7a1f1f', rows: ['.xxx.', 'xxxxx', 'xoxox', '.xxx.', '.x.x.'] },
  // A horned skull, bigger
  boss: { x: '#ff5a4e', o: '#4a1010', l: '#ffd0c8', rows: ['l.....l', 'll...ll', '.xxxxx.', 'xxoxoxx', '.xxxxx.', '..x.x..'] },
  // Someone waiting (drawn in their own colour)
  ally: { x: '#7ee0a0', rows: ['.xx.', '.xx.', 'xxxx', '.xx.', 'x..x'] },
  // A crate with a lid
  cache: { x: '#d9963a', o: '#7d521b', l: '#f2c46e', rows: ['lllll', 'xoxox', 'xxxxx', 'xooox', 'xxxxx'] },
  // A speech bubble: someone here wants something from you (an event)
  event: { x: '#c9b6f2', o: '#4b3a72', rows: ['xxxxx', 'xoxox', 'xxxxx', '.x...'] },
  // A server rack with its lights on: a later host can wake here, and a host can rest
  server: { x: '#4f6b7d', o: '#1b2a35', l: '#5cf2b0', rows: ['xxxx', 'xllx', 'xoox', 'xlox', 'xxxx'] },
  // The Grey Lane's coin
  market: { x: '#f2b33d', o: '#8a5a12', l: '#ffe08a', rows: ['.lxx.', 'lxoxx', 'xoxox', 'xxoxx', '.xxx.'] },
  // A fight this host already won: the blade mark, dim
  cleared: { x: '#43596d', rows: ['x.x', '.x.', 'x.x'] },
  // A door that won't open yet: a padlock
  sealed: { x: '#6f869b', o: '#2a3846', rows: ['.xxx.', 'x...x', 'xxxxx', 'xxoxx', 'xxxxx'] },
};

export function SignalMap() {
  const map = useMap();
  const ref = useRef<HTMLCanvasElement>(null);
  const [tall, setTall] = useState(false);
  // Zoom from the +/- buttons; the painter reads it live
  const [zoomAt, setZoomAt] = useState(1);
  const U = ZOOMS[zoomAt];
  const zoomRef = useRef(U);
  zoomRef.current = U;
  const met = useAllies(s => s.met);
  const view = mapView(map, met);
  const live = useRef({ view, here: map.room });
  live.current = { view, here: map.room };
  const firstSeen = useRef<Map<string, number> | null>(null);
  const cam = useRef<{ x: number; y: number } | null>(null);
  const drag = useRef<{ x: number; y: number; ox: number; oy: number; moved: boolean } | null>(null);
  const pan = useRef({ x: 0, y: 0 });

  // A new room recentres the map
  useEffect(() => { pan.current = { x: 0, y: 0 }; }, [map.room]);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d')!;
    let raf = 0, last = 0;

    const paint = (now: number) => {
      raf = requestAnimationFrame(paint);
      if (now - last < 33) return;
      last = now;
      // Sized from the frame and scaled up by a whole number, so every map pixel is the same size
      const box = canvas.parentElement!;
      const Z = zoomRef.current;
      const w = Math.max(1, Math.ceil(box.clientWidth / Z)), h = Math.max(1, Math.ceil(box.clientHeight / Z));
      if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }
      const { view, here } = live.current;

      // Rooms seen for the first time fade in; the ones already known on open don't
      if (!firstSeen.current) firstSeen.current = new Map(view.rooms.map(r => [r.id + r.seen, -1e9]));
      for (const r of view.rooms) if (!firstSeen.current.has(r.id + r.seen)) firstSeen.current.set(r.id + r.seen, now);
      const fade = (r: MapRoom) => Math.min(1, (now - (firstSeen.current!.get(r.id + r.seen) ?? 0)) / 700);

      // Where things land on screen: the grid turned by TILT, squashed by SQUASH, lifted by height
      const zs = view.rooms.map(r => r.z), zMin = Math.min(0, ...zs);
      const cosT = Math.cos(TILT), sinT = Math.sin(TILT);
      const proj = (gx: number, gy: number) => ({ x: (gx * cosT - gy * sinT) * STEP, y: (gx * sinT + gy * cosT) * STEP * SQUASH });
      const iso = (r: MapRoom) => { const p = proj(r.at[0], r.at[1]); return { x: p.x, y: p.y - (r.z - zMin) * ZH }; };
      const depth = (r: MapRoom) => proj(r.at[0], r.at[1]).y;
      // A room's four top corners around its centre (north-west, north-east, south-east, south-west)
      const half = SIDE / 2 / STEP;
      const corners = (cx: number, cy: number) => ([[-half, -half], [half, -half], [half, half], [-half, half]] as const).map(([dx, dy]) => { const p = proj(dx, dy); return { x: cx + p.x, y: cy + p.y }; });

      // Camera: follow the host's room, but keep a small map centred
      const pts = view.rooms.map(iso);
      const span = (lo: number, hi: number, size: number, target: number) => {
        if (hi - lo + 24 <= size) return (lo + hi) / 2;
        return Math.max(lo - 12 + size / 2, Math.min(hi + 12 - size / 2, target));
      };
      const meRoom = view.rooms.find(r => r.id === here);
      const me = meRoom ? iso(meRoom) : { x: 0, y: 0 };
      const goal = {
        x: span(Math.min(...pts.map(p => p.x)) - TW, Math.max(...pts.map(p => p.x)) + TW, w, me.x) - pan.current.x,
        y: span(Math.min(...pts.map(p => p.y)) - 10, Math.max(...pts.map(p => p.y)) + TH + BASE + 12, h, me.y) - pan.current.y,
      };
      if (!cam.current) cam.current = { ...goal };
      cam.current.x += (goal.x - cam.current.x) * 0.18;
      cam.current.y += (goal.y - cam.current.y) * 0.18;
      const ox = Math.round(w / 2 - cam.current.x), oy = Math.round(h / 2 - cam.current.y);
      const px = (x: number, y: number, col: string) => { ctx.fillStyle = col; ctx.fillRect(x, y, 1, 1); };
      const rect = (x: number, y: number, rw: number, rh: number, col: string) => { ctx.fillStyle = col; ctx.fillRect(x, y, rw, rh); };
      // Fill a shape pixel by pixel, row by row, so its edges stay crisp (no smoothing)
      const fillPoly = (pts: { x: number; y: number }[], col: string) => {
        ctx.fillStyle = col;
        const ys = pts.map(p => p.y), y0 = Math.ceil(Math.min(...ys)), y1 = Math.floor(Math.max(...ys));
        for (let y = y0; y <= y1; y++) {
          const xs: number[] = [];
          for (let i = 0; i < pts.length; i++) {
            const a = pts[i], b = pts[(i + 1) % pts.length];
            if ((a.y <= y + 0.5 && b.y > y + 0.5) || (b.y <= y + 0.5 && a.y > y + 0.5)) xs.push(a.x + ((y + 0.5 - a.y) / (b.y - a.y)) * (b.x - a.x));
          }
          xs.sort((m, n) => m - n);
          for (let k = 0; k + 1 < xs.length; k += 2) { const l = Math.round(xs[k]), r = Math.round(xs[k + 1]); if (r > l) ctx.fillRect(l, y, r - l, 1); }
        }
      };
      // Pixels along a line (every `gap`th one), for outlines
      const line = (a: { x: number; y: number }, b: { x: number; y: number }, col: string, gap = 1) => {
        const n = Math.max(1, Math.round(Math.max(Math.abs(b.x - a.x), Math.abs(b.y - a.y))));
        for (let i = 0; i <= n; i += gap) px(Math.round(a.x + ((b.x - a.x) * i) / n), Math.round(a.y + ((b.y - a.y) * i) / n), col);
      };
      // A room's symbol, standing on its top, with a dark outline so it reads on any face. `t` makes it breathe.
      const mark = (kind: RoomMark | 'sealed', cx: number, cy: number, tint?: string, t = 0) => {
        const m = MARKS[kind];
        const mw = m.rows[0].length, mh = m.rows.length;
        const sx = Math.round(cx) - (mw >> 1), sy = Math.round(cy) - mh + 2;
        const on = (i: number, j: number) => (m.rows[j]?.[i] ?? '.') !== '.';
        const prev = ctx.globalAlpha;
        m.rows.forEach((row, j) => row.split('').forEach((ch, i) => {
          if (ch === '.') return;
          for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) if (!on(i + dx, j + dy)) px(sx + i + dx, sy + j + dy, C.edge);
        }));
        if (t) ctx.globalAlpha = prev * (0.75 + 0.25 * Math.sin(t / 380));
        const col: Record<string, string | undefined> = { x: tint ?? m.x, o: m.o ?? m.x, l: m.l ?? m.x };
        m.rows.forEach((row, j) => row.split('').forEach((ch, i) => { if (ch !== '.') px(sx + i, sy + j, col[ch]!); }));
        ctx.globalAlpha = prev;
      };

      // Ground: a faint chart of dots on the lowest level, where rooms could stand
      rect(0, 0, w, h, C.ground);
      for (let gy = -40; gy < 40; gy++) for (let gx = -40; gx < 40; gx++) {
        const p = proj(gx, gy), x = Math.round(ox + p.x), y = Math.round(oy + p.y);
        if (x >= 0 && y >= 0 && x < w && y < h) px(x, y, C.dot);
      }

      const known = new Map(view.rooms.map(r => [r.id, r]));
      const centreOf = (r: MapRoom) => { const p = iso(r); return { x: ox + p.x, y: oy + p.y }; };
      const inside = (pt: { x: number; y: number }, c: { x: number; y: number }[]) => {
        let n = false;
        for (let i = 0, j = c.length - 1; i < c.length; j = i++) if ((c[i].y > pt.y) !== (c[j].y > pt.y) && pt.x < ((c[j].x - c[i].x) * (pt.y - c[i].y)) / (c[j].y - c[i].y) + c[i].x) n = !n;
        return n;
      };

      // A hall, slab top to slab top: a bridge on the level, a ramp between levels
      const hallBetween = (ra: MapRoom, rb: MapRoom) => {
        const a = centreOf(ra), b = centreOf(rb), far = corners(a.x, a.y);
        const both = ra.seen && rb.seen;
        ctx.globalAlpha = Math.min(fade(ra), fade(rb));
        const steps = Math.max(1, Math.round(Math.max(Math.abs(b.x - a.x), Math.abs(b.y - a.y))));
        for (let i = 0; i <= steps; i++) {
          const x = Math.round(a.x + ((b.x - a.x) * i) / steps), y = Math.round(a.y + ((b.y - a.y) * i) / steps);
          // Not over the far room's top: the hall leaves from its edge
          if (inside({ x: x + 0.5, y: y + 0.5 }, far)) continue;
          if (both) { rect(x - 1, y - 1, 3, 1, C.hallLit); rect(x - 1, y, 3, 1, C.hall); rect(x - 1, y + 1, 3, 1, C.edge); }
          else if (i % 3 === 0) px(x, y, C.glimpse);
        }
        ctx.globalAlpha = 1;
      };

      // Rooms back to front (and lower before higher), so nearer and higher slabs cover what's behind. Each hall
      // is drawn just before the nearer of its two rooms: over the far slab, under the near one
      const order = view.rooms.slice().sort((p, q) => depth(p) - depth(q) || p.z - q.z);
      const rank = new Map(order.map((r, k) => [r.id, k]));
      for (const r of order) {
        for (const [a, b] of view.links) {
          const other = a === r.id ? b : b === r.id ? a : null;
          if (other && rank.get(other)! < rank.get(r.id)!) hallBetween(known.get(other)!, r);
        }
        const c = centreOf(r);
        const top = corners(c.x, c.y);
        const lift = Math.round((r.z - zMin) * ZH);
        if (c.x + TW < 0 || c.x - TW > w || c.y - TH > h || c.y + TH + BASE + lift < 0) continue;
        ctx.globalAlpha = fade(r);
        if (!r.seen) {
          // Only glimpsed: a broken outline at its height, nothing inside
          for (let i = 0; i < 4; i++) line(top[i], top[(i + 1) % 4], C.glimpse, 2);
          if (r.sealed) mark('sealed', c.x, c.y);
          ctx.globalAlpha = 1;
          continue;
        }
        const mine = r.id === here;
        const [base, lit, shade] = mine ? [C.here, C.hereLit, C.hereShade] : [C.room, C.lit, C.shade];
        const down = (p: { x: number; y: number }, d: number) => ({ x: p.x, y: p.y + d });
        if (lift > 0) {
          // Its shadow on the ground, and the post holding it up
          ctx.globalAlpha = fade(r) * 0.45;
          fillPoly(top.map(p => down(p, lift + BASE)), C.edge);
          ctx.globalAlpha = fade(r);
          rect(Math.round(c.x) - 1, Math.round(c.y + BASE + 2), 2, Math.max(0, lift - 1), mine ? C.hereShade : C.shade);
        }
        // The slab's two edges facing you (south and east, as turned), the lit one on the left
        const [nw, ne, se, sw] = top;
        fillPoly([sw, se, down(se, BASE), down(sw, BASE)], mine ? C.hereShade : C.shade);
        fillPoly([se, ne, down(ne, BASE), down(se, BASE)], mine ? '#082128' : '#111a23');
        line(down(sw, BASE), down(se, BASE), C.edge); line(down(se, BASE), down(ne, BASE), C.edge);
        // The top: face, a dark outline, lit along its far (north-west) edges
        fillPoly(top, base);
        line(sw, se, C.edge); line(se, ne, shade);
        line(nw, ne, lit); line(sw, nw, mine ? lit : C.lit);
        if (mine) {
          // A slow pulse round the room the signal is in
          ctx.globalAlpha = 0.3 + 0.25 * Math.sin(now / 450);
          const grow = corners(c.x, c.y).map(p => ({ x: c.x + (p.x - c.x) * 1.35, y: c.y + (p.y - c.y) * 1.35 }));
          for (let i = 0; i < 4; i++) line(grow[i], grow[(i + 1) % 4], C.hereLit);
          ctx.globalAlpha = fade(r);
        }
        if (r.fell) {
          // Where a host was lost: a stain near the top's south-west corner
          const sx = Math.round(sw.x + (c.x - sw.x) * 0.35), sy = Math.round(sw.y + (c.y - sw.y) * 0.35) - 1;
          rect(sx, sy, 3, 1, C.blood); rect(sx - 1, sy + 1, 4, 1, C.blood); rect(sx, sy + 2, 2, 1, C.bloodDark);
        }
        if (r.corpse) {
          // The last host's body, with something still on it: a glint over the stain that comes and goes
          const gx = Math.round(sw.x + (c.x - sw.x) * 0.35) + 2, gy = Math.round(sw.y + (c.y - sw.y) * 0.35) - 1, on = Math.floor(now / 380) % 3 !== 2;
          ctx.globalAlpha = on ? 1 : 0.45;
          px(gx, gy - 1, C.credLit); px(gx - 1, gy, C.credLit); px(gx, gy, '#fff6d0'); px(gx + 1, gy, C.credLit); px(gx, gy + 1, C.credLit);
          ctx.globalAlpha = fade(r);
        }
        if (r.mark && !mine) mark(r.mark, c.x, c.y, r.ally ? allyDef(r.ally)?.color : undefined, r.mark === 'ally' || r.mark === 'server' ? now : 0);
        if (mine) {
          // The host, standing on the slab and bobbing on the spot
          const hx = Math.round(c.x) - 2, hy = Math.round(c.y) - HOST.length + 2 - (Math.floor(now / 520) % 2);
          HOST.forEach((row, j) => row.split('').forEach((ch, i) => {
            if (ch === '.') return;
            for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) if ((HOST[j + dy]?.[i + dx] ?? '.') === '.') px(hx + i + dx, hy + j + dy, C.out);
          }));
          HOST.forEach((row, j) => row.split('').forEach((ch, i) => { if (ch !== '.') px(hx + i, hy + j, HOST_COL[ch]); }));
        }
        ctx.globalAlpha = 1;
      }

      // Darken towards the edges so the map reads as a window onto something larger
      const v = ctx.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.35, w / 2, h / 2, Math.max(w, h) * 0.65);
      v.addColorStop(0, 'rgba(6,10,15,0)');
      v.addColorStop(1, 'rgba(6,10,15,0.85)');
      ctx.fillStyle = v;
      ctx.fillRect(0, 0, w, h);

      // Which way north is (the grid is turned): a short needle and an N in the corner
      const nx = 9, ny = 14, tip = proj(0, -0.42);
      line({ x: nx, y: ny }, { x: nx + tip.x, y: ny + tip.y }, '#6f869b');
      px(Math.round(nx + tip.x), Math.round(ny + tip.y), '#cfe3ef');
      const lx = Math.round(nx + tip.x) + 3, ly = Math.round(ny + tip.y) - 3;
      ['x...x', 'xx..x', 'x.x.x', 'x..xx', 'x...x'].forEach((row, j) => row.split('').forEach((ch, i) => { if (ch === 'x') px(lx + i, ly + j, '#cfe3ef'); }));
    };
    raf = requestAnimationFrame(paint);
    return () => cancelAnimationFrame(raf);
  }, []);

  // Drag to look around; a tap (no drag) makes the map taller or shorter
  const down = (e: React.PointerEvent) => { drag.current = { x: e.clientX, y: e.clientY, ox: pan.current.x, oy: pan.current.y, moved: false }; (e.target as Element).setPointerCapture(e.pointerId); };
  const move = (e: React.PointerEvent) => {
    const d = drag.current;
    if (!d) return;
    const dx = e.clientX - d.x, dy = e.clientY - d.y;
    if (Math.abs(dx) + Math.abs(dy) > 6) d.moved = true;
    if (d.moved) pan.current = { x: d.ox + dx / U, y: d.oy + dy / U };
  };
  const up = () => { if (drag.current && !drag.current.moved) setTall(t => !t); drag.current = null; };

  return (
    <div className="relative shrink-0 overflow-hidden transition-[height] duration-300" style={{ height: tall ? 420 : 220 }}>
        <canvas
          ref={ref}
          role="img"
          aria-label="What the signal remembers of this place"
          onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={() => { drag.current = null; }}
          className="pixel-canvas block"
          style={{ transform: `scale(${U})` }}
        />
        {/* Zoom: in and out a step at a time */}
        <div className="absolute right-2.5 top-2.5 flex flex-col gap-1.5" onPointerDown={e => e.stopPropagation()}>
          <button onClick={() => setZoomAt(z => Math.min(ZOOMS.length - 1, z + 1))} disabled={zoomAt >= ZOOMS.length - 1} aria-label="Zoom in"
            className="key flex h-8 w-8 items-center justify-center rounded-full font-display text-lg font-semibold leading-none text-hud-text disabled:opacity-40">+</button>
          <button onClick={() => setZoomAt(z => Math.max(0, z - 1))} disabled={zoomAt <= 0} aria-label="Zoom out"
            className="key flex h-8 w-8 items-center justify-center rounded-full font-display text-lg font-semibold leading-none text-hud-text disabled:opacity-40">−</button>
        </div>
    </div>
  );
}
