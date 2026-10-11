import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { AugmentationSlot, augmentKind } from '../combat/types';
import { AUGMENT_TREES, TreePath, TreeTier } from '../combat/augmentTrees';
import { actionForItem } from '../combat/augments';
import { LoadoutAction } from './useLoadout';
import { useInventory } from './useInventory';

// Upgrade progress belongs to the implant itself, so only installed implants
// can be upgraded and a part keeps its upgrades if you take it out and refit it.
export interface TreeProgress {
itemId: string;
slot: AugmentationSlot;
chosenPath: TreePath | null;  // null = not yet branched
tier: TreeTier;               // 0 = just equipped, 1 = branched, 2 = upgraded, 3 = capstone
}

interface AugmentTreeState {
progress: Record<string, TreeProgress>;
availablePoints: number;

/** Progress for whatever is installed in a slot right now. */
getProgress: (slot: AugmentationSlot) => TreeProgress | undefined;
unlockSlot: (slot: AugmentationSlot) => void;     // call when an implant is installed
choosePath: (slot: AugmentationSlot, path: TreePath) => boolean;
upgradeTier: (slot: AugmentationSlot) => boolean;  // spends 1 point
addPoints: (n: number) => void;

getAugmentCombatActions: (equippedSlots: AugmentationSlot[]) => LoadoutAction[];
getTreeStatBonuses: (equippedSlots: AugmentationSlot[]) => { attack: number; defense: number; hp: number; moveRange: number };

resetTrees: () => void;
}

const installed = (slot: AugmentationSlot) => useInventory.getState().equippedAugmentations[slot];

export const useAugmentTrees = create<AugmentTreeState>()(persist((set, get) => ({
progress: {},
availablePoints: 0,

getProgress: (slot) => {
const item = installed(slot);
return item ? get().progress[item.id] : undefined;
},

unlockSlot: (slot) => {
const item = installed(slot);
if (!item || get().progress[item.id]) return;
set(s => ({ progress: { ...s.progress, [item.id]: { itemId: item.id, slot, chosenPath: null, tier: 0 } } }));
},

choosePath: (slot, path) => {
const item = installed(slot);
if (!item) return false;
const prog = get().progress[item.id] ?? { itemId: item.id, slot, chosenPath: null, tier: 0 as TreeTier };
if (prog.chosenPath !== null) return false;
set(s => ({ progress: { ...s.progress, [item.id]: { ...prog, chosenPath: path, tier: 1 } } }));
return true;
},

upgradeTier: (slot) => {
const item = installed(slot);
const prog = item ? get().progress[item.id] : undefined;
if (!item || !prog || prog.chosenPath === null || prog.tier >= 3 || get().availablePoints < 1) return false;
set(s => ({
availablePoints: s.availablePoints - 1,
progress: { ...s.progress, [item.id]: { ...prog, tier: (prog.tier + 1) as TreeTier } },
}));
return true;
},

addPoints: (n) => set(s => ({ availablePoints: s.availablePoints + n })),

// Active implants (arms, legs, eyes) each give one combat action, shaped by
// the implant's maker and rarity and sharpened by its upgrade path.
// Passive implants never give actions.
getAugmentCombatActions: (equippedSlots) => {
const actions: LoadoutAction[] = [];
for (const slot of equippedSlots) {
if (augmentKind(slot) !== 'active') continue;
const item = installed(slot);
if (!item) continue;
const prog = get().progress[item.id];
const action = actionForItem(item, { path: prog?.chosenPath ?? null, tier: prog?.tier ?? 0 });
if (action) actions.push({ ...action, key: `aug_${item.id}`, unlocked: true, source: 'augment' } as LoadoutAction);
}
return actions;
},

getTreeStatBonuses: (equippedSlots) => {
let attack = 0, defense = 0, hp = 0, moveRange = 0;
for (const slot of equippedSlots) {
const item = installed(slot);
const prog = item ? get().progress[item.id] : undefined;
if (!prog || prog.chosenPath === null || prog.tier < 1) continue;
const pathData = AUGMENT_TREES[slot]?.paths[prog.chosenPath];
if (!pathData) continue;
for (let t = 0; t < prog.tier; t++) {
attack   += pathData.tiers[t].attackBonus;
defense  += pathData.tiers[t].defenseBonus;
hp       += pathData.tiers[t].hpBonus;
moveRange = Math.max(moveRange, pathData.tiers[t].moveRange ?? 0);
}
}
return { attack, defense, hp, moveRange };
},

resetTrees: () => set({ progress: {}, availablePoints: 0 }),
}), {
name: '2059-trees',
version: 2,
// v1 kept progress per body slot; refund those points instead of guessing which part they belonged to
migrate: (old: unknown) => {
const o = (old ?? {}) as { progress?: Record<string, { tier?: number; chosenPath?: unknown }>; availablePoints?: number };
const refund = Object.values(o.progress ?? {}).reduce((n, p) => n + Math.max(0, (p.tier ?? 0) - 1), 0);
return { progress: {}, availablePoints: (o.availablePoints ?? 0) + refund } as unknown as AugmentTreeState;
},
partialize: (s) => ({ progress: s.progress, availablePoints: s.availablePoints }),
}));
