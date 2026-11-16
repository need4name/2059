import { useRef, useState } from 'react';
import { Btn, ConfirmDialog, Glyph, Label, cx } from '../hud';
import { useCombat } from '@/lib/stores/useCombat';
import { dailyDay, dailyRecords, todayKey, startDaily, endDaily } from '@/lib/daily';
import { SLOTS, activeSlot, openSlot, eraseSlot, slotSummary, playedAgo, type Slot } from '@/lib/slots';
import { DIFFICULTY } from '@/lib/engine/difficulty';
import { readUnlocks } from '@/lib/unlocks';

/** The title: three saves (each a run), Continue into the one this page plays, and today's run. */
export function TitleScreen({ onContinue, onNewGame }: { onContinue: () => void; onNewGame: () => void }) {
  const { introCompleted, progression, bossLevel } = useCombat();
  const hasSave = introCompleted || progression.deathCount > 0 || bossLevel > 1;
  const [confirmLeave, setConfirmLeave] = useState(false);
  const [erase, setErase] = useState<Slot | null>(null);
  const best = dailyRecords()[todayKey()];
  const saves = SLOTS.map(n => ({ n, s: slotSummary(n) }));

  if (dailyDay) return (
    <TitleFrame>
      <div className="mb-1 text-sm text-hud-dim">Today's run · one life</div>
      <Btn variant="primary" size="lg" onClick={hasSave ? onContinue : onNewGame}>{hasSave ? 'Continue' : 'Wake'}</Btn>
      <Btn variant="ghost" size="md" onClick={() => setConfirmLeave(true)}>Back to your own game</Btn>
      <ConfirmDialog open={confirmLeave} title="Leave today's run?" body="This run ends here and won't count. Your own game is just as you left it." confirmLabel="Leave" onCancel={() => setConfirmLeave(false)} onConfirm={() => endDaily(null)} />
    </TitleFrame>
  );

  return (
    <TitleFrame>
      {saves.map(({ n, s }) => s ? (
        <SaveCard key={n} n={n} here={n === activeSlot} onOpen={() => (n === activeSlot ? onContinue() : openSlot(n, 'continue'))} onErase={() => setErase(n)}>
          <div className="flex items-start gap-3">
            <div className="min-w-0 flex-1 text-left">
              <div className="truncate font-display text-[17px] font-semibold text-hud-text">{s.chapter}</div>
              <div className="mt-0.5 truncate text-[13px] text-hud-dim">{[s.room, playedAgo(s.savedAt)].filter(Boolean).join(' · ')}</div>
            </div>
            <div className="text-right"><div className="font-display text-[26px] font-semibold leading-none text-hud-text">{s.hosts}</div><div className="text-[11px] text-hud-dim">{s.hosts === 1 ? 'host' : 'hosts'}</div></div>
          </div>
          <div className="mt-3 flex items-center gap-2">
            <span className="rounded-full bg-white/[0.07] px-3 py-1 text-[12px] font-semibold text-sys">{DIFFICULTY[s.difficulty].label}</span>
            <span className="flex-1" />
            <span className="text-[12px] text-hud-faint">Hold to erase</span>
          </div>
        </SaveCard>
      ) : (
        <button key={n} onClick={() => (n === activeSlot ? onNewGame() : openSlot(n, 'new'))} className="well flex min-h-[88px] w-full items-center justify-center rounded-[24px] text-[14px] font-semibold text-hud-dim">New signal</button>
      ))}
      {hasSave && <Btn variant="primary" size="lg" className="mt-2" onClick={onContinue}>Continue</Btn>}
      {saves.some(x => x.s) && (
        <Btn variant="ghost" size="md" onClick={startDaily}>
          Today's run{best ? <span className="ml-2 text-hud-faint">best: level {best.best}</span> : null}
        </Btn>
      )}
      <ConfirmDialog
        open={erase !== null}
        title="Erase this save?"
        body="This run, its hosts and everything it found are gone for good. Your other saves, and what you've unlocked, stay."
        confirmLabel="Erase"
        danger
        onCancel={() => setErase(null)}
        onConfirm={() => { const n = erase; setErase(null); if (n) { eraseSlot(n); if (n !== activeSlot) location.reload(); } }}
      />
    </TitleFrame>
  );
}

function TitleFrame({ children }: { children: React.ReactNode }) {
  return (
    <div className="absolute inset-0 flex flex-col overflow-y-auto bg-hud-bg">
      {/* Night sky over the offshore city: a warm waterline */}
      <div className="pointer-events-none absolute inset-0 scanlines" />
      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-1/2 bg-gradient-to-t from-amber-500/[0.08] via-transparent to-transparent" />
      <div className="pointer-events-none absolute left-[22%] top-12 h-1.5 w-1.5 rounded-full bg-amber-200/80 animate-pulse" />
      <div className="pointer-events-none absolute right-[28%] top-20 h-1 w-1 rounded-full bg-sys/70" />
      <div className="relative mx-auto flex w-full max-w-[var(--col)] flex-1 flex-col items-center justify-center px-4 py-10 text-center">
        <Glyph name="signal" size={30} className="signal-pulse text-sys" />
        <h1 className="mt-4 bg-gradient-to-b from-white via-slate-200 to-slate-500 bg-clip-text font-display text-[76px] font-bold leading-none tracking-tight text-transparent">2059</h1>
        <p className="mt-2 font-display text-[14px] font-medium text-hud-dim">The Long Convergence</p>
        <div className="mt-10 flex w-full flex-col gap-3">{children}</div>
      </div>
    </div>
  );
}

/** A save: tap to open it, hold to erase it. */
function SaveCard({ n, here, onOpen, onErase, children }: { n: Slot; here: boolean; onOpen: () => void; onErase: () => void; children: React.ReactNode }) {
  const timer = useRef<number | null>(null), held = useRef(false);
  const down = () => { held.current = false; timer.current = window.setTimeout(() => { held.current = true; onErase(); }, 650); };
  const up = () => { if (timer.current) window.clearTimeout(timer.current); timer.current = null; };
  return (
    <button aria-label={`Save ${n}`} onPointerDown={down} onPointerUp={up} onPointerLeave={up} onContextMenu={e => e.preventDefault()}
      onClick={() => { if (!held.current) onOpen(); }}
      className={cx('w-full select-none rounded-[24px] p-4', here ? 'key key-selected' : 'key')}>
      {children}
    </button>
  );
}

/** A new signal: how hard. Fixed for the whole run; Hard opens once chapter one is finished on Normal. */
export function DifficultyScreen({ onBack, onBegin }: { onBack: () => void; onBegin: (d: 'easy' | 'normal' | 'hard') => void }) {
  const hardOpen = readUnlocks().hard;
  const [pick, setPick] = useState<'easy' | 'normal' | 'hard'>('normal');
  return (
    <div className="absolute inset-0 flex flex-col overflow-y-auto bg-hud-bg">
      <div className="pointer-events-none absolute inset-0 scanlines" />
      <div className="relative mx-auto flex w-full max-w-[var(--col)] flex-1 flex-col px-4 pb-6 pt-4">
        <div className="flex items-center gap-3"><button onClick={onBack} aria-label="Back" className="key flex h-11 w-11 items-center justify-center rounded-2xl"><Glyph name="back" /></button></div>
        <div className="mt-6"><Label>New signal</Label><h1 className="mt-2 font-display text-[24px] font-semibold text-hud-text">How hard?</h1>
          <p className="mt-2 text-sm leading-relaxed text-hud-dim">It holds for the whole run. Your host count is marked with the setting it was earned on.</p></div>
        <div className="mt-6 space-y-3">
          {(['easy', 'normal', 'hard'] as const).map(d => {
            const locked = d === 'hard' && !hardOpen;
            return (
              <button key={d} disabled={locked} onClick={() => setPick(d)} aria-pressed={pick === d}
                className={cx('flex w-full items-center gap-4 rounded-[22px] p-4 text-left', pick === d ? 'key key-selected' : 'key', locked && 'opacity-50')}>
                <div className="min-w-0 flex-1">
                  <div className="font-display text-[17px] font-semibold text-hud-text">{DIFFICULTY[d].label}</div>
                  <div className="mt-0.5 text-[13px] leading-snug text-hud-dim">{locked ? 'Finish chapter one on Normal' : DIFFICULTY[d].text}</div>
                </div>
                {locked ? <Glyph name="lock" className="text-hud-faint" /> : <span className={cx('h-4 w-4 rounded-full border-2', pick === d ? 'border-sys bg-sys' : 'border-white/25')} />}
              </button>
            );
          })}
        </div>
        <div className="flex-1" />
        <Btn variant="primary" size="lg" className="mt-8 w-full" onClick={() => onBegin(pick)}>Wake</Btn>
      </div>
    </div>
  );
}
