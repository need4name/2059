import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { saveStorage } from '../save';
import { AugmentationSlot, augmentKind, type Item } from '../combat/types';
import { actionForItem } from '../combat/augments';
import { treeKind, blockedBy, costOf, spent, effectOf, WINS_PER_POINT, type TreeKind } from '../engine/upgrades';
import { LoadoutAction } from './useLoadout';
import { useInventory } from './useInventory';

// Upgrade trees (engine/upgrades.ts). Progress belongs to the implant itself, so a
// part keeps its upgrades when you take it out and refit it, and selling or giving
// it away gives the points back. Points come from wins: one per WINS_PER_POINT.

interface AugmentTreeState {
  /** Nodes owned, by implant id. */
  owned: Record<string, string[]>;
  availablePoints: number;
  /** Wins toward the next point. */
  wins: number;

  /** Take a node on the implant in this slot. */
  take: (slot: AugmentationSlot, node: string) => boolean;
  /** A fight won: count it toward the next point. */
  winFight: () => void;
  addPoints: (n: number) => void;
  /** An implant leaves for good (sold, given away): its points come back. */
  forget: (item: Item) => void;

  getAugmentCombatActions: (equippedSlots: AugmentationSlot[]) => LoadoutAction[];
  getTreeStatBonuses: (equippedSlots: AugmentationSlot[]) => { attack: number; defense: number; hp: number; moveRange: number; evasion: number };

  resetTrees: () => void;
}

const installed = (slot: AugmentationSlot) => useInventory.getState().equippedAugmentations[slot];

/** Which tree an implant grows. */
export function treeOf(item: Item): TreeKind | null {
  if (item.type !== 'augmentation' || !item.slot) return null;
  const active = augmentKind(item.slot) === 'active';
  return treeKind(active, active && actionForItem(item)?.type === 'brace');
}

export const useAugmentTrees = create<AugmentTreeState>()(persist((set, get) => ({
  owned: {},
  availablePoints: 0,
  wins: 0,

  take: (slot, node) => {
    const item = installed(slot);
    const kind = item && treeOf(item);
    if (!item || !kind) return false;
    const mine = get().owned[item.id] ?? [];
    if (blockedBy(kind, mine, node, get().availablePoints)) return false;
    set(s => ({ availablePoints: s.availablePoints - costOf(kind, node), owned: { ...s.owned, [item.id]: [...mine, node] } }));
    return true;
  },

  winFight: () => {
    const w = get().wins + 1;
    set(s => (w >= WINS_PER_POINT ? { wins: 0, availablePoints: s.availablePoints + 1 } : { wins: w }));
  },

  addPoints: (n) => set(s => ({ availablePoints: s.availablePoints + n })),

  forget: (item) => {
    const mine = get().owned[item.id];
    const kind = treeOf(item);
    if (!mine || !kind) return;
    const { [item.id]: _gone, ...rest } = get().owned;
    set(s => ({ owned: rest, availablePoints: s.availablePoints + spent(kind, mine) }));
  },

  // Active implants (arms, legs, eyes) each give one combat action, shaped by
  // the implant's parts and its upgrade tree. Passive implants never give actions.
  getAugmentCombatActions: (equippedSlots) => {
    const actions: LoadoutAction[] = [];
    for (const slot of equippedSlots) {
      if (augmentKind(slot) !== 'active') continue;
      const item = installed(slot);
      const kind = item && treeOf(item);
      if (!item || !kind) continue;
      const action = actionForItem(item, effectOf(kind, get().owned[item.id] ?? []));
      if (action) actions.push({ ...action, key: `aug_${item.id}`, unlocked: true, source: 'augment' } as LoadoutAction);
    }
    return actions;
  },

  // Stats from every installed implant's tree. Movement doesn't stack across implants: the best one counts.
  getTreeStatBonuses: (equippedSlots) => {
    let attack = 0, defense = 0, hp = 0, moveRange = 0, evasion = 0;
    for (const slot of equippedSlots) {
      const item = installed(slot);
      const kind = item && treeOf(item);
      if (!item || !kind) continue;
      const e = effectOf(kind, get().owned[item.id] ?? []);
      attack += e.attack ?? 0; defense += e.defense ?? 0; hp += e.hp ?? 0; evasion += e.evasion ?? 0;
      moveRange = Math.max(moveRange, e.move ?? 0);
    }
    return { attack, defense, hp, moveRange, evasion };
  },

  resetTrees: () => set({ owned: {}, availablePoints: 0, wins: 0 }),
}), {
  name: '2059-trees', storage: createJSONStorage(() => saveStorage),
  version: 3,
  // Before version 3, trees were "pick A or B, then two tiers". Give back every point spent; the new trees start empty
  migrate: (old: unknown) => {
    const o = (old ?? {}) as { progress?: Record<string, { tier?: number }>; availablePoints?: number };
    const refund = Object.values(o.progress ?? {}).reduce((n, p) => n + Math.max(0, (p.tier ?? 0) - 1), 0);
    return { owned: {}, wins: 0, availablePoints: (o.availablePoints ?? 0) + refund } as unknown as AugmentTreeState;
  },
  partialize: (s) => ({ owned: s.owned, availablePoints: s.availablePoints, wins: s.wins }),
}));
