import { useEffect, useRef, type ReactNode, type ButtonHTMLAttributes } from 'react';
import { drawDoll, type DollSpec } from '@/lib/rendering/dolls';
import type { ItemRarity } from '@/lib/combat/types';
import type { AttackPatternType, AugmentationSlot, CombatAction, PlayerClass } from '@/lib/combat/types';
import { attackFootprint, attackPatternOf } from '@/lib/engine/fight';

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
      <div className={cx('relative flex-1 overflow-y-auto overflow-x-hidden overscroll-x-none no-scrollbar', className)}>
        <div className="relative mx-auto w-full max-w-[var(--col)]">{children}</div>
      </div>
      {footer && (
        <div className="relative bg-gradient-to-t from-hud-bg via-hud-bg/95 to-transparent px-4 pt-4" style={{ paddingBottom: 'max(16px, env(safe-area-inset-bottom))' }}>
          <div className="mx-auto w-full max-w-[var(--col)]">{footer}</div>
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

type BtnProps = ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'secondary' | 'danger' | 'ghost' | 'gold' | 'strike'; size?: 'md' | 'lg' | 'sm' };

const BTN_VARIANT = {
  primary: 'key key-primary text-[#04131a]',
  gold: 'key key-gold text-[#1a1003]',
  secondary: 'key text-hud-text',
  danger: 'key key-danger text-rose-300',
  /** Carry out the chosen move: clearly not the same as passing */
  strike: 'key key-strike text-white',
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
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 p-4 sm:items-center" onClick={onCancel}>
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
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/70" onClick={onClose}>
      <div className="rise-in slab-solid w-full max-w-[var(--col)] rounded-t-[28px]" onClick={e => e.stopPropagation()} style={{ paddingBottom: 'max(16px, env(safe-area-inset-bottom))' }}>
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
      <div className="rise-in relative flex w-full max-w-[var(--col)] flex-col">
        <header className="flex items-center gap-2 px-4 pb-1" style={{ paddingTop: 'max(14px, env(safe-area-inset-top))' }}>
          {/* Back: a real button, so it reads as the way out */}
          <button onClick={onClose} className="key inline-flex max-w-full items-center gap-2 rounded-full py-2.5 pl-3 pr-4 text-[14px] font-semibold text-hud-text">
            <Glyph name="back" size={14} className="shrink-0 text-sys" />
            <span className="truncate">{back}</span>
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
 * A tiny pixel picture of an attack, on an empty 7x7 board with you (cyan) in
 * the middle: every tile it can reach, brighter where it lands harder on an
 * enemy standing there (from behind brightest, from the side next). Arm moves
 * aim only on their own side. The tiles come from the fight engine's own rules
 * (attackFootprint).
 */
/** A move's damage type as a colour: amber when physical (wears structure), violet when special (goes to health and heats), blended between. */
export function damageTypeRgb(physicalRatio = 0.7): [number, number, number] {
  const t = Math.max(0, Math.min(1, physicalRatio));
  const mix = (a: number, b: number) => Math.round(b + (a - b) * t);
  return [mix(255, 167), mix(180, 139), mix(58, 250)];
}
/** A move's damage type in words. */
export function damageTypeText(physicalRatio = 0.7): string {
  const t = Math.round(Math.max(0, Math.min(1, physicalRatio)) * 100);
  return t >= 100 ? 'Physical' : t <= 0 ? 'Special' : t >= 50 ? `${t}% physical` : `${100 - t}% special`;
}

/** Whether a move moves anyone: shoves what it hits (push), drags it in (pull), carries you down the lane (dash), or steps you back (retreat). */
export function moveKind(action: CombatAction, playerClass: PlayerClass = 'none'): 'push' | 'pull' | 'dash' | 'retreat' | 'leap' | null {
  const p = attackPatternOf(action, playerClass), fx = action.effects ?? {};
  if (fx.pull || p === 'grapple') return 'pull';
  if (fx.knock || p === 'knockback') return 'push';
  if (fx.dash || p === 'charge') return 'dash';
  if (fx.pounce || fx.vault) return 'leap';
  if (fx.retreat) return 'retreat';
  return null;
}

export function Footprint({ action, pattern, playerClass = 'none', className, cell = 4 }: { action?: CombatAction; pattern?: AttackPatternType; playerClass?: PlayerClass; className?: string; /** Size of one tile in pixels (bigger on cards, small on fight buttons). */ cell?: number }) {
  const act: CombatAction | null = action ?? (pattern ? { type: 'attack', name: '', description: '', attackPattern: pattern } : null);
  if (!act) return null;
  const n = 7;
  const { me, tiles } = attackFootprint(act, playerClass, n);
  const at = new Map(tiles.map(t => [`${t.row},${t.col}`, t.mult]));
  const gap = 1, size = n * (cell + gap) - gap;
  const width = size;
  // How hard it lands there (side, back and the shape's sweet spot together): the stronger, the bolder
  const [cr, cg, cb] = damageTypeRgb(act.physicalRatio);
  const shade = (m: number) => `rgba(${cr},${cg},${cb},${Math.max(0.18, Math.min(1, (m - 0.55) / 0.95)).toFixed(2)})`;
  const moves = moveKind(act, playerClass);
  const far = Math.max(0, ...tiles.map(t => Math.max(Math.abs(t.row - me.row), Math.abs(t.col - me.col))));
  const x0 = (c: number) => c * (cell + gap), mid = (k: number) => k * (cell + gap) + cell / 2;
  // A small arrow in a tile, pointing away from you (a shove) or toward you (a drag)
  const arrow = (r: number, c: number, toward: boolean) => {
    const dy = Math.sign(r - me.row) * (toward ? -1 : 1), dx = Math.sign(c - me.col) * (toward ? -1 : 1);
    const len = Math.hypot(dx, dy) || 1, ux = dx / len, uy = dy / len, s = cell * 0.36;
    const cx = mid(c), cy = mid(r);
    const pts = [[cx + ux * s, cy + uy * s], [cx - ux * s * 0.6 - uy * s * 0.75, cy - uy * s * 0.6 + ux * s * 0.75], [cx - ux * s * 0.6 + uy * s * 0.75, cy - uy * s * 0.6 - ux * s * 0.75]];
    return <polygon key={`a${r}-${c}`} points={pts.map(p => p.map(v => v.toFixed(2)).join(',')).join(' ')} fill="#1a0f02" />;
  };
  return (
    <svg viewBox={`0 0 ${width} ${size}`} width={width} height={size} className={className} aria-hidden shapeRendering="crispEdges">
      <g>
      {Array.from({ length: n * n }, (_, k) => {
        const r = Math.floor(k / n), c = k % n, m = at.get(`${r},${c}`);
        const fill = r === me.row && c === me.col ? '#38d6f0' : m !== undefined ? shade(m) : 'rgba(255,255,255,0.07)';
        return <rect key={k} x={x0(c)} y={x0(r)} width={cell} height={cell} rx={1} fill={fill} />;
      })}
      {cell >= 5 && (moves === 'push' || moves === 'pull') && tiles.map(t => arrow(t.row, t.col, moves === 'pull'))}
      {cell >= 5 && moves === 'leap' && tiles.map(t => (
        <circle key={`l${t.row}-${t.col}`} cx={mid(t.col)} cy={mid(t.row)} r={cell * 0.28} fill="none" stroke="#38d6f0" strokeWidth={Math.max(0.8, cell * 0.14)} />
      ))}
      {cell >= 5 && moves === 'dash' && tiles.filter(t => Math.max(Math.abs(t.row - me.row), Math.abs(t.col - me.col)) === far).map(t => (
        <circle key={`d${t.row}-${t.col}`} cx={mid(t.col)} cy={mid(t.row)} r={cell * 0.22} fill="#38d6f0" />
      ))}
      </g>
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
  // Which way a hall runs on the turned map (west-facing ones are these, mirrored)
  way_e: ['.........', '.....#...', '.....##..', '.....###.', '#########', '.....###.', '.....##..', '.....#...', '.........'],
  way_n: ['....#....', '...###...', '..#####..', '.#######.', '....#....', '....#....', '....#....', '....#....', '....#....'],
  way_s: ['....#....', '....#....', '....#....', '....#....', '....#....', '.#######.', '..#####..', '...###...', '....#....'],
  way_ne: ['.........', '...#####.', '......##.', '.....#.#.', '....#..#.', '...#...#.', '..#......', '.#.......', '.........'],
  way_se: ['.........', '.#.......', '..#......', '...#...#.', '....#..#.', '.....#.#.', '......##.', '...#####.', '.........'],
  back: ['.........', '.....##..', '....##...', '...##....', '..##.....', '...##....', '....##...', '.....##..', '.........'],
  strain: ['....#....', '...##....', '...###...', '..####.#.', '.######..', '.###.###.', '.##...##.', '..#####..', '.........'],
  stim: ['.......#.', '......#.#', '.....###.', '....###..', '...###...', '..###....', '.#.#.....', '#........', '.........'],
  gun: ['.........', '.#######.', '########.', '########.', '.###.#...', '.##.##...', '.##......', '.##......', '.........'],
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

const SLOT_GLYPH: Record<AugmentationSlot | 'stim' | 'gun', GlyphName> = {
  brain: 'brain', eyes: 'eye', ears: 'ear', nose: 'nose', lungs: 'lungs', misc: 'spine',
  left_arm: 'arm', right_arm: 'arm', left_leg: 'leg', right_leg: 'leg', stim: 'stim', gun: 'gun',
};

/** The pixel icon for a body slot (or a stim). Left limbs are mirrored. */
export function SlotIcon({ slot, size = 22, className }: { slot?: AugmentationSlot | 'stim' | 'gun'; size?: number; className?: string }) {
  return <Glyph name={slot ? SLOT_GLYPH[slot] : 'implant'} size={size} className={className} flip={slot === 'left_arm' || slot === 'left_leg'} />;
}

/** A character drawn large and breathing (idle), e.g. the host on the Self page. */
export function DollView({ spec, size = 168 }: { spec: DollSpec; size?: number }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const key = JSON.stringify(spec);
  useEffect(() => {
    let frame = 0, alive = true;
    const draw = () => {
      const c = ref.current; const ctx = c?.getContext('2d');
      if (!c || !ctx || !alive) return;
      ctx.clearRect(0, 0, c.width, c.height);
      const box = c.height * 0.86;
      drawDoll(ctx, spec, (c.width - box) / 2, c.height - box - c.height * 0.04, box, 'idle', frame % 2);
      frame++;
    };
    draw();
    const t = window.setInterval(draw, 600);
    return () => { alive = false; window.clearInterval(t); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  return <canvas ref={ref} width={size * 2} height={size * 2} style={{ width: size, height: size, imageRendering: 'pixelated' }} aria-hidden />;
}
