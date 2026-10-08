import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { Item, AugmentationSlot, AUGMENTATION_SLOTS, Weapon } from '../combat/types';

// Equipped augmentations for each body slot
export type EquippedAugmentations = Record<AugmentationSlot, Item | null>;

interface InventoryState {
items: Item[];
gold: number;
equippedAugmentations: EquippedAugmentations;
ownedWeapons: Weapon[];
equippedWeapon: Weapon | null;

addItems: (newItems: Item[]) => void;
addGold: (amount: number) => void;
spendGold: (amount: number) => boolean;
removeItem: (itemId: string) => void;
clearInventory: () => void;
equipAugmentation: (item: Item) => void;
unequipAugmentation: (slot: AugmentationSlot) => void;
useConsumable: (itemId: string) => Item | null;
getTotalAugmentationBonuses: () => { physicalAttack: number; structuralAttack: number; physicalDefense: number; structuralDefense: number; hp: number; evasion: number; bypassStructuralDefense: boolean; hasKizuna: boolean; treeAttack: number; treeDefense: number; treeHp: number };
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

return {
equippedAugmentations: {
...state.equippedAugmentations,
[slot]: item,
},
items: newItems,
};
});

},

unequipAugmentation: (slot: AugmentationSlot) => {
set((state) => {
const equipped = state.equippedAugmentations[slot];
if (!equipped) return state;

return {
equippedAugmentations: {
...state.equippedAugmentations,
[slot]: null,
},
items: [...state.items, equipped],
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

// Condition multipliers apply only to that item's own bonuses
// corroded is negative - the item actively fights you
const conditionMultiplier = (condition: import('../combat/types').ItemCondition | undefined): number => {
switch (condition) {
case 'worn':     return 0.70;
case 'degraded': return 0.45;
case 'corroded': return -0.25;
default:         return 1.0;
}
};

for (const slot of AUGMENTATION_SLOTS) {
const item = state.equippedAugmentations[slot];
if (item) {
const m = conditionMultiplier(item.condition);
physicalAttack    += Math.floor((item.attackBonus            || 0) * m);
structuralAttack  += Math.floor((item.structuralAttackBonus  || 0) * m);
physicalDefense   += Math.floor((item.defenseBonus           || 0) * m);
structuralDefense += Math.floor((item.structuralDefenseBonus || 0) * m);
hp                += Math.floor((item.hpBonus                || 0) * m);
evasion           += Math.floor((item.evasionBonus           || 0) * m);
// Passive effects - condition does not suppress manufacturer traits
if (item.passiveEffect === 'bypass_sdef')      bypassStructuralDefense = true;
if (item.passiveEffect === 'kizuna_coldstart') hasKizuna = true;
}
}

return { physicalAttack, structuralAttack, physicalDefense, structuralDefense, hp, evasion, bypassStructuralDefense, hasKizuna, treeAttack: 0, treeDefense: 0, treeHp: 0 };

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

}), { name: '2059-inventory', version: 1 }));
