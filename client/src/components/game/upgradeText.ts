// Plain-language text for implant upgrade paths, worked out from the real
// numbers (the move an active implant gives, and the stats each tier adds), so
// what the screen says is always what the upgrade does.

import type { AugmentationSlot, Item } from '@/lib/combat/types';
import { augmentKind } from '@/lib/combat/types';
import { AUGMENT_TREES, type TreePath, type TreeTierData } from '@/lib/combat/augmentTrees';
import { actionForItem } from '@/lib/combat/augments';

/** "+2 attack · +4 health · +1 move" for one tier (or a sum of tiers). */
export function statText(t: Pick<TreeTierData, 'attackBonus' | 'defenseBonus' | 'hpBonus' | 'moveRange'>): string {
  return [
    t.attackBonus > 0 && `+${t.attackBonus} attack`,
    t.defenseBonus > 0 && `+${t.defenseBonus} defence`,
    t.hpBonus > 0 && `+${t.hpBonus} health`,
    t.moveRange ? `+${t.moveRange} move` : '',
  ].filter(Boolean).join(' · ');
}

/** Stats from tiers 1..upTo of a path added together (movement doesn't stack, it's the best tier's). */
export function pathTotals(slot: AugmentationSlot, path: TreePath, upTo = 3) {
  const tiers = AUGMENT_TREES[slot].paths[path].tiers.slice(0, upTo);
  return {
    attackBonus: tiers.reduce((a, t) => a + t.attackBonus, 0),
    defenseBonus: tiers.reduce((a, t) => a + t.defenseBonus, 0),
    hpBonus: tiers.reduce((a, t) => a + t.hpBonus, 0),
    moveRange: Math.max(0, ...tiers.map(t => t.moveRange ?? 0)),
  };
}

const signed = (h: number) => `${h > 0 ? '+' : ''}${h}`;
const heatText = (h: number) => `${signed(h)} heat`;

/** What a move does in a few words: "19 damage, +12 heat" or "+10 guard, −25 heat". */
export function moveText(item: Item, path: TreePath | null, tier: number): string | null {
  const m = actionForItem(item, { path, tier });
  if (!m) return null;
  const main = m.damage ? `${m.damage} damage` : `+${m.defenseBoost ?? 0} guard`;
  const full = m.accuracy === 'precise' ? ', always full damage' : '';
  return `${main}, ${heatText(m.heatGenerated ?? 0)}${full}`;
}

/** One-line summary of a path, and the detail of what it changes over all 3 tiers. */
export function pathSummary(item: Item, slot: AugmentationSlot, path: TreePath): { headline: string; detail: string[] } {
  const totals = statText(pathTotals(slot, path));
  if (augmentKind(slot) !== 'active') {
    return { headline: 'Stat boosts only', detail: totals ? [`Over 3 tiers: ${totals}.`] : [] };
  }
  const base = actionForItem(item, { path: null, tier: 0 });
  const top = actionForItem(item, { path, tier: 3 });
  const detail: string[] = [];
  if (base && top) {
    if (base.damage) {
      detail.push(`${base.name}: ${base.damage} → ${top.damage} damage, heat ${signed(base.heatGenerated ?? 0)} → ${signed(top.heatGenerated ?? 0)}.`);
      if (top.accuracy !== base.accuracy) detail.push(top.accuracy === 'precise' ? 'From tier 2 every hit lands at full damage.' : 'From tier 2 hits land more reliably.');
    } else {
      detail.push(`${base.name}: guard +${base.defenseBoost} → +${top.defenseBoost}, heat ${signed(base.heatGenerated ?? 0)} → ${signed(top.heatGenerated ?? 0)}.`);
    }
  }
  if (totals) detail.push(`Also over 3 tiers: ${totals}.`);
  const brace = base?.type === 'brace';
  const headline = brace
    ? (path === 'A' ? 'A stronger guard' : 'A stronger guard that cools you more')
    : (path === 'A' ? 'Hits harder, runs hotter' : 'Runs cooler and steadier');
  return { headline, detail };
}
