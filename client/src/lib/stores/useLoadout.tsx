import { create } from 'zustand';
import { CombatAction } from '../combat/types';

// The pool of actions available to slot - starts with base moves,
// grows as augments and class abilities are unlocked.
// Each entry has a stable key so the UI can track selection.
export interface LoadoutAction extends CombatAction {
key: string;        // stable unique ID for this action in the pool
unlocked: boolean;  // false = greyed out, not yet earned
source: 'base' | 'class' | 'augment' | 'weapon'; // where it came from
}

// 4 combat slots - any can be null (empty = fewer options in combat)
export type LoadoutSlots = [
LoadoutAction | null,
LoadoutAction | null,
LoadoutAction | null,
LoadoutAction | null,
];

interface LoadoutState {
slots: LoadoutSlots;
// Which slot index the player is currently editing (null = not editing)
editingSlot: number | null;

setSlot: (index: number, action: LoadoutAction | null) => void;
setEditingSlot: (index: number | null) => void;
resetLoadout: () => void;
// Returns only the non-null slots as the active combat actions
getActiveCombatActions: () => LoadoutAction[];
}

const DEFAULT_SLOTS: LoadoutSlots = [null, null, null, null];

export const useLoadout = create<LoadoutState>()((set, get) => ({
slots: DEFAULT_SLOTS,
editingSlot: null,

setSlot: (index, action) => {
set((state) => {
const newSlots = [...state.slots] as LoadoutSlots;
// If this action is already in another slot, clear that slot first
if (action) {
newSlots.forEach((s, i) => {
if (s?.key === action.key && i !== index) newSlots[i] = null;
});
}
newSlots[index] = action;
return { slots: newSlots, editingSlot: null };
});
},

setEditingSlot: (index) => set({ editingSlot: index }),

resetLoadout: () => set({ slots: DEFAULT_SLOTS, editingSlot: null }),

getActiveCombatActions: () => {
return get().slots.filter((s): s is LoadoutAction => s !== null);
},
}));

// ── Gritty mechanic tags (no sci-fi gloss) ───────────────────────────────────
// Called by UI to label what makes each action mechanically different
export function getMechanicTag(action: CombatAction): string | null {
if ((action as any).ignoreRange) return 'LOCK-ON';
const pat = (action as any).attackPattern;
if (pat === 'aoe') return 'SCATTER';
if (pat === 'diagonal_cross') return 'X-PATTERN';
if (pat === 'cone') return 'CONE';
if (action.healing && action.damage) return 'SIPHON';  // damage that feeds back
if (action.healing && !action.damage) return 'PATCH';
if (action.defenseBoost && action.type === 'brace') return 'BRACE';
if (action.defenseBoost) return 'FORTIFY';
if (pat === 'melee' || pat === 'melee_long') return 'CLOSE';
return null;
}