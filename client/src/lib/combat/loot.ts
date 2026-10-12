import { Item, ItemRarity, LootDrop, AugmentationSlot, AUGMENTATION_SLOTS, ACTIVE_SLOTS, PASSIVE_SLOTS } from './types';
import { ITEMS_2059 } from './items2059';

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
};
}

// Full item pools by rarity
// Crown items (cr_) are locked to rare+ per manufacturer design - filtered from early pools
export const ITEM_POOLS: Record<ItemRarity, Item[]> = {
common:    ITEMS_2059.filter(i => i.type === 'augmentation' && i.rarity === 'common'),
uncommon:  ITEMS_2059.filter(i => i.type === 'augmentation' && i.rarity === 'uncommon'),
rare:      ITEMS_2059.filter(i => i.type === 'augmentation' && i.rarity === 'rare'),
epic:      ITEMS_2059.filter(i => i.type === 'augmentation' && i.rarity === 'epic'),
legendary: ITEMS_2059.filter(i => i.type === 'augmentation' && i.rarity === 'legendary'),
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

/**
 * First life only: the first win hands you an active implant (a new combat
 * move) and the second a passive one, so both kinds get introduced early.
 */
function firstRunTeachingDrop(bossLevel: number): Item | null {
if (bossLevel === 1) return getRandomItemFromPool('common', ITEM_POOLS, pick(['left_arm', 'right_arm'] as AugmentationSlot[]));
if (bossLevel === 2) return getRandomItemFromPool('uncommon', ITEM_POOLS, pick(PASSIVE_SLOTS));
return null;
}

export function generateLoot(bossLevel: number = 1, firstRun = false): LootDrop {
const items: Item[] = [];
const teach = firstRun ? firstRunTeachingDrop(bossLevel) : null;
if (teach) {
const gold = LOOT.goldBase + LOOT.goldPerLevel * bossLevel;
const extra = bossLevel === 2 ? STIM_POOL.find(s => s.id === 'stim_bio') : undefined;
return { items: [instancedItem(teach), ...(extra ? [instancedItem(extra)] : [])], gold };
}

const isBoss = bossLevel % 10 === 0;
const isElite = bossLevel % 10 === 5;
const rarityAtLeast = (r: ItemRarity, floor: ItemRarity): ItemRarity =>
(RARITY_ORDER.indexOf(r) < RARITY_ORDER.indexOf(floor) ? floor : r);
const dropImplant = (rarity: ItemRarity) => {
const slot = AUGMENTATION_SLOTS[Math.floor(random() * AUGMENTATION_SLOTS.length)];
const item = getRandomItemFromPool(rarity, ITEM_POOLS, slot);
if (item) items.push(instancedItem(item));
};

if (isBoss) {
// Bosses: two implants, one of them epic or better
dropImplant(random() < Math.min(0.5, 0.15 + 0.01 * bossLevel) ? 'legendary' : 'epic');
dropImplant(rollRarity(bossLevel));
} else if (isElite) {
// Elites: always one implant, rare or better from level 15
dropImplant(rarityAtLeast(rollRarity(bossLevel), bossLevel >= 15 ? 'rare' : 'uncommon'));
} else if (random() < LOOT.normalDropChance) {
dropImplant(rollRarity(bossLevel));
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

// Patchwork King (level 10): always better than a normal threat-9 drop.
// A guaranteed epic, a rare, a 35% shot at a legendary, a stim and a big purse.
export function generatePatchworkKingLoot(): LootDrop {
const items: Item[] = [];
const epic = getRandomItemFromPool('epic', ITEM_POOLS, pick(AUGMENTATION_SLOTS));
const rare = getRandomItemFromPool('rare', ITEM_POOLS, pick(ACTIVE_SLOTS));
if (epic) items.push(instancedItem(epic));
if (rare) items.push(instancedItem(rare));
if (random() < 0.35) {
const leg = getRandomItemFromPool('legendary', ITEM_POOLS, pick(AUGMENTATION_SLOTS));
if (leg) items.push(instancedItem(leg));
}
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