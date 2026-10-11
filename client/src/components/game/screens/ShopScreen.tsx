import { useEffect, useMemo, useState } from 'react';
import { useCombat } from '@/lib/stores/useCombat';
import { useInventory } from '@/lib/stores/useInventory';
import { useLoadout } from '@/lib/stores/useLoadout';
import { useMarket } from '@/lib/stores/useMarket';
import { TIER1_WEAPONS, getUpgrade } from '@/lib/combat/weapons2059';
import { buyPrice, sellPrice } from '@/lib/combat/economy';
import { AUGMENTATION_SLOT_ICONS, AUGMENTATION_SLOT_NAMES, augmentKind, type Item, type ItemRarity, type Weapon } from '@/lib/combat/types';
import { Screen, Label, Btn, Chip, Card, Segmented, RARITY_TEXT, RARITY_GLOW, RARITY_DOT, cx } from '../hud';
import { rangeText, implantStats, stimInfo, passiveText } from '../itemText';

type Mode = 'buy' | 'sell';
type Kind = 'all' | 'active' | 'passive' | 'stim' | 'weapon';
const RARITIES: ItemRarity[] = ['common', 'uncommon', 'rare', 'epic', 'legendary'];

const MAKER: Record<string, { tone: string; glow: string }> = {
  volkov: { tone: 'text-rose-300', glow: 'from-rose-500/15' },
  tianxia: { tone: 'text-sys', glow: 'from-cyan-400/15' },
  cbn: { tone: 'text-emerald-300', glow: 'from-emerald-400/15' },
  ioa: { tone: 'text-orange-300', glow: 'from-orange-400/15' },
};

function kindOf(item: Item): Kind {
  if (item.type === 'consumable') return 'stim';
  return augmentKind(item.slot);
}

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

function ItemRow({ item, price, action }: { item: Item; price: number; action: React.ReactNode }) {
  const isStim = item.type === 'consumable';
  const stim = isStim ? stimInfo(item) : null;
  const passive = passiveText(item);
  const kind = kindOf(item);
  return (
    <div className={cx('flex items-center gap-3 rounded-2xl bg-gradient-to-r to-hud-panel/80 px-3 py-3 ring-1 ring-white/[0.05]', RARITY_GLOW[item.rarity])}>
      <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-black/25 text-xl">
        {isStim ? stim!.icon : item.slot ? AUGMENTATION_SLOT_ICONS[item.slot] : '⚙️'}
      </span>
      <div className="min-w-0 flex-1">
        <div className={cx('truncate text-sm font-semibold', RARITY_TEXT[item.rarity])}>{isStim ? stim!.label : item.name}</div>
        <div className="text-xs text-hud-dim">
          {isStim ? stim!.effect : `${item.slot ? AUGMENTATION_SLOT_NAMES[item.slot] : ''} · ${implantStats(item)}`}
        </div>
        <div className="mt-1 flex flex-wrap items-center gap-1.5">
          {!isStim && <Chip tone={kind === 'active' ? 'sys' : 'aug'}>{kind === 'active' ? 'Active' : 'Passive'}</Chip>}
          {passive && <span className="text-[11px] text-sys">{passive}</span>}
        </div>
      </div>
      <div className="flex shrink-0 flex-col items-end gap-1.5">
        <span className="font-display text-sm font-semibold text-cred">¤{price}</span>
        {action}
      </div>
    </div>
  );
}

export function ShopScreen() {
  const { leaveShop, bossLevel, progression } = useCombat();
  const { gold, items, ownedWeapons, equippedWeapon, buyWeapon, upgradeWeapon, sellWeapon, equipWeapon } = useInventory();
  const { slots, setSlot } = useLoadout();
  const { stock, ensureStock, buy, sell } = useMarket();
  const [mode, setMode] = useState<Mode>('buy');
  const [kind, setKind] = useState<Kind>('all');
  const [rarities, setRarities] = useState<ItemRarity[]>([]);
  const [assigning, setAssigning] = useState<Weapon | null>(null);

  // New stock after every fight (and every new body)
  useEffect(() => { ensureStock(`${progression.deathCount}-${bossLevel}`, bossLevel); }, [bossLevel, progression.deathCount, ensureStock]);

  const toggleRarity = (r: ItemRarity) => setRarities(rs => rs.includes(r) ? rs.filter(x => x !== r) : [...rs, r]);
  const passes = (item: Item) => (kind === 'all' || kindOf(item) === kind) && (rarities.length === 0 || rarities.includes(item.rarity));

  const buyList = useMemo(() => stock.filter(passes), [stock, kind, rarities]);
  const sellList = useMemo(() => items.filter(passes), [items, kind, rarities]);
  const showWeapons = kind === 'all' || kind === 'weapon';

  const putInSlot = (w: Weapon, idx: number) => {
    equipWeapon(w);
    setSlot(idx, { ...w.combatAction, key: `weapon_${w.id}`, unlocked: true, source: 'weapon' });
    setAssigning(null);
  };

  return (
    <Screen footer={<Btn variant="primary" size="lg" className="w-full" onClick={leaveShop}>Back to base</Btn>}>
      <div className="pointer-events-none absolute -right-16 top-0 h-64 w-64 rounded-full bg-cred/10 blur-3xl" />
      <div className="relative space-y-4 px-4 pb-6 pt-7">
        <header className="flex items-start justify-between gap-3">
          <div className="space-y-1">
            <div className="text-sm font-semibold text-cred">Offshore Sector 7 · market deck</div>
            <h1 className="font-display text-3xl font-bold text-white">Grey Lane</h1>
            <p className="text-sm text-hud-dim">Salvage, grafts and firmware moved through IOA grey lanes. New stock after every fight.</p>
          </div>
          <span className="shrink-0 whitespace-nowrap rounded-full bg-cred/10 px-3 py-1 font-display text-lg font-semibold text-cred">¤ {gold}</span>
        </header>

        <Segmented value={mode} onChange={setMode} options={[{ id: 'buy', label: 'Buy' }, { id: 'sell', label: 'Sell', badge: items.length || undefined }]} />

        {/* Filters */}
        <div className="space-y-2">
          <div className="no-scrollbar -mx-4 flex gap-1.5 overflow-x-auto px-4">
            {([['all', 'Everything'], ['active', 'Active implants'], ['passive', 'Passive implants'], ['stim', 'Stims'], ['weapon', 'Weapons']] as [Kind, string][]).map(([k, label]) => (
              <button key={k} onClick={() => setKind(k)} className={cx('shrink-0 rounded-full px-3 py-1.5 text-xs font-semibold transition', kind === k ? 'bg-white text-hud-bg' : 'bg-white/[0.06] text-hud-dim hover:text-hud-text')}>
                {label}
              </button>
            ))}
          </div>
          <div className="flex flex-wrap gap-1.5">
            {RARITIES.map(r => (
              <button key={r} onClick={() => toggleRarity(r)} aria-pressed={rarities.includes(r)} className={cx('flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold capitalize transition', rarities.includes(r) ? 'bg-white/15 text-white ring-1 ring-white/30' : 'bg-white/[0.04] text-hud-dim')}>
                <span className={cx('h-1.5 w-1.5 rounded-full', RARITY_DOT[r])} />{r}
              </button>
            ))}
            {rarities.length > 0 && <button onClick={() => setRarities([])} className="px-2 text-[11px] font-semibold text-sys">Clear</button>}
          </div>
        </div>

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

        {/* Implants and stims */}
        {kind !== 'weapon' && (
          <div className="space-y-2">
            <Label>{mode === 'buy' ? 'On the stall' : 'Your spare gear'}</Label>
            {(mode === 'buy' ? buyList : sellList).length === 0 ? (
              <Card raised className="px-4 py-7 text-center text-sm text-hud-faint">
                {mode === 'buy' ? 'Nothing here matches. Try another filter, or come back after your next fight.' : 'Nothing to sell that matches. Installed implants have to be removed first.'}
              </Card>
            ) : (
              (mode === 'buy' ? buyList : sellList).map(item => mode === 'buy' ? (
                <ItemRow key={item.id} item={item} price={buyPrice(item)} action={
                  <Btn size="sm" variant="gold" disabled={gold < buyPrice(item)} onClick={() => buy(item.id)}>Buy</Btn>
                } />
              ) : (
                <ItemRow key={item.id} item={item} price={sellPrice(item)} action={
                  <Btn size="sm" onClick={() => sell(item.id)}>Sell</Btn>
                } />
              ))
            )}
          </div>
        )}

        {/* Weapons */}
        {showWeapons && mode === 'sell' && ownedWeapons.length > 0 && (
          <div className="space-y-2.5">
            <Label>Your weapons</Label>
            {ownedWeapons.map(w => {
              const isEquipped = equippedWeapon?.id === w.id;
              const upgrade = getUpgrade(w.id);
              const canUpgrade = isEquipped && upgrade && !ownedWeapons.find(o => o.id === upgrade.id);
              const upCost = upgrade ? upgrade.upgradePrice ?? upgrade.price : 0;
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
                      <Btn size="sm" variant="gold" disabled={gold < upCost} onClick={() => upgradeWeapon(w.id, upgrade)}>Upgrade · ¤{upCost}</Btn>
                    )}
                    <Btn size="sm" variant="ghost" onClick={() => sellWeapon(w.id)}>Sell · ¤{w.sellPrice}</Btn>
                  </div>
                  {!isEquipped && upgrade && <p className="text-xs text-hud-faint">Carry this weapon to upgrade it.</p>}
                </div>
              );
            })}
          </div>
        )}

        {showWeapons && mode === 'buy' && (
          <div className="space-y-2.5">
            <Label>Weapons</Label>
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
                  <Btn size="sm" variant={affordable ? 'gold' : 'secondary'} disabled={!affordable} className="w-full" onClick={() => { if (buyWeapon(w)) setAssigning(w); }}>
                    {affordable ? 'Buy' : `Need ¤${w.price - gold} more`}
                  </Btn>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </Screen>
  );
}
