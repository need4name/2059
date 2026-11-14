// The memory network on screen (content/memory.json, engine/memory.ts): a hand-laid web of
// neurons in pixel art. Kept neurons are lit in their branch's colour; a gold pulse is one you
// can afford, dull gold one in reach to save for, grey not yet, specks what lies past this
// chapter. Pips under a neuron are its ranks, the small squares on its upper edge its
// specialisations (dark: not yet; its colour: on offer; white: kept), a second ring an endless
// one, a soft yellow glow what the last host made cheaper. The points to spend sit in the core.
import { useEffect, useRef, useState } from 'react';
import { Btn, cx } from '../hud';
import { usePlayi } from '@/lib/stores/usePlayi';
import { useAllies } from '@/lib/stores/useAllies';
import * as M from '@/lib/engine/memory';

const [GW, GH] = M.MEMORY.size, [CX, CY] = M.MEMORY.core;
const COLOR = Object.fromEntries(M.MEMORY.branches.map(b => [b.id, b.color])) as Record<string, string>;
const all = M.MEMORY.neurons, byId = new Map(all.map(n => [n.id, n]));
const GOLD = '#f2b33d';

type Px = (x: number, y: number, c: string, a?: number) => void;

function NetCanvas({ width, sel, onSelect }: { width: number; sel: string | null; onSelect: (id: string) => void }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const live = useRef({ sel, state: null as M.MemoryState | null, hasAlly: false });
  const { points, ranks, taught } = usePlayi();
  const hasAlly = useAllies(a => a.unlocked().length > 0);
  live.current = { sel, state: { points, ranks, taught }, hasAlly };
  const height = Math.round((width * GH) / GW);

  useEffect(() => {
    const cv = ref.current!; const ctx = cv.getContext('2d')!;
    const scale = Math.max(2, Math.floor((width * (window.devicePixelRatio || 1)) / GW));
    cv.width = GW * scale; cv.height = GH * scale;
    let raf = 0;
    const px: Px = (x, y, c, a = 1) => { ctx.globalAlpha = a; ctx.fillStyle = c; ctx.fillRect(x, y, 1, 1); };
    const dot = (x: number, y: number, r: number, c: string, a = 1, c2?: string) => { for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) if (dx * dx + dy * dy <= r * r + 1) px(x + dx, y + dy, c2 && dx > 0 ? c2 : c, a); };
    const ring = (x: number, y: number, r: number, c: string, a = 1) => { for (let dy = -r - 1; dy <= r + 1; dy++) for (let dx = -r - 1; dx <= r + 1; dx++) if (Math.abs(Math.sqrt(dx * dx + dy * dy) - r) < 0.6) px(x + dx, y + dy, c, a); };
    const line = (a: number[], b: number[], c: string, al: number, every = 1) => { const k = Math.max(Math.abs(b[0] - a[0]), Math.abs(b[1] - a[1]), 1); for (let i = 0; i <= k; i += every) px(Math.round(a[0] + ((b[0] - a[0]) * i) / k), Math.round(a[1] + ((b[1] - a[1]) * i) / k), c, al); };
    const draw = () => {
      const now = performance.now(), { sel: picked, state, hasAlly: ally } = live.current, s = state!;
      const rank = (id: string) => s.ranks[id] ?? 0, kept = (id: string) => rank(id) > 0;
      ctx.setTransform(scale, 0, 0, scale, 0, 0); ctx.imageSmoothingEnabled = false; ctx.clearRect(0, 0, GW, GH);
      for (const [p, q] of M.MEMORY.links) {
        const b = byId.get(q)!, A = p === 'core' ? [CX, CY] : byId.get(p)!.at, both = (p === 'core' || kept(p)) && kept(q), dark = !!b.needsAlly && !ally;
        if (both) line(A, b.at, COLOR[b.branch2 && p !== 'core' ? byId.get(p)!.branch : b.branch], 0.95);
        else line(A, b.at, '#2f3947', b.fog ? 0.7 : dark ? 0.5 : 1, b.fog ? 3 : 1);
      }
      for (const n of all) {
        const [x, y] = n.at;
        if (n.fog) { px(x, y, '#4a5564', 0.9); continue; }
        const col = COLOR[n.branch], c2 = n.branch2 ? COLOR[n.branch2] : undefined, dark = !!n.needsAlly && !ally;
        const has = kept(n.id), open = M.open(s, n.id, ally), afford = open && M.priceOf(s, n.id) <= s.points, full = M.specsOpen(n, s.ranks);
        const edge = afford ? GOLD : open ? '#8a7440' : '#5b6676', beat = 0.55 + 0.45 * Math.sin(now / 280 + x);
        const r = n.ranks > 1 ? (n.curve || n.cost > 1 ? 4 : 3) : Math.min(4, n.cost + 1);
        if (s.taught && (n.branch === s.taught || n.branch2 === s.taught) && !dark) { const g = 0.75 + 0.25 * Math.sin(now / 600); dot(x, y, r + 5, '#ffe27a', 0.07 * g); dot(x, y, r + 3, '#ffe27a', 0.13 * g); }
        if (has) { dot(x, y, r + 1, col, 0.18); dot(x, y, r, col, full ? 1 : 0.7, c2); px(x - 1, y - 1, '#fff', 0.8); if (afford) ring(x, y, r + 1, edge, 0.4 + 0.5 * beat); }
        else { if (afford) dot(x, y, r + 2, edge, 0.16 * beat); dot(x, y, r, '#0b1119', 1); ring(x, y, r, edge, afford ? 0.6 + 0.4 * beat : dark ? 0.4 : 0.9); px(x, y, col, dark ? 0.4 : 0.9); if (c2) px(x + 1, y, c2, dark ? 0.4 : 0.9); }
        if (n.curve) ring(x, y, r + 2, has ? col : '#5b6676', dark ? 0.25 : 0.5);
        if (n.fx.some(f => f.perk === 'extraSlots')) for (const [dx, dy] of [[-1, -1], [0, -1], [1, -1], [-1, 0], [0, 0], [1, 0]]) px(x + dx, y + dy, '#e8f4ff');
        if (n.ranks > 1) for (let k = 0; k < n.ranks; k++) px(x - (n.ranks - 1) + k * 2, y + r + (n.curve ? 4 : 2), k < rank(n.id) ? '#fff' : '#5b6676', dark ? 0.5 : 1);
        (n.specs ?? []).forEach((sp, k) => {
          const a = (-90 + (k - (n.specs!.length - 1) / 2) * 42) * Math.PI / 180, rr = r + (n.curve ? 5 : 3), sx = Math.round(x + Math.cos(a) * rr), sy = Math.round(y + Math.sin(a) * rr);
          const done = rank(sp.id) >= sp.ranks, c = done ? '#fff' : full ? col : '#4a5564';
          for (const [dx, dy] of [[0, 0], [1, 0], [0, 1], [1, 1]]) px(sx + dx, sy + dy, c, dark ? 0.5 : rank(sp.id) > 0 && !done ? 0.75 : 1);
        });
        if (n.id === picked) for (const [sx, sy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) { px(x + sx * 9, y + sy * 9, '#fff'); px(x + sx * 8, y + sy * 9, '#fff'); px(x + sx * 9, y + sy * 8, '#fff'); }
      }
      const beat = 0.6 + 0.4 * Math.sin(now / 500);
      dot(CX, CY, 10, GOLD, 0.1 * beat); dot(CX, CY, 8, '#0d1a22', 1); ring(CX, CY, 8, GOLD, 0.95);
      ctx.globalAlpha = 1;
      raf = requestAnimationFrame(draw);
    };
    draw();
    return () => cancelAnimationFrame(raf);
  }, [width]);

  const tap = (e: React.MouseEvent) => {
    const r = (e.target as HTMLElement).getBoundingClientRect(), x = ((e.clientX - r.left) / r.width) * GW, y = ((e.clientY - r.top) / r.height) * GH;
    const hit = M.NEURONS.map(n => ({ n, d: Math.hypot(n.at[0] - x, n.at[1] - y) })).sort((a, b) => a.d - b.d)[0];
    if (hit && hit.d < 9) onSelect(hit.n.id);
  };
  const shown = Math.min(M.MAX_POINTS, points), digits = String(shown).length;
  return (
    // Canvases fill their parent (index.css), so the box sets the size
    <div style={{ width, height }} className="relative mx-auto">
      <canvas ref={ref} onClick={tap} style={{ imageRendering: 'pixelated' }} aria-label="Memory network" />
      <div className="pointer-events-none absolute -translate-x-1/2 -translate-y-1/2 font-display font-bold leading-none tracking-tight text-cred" style={{ left: `${((CX + 0.5) / GW) * 100}%`, top: `${((CY + 0.5) / GH) * 100}%`, fontSize: digits === 1 ? 19 : digits === 2 ? 16 : 12.5, textShadow: '0 0 8px rgba(242,179,61,0.8)' }}>{shown}</div>
    </div>
  );
}

const Dots = ({ k, dark }: { k: number; dark?: boolean }) => <span className="flex items-center gap-1">{Array.from({ length: k }, (_, i) => <span key={i} className={cx('h-2 w-2 rounded-full', dark ? 'bg-[#2a1a02]' : 'bg-white/25')} />)}</span>;

/** Learn (with its price in dots) when it can be, the price alone when it's in reach, or why not. */
function Buy({ id, why }: { id: string; why?: string }) {
  const { points, ranks, taught, learn } = usePlayi();
  const hasAlly = useAllies(a => a.unlocked().length > 0);
  const s = { points, ranks, taught }, cost = M.priceOf(s, id);
  if (!M.open(s, id, hasAlly)) return <span className="shrink-0 text-[12px] text-hud-faint">{why ?? 'Not yet'}</span>;
  if (cost > points) return <span className="shrink-0"><Dots k={cost} /></span>;
  return <Btn variant="gold" size="sm" className="shrink-0 gap-2" onClick={() => learn(id, hasAlly)}>Learn <Dots k={cost} dark /></Btn>;
}

function Detail({ id }: { id: string }) {
  const ranks = usePlayi(s => s.ranks);
  const hasAlly = useAllies(a => a.unlocked().length > 0);
  const n = M.neuron(id)!, have = ranks[id] ?? 0, done = !n.curve && have >= n.ranks, full = M.specsOpen(n, ranks);
  return (
    <div className="slab space-y-2 rounded-3xl px-4 py-3">
      <div className="flex items-center gap-3">
        <span className="flex shrink-0"><span className="h-3 w-3 rounded-full" style={{ background: COLOR[n.branch], boxShadow: `0 0 8px ${COLOR[n.branch]}` }} />{n.branch2 && <span className="-ml-1 h-3 w-3 rounded-full" style={{ background: COLOR[n.branch2] }} />}</span>
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline gap-2"><span className="font-display text-[15px] font-semibold text-white">{n.name}</span>{(n.ranks > 1 || n.curve) && <span className="text-[12px] text-hud-dim">{n.curve ? `Rank ${have}` : `${have} / ${n.ranks}`}</span>}</div>
          <div className="text-[13px] leading-snug text-hud-text">{n.text}</div>
        </div>
        {done ? <span className="shrink-0 text-[12px] font-semibold" style={{ color: COLOR[n.branch] }}>Kept</span> : <Buy id={id} why={n.needsAlly && !hasAlly ? 'No one to link' : undefined} />}
      </div>
      {n.specs?.map(sp => {
        const got = ranks[sp.id] ?? 0, kept = got >= sp.ranks;
        return (
          <div key={sp.id} className="flex items-center gap-3 rounded-2xl bg-white/[0.04] px-3 py-2" style={{ opacity: full ? 1 : 0.5 }}>
            <span className="h-2 w-2 shrink-0 rounded-[2px]" style={{ background: kept ? '#fff' : full ? COLOR[n.branch] : '#4a5564' }} />
            <div className="min-w-0 flex-1">
              <div className="flex items-baseline gap-2"><span className="text-[13px] font-semibold text-white">{sp.name}</span>{sp.ranks > 1 && <span className="text-[11px] text-hud-dim">{got} / {sp.ranks}</span>}</div>
              <div className="text-[12px] leading-snug text-hud-dim">{sp.text}</div>
            </div>
            {kept ? <span className="shrink-0 text-[12px] font-semibold text-white/80">Kept</span> : <Buy id={sp.id} why={n.curve ? `Rank ${n.ranks} first` : 'Fill it first'} />}
          </div>
        );
      })}
    </div>
  );
}

/** The network and, under it, whatever neuron is tapped. Used on the Memory page and the death screen. */
export function MemoryNet() {
  const [sel, setSel] = useState<string | null>(null);
  const box = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(358);
  useEffect(() => {
    const fit = () => { if (box.current) setWidth(Math.max(280, Math.min(480, Math.floor(box.current.clientWidth)))); };
    fit(); window.addEventListener('resize', fit);
    return () => window.removeEventListener('resize', fit);
  }, []);
  return (
    <div ref={box} className="space-y-2">
      <NetCanvas width={width} sel={sel} onSelect={setSel} />
      {sel && <Detail id={sel} />}
    </div>
  );
}
