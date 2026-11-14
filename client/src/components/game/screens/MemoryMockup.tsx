// MOCKUP ONLY (not wired to the game): the memory as a neural network, for screenshots.
import { useEffect, useRef, useState } from 'react';
import { Screen, Btn, Glyph, cx } from '../hud';

type St = 'owned' | 'open' | 'seen' | 'fog';
interface Neuron { id: string; b: number; tier: number; name: string; effect: string; cost: number[]; ranks: number; have: number; st: St; slot?: boolean }

const BRANCH = [
  { name: 'Signal', color: '#38d6f0' },
  { name: 'Processing', color: '#ff8a4c' },
  { name: 'Subroutines', color: '#f0524f' },
  { name: 'Grafting', color: '#a58bff' },
  { name: 'Network', color: '#5fe0a8' },
  { name: 'Locomotion', color: '#7fa8ff' },
];
const N: Neuron[] = [
  { id: 'hp', b: 0, tier: 1, name: 'Signal strength', effect: '+15 max health a rank', cost: [1, 1, 2, 2, 3], ranks: 5, have: 2, st: 'owned' },
  { id: 'sup', b: 0, tier: 2, name: 'Supplies', effect: 'Wake with 2 Bio-Stims; 20% off at the Grey Lane', cost: [1], ranks: 1, have: 0, st: 'open' },
  { id: 'hold', b: 0, tier: 2, name: 'Holdfast', effect: 'Once a host, a killing blow leaves you on 1', cost: [2], ranks: 1, have: 0, st: 'open' },
  { id: 'hard', b: 0, tier: 3, name: 'Hardened signal', effect: '10% less damage from everything', cost: [3], ranks: 1, have: 0, st: 'seen' },
  { id: 'sink', b: 1, tier: 1, name: 'Heat sink', effect: 'Shed 2 more heat each round, a rank', cost: [1, 2, 2], ranks: 3, have: 1, st: 'owned' },
  { id: 'set', b: 1, tier: 2, name: 'Set point', effect: 'Start each fight cold (0) or warm (50)', cost: [1], ranks: 1, have: 0, st: 'open' },
  { id: 'tol', b: 1, tier: 2, name: 'Thermal tolerance', effect: 'Running hot hurts you far less', cost: [2], ranks: 1, have: 0, st: 'open' },
  { id: 'red', b: 1, tier: 3, name: 'Redline', effect: 'Once a fight, act twice when very hot', cost: [2], ranks: 1, have: 0, st: 'seen' },
  { id: 'run', b: 1, tier: 4, name: 'Runaway', effect: '', cost: [3], ranks: 1, have: 0, st: 'fog' },
  { id: 'aim', b: 2, tier: 1, name: 'Targeting', effect: '+5% damage a rank', cost: [1, 2, 2, 3], ranks: 4, have: 1, st: 'owned' },
  { id: 's4', b: 2, tier: 2, name: 'Fourth slot', effect: 'A fourth action slot on your fight bar', cost: [2], ranks: 1, have: 0, st: 'open', slot: true },
  { id: 'flank', b: 2, tier: 2, name: 'Flank logic', effect: 'Side and back hits land harder still', cost: [1], ranks: 1, have: 0, st: 'open' },
  { id: 's5', b: 2, tier: 3, name: 'Fifth slot', effect: 'A fifth action slot', cost: [3], ranks: 1, have: 0, st: 'seen', slot: true },
  { id: 'fin', b: 2, tier: 4, name: 'Finisher', effect: '', cost: [2], ranks: 1, have: 0, st: 'fog' },
  { id: 's6', b: 2, tier: 5, name: 'Sixth slot', effect: '', cost: [3], ranks: 1, have: 0, st: 'fog', slot: true },
  { id: 'ci', b: 3, tier: 1, name: 'Clean interface', effect: 'Implant health costs are halved', cost: [1], ranks: 1, have: 0, st: 'open' },
  { id: 'rh', b: 3, tier: 2, name: 'Reinforced housings', effect: '+10% structure a rank', cost: [1, 2, 2], ranks: 3, have: 0, st: 'seen' },
  { id: 'sal', b: 3, tier: 2, name: 'Salvage instinct', effect: 'Wake with an implant', cost: [2], ranks: 1, have: 0, st: 'seen' },
  { id: 'gm', b: 3, tier: 3, name: 'Graft memory', effect: '', cost: [2], ranks: 1, have: 0, st: 'fog' },
  { id: 'hs', b: 4, tier: 1, name: 'Handshake', effect: 'Allies start with 25% more health', cost: [1], ranks: 1, have: 0, st: 'open' },
  { id: 'sm', b: 4, tier: 2, name: 'Shared memory', effect: 'Allies level twice as fast', cost: [1], ranks: 1, have: 0, st: 'seen' },
  { id: 'co', b: 4, tier: 3, name: 'Coordinated', effect: '', cost: [2], ranks: 1, have: 0, st: 'fog' },
  { id: 'gait', b: 5, tier: 1, name: 'Gait calibration', effect: '+1 movement a rank', cost: [2, 3], ranks: 2, have: 0, st: 'open' },
  { id: 'fade', b: 5, tier: 2, name: 'Hit and fade', effect: 'Step a tile after attacking while warm', cost: [2], ranks: 1, have: 0, st: 'seen' },
  { id: 'foot', b: 5, tier: 2, name: 'Sure footing', effect: 'Hazards hurt half as much', cost: [1], ranks: 1, have: 0, st: 'seen' },
  { id: 'side', b: 5, tier: 3, name: 'Sidestep', effect: '', cost: [2], ranks: 1, have: 0, st: 'fog' },
];
const DISCOUNT = 1; // the branch the last death taught (Processing)

/** Where each neuron sits: branches radiate from the core, tiers step outward, siblings fan apart. */
function layout(cx: number, cy: number, step: number) {
  const pos = new Map<string, { x: number; y: number }>();
  for (const n of N) {
    const sib = N.filter(m => m.b === n.b && m.tier === n.tier), k = sib.indexOf(n);
    const a = (-90 + n.b * 60) * Math.PI / 180 + (k - (sib.length - 1) / 2) * (0.5 / Math.max(1, n.tier * 0.6));
    const r = Math.min(56, 6 + step * n.tier);
    pos.set(n.id, { x: Math.round(cx + Math.cos(a) * r), y: Math.round(cy + Math.sin(a) * r) });
  }
  return pos;
}
const parents = (n: Neuron) => (n.tier === 1 ? ['core'] : N.filter(m => m.b === n.b && m.tier === n.tier - 1).map(m => m.id));

function Net({ size, selected, onSelect, pulseIn }: { size: number; selected: string | null; onSelect: (id: string) => void; pulseIn?: boolean }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const G = 128; // the net is drawn on a 128x128 pixel grid, scaled up crisp
  useEffect(() => {
    const cv = ref.current!; const ctx = cv.getContext('2d')!;
    const scale = Math.floor((size * (window.devicePixelRatio || 1)) / G);
    cv.width = G * scale; cv.height = G * scale;
    const pos = layout(64, 64, 13);
    let raf = 0;
    const draw = () => {
      const t = performance.now();
      ctx.setTransform(scale, 0, 0, scale, 0, 0); ctx.imageSmoothingEnabled = false;
      ctx.clearRect(0, 0, G, G);
      const px = (x: number, y: number, c: string, a = 1) => { ctx.globalAlpha = a; ctx.fillStyle = c; ctx.fillRect(x, y, 1, 1); };
      const dot = (x: number, y: number, r: number, c: string, a = 1) => { for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) if (dx * dx + dy * dy <= r * r + 1) px(x + dx, y + dy, c, a); };
      const ring = (x: number, y: number, r: number, c: string, a = 1) => { for (let dy = -r - 1; dy <= r + 1; dy++) for (let dx = -r - 1; dx <= r + 1; dx++) { const d = Math.sqrt(dx * dx + dy * dy); if (Math.abs(d - r) < 0.6) px(x + dx, y + dy, c, a); } };
      // Synapses: lit where both ends are kept; a travelling spark toward what can be learned; faint dots toward what's seen
      const line = (a: { x: number; y: number }, b: { x: number; y: number }, c: string, alpha: number, every = 1, flow = 0) => {
        const n = Math.max(Math.abs(b.x - a.x), Math.abs(b.y - a.y));
        for (let i = 0; i <= n; i++) {
          if (i % every) continue;
          const x = Math.round(a.x + ((b.x - a.x) * i) / n), y = Math.round(a.y + ((b.y - a.y) * i) / n);
          px(x, y, c, alpha);
          if (flow && Math.abs(i - ((t / 60) % (n + 8))) < 1.5) px(x, y, '#fff6d0', 0.95);
        }
      };
      const core = { x: 64, y: 64 };
      for (const n of N) {
        if (n.st === 'fog') continue;
        for (const pid of parents(n)) {
          const a = pid === 'core' ? core : pos.get(pid)!, b = pos.get(n.id)!;
          const col = BRANCH[n.b].color;
          if (n.st === 'owned') line(a, b, col, 0.9);
          else if (n.st === 'open') line(a, b, n.b === DISCOUNT ? '#5fe0a8' : '#f2b33d', 0.55, 1, 1);
          else line(a, b, '#5b6676', 0.45, 2);
        }
      }
      // Neurons
      for (const n of N) {
        const p = pos.get(n.id)!, col = BRANCH[n.b].color;
        if (n.st === 'fog') { px(p.x, p.y, '#3a4452', 0.9); continue; }
        if (n.st === 'owned') {
          dot(p.x, p.y, 4, col, 0.18); dot(p.x, p.y, 3, col, 1); px(p.x, p.y, '#ffffff', 0.9); px(p.x - 1, p.y - 1, '#ffffff', 0.6);
        } else if (n.st === 'open') {
          const beat = 0.55 + 0.45 * Math.sin(t / 300 + n.b);
          dot(p.x, p.y, 4, n.b === DISCOUNT ? '#5fe0a8' : '#f2b33d', 0.12 * beat); dot(p.x, p.y, 3, '#0b1119', 1); ring(p.x, p.y, 3, n.b === DISCOUNT ? '#5fe0a8' : '#f2b33d', 0.6 + 0.4 * beat);
          px(p.x, p.y, col, 0.9);
        } else { dot(p.x, p.y, 2, '#0b1119', 1); ring(p.x, p.y, 2, '#5b6676', 0.8); }
        if (n.slot) { ctx.globalAlpha = 1; ctx.fillStyle = '#e8f4ff'; ctx.fillRect(p.x - 1, p.y - 1, 3, 2); }
        // Repeatable: a pip per rank around it, lit for those taken
        if (n.ranks > 1) for (let k = 0; k < n.ranks; k++) {
          const x = p.x - (n.ranks - 1) + k * 2, y = p.y + 6;
          px(x, y, k < n.have ? '#ffffff' : '#5b6676', k < n.have ? 1 : 0.8);
        }
        if (n.id === selected) { const c = '#ffffff'; for (const [sx, sy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) { px(p.x + sx * 6, p.y + sy * 6, c); px(p.x + sx * 5, p.y + sy * 6, c); px(p.x + sx * 6, p.y + sy * 5, c); } }
      }
      // The core: the signal itself, its unspent memory orbiting it
      const beat = 0.6 + 0.4 * Math.sin(t / 500);
      dot(64, 64, 7, '#38d6f0', 0.12 * beat); dot(64, 64, 5, '#0d2a33', 1); ring(64, 64, 5, '#38d6f0', 0.9); dot(64, 64, 2, '#bff4ff', beat);
      for (let k = 0; k < 3; k++) { const a = t / 900 + (k * Math.PI * 2) / 3; dot(Math.round(64 + Math.cos(a) * 9), Math.round(64 + Math.sin(a) * 9), 1, '#f2b33d', 1); }
      if (pulseIn) { const k = ((t / 1400) % 1); const y = Math.round(64 - 56 * (1 - k)); dot(64, y, 1, '#fff6d0', 1 - k * 0.3); }
      // Branch names round the rim, in each branch's colour
      ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.globalAlpha = 0.85;
      ctx.font = `600 ${Math.round(scale * 4.2)}px Manrope, sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      BRANCH.forEach((b, k) => { const far = Math.max(...N.filter(n => n.b === k && n.st !== 'fog').map(n => n.tier)); const a = (-90 + k * 60) * Math.PI / 180, r = Math.min(58, 6 + 13 * far + 11); ctx.fillStyle = b.color; ctx.fillText(b.name, (64 + Math.cos(a) * r) * scale, (64 + Math.sin(a) * r) * scale); });
      ctx.globalAlpha = 1;
      raf = requestAnimationFrame(draw);
    };
    draw();
    return () => cancelAnimationFrame(raf);
  }, [size, selected, pulseIn]);
  const tap = (e: React.MouseEvent) => {
    const r = (e.target as HTMLElement).getBoundingClientRect();
    const x = ((e.clientX - r.left) / r.width) * G, y = ((e.clientY - r.top) / r.height) * G;
    const pos = layout(64, 64, 13);
    const hit = N.filter(n => n.st !== 'fog').map(n => ({ n, d: Math.hypot(pos.get(n.id)!.x - x, pos.get(n.id)!.y - y) })).sort((a, b) => a.d - b.d)[0];
    if (hit && hit.d < 8) onSelect(hit.n.id);
  };
  return <div style={{ width: size, height: size }} className="relative mx-auto"><canvas ref={ref} onClick={tap} style={{ width: size, height: size, imageRendering: 'pixelated' }} /></div>;
}

function Pips({ n, off = 0 }: { n: number; off?: number }) {
  return <span className="flex gap-1">{Array.from({ length: n }, (_, k) => <span key={k} className={cx('h-2 w-2 rounded-full', k >= n - off ? 'bg-ok/25 ring-1 ring-ok/70' : 'bg-cred shadow-[0_0_6px_rgba(242,179,61,0.7)]')} />)}</span>;
}

/** What a tapped neuron is, and Learn. */
function Detail({ id }: { id: string }) {
  const n = N.find(m => m.id === id)!;
  const owned = n.have >= n.ranks, nextCost = n.cost[Math.min(n.have, n.cost.length - 1)];
  const off = n.b === DISCOUNT && nextCost > 1 ? 1 : 0;
  return (
    <div className="slab flex items-center gap-3 rounded-3xl px-4 py-3">
      <span className="h-3 w-3 shrink-0 rounded-full" style={{ background: BRANCH[n.b].color, boxShadow: `0 0 8px ${BRANCH[n.b].color}` }} />
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline gap-2">
          <span className="font-display text-[15px] font-semibold text-white">{n.name}</span>
          {n.ranks > 1 && <span className="text-[12px] text-hud-dim">{n.have}/{n.ranks}</span>}
        </div>
        <div className="text-[13px] leading-snug text-hud-text">{n.effect}</div>
      </div>
      {!owned && n.st === 'open' && <Btn variant="primary" size="sm" className="shrink-0 gap-2"><Pips n={nextCost} off={off} /></Btn>}
      {n.st === 'seen' && <span className="shrink-0 text-[12px] text-hud-faint">Not yet</span>}
    </div>
  );
}

/** The Memory page. */
export function MockTree() {
  const [sel, setSel] = useState<string | null>('s4');
  return (
    <Screen>
      <div className="space-y-3 px-4 pb-8 pt-6">
        <div className="flex items-center gap-3">
          <span className="key flex h-10 w-10 items-center justify-center rounded-2xl"><Glyph name="back" size={16} /></span>
          <h1 className="flex-1 font-display text-[22px] font-semibold text-white">Memory</h1>
          <Pips n={3} />
        </div>
        <Net size={358} selected={sel} onSelect={setSel} />
        {sel && <Detail id={sel} />}
      </div>
    </Screen>
  );
}

/** The death screen: the net, a new memory flowing into the core, and Wake. */
export function MockDeath() {
  const [sel, setSel] = useState<string | null>('tol');
  return (
    <Screen footer={<Btn variant="primary" size="lg" className="w-full">Wake</Btn>}>
      <div className="space-y-3 px-4 pb-6 pt-10">
        <header className="flex flex-col items-center gap-2 text-center">
          <h1 className="font-display text-[38px] font-bold leading-none tracking-tight text-white drop-shadow-[0_0_24px_rgba(240,82,79,0.35)]">Host lost</h1>
          <p className="text-[14px] text-hud-dim"><span className="text-hostile">Cartel Enforcer</span></p>
        </header>
        <Net size={358} selected={sel} onSelect={setSel} pulseIn />
        {sel && <Detail id={sel} />}
      </div>
    </Screen>
  );
}
