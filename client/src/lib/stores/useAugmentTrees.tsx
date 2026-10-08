import { create } from 'zustand';
import { AugmentationSlot, AUGMENTATION_SLOTS } from '../combat/types';
import { AUGMENT_TREES, TreePath, TreeTier } from '../combat/augmentTrees';
import { LoadoutAction } from './useLoadout';

// Progress state for one augment tree
export interface TreeProgress {
slot: AugmentationSlot;
chosenPath: TreePath | null;  // null = not yet branched
tier: TreeTier;               // 0 = just equipped, 1 = branched, 2 = upgraded, 3 = capstone
}

interface AugmentTreeState {
// One entry per slot that has a tree (populated when augment is equipped)
progress: Partial<Record<AugmentationSlot, TreeProgress>>;

// Points available to spend on upgrades - awarded on level up
availablePoints: number;

// Actions
unlockSlot: (slot: AugmentationSlot) => void;     // call when augment equipped
lockSlot: (slot: AugmentationSlot) => void;        // call when augment unequipped
choosePath: (slot: AugmentationSlot, path: TreePath) => boolean; // returns false if already chosen
upgradeTier: (slot: AugmentationSlot) => boolean;  // spends 1 point, returns false if can't
addPoints: (n: number) => void;

// Derives current combat actions from all progressed trees
getAugmentCombatActions: (equippedSlots: AugmentationSlot[]) => LoadoutAction[];

// Cumulative stat bonuses from all progressed trees
getTreeStatBonuses: (equippedSlots: AugmentationSlot[]) => {
attack: number; defense: number; hp: number; moveRange: number;
};

resetTrees: () => void;
}

export const useAugmentTrees = create<AugmentTreeState>()((set, get) => ({
progress: {},
availablePoints: 0,

unlockSlot: (slot) => {
// Called when equipping an augment. Always resets progress for this slot
// so replacing an augment clears the old path choice.
set((state) => ({
progress: {
...state.progress,
[slot]: { slot, chosenPath: null, tier: 0 } as TreeProgress,
},
}));
},

lockSlot: (slot) => {
set((state) => {
const next = { ...state.progress };
delete next[slot];
return { progress: next };
});
},

choosePath: (slot, path) => {
const state = get();
const prog = state.progress[slot];
if (!prog || prog.chosenPath !== null) return false; // already committed

set((s) => ({
progress: {
...s.progress,
[slot]: { ...prog, chosenPath: path, tier: 1 },
},
}));
return true;

},

upgradeTier: (slot) => {
const state = get();
const prog = state.progress[slot];
if (!prog || prog.chosenPath === null) return false;
if (prog.tier >= 3) return false;
if (state.availablePoints < 1) return false;

set((s) => ({
availablePoints: s.availablePoints - 1,
progress: {
...s.progress,
[slot]: { ...prog, tier: (prog.tier + 1) as TreeTier },
},
}));
return true;

},

addPoints: (n) => set((s) => ({ availablePoints: s.availablePoints + n })),

getAugmentCombatActions: (equippedSlots) => {
const state = get();
const actions: LoadoutAction[] = [];

for (const slot of equippedSlots) {
const prog = state.progress[slot];
if (!prog || prog.chosenPath === null || prog.tier < 1) continue;

const tree = AUGMENT_TREES[slot];
if (!tree) continue;

const pathData = tree.paths[prog.chosenPath];
const tierData = pathData.tiers[prog.tier - 1]; // tier 1 = index 0
if (!tierData.combatAction) continue;

actions.push({
...tierData.combatAction,
key: `aug_${slot}_${prog.chosenPath}_t${prog.tier}`,
unlocked: true,
source: 'augment',
} as LoadoutAction);
}

return actions;

},

getTreeStatBonuses: (equippedSlots) => {
const state = get();
let attack = 0, defense = 0, hp = 0, moveRange = 0;

for (const slot of equippedSlots) {
const prog = state.progress[slot];
if (!prog || prog.chosenPath === null || prog.tier < 1) continue;

const tree = AUGMENT_TREES[slot];
if (!tree) continue;

const pathData = tree.paths[prog.chosenPath];
// Sum bonuses from tier 1 up to current tier
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
}));