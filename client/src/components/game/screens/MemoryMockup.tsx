// MOCKUP ONLY (not wired to the game): the memory as a neural network, for screenshots.
// v3: one death = one point = one step along a strand. Small beads between the big neurons,
// an endless neuron at each strand's end, and a ring that opens with each chapter.
import { useEffect, useRef, useState } from 'react';
import { Screen, Btn, Glyph, cx } from '../hud';

type Kind = 'b' | 'N' | 'B' | 'E';
const CHAIN: Kind[] = ['b', 'b', 'N', 'b', 'b', 'b', 'B', 'b', 'E'];
const RAD = [13, 18, 25, 32, 37, 42, 50, 57, 64];
const RING = 71; // where this chapter's ring ends
const BRANCH = [
  { name: 'Signal', color: '#38d6f0', have: 4, bead: '+3 max health', N: ['Supplies', 'Wake with 2 Bio-Stims; 20% off at the Grey Lane'], B: ['Holdfast', 'Once a host, a killing blow leaves you on 1'], E: ['Deep signal', '+2 max health, every time'] },
  { name: 'Processing', color: '#ff8a4c', have: 3, bead: 'Shed a little more heat each round', N: ['Set point', 'Start each fight cold (0) or warm (50)'], B: ['Redline', 'Once a fight, act twice when very hot'], E: ['Deep cooling', 'Running hot hurts a little less, every time'] },
  { name: 'Subroutines', color: '#f0524f', have: 6, bead: '+1% damage', N: ['Flank logic', 'Side and back hits land harder still'], B: ['Fourth slot', 'A fourth action slot on your fight bar'], E: ['Sharper', '+1% damage, every time'] },
  { name: 'Grafting', color: '#a58bff', have: 0, bead: '+2% structure', N: ['Clean interface', 'Implant health costs are halved'], B: ['Salvage instinct', 'Wake with an implant'], E: ['Denser housings', '+1% structure, every time'] },
  { name: 'Network', color: '#5fe0a8', have: 0, bead: '+3% ally health', N: ['Handshake', 'Allies start with 25% more health'], B: ['Coordinated', '+20% on enemies your ally hit'], E: ['Closer link', '+1% ally health, every time'], locked: true },
  { name: 'Locomotion', color: '#7fa8ff', have: 1, bead: 'Hazards hurt a little less', N: ['Sure footing', 'Hazards hurt half as much'], B: ['Gait calibration', '+1 movement'], E: ['Lighter step', 'Parting blows hurt a little less, every time'] },
];
const TAUGHT = 1; // the strand the last death taught (Processing): its next step lights two
const G = 160, C = 80, POINTS = 3;
const angle = (b: number) => (-90 + b * 60) * Math.PI / 180;
const at = (b: number, k: number) => ({ x: Math.round(C + Math.cos(angle(b)) * RAD[k]), y: Math.round(C + Math.sin(angle(b)) * RAD[k]) });

function Net({ size, sel, onSelect, pulseIn }: { size: number; sel: [number, number] | null; onSelect: (s: [number, number]) => void; pulseIn?: boolean }) {
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
      const dot = (x: number, y: number, r: number, c: string, a = 1) => { for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) if (dx * dx + dy * dy <= r * r + 1) px(x + dx, y + dy, c, a); };
      const ring = (x: number, y: number, r: number, c: string, a = 1) => { for (let dy = -r - 1; dy <= r + 1; dy++) for (let dx = -r - 1; dx <= r + 1; dx++) if (Math.abs(Math.sqrt(dx * dx + dy * dy) - r) < 0.6) px(x + dx, y + dy, c, a); };
      const line = (a: { x: number; y: number }, b: { x: number; y: number }, c: string, alpha: number, every = 1) => {
        const n = Math.max(Math.abs(b.x - a.x), Math.abs(b.y - a.y), 1);
        for (let i = 0; i <= n; i += every) px(Math.round(a.x + ((b.x - a.x) * i) / n), Math.round(a.y + ((b.y - a.y) * i) / n), c, alpha);
      };
      // This chapter's ring, and what lies past it
      for (let a = 0; a < 360; a += 3) if (Math.floor(a / 3) % 2) px(Math.round(C + Math.cos(a * Math.PI / 180) * RING), Math.round(C + Math.sin(a * Math.PI / 180) * RING), '#3a4452', 0.9);
      // Faint links between neighbouring strands: the web
      for (let b = 0; b < 6; b++) for (const k of [2, 6]) line(at(b, k), at((b + 1) % 6, k), '#2a3340', 0.9, 2);
      BRANCH.forEach((br, b) => {
        const dim = !!br.locked;
        // The strand: lit as far as you've come
        const tip = at(b, 8), root = { x: Math.round(C + Math.cos(angle(b)) * 8), y: Math.round(C + Math.sin(angle(b)) * 8) };
        line(root, tip, '#2f3947', 1);
        if (br.have > 0) line(root, at(b, br.have - 1), br.color, 0.95);
        for (const r of [75, 78]) px(Math.round(C + Math.cos(angle(b)) * r), Math.round(C + Math.sin(angle(b)) * r), '#3a4452', 0.9);
        CHAIN.forEach((kind, k) => {
          const p = at(b, k), lit = k < br.have, next = k === br.have && !dim;
          const edge = next ? (b === TAUGHT ? '#5fe0a8' : '#f2b33d') : '#5b6676';
          const beat = 0.55 + 0.45 * Math.sin(t / 280 + b);
          if (kind === 'b') {
            if (lit) dot(p.x, p.y, 1, br.color, 1);
            else if (next) { dot(p.x, p.y, 3, edge, 0.18 * beat); dot(p.x, p.y, 1, '#0b1119', 1); ring(p.x, p.y, 2, edge, 0.6 + 0.4 * beat); }
            else { dot(p.x, p.y, 1, '#0b1119', 1); px(p.x, p.y, '#5b6676', dim ? 0.5 : 1); }
            return;
          }
          const r = kind === 'B' ? 4 : 3;
          if (lit) { dot(p.x, p.y, r + 1, br.color, 0.18); dot(p.x, p.y, r, br.color, 1); px(p.x - 1, p.y - 1, '#ffffff', 0.8); }
          else { if (next) dot(p.x, p.y, r + 2, edge, 0.16 * beat); dot(p.x, p.y, r, '#0b1119', 1); ring(p.x, p.y, r, edge, next ? 0.6 + 0.4 * beat : dim ? 0.45 : 0.85); px(p.x, p.y, br.color, dim ? 0.4 : 0.9); }
          if (kind === 'E') ring(p.x, p.y, r + 2, lit ? br.color : '#5b6676', dim ? 0.3 : 0.6); // endless: a second ring
          if (kind === 'B' && b === 2) { ctx.globalAlpha = 1; ctx.fillStyle = '#e8f4ff'; ctx.fillRect(p.x - 1, p.y - 1, 3, 2); }
        });
        if (sel && sel[0] === b) { const p = at(b, sel[1]); for (const [sx, sy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) { px(p.x + sx * 7, p.y + sy * 7, '#fff'); px(p.x + sx * 6, p.y + sy * 7, '#fff'); px(p.x + sx * 7, p.y + sy * 6, '#fff'); } }
      });
      // The core: the signal, holding what it has to spend
      const beat = 0.6 + 0.4 * Math.sin(t / 500);
      dot(C, C, 10, '#f2b33d', 0.1 * beat); dot(C, C, 8, '#0d1a22', 1); ring(C, C, 8, '#f2b33d', 0.95);
      if (pulseIn) { const k = (t / 1400) % 1; dot(C, Math.round(C - 9 - 60 * (1 - k)), 1, '#fff6d0', 1); }
      // Strand names at the rim
      ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.font = `600 ${Math.round(scale * 4.6)}px Manrope, sans-serif`; ctx.textBaseline = 'middle';
      BRANCH.forEach((br, b) => {
        const cx0 = Math.cos(angle(b)), sy0 = Math.sin(angle(b));
        ctx.globalAlpha = br.locked ? 0.4 : 0.9; ctx.fillStyle = br.color;
        ctx.textAlign = Math.abs(cx0) < 0.1 ? 'center' : cx0 > 0 ? 'right' : 'left';
        const x = Math.abs(cx0) < 0.1 ? C : cx0 > 0 ? G - 1 : 1, y = Math.abs(cx0) < 0.1 ? (sy0 < 0 ? 4 : G - 4) : C + sy0 * 86;
        ctx.fillText(br.name, x * scale, y * scale);
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
    let best: [number, number] | null = null, bd = 7;
    BRANCH.forEach((_, b) => CHAIN.forEach((__, k) => { const p = at(b, k), d = Math.hypot(p.x - x, p.y - y); if (d < bd) { bd = d; best = [b, k]; } }));
    if (best) onSelect(best);
  };
  return (
    <div style={{ width: size, height: size }} className="relative mx-auto">
      <canvas ref={ref} onClick={tap} style={{ width: size, height: size, imageRendering: 'pixelated' }} />
      {/* What you have to spend, in the core */}
      <div className="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 font-display text-[19px] font-bold leading-none text-cred drop-shadow-[0_0_8px_rgba(242,179,61,0.8)]">{POINTS}</div>
    </div>
  );
}

function Detail({ sel, death }: { sel: [number, number]; death?: boolean }) {
  const [b, k] = sel; const br = BRANCH[b], kind = CHAIN[k];
  const [name, effect] = kind === 'b' ? ['A small memory', br.bead] : br[kind as 'N' | 'B' | 'E'];
  const lit = k < br.have, next = k === br.have && !br.locked, away = k - br.have;
  return (
    <div className="slab flex items-center gap-3 rounded-3xl px-4 py-3">
      <span className="h-3 w-3 shrink-0 rounded-full" style={{ background: br.color, boxShadow: `0 0 8px ${br.color}` }} />
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline gap-2">
          <span className="font-display text-[15px] font-semibold text-white">{name}</span>
          {kind === 'E' && <span className="text-[12px] text-hud-dim">0 / 10</span>}
        </div>
        <div className="text-[13px] leading-snug text-hud-text">{effect}</div>
        {next && b === TAUGHT && death && <div className="text-[12px] font-semibold text-ok">This host taught it: the next step comes with it</div>}
      </div>
      {lit ? <span className="shrink-0 text-[12px] font-semibold" style={{ color: br.color }}>Kept</span>
        : next ? <Btn variant="primary" size="sm" className="shrink-0">Learn</Btn>
        : <span className="shrink-0 text-right text-[12px] leading-tight text-hud-faint">{br.locked ? 'No one to link' : `${away} more\nto reach`}</span>}
    </div>
  );
}

function Wallet({ gained }: { gained?: boolean }) {
  return (
    <div className="flex items-center justify-center gap-2 text-[13px]">
      <span className="font-display text-[15px] font-bold text-cred">{POINTS}</span>
      <span className="text-hud-dim">to spend{gained ? ' · 1 from this host' : ''}</span>
    </div>
  );
}

export function MockTree() {
  const [sel, setSel] = useState<[number, number] | null>([2, 6]);
  return (
    <Screen>
      <div className="space-y-3 px-4 pb-8 pt-6">
        <div className="flex items-center gap-3">
          <span className="key flex h-10 w-10 items-center justify-center rounded-2xl"><Glyph name="back" size={16} /></span>
          <h1 className="flex-1 font-display text-[22px] font-semibold text-white">Memory</h1>
        </div>
        <Net size={358} sel={sel} onSelect={setSel} />
        <Wallet />
        {sel && <Detail sel={sel} />}
      </div>
    </Screen>
  );
}

export function MockDeath() {
  const [sel, setSel] = useState<[number, number] | null>([1, 3]);
  return (
    <Screen footer={<Btn variant="primary" size="lg" className="w-full">Wake</Btn>}>
      <div className={cx('space-y-3 px-4 pb-6 pt-10')}>
        <header className="flex flex-col items-center gap-2 text-center">
          <h1 className="font-display text-[38px] font-bold leading-none tracking-tight text-white drop-shadow-[0_0_24px_rgba(240,82,79,0.35)]">Host lost</h1>
          <p className="text-[14px] text-hostile">Cartel Enforcer</p>
        </header>
        <Net size={358} sel={sel} onSelect={setSel} pulseIn />
        <Wallet gained />
        {sel && <Detail sel={sel} death />}
      </div>
    </Screen>
  );
}
