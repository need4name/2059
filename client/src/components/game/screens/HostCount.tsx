// The chapter's end, before its salvage: how many hosts it took (marked with the run's difficulty), the fewest
// this device has taken on the same setting, and how long has gone by since the first host woke.
import { Screen, Label, Btn, cx } from '../hud';
import { DIFFICULTY } from '@/lib/engine/difficulty';
import { spanText } from '@/lib/engine/clock';
import { CHAPTERS } from '@/lib/combat/chapters';
import type { Difficulty } from '@/lib/slots';
import { dailyDay } from '@/lib/daily';

const ORDINAL = ['one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight'];
/** More hosts than this and the row of bodies ends in "+N". */
const SHOWN = 48;

export interface HostCountProps { chapter: string; hosts: number; total: number; fewest: number | null; hours: number; difficulty: Difficulty; onDone: () => void }

export function HostCount({ chapter, hosts, total, fewest, hours, difficulty, onDone }: HostCountProps) {
  const n = CHAPTERS.findIndex(c => c.id === chapter);
  const name = CHAPTERS[n]?.name ?? '';
  const best = fewest === null ? hosts : Math.min(fewest, hosts);
  const newFewest = fewest !== null && hosts < fewest;
  return (
    <Screen className="px-4" footer={<div className="px-4"><Btn variant="primary" size="lg" className="w-full" onClick={onDone}>Go on</Btn></div>}>
      <div className="rise-in pt-12 text-center">
        <Label className="justify-center">Chapter {ORDINAL[n] ?? n + 1}</Label>
        <h1 className="mt-2 font-display text-[26px] font-semibold text-hud-text">{name}</h1>
      </div>
      <div className="rise-in slab mt-8 rounded-[28px] p-6 text-center">
        <div className="text-[13px] text-hud-dim">It took</div>
        <div className="mt-1 font-display text-[72px] font-semibold leading-none text-hud-text">{hosts}</div>
        <div className="mt-2 text-[15px] text-hud-text/80">{hosts === 1 ? 'host' : 'hosts'}</div>
        {total > hosts && <div className="mt-1 text-[13px] text-hud-dim">{total} in all</div>}
        <div className="mt-4 inline-flex items-center gap-2 rounded-full bg-white/[0.06] px-3.5 py-1.5 text-[13px] font-semibold text-sys">{DIFFICULTY[difficulty].label}</div>
        {/* Every host as a small body: the ones lost dark, the one that made it lit */}
        <div className="mt-6 flex flex-wrap items-center justify-center gap-1.5" aria-hidden>
          {Array.from({ length: Math.min(hosts, SHOWN) }, (_, i) => (
            <span key={i} className={cx('h-5 w-3 rounded-[4px]', i === Math.min(hosts, SHOWN) - 1 ? 'bg-sys shadow-[0_0_10px_rgba(56,214,240,0.6)]' : 'bg-white/15')} />
          ))}
          {hosts > SHOWN && <span className="ml-1 text-[12px] text-hud-dim">+{hosts - SHOWN}</span>}
        </div>
      </div>
      <div className={cx('rise-in mt-4 grid gap-3 pb-6', dailyDay ? 'grid-cols-1' : 'grid-cols-2')}>
        {/* Today's run keeps its own records */}
        {!dailyDay && <div className="slab rounded-2xl p-4">
          <div className="text-[12px] text-hud-dim">Your fewest here</div>
          <div className="mt-1 flex flex-wrap items-baseline gap-x-2 font-display text-[22px] font-semibold text-cred">
            {best} <span className="text-[13px] font-medium text-hud-dim">{DIFFICULTY[difficulty].label}</span>
          </div>
          {fewest === null && <div className="mt-1 text-[12px] text-hud-faint">The first time through</div>}
          {newFewest && <div className="mt-1 text-[12px] font-semibold text-cred">Down from {fewest}</div>}
        </div>}
        <div className="slab rounded-2xl p-4">
          <div className="text-[12px] text-hud-dim">Time gone by</div>
          <div className="mt-1 font-display text-[22px] font-semibold text-hud-text">{spanText(hours)}</div>
        </div>
      </div>
    </Screen>
  );
}
