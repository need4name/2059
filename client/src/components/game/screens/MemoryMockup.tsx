// MOCKUP ONLY (not wired to the game): the memory as a neural network, for screenshots.
// v5: hand-placed and uneven (clusters and long reaches, no filler); neurons cost points you
// save up over lives; a neuron's specialisations are small lights around it.
import { useEffect, useRef, useState } from 'react';
import { Screen, Btn, Glyph, cx } from '../hud';

const COL = { signal: '#38d6f0', heat: '#ff8a4c', combat: '#f0524f', graft: '#a58bff', net: '#5fe0a8', move: '#7fa8ff' } as const;
type Strand = keyof typeof COL;
interface Spec { name: string; effect: string; cost: number; have?: boolean }
interface Node { id: string; s: Strand; s2?: Strand; x: number; y: number; name: string; effect: string; cost: number; ranks?: number; have?: number; specs?: Spec[]; fog?: boolean; locked?: boolean }
const N: Node[] = [
  // Signal: a tight cluster by the core
  { id: 's1', s: 'signal', x: 62, y: 72, name: 'Signal strength', effect: '+15 max health per rank', cost: 1, ranks: 5, have: 3, specs: [{ name: 'Holdfast', effect: 'Once a host, a killing blow leaves you on 1', cost: 2, have: true }, { name: 'Second wind', effect: 'First time under a third, mend 15%', cost: 2 }] },
  { id: 's2', s: 'signal', x: 60, y: 56, name: 'Supplies', effect: 'Wake with 2 Bio-Stims; 20% off at the Grey Lane', cost: 1, have: 1 },
  { id: 's3', s: 'signal', x: 46, y: 64, name: 'Steady pulse', effect: 'Mend a little more each turn per rank', cost: 1, ranks: 3, specs: [{ name: 'Knitting frame', effect: 'Mending also repairs structure', cost: 2 }] },
  { id: 's4', s: 'signal', x: 38, y: 48, name: 'Hardened signal', effect: '10% less damage from everything', cost: 3 },
  // Processing: few, far apart
  { id: 'p1', s: 'heat', x: 91, y: 71, name: 'Heat sink', effect: 'Shed 2 more heat each round per rank', cost: 1, ranks: 3, have: 3, specs: [{ name: 'Cold start', effect: 'Every fight starts at 0 heat instead of 20', cost: 1, have: true }, { name: 'Thermal tolerance', effect: 'Running hot hurts far less', cost: 2 }, { name: 'Vent', effect: 'Brace cools 10 more', cost: 1 }] },
  { id: 'p2', s: 'heat', x: 113, y: 55, name: 'Redline', effect: 'Once a fight, act twice when very hot', cost: 2 },
  { id: 'p3', s: 'heat', x: 133, y: 36, name: 'Runaway', effect: 'Burning out no longer costs a turn', cost: 3, specs: [{ name: 'Wildfire', effect: 'Critical heat crits far more often', cost: 3 }] },
  // Subroutines: a long reach, the slots along it
  { id: 'c1', s: 'combat', x: 97, y: 97, name: 'Targeting', effect: '+5% damage per rank', cost: 1, ranks: 4, have: 1, specs: [{ name: 'Finisher', effect: '+25% on badly hurt enemies', cost: 2 }, { name: 'Clean first strike', effect: 'Your first attack each fight lands in full', cost: 1 }] },
  { id: 'c2', s: 'combat', x: 116, y: 92, name: 'Flank logic', effect: 'Side and back hits land harder still', cost: 1 },
  { id: 'c3', s: 'combat', x: 121, y: 112, name: 'Fourth slot', effect: 'A fourth action slot on your fight bar', cost: 3 },
  { id: 'c4', s: 'combat', x: 140, y: 103, name: 'Momentum', effect: 'Each takedown adds to Overload', cost: 2 },
  // Grafting: a low cluster
  { id: 'g1', s: 'graft', x: 73, y: 109, name: 'Clean interface', effect: 'Implant health costs are halved', cost: 1, have: 1 },
  { id: 'g2', s: 'graft', x: 61, y: 123, name: 'Reinforced housings', effect: '+10% structure per rank', cost: 1, ranks: 3, specs: [{ name: 'Self-repair', effect: 'Brace repairs far more', cost: 2 }, { name: 'Sealed', effect: 'A broken frame still mends a little', cost: 2 }] },
  { id: 'g3', s: 'graft', x: 81, y: 128, name: 'Salvage instinct', effect: 'Wake with an implant', cost: 2 },
  { id: 'g4', s: 'graft', x: 55, y: 139, name: 'Graft memory', effect: 'Wake with 2 upgrade points', cost: 2 },
  { id: 'g5', s: 'graft', x: 89, y: 145, name: 'Pick of the wreck', effect: 'Choose 1 of 2 dropped implants', cost: 2 },
  // Locomotion: sparse, out to the left
  { id: 'm1', s: 'move', x: 52, y: 92, name: 'Gait calibration', effect: '+1 movement per rank', cost: 2, ranks: 2, specs: [{ name: 'Hit and fade', effect: 'Step after attacking while warm', cost: 2 }, { name: 'Sidestep', effect: 'The first heavy each fight misses', cost: 2 }] },
  { id: 'm2', s: 'move', x: 33, y: 83, name: 'Sure footing', effect: 'Hazards hurt half as much', cost: 1 },
  { id: 'm3', s: 'move', x: 14, y: 95, name: 'Phase step', effect: 'Move through enemies and cover', cost: 3 },
  // Network: small, dark until someone links
  { id: 'n1', s: 'net', x: 44, y: 111, name: 'Handshake', effect: 'Allies start with 25% more health', cost: 1, locked: true },
  { id: 'n2', s: 'net', x: 27, y: 121, name: 'Shared memory', effect: 'Allies level faster per rank', cost: 1, ranks: 2, locked: true, specs: [{ name: 'Coordinated', effect: '+20% on enemies your ally hit', cost: 2 }] },
  { id: 'n3', s: 'net', x: 19, y: 139, name: 'Second link', effect: 'Bring two allies', cost: 3, locked: true },
  // Where strands meet
  { id: 'j1', s: 'signal', s2: 'heat', x: 78, y: 58, name: 'Cold blood', effect: 'End a turn cool and mend a little', cost: 2 },
  { id: 'j2', s: 'heat', s2: 'combat', x: 118, y: 74, name: 'Hot hands', effect: 'Hit harder the hotter you run', cost: 2 },
  { id: 'j3', s: 'combat', s2: 'graft', x: 92, y: 116, name: 'Kinship', effect: 'Implant moves hit a little harder', cost: 2 },
  { id: 'j4', s: 'move', s2: 'net', x: 37, y: 100, name: 'Cover step', effect: 'Moving beside an ally guards you both', cost: 2, locked: true },
  // Past this chapter: only specks
  { id: 'f1', s: 'signal', x: 27, y: 34, name: '', effect: '', cost: 0, fog: true }, { id: 'f2', s: 'heat', x: 149, y: 22, name: '', effect: '', cost: 0, fog: true },
  { id: 'f3', s: 'combat', x: 148, y: 126, name: '', effect: '', cost: 0, fog: true }, { id: 'f4', s: 'graft', x: 101, y: 156, name: '', effect: '', cost: 0, fog: true },
  { id: 'f5', s: 'move', x: 4, y: 108, name: '', effect: '', cost: 0, fog: true }, { id: 'f6', s: 'signal', x: 62, y: 38, name: '', effect: '', cost: 0, fog: true },
  { id: 'f7', s: 'combat', x: 156, y: 96, name: '', effect: '', cost: 0, fog: true },
];
const E: [string, string][] = [['core', 's1'], ['s1', 's2'], ['s1', 's3'], ['s3', 's4'], ['s2', 'j1'], ['j1', 'p1'], ['core', 'p1'], ['p1', 'p2'], ['p2', 'p3'], ['p2', 'j2'], ['j2', 'c2'],
  ['core', 'c1'], ['c1', 'c2'], ['c1', 'c3'], ['c3', 'c4'], ['c2', 'c4'], ['c1', 'j3'], ['j3', 'g3'], ['core', 'g1'], ['g1', 'g2'], ['g1', 'g3'], ['g2', 'g4'], ['g3', 'g5'],
  ['core', 'm1'], ['m1', 'm2'], ['m2', 'm3'], ['m1', 'j4'], ['j4', 'n1'], ['core', 'n1'], ['n1', 'n2'], ['n2', 'n3'], ['s3', 'm2'],
  ['s4', 'f1'], ['p3', 'f2'], ['c4', 'f3'], ['g5', 'f4'], ['m3', 'f5'], ['s2', 'f6'], ['c4', 'f7']];
// What the signal has to spend (the mockup's two screens show 3 and 128; it never shows more than 999)
let POINTS = 3;
const CORE = { x: 75, y: 89 }, TAUGHT: Strand = 'heat', G = 160;
const by = new Map(N.map(n => [n.id, n]));
const lit = (n: Node) => (n.have ?? 0) > 0;
const full = (n: Node) => (n.have ?? 0) >= (n.ranks ?? 1);
const reach = (n: Node) => !n.fog && !n.locked && E.some(([p, q]) => (q === n.id && (p === 'core' || lit(by.get(p)!))) || (p === n.id && lit(by.get(q)!)));
const price = (n: { cost: number }, s: Strand, s2?: Strand) => Math.max(1, n.cost - (s === TAUGHT || s2 === TAUGHT ? 1 : 0));
const canBuy = (n: Node) => reach(n) && !full(n) && price(n, n.s, n.s2) <= POINTS;

function Net({ size, sel, onSelect, pulseIn, points }: { size: number; sel: string | null; onSelect: (id: string) => void; pulseIn?: boolean; points: number }) {
  POINTS = points;
  const shown = Math.min(999, points), digits = String(shown).length;
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const cv = ref.current!; const ctx = cv.getContext('2d')!;
    const scale = Math.max(2, Math.floor((size * (window.devicePixelRatio || 1)) / G));
    cv.width = G * scale; cv.height = G * scale;
    let raf = 0;
    const draw = () => {
      const t = performance.now();
      ctx.setTransform(scale, 0, 0, scale, 0, 0); ctx.imageSmoothingEnabled = false; ctx.clearRect(0, 0, G, G);
      const px = (x: number, y: number, c: string, a = 1) => { ctx.globalAlpha = a; ctx.fillStyle = c; ctx.fillRect(x, y, 1, 1); };
      const dot = (x: number, y: number, r: number, c: string, a = 1, c2?: string) => { for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) if (dx * dx + dy * dy <= r * r + 1) px(x + dx, y + dy, c2 && dx > 0 ? c2 : c, a); };
      const ring = (x: number, y: number, r: number, c: string, a = 1) => { for (let dy = -r - 1; dy <= r + 1; dy++) for (let dx = -r - 1; dx <= r + 1; dx++) if (Math.abs(Math.sqrt(dx * dx + dy * dy) - r) < 0.6) px(x + dx, y + dy, c, a); };
      const line = (a: { x: number; y: number }, b: { x: number; y: number }, c: string, alpha: number, every = 1) => { const n = Math.max(Math.abs(b.x - a.x), Math.abs(b.y - a.y), 1); for (let i = 0; i <= n; i += every) px(Math.round(a.x + ((b.x - a.x) * i) / n), Math.round(a.y + ((b.y - a.y) * i) / n), c, alpha); };
      for (const [p, q] of E) {
        const A = p === 'core' ? CORE : by.get(p)!, B = by.get(q)!;
        const both = (p === 'core' || lit(by.get(p)!)) && lit(B);
        if (both) line(A, B, COL[B.s2 && p !== 'core' ? by.get(p)!.s : B.s], 0.95);
        else line(A, B, '#2f3947', B.fog ? 0.7 : B.locked ? 0.5 : 1, B.fog ? 3 : 1);
      }
      for (const n of N) {
        if (n.fog) { px(n.x, n.y, '#4a5564', 0.9); continue; }
        const col = COL[n.s], c2 = n.s2 ? COL[n.s2] : undefined, has = lit(n), open = reach(n) && !full(n), afford = canBuy(n);
        const disc = n.s === TAUGHT || n.s2 === TAUGHT;
        const edge = afford ? '#f2b33d' : open ? '#8a7440' : '#5b6676';
        const beat = 0.55 + 0.45 * Math.sin(t / 280 + n.x);
        const r = n.ranks ? 3 + (n.cost > 1 ? 1 : 0) : n.cost + 1;
        // What the last host taught costs less: a soft yellow glow round every neuron it touches
        if (disc && !n.locked) { const g = 0.75 + 0.25 * Math.sin(t / 600); dot(n.x, n.y, r + 5, '#ffe27a', 0.07 * g); dot(n.x, n.y, r + 3, '#ffe27a', 0.13 * g); }
        if (has) { dot(n.x, n.y, r + 1, col, 0.18); dot(n.x, n.y, r, col, full(n) ? 1 : 0.75, c2); px(n.x - 1, n.y - 1, '#ffffff', 0.8); if (afford) ring(n.x, n.y, r + 1, edge, 0.4 + 0.5 * beat); }
        else { if (afford) dot(n.x, n.y, r + 2, edge, 0.16 * beat); dot(n.x, n.y, r, '#0b1119', 1); ring(n.x, n.y, r, edge, afford ? 0.6 + 0.4 * beat : n.locked ? 0.4 : 0.9); px(n.x, n.y, col, n.locked ? 0.4 : 0.9); if (c2) px(n.x + 1, n.y, c2, n.locked ? 0.4 : 0.9); }
        if (n.id === 'c3') { ctx.globalAlpha = 1; ctx.fillStyle = '#e8f4ff'; ctx.fillRect(n.x - 1, n.y - 1, 3, 2); }
        // Ranks: a pip each under it
        if (n.ranks) for (let k = 0; k < n.ranks; k++) px(n.x - (n.ranks - 1) + k * 2, n.y + r + 2, k < (n.have ?? 0) ? '#ffffff' : '#5b6676', n.locked ? 0.5 : 1);
        // Specialisations: a light each, riding its upper edge: white when kept, its colour when on offer, dark until the neuron is full
        (n.specs ?? []).forEach((sp, k) => {
          const a = (-90 + (k - ((n.specs!.length - 1) / 2)) * 42) * Math.PI / 180, x = Math.round(n.x + Math.cos(a) * (r + 3)), y = Math.round(n.y + Math.sin(a) * (r + 3));
          const c = sp.have ? '#ffffff' : full(n) ? col : '#4a5564';
          px(x, y, c, n.locked ? 0.5 : 1); px(x + 1, y, c, n.locked ? 0.5 : 1); px(x, y + 1, c, n.locked ? 0.5 : 1); px(x + 1, y + 1, c, n.locked ? 0.5 : 1);
          if (!sp.have && full(n) && !n.locked) { ctx.globalAlpha = 0.25 + 0.3 * beat; ctx.fillStyle = col; ctx.fillRect(x - 1, y - 1, 4, 4); }
        });
        if (n.id === sel) for (const [sx, sy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) { px(n.x + sx * 8, n.y + sy * 8, '#fff'); px(n.x + sx * 7, n.y + sy * 8, '#fff'); px(n.x + sx * 8, n.y + sy * 7, '#fff'); }
      }
      const beat = 0.6 + 0.4 * Math.sin(t / 500);
      dot(CORE.x, CORE.y, 10, '#f2b33d', 0.1 * beat); dot(CORE.x, CORE.y, 8, '#0d1a22', 1); ring(CORE.x, CORE.y, 8, '#f2b33d', 0.95);
      if (pulseIn) { const k = (t / 1400) % 1; dot(CORE.x, Math.round(CORE.y - 9 - 70 * (1 - k)), 1, '#fff6d0', 1); }
      ctx.globalAlpha = 1;
      raf = requestAnimationFrame(draw);
    };
    draw();
    return () => cancelAnimationFrame(raf);
  }, [size, sel, pulseIn]);
  const tap = (e: React.MouseEvent) => {
    const r = (e.target as HTMLElement).getBoundingClientRect();
    const x = ((e.clientX - r.left) / r.width) * G, y = ((e.clientY - r.top) / r.height) * G;
    const hit = N.filter(n => !n.fog).map(n => ({ n, d: Math.hypot(n.x - x, n.y - y) })).sort((a, b) => a.d - b.d)[0];
    if (hit && hit.d < 8) onSelect(hit.n.id);
  };
  return (
    <div style={{ width: size, height: size }} className="relative mx-auto">
      <canvas ref={ref} onClick={tap} style={{ width: size, height: size, imageRendering: 'pixelated' }} />
      <div className="pointer-events-none absolute -translate-x-1/2 -translate-y-1/2 font-display font-bold leading-none tracking-tight text-cred drop-shadow-[0_0_8px_rgba(242,179,61,0.8)]" style={{ fontSize: digits === 1 ? 19 : digits === 2 ? 16 : 12.5, left: `${((CORE.x + 0.5) / G) * 100}%`, top: `${((CORE.y + 0.5) / G) * 100}%` }}>{shown}</div>
    </div>
  );
}

/** The price, a dot a point. */
function Dots({ n, dark }: { n: number; dark?: boolean }) {
  return <span className="flex items-center gap-1">{Array.from({ length: n }, (_, k) => <span key={k} className={cx('h-2 w-2 rounded-full', dark ? 'bg-[#2a1a02]' : 'bg-white/25')} />)}</span>;
}
function Buy({ cost, ok }: { cost: number; ok: boolean }) {
  return ok ? <Btn variant="gold" size="sm" className="shrink-0 gap-2">Learn <Dots n={cost} dark /></Btn> : <span className="shrink-0"><Dots n={cost} /></span>;
}

function Detail({ id }: { id: string }) {
  const n = by.get(id)!; const p = price(n, n.s, n.s2);
  return (
    <div className="slab space-y-2 rounded-3xl px-4 py-3">
      <div className="flex items-center gap-3">
        <span className="flex shrink-0">
          <span className="h-3 w-3 rounded-full" style={{ background: COL[n.s], boxShadow: `0 0 8px ${COL[n.s]}` }} />
          {n.s2 && <span className="-ml-1 h-3 w-3 rounded-full" style={{ background: COL[n.s2] }} />}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline gap-2">
            <span className="font-display text-[15px] font-semibold text-white">{n.name}</span>
            {n.ranks && <span className="text-[12px] text-hud-dim">{n.have ?? 0} / {n.ranks}</span>}
          </div>
          <div className="text-[13px] leading-snug text-hud-text">{n.effect}</div>
        </div>
        {full(n) ? <span className="shrink-0 text-[12px] font-semibold" style={{ color: COL[n.s] }}>Kept</span>
          : reach(n) ? <Buy cost={p} ok={p <= POINTS} />
          : <span className="shrink-0 text-[12px] text-hud-faint">{n.locked ? 'No one to link' : 'Not yet'}</span>}
      </div>
      {n.specs?.map(sp => {
        const sp2 = price(sp, n.s);
        return (
          <div key={sp.name} className="flex items-center gap-3 rounded-2xl bg-white/[0.04] px-3 py-2" style={{ opacity: full(n) ? 1 : 0.5 }}>
            <span className="h-2 w-2 shrink-0 rounded-[2px]" style={{ background: sp.have ? '#fff' : full(n) ? COL[n.s] : '#4a5564' }} />
            <div className="min-w-0 flex-1">
              <div className="text-[13px] font-semibold text-white">{sp.name}</div>
              <div className="text-[12px] leading-snug text-hud-dim">{sp.effect}</div>
            </div>
            {sp.have ? <span className="shrink-0 text-[12px] font-semibold text-white/80">Kept</span> : full(n) ? <Buy cost={sp2} ok={sp2 <= POINTS} /> : <span className="shrink-0 text-[11px] text-hud-faint">Fill it first</span>}
          </div>
        );
      })}
    </div>
  );
}

export function MockTree() {
  const [sel, setSel] = useState<string | null>('p1');
  return (
    <Screen>
      <div className="space-y-3 px-4 pb-8 pt-6">
        <div className="flex items-center gap-3">
          <span className="key flex h-10 w-10 items-center justify-center rounded-2xl"><Glyph name="back" size={16} /></span>
          <h1 className="flex-1 font-display text-[22px] font-semibold text-white">Memory</h1>
        </div>
        <Net size={358} sel={sel} onSelect={setSel} points={3} />
        {sel && <Detail id={sel} />}
      </div>
    </Screen>
  );
}

export function MockDeath() {
  const [sel, setSel] = useState<string | null>('c3');
  return (
    <Screen footer={<Btn variant="primary" size="lg" className="w-full">Wake</Btn>}>
      <div className="space-y-3 px-4 pb-6 pt-10">
        <header className="flex flex-col items-center gap-2 text-center">
          <h1 className="font-display text-[38px] font-bold leading-none tracking-tight text-white drop-shadow-[0_0_24px_rgba(240,82,79,0.35)]">Host lost</h1>
          <p className="text-[14px] text-hostile">Cartel Enforcer</p>
        </header>
        <Net size={358} sel={sel} onSelect={setSel} pulseIn points={128} />
        {sel && <Detail id={sel} />}
      </div>
    </Screen>
  );
}


// ── v8: zoomed out (the memory and the firmware lanes together), and the lanes up close ──
const FW = [
  { name: 'Enforcer', color: '#ff6b5e', points: 4, open: true, lit: 1, ranks: [2, 0, 0, 0] },
  { name: 'Operative', color: '#7fe0ff', points: 1, open: true, lit: 0, ranks: [1, 0, 0, 0] },
  { name: '', color: '#5b6676', points: 0, open: false, lit: 0, ranks: [0, 0, 0, 0] },
  { name: '', color: '#5b6676', points: 0, open: false, lit: 0, ranks: [0, 0, 0, 0] },
  { name: '', color: '#5b6676', points: 0, open: false, lit: 0, ranks: [0, 0, 0, 0] },
];
const FW_NODE = [['Hits harder', '+4% damage with its own move per rank', 3], ['Knocks them back', 'Its own move shoves whoever it hits one tile', 1], ['Wider swing', 'Its own move also hits the tiles either side', 1], ['Runs cooler', 'Its own move makes 2 less heat per rank', 3]] as const;

function usePixels(G: number, size: number, paint: (px: (x: number, y: number, c: string, a?: number) => void, t: number, h: { dot: (x: number, y: number, r: number, c: string, a?: number) => void; ring: (x: number, y: number, r: number, c: string, a?: number) => void; line: (a: { x: number; y: number }, b: { x: number; y: number }, c: string, al: number, every?: number) => void; box: (x: number, y: number, r: number, c: string, a?: number) => void }) => void) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const cv = ref.current!; const ctx = cv.getContext('2d')!;
    const scale = Math.max(2, Math.floor((size * (window.devicePixelRatio || 1)) / G));
    cv.width = G * scale; cv.height = G * scale;
    let raf = 0;
    const draw = () => {
      ctx.setTransform(scale, 0, 0, scale, 0, 0); ctx.imageSmoothingEnabled = false; ctx.clearRect(0, 0, G, G);
      const px = (x: number, y: number, c: string, a = 1) => { ctx.globalAlpha = a; ctx.fillStyle = c; ctx.fillRect(x, y, 1, 1); };
      const dot = (x: number, y: number, r: number, c: string, a = 1) => { for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) if (dx * dx + dy * dy <= r * r + 1) px(x + dx, y + dy, c, a); };
      const ring = (x: number, y: number, r: number, c: string, a = 1) => { for (let dy = -r - 1; dy <= r + 1; dy++) for (let dx = -r - 1; dx <= r + 1; dx++) if (Math.abs(Math.sqrt(dx * dx + dy * dy) - r) < 0.6) px(x + dx, y + dy, c, a); };
      const line = (a: { x: number; y: number }, b: { x: number; y: number }, c: string, al: number, every = 1) => { const n = Math.max(Math.abs(b.x - a.x), Math.abs(b.y - a.y), 1); for (let i = 0; i <= n; i += every) px(Math.round(a.x + ((b.x - a.x) * i) / n), Math.round(a.y + ((b.y - a.y) * i) / n), c, al); };
      // The firmware hub is square: hardware, not a neuron
      const box = (x: number, y: number, r: number, c: string, a = 1) => { for (let d = -r; d <= r; d++) { if (Math.abs(d) < r) { px(x + d, y - r, c, a); px(x + d, y + r, c, a); px(x - r, y + d, c, a); px(x + r, y + d, c, a); } } };
      paint(px, performance.now(), { dot, ring, line, box });
      ctx.globalAlpha = 1;
      raf = requestAnimationFrame(draw);
    };
    draw();
    return () => cancelAnimationFrame(raf);
  });
  return ref;
}
const Num = ({ x, y, G, n, color, size = 14 }: { x: number; y: number; G: number; n: number; color: string; size?: number }) => (
  <div className="pointer-events-none absolute -translate-x-1/2 -translate-y-1/2 font-display font-bold leading-none" style={{ left: `${((x + 0.5) / G) * 100}%`, top: `${((y + 0.5) / G) * 100}%`, color, fontSize: size, textShadow: `0 0 8px ${color}` }}>{Math.min(999, n)}</div>
);

/** Zoomed out: the memory above, the firmware lanes hanging off one of its strands. */
export function MockZoom() {
  const G = 160, size = 358;
  const mini = (n: { x: number; y: number }) => ({ x: Math.round(8 + n.x * 0.55), y: Math.round(2 + n.y * 0.55) });
  const core = mini(CORE), hub = { x: 62, y: 112 };
  const laneY = (k: number) => 96 + k * 11;
  const ref = usePixels(G, size, (px, t, { dot, ring, line, box }) => {
    for (const [p, q] of E) { const A = p === 'core' ? core : mini(by.get(p)!), B = mini(by.get(q)!), n = by.get(q)!; const both = (p === 'core' || lit(by.get(p)!)) && lit(n); line(A, B, both ? COL[n.s] : '#2f3947', n.fog ? 0.6 : 1, n.fog ? 3 : 1); }
    for (const n of N) { const m = mini(n); if (n.fog) { px(m.x, m.y, '#4a5564', 0.9); continue; } if (lit(n)) dot(m.x, m.y, 1, COL[n.s], 1); else { dot(m.x, m.y, 1, '#0b1119', 1); ring(m.x, m.y, 1, n.locked ? '#3a4452' : '#5b6676', 1); } }
    const beat = 0.6 + 0.4 * Math.sin(t / 500);
    dot(core.x, core.y, 8, '#f2b33d', 0.1 * beat); dot(core.x, core.y, 6, '#0d1a22', 1); ring(core.x, core.y, 6, '#f2b33d', 0.95);
    // The strand down to the hub
    line(core, { x: 50, y: 84 }, '#c9d4e0', 0.9); line({ x: 50, y: 84 }, hub, '#c9d4e0', 0.9);
    for (let r = 5; r <= 6; r++) box(hub.x, hub.y, r, '#c9d4e0', r === 6 ? 0.9 : 0.35); dot(hub.x, hub.y, 1, '#ffffff', beat);
    FW.forEach((f, k) => {
      const y = laneY(k), start = { x: 82, y };
      line(hub, start, f.open ? f.color : '#2f3947', f.open ? 0.9 : 0.8);
      line(start, { x: 152, y: y + (k - 2) }, '#2f3947', f.open ? 1 : 0.6, f.open ? 1 : 2);
      if (f.open) { ring(start.x, start.y, 4, f.color, 0.95); dot(start.x, start.y, 3, '#0d1a22', 1); }
      [104, 124, 142].forEach((x, i) => { const yy = Math.round(y + ((k - 2) * (x - 82)) / 70); if (!f.open) { px(x, yy, '#4a5564', 0.9); return; } if (i < f.lit) dot(x, yy, 2, f.color, 1); else { dot(x, yy, 2, '#0b1119', 1); ring(x, yy, 2, i === f.lit ? '#f2b33d' : '#5b6676', 1); } });
    });
  });
  return (
    <Screen>
      <div className="space-y-3 px-4 pb-8 pt-6">
        <div className="flex items-center gap-3">
          <span className="key flex h-10 w-10 items-center justify-center rounded-2xl"><Glyph name="back" size={16} /></span>
          <h1 className="flex-1 font-display text-[22px] font-semibold text-white">Memory</h1>
        </div>
        <div style={{ width: size, height: size }} className="relative mx-auto">
          <canvas ref={ref} style={{ width: size, height: size, imageRendering: 'pixelated' }} />
          <Num x={core.x} y={core.y} G={G} n={12} color="#f2b33d" size={13} />
          {FW.map((f, k) => f.open && <Num key={k} x={82} y={laneY(k)} G={G} n={f.points} color={f.color} size={10} />)}
        </div>
        <p className="text-center text-[12px] text-hud-faint">Tap a cluster to go in</p>
      </div>
    </Screen>
  );
}

/** The firmware lanes up close: a lane a firmware, each with its own points. */
export function MockFirmware() {
  const G = 160, size = 358, hub = { x: 14, y: 80 }, cols = [62, 90, 118, 146];
  const laneY = (k: number) => 24 + k * 28;
  const [sel, setSel] = useState<[number, number]>([0, 1]);
  const ref = usePixels(G, size, (px, t, { dot, ring, line, box }) => {
    const beat = 0.6 + 0.4 * Math.sin(t / 400);
    // Stages: what each chapter opens
    cols.slice(1).forEach(x => { for (let y = 8; y < 152; y += 3) px(x - 14, y, '#2a3340', 0.9); });
    for (let r = 6; r <= 7; r++) box(hub.x, hub.y, r, '#c9d4e0', r === 7 ? 0.9 : 0.35); dot(hub.x, hub.y, 1, '#ffffff', beat);
    FW.forEach((f, k) => {
      const y = laneY(k), start = { x: 36, y };
      line(hub, start, f.open ? f.color : '#2f3947', f.open ? 0.9 : 0.7);
      line(start, { x: 156, y }, '#2f3947', f.open ? 1 : 0.6, f.open ? 1 : 2);
      if (!f.open) { cols.forEach(x => px(x, y, '#4a5564', 0.9)); px(start.x, start.y, '#4a5564', 1); return; }
      if (f.lit > 0) line(start, { x: cols[f.lit - 1], y }, f.color, 0.95);
      dot(start.x, start.y, 8, f.color, 0.1 * beat); dot(start.x, start.y, 6, '#0d1a22', 1); ring(start.x, start.y, 6, f.color, 0.95);
      cols.forEach((x, i) => {
        const full = f.ranks[i] >= FW_NODE[i][2], has = f.ranks[i] > 0, open = i <= f.lit && !full, afford = open && f.points >= 1;
        const r = FW_NODE[i][2] > 1 ? 4 : 3;
        if (has) { dot(x, y, r + 1, f.color, 0.18); dot(x, y, r, f.color, full ? 1 : 0.7); px(x - 1, y - 1, '#fff', 0.8); if (afford) ring(x, y, r + 1, '#f2b33d', 0.4 + 0.5 * beat); }
        else { if (afford) dot(x, y, r + 2, '#f2b33d', 0.16 * beat); dot(x, y, r, '#0b1119', 1); ring(x, y, r, afford ? '#f2b33d' : '#5b6676', afford ? 0.6 + 0.4 * beat : 0.9); px(x, y, f.color, 0.9); }
        if (FW_NODE[i][2] > 1) for (let n = 0; n < FW_NODE[i][2]; n++) px(x - (FW_NODE[i][2] - 1) + n * 2, y + r + 2, n < f.ranks[i] ? '#fff' : '#5b6676', 1);
        if (sel[0] === k && sel[1] === i) for (const [sx, sy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) { px(x + sx * 8, y + sy * 8, '#fff'); px(x + sx * 7, y + sy * 8, '#fff'); px(x + sx * 8, y + sy * 7, '#fff'); }
      });
    });
  });
  const f = FW[sel[0]], nd = FW_NODE[sel[1]], have = f.ranks[sel[1]];
  return (
    <Screen>
      <div className="space-y-3 px-4 pb-8 pt-6">
        <div className="flex items-center gap-3">
          <span className="key flex h-10 w-10 items-center justify-center rounded-2xl"><Glyph name="back" size={16} /></span>
          <h1 className="flex-1 font-display text-[22px] font-semibold text-white">Firmware</h1>
        </div>
        <div style={{ width: size, height: size }} className="relative mx-auto">
          <canvas ref={ref} onClick={() => setSel(sel)} style={{ width: size, height: size, imageRendering: 'pixelated' }} />
          {FW.map((fw, k) => fw.open && <Num key={k} x={36} y={laneY(k)} G={G} n={fw.points} color={fw.color} size={15} />)}
          {FW.map((fw, k) => fw.open && <div key={`n${k}`} className="pointer-events-none absolute text-[11px] font-semibold" style={{ left: `${(26 / G) * 100}%`, top: `${((laneY(k) - 15) / G) * 100}%`, color: fw.color }}>{fw.name}</div>)}
        </div>
        <div className="slab flex items-center gap-3 rounded-3xl px-4 py-3">
          <span className="h-3 w-3 shrink-0 rounded-full" style={{ background: f.color, boxShadow: `0 0 8px ${f.color}` }} />
          <div className="min-w-0 flex-1">
            <div className="flex items-baseline gap-2"><span className="font-display text-[15px] font-semibold text-white">{nd[0]}</span>{nd[2] > 1 && <span className="text-[12px] text-hud-dim">{have} / {nd[2]}</span>}</div>
            <div className="text-[13px] leading-snug text-hud-text">{nd[1]}</div>
          </div>
          <Buy cost={1} ok />
        </div>
      </div>
    </Screen>
  );
}
