// MOCKUP ONLY (not wired to the game): the memory network, the firmware lanes and the zoomed-out view.
// v9: every neuron of chapter one's ring, all six firmware lanes. See docs/MEMORY-TREE-DRAFT.md.
import { useEffect, useRef, useState } from 'react';
import { Screen, Btn, Glyph, cx } from '../hud';

const COL = { signal: '#38d6f0', heat: '#ff8a4c', combat: '#f0524f', guard: '#f2f2f2', fault: '#ff5fa8', graft: '#a58bff', move: '#7fa8ff', net: '#5fe0a8', luck: '#d4e04a', fw: '#8fd0c8' } as const;
type Strand = keyof typeof COL;
type Spec = [name: string, effect: string, cost: number, have?: boolean];
interface Node { id: string; s: Strand; s2?: Strand; x: number; y: number; name: string; effect: string; cost: number; ranks: number; have: number; endless?: boolean; specs?: Spec[]; fog?: boolean; locked?: boolean }
const n = (id: string, s: Strand, x: number, y: number, name: string, effect: string, cost: number, ranks: number, have: number, specs?: Spec[], extra: Partial<Node> = {}): Node => ({ id, s, x, y, name, effect, cost, ranks, have, specs, ...extra });
const END = { endless: true };
const N: Node[] = [
  n('s1', 'signal', 66, 84, 'Signal strength', '+12 max health, a little less each rank', 1, 5, 4, [['Second wind', 'The first time each fight you drop below a third of your health, heal 5% of it per rank (3 ranks)', 1], ['Holdfast', 'Once per host, a hit that would kill you leaves you on 1 health', 3]], END),
  n('s2', 'signal', 52, 76, 'Steady pulse', 'Heal 0.5% more of your max health each turn per rank', 1, 5, 2, [['Knitting frame', 'That extra healing also repairs structure', 2]]),
  n('s3', 'signal', 60, 62, 'Thick skin', 'Take 2% less damage per rank', 1, 5, 0),
  n('s4', 'signal', 40, 64, 'Stim pouch', 'Each new host starts with 1 more Bio-Stim per rank', 1, 2, 0),
  n('s5', 'signal', 30, 52, 'Haggling', 'Market prices are 5% lower per rank', 1, 4, 0),
  n('p1', 'heat', 96, 82, 'Heat sink', 'Lose 1 more heat each round per rank', 1, 5, 5, [['Thermal tolerance', 'The extra damage you take from being hot is 20% smaller per rank (3 ranks)', 1, true]]),
  n('p2', 'heat', 112, 70, 'Cold start', 'Start fights with 4 less heat per rank', 1, 5, 1),
  n('p3', 'heat', 130, 58, 'Hot streak', '+3% crit chance per rank while at 86 heat or more', 1, 5, 0),
  n('p4', 'heat', 120, 46, 'Burnout drill', 'Overheating hurts 25% less per rank', 1, 3, 0, [['Runaway', 'Overheating no longer costs you a turn', 3]]),
  n('p5', 'heat', 147, 44, 'Redline', 'Once per fight, a turn you start at 86 heat or more gives you two actions', 3, 1, 0),
  n('c1', 'combat', 102, 102, 'Targeting', '+5% damage, a little less each rank', 1, 5, 2, [['Finisher', '+5% damage per rank to enemies below 30% health (5 ranks)', 1], ['First strike', 'Your first attack each fight does +10% damage per rank (3 ranks)', 1]], END),
  n('c2', 'combat', 120, 96, 'Flank logic', '+3% damage from the side and +5% from behind per rank', 1, 5, 0),
  n('c3', 'combat', 137, 104, 'Crit training', 'Crits do +5% damage per rank', 1, 5, 0),
  n('c4', 'combat', 126, 118, 'Momentum', 'Each enemy you finish adds 5 Overload per rank', 1, 4, 0),
  n('c5', 'combat', 149, 122, 'Fourth slot', 'One more move slot', 4, 1, 0),
  n('d1', 'guard', 80, 74, 'Practised guard', 'Every defensive move is 6% stronger, a little less each rank', 1, 5, 1, [['Cool head', 'Any defensive move also removes 2 heat per rank (4 ranks)', 1], ['Counterweight', 'After a defensive move, your next attack does +5% damage per rank (3 ranks)', 1]], END),
  n('d2', 'guard', 85, 54, 'Braced', 'Brace gives +1 guard per rank', 1, 4, 0, [['Deep breath', 'Brace removes 2 more heat per rank (5 ranks)', 1], ['Patch job', 'Brace repairs 4% more structure per rank (5 ranks)', 1]]),
  n('d3', 'guard', 76, 34, 'Reflex brace', 'Brace no longer takes a move slot', 4, 1, 0),
  n('f1', 'fault', 98, 124, 'Breaker', '+4% damage to structure per rank', 1, 5, 0, [['Exploit', '+3% damage per rank to enemies that are malfunctioning (5 ranks)', 1], ['Seize up', 'An enemy whose structure you break loses its next turn', 3]]),
  n('f2', 'fault', 114, 138, 'Feedback', 'Breaking an enemy\'s structure adds 5 heat to it per rank', 1, 4, 0),
  n('f3', 'fault', 97, 145, 'Fail-safe', 'While your structure is broken, your implants keep 5% more of their strength per rank', 1, 5, 0),
  n('f4', 'fault', 107, 161, 'Steady hands', 'While malfunctioning, your weakest hits are 4% stronger per rank', 1, 5, 0),
  n('f5', 'fault', 125, 155, 'Reboot', 'Once per fight, when your structure breaks, 5% of it comes back next turn per rank', 1, 4, 0),
  n('g1', 'graft', 78, 126, 'Reinforced housings', '+6% structure, a little less each rank', 1, 5, 1, [['Sealed', 'With structure broken, you still heal at 10% of the normal rate per rank (3 ranks)', 1]], END),
  n('g2', 'graft', 68, 143, 'Clean interface', 'Implants\' health costs are 10% lower per rank', 1, 5, 0),
  n('g3', 'graft', 81, 153, 'Graft memory', 'Each new host starts with 1 more upgrade point per rank', 2, 3, 0),
  n('g4', 'graft', 62, 162, 'Salvage instinct', 'Each new host starts with a random common attack implant', 3, 1, 0),
  n('m1', 'move', 56, 98, 'Gait calibration', '+1 movement per rank', 3, 2, 0, [['Hit and fade', 'After attacking at 36 to 60 heat, you may step one tile', 2], ['Sidestep', 'The first heavy attack aimed at you each fight misses', 3]]),
  n('m2', 'move', 38, 92, 'Sure footing', 'Hazards do 10% less damage per rank', 1, 5, 0),
  n('m3', 'move', 21, 102, 'Clean break', 'Parting blows do 10% less damage per rank', 1, 5, 0),
  n('m4', 'move', 26, 80, 'Sea legs', 'Climbing out of the water costs 20% less health per rank', 1, 3, 0),
  n('n1', 'net', 55, 113, 'Handshake', 'Allies have +6% health, a little less each rank', 1, 5, 0, [['Stand together', 'Knocked-out allies get up a round sooner', 2]], { ...END, locked: true }),
  n('n2', 'net', 37, 123, 'Shared memory', 'Allies gain experience 25% faster per rank', 1, 4, 0, [['Coordinated', '+5% damage per rank to an enemy your ally hit this round (4 ranks)', 1]], { locked: true }),
  n('l1', 'luck', 141, 140, 'Scavenger', '+3% chance a won fight drops an implant per rank', 1, 5, 0, [['Fine pickings', '+2% chance per rank that a dropped implant is one rarity higher (5 ranks)', 1], ['Pick of the wreck', 'When a fight drops an implant, you\'re shown two and keep one', 3]]),
  n('l2', 'luck', 152, 156, 'Lucky find', '+5% chance of a Bio-Stim after a won fight per rank', 1, 4, 0),
  n('l3', 'luck', 136, 171, 'Loose change', '+6% credits from fights, a little less each rank', 1, 5, 0, undefined, END),
  n('l4', 'luck', 154, 174, 'Market eye', 'The Grey Lane has 1 more item on sale per rank', 1, 3, 0),
  n('l5', 'luck', 146, 190, 'Second chance', 'Once per host, swap a dropped implant for another roll', 3, 1, 0),
  n('w1', 'fw', 44, 146, 'Tuned', 'Every firmware\'s own move does +2% damage per rank', 1, 5, 1),
  n('w2', 'fw', 26, 150, 'Quick study', 'Firmware points come 10% faster per rank', 1, 5, 0),
  n('w3', 'fw', 31, 167, 'Cold boot', 'Every firmware\'s own move makes 1 less heat per rank', 1, 3, 0),
  n('w4', 'fw', 16, 180, 'Cross-load', 'A host can carry a second firmware\'s own move as an ordinary move', 4, 1, 0),
  n('j1', 'guard', 101, 60, 'Cold blood', 'End your turn at 35 heat or less and heal 1% of max health per rank', 1, 3, 0, undefined, { s2: 'heat' }),
  n('j2', 'heat', 125, 82, 'Hot hands', '+1% damage per rank while at 61 heat or more', 1, 5, 0, undefined, { s2: 'combat' }),
  n('j3', 'fault', 88, 137, 'Kinship', 'Moves from implants do +2% damage per rank', 1, 5, 0, undefined, { s2: 'graft' }),
  n('j4', 'move', 40, 108, 'Cover step', 'Ending your move beside an ally gives you both +1 guard per rank', 1, 4, 0, undefined, { s2: 'net', locked: true }),
  n('j5', 'signal', 71, 50, 'Brace for impact', 'Brace heals 1% of your max health per rank', 1, 3, 0, undefined, { s2: 'guard' }),
  ...([[18, 40], [64, 20], [156, 30], [158, 100], [158, 196], [112, 176], [70, 178], [6, 112], [4, 192]] as const).map(([x, y], k) => n(`z${k}`, 'signal', x, y, '', '', 0, 1, 0, undefined, { fog: true })),
];
const E: [string, string][] = [['core', 's1'], ['s1', 's2'], ['s1', 's3'], ['s2', 's4'], ['s4', 's5'], ['core', 'p1'], ['p1', 'p2'], ['p2', 'p3'], ['p2', 'p4'], ['p3', 'p5'],
  ['core', 'c1'], ['c1', 'c2'], ['c2', 'c3'], ['c1', 'c4'], ['c4', 'c5'], ['c3', 'c5'], ['core', 'd1'], ['d1', 'd2'], ['d2', 'd3'], ['core', 'f1'], ['f1', 'f2'], ['f1', 'f3'], ['f3', 'f4'], ['f2', 'f5'],
  ['core', 'g1'], ['g1', 'g2'], ['g1', 'g3'], ['g2', 'g4'], ['core', 'm1'], ['m1', 'm2'], ['m2', 'm3'], ['m2', 'm4'], ['core', 'n1'], ['n1', 'n2'], ['c4', 'l1'], ['l1', 'l2'], ['l1', 'l3'], ['l2', 'l4'], ['l3', 'l5'],
  ['core', 'w1'], ['w1', 'w2'], ['w1', 'w3'], ['w3', 'w4'], ['d2', 'j1'], ['j1', 'p2'], ['p2', 'j2'], ['j2', 'c2'], ['f1', 'j3'], ['j3', 'g1'], ['m1', 'j4'], ['j4', 'n2'], ['s3', 'j5'], ['j5', 'd2'], ['s4', 'm4'],
  ['s5', 'z0'], ['d3', 'z1'], ['p5', 'z2'], ['c3', 'z3'], ['l5', 'z4'], ['f4', 'z5'], ['g4', 'z6'], ['m3', 'z7'], ['w4', 'z8']];
const CORE = { x: 80, y: 100 }, TAUGHT: Strand = 'heat', GW = 160, GH = 200;
let POINTS = 3;
const by = new Map(N.map(x => [x.id, x]));
const lit = (x: Node) => x.have > 0;
const full = (x: Node) => !x.endless && x.have >= x.ranks;
const specsOpen = (x: Node) => x.have >= x.ranks;
const reach = (x: Node) => !x.fog && !x.locked && E.some(([p, q]) => (q === x.id && (p === 'core' || lit(by.get(p)!))) || (p === x.id && lit(by.get(q)!)));
// An endless neuron's price climbs as it goes (out of step with what it gives)
const nextCost = (x: Node) => (x.endless ? (x.have < 3 ? 1 : x.have < 8 ? 2 : x.have < 15 ? 3 : 5) : x.cost);
const price = (c: number, s: Strand, s2?: Strand) => Math.max(1, c - (s === TAUGHT || s2 === TAUGHT ? 1 : 0));
const canBuy = (x: Node) => reach(x) && !full(x) && price(nextCost(x), x.s, x.s2) <= POINTS;

type Px = (x: number, y: number, c: string, a?: number) => void;
interface Tools { px: Px; dot: (x: number, y: number, r: number, c: string, a?: number, c2?: string) => void; ring: (x: number, y: number, r: number, c: string, a?: number) => void; line: (a: { x: number; y: number }, b: { x: number; y: number }, c: string, al: number, every?: number) => void; box: (x: number, y: number, r: number, c: string, a?: number) => void; corners: (x: number, y: number, d: number) => void }
function usePixels(gw: number, gh: number, cssW: number, paint: (t: Tools, now: number) => void) {
  const ref = useRef<HTMLCanvasElement>(null);
  const fn = useRef(paint); fn.current = paint;
  useEffect(() => {
    const cv = ref.current!; const ctx = cv.getContext('2d')!;
    const scale = Math.max(2, Math.floor((cssW * (window.devicePixelRatio || 1)) / gw));
    cv.width = gw * scale; cv.height = gh * scale;
    let raf = 0;
    const px: Px = (x, y, c, a = 1) => { ctx.globalAlpha = a; ctx.fillStyle = c; ctx.fillRect(x, y, 1, 1); };
    const tools: Tools = {
      px,
      dot: (x, y, r, c, a = 1, c2) => { for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) if (dx * dx + dy * dy <= r * r + 1) px(x + dx, y + dy, c2 && dx > 0 ? c2 : c, a); },
      ring: (x, y, r, c, a = 1) => { for (let dy = -r - 1; dy <= r + 1; dy++) for (let dx = -r - 1; dx <= r + 1; dx++) if (Math.abs(Math.sqrt(dx * dx + dy * dy) - r) < 0.6) px(x + dx, y + dy, c, a); },
      line: (a, b, c, al, every = 1) => { const k = Math.max(Math.abs(b.x - a.x), Math.abs(b.y - a.y), 1); for (let i = 0; i <= k; i += every) px(Math.round(a.x + ((b.x - a.x) * i) / k), Math.round(a.y + ((b.y - a.y) * i) / k), c, al); },
      box: (x, y, r, c, a = 1) => { for (let d = -r + 1; d < r; d++) { px(x + d, y - r, c, a); px(x + d, y + r, c, a); px(x - r, y + d, c, a); px(x + r, y + d, c, a); } },
      corners: (x, y, d) => { for (const [sx, sy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) { px(x + sx * d, y + sy * d, '#fff'); px(x + sx * (d - 1), y + sy * d, '#fff'); px(x + sx * d, y + sy * (d - 1), '#fff'); } },
    };
    const draw = () => { ctx.setTransform(scale, 0, 0, scale, 0, 0); ctx.imageSmoothingEnabled = false; ctx.clearRect(0, 0, gw, gh); fn.current(tools, performance.now()); ctx.globalAlpha = 1; raf = requestAnimationFrame(draw); };
    draw();
    return () => cancelAnimationFrame(raf);
  }, [gw, gh, cssW]);
  return ref;
}
const Num = ({ x, y, gw, gh, v, color, size }: { x: number; y: number; gw: number; gh: number; v: number; color: string; size?: number }) => {
  const shown = Math.min(999, v), d = String(shown).length;
  return <div className="pointer-events-none absolute -translate-x-1/2 -translate-y-1/2 font-display font-bold leading-none tracking-tight" style={{ left: `${((x + 0.5) / gw) * 100}%`, top: `${((y + 0.5) / gh) * 100}%`, color, fontSize: size ?? (d === 1 ? 19 : d === 2 ? 16 : 12.5), textShadow: `0 0 8px ${color}` }}>{shown}</div>;
};

/** One neuron of the main network, at any scale. */
function paintNet(t: Tools, now: number, sel: string | null, at: (p: { x: number; y: number }) => { x: number; y: number }, small: boolean) {
  const { px, dot, ring, line, corners } = t;
  const core = at(CORE);
  for (const [p, q] of E) { const A = p === 'core' ? core : at(by.get(p)!), b = by.get(q)!, B = at(b); const both = (p === 'core' || lit(by.get(p)!)) && lit(b); if (both) line(A, B, COL[b.s2 && p !== 'core' ? by.get(p)!.s : b.s], 0.95); else line(A, B, '#2f3947', b.fog ? 0.7 : b.locked ? 0.5 : 1, b.fog ? 3 : 1); }
  for (const x of N) {
    const p = at(x);
    if (x.fog) { px(p.x, p.y, '#4a5564', 0.9); continue; }
    const col = COL[x.s], c2 = x.s2 ? COL[x.s2] : undefined, has = lit(x), open = reach(x) && !full(x), afford = canBuy(x), disc = x.s === TAUGHT || x.s2 === TAUGHT;
    if (small) { if (has) dot(p.x, p.y, 1, col, 1, c2); else { dot(p.x, p.y, 1, '#0b1119', 1); ring(p.x, p.y, 1, afford ? '#f2b33d' : x.locked ? '#3a4452' : '#5b6676', 1); } continue; }
    const edge = afford ? '#f2b33d' : open ? '#8a7440' : '#5b6676', beat = 0.55 + 0.45 * Math.sin(now / 280 + x.x);
    const r = x.ranks > 1 ? (x.endless || x.cost > 1 ? 4 : 3) : Math.min(4, x.cost + 1);
    if (disc && !x.locked) { const g = 0.75 + 0.25 * Math.sin(now / 600); dot(p.x, p.y, r + 5, '#ffe27a', 0.07 * g); dot(p.x, p.y, r + 3, '#ffe27a', 0.13 * g); }
    if (has) { dot(p.x, p.y, r + 1, col, 0.18); dot(p.x, p.y, r, col, specsOpen(x) ? 1 : 0.7, c2); px(p.x - 1, p.y - 1, '#fff', 0.8); if (afford) ring(p.x, p.y, r + 1, edge, 0.4 + 0.5 * beat); }
    else { if (afford) dot(p.x, p.y, r + 2, edge, 0.16 * beat); dot(p.x, p.y, r, '#0b1119', 1); ring(p.x, p.y, r, edge, afford ? 0.6 + 0.4 * beat : x.locked ? 0.4 : 0.9); px(p.x, p.y, col, x.locked ? 0.4 : 0.9); if (c2) px(p.x + 1, p.y, c2, x.locked ? 0.4 : 0.9); }
    if (x.endless) ring(p.x, p.y, r + 2, has ? col : '#5b6676', x.locked ? 0.25 : 0.5);
    if (x.id === 'c5') { px(p.x - 1, p.y - 1, '#e8f4ff'); px(p.x, p.y - 1, '#e8f4ff'); px(p.x + 1, p.y - 1, '#e8f4ff'); px(p.x - 1, p.y, '#e8f4ff'); px(p.x, p.y, '#e8f4ff'); px(p.x + 1, p.y, '#e8f4ff'); }
    if (x.ranks > 1) for (let k = 0; k < x.ranks; k++) px(p.x - (x.ranks - 1) + k * 2, p.y + r + (x.endless ? 4 : 2), k < x.have ? '#fff' : '#5b6676', x.locked ? 0.5 : 1);
    (x.specs ?? []).forEach((sp, k) => {
      const a = (-90 + (k - (x.specs!.length - 1) / 2) * 42) * Math.PI / 180, rr = r + (x.endless ? 5 : 3), sx = Math.round(p.x + Math.cos(a) * rr), sy = Math.round(p.y + Math.sin(a) * rr);
      const c = sp[3] ? '#fff' : specsOpen(x) ? col : '#4a5564';
      for (const [dx, dy] of [[0, 0], [1, 0], [0, 1], [1, 1]]) px(sx + dx, sy + dy, c, x.locked ? 0.5 : 1);
    });
    if (x.id === sel) corners(p.x, p.y, 9);
  }
  const beat = 0.6 + 0.4 * Math.sin(now / 500), R = small ? 6 : 8;
  dot(core.x, core.y, R + 2, '#f2b33d', 0.1 * beat); dot(core.x, core.y, R, '#0d1a22', 1); ring(core.x, core.y, R, '#f2b33d', 0.95);
}

function Net({ sel, onSelect, points }: { sel: string | null; onSelect: (id: string) => void; points: number }) {
  POINTS = points;
  const W = 358, H = Math.round((W * GH) / GW);
  const ref = usePixels(GW, GH, W, (t, now) => paintNet(t, now, sel, p => p, false));
  const tap = (e: React.MouseEvent) => {
    const r = (e.target as HTMLElement).getBoundingClientRect(), x = ((e.clientX - r.left) / r.width) * GW, y = ((e.clientY - r.top) / r.height) * GH;
    const hit = N.filter(q => !q.fog).map(q => ({ q, d: Math.hypot(q.x - x, q.y - y) })).sort((a, b) => a.d - b.d)[0];
    if (hit && hit.d < 8) onSelect(hit.q.id);
  };
  return (
    <div style={{ width: W, height: H }} className="relative mx-auto">
      <canvas ref={ref} onClick={tap} style={{ width: W, height: H, imageRendering: 'pixelated' }} />
      <Num x={CORE.x} y={CORE.y} gw={GW} gh={GH} v={points} color="#f2b33d" />
    </div>
  );
}

function Dots({ k, dark }: { k: number; dark?: boolean }) { return <span className="flex items-center gap-1">{Array.from({ length: k }, (_, i) => <span key={i} className={cx('h-2 w-2 rounded-full', dark ? 'bg-[#2a1a02]' : 'bg-white/25')} />)}</span>; }
function Buy({ cost, ok }: { cost: number; ok: boolean }) { return ok ? <Btn variant="gold" size="sm" className="shrink-0 gap-2">Learn <Dots k={cost} dark /></Btn> : <span className="shrink-0"><Dots k={cost} /></span>; }

function Detail({ id }: { id: string }) {
  const x = by.get(id)!, p = price(nextCost(x), x.s, x.s2);
  return (
    <div className="slab space-y-2 rounded-3xl px-4 py-3">
      <div className="flex items-center gap-3">
        <span className="flex shrink-0"><span className="h-3 w-3 rounded-full" style={{ background: COL[x.s], boxShadow: `0 0 8px ${COL[x.s]}` }} />{x.s2 && <span className="-ml-1 h-3 w-3 rounded-full" style={{ background: COL[x.s2] }} />}</span>
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline gap-2"><span className="font-display text-[15px] font-semibold text-white">{x.name}</span>{(x.ranks > 1 || x.endless) && <span className="text-[12px] text-hud-dim">{x.endless ? `Rank ${x.have}` : `${x.have} / ${x.ranks}`}</span>}</div>
          <div className="text-[13px] leading-snug text-hud-text">{x.effect}</div>
        </div>
        {full(x) ? <span className="shrink-0 text-[12px] font-semibold" style={{ color: COL[x.s] }}>Kept</span> : reach(x) ? <Buy cost={p} ok={p <= POINTS} /> : <span className="shrink-0 text-[12px] text-hud-faint">{x.locked ? 'No one to link' : 'Not yet'}</span>}
      </div>
      {x.specs?.map(sp => {
        const sc = price(sp[2], x.s);
        return (
          <div key={sp[0]} className="flex items-center gap-3 rounded-2xl bg-white/[0.04] px-3 py-2" style={{ opacity: specsOpen(x) ? 1 : 0.5 }}>
            <span className="h-2 w-2 shrink-0 rounded-[2px]" style={{ background: sp[3] ? '#fff' : specsOpen(x) ? COL[x.s] : '#4a5564' }} />
            <div className="min-w-0 flex-1"><div className="text-[13px] font-semibold text-white">{sp[0]}</div><div className="text-[12px] leading-snug text-hud-dim">{sp[1]}</div></div>
            {sp[3] ? <span className="shrink-0 text-[12px] font-semibold text-white/80">Kept</span> : specsOpen(x) ? <Buy cost={sc} ok={sc <= POINTS} /> : <span className="shrink-0 text-[11px] text-hud-faint">Rank {x.ranks} first</span>}
          </div>
        );
      })}
    </div>
  );
}

const Head = ({ title, zoom }: { title: string; zoom?: boolean }) => (
  <div className="flex items-center gap-3">
    <span className="key flex h-10 w-10 items-center justify-center rounded-2xl"><Glyph name="back" size={16} /></span>
    <h1 className="flex-1 font-display text-[22px] font-semibold text-white">{title}</h1>
    {zoom && <span className="key flex h-10 items-center justify-center rounded-2xl px-3 text-[13px] font-semibold text-hud-text">Zoom out</span>}
  </div>
);

export function MockTree() {
  const [sel, setSel] = useState<string | null>('s1');
  return <Screen><div className="space-y-2 px-4 pb-8 pt-6"><Head title="Memory" zoom /><Net sel={sel} onSelect={setSel} points={3} />{sel && <Detail id={sel} />}</div></Screen>;
}
export function MockDeath() {
  const [sel, setSel] = useState<string | null>('p2');
  return (
    <Screen footer={<Btn variant="primary" size="lg" className="w-full">Wake</Btn>}>
      <div className="space-y-2 px-4 pb-4 pt-8">
        <header className="flex flex-col items-center gap-1 text-center">
          <h1 className="font-display text-[34px] font-bold leading-none tracking-tight text-white drop-shadow-[0_0_24px_rgba(240,82,79,0.35)]">Host lost</h1>
          <p className="text-[14px] text-hostile">Cartel Enforcer</p>
        </header>
        <Net sel={sel} onSelect={setSel} points={128} />
        {sel && <Detail id={sel} />}
      </div>
    </Screen>
  );
}

// ── Firmware: a lane each, its own points, neurons at stages along it ──
type FN = [name: string, effect: string, cost: number, ranks: number, have: number];
interface Fw { name: string; color: string; open: boolean; points: number; move: string; rule: string; A: FN; B?: FN; F1: [FN, FN]; C: FN; F2: [FN, FN]; D: FN; F3: [FN, FN] }
const H = (pct: number, r: number, have = 0): FN => ['Hits harder', `Its own move does +${pct}% damage per rank`, 1, r, have];
const K = (heat: number, r: number, have = 0): FN => ['Runs cooler', `Its own move makes ${heat} less heat per rank`, 1, r, have];
const FWS: Fw[] = [
  { name: 'Enforcer', color: '#ff6b5e', open: true, points: 4, move: 'Hydraulic Slam: reaches two tiles in a line', rule: 'A takedown gives you another action', A: H(5, 4, 3), B: ['Knocks them back', 'Its own move shoves whoever it hits one tile', 2, 1, 0], F1: [['Breaker', 'Its knockbacks crush into whatever is behind', 3, 1, 0], ['Vent engine', 'Venting bursts hit 50% harder', 3, 1, 0]], C: H(5, 6), F2: [['Stun lock', 'Its own move has a 5% chance to stun per rank', 1, 5, 0], ['Bulk', '+10 max health per rank', 1, 3, 0]], D: K(1, 3), F3: [['Piledriver', 'Its own move hits far harder, with a 35% chance to stun', 5, 1, 0], ['Earthshaker', 'Its own move hits all eight tiles around you', 5, 1, 0]] },
  { name: 'Operative', color: '#7fe0ff', open: true, points: 1, move: 'Precision Shot: a straight line of four tiles', rule: 'Acts twice in a turn started at 25 heat or less', A: H(5, 5, 1), B: K(1, 2), F1: [['Optical lock', 'Its own move always does its top damage', 3, 1, 0], ['Run and gun', 'Step back one tile after the shot', 3, 1, 0]], C: H(5, 6), F2: [['Through the line', 'The shot passes through every body in the line', 3, 1, 0], ['Long eye', 'The shot hits harder from 4 tiles or more', 3, 1, 0]], D: K(1, 2), F3: [['Clean line', 'The shot hits far harder and passes through cover', 5, 1, 0], ['Deep cold', 'Act twice up to 40 heat, and shed 2 more heat a turn', 5, 1, 0]] },
  { name: 'Courier', color: '#ffd166', open: false, points: 0, move: 'Flicker Jab: one tile next to you', rule: 'A free step after every attack made without moving first', A: H(5, 2), B: ['Quicker', '+1 speed', 2, 1, 0], F1: [['Hit and run', 'Step back one tile after the jab', 3, 1, 0], ['Vault', 'Leap over them after the jab', 3, 1, 0]], C: K(1, 2), F2: [['Quicker still', '+1 speed per rank', 2, 2, 0], ['Bleeder', 'The jab makes them bleed', 3, 1, 0]], D: ['Afterimage', 'Act twice in a turn started cool', 4, 1, 0], F3: [['Overclocked', 'Act twice every turn', 5, 1, 0], ['Blur', '+1 speed, and the jab hits far harder', 5, 1, 0]] },
  { name: 'Foreman', color: '#c59bff', open: false, points: 0, move: 'Crowd Press: sweeps the three tiles in front of you', rule: 'Every hit pushes 6 more heat into whoever it lands on', A: H(5, 2), B: ['Knocks them back', 'Its own move shoves whoever it hits one tile', 2, 1, 0], F1: [['Clear the floor', 'Its own move hits all eight tiles around you', 3, 1, 0], ['Long shove', 'Its own move becomes a line of three that shoves', 3, 1, 0]], C: K(1, 3), F2: [['Stoker', 'Hits push 2 more heat into them per rank', 1, 3, 0], ['Crusher', 'Its knockbacks crush into whatever is behind', 3, 1, 0]], D: ['Rattle', 'Its own move has a 5% chance to stun per rank', 1, 4, 0], F3: [['Overrun', 'Its own move becomes a blast on a 3x3 square up to three tiles away', 5, 1, 0], ['Pressure', 'Hits push 10 more heat into them', 5, 1, 0]] },
  { name: 'Wretch', color: '#9be37a', open: false, points: 0, move: 'Strike: one tile next to you', rule: 'Implant moves hit 35% harder; one more move slot', A: ['Graft drive', 'Implant moves do +5% damage per rank', 1, 2, 0], F1: [['Tolerance', 'Implants\' health costs are back to normal', 3, 1, 0], ['Overdrive grafts', 'Implant moves do +5% damage per rank', 1, 3, 0]], C: ['Graft drive', 'Implant moves do +5% damage per rank', 1, 2, 0], F2: [['Sixth slot', 'One more move slot', 4, 1, 0], ['Cool grafts', 'Implant moves make 1 less heat per rank', 1, 3, 0]], D: ['Graft drive', 'Implant moves do +5% damage per rank', 1, 2, 0], F3: [['Kinship', 'Implant mods count twice', 5, 1, 0], ['Abomination', 'Active implants give 50% more stats', 5, 1, 0]] },
  { name: 'Splice', color: '#ff9bd2', open: false, points: 0, move: 'Graft Whip: reaches two tiles in a line, and heals a little', rule: 'A passive slot can hold a second implant; up to 2 pairs', A: H(5, 2), B: ['Drinks deeper', 'The whip heals 5% more of its damage', 2, 1, 0], F1: [['Tolerance', 'Each pair costs 1 less heat a turn', 3, 1, 0], ['Overgrowth', 'One more pair', 3, 1, 0]], C: H(5, 3), F2: [['Graft hunger', 'The whip heals 5% more of its damage per rank', 1, 2, 0], ['Thorns', '+10 max health per rank', 1, 3, 0]], D: K(1, 2), F3: [['Chimera', 'Two more pairs', 5, 1, 0], ['Symbiote', 'Pairs cost no heat', 5, 1, 0]] },
];
const FGW = 160, FGH = 232, laneY = (k: number) => 22 + k * 38, LX = { S: 27, A: 47, B: 63, F1: 79, C: 100, F2: 116, D: 136, F3: 151 };
type Slot = 'S' | 'A' | 'B' | 'F1a' | 'F1b' | 'C' | 'F2a' | 'F2b' | 'D' | 'F3a' | 'F3b';
const slotsOf = (f: Fw): [Slot, FN | null, number, number][] => [['S', null, LX.S, 0], ['A', f.A, LX.A, 0], ...(f.B ? [['B', f.B, LX.B, 0] as [Slot, FN, number, number]] : []), ['F1a', f.F1[0], LX.F1, -9], ['F1b', f.F1[1], LX.F1 + 3, 9], ['C', f.C, LX.C, 0], ['F2a', f.F2[0], LX.F2 + 2, -9], ['F2b', f.F2[1], LX.F2, 9], ['D', f.D, LX.D, 0], ['F3a', f.F3[0], LX.F3, -9], ['F3b', f.F3[1], LX.F3 - 2, 9]];

export function MockFirmware() {
  const W = 358, Hh = Math.round((W * FGH) / FGW), hub = { x: 8, y: 116 };
  const [sel, setSel] = useState<[number, Slot]>([0, 'B']);
  const ref = usePixels(FGW, FGH, W, ({ px, dot, ring, line, box, corners }, now) => {
    const beat = 0.6 + 0.4 * Math.sin(now / 400);
    for (const x of [90, 126]) for (let y = 6; y < FGH - 4; y += 3) px(x, y, '#2a3340', 0.9);
    for (let r = 5; r <= 6; r++) box(hub.x, hub.y, r, '#8fd0c8', r === 6 ? 0.9 : 0.35); dot(hub.x, hub.y, 1, '#fff', beat);
    FWS.forEach((f, k) => {
      const y = laneY(k), start = { x: LX.S, y };
      line({ x: hub.x + 6, y: hub.y }, start, f.open ? f.color : '#2f3947', f.open ? 0.9 : 0.7);
      line(start, { x: 157, y }, '#2f3947', f.open ? 1 : 0.7, f.open ? 1 : 2);
      let prev = true;
      for (const [slot, fn, x, dy] of slotsOf(f)) {
        const p = { x, y: y + dy };
        if (slot === 'S') { if (f.open) { dot(p.x, p.y, 8, f.color, 0.1 * beat); dot(p.x, p.y, 6, '#0d1a22', 1); ring(p.x, p.y, 6, f.color, 0.95); } else { dot(p.x, p.y, 5, '#0b1119', 1); ring(p.x, p.y, 5, '#3a4452', 1); px(p.x, p.y, f.color, 0.5); } continue; }
        if (dy) line({ x: x - 7, y }, p, '#2f3947', f.open ? 1 : 0.6);
        const [, , cost, ranks, have] = fn!;
        if (!f.open) { dot(p.x, p.y, 1, '#0b1119', 1); ring(p.x, p.y, ranks > 1 ? 3 : 2, '#3a4452', 0.9); continue; }
        const r = cost >= 5 ? 4 : ranks > 1 ? 3 : cost >= 3 ? 3 : 2, done = have >= ranks, open = prev && !done, afford = open && f.points >= cost;
        if (have > 0) { dot(p.x, p.y, r + 1, f.color, 0.18); dot(p.x, p.y, r, f.color, done ? 1 : 0.7); px(p.x - 1, p.y - 1, '#fff', 0.8); if (afford) ring(p.x, p.y, r + 1, '#f2b33d', 0.4 + 0.5 * beat); }
        else { if (afford) dot(p.x, p.y, r + 2, '#f2b33d', 0.16 * beat); dot(p.x, p.y, r, '#0b1119', 1); ring(p.x, p.y, r, afford ? '#f2b33d' : open ? '#8a7440' : '#5b6676', afford ? 0.6 + 0.4 * beat : 0.9); px(p.x, p.y, f.color, 0.9); }
        if (ranks > 1) for (let i = 0; i < ranks; i++) px(p.x - (ranks - 1) + i * 2, p.y + r + 2, i < have ? '#fff' : '#5b6676', 1);
        if (!dy) prev = have > 0;
        if (sel[0] === k && sel[1] === slot) corners(p.x, p.y, 8);
      }
      if (sel[0] === k && sel[1] === 'S') corners(LX.S, y, 9);
    });
  });
  const tap = (e: React.MouseEvent) => {
    const r = (e.target as HTMLElement).getBoundingClientRect(), x = ((e.clientX - r.left) / r.width) * FGW, y = ((e.clientY - r.top) / r.height) * FGH;
    let best: [number, Slot] | null = null, bd = 8;
    FWS.forEach((f, k) => slotsOf(f).forEach(([slot, , sx, dy]) => { const d = Math.hypot(sx - x, laneY(k) + dy - y); if (d < bd) { bd = d; best = [k, slot]; } }));
    if (best) setSel(best);
  };
  const f = FWS[sel[0]], entry = slotsOf(f).find(s => s[0] === sel[1])!, fn = entry[1];
  return (
    <Screen>
      <div className="space-y-2 px-4 pb-8 pt-6">
        <Head title="Firmware" zoom />
        <div style={{ width: W, height: Hh }} className="relative mx-auto">
          <canvas ref={ref} onClick={tap} style={{ width: W, height: Hh, imageRendering: 'pixelated' }} />
          {FWS.map((fw, k) => fw.open && <Num key={k} x={LX.S} y={laneY(k)} gw={FGW} gh={FGH} v={fw.points} color={fw.color} size={15} />)}
          {FWS.map((fw, k) => <div key={`n${k}`} className="pointer-events-none absolute text-[11px] font-semibold" style={{ left: `${(18 / FGW) * 100}%`, top: `${((laneY(k) - 17) / FGH) * 100}%`, color: fw.open ? fw.color : '#4a5564' }}>{fw.open ? fw.name : '· · ·'}</div>)}
        </div>
        <div className="slab flex items-center gap-3 rounded-3xl px-4 py-3">
          <span className="h-3 w-3 shrink-0 rounded-full" style={{ background: f.color, boxShadow: `0 0 8px ${f.color}` }} />
          {fn ? (<>
            <div className="min-w-0 flex-1">
              <div className="flex items-baseline gap-2"><span className="font-display text-[15px] font-semibold text-white">{fn[0]}</span>{fn[3] > 1 && <span className="text-[12px] text-hud-dim">{fn[4]} / {fn[3]}</span>}</div>
              <div className="text-[13px] leading-snug text-hud-text">{fn[1]}</div>
            </div>
            {f.open ? <Buy cost={fn[2]} ok={f.points >= fn[2]} /> : <span className="shrink-0 text-[12px] text-hud-faint">Not found</span>}
          </>) : (
            <div className="min-w-0 flex-1">
              <div className="font-display text-[15px] font-semibold text-white">{f.name}</div>
              <div className="text-[13px] leading-snug text-hud-text">{f.move}</div>
              <div className="text-[13px] leading-snug text-hud-dim">{f.rule}</div>
            </div>
          )}
        </div>
      </div>
    </Screen>
  );
}

/** Zoomed out: the memory above, the firmware lanes hanging off its firmware strand; every pool of points. */
export function MockZoom() {
  const gw = 160, gh = 300, W = 358, Hh = Math.round((W * gh) / gw);
  const at = (p: { x: number; y: number }) => ({ x: Math.round(8 + p.x * 0.9), y: Math.round(2 + p.y * 0.9) });
  const hub = { x: 16, y: 236 }, ly = (k: number) => 196 + k * 17, sx = 40;
  const ref = usePixels(gw, gh, W, (t, now) => {
    const { px, dot, ring, line, box } = t, beat = 0.6 + 0.4 * Math.sin(now / 500);
    const w4 = at(by.get('w4')!);
    line(w4, { x: hub.x, y: hub.y - 7 }, '#8fd0c8', 0.9, 1);
    paintNet(t, now, null, at, true);
    for (let r = 5; r <= 6; r++) box(hub.x, hub.y, r, '#8fd0c8', r === 6 ? 0.9 : 0.35); dot(hub.x, hub.y, 1, '#fff', beat);
    FWS.forEach((f, k) => {
      const y = ly(k), start = { x: sx, y };
      line({ x: hub.x + 6, y: hub.y }, start, f.open ? f.color : '#2f3947', f.open ? 0.9 : 0.7);
      line(start, { x: 156, y }, '#2f3947', f.open ? 1 : 0.7, f.open ? 1 : 2);
      if (f.open) { dot(start.x, start.y, 6, '#0d1a22', 1); ring(start.x, start.y, 6, f.color, 0.95); } else { dot(start.x, start.y, 3, '#0b1119', 1); ring(start.x, start.y, 3, '#3a4452', 1); }
      for (const [slot, fn, x, dy] of slotsOf(f)) {
        if (slot === 'S') continue;
        const p = { x: Math.round(sx + (x - LX.S) * 0.92), y: y + Math.round(dy * 0.55) };
        if (!f.open) { px(p.x, p.y, '#4a5564', 0.9); continue; }
        if (fn![4] > 0) dot(p.x, p.y, 1, f.color, 1); else { dot(p.x, p.y, 1, '#0b1119', 1); ring(p.x, p.y, 1, '#5b6676', 1); }
      }
    });
  });
  return (
    <Screen>
      <div className="space-y-2 px-4 pb-6 pt-6">
        <Head title="Memory" />
        <div style={{ width: W, height: Hh }} className="relative mx-auto">
          <canvas ref={ref} style={{ width: W, height: Hh, imageRendering: 'pixelated' }} />
          <Num x={at(CORE).x} y={at(CORE).y} gw={gw} gh={gh} v={12} color="#f2b33d" size={13} />
          {FWS.map((f, k) => f.open && <Num key={k} x={sx} y={ly(k)} gw={gw} gh={gh} v={f.points} color={f.color} size={12} />)}
        </div>
      </div>
    </Screen>
  );
}
