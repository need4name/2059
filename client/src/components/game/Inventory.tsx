import { useState } from 'react';
import { useInventory } from '@/lib/stores/useInventory';
import { useAugmentTrees } from '@/lib/stores/useAugmentTrees';
import { AUGMENTATION_SLOTS, AUGMENTATION_SLOT_NAMES, AUGMENTATION_SLOT_ICONS, AugmentationSlot, Item } from '@/lib/combat/types';
import { Btn, Card, Label, RARITY_TEXT, RARITY_GLOW, RARITY_DOT, cx } from './hud';
import { implantStats, passiveText, conditionText, stimInfo } from './itemText';
import { augmentKind } from '@/lib/combat/types';
import { actionForItem, structureOf, healthCostOf, makerOf, MAKER_INFO } from '@/lib/combat/augments';

function ImplantRow({ item, action }: { item: Item; action: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const passive = passiveText(item);
  const condition = conditionText(item);
  const kind = item.slot ? augmentKind(item.slot) : 'passive';
  const move = actionForItem(item);
  const cost = healthCostOf(item);
  const maker = MAKER_INFO[makerOf(item)];
  return (
    <div className={cx('overflow-hidden rounded-2xl bg-gradient-to-r to-transparent ring-1 ring-white/[0.05]', RARITY_GLOW[item.rarity])}>
      <div className="flex items-center gap-3 px-3 py-3">
        <button className="flex min-w-0 flex-1 items-center gap-3 text-left" onClick={() => setOpen(o => !o)} aria-expanded={open}>
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-black/25 text-xl">
            {item.slot ? AUGMENTATION_SLOT_ICONS[item.slot] : '⚙️'}
          </span>
          <span className="min-w-0 flex-1">
            <span className={cx('block truncate text-sm font-semibold', RARITY_TEXT[item.rarity])}>{item.name}</span>
            <span className="flex items-center gap-1.5 text-xs text-hud-dim">
              <span className={cx('shrink-0 rounded-full px-1.5 py-px text-[10px] font-semibold', kind === 'active' ? 'bg-ok/10 text-ok' : 'bg-white/[0.06] text-hud-dim')}>{kind === 'active' ? 'Active' : 'Passive'}</span>
              <span className="truncate">{implantStats(item)}{cost > 0 && <span className="text-hostile"> · −{cost} HP</span>}</span>
            </span>
          </span>
        </button>
        {action}
      </div>
      {open && (
        <div className="space-y-1 px-4 pb-3.5 text-[13px] leading-relaxed">
          <div className="flex items-center gap-1.5 text-xs capitalize text-hud-dim">
            <span className={cx('h-1.5 w-1.5 rounded-full', RARITY_DOT[item.rarity])} />
            {item.rarity} · {item.slot ? AUGMENTATION_SLOT_NAMES[item.slot] : ''}
          </div>
          {move && (
            <div className="text-ok">
              Combat move: <span className="font-semibold">{move.name}</span>
              {move.damage ? ` · ${move.damage} damage` : ` · +${move.defenseBoost} guard`} · {(move.heatGenerated ?? 0) > 0 ? '+' : ''}{move.heatGenerated} heat
            </div>
          )}
          {kind === 'passive' && <div className="text-hud-dim">Passive: always-on stats, no combat move.</div>}
          <div className="text-hud-dim">Adds {structureOf(item)} structure{cost > 0 ? <span className="text-hostile"> · costs {cost} max health</span> : null}</div>
          <div className={cx('text-xs', maker.tone)}>{maker.label}: <span className="text-hud-dim">{maker.blurb}</span></div>
          {passive && <div className="text-sys">{passive}</div>}
          {condition && <div className="text-orange-300">{condition}</div>}
          {item.description && <p className="italic text-hud-dim">{item.description}</p>}
        </div>
      )}
    </div>
  );
}

export function Inventory() {
  const { items, equippedAugmentations, equipAugmentation, unequipAugmentation, getTotalAugmentationBonuses } = useInventory();
  const { unlockSlot, getTreeStatBonuses } = useAugmentTrees();
  const [filter, setFilter] = useState<AugmentationSlot | null>(null);

  const equippedSlots = AUGMENTATION_SLOTS.filter(s => equippedAugmentations[s] !== null);
  const totals = getTotalAugmentationBonuses();
  const tree = getTreeStatBonuses(equippedSlots);
  const augmentations = items.filter(i => i.type === 'augmentation');
  const consumables = items.filter(i => i.type === 'consumable');
  const shown = filter ? augmentations.filter(i => i.slot === filter) : augmentations;

  const install = (item: Item) => {
    equipAugmentation(item);
    if (item.slot) unlockSlot(item.slot);
    setFilter(null);
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-2 text-xs font-semibold">
        <span className="rounded-full bg-hostile/10 px-2.5 py-1 text-rose-300">+{totals.physicalAttack + totals.structuralAttack + tree.attack} attack</span>
        <span className="rounded-full bg-sky-400/10 px-2.5 py-1 text-sky-300">+{totals.physicalDefense + totals.structuralDefense + tree.defense} defence</span>
        <span className="rounded-full bg-ok/10 px-2.5 py-1 text-ok">+{totals.hp + tree.hp} HP</span>
        <span className="ml-auto text-hud-dim">{equippedSlots.length} of 10 installed</span>
      </div>

      {/* Body map */}
      <div className="grid grid-cols-5 gap-2">
        {AUGMENTATION_SLOTS.map(slot => {
          const eq = equippedAugmentations[slot];
          const spare = augmentations.some(i => i.slot === slot);
          const active = filter === slot;
          return (
            <button
              key={slot}
              onClick={() => setFilter(active ? null : slot)}
              className={cx(
                'relative flex aspect-square flex-col items-center justify-center gap-0.5 rounded-2xl transition',
                active ? 'bg-sys/15 ring-2 ring-sys/70'
                  : eq ? cx('bg-gradient-to-b to-white/[0.03] ring-1 ring-white/[0.06]', RARITY_GLOW[eq.rarity])
                  : 'bg-white/[0.03] hover:bg-white/[0.06]',
              )}
              aria-pressed={active}
            >
              <span className={cx('text-xl', !eq && 'opacity-35 grayscale')}>{AUGMENTATION_SLOT_ICONS[slot]}</span>
              <span className="text-[10px] font-medium text-hud-dim">{AUGMENTATION_SLOT_NAMES[slot]}</span>
              {spare && <span className="absolute right-1.5 top-1.5 h-2 w-2 rounded-full bg-cred shadow-[0_0_8px_rgba(242,179,61,0.8)]" title="Spare implant available" />}
            </button>
          );
        })}
      </div>

      {filter && equippedAugmentations[filter] && (
        <div className="space-y-2">
          <Label>Installed in {AUGMENTATION_SLOT_NAMES[filter].toLowerCase()}</Label>
          <ImplantRow item={equippedAugmentations[filter]!} action={<Btn size="sm" variant="danger" onClick={() => unequipAugmentation(filter)}>Remove</Btn>} />
        </div>
      )}

      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <Label>{filter ? `Spare for ${AUGMENTATION_SLOT_NAMES[filter].toLowerCase()}` : `Spare implants (${augmentations.length})`}</Label>
          {filter && <button className="text-xs font-semibold text-sys" onClick={() => setFilter(null)}>Show all</button>}
        </div>
        {shown.length === 0 ? (
          <Card raised className="px-4 py-7 text-center text-sm text-hud-faint">
            {filter ? 'Nothing spare for this slot yet.' : 'No spare implants. Defeat targets to salvage more.'}
          </Card>
        ) : (
          <div className="space-y-2">
            {shown.map(item => (
              <ImplantRow
                key={item.id}
                item={item}
                action={<Btn size="sm" variant="primary" onClick={() => install(item)}>{item.slot && equippedAugmentations[item.slot] ? 'Swap' : 'Install'}</Btn>}
              />
            ))}
          </div>
        )}
      </div>

      {!filter && equippedSlots.length > 0 && (
        <div className="space-y-2">
          <Label>Installed</Label>
          <div className="space-y-2">
            {equippedSlots.map(slot => (
              <ImplantRow key={slot} item={equippedAugmentations[slot]!} action={<Btn size="sm" variant="ghost" onClick={() => unequipAugmentation(slot)}>Remove</Btn>} />
            ))}
          </div>
        </div>
      )}

      {!filter && (
        <div className="space-y-2">
          <Label>Stims ({consumables.length})</Label>
          {consumables.length === 0 ? (
            <p className="text-sm text-hud-faint">No stims carried. They start dropping from threat level 2.</p>
          ) : (
            <div className="grid grid-cols-2 gap-2">
              {consumables.map(item => {
                const info = stimInfo(item);
                return (
                  <div key={item.id} className="flex items-center gap-2.5 rounded-2xl bg-white/[0.04] px-3 py-2.5">
                    <span className="text-xl">{info.icon}</span>
                    <span className="min-w-0">
                      <span className="block truncate text-[13px] font-semibold text-hud-text">{info.label}</span>
                      <span className="block text-[11px] text-ok">{info.effect}</span>
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
