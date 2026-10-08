import { useState } from 'react';
import { Btn, ConfirmDialog } from '../hud';
import { useCombat } from '@/lib/stores/useCombat';

export function TitleScreen({ onContinue, onNewGame }: { onContinue: () => void; onNewGame: () => void }) {
  const { introCompleted, progression, bossLevel } = useCombat();
  const hasSave = introCompleted || progression.deathCount > 0 || bossLevel > 1;
  const [confirmNew, setConfirmNew] = useState(false);

  return (
    <div className="absolute inset-0 flex flex-col overflow-hidden bg-hud-bg">
      <div className="pointer-events-none absolute inset-0 scanlines" />
      {/* Horizon glow: the offshore city on the waterline */}
      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-1/2 bg-gradient-to-t from-amber-500/[0.07] via-transparent to-transparent" />
      <div className="pointer-events-none absolute inset-x-0 bottom-[22%] h-px bg-gradient-to-r from-transparent via-amber-400/30 to-transparent" />
      <div className="pointer-events-none absolute left-[22%] top-10 h-1.5 w-1.5 rounded-full bg-amber-300/70 blur-[1px] animate-pulse" />
      <div className="pointer-events-none absolute right-[30%] top-16 h-1 w-1 rounded-full bg-sys/60 blur-[1px]" />

      <div className="relative flex flex-1 flex-col items-center justify-center px-6 text-center">
        <div className="font-mono text-[11px] uppercase tracking-[0.4em] text-hud-dim">Offshore Sector 7</div>
        <h1 className="mt-4 font-display text-7xl font-semibold tracking-[0.18em] text-hud-text sm:text-8xl" style={{ textShadow: '0 0 30px rgba(56,214,240,0.18)' }}>
          2059
        </h1>
        <div className="mt-3 h-px w-24 bg-gradient-to-r from-transparent via-sys/60 to-transparent" />
        <p className="mt-4 font-mono text-xs uppercase tracking-[0.35em] text-hud-dim">The Long Convergence</p>
        <p className="mt-8 max-w-xs text-sm leading-relaxed text-hud-dim">
          Hunt augmented enforcers. Tear the implants from their frames. Install them in your own. When you die, your mind is restored to a new body.
        </p>

        <div className="mt-10 flex w-full max-w-xs flex-col gap-3">
          {hasSave ? (
            <>
              <Btn variant="primary" size="lg" onClick={onContinue}>Continue</Btn>
              <Btn size="md" onClick={() => setConfirmNew(true)}>New game</Btn>
              <div className="mt-1 font-mono text-[11px] text-hud-faint">
                Threat LV {bossLevel} · Reboots {progression.deathCount}
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
