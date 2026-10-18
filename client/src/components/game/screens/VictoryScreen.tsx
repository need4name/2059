import { useCombat } from '@/lib/stores/useCombat';
import { AUGMENTATION_SLOT_ICONS, AUGMENTATION_SLOT_NAMES } from '@/lib/combat/types';
import { Screen, Card, Label, Btn, Chip, RARITY_TEXT, RARITY_GLOW, cx } from '../hud';
import { implantStats, stimInfo, passiveText } from '../itemText';
import { allyDef } from '@/lib/combat/allies';
import { useAllies } from '@/lib/stores/useAllies';
import { useMap } from '@/lib/stores/useMap';
import { CHAPTER_MAP } from '@/lib/engine/map';
import { ALLIES } from '@/lib/combat/allies';

export function VictoryScreen() {
  const { currentLoot, lastVictory, continueFromVictory, boss, bossLevel, lootChoices, chooseLoot } = useCombat();
  const inChoice = new Set(lootChoices.map(c => c.options[0].id));
  const items = (currentLoot?.items ?? []).filter(i => !inChoice.has(i.id));
  const { party, progress, met } = useAllies();
  const map = useMap();
  const ended = !!lastVictory?.chapterDone;
  const hosts = useCombat(s => s.progression.deathCount) + 1;
  const looks = CHAPTER_MAP.rooms.filter(r => r.look);

  return (
    <Screen footer={
      <Btn variant="primary" size="lg" className="w-full" onClick={continueFromVictory}>
        Back to the hideout
      </Btn>
    }>
      <div className="pointer-events-none absolute left-1/2 top-0 h-64 w-80 -translate-x-1/2 rounded-full bg-ok/15 blur-3xl" />
      <div className="relative space-y-6 px-4 pb-6 pt-12">
        <header className="rise-in space-y-2 text-center">
          <div className="text-sm font-semibold text-ok">{ended ? 'Chapter one complete' : 'Target down'}</div>
          <h1 className="font-display text-5xl font-bold text-white">{ended ? 'The sea is quiet' : 'Victory'}</h1>
          <p className="text-balance text-[15px] text-hud-dim">{ended ? CHAPTER_MAP.ending : `${boss.name} is finished. The way on is open.`}</p>
        </header>

        {ended && (
          <div className="rise-in space-y-3 rounded-3xl bg-gradient-to-b from-sys/15 to-hud-panel/80 p-5 ring-1 ring-sys/20">
            <div className="font-display text-lg font-semibold text-white">{CHAPTER_MAP.title}</div>
            <div className="grid grid-cols-2 gap-2 text-center">
              {[
                ['Hosts used', `${hosts}`],
                ['Places seen', `${map.visited.length} of ${CHAPTER_MAP.rooms.length}`],
                ['Things looked at', `${looks.filter(r => map.looked.includes(r.id)).length} of ${looks.length}`],
                ['Allies linked', `${met.length} of ${ALLIES.length}`],
              ].map(([k, v]) => (
                <div key={k} className="rounded-2xl bg-black/20 px-3 py-2.5">
                  <div className="text-xs text-hud-dim">{k}</div>
                  <div className="font-display text-xl font-semibold text-white">{v}</div>
                </div>
              ))}
            </div>
            <p className="text-sm leading-relaxed text-hud-text/85">
              The signal keeps what it always keeps: the allies you linked, everything it learned in the play-i tree, and every place it has walked. This host can go on: the spire stays quiet, and every other room still holds a fight for the next host.
            </p>
            <p className="text-sm text-hud-dim">Chapter two is still being written.</p>
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
        {lastVictory && lastVictory.pointsGained > 0 && (
          <div className="rise-in rounded-2xl bg-sys/10 px-4 py-3 text-center text-sm font-semibold text-sys">
            Spend your points in Upgrades.
          </div>
        )}

        {lastVictory?.allyLevelUps?.map(id => {
          const def = allyDef(id);
          return def ? (
            <div key={`up-${id}`} className="rounded-2xl bg-white/[0.05] px-4 py-3 text-center text-sm font-semibold" style={{ color: def.color }}>
              {def.name} reached level {progress(id).level}
            </div>
          ) : null;
        })}

        {lootChoices.length > 0 && (
          <div className="space-y-2.5">
            <Label>Pick of the wreck</Label>
            <p className="text-sm text-hud-dim">Choose one from each pair. If you leave without choosing, you keep the first.</p>
            {lootChoices.map((c, k) => (
              <div key={k} className="grid grid-cols-2 gap-2">
                {c.options.map((item, o) => {
                  const picked = c.picked === o, other = c.picked !== null && !picked;
                  return (
                    <button key={item.id} disabled={c.picked !== null} onClick={() => chooseLoot(k, o)} aria-pressed={picked}
                      className={cx('flex flex-col gap-1 rounded-2xl bg-gradient-to-b to-hud-panel/80 p-3 text-left ring-1 transition', RARITY_GLOW[item.rarity], picked ? 'ring-2 ring-sys/70' : 'ring-white/[0.05]', other && 'opacity-40')}>
                      <span className="text-xl">{item.slot ? AUGMENTATION_SLOT_ICONS[item.slot] : '⚙️'}</span>
                      <span className={cx('text-[13px] font-semibold leading-tight', RARITY_TEXT[item.rarity])}>{item.name}</span>
                      <span className="text-[11px] text-hud-dim">{item.slot ? AUGMENTATION_SLOT_NAMES[item.slot] : ''} · {implantStats(item)}</span>
                      {picked && <span className="text-[11px] font-semibold text-sys">Taken</span>}
                    </button>
                  );
                })}
              </div>
            ))}
          </div>
        )}

        <div className="space-y-2.5">
          <Label>Salvage</Label>
          {items.length === 0 ? (
            <Card raised className="px-4 py-7 text-center text-sm text-hud-faint">{lootChoices.length ? 'Nothing else this time.' : 'Nothing usable this time. Credits only.'}</Card>
          ) : (
            <div className="space-y-2">
              {items.map((item, i) => {
                const isStim = item.type === 'consumable';
                const stim = isStim ? stimInfo(item) : null;
                const passive = passiveText(item);
                return (
                  <div key={item.id} className={cx('rise-in flex items-center gap-3 rounded-2xl bg-gradient-to-r to-hud-panel/80 px-3 py-3 ring-1 ring-white/[0.05]', RARITY_GLOW[item.rarity])} style={{ animationDelay: `${i * 90}ms` }}>
                    <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-black/25 text-2xl">
                      {isStim ? stim!.icon : item.slot ? AUGMENTATION_SLOT_ICONS[item.slot] : '⚙️'}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className={cx('truncate text-sm font-semibold', RARITY_TEXT[item.rarity])}>{isStim ? stim!.label : item.name}</div>
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
          {items.some(i => i.type === 'augmentation') && (
            <p className="text-xs text-hud-faint">New implants wait in the Implants tab at base until you install them.</p>
          )}
        </div>
      </div>
    </Screen>
  );
}
