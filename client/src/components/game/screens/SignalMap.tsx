import { useEffect, useRef, useState } from 'react';
import { useMap } from '@/lib/stores/useMap';
import { mapView, type MapRoom, type RoomMark } from '@/lib/engine/map';
import { useAllies } from '@/lib/stores/useAllies';
import { allyDef } from '@/lib/combat/allies';

// The map the signal draws as it goes, at the top of the room card: every room any host has walked into, the
// doors it has seen but not gone through, what waits in each room found, and where hosts were lost. It is kept
// across hosts, so each life fills in a little more. Drawn in 2.5D, seen from the south at a steep angle: north
// stays straight up the screen and east to the right, each room is a slab whose height shows how far up it sits
// (up exits climb, down exits drop; roomHeights in map.ts), halls run straight between slab tops (ramps between
// levels), and slabs are drawn north to south. Pixel art on a small canvas, scaled up without smoothing.

const ZOOMS = [2, 3, 4, 5]; // screen pixels per map pixel, from the +/- buttons
const TW = 14, TH = 9; // a room's top, seen from the south at a steep angle: this wide and this deep
const PX = 20, PY = 15; // one grid step east moves this far right, one step south this far down (room for a hall)
const ZH = 5;         // map pixels per level of height
const BASE = 3;       // how thick a block at the lowest level is
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
  // An eye, not yet looked at closely
  look: { x: '#38d6f0', o: '#0a2f38', rows: ['.xxx.', 'xxoxx', '.xxx.'] },
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

      // Where things land on screen: the grid as it is (north up, east right), squashed a little for the steep angle and lifted by height
      const zs = view.rooms.map(r => r.z), zMin = Math.min(0, ...zs);
      const iso = (r: MapRoom) => ({ x: r.at[0] * PX, y: r.at[1] * PY - (r.z - zMin) * ZH });

      // Camera: follow the host's room, but keep a small map centred
      const pts = view.rooms.map(iso);
      const span = (lo: number, hi: number, size: number, target: number) => {
        if (hi - lo + 24 <= size) return (lo + hi) / 2;
        return Math.max(lo - 12 + size / 2, Math.min(hi + 12 - size / 2, target));
      };
      const meRoom = view.rooms.find(r => r.id === here);
      const me = meRoom ? iso(meRoom) : { x: 0, y: 0 };
      const goal = {
        x: span(Math.min(...pts.map(p => p.x)) - TW / 2, Math.max(...pts.map(p => p.x)) + TW / 2, w, me.x) - pan.current.x,
        y: span(Math.min(...pts.map(p => p.y)) - 10, Math.max(...pts.map(p => p.y)) + TH + BASE + 12, h, me.y + TH / 2) - pan.current.y,
      };
      if (!cam.current) cam.current = { ...goal };
      cam.current.x += (goal.x - cam.current.x) * 0.18;
      cam.current.y += (goal.y - cam.current.y) * 0.18;
      const ox = Math.round(w / 2 - cam.current.x), oy = Math.round(h / 2 - cam.current.y);
      const px = (x: number, y: number, col: string) => { ctx.fillStyle = col; ctx.fillRect(x, y, 1, 1); };
      const rect = (x: number, y: number, rw: number, rh: number, col: string) => { ctx.fillStyle = col; ctx.fillRect(x, y, rw, rh); };
      // A rounded rectangle (its corner pixels cut), the shape of a room's top
      const pad = (x: number, y: number, rw: number, rh: number, col: string) => { rect(x + 1, y, rw - 2, rh, col); rect(x, y + 1, rw, rh - 2, col); };
      // A room's symbol, standing on its top, with a dark outline so it reads on any face. `t` makes it breathe.
      const mark = (kind: RoomMark | 'sealed', cx: number, top: number, tint?: string, t = 0) => {
        const m = MARKS[kind];
        const mw = m.rows[0].length, mh = m.rows.length;
        const sx = cx - (mw >> 1), sy = top + Math.ceil(TH / 2) - mh + 1;
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
        const x = ox + gx * PX, y = oy + gy * PY + (TH >> 1);
        if (x >= 0 && y >= 0 && x < w && y < h) px(x, y, C.dot);
      }

      const known = new Map(view.rooms.map(r => [r.id, r]));
      const topCentre = (r: MapRoom) => { const p = iso(r); return [ox + p.x, oy + p.y + (TH >> 1)]; };

      // A hall, slab top to slab top: straight across the level, a ramp between levels
      const hallBetween = (ra: MapRoom, rb: MapRoom) => {
        const [x1, y1] = topCentre(ra), [x2, y2] = topCentre(rb);
        const both = ra.seen && rb.seen;
        ctx.globalAlpha = Math.min(fade(ra), fade(rb));
        const steps = Math.max(1, Math.abs(x2 - x1), Math.abs(y2 - y1));
        const across = Math.abs(x2 - x1) >= Math.abs(y2 - y1);
        for (let i = 0; i <= steps; i++) {
          const x = Math.round(x1 + ((x2 - x1) * i) / steps), y = Math.round(y1 + ((y2 - y1) * i) / steps);
          // Not over the far room's top: the hall leaves from its edge
          if (Math.abs(x - x1) <= TW / 2 && Math.abs(y - y1) <= TH / 2 + 1) continue;
          if (both) {
            if (across) { rect(x, y - 1, 1, 1, C.hallLit); rect(x, y, 1, 2, C.hall); rect(x, y + 2, 1, 1, C.edge); }
            else { rect(x - 1, y, 1, 1, C.hallLit); rect(x, y, 2, 1, C.hall); rect(x + 2, y, 1, 1, C.edge); }
          } else if (i % 3 === 0) px(x, y, C.glimpse);
        }
        ctx.globalAlpha = 1;
      };

      // Rooms north to south (and lower before higher), so nearer and higher slabs cover what's behind. Each hall
      // is drawn just before the nearer of its two rooms: over the far slab, under the near one
      const order = view.rooms.slice().sort((p, q) => p.at[1] - q.at[1] || p.z - q.z || p.at[0] - q.at[0]);
      const rank = new Map(order.map((r, k) => [r.id, k]));
      for (const r of order) {
        for (const [a, b] of view.links) {
          const other = a === r.id ? b : b === r.id ? a : null;
          if (other && rank.get(other)! < rank.get(r.id)!) hallBetween(known.get(other)!, r);
        }
        const p = iso(r);
        const cx = ox + p.x, top = oy + p.y, left = cx - (TW >> 1);
        // A slab at its height, on a thin post down to its shadow on the ground
        const lift = Math.round((r.z - zMin) * ZH);
        if (left + TW < 0 || left > w || top > h || top + TH + BASE + lift < 0) continue;
        ctx.globalAlpha = fade(r);
        if (!r.seen) {
          // Only glimpsed: a broken outline at its height, nothing inside
          for (let i = 1; i < TW - 1; i += 2) { px(left + i, top, C.glimpse); px(left + i, top + TH - 1, C.glimpse); }
          for (let j = 1; j < TH - 1; j += 2) { px(left, top + j, C.glimpse); px(left + TW - 1, top + j, C.glimpse); }
          if (r.sealed) mark('sealed', cx, top);
          ctx.globalAlpha = 1;
          continue;
        }
        const mine = r.id === here;
        const [base, lit, shade] = mine ? [C.here, C.hereLit, C.hereShade] : [C.room, C.lit, C.shade];
        if (lift > 0) {
          // Its shadow on the ground, and the post holding it up
          ctx.globalAlpha = fade(r) * 0.5;
          for (let j = 1; j < TH - 1; j += 2) rect(left + 2, top + lift + j, TW - 4, 1, C.edge);
          ctx.globalAlpha = fade(r);
          rect(cx - 1, top + TH + BASE, 2, Math.max(0, lift - BASE), mine ? C.hereShade : C.shade);
        }
        // The slab: a dark outline, its front edge (facing you, south), then the top, lit along its north edge
        pad(left - 1, top - 1, TW + 2, TH + BASE + 2, C.edge);
        rect(left, top + TH, TW, BASE, mine ? C.hereShade : C.shade);
        rect(left, top + TH + BASE - 1, TW, 1, C.edge);
        pad(left, top, TW, TH, base);
        rect(left + 1, top, TW - 2, 1, lit);
        rect(left, top + 1, 1, TH - 2, mine ? lit : C.lit);
        rect(left + TW - 1, top + 1, 1, TH - 2, shade);
        if (mine) {
          // A slow pulse round the room the signal is in
          ctx.globalAlpha = 0.25 + 0.2 * Math.sin(now / 450);
          ctx.strokeStyle = C.hereLit; ctx.lineWidth = 1;
          ctx.strokeRect(left - 1.5, top - 1.5, TW + 3, TH + BASE + 3);
          ctx.globalAlpha = fade(r);
        }
        if (r.fell) {
          // Where a host was lost: a stain on the near left corner of the top
          const sx = left + 1, sy = top + TH - 3;
          rect(sx, sy, 3, 1, C.blood); rect(sx, sy + 1, 4, 1, C.blood); rect(sx + 1, sy + 2, 2, 1, C.bloodDark);
        }
        if (r.corpse) {
          // The last host's body, with something still on it: a glint over the stain that comes and goes
          const gx = left + 3, gy = top + TH - 3, on = Math.floor(now / 380) % 3 !== 2;
          ctx.globalAlpha = on ? 1 : 0.45;
          px(gx, gy - 1, C.credLit); px(gx - 1, gy, C.credLit); px(gx, gy, '#fff6d0'); px(gx + 1, gy, C.credLit); px(gx, gy + 1, C.credLit);
          ctx.globalAlpha = fade(r);
        }
        if (r.mark && !mine) mark(r.mark, cx, top, r.ally ? allyDef(r.ally)?.color : undefined, r.mark === 'ally' ? now : 0);
        if (mine) {
          // The host, standing on the slab and bobbing on the spot
          const hx = cx - 2, hy = top + (TH >> 1) - HOST.length + 2 - (Math.floor(now / 520) % 2);
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
