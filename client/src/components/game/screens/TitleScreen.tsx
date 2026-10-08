import { useState } from 'react';
import { Btn, ConfirmDialog } from '../hud';
import { useCombat } from '@/lib/stores/useCombat';

export function TitleScreen({ onContinue, onNewGame }: { onContinue: () => void; onNewGame: () => void }) {
  const { introCompleted, progression, bossLevel } = useCombat();
  const hasSave = introCompleted || progression.deathCount > 0 || bossLevel > 1;
  const [confirmNew, setConfirmNew] = useState(false);

  return (
    <div className="absolute inset-0 flex flex-col overflow-hidden bg-hud-bg">
      {/* Night sky over the offshore city: soft glows, a warm waterline */}
      <div className="pointer-events-none absolute -left-24 -top-24 h-80 w-80 rounded-full bg-sys/10 blur-3xl" />
      <div className="pointer-events-none absolute -right-20 top-1/3 h-72 w-72 rounded-full bg-aug/10 blur-3xl" />
      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-1/2 bg-gradient-to-t from-amber-500/[0.08] via-transparent to-transparent" />
      <div className="pointer-events-none absolute inset-x-10 bottom-[22%] h-px rounded-full bg-gradient-to-r from-transparent via-amber-300/30 to-transparent" />
      <div className="pointer-events-none absolute left-[22%] top-12 h-1.5 w-1.5 rounded-full bg-amber-200/80 blur-[1px] animate-pulse" />
      <div className="pointer-events-none absolute right-[28%] top-20 h-1 w-1 rounded-full bg-sys/70" />

      <div className="relative flex flex-1 flex-col items-center justify-center px-6 text-center">
        <div className="text-sm font-medium text-hud-dim">Offshore Sector 7</div>
        <h1 className="mt-3 bg-gradient-to-b from-white to-slate-400 bg-clip-text font-display text-[88px] font-bold leading-none tracking-tight text-transparent">
          2059
        </h1>
        <p className="mt-3 font-display text-base font-semibold text-sys/90">The Long Convergence</p>
        <p className="mt-6 max-w-xs text-[15px] leading-relaxed text-hud-dim">
          Hunt augmented enforcers. Take their implants and install them in your own body. When you die, your mind wakes up in a new one.
        </p>

        <div className="mt-10 flex w-full max-w-xs flex-col gap-3">
          {hasSave ? (
            <>
              <Btn variant="primary" size="lg" onClick={onContinue}>Continue</Btn>
              <Btn size="md" onClick={() => setConfirmNew(true)}>New game</Btn>
              <div className="mt-1 text-xs text-hud-faint">
                Threat {bossLevel} · {progression.deathCount} reboot{progression.deathCount === 1 ? '' : 's'}
              </div>
            </>
          ) : (
            <Btn variant="primary" size="lg" onClick={onNewGame}>Begin</Btn>
          )}
        </div>
      </div>

      <ConfirmDialog
        open={confirmNew}
        title="Start a new game?"
        body="Your saved progress, implants and credits will be wiped."
        confirmLabel="Wipe and start"
        danger
        onCancel={() => setConfirmNew(false)}
        onConfirm={() => { setConfirmNew(false); onNewGame(); }}
      />
    </div>
  );
}
