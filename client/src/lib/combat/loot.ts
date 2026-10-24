import { Item, ItemRarity, LootDrop, AugmentationSlot, AUGMENTATION_SLOTS, ACTIVE_SLOTS, PASSIVE_SLOTS } from './types';
import { ITEMS_2059 } from './items2059';
import { rollParts, normaliseItem } from './augments';

import { random } from '../engine/rng';
/** Drop tuning (see docs/DESIGN.md). */
export const LOOT = { normalDropChance: 0.5, stimMin: 0.15, stimMax: 0.25, goldBase: 10, goldPerLevel: 8 };
const RARITY_ORDER: ItemRarity[] = ['common', 'uncommon', 'rare', 'epic', 'legendary'];

// STIM items are pulled by id so they always exist regardless of rarity filtering
const STIM_IDS = ['stim_heat_flush', 'stim_bio', 'stim_structural', 'stim_overclock'];
const STIM_POOL: Item[] = ITEMS_2059.filter(i => STIM_IDS.includes(i.id));

// Turn a template item (from ITEM_POOLS) into a unique drop instance
export function instancedItem(item: Item): Item {
return {
...item,
templateId: item.id,
id: `${item.id}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
// Active implants are built from parts when they drop (head + mods; see augments.ts)
parts: item.parts ?? rollParts(item),
};
}

// Full item pools by rarity
// Crown items (cr_) are locked to rare+ per manufacturer design - filtered from early pools
export const ITEM_POOLS: Record<ItemRarity, Item[]> = {
common:    ITEMS_2059.filter(i => i.type === 'augmentation' && !i.signature && i.rarity === 'common'),
uncommon:  ITEMS_2059.filter(i => i.type === 'augmentation' && !i.signature && i.rarity === 'uncommon'),
rare:      ITEMS_2059.filter(i => i.type === 'augmentation' && !i.signature && i.rarity === 'rare'),
epic:      ITEMS_2059.filter(i => i.type === 'augmentation' && !i.signature && i.rarity === 'epic'),
legendary: ITEMS_2059.filter(i => i.type === 'augmentation' && !i.signature && i.rarity === 'legendary'),
};

// All levels use the same item pool.
// The pw_ prefix filter was removed -- no items carry that prefix in items2059.
// PATCHWORK_POOLS was an empty object and caused 0% item drops on levels 1-5.

// Rarity weights by boss level - graduated from common-heavy to rare-possible
function getRarityWeights(bossLevel: number): Record<ItemRarity, number> {
if (bossLevel <= 2)  return { common: 90, uncommon: 10, rare: 0,  epic: 0, legendary: 0 };
if (bossLevel === 3) return { common: 75, uncommon: 22, rare: 3,  epic: 0, legendary: 0 };
if (bossLevel === 4) return { common: 60, uncommon: 33, rare: 7,  epic: 0, legendary: 0 };
if (bossLevel === 5) return { common: 45, uncommon: 40, rare: 13, epic: 2, legendary: 0 };
if (bossLevel <= 7)  return { common: 30, uncommon: 38, rare: 22, epic: 8, legendary: 2 };
if (bossLevel <= 9)  return { common: 15, uncommon: 30, rare: 35, epic: 15, legendary: 5 };
// Past the King the odds keep improving until commons stop dropping
const t = Math.min(10, bossLevel - 9);
return { common: Math.max(0, 10 - t), uncommon: Math.max(8, 26 - 2 * t), rare: 36, epic: 18 + 1.5 * t, legendary: 6 + 1.2 * t };
}

function rollRarity(bossLevel: number): ItemRarity {
const weights = getRarityWeights(bossLevel);
const total = Object.values(weights).reduce((a, b) => a + b, 0);
let roll = random() * total;
for (const [rarity, weight] of Object.entries(weights)) {
roll -= weight;
if (roll <= 0) return rarity as ItemRarity;
}
return 'common';
}

function getRandomItemFromPool(
rarity: ItemRarity,
pools: Record<ItemRarity, Item[]>,
slot?: AugmentationSlot,
): Item | null {
let pool = pools[rarity];
if (slot) pool = pool.filter(i => i.slot === slot);
if (pool.length === 0) pool = pools[rarity]; // drop slot constraint if nothing found
if (pool.length === 0) return null;
return pool[Math.floor(random() * pool.length)];
}

function pick<T>(list: T[]): T { return list[Math.floor(random() * list.length)]; }

/** Salvage is used gear: half of it arrives worn or worse. */
function usedCondition(): Item['condition'] {
const r = random();
return r < 0.5 ? 'pristine' : r < 0.85 ? 'worn' : 'degraded';
}

/** A signature implant at a rolled quality, its stats brought into that quality's band. */
export function signatureImplant(id: string, rarity: ItemRarity): Item | null {
const t = ITEMS_2059.find(i => i.id === id && i.signature);
return t ? instancedItem(normaliseItem({ ...t, rarity })) : null;
}

/** Carried implants roll at the drop odds of this many threats lower. */
export const CARRIED_QUALITY_LAG = 6;

export type EnemyRole = 'normal' | 'elite' | 'boss' | 'setpiece';

/**
 * The implants an enemy carries into a fight: real items built from parts,
 * which the player can strip from the body afterwards (see the strip screen).
 * Bosses and elites carry their signature implant at a rolled quality.
 * First life: the first two enemies carry a teaching implant (an arm, then a passive).
 */
export function rollCarried(level: number, count: number, role: EnemyRole, firstRun = false, signature?: string): Item[] {
if (firstRun && level === 1) { const t = getRandomItemFromPool('common', ITEM_POOLS, pick(['left_arm', 'right_arm'] as AugmentationSlot[])); return t ? [instancedItem({ ...t, condition: 'pristine' })] : []; }
if (firstRun && level === 2) { const t = getRandomItemFromPool('uncommon', ITEM_POOLS, pick(PASSIVE_SLOTS)); return t ? [instancedItem({ ...t, condition: 'pristine' })] : []; }
const out: Item[] = [];
const rarityAtLeast = (r: ItemRarity, floor: ItemRarity): ItemRarity => (RARITY_ORDER.indexOf(r) < RARITY_ORDER.indexOf(floor) ? floor : r);
if (signature && (role === 'boss' || role === 'elite')) {
  const rarity = role === 'boss'
    ? (random() < Math.min(0.5, 0.15 + 0.01 * level) ? 'legendary' : 'epic')
    : rarityAtLeast(rollRarity(level), level >= 15 ? 'rare' : 'uncommon');
  const sig = signatureImplant(signature, rarity);
  if (sig) out.push(sig);
}
const taken = new Set(out.map(i => i.slot));
while (out.length < count) {
  const free = AUGMENTATION_SLOTS.filter(sl => !taken.has(sl));
  const slot = pick(free.length ? free : AUGMENTATION_SLOTS);
  // Worn gear: what enemies wear rolls at the odds of six threats lower
  const worn = rollRarity(Math.max(1, level - CARRIED_QUALITY_LAG));
  const t = getRandomItemFromPool(role === 'elite' && !out.length ? rarityAtLeast(worn, 'uncommon') : worn, ITEM_POOLS, slot);
  if (!t) break;
  taken.add(t.slot);
  out.push(instancedItem({ ...t, condition: usedCondition() }));
}
return out;
}

/** What a win pays besides the bodies: credits, and sometimes a stim (always from a boss). */
export function generateLoot(bossLevel: number = 1, firstRun = false): LootDrop {
const items: Item[] = [];
const isBoss = bossLevel % 10 === 0;
if (firstRun && bossLevel <= 2) {
const extra = bossLevel === 2 ? STIM_POOL.find(st => st.id === 'stim_bio') : undefined;
return { items: extra ? [instancedItem(extra)] : [], gold: LOOT.goldBase + LOOT.goldPerLevel * bossLevel };
}
// Stims: 15% early, rising to 25%; always one from a boss
const stimChance = isBoss ? 1 : bossLevel < 2 ? 0 : Math.min(LOOT.stimMax, LOOT.stimMin + 0.005 * bossLevel);
if (random() < stimChance && STIM_POOL.length > 0) {
const availableStims = bossLevel >= 5 ? STIM_POOL : STIM_POOL.filter(st => st.id !== 'stim_overclock');
const stim = availableStims[Math.floor(random() * availableStims.length)];
if (stim) items.push(instancedItem(stim));
}
const baseGold = LOOT.goldBase + LOOT.goldPerLevel * bossLevel;
const gold = baseGold + Math.floor(random() * baseGold);
return { items, gold };
}

/** The Patchwork King's purse: a stim and a big pile of credits (his implants are on his body). */
export function generatePatchworkKingLoot(): LootDrop {
const items: Item[] = [];
const stim = pick(STIM_POOL);
if (stim) items.push(instancedItem(stim));
const gold = 160 + Math.floor(random() * 60);
return { items, gold };
}

export function getRarityColor(rarity: ItemRarity): string {
switch (rarity) {
case 'common':    return '#9ca3af';
case 'uncommon':  return '#10b981';
case 'rare':      return '#3b82f6';
case 'epic':      return '#a855f7';
case 'legendary': return '#f59e0b';
default:          return '#ffffff';
}
}