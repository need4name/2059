import { useState } from 'react';
import { useCombat } from '@/lib/stores/useCombat';
import { useInventory } from '@/lib/stores/useInventory';
import { useLoadout } from '@/lib/stores/useLoadout';
import { TIER1_WEAPONS, getUpgrade } from '@/lib/combat/weapons2059';
import type { Weapon } from '@/lib/combat/types';
import { Screen, Label, Btn, Chip } from '../hud';
import { rangeText } from '../itemText';

const MAKER: Record<string, { label: string; tone: string }> = {
  volkov: { label: 'Volkov', tone: 'text-red-400' },
  tianxia: { label: 'Tianxia', tone: 'text-sys' },
  cbn: { label: 'CBN', tone: 'text-emerald-400' },
  ioa: { label: 'IOA', tone: 'text-orange-400' },
};

function WeaponStats({ w }: { w: Weapon }) {
  const a = w.combatAction;
  return (
    <div className="flex flex-wrap gap-1">
      <Chip>{w.weaponType}</Chip>
      <Chip tone="hostile">{a.damage} dmg</Chip>
      {a.accuracy && <Chip tone={a.accuracy === 'precise' ? 'ok' : a.accuracy === 'unreliable' ? 'hostile' : 'cred'}>{a.accuracy}</Chip>}
      <Chip tone="structure">+{a.heatGenerated ?? 0} heat</Chip>
      <Chip>{rangeText(a)}</Chip>
      {a.bypassStructuralDefense && <Chip tone="ok">Ignores S-DEF</Chip>}
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
    <Screen footer={<Btn variant="primary" size="lg" className="w-full" onClick={leaveShop}>Leave market</Btn>}>
      <div className="space-y-5 px-4 pb-6 pt-6">
        <header className="flex items-end justify-between gap-3">
          <div className="space-y-1">
            <Label className="text-cred">Coastal settlement</Label>
            <h1 className="font-display text-3xl font-semibold uppercase tracking-wide text-hud-text">Arms Market</h1>
            <p className="text-xs text-hud-dim">One weapon can be carried at a time. It takes a loadout slot.</p>
          </div>
          <span className="shrink-0 whitespace-nowrap font-display text-2xl font-semibold tabular-nums text-cred">¤ {gold}</span>
        </header>

        {assigning && (
          <div className="rise-in space-y-2 border border-sys/50 bg-sys/5 p-3">
            <div className="text-sm text-hud-text">Put <span className="text-sys">{assigning.name}</span> in a loadout slot:</div>
            <div className="grid grid-cols-4 gap-1.5">
              {slots.map((s, i) => (
                <button key={i} onClick={() => putInSlot(assigning, i)} className="flex h-14 flex-col items-center justify-center border border-hud-line bg-hud-raised px-1 hover:border-sys">
                  <span className="font-mono text-[10px] text-hud-dim">Slot {i + 1}</span>
                  <span className="w-full truncate text-center text-[11px] text-hud-text">{s?.name ?? 'Empty'}</span>
                </button>
              ))}
            </div>
            <Btn size="sm" variant="ghost" onClick={() => setAssigning(null)}>Not now</Btn>
          </div>
        )}

        {ownedWeapons.length > 0 && (
          <div className="space-y-2">
            <Label>Your weapons</Label>
            {ownedWeapons.map(w => {
              const upgrade = getUpgrade(w.id);
              const canUpgrade = upgrade && !ownedWeapons.find(o => o.id === upgrade.id);
              const upCost = upgrade ? upgrade.upgradePrice ?? upgrade.price : 0;
              const isEquipped = equippedWeapon?.id === w.id;
              return (
                <div key={w.id} className={`space-y-2 border p-3 ${isEquipped ? 'border-cred/50 bg-cred/5' : 'border-hud-line bg-hud-panel'}`}>
                  <div className="flex items-center justify-between gap-2">
                    <span className={`font-display text-sm font-semibold uppercase tracking-wide ${MAKER[w.manufacturer]?.tone}`}>{w.name}</span>
                    {isEquipped && <Chip tone="cred">Carried</Chip>}
                  </div>
                  <WeaponStats w={w} />
                  <div className="flex flex-wrap gap-1.5">
                    {!isEquipped && <Btn size="sm" onClick={() => setAssigning(w)}>Carry</Btn>}
                    {isEquipped && <Btn size="sm" onClick={() => setAssigning(w)}>Change slot</Btn>}
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

        <div className="space-y-2">
          <Label>For sale</Label>
          {TIER1_WEAPONS.filter(w => !ownedWeapons.find(o => o.id === w.id || o.upgradeOfId === w.id)).map(w => {
            const affordable = gold >= w.price;
            return (
              <div key={w.id} className="space-y-2 border border-hud-line bg-hud-panel p-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className={`font-display text-sm font-semibold uppercase tracking-wide ${MAKER[w.manufacturer]?.tone}`}>{w.name}</div>
                  </div>
                  <span className={`font-display text-base font-semibold tabular-nums ${affordable ? 'text-cred' : 'text-hud-faint'}`}>¤{w.price}</span>
                </div>
                <WeaponStats w={w} />
                <p className="text-xs leading-relaxed text-hud-dim">{w.description}</p>
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
