import { useInventory } from '@/lib/stores/useInventory';
import { useAugmentTrees } from '@/lib/stores/useAugmentTrees';
import { getRarityColor } from '@/lib/combat/loot';
import { AUGMENTATION_SLOTS, AUGMENTATION_SLOT_NAMES, AUGMENTATION_SLOT_ICONS, AugmentationSlot } from '@/lib/combat/types';
import { Button } from '@/components/ui/button';
import { Cpu, X, ChevronDown, ChevronUp } from 'lucide-react';
import { useState } from 'react';

function ExpandableItem({ item, onEquip }: { item: any; onEquip: (item: any) => void }) {
const [expanded, setExpanded] = useState(false);
return (

<div className="border-b border-slate-700/30" onClick={() => setExpanded(!expanded)}>
<div className="flex items-center gap-3 p-3 hover:bg-slate-800/40 cursor-pointer">
<div className="w-10 h-10 bg-slate-800/70 border border-slate-600/50 rounded flex flex-col items-center justify-center flex-shrink-0">
<span className="text-lg">{AUGMENTATION_SLOT_ICONS[item.slot as AugmentationSlot]}</span>
<span className="text-[7px] font-mono text-slate-500 uppercase">{item.slot?.replace('_', ' ').split(' ')[0]}</span>
</div>
<div className="flex-1 min-w-0">
<div className="font-mono text-sm truncate" style={{ color: getRarityColor(item.rarity) }} title={item.name}>
{item.name}
</div>
<div className="flex gap-3 text-xs font-mono text-slate-400 mt-0.5 flex-wrap">
{item.attackBonus ? <span className="text-red-400/70">+{item.attackBonus} ATK</span> : null}
{item.defenseBonus ? <span className="text-blue-400/70">+{item.defenseBonus} DEF</span> : null}
{item.hpBonus ? <span className="text-emerald-400/70">+{item.hpBonus} HP</span> : null}
{item.passiveEffect === 'kizuna_coldstart' && (
  <span className="text-cyan-400/80 font-bold">KIZUNA -- cold-start precision</span>
)}
{item.passiveEffect === 'bypass_sdef' && (
  <span className="text-purple-400/80 font-bold">CBN -- bypasses S-DEF</span>
)}
</div>
</div>
<Button
size="sm"
className="h-8 px-3 text-xs font-mono bg-cyan-700/60 hover:bg-cyan-600/70 text-cyan-100 border border-cyan-600/50 flex-shrink-0"
onClick={(e) => { e.stopPropagation(); onEquip(item); }}
>
INSTALL
</Button>
</div>
{expanded && item.description && (
<div className="px-3 pb-3">
<div className="ml-[52px] pl-3 border-l border-slate-700/50">
<p className="text-xs text-slate-400/80 font-mono leading-relaxed italic">{item.description}</p>
</div>
</div>
)}
</div>
);
}

export function Inventory() {
const { items, gold, equippedAugmentations, equipAugmentation, unequipAugmentation, getTotalAugmentationBonuses } = useInventory();
const { unlockSlot, lockSlot } = useAugmentTrees();
const [selectedSlotFilter, setSelectedSlotFilter] = useState<AugmentationSlot | null>(null);
const [showEquipSlots, setShowEquipSlots] = useState(true);

const totalBonuses = getTotalAugmentationBonuses();
const equippedCount = AUGMENTATION_SLOTS.filter(slot => equippedAugmentations[slot] !== null).length;
// Include tree progression bonuses in the header display
const equippedSlots = AUGMENTATION_SLOTS.filter(slot => equippedAugmentations[slot] !== null);
const { getTreeStatBonuses } = useAugmentTrees();
const treeBonus = getTreeStatBonuses(equippedSlots);
const displayAtk = totalBonuses.physicalAttack + totalBonuses.structuralAttack + treeBonus.attack;
const displayDef = totalBonuses.physicalDefense + totalBonuses.structuralDefense + treeBonus.defense;
const displayHp  = totalBonuses.hp + treeBonus.hp;

const augmentations = items.filter(item => item.type === 'augmentation');
const consumables = items.filter(item => item.type === 'consumable');

const filteredAugmentations = selectedSlotFilter
? augmentations.filter(item => item.slot === selectedSlotFilter)
: augmentations;

const handleSlotClick = (slot: AugmentationSlot) => {
const equipped = equippedAugmentations[slot];
if (equipped) {
return;
}
if (selectedSlotFilter === slot) {
setSelectedSlotFilter(null);
} else {
setSelectedSlotFilter(slot);
}
};

const handleEquip = (item: typeof items[0]) => {
equipAugmentation(item);
// Unlock the augment tree for this slot
if (item.slot) unlockSlot(item.slot as AugmentationSlot);
setSelectedSlotFilter(null);
};

const handleUnequip = (slot: AugmentationSlot) => {
unequipAugmentation(slot);
// Note: we keep tree progress when unequipped - player keeps their investment
// lockSlot would wipe progress which feels punishing
};

return (

<div className="bg-slate-900/80 border border-slate-700/50 rounded-sm flex flex-col h-full max-h-[calc(100vh-120px)]">
{/* Header */}
<div className="p-3 border-b border-slate-700/30 flex-shrink-0">
<div className="flex items-center justify-between">
<div className="flex items-center gap-2 text-xs font-mono text-slate-400">
<Cpu className="w-4 h-4 text-cyan-500/70" />
<span>AUGMENTATIONS</span>
</div>
<div className="flex items-center gap-3 text-xs font-mono">
<span className="text-red-400/80">+{displayAtk} ATK</span>
<span className="text-blue-400/80">+{displayDef} DEF</span>
<span className="text-emerald-400/80">+{displayHp} HP</span>
</div>
</div>
</div>

{/* Equipped Slots Section - Collapsible */}

  <div className="border-b border-slate-700/30 flex-shrink-0">
    <button 
      className="w-full p-2 flex items-center justify-between text-xs font-mono text-slate-500 hover:text-slate-300 hover:bg-slate-800/30"
      onClick={() => setShowEquipSlots(!showEquipSlots)}
    >
      <span>IMPLANT SLOTS ({equippedCount}/10)</span>
      {showEquipSlots ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
    </button>

{showEquipSlots && (

  <div className="p-2 grid grid-cols-5 gap-1">
    {AUGMENTATION_SLOTS.map((slot) => {
      const equipped = equippedAugmentations[slot];
      const isFiltering = selectedSlotFilter === slot;
      const hasCompatibleItems = augmentations.some(item => item.slot === slot);

  return (
    <div 
      key={slot}
      onClick={() => handleSlotClick(slot)}
      className={`
        relative p-1.5 rounded-sm text-center cursor-pointer transition-all
        ${equipped 
          ? 'bg-slate-700/50 border border-slate-600/50' 
          : isFiltering
            ? 'bg-cyan-900/40 border-2 border-cyan-500/70 ring-1 ring-cyan-400/30'
            : hasCompatibleItems
              ? 'bg-slate-800/60 border border-slate-600/40 hover:border-cyan-500/50 hover:bg-slate-700/50'
              : 'bg-slate-800/30 border border-slate-700/30 opacity-50'
        }
      `}
    >
      <div className="text-base mb-0.5">{AUGMENTATION_SLOT_ICONS[slot]}</div>
      <div className="text-[8px] font-mono text-slate-500 truncate">{AUGMENTATION_SLOT_NAMES[slot]}</div>
      {equipped?.passiveEffect && (
        <div className="text-[7px] font-mono text-cyan-400/80 truncate leading-tight">
          {equipped.passiveEffect === 'kizuna_coldstart' ? 'KZN' : equipped.passiveEffect === 'bypass_sdef' ? 'CBN' : ''}
        </div>
      )}
      {equipped && (
        <>
          <div 
            className="absolute inset-0 rounded-sm opacity-20"
            style={{ backgroundColor: getRarityColor(equipped.rarity) }}
          />
          <Button
            size="sm"
            variant="ghost"
            className="absolute -top-1 -right-1 w-4 h-4 p-0 text-[10px] bg-slate-900/90 text-red-400 hover:text-red-300 hover:bg-red-900/50 rounded-full"
            onClick={(e) => {
              e.stopPropagation();
              handleUnequip(slot);
            }}
          >
            <X className="w-3 h-3" />
          </Button>
        </>
      )}
    </div>
  );
})}

  </div>
)}

  </div>

{/* Filter Indicator */}
{selectedSlotFilter && (

<div className="p-2 bg-cyan-900/30 border-b border-cyan-700/30 flex items-center justify-between flex-shrink-0">
<span className="text-xs font-mono text-cyan-300">
{AUGMENTATION_SLOT_ICONS[selectedSlotFilter]} Showing: {AUGMENTATION_SLOT_NAMES[selectedSlotFilter]} ({filteredAugmentations.length} items)
</span>
<Button
size="sm"
variant="ghost"
className="h-5 px-2 text-[10px] text-cyan-400 hover:text-white"
onClick={() => setSelectedSlotFilter(null)}
>
Show All
</Button>
</div>
)}

{/* Item List - Scrollable Table */}

  <div className="flex-1 overflow-y-auto min-h-0">
    {filteredAugmentations.length === 0 && consumables.length === 0 ? (
      <p className="text-sm text-slate-600 text-center py-8 font-mono">
        {selectedSlotFilter 
          ? `No ${AUGMENTATION_SLOT_NAMES[selectedSlotFilter]} augmentations available`
          : 'No salvage. Neutralize targets to acquire.'}
      </p>
    ) : (
      <div className="divide-y divide-slate-700/30">
        {/* Augmentations */}
        {/* Augmentations */}
        {filteredAugmentations.map((item, index) => (
          <ExpandableItem key={`${item.id}-${index}`} item={item} onEquip={handleEquip} />
        ))}

{/* Consumables Section */}
{!selectedSlotFilter && consumables.length > 0 && (
  <>
    <div className="p-2 bg-slate-800/40 text-[10px] font-mono text-slate-500 tracking-wider">
      CONSUMABLES ({consumables.length})
    </div>
    {consumables.map((item, index) => (
      <div 
        key={`consumable-${item.id}-${index}`} 
        className="flex items-center gap-3 p-3 hover:bg-slate-800/40 transition-colors"
      >
        <div className="w-10 h-10 bg-slate-800/70 border border-slate-600/50 rounded flex items-center justify-center flex-shrink-0">
          <span className="text-lg">{item.icon || '💉'}</span>
        </div>
        <div className="flex-1 min-w-0">
          <div 
            className="font-mono text-sm truncate" 
            style={{ color: getRarityColor(item.rarity) }}
          >
            {item.name}
          </div>
          <div className="text-xs font-mono text-emerald-400/70">
            +{item.hpBonus || 0} HP
          </div>
        </div>
      </div>
    ))}
  </>
)}

  </div>
)}

  </div>
</div>

);
}