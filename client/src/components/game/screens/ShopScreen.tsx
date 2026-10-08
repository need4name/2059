import { useState } from 'react';
import { useCombat } from '@/lib/stores/useCombat';
import { useInventory } from '@/lib/stores/useInventory';
import { useLoadout } from '@/lib/stores/useLoadout';
import { TIER1_WEAPONS, getUpgrade } from '@/lib/combat/weapons2059';
import type { Weapon } from '@/lib/combat/types';
import { Screen, Card, Label, Btn, Chip, cx } from '../hud';
import { rangeText } from '../itemText';

const MAKER: Record<string, { tone: string; glow: string }> = {
  volkov: { tone: 'text-rose-300', glow: 'from-rose-500/15' },
  tianxia: { tone: 'text-sys', glow: 'from-cyan-400/15' },
  cbn: { tone: 'text-emerald-300', glow: 'from-emerald-400/15' },
  ioa: { tone: 'text-orange-300', glow: 'from-orange-400/15' },
};

function WeaponStats({ w }: { w: Weapon }) {
  const a = w.combatAction;
  return (
    <div className="flex flex-wrap gap-1.5">
      <Chip className="capitalize">{w.weaponType}</Chip>
      <Chip tone="hostile">{a.damage} damage</Chip>
      {a.accuracy && <Chip tone={a.accuracy === 'precise' ? 'ok' : a.accuracy === 'unreliable' ? 'hostile' : 'cred'} className="capitalize">{a.accuracy}</Chip>}
      <Chip tone="structure">+{a.heatGenerated ?? 0} heat</Chip>
      <Chip>{rangeText(a)}</Chip>
      {a.bypassStructuralDefense && <Chip tone="ok">Ignores shielding</Chip>}
    </div>
  );
}

export function ShopScreen() {
  const { leaveShop } = useCombat();
  const { gold, ownedWeapons, equippedWeapon, buyWeapon, upgradeWeapon, sellWeapon, equipWeapon } = useInventory();
  const { slots, setSlot } = useLoadout();
  const [assigning, setAssigning] = useState<Weapon | null>(null);

  const putInSlot = (w: Weapon, idx: number) => {
    equipWeapon(w);
    setSlot(idx, { ...w.combatAction, key: `weapon_${w.id}`, unlocked: true, source: 'weapon' });
    setAssigning(null);
  };

  return (
    <Screen footer={<Btn variant="primary" size="lg" className="w-full" onClick={leaveShop}>Leave the market</Btn>}>
      <div className="pointer-events-none absolute -right-16 top-0 h-64 w-64 rounded-full bg-cred/10 blur-3xl" />
      <div className="relative space-y-5 px-4 pb-6 pt-7">
        <header className="flex items-start justify-between gap-3">
          <div className="space-y-1">
            <div className="text-sm font-semibold text-cred">Coastal settlement</div>
            <h1 className="font-display text-3xl font-bold text-white">Arms Market</h1>
            <p className="text-sm text-hud-dim">You can carry one weapon. It takes up a loadout slot.</p>
          </div>
          <span className="shrink-0 whitespace-nowrap rounded-full bg-cred/10 px-3 py-1 font-display text-lg font-semibold text-cred">¤ {gold}</span>
        </header>

        {assigning && (
          <Card className="rise-in space-y-3 p-4 ring-2 ring-sys/50">
            <div className="text-sm text-hud-text">Which slot should <span className="font-semibold text-sys">{assigning.name}</span> go in?</div>
            <div className="grid grid-cols-4 gap-2">
              {slots.map((s, i) => (
                <button key={i} onClick={() => putInSlot(assigning, i)} className="flex h-16 flex-col items-center justify-center rounded-2xl bg-white/[0.05] px-1 transition hover:bg-sys/15">
                  <span className="text-[11px] text-hud-dim">Slot {i + 1}</span>
                  <span className="w-full truncate text-center text-xs font-semibold text-hud-text">{s?.name ?? 'Empty'}</span>
                </button>
              ))}
            </div>
            <Btn size="sm" variant="ghost" onClick={() => setAssigning(null)}>Not now</Btn>
          </Card>
        )}

        {ownedWeapons.length > 0 && (
          <div className="space-y-2.5">
            <Label>Your weapons</Label>
            {ownedWeapons.map(w => {
              const upgrade = getUpgrade(w.id);
              const canUpgrade = upgrade && !ownedWeapons.find(o => o.id === upgrade.id);
              const upCost = upgrade ? upgrade.upgradePrice ?? upgrade.price : 0;
              const isEquipped = equippedWeapon?.id === w.id;
              return (
                <div key={w.id} className={cx('space-y-3 rounded-3xl bg-gradient-to-br to-hud-panel/80 p-4 ring-1', MAKER[w.manufacturer]?.glow, isEquipped ? 'ring-cred/40' : 'ring-white/[0.05]')}>
                  <div className="flex items-center justify-between gap-2">
                    <span className={cx('font-display text-base font-semibold', MAKER[w.manufacturer]?.tone)}>{w.name}</span>
                    {isEquipped && <Chip tone="cred">Carrying</Chip>}
                  </div>
                  <WeaponStats w={w} />
                  <div className="flex flex-wrap gap-2">
                    <Btn size="sm" onClick={() => setAssigning(w)}>{isEquipped ? 'Change slot' : 'Carry this'}</Btn>
                    {canUpgrade && upgrade && (
                      <Btn size="sm" variant="gold" disabled={gold < upCost} onClick={() => upgradeWeapon(w.id, upgrade)}>
                        Upgrade · ¤{upCost}
                      </Btn>
                    )}
                    <Btn size="sm" variant="ghost" onClick={() => sellWeapon(w.id)}>Sell · ¤{w.sellPrice}</Btn>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        <div className="space-y-2.5">
          <Label>For sale</Label>
          {TIER1_WEAPONS.filter(w => !ownedWeapons.find(o => o.id === w.id || o.upgradeOfId === w.id)).map(w => {
            const affordable = gold >= w.price;
            return (
              <div key={w.id} className={cx('space-y-3 rounded-3xl bg-gradient-to-br to-hud-panel/80 p-4 ring-1 ring-white/[0.05]', MAKER[w.manufacturer]?.glow)}>
                <div className="flex items-start justify-between gap-2">
                  <span className={cx('font-display text-base font-semibold', MAKER[w.manufacturer]?.tone)}>{w.name}</span>
                  <span className={cx('shrink-0 font-display text-base font-semibold', affordable ? 'text-cred' : 'text-hud-faint')}>¤{w.price}</span>
                </div>
                <WeaponStats w={w} />
                <p className="text-[13px] leading-relaxed text-hud-dim">{w.description}</p>
                <Btn
                  size="sm"
                  variant={affordable ? 'gold' : 'secondary'}
                  disabled={!affordable}
                  className="w-full"
                  onClick={() => { if (buyWeapon(w)) setAssigning(w); }}
                >
                  {affordable ? 'Buy' : `Need ¤${w.price - gold} more`}
                </Btn>
              </div>
            );
          })}
        </div>
      </div>
    </Screen>
  );
}
