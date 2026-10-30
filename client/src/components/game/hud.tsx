import type { ReactNode, ButtonHTMLAttributes } from 'react';
import type { ItemRarity } from '@/lib/combat/types';
import { ATTACK_PATTERNS } from '@/lib/combat/patterns';
import type { AttackPatternType, AugmentationSlot, CombatGrid } from '@/lib/combat/types';

export const RARITY_TEXT: Record<ItemRarity, string> = {
  common: 'text-slate-300',
  uncommon: 'text-emerald-400',
  rare: 'text-sky-400',
  epic: 'text-fuchsia-400',
  legendary: 'text-amber-400',
};

/** Soft coloured wash used behind an item of a given rarity. */
export const RARITY_GLOW: Record<ItemRarity, string> = {
  common: 'from-slate-400/10',
  uncommon: 'from-emerald-400/15',
  rare: 'from-sky-400/15',
  epic: 'from-fuchsia-400/20',
  legendary: 'from-amber-400/25',
};

/** Rarity dot colour. */
export const RARITY_DOT: Record<ItemRarity, string> = {
  common: 'bg-slate-400',
  uncommon: 'bg-emerald-400',
  rare: 'bg-sky-400',
  epic: 'bg-fuchsia-400',
  legendary: 'bg-amber-400',
};

// Kept for screens that still mark rarity with an edge
export const RARITY_BORDER = RARITY_GLOW;

export function cx(...parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(' ');
}

/** Full-height scrolling screen with the soft menu backdrop. */
export function Screen({ children, className, footer }: { children: ReactNode; className?: string; footer?: ReactNode }) {
  return (
    <div className="absolute inset-0 flex flex-col overflow-hidden bg-hud-bg">
      <div className="pointer-events-none absolute inset-0 ambient" />
      <div className="pointer-events-none absolute inset-0 scanlines" />
      <div className={cx('relative flex-1 overflow-y-auto overflow-x-hidden overscroll-x-none no-scrollbar', className)}>{children}</div>
      {footer && (
        <div className="relative bg-gradient-to-t from-hud-bg via-hud-bg/95 to-transparent px-4 pt-4" style={{ paddingBottom: 'max(16px, env(safe-area-inset-bottom))' }}>
          {footer}
        </div>
      )}
    </div>
  );
}

/** Small muted label above a section. */
export function Label({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={cx('flex items-center gap-2 text-[12px] font-semibold tracking-[0.02em] text-hud-dim', className)}>
      <span aria-hidden className="h-1 w-1 rounded-full bg-sys/70 shadow-[0_0_6px_rgba(56,214,240,0.8)]" />
      {children}
    </div>
  );
}

/** Rounded surface. Use `raised` for something sitting on another card. */
export function Card({ children, className, raised, onClick }: { children: ReactNode; className?: string; raised?: boolean; onClick?: () => void }) {
  return (
    <div onClick={onClick} className={cx('rounded-2xl', raised ? 'bg-white/[0.05]' : 'slab', className)}>
      {children}
    </div>
  );
}

export function Panel({ label, right, children, className }: { label?: ReactNode; right?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <Card className={cx('p-4', className)}>
      {(label || right) && (
        <header className="mb-3 flex items-center justify-between gap-3">
          {label ? <Label className="text-hud-text">{label}</Label> : <span />}
          {right}
        </header>
      )}
      {children}
    </Card>
  );
}

type Tone = 'sys' | 'hostile' | 'cred' | 'aug' | 'ok' | 'dim' | 'structure';
const METER_FILL: Record<Tone, string> = {
  sys: 'bg-sys',
  hostile: 'bg-hostile',
  cred: 'bg-cred',
  aug: 'bg-aug',
  ok: 'bg-ok',
  dim: 'bg-hud-dim',
  structure: 'bg-slate-300',
};

export function Meter({ value, max, tone = 'sys', className, align = 'left' }: { value: number; max: number; tone?: Tone; className?: string; align?: 'left' | 'right' }) {
  const pct = max > 0 ? Math.max(0, Math.min(100, (value / max) * 100)) : 0;
  return (
    <div className={cx('well h-1.5 overflow-hidden rounded-full', className)}>
      <div className={cx('h-full rounded-full shadow-[inset_0_1px_0_rgba(255,255,255,0.35)] transition-[width] duration-300', METER_FILL[tone], align === 'right' && 'ml-auto')} style={{ width: `${pct}%` }} />
    </div>
  );
}

const CHIP_TONE: Record<Tone, string> = {
  sys: 'text-sys bg-sys/10',
  hostile: 'text-rose-300 bg-hostile/15',
  cred: 'text-cred bg-cred/10',
  aug: 'text-aug bg-aug/10',
  ok: 'text-ok bg-ok/10',
  dim: 'text-hud-dim bg-white/[0.06]',
  structure: 'text-orange-300 bg-orange-500/15',
};

export function Chip({ tone = 'dim', pulse, children, className }: { tone?: Tone; pulse?: boolean; children: ReactNode; className?: string }) {
  return (
    <span className={cx('inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[11px] font-semibold', CHIP_TONE[tone], pulse && 'animate-pulse', className)}>
      {children}
    </span>
  );
}

type BtnProps = ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'secondary' | 'danger' | 'ghost' | 'gold'; size?: 'md' | 'lg' | 'sm' };

const BTN_VARIANT = {
  primary: 'key key-primary text-[#04131a]',
  gold: 'key key-gold text-[#1a1003]',
  secondary: 'key text-hud-text',
  danger: 'key key-danger text-rose-300',
  ghost: 'bg-transparent text-hud-dim hover:text-hud-text hover:bg-white/[0.05] disabled:text-hud-faint',
};
const BTN_SIZE = {
  sm: 'h-9 px-3.5 text-[13px] rounded-xl',
  md: 'h-11 px-4 text-sm rounded-xl',
  lg: 'h-14 px-6 text-[15px] rounded-[20px]',
};

export function Btn({ variant = 'secondary', size = 'md', className, ...rest }: BtnProps) {
  return (
    <button
      {...rest}
      className={cx(
        'inline-flex select-none items-center justify-center gap-2 font-display font-semibold disabled:cursor-not-allowed',
        BTN_VARIANT[variant], BTN_SIZE[size], className,
      )}
    />
  );
}

export function Stat({ label, value, tone }: { label: string; value: ReactNode; tone?: string }) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-xs text-hud-dim">{label}</span>
      <span className={cx('font-display text-xl font-semibold leading-none', tone ?? 'text-hud-text')}>{value}</span>
    </div>
  );
}

/** Pill-shaped segmented control used for tabs. */
export function Segmented<T extends string>({ value, onChange, options }: { value: T; onChange: (v: T) => void; options: { id: T; label: string; badge?: number }[] }) {
  return (
    <div className="flex gap-1 rounded-2xl bg-white/[0.05] p-1" role="tablist">
      {options.map(o => (
        <button
          key={o.id}
          role="tab"
          aria-selected={value === o.id}
          onClick={() => onChange(o.id)}
          className={cx(
            'flex h-10 flex-1 items-center justify-center gap-1.5 rounded-xl text-[13px] font-semibold transition',
            value === o.id ? 'bg-hud-raised text-white shadow-[0_2px_10px_rgba(0,0,0,0.35)]' : 'text-hud-dim hover:text-hud-text',
          )}
        >
          {o.label}
          {o.badge ? <span className="min-w-[18px] rounded-full bg-cred px-1.5 text-[10px] font-bold leading-[18px] text-[#1a1003]">{o.badge}</span> : null}
        </button>
      ))}
    </div>
  );
}

export function ConfirmDialog({ open, title, body, confirmLabel, onConfirm, onCancel, danger }: {
  open: boolean; title: string; body: ReactNode; confirmLabel: string; onConfirm: () => void; onCancel: () => void; danger?: boolean;
}) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-4 backdrop-blur-sm sm:items-center" onClick={onCancel}>
      <div role="dialog" aria-modal="true" className="rise-in slab-solid w-full max-w-sm rounded-[28px] p-6" onClick={e => e.stopPropagation()}>
        <h2 className="font-display text-xl font-semibold text-hud-text">{title}</h2>
        <div className="mt-2 text-sm leading-relaxed text-hud-dim">{body}</div>
        <div className="mt-6 grid grid-cols-2 gap-2">
          <Btn onClick={onCancel}>Cancel</Btn>
          <Btn variant={danger ? 'danger' : 'primary'} onClick={onConfirm}>{confirmLabel}</Btn>
        </div>
      </div>
    </div>
  );
}

/** Bottom sheet used for pickers during play. */
export function Sheet({ open, title, onClose, children }: { open: boolean; title: string; onClose: () => void; children: ReactNode }) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <div className="rise-in slab-solid w-full max-w-[520px] rounded-t-[28px]" onClick={e => e.stopPropagation()} style={{ paddingBottom: 'max(16px, env(safe-area-inset-bottom))' }}>
        <div className="mx-auto mt-2.5 h-1 w-10 rounded-full bg-white/15" />
        <div className="flex items-center justify-between px-5 pb-2 pt-3">
          <span className="font-display text-lg font-semibold text-hud-text">{title}</span>
          <Btn variant="ghost" size="sm" onClick={onClose}>Close</Btn>
        </div>
        <div className="max-h-[60vh] overflow-y-auto px-5 pb-3">{children}</div>
      </div>
    </div>
  );
}

/** A full-screen page over the hub, with a way back. */
export function Page({ open, title, back = 'Back', onClose, children }: { open: boolean; title: string; back?: string; onClose: () => void; children: ReactNode }) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-40 flex justify-center bg-hud-bg">
      <div className="pointer-events-none absolute inset-0 ambient" />
      <div className="pointer-events-none absolute inset-0 scanlines" />
      <div className="rise-in relative flex w-full max-w-[520px] flex-col">
        <header className="flex items-center gap-2 px-3 pb-2" style={{ paddingTop: 'max(14px, env(safe-area-inset-top))' }}>
          <button onClick={onClose} className="flex items-center gap-1 rounded-full px-3 py-2 text-sm font-semibold text-hud-dim transition hover:bg-white/[0.06] hover:text-hud-text">
            <span aria-hidden className="text-lg leading-none">‹</span>{back}
          </button>
        </header>
        <div className="flex-1 overflow-y-auto overflow-x-hidden px-4 pb-10 no-scrollbar">
          <h1 className="mb-5 font-display text-[28px] font-semibold leading-tight tracking-tight text-white">{title}</h1>
          {children}
        </div>
      </div>
    </div>
  );
}

/**
 * A tiny pixel picture of an attack's footprint, South Park style: you in cyan,
 * where it can reach faint, where a typical aim lands bright. Drawn on an empty
 * 7x7 board with you near the bottom, aiming up.
 */
export function Footprint({ pattern, className }: { pattern?: AttackPatternType; className?: string }) {
  if (!pattern) return null;
  const n = 7, me = { row: 5, col: 3 };
  const grid: CombatGrid = { rows: n, cols: n, playerPosition: me, bossPosition: { row: -9, col: -9 }, tiles: Array.from({ length: n }, () => Array.from({ length: n }, () => ({ type: 'empty' as const }))) };
  const shape = ATTACK_PATTERNS[pattern];
  const key = (r: number, c: number) => `${r},${c}`;
  const reach = new Set<string>();
  let aim: string[] = [];
  // Prefer aiming straight up, nearest first; otherwise the first tile it can reach
  const order: [number, number][] = [];
  for (let d = 1; d < n; d++) order.push([me.row - d, me.col]);
  for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) order.push([r, c]);
  for (const [r, c] of order) {
    if (r < 0 || (r === me.row && c === me.col)) continue;
    const tiles = shape.getTargetTiles(me, { row: r, col: c }, grid);
    if (!tiles.length) continue;
    tiles.forEach(t => reach.add(key(t.row, t.col)));
    if (!aim.length) aim = tiles.map(t => key(t.row, t.col));
  }
  const cell = 4, gap = 1, size = n * (cell + gap) - gap;
  return (
    <svg viewBox={`0 0 ${size} ${size}`} width={size} height={size} className={className} aria-hidden shapeRendering="crispEdges">
      {Array.from({ length: n * n }, (_, k) => {
        const r = Math.floor(k / n), c = k % n, id = key(r, c);
        const fill = r === me.row && c === me.col ? '#38d6f0' : aim.includes(id) ? '#ffb43a' : reach.has(id) ? 'rgba(255,180,58,0.3)' : 'rgba(255,255,255,0.07)';
        return <rect key={k} x={c * (cell + gap)} y={r * (cell + gap)} width={cell} height={cell} rx={1} fill={fill} />;
      })}
    </svg>
  );
}


/**
 * Small pixel-art icons, drawn from 9x9 bitmaps so they sit with the board art
 * instead of looking like phone emoji. `#` is lit.
 */
const GLYPHS = {
  bar: ['.........', '.###.###.', '.###.###.', '.###.###.', '.........', '.###.###.', '.###.###.', '.###.###.', '.........'],
  implant: ['..#.#.#..', '.#######.', '##.....##', '.#.###.#.', '##.###.##', '.#.###.#.', '##.....##', '.#######.', '..#.#.#..'],
  upgrade: ['....#....', '...###...', '..##.##..', '.##...##.', '....#....', '...###...', '..##.##..', '.##...##.', '.........'],
  status: ['.........', '.........', '.....#...', '....##...', '#..#.#..#', '.##..#.#.', '......#..', '.........', '.........'],
  allies: ['.........', '.##...##.', '.##...##.', '.........', '###...###', '####.####', '####.####', '.........', '.........'],
  market: ['.........', '..#####..', '.##...##.', '.#..#..#.', '.#.###.#.', '.#..#..#.', '.##...##.', '..#####..', '.........'],
  sound: ['.........', '....#....', '...##..#.', '####.#..#', '#...#.#.#', '####.#..#', '...##..#.', '....#....', '.........'],
  mute: ['.........', '....#....', '...##....', '####.#.#.', '#...#..#.', '####.#.#.', '...##....', '....#....', '.........'],
  eye: ['.........', '.........', '..#####..', '.#.....#.', '#..###..#', '.#.....#.', '..#####..', '.........', '.........'],
  signal: ['.........', '.#.....#.', '#..#.#..#', '#.#...#.#', '#.#.#.#.#', '#.#...#.#', '#..#.#..#', '.#.....#.', '.........'],
  brain: ['.........', '..##.##..', '.#..#..#.', '#..#..#.#', '#.#..#..#', '#..#..#.#', '.#..#.#..', '..##.##..', '....#....'],
  ear: ['..####...', '.#....#..', '#..##..#.', '#.#..#.#.', '#....#.#.', '.#..#..#.', '..#...#..', '..#..#...', '...##....'],
  nose: ['....#....', '....#....', '...#.....', '...#.....', '..#......', '..#......', '.#...#...', '.#####...', '.........'],
  lungs: ['....#....', '....#....', '.##.#.##.', '#..###..#', '#...#...#', '#.......#', '#...#...#', '.###.###.', '.........'],
  spine: ['...###...', '....#....', '..#####..', '....#....', '..#####..', '....#....', '..#####..', '....#....', '...###...'],
  arm: ['.##......', '.###.....', '..###....', '...###...', '....####.', '.....####', '......##.', '.......#.', '.........'],
  leg: ['..###....', '..###....', '..###....', '...##....', '...##....', '...##....', '...##....', '...####..', '...#####.'],
  stim: ['.......#.', '......#.#', '.....###.', '....###..', '...###...', '..###....', '.#.#.....', '#........', '.........'],
};
export type GlyphName = keyof typeof GLYPHS;

export function Glyph({ name, className, size = 18, flip }: { name: GlyphName; className?: string; size?: number; flip?: boolean }) {
  const rows = GLYPHS[name];
  return (
    <svg viewBox="0 0 9 9" width={size} height={size} className={className} aria-hidden shapeRendering="crispEdges" fill="currentColor" style={flip ? { transform: 'scaleX(-1)' } : undefined}>
      {rows.flatMap((row, y) => row.split('').map((ch, x) => ch === '#' ? <rect key={`${x}-${y}`} x={x} y={y} width={1} height={1} /> : null))}
    </svg>
  );
}

const SLOT_GLYPH: Record<AugmentationSlot | 'stim', GlyphName> = {
  brain: 'brain', eyes: 'eye', ears: 'ear', nose: 'nose', lungs: 'lungs', misc: 'spine',
  left_arm: 'arm', right_arm: 'arm', left_leg: 'leg', right_leg: 'leg', stim: 'stim',
};

/** The pixel icon for a body slot (or a stim). Left limbs are mirrored. */
export function SlotIcon({ slot, size = 22, className }: { slot?: AugmentationSlot | 'stim'; size?: number; className?: string }) {
  return <Glyph name={slot ? SLOT_GLYPH[slot] : 'implant'} size={size} className={className} flip={slot === 'left_arm' || slot === 'left_leg'} />;
}
