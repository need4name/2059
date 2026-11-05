import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { saveStorage } from '../save';
import { AugmentationSlot, augmentKind, type Item } from '../combat/types';
import { actionForItem } from '../combat/augments';
import { treeKind, treeFor, blockedIn, costIn, spentIn, effectIn, WINS_PER_POINT, type TreeKind, type UpgradeNode } from '../engine/upgrades';
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

/** The tree an implant grows (its own, worked out from the part), or null if it grows none. */
export function nodesOf(item: Item): UpgradeNode[] | null {
  const kind = treeOf(item);
  return kind ? treeFor(item, kind) : null;
}

export const useAugmentTrees = create<AugmentTreeState>()(persist((set, get) => ({
  owned: {},
  availablePoints: 0,
  wins: 0,

  take: (slot, node) => {
    const item = installed(slot);
    const tree = item && nodesOf(item);
    if (!item || !tree) return false;
    const mine = get().owned[item.id] ?? [];
    if (blockedIn(tree, mine, node, get().availablePoints)) return false;
    set(s => ({ availablePoints: s.availablePoints - costIn(tree, node), owned: { ...s.owned, [item.id]: [...mine, node] } }));
    return true;
  },

  winFight: () => {
    const w = get().wins + 1;
    set(s => (w >= WINS_PER_POINT ? { wins: 0, availablePoints: s.availablePoints + 1 } : { wins: w }));
  },

  addPoints: (n) => set(s => ({ availablePoints: s.availablePoints + n })),

  forget: (item) => {
    const mine = get().owned[item.id];
    const tree = nodesOf(item);
    if (!mine || !tree) return;
    const { [item.id]: _gone, ...rest } = get().owned;
    set(s => ({ owned: rest, availablePoints: s.availablePoints + spentIn(tree, mine) }));
  },

  // Active implants (arms, legs, eyes) each give one combat action, shaped by
  // the implant's parts and its upgrade tree. Passive implants never give actions.
  getAugmentCombatActions: (equippedSlots) => {
    const actions: LoadoutAction[] = [];
    for (const slot of equippedSlots) {
      if (augmentKind(slot) !== 'active') continue;
      const item = installed(slot);
      const tree = item && nodesOf(item);
      if (!item || !tree) continue;
      const action = actionForItem(item, effectIn(tree, get().owned[item.id] ?? []));
      if (action) actions.push({ ...action, key: `aug_${item.id}`, unlocked: true, source: 'augment' } as LoadoutAction);
    }
    return actions;
  },

  // Stats from every installed implant's tree. Movement doesn't stack across implants: the best one counts.
  getTreeStatBonuses: (equippedSlots) => {
    let attack = 0, defense = 0, hp = 0, moveRange = 0, evasion = 0;
    for (const slot of equippedSlots) {
      const item = installed(slot);
      const tree = item && nodesOf(item);
      if (!item || !tree) continue;
      const e = effectIn(tree, get().owned[item.id] ?? []);
      attack += e.attack ?? 0; defense += e.defense ?? 0; hp += e.hp ?? 0; evasion += e.evasion ?? 0;
      moveRange = Math.max(moveRange, e.move ?? 0);
    }
    return { attack, defense, hp, moveRange, evasion };
  },

  resetTrees: () => set({ owned: {}, availablePoints: 0, wins: 0 }),
}), {
  name: '2059-trees', storage: createJSONStorage(() => saveStorage),
  version: 4,
  migrate: (old: unknown, version) => {
    // Before version 3, trees were "pick A or B, then two tiers"
    if (version < 3) {
      const o = (old ?? {}) as { progress?: Record<string, { tier?: number }>; availablePoints?: number };
      const refund = Object.values(o.progress ?? {}).reduce((n, p) => n + Math.max(0, (p.tier ?? 0) - 1), 0);
      return { owned: {}, wins: 0, availablePoints: (o.availablePoints ?? 0) + refund } as unknown as AugmentTreeState;
    }
    // Version 3 had one fixed tree for everyone (each owned list a chain from the root, costing 1, 1, 2, 3).
    // Every part now grows its own tree, so give the points back and start the new trees empty
    const o = (old ?? {}) as { owned?: Record<string, string[]>; availablePoints?: number; wins?: number };
    const refund = Object.values(o.owned ?? {}).reduce((n, list) => n + list.reduce((m, _, k) => m + [1, 1, 2, 3][Math.min(3, k)], 0), 0);
    return { owned: {}, wins: o.wins ?? 0, availablePoints: (o.availablePoints ?? 0) + refund } as unknown as AugmentTreeState;
  },
  partialize: (s) => ({ owned: s.owned, availablePoints: s.availablePoints, wins: s.wins }),
}));
