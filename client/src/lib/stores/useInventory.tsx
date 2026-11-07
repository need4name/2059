import { create } from 'zustand';
import { CONDITION_MULT, structureOf, healthCostOf, canSplice } from '../combat/augments';
import { persist, createJSONStorage } from 'zustand/middleware';
import { saveStorage } from '../save';
import { Item, AugmentationSlot, AUGMENTATION_SLOTS, Weapon } from '../combat/types';

// Equipped augmentations for each body slot
export type EquippedAugmentations = Record<AugmentationSlot, Item | null>;

interface InventoryState {
items: Item[];
gold: number;
equippedAugmentations: EquippedAugmentations;
ownedWeapons: Weapon[];
equippedWeapon: Weapon | null;
/** Splice firmware: a second implant spliced into a passive slot, beside the one fitted there. */
spliced: Partial<Record<AugmentationSlot, Item | null>>;

addItems: (newItems: Item[]) => void;
/** Splice a spare implant into its slot beside the fitted one (the caller checks the firmware and the pair limit). */
spliceIn: (item: Item) => void;
/** Take a spliced implant back out into the bag. */
unsplice: (slot: AugmentationSlot) => void;
/** Take every spliced implant back out (another firmware loaded). */
unspliceAll: () => void;
addGold: (amount: number) => void;
spendGold: (amount: number) => boolean;
removeItem: (itemId: string) => void;
clearInventory: () => void;
equipAugmentation: (item: Item) => void;
unequipAugmentation: (slot: AugmentationSlot) => void;
useConsumable: (itemId: string) => Item | null;
getTotalAugmentationBonuses: () => { physicalAttack: number; structuralAttack: number; physicalDefense: number; structuralDefense: number; hp: number; evasion: number; structure: number; hpCost: number; bypassStructuralDefense: boolean; hasKizuna: boolean; treeAttack: number; treeDefense: number; treeHp: number };
buyWeapon: (weapon: Weapon) => boolean;
upgradeWeapon: (tier1Id: string, tier2Weapon: Weapon) => boolean;
sellWeapon: (weaponId: string) => void;
equipWeapon: (weapon: Weapon | null) => void;
}

// Create empty augmentation slots
function createEmptyAugmentations(): EquippedAugmentations {
const slots: Partial<EquippedAugmentations> = {};
for (const slot of AUGMENTATION_SLOTS) {
slots[slot] = null;
}
return slots as EquippedAugmentations;
}

export const useInventory = create<InventoryState>()(persist((set, get) => ({
items: [],
gold: 0,
equippedAugmentations: createEmptyAugmentations(),
ownedWeapons: [],
equippedWeapon: null,
spliced: {},

spliceIn: (item: Item) => {
const s = get();
const slot = item.slot as AugmentationSlot | undefined;
const main = slot ? s.equippedAugmentations[slot] : null;
if (!slot || !main || !canSplice(main, item) || !s.items.some(i => i.id === item.id)) return;
const old = s.spliced[slot];
set({ spliced: { ...s.spliced, [slot]: item }, items: [...s.items.filter(i => i.id !== item.id), ...(old ? [old] : [])] });
},
unsplice: (slot: AugmentationSlot) => {
const s = get(), it = s.spliced[slot];
if (!it) return;
set({ spliced: { ...s.spliced, [slot]: null }, items: [...s.items, it] });
},
unspliceAll: () => {
const s = get();
const out = Object.values(s.spliced).filter((i): i is Item => !!i);
if (out.length) set({ spliced: {}, items: [...s.items, ...out] });
},

addItems: (newItems: Item[]) => {
set((state) => ({
items: [...state.items, ...newItems],
}));
},

addGold: (amount: number) => {
set((state) => ({
gold: state.gold + amount,
}));
},

spendGold: (amount: number) => {
let success = false;
set((state) => {
if (state.gold >= amount) {
success = true;
return { gold: state.gold - amount };
}
return state;
});
return success;
},

removeItem: (itemId: string) => {
set((state) => ({
items: state.items.filter(item => item.id !== itemId),
}));
},

clearInventory: () => {
set({
items: [],
gold: 0,
equippedAugmentations: createEmptyAugmentations(),
ownedWeapons: [],
equippedWeapon: null,
spliced: {},
});
},

equipAugmentation: (item: Item) => {
if (item.type !== 'augmentation' || !item.slot) return;

set((state) => {
const slot = item.slot as AugmentationSlot;
const currentEquipped = state.equippedAugmentations[slot];

// Remove the new item from inventory
const newItems = state.items.filter(i => i.id !== item.id);

// If there's already something equipped in this slot, return it to inventory
if (currentEquipped) {
newItems.push(currentEquipped);
}
// A spliced partner that doesn't take to the new part comes out too
const partner = state.spliced?.[slot];
const keep = partner && canSplice(item, partner);
if (partner && !keep) newItems.push(partner);

return {
equippedAugmentations: {
...state.equippedAugmentations,
[slot]: item,
},
items: newItems,
spliced: { ...state.spliced, [slot]: keep ? partner : null },
};
});

},

unequipAugmentation: (slot: AugmentationSlot) => {
set((state) => {
const equipped = state.equippedAugmentations[slot];
if (!equipped) return state;

// Its spliced partner comes out with it
const partner = state.spliced?.[slot];
return {
equippedAugmentations: {
...state.equippedAugmentations,
[slot]: null,
},
items: [...state.items, equipped, ...(partner ? [partner] : [])],
spliced: { ...state.spliced, [slot]: null },
};
});

},

useConsumable: (itemId: string) => {
let consumable: Item | null = null;
set((state) => {
const item = state.items.find(i => i.id === itemId && i.type === 'consumable');
if (item) {
consumable = item;
return {
items: state.items.filter(i => i.id !== itemId),
};
}
return state;
});
return consumable;
},

getTotalAugmentationBonuses: () => {
const state = get();
let physicalAttack   = 0;
let structuralAttack = 0;
let physicalDefense  = 0;
let structuralDefense = 0;
let hp      = 0;
let evasion = 0;
let bypassStructuralDefense = false;
let hasKizuna = false;

let structure = 0;
let hpCost = 0;

// Fitted implants, and any spliced in beside them (Splice): both count
const worn = AUGMENTATION_SLOTS.flatMap(sl => [state.equippedAugmentations[sl], state.spliced?.[sl] ?? null]);
for (const item of worn) {
if (item) {
// Worn parts work at reduced strength; a part never subtracts stats
const m = CONDITION_MULT[item.condition ?? 'pristine'] ?? 1;
const add = (n?: number) => (n && n > 0 ? Math.round(n * m) : 0);
physicalAttack    += add(item.attackBonus);
structuralAttack  += add(item.structuralAttackBonus);
physicalDefense   += add(item.defenseBonus);
structuralDefense += add(item.structuralDefenseBonus);
hp                += add(item.hpBonus);
evasion           += add(item.evasionBonus);
structure         += structureOf(item);
hpCost            += healthCostOf(item);
// Passive effects - condition does not suppress manufacturer traits
if (item.passiveEffect === 'bypass_sdef')      bypassStructuralDefense = true;
if (item.passiveEffect === 'kizuna_coldstart') hasKizuna = true;
}
}

return { physicalAttack, structuralAttack, physicalDefense, structuralDefense, hp, evasion, structure, hpCost, bypassStructuralDefense, hasKizuna, treeAttack: 0, treeDefense: 0, treeHp: 0 };

},

buyWeapon: (weapon: Weapon) => {
let success = false;
set((state) => {
if (state.gold >= weapon.price && !state.ownedWeapons.find(w => w.id === weapon.id)) {
success = true;
return { gold: state.gold - weapon.price, ownedWeapons: [...state.ownedWeapons, weapon] };
}
return state;
});
return success;
},

upgradeWeapon: (tier1Id: string, tier2Weapon: Weapon) => {
let success = false;
const cost = tier2Weapon.upgradePrice ?? tier2Weapon.price;
set((state) => {
const hasTier1 = state.ownedWeapons.find(w => w.id === tier1Id);
if (hasTier1 && state.gold >= cost && !state.ownedWeapons.find(w => w.id === tier2Weapon.id)) {
success = true;
const newOwned = state.ownedWeapons.filter(w => w.id !== tier1Id).concat(tier2Weapon);
const newEquipped = state.equippedWeapon?.id === tier1Id ? tier2Weapon : state.equippedWeapon;
return { gold: state.gold - cost, ownedWeapons: newOwned, equippedWeapon: newEquipped };
}
return state;
});
return success;
},

sellWeapon: (weaponId: string) => {
set((state) => {
const weapon = state.ownedWeapons.find(w => w.id === weaponId);
if (!weapon) return state;
const newEquipped = state.equippedWeapon?.id === weaponId ? null : state.equippedWeapon;
return {
gold: state.gold + weapon.sellPrice,
ownedWeapons: state.ownedWeapons.filter(w => w.id !== weaponId),
equippedWeapon: newEquipped,
};
});
},

equipWeapon: (weapon: Weapon | null) => {
set({ equippedWeapon: weapon });
},

}), { name: '2059-inventory', storage: createJSONStorage(() => saveStorage), version: 1,
// A save with missing body slots (older or hand-edited) still loads: fill the gaps with empty slots
merge: (persisted, current) => {
const p = (persisted ?? {}) as Partial<InventoryState>;
return { ...current, ...p, spliced: p.spliced ?? {}, equippedAugmentations: { ...createEmptyAugmentations(), ...(p.equippedAugmentations ?? {}) } };
},
}));
