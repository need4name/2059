// MOCKUP ONLY (not wired to the game): the memory tree redesign, for screenshots.
import { useState } from 'react';
import { Screen, Label, Btn, Chip, Glyph, cx } from '../hud';

type State = 'owned' | 'buy' | 'dear' | 'next' | 'fog';
interface N { name: string; cost: 1 | 2 | 3; effect: string; state: State; tier: number }
const BRANCHES: { id: string; name: string; glyph: 'leg' | 'brain' | 'arm' | 'implant' | 'signal' | 'allies'; theme: string }[] = [
  { id: 'move', name: 'Locomotion', glyph: 'leg', theme: 'How far and how freely it drives a body' },
  { id: 'heat', name: 'Processing', glyph: 'brain', theme: 'The heat it fights at' },
  { id: 'combat', name: 'Subroutines', glyph: 'arm', theme: 'Hitting harder, cleaner, more often' },
  { id: 'graft', name: 'Grafting', glyph: 'implant', theme: 'More from implants, for less' },
  { id: 'signal', name: 'Signal', glyph: 'signal', theme: 'Staying alive, carrying more over' },
  { id: 'network', name: 'Network', glyph: 'allies', theme: 'Working with others' },
];
const HEAT: N[] = [
  { tier: 1, name: 'Heat sink', cost: 1, effect: 'Shed 3 more heat each round', state: 'owned' },
  { tier: 2, name: 'Set point', cost: 1, effect: 'Start each fight cold (0) or warm (50)', state: 'buy' },
  { tier: 2, name: 'Thermal tolerance', cost: 2, effect: 'Running hot hurts you far less', state: 'buy' },
  { tier: 3, name: 'Redline', cost: 2, effect: 'Once a fight, act twice on a turn started at 86 heat or more', state: 'next' },
  { tier: 4, name: 'Vent', cost: 1, effect: 'Brace cools 10 more', state: 'fog' },
  { tier: 5, name: 'Runaway', cost: 3, effect: '', state: 'fog' },
];

function Pips({ cost, off = 0, dim }: { cost: number; off?: number; dim?: boolean }) {
  return (
    <span className="flex items-center gap-1">
      {Array.from({ length: cost }, (_, k) => (
        <span key={k} className={cx('h-2.5 w-2.5 rounded-full', k >= cost - off ? 'bg-ok/30 ring-1 ring-ok/70' : dim ? 'bg-white/15' : 'bg-cred shadow-[0_0_6px_rgba(242,179,61,0.7)]')} />
      ))}
    </span>
  );
}

function NodeCard({ n, off: rawOff = 0, picked, onPick }: { n: N; off?: number; picked?: boolean; onPick?: () => void }) {
  // A discount never makes a card free
  const off = Math.min(rawOff, n.cost - 1);
  if (n.state === 'fog') return (
    <div className="flex items-center gap-3 rounded-3xl bg-white/[0.025] p-3.5 ring-1 ring-white/[0.04]">
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-white/[0.04] text-hud-faint"><Glyph name="signal" size={18} /></span>
      <span className="h-3 w-28 rounded-full bg-white/[0.06] blur-[1.5px]" />
      <span className="ml-auto"><Pips cost={n.cost} dim /></span>
    </div>
  );
  const owned = n.state === 'owned', live = n.state === 'buy', next = n.state === 'next';
  return (
    <button onClick={onPick} className={cx('flex w-full items-start gap-3 rounded-3xl p-3.5 text-left transition',
      owned ? 'bg-sys/10 ring-1 ring-sys/40' : picked ? 'bg-cred/10 ring-2 ring-cred/80' : live ? 'bg-hud-panel/90 ring-1 ring-white/10' : 'bg-white/[0.03] ring-1 ring-white/[0.05] opacity-60')}>
      <span className={cx('flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl', owned ? 'bg-sys/25 text-sys' : live ? 'bg-white/[0.07] text-white' : 'bg-white/[0.04] text-hud-dim')}><Glyph name="brain" size={18} /></span>
      <span className="min-w-0 flex-1 space-y-0.5">
        <span className="flex items-center gap-2">
          <span className={cx('font-display text-[15px] font-semibold', owned ? 'text-sys' : 'text-white')}>{n.name}</span>
          {owned && <span className="text-[11px] font-semibold text-sys/80">Kept</span>}
        </span>
        <span className={cx('block text-[13px] leading-snug', next ? 'text-hud-dim' : 'text-hud-text')}>{n.effect}</span>
        {next && <span className="block text-[11px] text-hud-faint">After Set point or Thermal tolerance</span>}
      </span>
      {!owned && <span className="shrink-0 pt-1"><Pips cost={n.cost} off={off} dim={!live} /></span>}
    </button>
  );
}

/** The death screen: one memory a death, spend it or keep it. */
export function MockDeath() {
  const [pick, setPick] = useState<number | null>(1);
  const cards: { n: N; branch: string; off?: number }[] = [
    { n: HEAT[1], branch: 'Processing', off: 0 },
    { n: { ...HEAT[2], cost: 2 }, branch: 'Processing', off: 1 },
    { n: { tier: 1, name: 'Signal strength', cost: 1, effect: '+20 max health', state: 'buy' }, branch: 'Signal' },
    { n: { tier: 1, name: 'Supplies', cost: 1, effect: 'Each host wakes with 2 Bio-Stims, and the Grey Lane charges you 20% less', state: 'buy' }, branch: 'Signal' },
  ];
  return (
    <Screen footer={<Btn variant="primary" size="lg" className="w-full">Wake</Btn>}>
      <div className="space-y-6 px-4 pb-6 pt-12">
        <header className="flex flex-col items-center gap-3 pt-6 text-center">
          <Glyph name="signal" size={30} className="signal-pulse text-sys" />
          <h1 className="font-display text-[44px] font-bold leading-none tracking-tight text-white drop-shadow-[0_0_24px_rgba(240,82,79,0.35)]">Host lost</h1>
          <p className="text-[15px] text-hud-dim"><span className="text-hostile">Cartel Enforcer</span> · it ran too hot</p>
        </header>

        <div className="slab flex items-center gap-3 rounded-3xl p-4">
          <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-cred/15 text-cred"><Glyph name="signal" size={20} /></span>
          <div className="flex-1">
            <div className="font-display text-[16px] font-semibold text-white">Something stays</div>
            <div className="text-[13px] text-hud-dim">2 kept from before, 1 from this host</div>
          </div>
          <Pips cost={3} />
        </div>

        <div className="space-y-2.5">
          <div className="flex items-center justify-between">
            <Label>Spend it now</Label>
            <span className="flex items-center gap-1.5 rounded-full bg-ok/10 px-2.5 py-1 text-[11px] font-semibold text-ok"><Glyph name="brain" size={12} /> Processing costs 1 less</span>
          </div>
          {cards.map((c, k) => (
            <div key={k} className="space-y-1">
              <div className="pl-2 text-[11px] font-semibold text-hud-faint">{c.branch}</div>
              <NodeCard n={c.n} off={c.off} picked={pick === k} onPick={() => setPick(k)} />
            </div>
          ))}
          <button className="flex w-full items-center justify-center gap-2 rounded-3xl p-3 text-[13px] font-semibold text-hud-dim ring-1 ring-white/[0.06]">
            See the whole memory
          </button>
          <p className="text-center text-[12px] text-hud-faint">Or keep it: what isn't spent carries over.</p>
        </div>
      </div>
    </Screen>
  );
}

/** The memory page (hideout, and from the death screen): every branch, one step ahead visible. */
export function MockTree() {
  return (
    <Screen>
      <div className="space-y-4 px-4 pb-8 pt-6">
        <div className="flex items-center gap-3">
          <span className="key flex h-10 w-10 items-center justify-center rounded-2xl"><Glyph name="back" size={16} /></span>
          <h1 className="flex-1 font-display text-[22px] font-semibold text-white">Memory</h1>
          <Pips cost={3} />
        </div>
        <div className="no-scrollbar -mx-4 flex gap-2 overflow-x-auto px-4">
          {BRANCHES.map(b => (
            <span key={b.id} className={cx('flex shrink-0 items-center gap-1.5 rounded-full px-3 py-2 text-[13px] font-semibold',
              b.id === 'heat' ? 'bg-sys/15 text-sys ring-1 ring-sys/40' : 'bg-white/[0.05] text-hud-dim')}>
              <Glyph name={b.glyph} size={14} /> {b.name}
              {b.id === 'heat' && <span className="rounded-full bg-ok/20 px-1.5 text-[10px] text-ok">−1</span>}
              {b.id === 'network' && <span className="text-[10px] text-hud-faint">locked</span>}
            </span>
          ))}
        </div>
        <p className="text-[13px] text-hud-dim">The heat it fights at. 1 of 6 kept.</p>
        <div className="relative space-y-2">
          <div className="pointer-events-none absolute bottom-6 left-[34px] top-6 w-[2px] rounded-full bg-gradient-to-b from-sys/50 via-white/10 to-transparent" />
          {[1, 2, 3, 4, 5].map(t => (
            <div key={t} className={cx('relative space-y-2', HEAT.filter(n => n.tier === t).length > 1 && 'rounded-[28px] bg-white/[0.015] p-1')}>
              {HEAT.filter(n => n.tier === t).map((n, k) => <NodeCard key={k} n={n} off={n.state === 'buy' ? 1 : 0} />)}
            </div>
          ))}
        </div>
      </div>
    </Screen>
  );
}
