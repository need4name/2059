import { useCombat } from '@/lib/stores/useCombat';
import { AUGMENTATION_SLOT_ICONS, AUGMENTATION_SLOT_NAMES } from '@/lib/combat/types';
import { Screen, Card, Label, Btn, Chip, RARITY_TEXT, RARITY_GLOW, cx } from '../hud';
import { implantStats, stimInfo, passiveText } from '../itemText';

export function VictoryScreen() {
  const { currentLoot, lastVictory, continueFromVictory, boss, bossLevel } = useCombat();
  const items = currentLoot?.items ?? [];

  return (
    <Screen footer={
      <Btn variant="primary" size="lg" className="w-full" onClick={continueFromVictory}>
        Back to the hideout
      </Btn>
    }>
      <div className="pointer-events-none absolute left-1/2 top-0 h-64 w-80 -translate-x-1/2 rounded-full bg-ok/15 blur-3xl" />
      <div className="relative space-y-6 px-4 pb-6 pt-12">
        <header className="rise-in space-y-2 text-center">
          <div className="text-sm font-semibold text-ok">Target down</div>
          <h1 className="font-display text-5xl font-bold text-white">Victory</h1>
          <p className="text-balance text-[15px] text-hud-dim">{boss.name} is finished. Next up: threat {bossLevel}.</p>
        </header>

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

        <div className="space-y-2.5">
          <Label>Salvage</Label>
          {items.length === 0 ? (
            <Card raised className="px-4 py-7 text-center text-sm text-hud-faint">Nothing usable this time. Credits only.</Card>
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
