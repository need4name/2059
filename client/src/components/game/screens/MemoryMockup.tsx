// MOCKUP ONLY (not wired to the game): the memory as a neural network, for screenshots.
// v4: strands fork and meet their neighbours at shared neurons; a big neuron has ranks, and
// maxing it opens its specialisations. One death = one point = one step, always.
import { useEffect, useRef, useState } from 'react';
import { Screen, Btn, Glyph } from '../hud';

type Kind = 'b' | 'N' | 'B' | 'J' | 'S' | 'E';
interface Node { id: string; kind: Kind; b: number; b2?: number; x: number; y: number; name: string; effect: string; ranks?: number; parent?: string }
const STRANDS = [
  { name: 'Signal', color: '#38d6f0', bead: '+3 max health', N: ['Supplies', 'Wake with 2 Bio-Stims; 20% off at the Grey Lane'], B: ['Signal strength', '+15 max health a rank'], S: [['Holdfast', 'Once a host, a killing blow leaves you on 1'], ['Second wind', 'The first time you drop under a third, mend 15%']], E: ['Deep signal', '+2 max health, every time'] },
  { name: 'Processing', color: '#ff8a4c', bead: 'Shed a little more heat each round', N: ['Set point', 'Start each fight cold (0) or warm (50)'], B: ['Heat sink', 'Shed 2 more heat each round, a rank'], S: [['Redline', 'Once a fight, act twice when very hot'], ['Thermal tolerance', 'Running hot hurts you far less']], E: ['Deep cooling', 'Running hot hurts a little less, every time'] },
  { name: 'Subroutines', color: '#f0524f', bead: '+1% damage', N: ['Flank logic', 'Side and back hits land harder still'], B: ['Fourth slot', 'A fourth action slot on your fight bar'], S: [['Finisher', '+25% on badly hurt enemies'], ['Clean first strike', 'Your first attack each fight lands in full']], E: ['Sharper', '+1% damage, every time'] },
  { name: 'Grafting', color: '#a58bff', bead: '+2% structure', N: ['Clean interface', 'Implant health costs are halved'], B: ['Reinforced housings', '+10% structure a rank'], S: [['Salvage instinct', 'Wake with an implant'], ['Self-repair', 'Brace repairs far more']], E: ['Denser housings', '+1% structure, every time'] },
  { name: 'Network', color: '#5fe0a8', bead: '+3% ally health', N: ['Handshake', 'Allies start with 25% more health'], B: ['Shared memory', 'Allies level faster, a rank'], S: [['Coordinated', '+20% on enemies your ally hit'], ['Stand together', 'Allies get up a round sooner']], E: ['Closer link', '+1% ally health, every time'] },
  { name: 'Locomotion', color: '#7fa8ff', bead: 'Hazards hurt a little less', N: ['Sure footing', 'Hazards hurt half as much'], B: ['Gait calibration', '+1 movement a rank'], S: [['Hit and fade', 'Step a tile after attacking while warm'], ['Sidestep', 'The first heavy each fight misses']], E: ['Lighter step', 'Parting blows hurt a little less, every time'] },
];
// Where two strands meet: a neuron that belongs to both, reached from either
const JOIN = [['Cold blood', 'End a turn cool and mend a little'], ['Hot hands', 'Hit harder the hotter you run'], ['Kinship', 'Implant moves hit a little harder'], ['Shared parts', 'Allies wear your implants better'], ['Cover step', 'Moving beside an ally guards you both'], ['Slip away', 'Stepping out of reach mends a little']];
const LOCKED = 4, TAUGHT = 1, POINTS = 3, G = 160, C = 80, RING = 73;
const pol = (r: number, deg: number) => ({ x: Math.round(C + Math.cos(deg * Math.PI / 180) * r), y: Math.round(C + Math.sin(deg * Math.PI / 180) * r) });

const NODES: Node[] = []; const EDGES: [string, string][] = [];
STRANDS.forEach((s, b) => {
  const a = -90 + b * 60, add = (id: string, kind: Kind, r: number, deg: number, name: string, effect: string, extra: Partial<Node> = {}) => NODES.push({ id: `${b}${id}`, kind, b, ...pol(r, deg), name, effect, ...extra });
  add('b1', 'b', 14, a, 'A small memory', s.bead);
  add('N', 'N', 24, a, s.N[0], s.N[1]);
  add('b2', 'b', 32, a, 'A small memory', s.bead); add('b3', 'b', 39, a, 'A small memory', s.bead);
  add('B', 'B', 48, a, s.B[0], s.B[1], { ranks: b === 2 ? 1 : 3 });
  add('S0', 'S', 57, a - 11, s.S[0][0], s.S[0][1], { parent: `${b}B` }); add('S1', 'S', 57, a + 11, s.S[1][0], s.S[1][1], { parent: `${b}B` });
  add('E', 'E', 66, a, s.E[0], s.E[1]);
  add('fR', 'b', 31, a + 17, 'A small memory', s.bead); add('fL', 'b', 31, a - 17, 'A small memory', s.bead);
  NODES.push({ id: `J${b}`, kind: 'J', b, b2: (b + 1) % 6, ...pol(41, a + 30), name: JOIN[b][0], effect: JOIN[b][1] });
  EDGES.push(['core', `${b}b1`], [`${b}b1`, `${b}N`], [`${b}N`, `${b}b2`], [`${b}b2`, `${b}b3`], [`${b}b3`, `${b}B`], [`${b}B`, `${b}S0`], [`${b}B`, `${b}S1`], [`${b}B`, `${b}E`],
    [`${b}N`, `${b}fR`], [`${b}fR`, `J${b}`], [`${b}N`, `${b}fL`], [`${b}fL`, `J${(b + 5) % 6}`]);
});
// What this signal has kept so far
const LIT = new Set(['0b1', '0N', '0b2', '0b3', '0B', '0fR', '1b1', '1N', '1b2', '1b3', '1B', '2b1', '2N', '2b2', '5b1']);
const RANK: Record<string, number> = { '0B': 3, '1B': 1 };
const byId = new Map(NODES.map(n => [n.id, n]));
const maxed = (id: string) => (RANK[id] ?? (LIT.has(id) ? 1 : 0)) >= (byId.get(id)?.ranks ?? 1);
const full = (n: Node) => LIT.has(n.id) && maxed(n.id);
const locked = (n: Node) => n.b === LOCKED && n.kind !== 'J';
function open(n: Node): boolean {
  if (locked(n) || full(n)) return false;
  if (LIT.has(n.id)) return true; // ranks left to take
  if (n.kind === 'S') return maxed(n.parent!) && LIT.has(n.parent!);
  return EDGES.some(([p, q]) => (q === n.id && (p === 'core' || LIT.has(p))) || (p === n.id && LIT.has(q) && byId.get(q)!.kind !== 'S'));
}
const colorOf = (n: Node) => STRANDS[n.b].color;

function Net({ size, sel, onSelect, pulseIn }: { size: number; sel: string | null; onSelect: (id: string) => void; pulseIn?: boolean }) {
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
      for (let a = 0; a < 360; a += 3) if (Math.floor(a / 3) % 2) { const p = pol(RING, a); px(p.x, p.y, '#3a4452', 0.9); }
      for (let b = 0; b < 6; b++) for (const r of [76, 79]) { const p = pol(r, -90 + b * 60); px(p.x, p.y, '#3a4452', 0.9); }
      // Synapses
      for (const [p, q] of EDGES) {
        const A = p === 'core' ? { x: C, y: C } : byId.get(p)!, B = byId.get(q)!;
        const lit = (p === 'core' || LIT.has(p)) && LIT.has(q);
        const spec = B.kind === 'S';
        if (lit) line(A, B, colorOf(p === 'core' ? B : byId.get(p)!.kind === 'J' ? B : byId.get(p)!), 0.95);
        else line(A, B, '#2f3947', locked(B) ? 0.5 : 1, spec ? 2 : 1);
      }
      // Neurons
      for (const n of NODES) {
        const col = colorOf(n), lit = LIT.has(n.id), can = open(n), dim = locked(n);
        const edge = can ? (n.b === TAUGHT || n.b2 === TAUGHT ? '#5fe0a8' : '#f2b33d') : '#5b6676';
        const beat = 0.55 + 0.45 * Math.sin(t / 280 + n.x);
        if (n.kind === 'b') {
          if (lit) { dot(n.x, n.y, 1, '#0b1119', 1); dot(n.x, n.y, 1, col, 1); px(n.x, n.y, '#ffffff', 0.9); }
          else if (can) { dot(n.x, n.y, 3, edge, 0.18 * beat); dot(n.x, n.y, 1, '#0b1119', 1); ring(n.x, n.y, 2, edge, 0.6 + 0.4 * beat); }
          else { dot(n.x, n.y, 1, '#0b1119', 1); ring(n.x, n.y, 1, '#5b6676', dim ? 0.35 : 0.8); }
          continue;
        }
        const r = n.kind === 'B' ? 4 : n.kind === 'S' ? 2 : 3;
        const c2 = n.kind === 'J' ? STRANDS[n.b2!].color : undefined;
        if (lit) { dot(n.x, n.y, r + 1, col, 0.18); dot(n.x, n.y, r, col, 1, c2); px(n.x - 1, n.y - 1, '#ffffff', 0.8); if (can) ring(n.x, n.y, r + 1, edge, 0.5 + 0.5 * beat); }
        else {
          if (can) dot(n.x, n.y, r + 2, edge, 0.16 * beat);
          dot(n.x, n.y, r, '#0b1119', 1); ring(n.x, n.y, r, edge, can ? 0.6 + 0.4 * beat : dim ? 0.4 : 0.85);
          px(n.x, n.y, col, dim ? 0.4 : 0.9); if (c2) px(n.x + 1, n.y, c2, 0.9);
        }
        if (n.kind === 'E') ring(n.x, n.y, r + 2, '#5b6676', dim ? 0.3 : 0.6);
        if (n.id === '2B') { ctx.globalAlpha = 1; ctx.fillStyle = '#e8f4ff'; ctx.fillRect(n.x - 1, n.y - 1, 3, 2); }
        // Ranks: a pip each, under the neuron
        if ((n.ranks ?? 1) > 1) for (let k = 0; k < n.ranks!; k++) px(n.x - (n.ranks! - 1) + k * 2, n.y + r + 2, k < (RANK[n.id] ?? 0) ? '#ffffff' : '#5b6676', 1);
        if (n.id === sel) for (const [sx, sy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) { px(n.x + sx * 7, n.y + sy * 7, '#fff'); px(n.x + sx * 6, n.y + sy * 7, '#fff'); px(n.x + sx * 7, n.y + sy * 6, '#fff'); }
      }
      const beat = 0.6 + 0.4 * Math.sin(t / 500);
      dot(C, C, 10, '#f2b33d', 0.1 * beat); dot(C, C, 8, '#0d1a22', 1); ring(C, C, 8, '#f2b33d', 0.95);
      if (pulseIn) { const k = (t / 1400) % 1; dot(C, Math.round(C - 9 - 60 * (1 - k)), 1, '#fff6d0', 1); }
      ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.font = `600 ${Math.round(scale * 4.6)}px Manrope, sans-serif`; ctx.textBaseline = 'middle';
      STRANDS.forEach((s, b) => {
        const a = (-90 + b * 60) * Math.PI / 180, cx0 = Math.cos(a), sy0 = Math.sin(a);
        ctx.globalAlpha = b === LOCKED ? 0.4 : 0.9; ctx.fillStyle = s.color;
        ctx.textAlign = Math.abs(cx0) < 0.1 ? 'center' : cx0 > 0 ? 'right' : 'left';
        ctx.fillText(s.name, (Math.abs(cx0) < 0.1 ? C : cx0 > 0 ? G - 1 : 1) * scale, (Math.abs(cx0) < 0.1 ? (sy0 < 0 ? 4 : G - 4) : C + sy0 * 88) * scale);
      });
      ctx.globalAlpha = 1;
      raf = requestAnimationFrame(draw);
    };
    draw();
    return () => cancelAnimationFrame(raf);
  }, [size, sel, pulseIn]);
  const tap = (e: React.MouseEvent) => {
    const r = (e.target as HTMLElement).getBoundingClientRect();
    const x = ((e.clientX - r.left) / r.width) * G, y = ((e.clientY - r.top) / r.height) * G;
    const hit = NODES.map(n => ({ n, d: Math.hypot(n.x - x, n.y - y) })).sort((a, b) => a.d - b.d)[0];
    if (hit && hit.d < 7) onSelect(hit.n.id);
  };
  return (
    <div style={{ width: size, height: size }} className="relative mx-auto">
      <canvas ref={ref} onClick={tap} style={{ width: size, height: size, imageRendering: 'pixelated' }} />
      <div className="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 font-display text-[19px] font-bold leading-none text-cred drop-shadow-[0_0_8px_rgba(242,179,61,0.8)]">{POINTS}</div>
    </div>
  );
}

function Detail({ id, death }: { id: string; death?: boolean }) {
  const n = byId.get(id)!; const can = open(n), have = RANK[n.id] ?? (LIT.has(n.id) ? 1 : 0), ranks = n.ranks ?? 1;
  const kids = NODES.filter(m => m.parent === n.id);
  return (
    <div className="slab space-y-2 rounded-3xl px-4 py-3">
      <div className="flex items-center gap-3">
        <span className="flex shrink-0">
          <span className="h-3 w-3 rounded-full" style={{ background: colorOf(n), boxShadow: `0 0 8px ${colorOf(n)}` }} />
          {n.kind === 'J' && <span className="-ml-1 h-3 w-3 rounded-full" style={{ background: STRANDS[n.b2!].color }} />}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline gap-2">
            <span className="font-display text-[15px] font-semibold text-white">{n.name}</span>
            {ranks > 1 && <span className="text-[12px] text-hud-dim">{have} / {ranks}</span>}
            {n.kind === 'E' && <span className="text-[12px] text-hud-dim">0 / 10</span>}
          </div>
          <div className="text-[13px] leading-snug text-hud-text">{n.effect}</div>
          {can && death && (n.b === TAUGHT) && <div className="text-[12px] font-semibold text-ok">This host taught it: the next step comes with it</div>}
        </div>
        {can ? <Btn variant="primary" size="sm" className="shrink-0">Learn</Btn>
          : full(n) ? <span className="shrink-0 text-[12px] font-semibold" style={{ color: colorOf(n) }}>Kept</span>
          : <span className="shrink-0 text-[12px] text-hud-faint">{locked(n) ? 'No one to link' : n.kind === 'S' ? 'Fill it first' : 'Not yet'}</span>}
      </div>
      {kids.length > 0 && (
        <div className="flex gap-2 border-t border-white/[0.06] pt-2">
          {kids.map(k => (
            <div key={k.id} className="min-w-0 flex-1 rounded-2xl bg-white/[0.04] px-3 py-2" style={{ opacity: full(n) ? 1 : 0.5 }}>
              <div className="truncate text-[12px] font-semibold text-white">{k.name}</div>
              <div className="text-[11px] leading-snug text-hud-dim">{k.effect}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

const Wallet = ({ gained }: { gained?: boolean }) => (
  <div className="flex items-center justify-center gap-2 text-[13px]">
    <span className="font-display text-[15px] font-bold text-cred">{POINTS}</span>
    <span className="text-hud-dim">to spend{gained ? ' · 1 from this host' : ''}</span>
  </div>
);

export function MockTree() {
  const [sel, setSel] = useState<string | null>('0B');
  return (
    <Screen>
      <div className="space-y-3 px-4 pb-8 pt-6">
        <div className="flex items-center gap-3">
          <span className="key flex h-10 w-10 items-center justify-center rounded-2xl"><Glyph name="back" size={16} /></span>
          <h1 className="flex-1 font-display text-[22px] font-semibold text-white">Memory</h1>
        </div>
        <Net size={358} sel={sel} onSelect={setSel} />
        <Wallet />
        {sel && <Detail id={sel} />}
      </div>
    </Screen>
  );
}

export function MockDeath() {
  const [sel, setSel] = useState<string | null>('1B');
  return (
    <Screen footer={<Btn variant="primary" size="lg" className="w-full">Wake</Btn>}>
      <div className="space-y-3 px-4 pb-6 pt-10">
        <header className="flex flex-col items-center gap-2 text-center">
          <h1 className="font-display text-[38px] font-bold leading-none tracking-tight text-white drop-shadow-[0_0_24px_rgba(240,82,79,0.35)]">Host lost</h1>
          <p className="text-[14px] text-hostile">Cartel Enforcer</p>
        </header>
        <Net size={358} sel={sel} onSelect={setSel} pulseIn />
        <Wallet gained />
        {sel && <Detail id={sel} death />}
      </div>
    </Screen>
  );
}
