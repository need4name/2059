import { useEffect, useRef, useState } from 'react';
import { useMap } from '@/lib/stores/useMap';
import { mapView, type MapRoom, type RoomMark } from '@/lib/engine/map';
import { useAllies } from '@/lib/stores/useAllies';
import { allyDef } from '@/lib/combat/allies';

// The map the signal draws as it goes, at the top of the room card: every room any host has walked into, the
// doors it has seen but not gone through, what waits in each room found, and where hosts were lost. It is kept
// across hosts, so each life fills in a little more. Drawn as pixel art on a
// small canvas and scaled up without smoothing.

const U = 3;          // screen pixels per map pixel
const ROOM = 11;      // a room's size in map pixels
const PITCH = 15;     // room to room
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
      const w = Math.max(1, Math.ceil(box.clientWidth / U)), h = Math.max(1, Math.ceil(box.clientHeight / U));
      if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }
      const { view, here } = live.current;

      // Rooms seen for the first time fade in; the ones already known on open don't
      if (!firstSeen.current) firstSeen.current = new Map(view.rooms.map(r => [r.id + r.seen, -1e9]));
      for (const r of view.rooms) if (!firstSeen.current.has(r.id + r.seen)) firstSeen.current.set(r.id + r.seen, now);
      const fade = (r: MapRoom) => Math.min(1, (now - (firstSeen.current!.get(r.id + r.seen) ?? 0)) / 700);

      // Camera: follow the host's room, but keep a small map centred
      const at = new Map(view.rooms.map(r => [r.id, r.at]));
      const xs = view.rooms.map(r => r.at[0]), ys = view.rooms.map(r => r.at[1]);
      const span = (lo: number, hi: number, size: number, target: number) => {
        const a = lo * PITCH, b = hi * PITCH + ROOM;
        if (b - a + 8 <= size) return (a + b) / 2;
        return Math.max(a - 4 + size / 2, Math.min(b + 4 - size / 2, target));
      };
      const me = at.get(here) ?? [0, 0];
      const goal = {
        x: span(Math.min(...xs), Math.max(...xs), w, me[0] * PITCH + ROOM / 2) - pan.current.x,
        y: span(Math.min(...ys), Math.max(...ys), h, me[1] * PITCH + ROOM / 2) - pan.current.y,
      };
      if (!cam.current) cam.current = { ...goal };
      cam.current.x += (goal.x - cam.current.x) * 0.18;
      cam.current.y += (goal.y - cam.current.y) * 0.18;
      const ox = Math.round(w / 2 - cam.current.x), oy = Math.round(h / 2 - cam.current.y);
      const px = (x: number, y: number, col: string) => { ctx.fillStyle = col; ctx.fillRect(x, y, 1, 1); };
      const rect = (x: number, y: number, rw: number, rh: number, col: string) => { ctx.fillStyle = col; ctx.fillRect(x, y, rw, rh); };
      // A room's symbol, centred, with a dark outline so it reads on any face. `t` makes it breathe.
      const mark = (kind: RoomMark | 'sealed', x: number, y: number, tint?: string, t = 0) => {
        const m = MARKS[kind];
        const mw = m.rows[0].length, mh = m.rows.length;
        const sx = x + ((ROOM - mw) >> 1), sy = y + ((ROOM - mh) >> 1);
        const on = (i: number, j: number) => (m.rows[j]?.[i] ?? '.') !== '.';
        const prev = ctx.globalAlpha;
        if (kind !== 'sealed') m.rows.forEach((row, j) => row.split('').forEach((ch, i) => {
          if (ch === '.') return;
          for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) if (!on(i + dx, j + dy)) px(sx + i + dx, sy + j + dy, C.edge);
        }));
        if (t) ctx.globalAlpha = prev * (0.75 + 0.25 * Math.sin(t / 380));
        const col: Record<string, string | undefined> = { x: tint ?? m.x, o: m.o ?? m.x, l: m.l ?? m.x };
        m.rows.forEach((row, j) => row.split('').forEach((ch, i) => { if (ch !== '.') px(sx + i, sy + j, col[ch]!); }));
        ctx.globalAlpha = prev;
      };

      // Ground, with a faint chart grid of dots where rooms could be
      rect(0, 0, w, h, C.ground);
      const gx0 = Math.floor(-ox / PITCH) - 1, gy0 = Math.floor(-oy / PITCH) - 1;
      for (let gy = gy0; gy < gy0 + h / PITCH + 3; gy++) for (let gx = gx0; gx < gx0 + w / PITCH + 3; gx++) px(ox + gx * PITCH + (ROOM >> 1), oy + gy * PITCH + (ROOM >> 1), C.dot);

      const centre = (p: [number, number]) => [ox + p[0] * PITCH + (ROOM >> 1), oy + p[1] * PITCH + (ROOM >> 1)];
      const known = new Map(view.rooms.map(r => [r.id, r]));

      // Halls first, so rooms sit on top of them
      for (const [a, b] of view.links) {
        const ra = known.get(a)!, rb = known.get(b)!;
        const [x1, y1] = centre(ra.at), [x2, y2] = centre(rb.at);
        const both = ra.seen && rb.seen;
        ctx.globalAlpha = Math.min(fade(ra), fade(rb));
        if (both) {
          // A three-pixel hall, lit along its top edge; bends once if the rooms aren't in line
          const run = (ax: number, ay: number, bx: number, by: number) => {
            if (ay === by) { const l = Math.min(ax, bx), len = Math.abs(bx - ax) + 1; rect(l, ay - 1, len, 3, C.hall); rect(l, ay - 1, len, 1, C.hallLit); }
            else { const t = Math.min(ay, by), len = Math.abs(by - ay) + 1; rect(ax - 1, t, 3, len, C.hall); rect(ax - 1, t, 1, len, C.hallLit); }
          };
          run(x1, y1, x2, y1); run(x2, y1, x2, y2);
        } else {
          // A door seen but not walked through: a dotted line
          const steps = Math.abs(x2 - x1) + Math.abs(y2 - y1);
          for (let i = 0; i <= steps; i += 2) {
            const hx = Math.abs(x2 - x1);
            const x = i <= hx ? x1 + Math.sign(x2 - x1) * i : x2, y = i <= hx ? y1 : y1 + Math.sign(y2 - y1) * (i - hx);
            px(x, y, C.glimpse);
          }
        }
        ctx.globalAlpha = 1;
      }

      // Rooms
      for (const r of view.rooms) {
        const x = ox + r.at[0] * PITCH, y = oy + r.at[1] * PITCH;
        if (x > w || y > h || x + ROOM < 0 || y + ROOM < 0) continue;
        ctx.globalAlpha = fade(r);
        if (!r.seen) {
          // Only glimpsed: a broken outline with nothing inside
          for (let i = 1; i < ROOM - 1; i += 2) { px(x + i, y, C.glimpse); px(x + i, y + ROOM - 1, C.glimpse); px(x, y + i, C.glimpse); px(x + ROOM - 1, y + i, C.glimpse); }
          rect(x + 1, y + 1, ROOM - 2, ROOM - 2, C.ground);
          if (r.sealed) mark('sealed', x, y);
          ctx.globalAlpha = 1;
          continue;
        }
        const mine = r.id === here;
        const [base, lit, shade] = mine ? [C.here, C.hereLit, C.hereShade] : [C.room, C.lit, C.shade];
        // Dark outline with the corners cut, then the face: lit along the top and left, shaded at the foot
        rect(x, y + 1, ROOM, ROOM - 2, C.edge); rect(x + 1, y, ROOM - 2, ROOM, C.edge);
        rect(x + 1, y + 1, ROOM - 2, ROOM - 2, base);
        rect(x + 2, y + 1, ROOM - 4, 1, lit); rect(x + 1, y + 2, 1, ROOM - 4, mine ? lit : C.lit);
        rect(x + 2, y + ROOM - 2, ROOM - 4, 1, shade); rect(x + ROOM - 2, y + 2, 1, ROOM - 4, shade);
        if (mine) {
          // A slow pulse round the room the signal is in
          ctx.globalAlpha = 0.25 + 0.2 * Math.sin(now / 450);
          ctx.strokeStyle = C.hereLit; ctx.lineWidth = 1;
          ctx.strokeRect(x - 1.5, y - 1.5, ROOM + 3, ROOM + 3);
          ctx.globalAlpha = 1;
        }
        if (r.mark && !mine) mark(r.mark, x, y, r.ally ? allyDef(r.ally)?.color : undefined, r.mark === 'ally' ? now : 0);
        if (r.fell) {
          // Where a host was lost: a stain spilling over the room's lower corner
          const sx = x - 1, sy = y + ROOM - 3;
          rect(sx + 1, sy, 3, 1, C.blood); rect(sx, sy + 1, 4, 1, C.blood); rect(sx + 1, sy + 2, 2, 1, C.bloodDark); px(sx + 4, sy + 1, C.bloodDark); px(sx + 3, sy + 3, C.bloodDark);
        }
        if (mine) {
          // The host, bobbing on the spot
          const hx = x + ((ROOM - 5) >> 1), hy = y + 2 - (Math.floor(now / 520) % 2);
          HOST.forEach((row, j) => row.split('').forEach((ch, i) => {
            if (ch === '.') return;
            // Outline: a dark pixel on any open side
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
    if (d.moved) pan.current = { x: d.ox - dx / U, y: d.oy - dy / U };
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
    </div>
  );
}
