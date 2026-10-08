import type { ReactNode, ButtonHTMLAttributes } from 'react';
import type { ItemRarity } from '@/lib/combat/types';

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
    <div className="absolute inset-0 flex flex-col bg-hud-bg">
      <div className="pointer-events-none absolute inset-0 ambient" />
      <div className={cx('relative flex-1 overflow-y-auto no-scrollbar', className)}>{children}</div>
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
  return <div className={cx('text-[13px] font-semibold text-hud-dim', className)}>{children}</div>;
}

/** Rounded surface. Use `raised` for something sitting on another card. */
export function Card({ children, className, raised, onClick }: { children: ReactNode; className?: string; raised?: boolean; onClick?: () => void }) {
  return (
    <div onClick={onClick} className={cx('rounded-2xl', raised ? 'bg-white/[0.05]' : 'bg-hud-panel/80 shadow-[0_8px_30px_rgba(0,0,0,0.25)] ring-1 ring-white/[0.05]', className)}>
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
  sys: 'bg-gradient-to-r from-cyan-500 to-sys',
  hostile: 'bg-gradient-to-r from-rose-600 to-hostile',
  cred: 'bg-gradient-to-r from-amber-500 to-cred',
  aug: 'bg-aug',
  ok: 'bg-ok',
  dim: 'bg-hud-dim',
  structure: 'bg-gradient-to-r from-slate-500 to-slate-300',
};

export function Meter({ value, max, tone = 'sys', className, align = 'left' }: { value: number; max: number; tone?: Tone; className?: string; align?: 'left' | 'right' }) {
  const pct = max > 0 ? Math.max(0, Math.min(100, (value / max) * 100)) : 0;
  return (
    <div className={cx('h-1.5 overflow-hidden rounded-full bg-white/[0.07]', className)}>
      <div className={cx('h-full rounded-full transition-[width] duration-300', METER_FILL[tone], align === 'right' && 'ml-auto')} style={{ width: `${pct}%` }} />
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
  primary: 'bg-gradient-to-r from-cyan-400 to-sys text-[#03121a] shadow-[0_6px_24px_rgba(56,214,240,0.25)] hover:brightness-110 disabled:from-hud-raised disabled:to-hud-raised disabled:text-hud-faint disabled:shadow-none',
  gold: 'bg-gradient-to-r from-amber-400 to-cred text-[#1a1003] shadow-[0_6px_24px_rgba(242,179,61,0.22)] hover:brightness-110 disabled:from-hud-raised disabled:to-hud-raised disabled:text-hud-faint disabled:shadow-none',
  secondary: 'bg-white/[0.07] text-hud-text hover:bg-white/[0.11] disabled:text-hud-faint disabled:hover:bg-white/[0.07]',
  danger: 'bg-hostile/10 text-rose-300 hover:bg-hostile/20',
  ghost: 'bg-transparent text-hud-dim hover:text-hud-text hover:bg-white/[0.05]',
};
const BTN_SIZE = {
  sm: 'h-9 px-3.5 text-[13px] rounded-xl',
  md: 'h-11 px-4 text-sm rounded-xl',
  lg: 'h-14 px-6 text-base rounded-2xl',
};

export function Btn({ variant = 'secondary', size = 'md', className, ...rest }: BtnProps) {
  return (
    <button
      {...rest}
      className={cx(
        'inline-flex select-none items-center justify-center gap-2 font-display font-semibold transition disabled:cursor-not-allowed',
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
      <div role="dialog" aria-modal="true" className="rise-in w-full max-w-sm rounded-3xl bg-hud-panel p-6 shadow-2xl ring-1 ring-white/[0.06]" onClick={e => e.stopPropagation()}>
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
      <div className="rise-in w-full max-w-[520px] rounded-t-3xl bg-hud-panel shadow-2xl ring-1 ring-white/[0.06]" onClick={e => e.stopPropagation()} style={{ paddingBottom: 'max(16px, env(safe-area-inset-bottom))' }}>
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
