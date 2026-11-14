// The firmware lanes and the zoomed-out view of the memory (engine/firmware.ts lanes, engine/memory.ts).
// A square hub hangs off the memory's firmware strand; out of it runs a lane per firmware, in that
// firmware's colour, with its own points in its first node (the firmware itself, lit when its holder
// falls). Along the lane, its neurons; forks above and below; dotted lines split the stages a chapter
// opens. Zoomed out, the memory and the lanes show together with every pool of points.
import { useEffect, useRef, useState } from 'react';
import { Btn, Glyph, cx } from '../hud';
import { useFirmware } from '@/lib/stores/useFirmware';
import { usePlayi } from '@/lib/stores/usePlayi';
import { useMap } from '@/lib/stores/useMap';
import { CHAPTERS } from '@/lib/combat/chapters';
import { CLASS_DEFINITIONS } from '@/lib/combat/actions';
import { FIRMWARE, firmwareAttack, identityOf, laneOf, laneOpen, laneStageFor, type LaneNode } from '@/lib/engine/firmware';
import * as M from '@/lib/engine/memory';
import type { PlayerClass } from '@/lib/combat/types';
import { MemoryNet } from './MemoryNet';

const GOLD = '#f2b33d', HUB = '#8fd0c8';
/** The firmware in the order their holders are met: chapter, then threat. */
const ORDER = (Object.keys(FIRMWARE) as PlayerClass[]).sort((a, b) => {
  const ca = CHAPTERS.findIndex(c => c.id === FIRMWARE[a]!.opens.chapter), cb = CHAPTERS.findIndex(c => c.id === FIRMWARE[b]!.opens.chapter);
  return ca - cb || FIRMWARE[a]!.opens.threat - FIRMWARE[b]!.opens.threat;
});
/** Where a lane node sits along its lane (x) and above or below it (dy). */
const SPOT: Record<string, [number, number]> = { A: [47, 0], B: [63, 0], F1a: [79, -9], F1b: [82, 9], C: [100, 0], F2a: [118, -9], F2b: [116, 9], D: [136, 0], F3a: [151, -9], F3b: [149, 9] };
const START_X = 27, STAGE_X = [90, 126];

type Px = (x: number, y: number, c: string, a?: number) => void;
interface Tools { px: Px; dot: (x: number, y: number, r: number, c: string, a?: number) => void; ring: (x: number, y: number, r: number, c: string, a?: number) => void; line: (a: number[], b: number[], c: string, al: number, every?: number) => void; box: (x: number, y: number, r: number, c: string, a?: number) => void; corners: (x: number, y: number, d: number) => void }
/** A crisp pixel canvas, `gw`x`gh` grid pixels drawn `cssW` wide, repainted every frame by `paint`. */
function usePixels(gw: number, gh: number, cssW: number, paint: (t: Tools, now: number) => void) {
  const ref = useRef<HTMLCanvasElement>(null);
  const fn = useRef(paint); fn.current = paint;
  useEffect(() => {
    const cv = ref.current!; const ctx = cv.getContext('2d')!;
    const scale = Math.max(2, Math.floor((cssW * (window.devicePixelRatio || 1)) / gw));
    cv.width = gw * scale; cv.height = gh * scale;
    const px: Px = (x, y, c, a = 1) => { ctx.globalAlpha = a; ctx.fillStyle = c; ctx.fillRect(x, y, 1, 1); };
    const t: Tools = {
      px,
      dot: (x, y, r, c, a = 1) => { for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) if (dx * dx + dy * dy <= r * r + 1) px(x + dx, y + dy, c, a); },
      ring: (x, y, r, c, a = 1) => { for (let dy = -r - 1; dy <= r + 1; dy++) for (let dx = -r - 1; dx <= r + 1; dx++) if (Math.abs(Math.sqrt(dx * dx + dy * dy) - r) < 0.6) px(x + dx, y + dy, c, a); },
      line: (a, b, c, al, every = 1) => { const k = Math.max(Math.abs(b[0] - a[0]), Math.abs(b[1] - a[1]), 1); for (let i = 0; i <= k; i += every) px(Math.round(a[0] + ((b[0] - a[0]) * i) / k), Math.round(a[1] + ((b[1] - a[1]) * i) / k), c, al); },
      box: (x, y, r, c, a = 1) => { for (let d = -r + 1; d < r; d++) { px(x + d, y - r, c, a); px(x + d, y + r, c, a); px(x - r, y + d, c, a); px(x + r, y + d, c, a); } },
      corners: (x, y, d) => { for (const [sx, sy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) { px(x + sx * d, y + sy * d, '#fff'); px(x + sx * (d - 1), y + sy * d, '#fff'); px(x + sx * d, y + sy * (d - 1), '#fff'); } },
    };
    let raf = 0;
    const draw = () => { ctx.setTransform(scale, 0, 0, scale, 0, 0); ctx.imageSmoothingEnabled = false; ctx.clearRect(0, 0, gw, gh); fn.current(t, performance.now()); ctx.globalAlpha = 1; raf = requestAnimationFrame(draw); };
    draw();
    return () => cancelAnimationFrame(raf);
  }, [gw, gh, cssW]);
  return ref;
}
/** A number over a grid spot (points), sized to its digits. */
const Num = ({ x, y, gw, gh, v, color, size }: { x: number; y: number; gw: number; gh: number; v: number; color: string; size?: number }) => {
  const shown = Math.min(M.MAX_POINTS, v), d = String(shown).length;
  return <div className="pointer-events-none absolute -translate-x-1/2 -translate-y-1/2 font-display font-bold leading-none tracking-tight" style={{ left: `${((x + 0.5) / gw) * 100}%`, top: `${((y + 0.5) / gh) * 100}%`, color, fontSize: size ?? (d === 1 ? 15 : d === 2 ? 13 : 10.5), textShadow: `0 0 8px ${color}` }}>{shown}</div>;
};
const useStage = () => laneStageFor(CHAPTERS.findIndex(c => c.id === useMap(s => s.chapter)));
const fitWidth = (box: React.RefObject<HTMLDivElement | null>, set: (w: number) => void) => () => { if (box.current) set(Math.max(280, Math.min(480, Math.floor(box.current.clientWidth)))); };

// ── The lanes up close ───────────────────────────────────────────────────────
const LGW = 160, LGH = 232, laneY = (k: number) => 22 + k * 38, HUB_AT: [number, number] = [8, 116];

function paintLane(t: Tools, now: number, cls: PlayerClass, y: number, open: boolean, points: number, ranks: Record<string, number>, stage: number, sel: string | null, scale = 1, x0 = START_X) {
  const { px, dot, ring, line, corners } = t, color = FIRMWARE[cls]!.color, beat = 0.6 + 0.4 * Math.sin(now / 400);
  const X = (x: number) => Math.round(x0 + (x - START_X) * scale), Y = (dy: number) => Math.round(y + dy * scale);
  line([X(START_X), y], [X(157), y], '#2f3947', open ? 1 : 0.7, open ? 1 : 2);
  // How far it's lit: the main chain up to the last node kept
  const main = laneOf(cls).filter(n => !n.fork), lastKept = main.reduce((k, n, i) => ((ranks[n.id] ?? 0) > 0 ? i : k), -1);
  if (open && lastKept >= 0) line([X(START_X), y], [X(SPOT[main[lastKept].id][0]), y], color, 0.95);
  for (const n of laneOf(cls)) {
    const [sx, sdy] = SPOT[n.id] ?? [START_X, 0], x = X(sx), yy = Y(sdy);
    if (n.fork) line([X(sx - 7), y], [x, yy], (ranks[n.id] ?? 0) > 0 ? color : '#2f3947', open ? 1 : 0.6);
    if (!open) { if (scale < 1) px(x, yy, '#4a5564', 0.9); else { dot(x, yy, 1, '#0b1119', 1); ring(x, yy, n.ranks > 1 ? 3 : 2, '#3a4452', 0.9); } continue; }
    const have = ranks[n.id] ?? 0, done = have >= n.ranks, can = laneOpen(cls, n.id, ranks, stage), afford = can && points >= n.cost, later = n.stage > stage;
    if (scale < 1) { if (have) dot(x, yy, 1, color, 1); else { dot(x, yy, 1, '#0b1119', 1); ring(x, yy, 1, afford ? GOLD : '#5b6676', later ? 0.5 : 1); } continue; }
    const r = n.cost >= 5 ? 4 : n.ranks > 1 || n.cost >= 3 ? 3 : 2;
    if (have) { dot(x, yy, r + 1, color, 0.18); dot(x, yy, r, color, done ? 1 : 0.7); px(x - 1, yy - 1, '#fff', 0.8); if (afford) ring(x, yy, r + 1, GOLD, 0.4 + 0.5 * beat); }
    else { if (afford) dot(x, yy, r + 2, GOLD, 0.16 * beat); dot(x, yy, r, '#0b1119', 1); ring(x, yy, r, afford ? GOLD : can ? '#8a7440' : '#5b6676', afford ? 0.6 + 0.4 * beat : later ? 0.4 : 0.9); px(x, yy, color, later ? 0.4 : 0.9); }
    if (n.ranks > 1) for (let i = 0; i < n.ranks; i++) px(x - (n.ranks - 1) + i * 2, yy + r + 2, i < have ? '#fff' : '#5b6676', later ? 0.5 : 1);
    if (sel === n.id) corners(x, yy, 8);
  }
  const sx = X(START_X), R = scale < 1 ? 5 : 6;
  if (open) { dot(sx, y, R + 2, color, 0.1 * beat); dot(sx, y, R, '#0d1a22', 1); ring(sx, y, R, color, 0.95); } else { dot(sx, y, R - 1, '#0b1119', 1); ring(sx, y, R - 1, '#3a4452', 1); px(sx, y, color, 0.5); }
  if (sel === 'S') corners(sx, y, 9);
}

function LanesCanvas({ width, sel, onSelect }: { width: number; sel: [PlayerClass, string] | null; onSelect: (s: [PlayerClass, string]) => void }) {
  const { opened, points, ranks } = useFirmware();
  const stage = useStage();
  const live = useRef({ opened, points, ranks, stage, sel }); live.current = { opened, points, ranks, stage, sel };
  const height = Math.round((width * LGH) / LGW);
  const ref = usePixels(LGW, LGH, width, (t, now) => {
    const { px, dot, line, box } = t, L = live.current, beat = 0.6 + 0.4 * Math.sin(now / 400);
    for (const x of STAGE_X) for (let y = 6; y < LGH - 4; y += 3) px(x, y, '#2a3340', 0.9);
    for (let r = 5; r <= 6; r++) box(HUB_AT[0], HUB_AT[1], r, HUB, r === 6 ? 0.9 : 0.35); dot(HUB_AT[0], HUB_AT[1], 1, '#fff', beat);
    ORDER.forEach((cls, k) => {
      const open = L.opened.includes(cls);
      line([HUB_AT[0] + 6, HUB_AT[1]], [START_X, laneY(k)], open ? FIRMWARE[cls]!.color : '#2f3947', open ? 0.9 : 0.7);
      paintLane(t, now, cls, laneY(k), open, L.points[cls] ?? 0, L.ranks[cls] ?? {}, L.stage, L.sel?.[0] === cls ? L.sel[1] : null);
    });
  });
  const tap = (e: React.MouseEvent) => {
    const r = (e.target as HTMLElement).getBoundingClientRect(), x = ((e.clientX - r.left) / r.width) * LGW, y = ((e.clientY - r.top) / r.height) * LGH;
    let best: [PlayerClass, string] | null = null, bd = 9;
    ORDER.forEach((cls, k) => [['S', START_X, 0] as const, ...laneOf(cls).map(n => [n.id, ...(SPOT[n.id] ?? [START_X, 0])] as const)].forEach(([id, sx, dy]) => {
      const d = Math.hypot(sx - x, laneY(k) + dy - y); if (d < bd) { bd = d; best = [cls, id]; }
    }));
    if (best) onSelect(best);
  };
  return (
    <div style={{ width, height }} className="relative mx-auto">
      <canvas ref={ref} onClick={tap} style={{ imageRendering: 'pixelated' }} aria-label="Firmware lanes" />
      {ORDER.map((cls, k) => opened.includes(cls) && <Num key={cls} x={START_X} y={laneY(k)} gw={LGW} gh={LGH} v={points[cls] ?? 0} color={FIRMWARE[cls]!.color} />)}
      {ORDER.map((cls, k) => (
        <div key={`n${cls}`} className="pointer-events-none absolute text-[11px] font-semibold" style={{ left: `${(18 / LGW) * 100}%`, top: `${((laneY(k) - 17) / LGH) * 100}%`, color: opened.includes(cls) ? FIRMWARE[cls]!.color : '#4a5564' }}>
          {opened.includes(cls) ? CLASS_DEFINITIONS[cls].name : '· · ·'}
        </div>
      ))}
    </div>
  );
}

const Dots = ({ k, dark }: { k: number; dark?: boolean }) => <span className="flex items-center gap-1">{Array.from({ length: k }, (_, i) => <span key={i} className={cx('h-2 w-2 rounded-full', dark ? 'bg-[#2a1a02]' : 'bg-white/25')} />)}</span>;

function LaneDetail({ cls, id }: { cls: PlayerClass; id: string }) {
  const { opened, points, ranks, learn } = useFirmware();
  const stage = useStage();
  const color = FIRMWARE[cls]!.color, open = opened.includes(cls), mine = ranks[cls] ?? {}, have = points[cls] ?? 0;
  const dot = <span className="h-3 w-3 shrink-0 rounded-full" style={{ background: color, boxShadow: `0 0 8px ${color}` }} />;
  if (!open) return <div className="slab flex items-center gap-3 rounded-3xl px-4 py-3">{dot}<div className="text-[13px] text-hud-faint">Not found</div></div>;
  if (id === 'S') {
    const att = firmwareAttack(cls, mine), rule = identityOf(cls)?.rule;
    return (
      <div className="slab flex items-center gap-3 rounded-3xl px-4 py-3">
        {dot}
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline gap-2"><span className="font-display text-[15px] font-semibold text-white">{CLASS_DEFINITIONS[cls].name}</span><span className="text-[12px] text-hud-dim">{have} to spend</span></div>
          {att && <div className="text-[13px] leading-snug text-hud-text">{att.name}: {att.description}</div>}
          {rule && <div className="text-[13px] leading-snug text-hud-dim">{rule}</div>}
        </div>
      </div>
    );
  }
  const n = laneOf(cls).find(x => x.id === id) as LaneNode, got = mine[id] ?? 0, can = laneOpen(cls, id, mine, stage);
  return (
    <div className="slab flex items-center gap-3 rounded-3xl px-4 py-3">
      {dot}
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline gap-2"><span className="font-display text-[15px] font-semibold text-white">{n.name}</span>{n.ranks > 1 && <span className="text-[12px] text-hud-dim">{got} / {n.ranks}</span>}</div>
        <div className="text-[13px] leading-snug text-hud-text">{n.text}</div>
      </div>
      {got >= n.ranks ? <span className="shrink-0 text-[12px] font-semibold" style={{ color }}>Kept</span>
        : n.stage > stage ? <span className="shrink-0 text-[12px] text-hud-faint">Later</span>
        : !can ? <span className="shrink-0 text-[12px] text-hud-faint">Not yet</span>
        : n.cost > have ? <span className="shrink-0"><Dots k={n.cost} /></span>
        : <Btn variant="gold" size="sm" className="shrink-0 gap-2" onClick={() => learn(cls, id, stage)}>Learn <Dots k={n.cost} dark /></Btn>}
    </div>
  );
}

export function FirmwareLanes() {
  const box = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(358);
  const first = useFirmware(s => s.opened[0]);
  const [sel, setSel] = useState<[PlayerClass, string] | null>(first ? [first, 'S'] : null);
  useEffect(() => { const fit = fitWidth(box, setWidth); fit(); window.addEventListener('resize', fit); return () => window.removeEventListener('resize', fit); }, []);
  return (
    <div ref={box} className="space-y-2">
      <LanesCanvas width={width} sel={sel} onSelect={setSel} />
      {sel && <LaneDetail cls={sel[0]} id={sel[1]} />}
    </div>
  );
}

// ── Zoomed out ───────────────────────────────────────────────────────────────
const ZGW = 160, ZGH = 300, Z = (p: number[]) => [Math.round(8 + p[0] * 0.9), Math.round(2 + p[1] * 0.9)];
const ZHUB: [number, number] = [16, 236], zLaneY = (k: number) => 196 + k * 17, ZSTART = 40;

function ZoomCanvas({ width, onPick }: { width: number; onPick: (v: 'memory' | 'firmware') => void }) {
  const { opened, points, ranks } = useFirmware();
  const mem = usePlayi();
  const stage = useStage();
  const live = useRef({ opened, points, ranks, mem, stage }); live.current = { opened, points, ranks, mem, stage };
  const height = Math.round((width * ZGH) / ZGW), core = Z(M.MEMORY.core);
  const strandEnd = (() => { const fw = M.NEURONS.filter(n => n.branch === 'fw'); const far = fw.sort((a, b) => b.at[1] - a.at[1])[0]; return far ? Z(far.at) : core; })();
  const ref = usePixels(ZGW, ZGH, width, (t, now) => {
    const { px, dot, ring, line, box } = t, L = live.current, beat = 0.6 + 0.4 * Math.sin(now / 500);
    const rank = (id: string) => L.mem.ranks[id] ?? 0, byId = new Map(M.MEMORY.neurons.map(n => [n.id, n]));
    const color = Object.fromEntries(M.MEMORY.branches.map(b => [b.id, b.color])) as Record<string, string>;
    line(strandEnd, [ZHUB[0], ZHUB[1] - 7], HUB, 0.9);
    for (const [a, b] of M.MEMORY.links) {
      const B = byId.get(b)!, A = a === 'core' ? core : Z(byId.get(a)!.at), lit = (a === 'core' || rank(a) > 0) && rank(b) > 0;
      line(A, Z(B.at), lit ? color[B.branch] : '#2f3947', B.fog ? 0.6 : 1, B.fog ? 3 : 1);
    }
    for (const n of M.MEMORY.neurons) {
      const [x, y] = Z(n.at);
      if (n.fog) { px(x, y, '#4a5564', 0.9); continue; }
      if (rank(n.id) > 0) dot(x, y, 1, color[n.branch], 1);
      else { dot(x, y, 1, '#0b1119', 1); ring(x, y, 1, M.canLearn(L.mem, n.id, true) ? GOLD : '#5b6676', 1); }
    }
    dot(core[0], core[1], 8, GOLD, 0.1 * beat); dot(core[0], core[1], 6, '#0d1a22', 1); ring(core[0], core[1], 6, GOLD, 0.95);
    for (let r = 5; r <= 6; r++) box(ZHUB[0], ZHUB[1], r, HUB, r === 6 ? 0.9 : 0.35); dot(ZHUB[0], ZHUB[1], 1, '#fff', beat);
    ORDER.forEach((cls, k) => {
      const open = L.opened.includes(cls);
      line([ZHUB[0] + 6, ZHUB[1]], [ZSTART, zLaneY(k)], open ? FIRMWARE[cls]!.color : '#2f3947', open ? 0.9 : 0.7);
      paintLane(t, now, cls, zLaneY(k), open, L.points[cls] ?? 0, L.ranks[cls] ?? {}, L.stage, null, 0.92, ZSTART);
    });
  });
  const tap = (e: React.MouseEvent) => {
    const r = (e.target as HTMLElement).getBoundingClientRect(), y = ((e.clientY - r.top) / r.height) * ZGH;
    onPick(y < 186 ? 'memory' : 'firmware');
  };
  return (
    <div style={{ width, height }} className="relative mx-auto">
      <canvas ref={ref} onClick={tap} style={{ imageRendering: 'pixelated' }} aria-label="The whole memory" />
      <Num x={core[0]} y={core[1]} gw={ZGW} gh={ZGH} v={mem.points} color={GOLD} size={13} />
      {ORDER.map((cls, k) => opened.includes(cls) && <Num key={cls} x={ZSTART} y={zLaneY(k)} gw={ZGW} gh={ZGH} v={points[cls] ?? 0} color={FIRMWARE[cls]!.color} size={11} />)}
    </div>
  );
}

/**
 * The memory as the player sees it: the network, the firmware lanes, or the two zoomed out together.
 * Zooming out opens with the first firmware (chapter one's threat-5 boss); until then it's the network alone.
 */
export function MemoryPage() {
  const anyFirmware = useFirmware(s => s.opened.length > 0);
  const [view, setView] = useState<'memory' | 'firmware' | 'zoom'>('memory');
  const box = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(358);
  useEffect(() => { const fit = fitWidth(box, setWidth); fit(); window.addEventListener('resize', fit); return () => window.removeEventListener('resize', fit); }, []);
  const shown = anyFirmware ? view : 'memory';
  return (
    <div ref={box} className="space-y-2">
      {anyFirmware && (
        <div className="flex items-center justify-between gap-3">
          <span className="font-display text-[15px] font-semibold text-hud-text">{shown === 'firmware' ? 'Firmware' : shown === 'zoom' ? 'Everything kept' : 'Network'}</span>
          {shown === 'zoom'
            ? <span className="text-[12px] text-hud-faint">Tap one to go in</span>
            : <button onClick={() => setView('zoom')} className="key flex items-center gap-1.5 rounded-2xl px-3 py-2 text-[13px] font-semibold text-hud-text"><Glyph name="signal" size={14} /> Zoom out</button>}
        </div>
      )}
      {shown === 'memory' && <MemoryNet />}
      {shown === 'firmware' && <FirmwareLanes />}
      {shown === 'zoom' && <ZoomCanvas width={width} onPick={setView} />}
    </div>
  );
}
