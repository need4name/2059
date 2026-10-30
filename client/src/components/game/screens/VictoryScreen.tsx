import { useState } from 'react';
import { useCombat } from '@/lib/stores/useCombat';
import { AUGMENTATION_SLOT_NAMES } from '@/lib/combat/types';
import { Screen, Card, Label, Btn, Chip, Footprint, Glyph, SlotIcon, RARITY_TEXT, RARITY_GLOW, cx } from '../hud';
import { actionForItem, partsText } from '@/lib/combat/augments';
import { scrapValue } from '@/lib/combat/economy';
import { implantStats, stimInfo, passiveText, nameOf } from '../itemText';
import { allyDef } from '@/lib/combat/allies';
import { useAllies } from '@/lib/stores/useAllies';
import { useMap } from '@/lib/stores/useMap';
import { chapterMap } from '@/lib/engine/map';
import { nextChapter } from '@/lib/combat/chapters';

export function VictoryScreen() {
  const { currentLoot, lastVictory, continueFromVictory, boss, strip, takePart } = useCombat();
  const items = currentLoot?.items ?? [];
  const picksLeft = strip ? strip.picks - strip.taken.length : 0;
  const scrap = strip ? scrapValue(strip.bodies.flatMap(b => b.items).filter(i => !strip.taken.includes(i.id))) : 0;
  const { progress, met } = useAllies();
  const map = useMap();
  const ended = !!lastVictory?.chapterDone;
  const goToNextChapter = useCombat(s => s.goToNextChapter);
  const onward = ended ? nextChapter(map.chapter) : null;
  // The last chapter ends on a choice, not an explanation
  const endings = chapterMap().endings;
  const [chosen, setChosen] = useState<number | null>(null);
  const hosts = useCombat(s => s.progression.deathCount) + 1;
  const looks = chapterMap().rooms.filter(r => r.look);
  const chapterAllies = chapterMap().rooms.flatMap(r => (r.ally ? [r.ally] : []));

  return (
    <Screen footer={
      picksLeft > 0 ? (
        <div className="space-y-2">
          <Btn variant="primary" size="lg" className="w-full" disabled>Take one</Btn>
          <button onClick={continueFromVictory} className="w-full py-1 text-center text-[13px] text-hud-dim underline-offset-2 hover:text-hud-text hover:underline">Choose for me</button>
        </div>
      ) : ended && onward ? (
        <div className="space-y-2">
          <Btn variant="primary" size="lg" className="w-full" onClick={() => { continueFromVictory(); goToNextChapter(); }}>Go on</Btn>
          <button onClick={continueFromVictory} className="w-full py-1 text-center text-[13px] text-hud-dim underline-offset-2 hover:text-hud-text hover:underline">Stay here a while</button>
        </div>
      ) : (
        <Btn variant="primary" size="lg" className="w-full" onClick={continueFromVictory}>
          Go back
        </Btn>
      )
    }>
      <div className="pointer-events-none absolute left-1/2 top-0 h-64 w-80 -translate-x-1/2 rounded-full bg-ok/15 blur-3xl" />
      <div className="relative space-y-6 px-4 pb-6 pt-12">
        <header className="rise-in space-y-2 text-center">
          <h1 className="font-display text-[44px] font-bold leading-none tracking-tight text-white drop-shadow-[0_0_24px_rgba(74,210,149,0.3)]">{ended ? (chapterMap().endTitle ?? 'It is quiet') : 'Felled'}</h1>
          <p className="text-balance text-[15px] text-hud-dim">{ended ? chapterMap().ending : <span style={{ color: boss.spriteColor }}>{boss.name}</span>}</p>
        </header>

        {ended && (
          <div className="rise-in slab space-y-3 rounded-[28px] bg-gradient-to-b from-sys/[0.12] to-transparent p-5">
            <div className="font-display text-lg font-semibold text-white">{chapterMap().title}</div>
            <div className="grid grid-cols-2 gap-2 text-center">
              {[
                ['Hosts used', `${hosts}`],
                ['Places seen', `${map.visited.length} of ${chapterMap().rooms.length}`],
                ['Things looked at', `${looks.filter(r => map.looked.includes(r.id)).length} of ${looks.length}`],
                ...(chapterAllies.length ? [['Allies linked', `${chapterAllies.filter(id => met.includes(id)).length} of ${chapterAllies.length}`]] : []),
              ].map(([k, v]) => (
                <div key={k} className="rounded-2xl bg-black/20 px-3 py-2.5">
                  <div className="text-xs text-hud-dim">{k}</div>
                  <div className="font-display text-xl font-semibold text-white">{v}</div>
                </div>
              ))}
            </div>
            {!onward && !endings && <p className="text-sm text-hud-dim">Nothing further, yet.</p>}
            {!onward && endings && (
              <div className="space-y-2 pt-1">
                {chosen === null ? (
                  <>
                    <div className="text-sm font-semibold text-white">What do you do with it?</div>
                    {endings.map((e, n) => (
                      <button key={n} onClick={() => setChosen(n)} className="w-full rounded-2xl bg-black/25 px-4 py-3 text-left text-sm text-hud-text ring-1 ring-white/[0.06] hover:bg-black/35">{e.choice}</button>
                    ))}
                  </>
                ) : (
                  <p className="rise-in text-[15px] leading-relaxed text-white">{endings[chosen].text}</p>
                )}
              </div>
            )}
          </div>
        )}

        {strip && (
          <div className={cx('rise-in slab space-y-3 rounded-[28px] p-4 transition', picksLeft > 0 && 'bg-gradient-to-b from-cred/[0.12] to-transparent')}>
            <div className="flex items-center gap-3">
              <span className={cx('flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl', picksLeft ? 'bg-cred/15 text-cred' : 'bg-ok/15 text-ok')}><Glyph name="implant" size={20} /></span>
              <div className="min-w-0 flex-1">
                <div className="font-display text-[16px] font-semibold text-white">{picksLeft ? (picksLeft === 1 ? 'Take one' : `Take ${picksLeft}`) : 'Taken'}</div>
                <p className="text-[13px] leading-snug text-hud-dim">
                  {picksLeft
                    ? <>The rest is scrap: ¤{scrap}</>
                    : <>{strip.taken.map(id => strip.bodies.flatMap(b => b.items).find(i => i.id === id)).map(i => i ? nameOf(i) : '').join(' and ')}. The rest is scrap: ¤{scrap}</>}
                </p>
              </div>
            </div>
            {strip.bodies.map((b, bi) => (
              <div key={bi} className="space-y-2">
                <div className="text-xs font-semibold" style={{ color: b.color }}>{b.name}</div>
                <div className="grid grid-cols-1 gap-2">
                  {b.items.map(item => {
                    const taken = strip.taken.includes(item.id), gone = !taken && picksLeft === 0;
                    const move = actionForItem(item);
                    const parts = partsText(item);
                    return (
                      <button key={item.id} disabled={taken || gone} onClick={() => takePart(item.id)} aria-pressed={taken}
                        className={cx('flex items-center gap-3 rounded-2xl bg-gradient-to-r to-hud-panel/80 p-3 text-left ring-1 transition', RARITY_GLOW[item.rarity], taken ? 'ring-2 ring-sys/70' : 'ring-white/[0.05] hover:ring-white/[0.15]', gone && 'opacity-40')}>
                        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-black/25 text-xl"><SlotIcon slot={item.slot} /></span>
                        <span className="min-w-0 flex-1">
                          <span className={cx('block truncate text-sm font-semibold', RARITY_TEXT[item.rarity])}>{nameOf(item)}{item.signature ? ' ★' : ''}</span>
                          <span className="block truncate text-xs text-hud-dim">{item.slot ? AUGMENTATION_SLOT_NAMES[item.slot] : ''} · {implantStats(item)}{item.condition && item.condition !== 'pristine' ? ` · ${item.condition}` : ''}</span>
                          {parts && <span className="block truncate text-[11px] text-ok/90">{move?.name ? `${move.name}: ` : ''}{parts}</span>}
                        </span>
                        {move?.type === 'attack' && <Footprint pattern={move.attackPattern} className="shrink-0" />}
                        {taken && <Chip tone="sys">Taken</Chip>}
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        )}

        {lastVictory && (
          <Card className="grid grid-cols-3 divide-x divide-white/[0.06] py-4">
            <div className="flex flex-col items-center gap-1">
              <span className="text-xs text-hud-dim">Credits</span>
              <span className="font-display text-2xl font-semibold text-cred">+{lastVictory.gold}</span>
            </div>
            <div className="flex flex-col items-center gap-1">
              <span className="text-xs text-hud-dim">XP</span>
              <span className="font-display text-2xl font-semibold text-sys">+{lastVictory.xp}</span>
            </div>
            <div className="flex flex-col items-center gap-1">
              <span className="text-xs text-hud-dim">Points</span>
              <span className={cx('font-display text-2xl font-semibold', lastVictory.pointsGained ? 'text-cred' : 'text-hud-faint')}>+{lastVictory.pointsGained}</span>
            </div>
          </Card>
        )}

        {lastVictory?.allyLevelUps?.map(id => {
          const def = allyDef(id);
          return def ? (
            <div key={`up-${id}`} className="rounded-2xl bg-white/[0.05] px-4 py-3 text-center text-sm font-semibold" style={{ color: def.color }}>
              {def.name} reached level {progress(id).level}
            </div>
          ) : null;
        })}

        {(items.length > 0 || !strip) && <div className="space-y-2.5">
          <Label>Salvage</Label>
          {items.length === 0 ? (
            <Card raised className="px-4 py-7 text-center text-sm text-hud-faint">Nothing worth keeping.</Card>
          ) : (
            <div className="space-y-2">
              {items.map((item, i) => {
                const isStim = item.type === 'consumable';
                const stim = isStim ? stimInfo(item) : null;
                const passive = passiveText(item);
                return (
                  <div key={item.id} className={cx('rise-in flex items-center gap-3 rounded-2xl bg-gradient-to-r to-hud-panel/80 px-3 py-3 ring-1 ring-white/[0.05]', RARITY_GLOW[item.rarity])} style={{ animationDelay: `${i * 90}ms` }}>
                    <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-black/25 text-2xl">
                      <SlotIcon slot={isStim ? 'stim' : item.slot} />
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className={cx('truncate text-sm font-semibold', RARITY_TEXT[item.rarity])}>{isStim ? stim!.label : nameOf(item)}</div>
                      <div className="text-xs text-hud-dim">
                        {isStim ? stim!.effect : `${item.slot ? AUGMENTATION_SLOT_NAMES[item.slot] : ''} · ${implantStats(item)}`}
                      </div>
                      {passive && <div className="text-xs text-sys">{passive}</div>}
                    </div>
                    <Chip tone={isStim ? 'ok' : 'dim'}>{isStim ? 'Stim' : 'Implant'}</Chip>
                  </div>
                );
              })}
            </div>
          )}
        </div>}
      </div>
    </Screen>
  );
}
