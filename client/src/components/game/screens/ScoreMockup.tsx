// Mockups only (dev routes): the end-of-chapter host count, the difficulty choice, Challenge mode, and the
// once-a-fight keys some memory neurons add to the fight bar. Nothing here is wired to the game.
import { Screen, Label, Btn, Glyph, cx } from '../hud';

const Pip = ({ on }: { on: boolean }) => <span className={cx('h-2 w-2 rounded-full', on ? 'bg-cred' : 'bg-white/15')} />;

export function MockEnd() {
  return (
    <Screen className="px-4" footer={<div className="px-4"><Btn variant="primary" className="w-full">Go on</Btn></div>}>
      <div className="pt-10 text-center">
        <Label>The Indian Ocean</Label>
        <h1 className="mt-2 font-display text-[26px] font-semibold text-hud-text">The King is down</h1>
      </div>
      <div className="slab mt-8 rounded-[28px] p-6 text-center">
        <div className="text-[13px] text-hud-dim">It took</div>
        <div className="mt-1 font-display text-[72px] font-semibold leading-none text-hud-text">9</div>
        <div className="mt-2 text-[15px] text-hud-text/80">hosts</div>
        <div className="mt-4 inline-flex items-center gap-2 rounded-full bg-white/[0.06] px-3.5 py-1.5 text-[13px] font-semibold text-sys">Normal</div>
        {/* every host as a small body: the ones lost dark, the one that made it lit */}
        <div className="mt-6 flex flex-wrap justify-center gap-1.5">
          {Array.from({ length: 9 }, (_, i) => <span key={i} className={cx('h-5 w-3 rounded-[4px]', i === 8 ? 'bg-sys' : 'bg-white/15')} />)}
        </div>
      </div>
      <div className="mt-4 grid grid-cols-2 gap-3">
        <div className="slab rounded-2xl p-4"><div className="text-[12px] text-hud-dim">Your fewest here</div><div className="mt-1 font-display text-[22px] font-semibold text-cred">7 <span className="text-[13px] font-medium text-hud-dim">Normal</span></div></div>
        <div className="slab rounded-2xl p-4"><div className="text-[12px] text-hud-dim">Time gone by</div><div className="mt-1 font-display text-[22px] font-semibold text-hud-text">5 months</div></div>
      </div>
    </Screen>
  );
}

export function MockDifficulty() {
  const rows = [
    { name: 'Easy', text: 'Enemies are softer and slower to press you.', state: 'open' },
    { name: 'Normal', text: 'As it is meant to be played.', state: 'picked' },
    { name: 'Hard', text: 'Enemies hit harder and play sharper.', state: 'locked', lock: 'Finish the story on Normal' },
  ];
  return (
    <Screen className="px-4" footer={<div className="px-4"><Btn variant="primary" className="w-full">Wake</Btn></div>}>
      <div className="pt-10"><Label>New signal</Label><h1 className="mt-2 font-display text-[24px] font-semibold text-hud-text">How hard?</h1>
        <p className="mt-2 text-sm leading-relaxed text-hud-dim">Your host count is marked with the setting it was earned on.</p></div>
      <div className="mt-6 space-y-3">
        {rows.map(r => (
          <div key={r.name} className={cx('flex items-center gap-4 rounded-[22px] p-4', r.state === 'picked' ? 'key key-selected' : 'key', r.state === 'locked' && 'opacity-50')}>
            <div className="min-w-0 flex-1 text-left">
              <div className="font-display text-[17px] font-semibold text-hud-text">{r.name}</div>
              <div className="mt-0.5 text-[13px] leading-snug text-hud-dim">{r.state === 'locked' ? r.lock : r.text}</div>
            </div>
            {r.state === 'locked' ? <Glyph name="strain" className="text-hud-faint" /> : <span className={cx('h-4 w-4 rounded-full border-2', r.state === 'picked' ? 'border-sys bg-sys' : 'border-white/25')} />}
          </div>
        ))}
      </div>
      <div className="key mt-6 flex items-center gap-4 rounded-[22px] p-4">
        <Glyph name="strain" className="text-cred" />
        <div className="min-w-0 flex-1 text-left"><div className="font-display text-[16px] font-semibold text-hud-text">Challenges</div><div className="text-[13px] text-hud-dim">2 of 8 open</div></div>
        <Glyph name="back" flip className="text-hud-faint" size={14} />
      </div>
    </Screen>
  );
}

export function MockChallenge() {
  const list = [
    { name: 'Short on bodies', mod: 'Ten hosts. No more.', need: 'Finish chapter one', open: true, on: true },
    { name: 'Glass', mod: 'Everyone deals double damage.', need: 'Finish chapter one in 8 hosts or fewer', open: true, on: false },
    { name: 'Unclassified', mod: 'No firmware, ever.', need: 'Finish chapter one in 6 hosts or fewer', open: false },
    { name: 'Bare', mod: 'Three move slots. No memory network.', need: 'Finish chapter one in 4 hosts or fewer', open: false },
    { name: 'Enforcer only', mod: 'Every host wakes as an Enforcer.', need: 'Beat the King as an Enforcer', open: false },
    { name: 'Bad weather', mod: 'It always rains, and it is always night.', need: 'Beat a boss in the rain', open: false },
    { name: 'No second look', mod: 'The last body keeps nothing.', need: 'Take back five parts from your own bodies', open: false },
    { name: 'One breath', mod: 'One host. Lose it and the run ends.', need: 'Finish chapter one on Hard', open: false },
  ];
  return (
    <Screen className="px-4">
      <div className="flex items-center gap-3 pt-4"><button className="key flex h-11 w-11 items-center justify-center rounded-2xl"><Glyph name="back" /></button><h1 className="font-display text-[20px] font-semibold text-hud-text">Challenges</h1></div>
      <p className="mt-3 text-sm leading-relaxed text-hud-dim">Earn one, then switch it on for a run. A run's host count is marked with every challenge it carried.</p>
      <div className="mt-4 space-y-2.5">
        {list.map(c => (
          <div key={c.name} className={cx('slab flex items-center gap-3 rounded-[20px] p-3.5', !c.open && 'opacity-55')}>
            <div className="min-w-0 flex-1">
              <div className={cx('font-display text-[15px] font-semibold', c.open ? 'text-hud-text' : 'text-hud-dim')}>{c.name}</div>
              <div className="mt-0.5 text-[13px] leading-snug text-hud-text/75">{c.open ? c.mod : c.need}</div>
            </div>
            {c.open ? <div className={cx('key rounded-full px-4 py-2 text-[13px] font-semibold', c.on ? 'key-gold' : '')}>{c.on ? 'On' : 'Off'}</div> : <Glyph name="strain" className="text-hud-faint" />}
          </div>
        ))}
      </div>
    </Screen>
  );
}

/** The fight bar with the once-a-fight keys the memory network can add (left of Stims), spent ones dimmed. */
export function MockFightKeys() {
  const Key = ({ name, sub, spent, tone }: { name: string; sub: string; spent?: boolean; tone: string }) => (
    <div className={cx('key flex min-h-[52px] flex-1 flex-col items-center justify-center rounded-2xl px-1 text-center', spent && 'opacity-40 grayscale')}>
      <span className={cx('font-display text-[12px] font-semibold leading-tight', tone)}>{name}</span>
      <span className="text-[10px] leading-tight text-hud-faint">{sub}</span>
    </div>
  );
  return (
    <div className="flex h-full flex-col justify-end bg-hud-bg">
      <div className="px-4 pb-3 text-[13px] leading-relaxed text-hud-dim">
        <p className="font-display text-[15px] font-semibold text-hud-text">Once-a-fight keys</p>
        <p className="mt-1">A neuron that gives you a choice adds a key in a row above the tools. Each shows a pip while it's still to use and dims once spent. A host with none of these never sees the row.</p>
        <p className="mt-2">Switch and Follow through need no key: tap an ally beside you to swap, or tap an enemy after a kill to turn and face it. Opening read shows a ghost of each enemy where it will stand. Old debts is an extra line in the Grey Lane.</p>
      </div>
      <div className="slab-solid rounded-t-[28px] px-3 pb-4 pt-3">
        <div className="mb-2 flex items-center gap-2 px-1"><span className="text-[12px] text-hud-dim">Overload</span><div className="h-2 flex-1 rounded-full bg-black/40" /></div>
        <div className="mb-2 flex gap-2">
          <div className="relative flex-1"><Key name="Bleed off" sub="act again, -10% health" tone="text-rose-300" /><span className="absolute right-2 top-2"><Pip on /></span></div>
          <div className="relative flex-1"><Key name="Override" sub="next move can't misfire" tone="text-orange-300" /><span className="absolute right-2 top-2"><Pip on /></span></div>
          <div className="relative flex-1"><Key name="On my mark" sub="ally acts after you" tone="text-teal-300" spent /><span className="absolute right-2 top-2"><Pip on={false} /></span></div>
        </div>
        <div className="grid grid-cols-3 gap-2">
          {['Strike', 'VK-4 Drive', 'Brace'].map((n, i) => <div key={n} className="key flex min-h-[64px] flex-col items-center justify-center rounded-2xl"><span className={cx('font-display text-[13px] font-semibold', i === 2 ? 'text-sys' : 'text-hud-text')}>{n}</span><span className="text-[11px] text-hud-faint">{i === 2 ? '+8 guard  -25°' : '13–18  +11°'}</span></div>)}
        </div>
        <div className="mt-2 flex gap-2"><Btn className="shrink-0 px-3.5">Stims 2</Btn><Btn className="shrink-0 px-3.5" disabled>Undo</Btn><Btn className="min-w-0 flex-1">Pass turn</Btn></div>
      </div>
    </div>
  );
}
