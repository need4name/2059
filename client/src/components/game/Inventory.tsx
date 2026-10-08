import { useState } from 'react';
import { useInventory } from '@/lib/stores/useInventory';
import { useAugmentTrees } from '@/lib/stores/useAugmentTrees';
import { AUGMENTATION_SLOTS, AUGMENTATION_SLOT_NAMES, AUGMENTATION_SLOT_ICONS, AugmentationSlot, Item } from '@/lib/combat/types';
import { Btn, Label, RARITY_TEXT, RARITY_BORDER } from './hud';
import { implantStats, passiveText, conditionText, stimInfo } from './itemText';

function ImplantRow({ item, action }: { item: Item; action: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const passive = passiveText(item);
  const condition = conditionText(item);
  return (
    <div className={`border-l-2 bg-hud-raised/60 ${RARITY_BORDER[item.rarity]}`}>
      <div className="flex items-center gap-3 px-3 py-2.5">
        <button className="flex min-w-0 flex-1 items-center gap-3 text-left" onClick={() => setOpen(o => !o)} aria-expanded={open}>
          <span className="flex h-9 w-9 shrink-0 items-center justify-center border border-hud-line bg-hud-bg text-lg">
            {item.slot ? AUGMENTATION_SLOT_ICONS[item.slot] : '⚙️'}
          </span>
          <span className="min-w-0 flex-1">
            <span className={`block truncate text-sm ${RARITY_TEXT[item.rarity]}`}>{item.name}</span>
            <span className="block font-mono text-[11px] text-hud-dim">
              {item.slot ? AUGMENTATION_SLOT_NAMES[item.slot] : ''} · {implantStats(item)}
            </span>
          </span>
        </button>
        {action}
      </div>
      {open && (
        <div className="space-y-1 px-3 pb-3 pl-[60px] text-xs leading-relaxed">
          <div className="font-mono uppercase tracking-wider text-hud-faint">{item.rarity}</div>
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
      <div className="flex flex-wrap gap-x-4 gap-y-1 font-mono text-xs">
        <span className="text-hostile">+{totals.physicalAttack + totals.structuralAttack + tree.attack} ATK</span>
        <span className="text-sky-400">+{totals.physicalDefense + totals.structuralDefense + tree.defense} DEF</span>
        <span className="text-ok">+{totals.hp + tree.hp} HP</span>
        <span className="ml-auto text-hud-dim">{equippedSlots.length}/10 installed</span>
      </div>

      {/* Body map */}
      <div className="grid grid-cols-5 gap-1.5">
        {AUGMENTATION_SLOTS.map(slot => {
          const eq = equippedAugmentations[slot];
          const spare = augmentations.some(i => i.slot === slot);
          const active = filter === slot;
          return (
            <button
              key={slot}
              onClick={() => setFilter(active ? null : slot)}
              className={`relative flex aspect-square flex-col items-center justify-center gap-0.5 border transition-colors ${
                active ? 'border-sys bg-sys/10'
                  : eq ? `bg-hud-raised ${RARITY_BORDER[eq.rarity]}`
                  : 'border-dashed border-hud-line bg-transparent hover:border-hud-dim'
              }`}
              aria-pressed={active}
            >
              <span className={`text-lg ${eq ? '' : 'opacity-40'}`}>{AUGMENTATION_SLOT_ICONS[slot]}</span>
              <span className="font-mono text-[9px] uppercase tracking-wide text-hud-dim">{AUGMENTATION_SLOT_NAMES[slot]}</span>
              {spare && <span className="absolute right-1 top-1 h-1.5 w-1.5 rounded-full bg-cred" title="Spare implant available" />}
            </button>
          );
        })}
      </div>

      {/* Selected slot: what's installed there */}
      {filter && equippedAugmentations[filter] && (
        <div className="space-y-2">
          <Label>Installed · {AUGMENTATION_SLOT_NAMES[filter]}</Label>
          <ImplantRow item={equippedAugmentations[filter]!} action={<Btn size="sm" variant="danger" onClick={() => unequipAugmentation(filter)}>Remove</Btn>} />
        </div>
      )}

      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <Label>{filter ? `Spare · ${AUGMENTATION_SLOT_NAMES[filter]}` : `Spare implants (${augmentations.length})`}</Label>
          {filter && <button className="font-mono text-[11px] uppercase tracking-wider text-sys" onClick={() => setFilter(null)}>Show all</button>}
        </div>
        {shown.length === 0 ? (
          <p className="border border-dashed border-hud-line px-3 py-6 text-center text-xs text-hud-faint">
            {filter ? 'Nothing spare for this slot yet.' : 'No spare implants. Defeat targets to salvage more.'}
          </p>
        ) : (
          <div className="space-y-1.5">
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
          <div className="space-y-1.5">
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
            <p className="text-xs text-hud-faint">No stims carried. They drop from targets from threat level 2.</p>
          ) : (
            <div className="grid grid-cols-2 gap-1.5">
              {consumables.map(item => {
                const info = stimInfo(item);
                return (
                  <div key={item.id} className="flex items-center gap-2 border border-hud-line bg-hud-raised/60 px-2.5 py-2">
                    <span className="text-lg">{info.icon}</span>
                    <span className="min-w-0">
                      <span className="block truncate text-xs text-hud-text">{info.label}</span>
                      <span className="block font-mono text-[10px] text-ok">{info.effect}</span>
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
