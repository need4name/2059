import { useCombat } from '@/lib/stores/useCombat';
import { AUGMENTATION_SLOT_ICONS, AUGMENTATION_SLOT_NAMES } from '@/lib/combat/types';
import { Screen, Label, Btn, Chip, RARITY_TEXT, RARITY_BORDER } from '../hud';
import { implantStats, stimInfo, passiveText } from '../itemText';

export function VictoryScreen() {
  const { currentLoot, lastVictory, pendingShop, continueFromVictory, boss, bossLevel } = useCombat();
  const items = currentLoot?.items ?? [];

  return (
    <Screen footer={
      <Btn variant={pendingShop ? 'gold' : 'primary'} size="lg" className="w-full" onClick={continueFromVictory}>
        {pendingShop ? 'Enter the Arms Market' : 'Return to base'}
      </Btn>
    }>
      <div className="space-y-6 px-4 pb-6 pt-10">
        <header className="rise-in space-y-2 text-center">
          <Label className="text-ok">Target neutralized</Label>
          <h1 className="font-display text-5xl font-semibold uppercase tracking-[0.14em] text-ok" style={{ textShadow: '0 0 24px rgba(74,210,149,0.25)' }}>Victory</h1>
          <p className="text-sm text-hud-dim">{boss.name} is down. Next threat: LV {bossLevel}.</p>
        </header>

        {lastVictory && (
          <div className="grid grid-cols-3 border border-hud-line bg-hud-panel">
            <div className="flex flex-col items-center gap-1 py-3">
              <span className="font-mono text-[10px] uppercase tracking-[0.16em] text-hud-dim">Credits</span>
              <span className="font-display text-xl font-semibold tabular-nums text-cred">+{lastVictory.gold}</span>
            </div>
            <div className="flex flex-col items-center gap-1 border-x border-hud-line py-3">
              <span className="font-mono text-[10px] uppercase tracking-[0.16em] text-hud-dim">XP</span>
              <span className="font-display text-xl font-semibold tabular-nums text-sys">+{lastVictory.xp}</span>
            </div>
            <div className="flex flex-col items-center gap-1 py-3">
              <span className="font-mono text-[10px] uppercase tracking-[0.16em] text-hud-dim">Upgrade pts</span>
              <span className={`font-display text-xl font-semibold tabular-nums ${lastVictory.pointsGained ? 'text-cred' : 'text-hud-faint'}`}>+{lastVictory.pointsGained}</span>
            </div>
          </div>
        )}
        {lastVictory && lastVictory.levelsGained > 0 && (
          <div className="rise-in border border-sys/40 bg-sys/5 px-3 py-2 text-center font-mono text-xs uppercase tracking-wider text-sys">
            Level up · spend points in Upgrades
          </div>
        )}

        <div className="space-y-2">
          <Label>Salvage</Label>
          {items.length === 0 ? (
            <p className="border border-dashed border-hud-line px-3 py-6 text-center text-xs text-hud-faint">Nothing usable this time. Credits only.</p>
          ) : (
            <div className="space-y-1.5">
              {items.map((item, i) => {
                const isStim = item.type === 'consumable';
                const stim = isStim ? stimInfo(item) : null;
                const passive = passiveText(item);
                return (
                  <div key={item.id} className={`rise-in flex items-center gap-3 border-l-2 bg-hud-panel px-3 py-3 ${RARITY_BORDER[item.rarity]}`} style={{ animationDelay: `${i * 90}ms` }}>
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center border border-hud-line bg-hud-bg text-xl">
                      {isStim ? stim!.icon : item.slot ? AUGMENTATION_SLOT_ICONS[item.slot] : '⚙️'}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className={`truncate text-sm ${RARITY_TEXT[item.rarity]}`}>{isStim ? stim!.label : item.name}</div>
                      <div className="font-mono text-[11px] text-hud-dim">
                        {isStim ? stim!.effect : `${item.slot ? AUGMENTATION_SLOT_NAMES[item.slot] : ''} · ${implantStats(item)}`}
                      </div>
                      {passive && <div className="font-mono text-[10px] text-sys">{passive}</div>}
                    </div>
                    <Chip tone={isStim ? 'ok' : 'dim'}>{isStim ? 'Stim' : 'Implant'}</Chip>
                  </div>
                );
              })}
            </div>
          )}
          {items.some(i => i.type === 'augmentation') && (
            <p className="text-[11px] text-hud-faint">Implants wait in the Implants tab at base until you install them.</p>
          )}
        </div>
      </div>
    </Screen>
  );
}
