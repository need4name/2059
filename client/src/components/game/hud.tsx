import type { ReactNode, ButtonHTMLAttributes } from 'react';
import type { ItemRarity } from '@/lib/combat/types';

export const RARITY_TEXT: Record<ItemRarity, string> = {
  common: 'text-slate-300',
  uncommon: 'text-emerald-400',
  rare: 'text-sky-400',
  epic: 'text-fuchsia-400',
  legendary: 'text-amber-400',
};

export const RARITY_BORDER: Record<ItemRarity, string> = {
  common: 'border-slate-600/60',
  uncommon: 'border-emerald-600/60',
  rare: 'border-sky-500/60',
  epic: 'border-fuchsia-500/60',
  legendary: 'border-amber-500/70',
};

function cx(...parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(' ');
}

/** Full-height scrolling screen with the menu backdrop. */
export function Screen({ children, className, footer }: { children: ReactNode; className?: string; footer?: ReactNode }) {
  return (
    <div className="absolute inset-0 flex flex-col bg-hud-bg">
      <div className="pointer-events-none absolute inset-0 scanlines" />
      <div className="pointer-events-none absolute inset-x-0 top-0 h-48 bg-gradient-to-b from-sys/[0.06] to-transparent" />
      <div className={cx('relative flex-1 overflow-y-auto no-scrollbar', className)}>{children}</div>
      {footer && (
        <div className="relative border-t border-hud-line bg-hud-bg/95 px-4 pt-3" style={{ paddingBottom: 'max(14px, env(safe-area-inset-bottom))' }}>
          {footer}
        </div>
      )}
    </div>
  );
}

/** Uppercase mono label used above sections. */
export function Label({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cx('font-mono text-[11px] uppercase tracking-[0.18em] text-hud-dim', className)}>{children}</div>;
}

export function Panel({ label, right, children, className }: { label?: ReactNode; right?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={cx('border border-hud-line bg-hud-panel', className)}>
      {(label || right) && (
        <header className="flex items-center justify-between gap-3 border-b border-hud-line px-3 py-2">
          {label ? <Label>{label}</Label> : <span />}
          {right}
        </header>
      )}
      <div className="p-3">{children}</div>
    </section>
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
  structure: 'bg-slate-400',
};

export function Meter({ value, max, tone = 'sys', className, align = 'left' }: { value: number; max: number; tone?: Tone; className?: string; align?: 'left' | 'right' }) {
  const pct = max > 0 ? Math.max(0, Math.min(100, (value / max) * 100)) : 0;
  return (
    <div className={cx('h-1.5 overflow-hidden bg-hud-line', className)}>
      <div className={cx('h-full transition-[width] duration-300', METER_FILL[tone], align === 'right' && 'ml-auto')} style={{ width: `${pct}%` }} />
    </div>
  );
}

const CHIP_TONE: Record<Tone, string> = {
  sys: 'border-sys/50 text-sys bg-sys/10',
  hostile: 'border-hostile/60 text-hostile bg-hostile/10',
  cred: 'border-cred/50 text-cred bg-cred/10',
  aug: 'border-aug/50 text-aug bg-aug/10',
  ok: 'border-ok/50 text-ok bg-ok/10',
  dim: 'border-hud-line text-hud-dim bg-hud-raised',
  structure: 'border-orange-400/60 text-orange-300 bg-orange-500/10',
};

export function Chip({ tone = 'dim', pulse, children, className }: { tone?: Tone; pulse?: boolean; children: ReactNode; className?: string }) {
  return (
    <span className={cx('inline-flex items-center gap-1 border px-1.5 py-0.5 font-mono text-[10px] font-medium uppercase tracking-wider', CHIP_TONE[tone], pulse && 'animate-pulse', className)}>
      {children}
    </span>
  );
}

type BtnProps = ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'secondary' | 'danger' | 'ghost' | 'gold'; size?: 'md' | 'lg' | 'sm' };

const BTN_VARIANT = {
  primary: 'bg-sys text-hud-bg hover:bg-cyan-300 border border-sys disabled:bg-hud-raised disabled:text-hud-faint disabled:border-hud-line',
  gold: 'bg-cred text-hud-bg hover:bg-amber-300 border border-cred disabled:bg-hud-raised disabled:text-hud-faint disabled:border-hud-line',
  secondary: 'bg-hud-raised text-hud-text border border-hud-line hover:border-hud-dim hover:text-white disabled:text-hud-faint disabled:hover:border-hud-line',
  danger: 'bg-transparent text-hostile border border-hostile/40 hover:bg-hostile/10 hover:border-hostile',
  ghost: 'bg-transparent text-hud-dim border border-transparent hover:text-hud-text',
};
const BTN_SIZE = {
  sm: 'h-8 px-3 text-[11px]',
  md: 'h-11 px-4 text-xs',
  lg: 'h-14 px-5 text-sm',
};

export function Btn({ variant = 'secondary', size = 'md', className, ...rest }: BtnProps) {
  return (
    <button
      {...rest}
      className={cx(
        'inline-flex select-none items-center justify-center gap-2 font-display font-semibold uppercase tracking-[0.16em] transition-colors disabled:cursor-not-allowed',
        BTN_VARIANT[variant], BTN_SIZE[size], className,
      )}
    />
  );
}

export function Stat({ label, value, tone }: { label: string; value: ReactNode; tone?: string }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="font-mono text-[10px] uppercase tracking-[0.16em] text-hud-dim">{label}</span>
      <span className={cx('font-display text-lg font-semibold tabular-nums leading-none', tone ?? 'text-hud-text')}>{value}</span>
    </div>
  );
}

export function ConfirmDialog({ open, title, body, confirmLabel, onConfirm, onCancel, danger }: {
  open: boolean; title: string; body: ReactNode; confirmLabel: string; onConfirm: () => void; onCancel: () => void; danger?: boolean;
}) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 p-4 sm:items-center" onClick={onCancel}>
      <div role="dialog" aria-modal="true" className="rise-in w-full max-w-sm border border-hud-line bg-hud-panel p-5" onClick={e => e.stopPropagation()}>
        <h2 className="font-display text-lg font-semibold uppercase tracking-wider text-hud-text">{title}</h2>
        <div className="mt-2 text-sm leading-relaxed text-hud-dim">{body}</div>
        <div className="mt-5 grid grid-cols-2 gap-2">
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
      <div className="rise-in w-full max-w-[520px] border-t border-hud-line bg-hud-panel" onClick={e => e.stopPropagation()} style={{ paddingBottom: 'max(14px, env(safe-area-inset-bottom))' }}>
        <div className="flex items-center justify-between border-b border-hud-line px-4 py-3">
          <span className="font-display text-sm font-semibold uppercase tracking-[0.2em] text-hud-text">{title}</span>
          <Btn variant="ghost" size="sm" onClick={onClose}>Close</Btn>
        </div>
        <div className="max-h-[60vh] overflow-y-auto p-4">{children}</div>
      </div>
    </div>
  );
}
