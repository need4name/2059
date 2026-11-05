import { useState } from 'react';
import { Btn, ConfirmDialog, Glyph } from '../hud';
import { useCombat } from '@/lib/stores/useCombat';
import { dailyDay, dailyRecords, todayKey, startDaily, endDaily } from '@/lib/daily';

export function TitleScreen({ onContinue, onNewGame }: { onContinue: () => void; onNewGame: () => void }) {
  const { introCompleted, progression, bossLevel } = useCombat();
  const hasSave = introCompleted || progression.deathCount > 0 || bossLevel > 1;
  const [confirmNew, setConfirmNew] = useState(false);
  const [confirmLeave, setConfirmLeave] = useState(false);
  const best = dailyRecords()[todayKey()];

  return (
    <div className="absolute inset-0 flex flex-col overflow-hidden bg-hud-bg">
      {/* Night sky over the offshore city: soft glows, a warm waterline */}
      <div className="pointer-events-none absolute -left-24 -top-24 h-80 w-80 rounded-full bg-sys/10 blur-3xl" />
      <div className="pointer-events-none absolute -right-20 top-1/3 h-72 w-72 rounded-full bg-aug/10 blur-3xl" />
      <div className="pointer-events-none absolute inset-0 scanlines" />
      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-1/2 bg-gradient-to-t from-amber-500/[0.08] via-transparent to-transparent" />
      <div className="pointer-events-none absolute inset-x-10 bottom-[22%] h-px rounded-full bg-gradient-to-r from-transparent via-amber-300/30 to-transparent" />
      <div className="pointer-events-none absolute left-[22%] top-12 h-1.5 w-1.5 rounded-full bg-amber-200/80 blur-[1px] animate-pulse" />
      <div className="pointer-events-none absolute right-[28%] top-20 h-1 w-1 rounded-full bg-sys/70" />

      <div className="relative flex flex-1 flex-col items-center justify-center px-6 text-center">
        <Glyph name="signal" size={36} className="signal-pulse text-sys" />
        <h1 className="mt-6 bg-gradient-to-b from-white via-slate-200 to-slate-500 bg-clip-text font-display text-[92px] font-bold leading-none tracking-tight text-transparent drop-shadow-[0_0_30px_rgba(56,214,240,0.15)]">
          2059
        </h1>
        <p className="mt-3 font-display text-[15px] font-medium text-hud-dim">The Long Convergence</p>

        <div className="mt-14 flex w-full max-w-xs flex-col gap-3">
          {dailyDay ? (
            <>
              <div className="mb-1 text-sm text-hud-dim">Today's run · one life</div>
              <Btn variant="primary" size="lg" onClick={hasSave ? onContinue : onNewGame}>{hasSave ? 'Continue' : 'Wake'}</Btn>
              <Btn variant="ghost" size="md" onClick={() => setConfirmLeave(true)}>Back to your own game</Btn>
            </>
          ) : hasSave ? (
            <>
              <Btn variant="primary" size="lg" onClick={onContinue}>Continue</Btn>
              <Btn variant="ghost" size="md" onClick={() => setConfirmNew(true)}>New game</Btn>
              <div className="mt-1 text-xs text-hud-faint">Host {progression.deathCount + 1}</div>
            </>
          ) : (
            <Btn variant="primary" size="lg" onClick={onNewGame}>Wake</Btn>
          )}
          {!dailyDay && hasSave && (
            <Btn variant="ghost" size="md" onClick={startDaily}>
              Today's run{best ? <span className="ml-2 text-hud-faint">best: level {best.best}</span> : null}
            </Btn>
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
      <ConfirmDialog
        open={confirmLeave}
        title="Leave today's run?"
        body="This run ends here and won't count. Your own game is just as you left it."
        confirmLabel="Leave"
        onCancel={() => setConfirmLeave(false)}
        onConfirm={() => endDaily(null)}
      />
    </div>
  );
}
