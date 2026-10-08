import { Item, ItemRarity, LootDrop, AugmentationSlot, AUGMENTATION_SLOTS } from './types';
import { ITEMS_2059 } from './items2059';

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
common:    ITEMS_2059.filter(i => i.rarity === 'common'    && !i.id.startsWith('cr_')),
uncommon:  ITEMS_2059.filter(i => i.rarity === 'uncommon'  && !i.id.startsWith('cr_')),
rare:      ITEMS_2059.filter(i => i.rarity === 'rare'),
epic:      ITEMS_2059.filter(i => i.rarity === 'epic'),
legendary: ITEMS_2059.filter(i => i.rarity === 'legendary'),
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
// Boss 8 (Patchwork King) - full table
return { common: 15, uncommon: 30, rare: 35, epic: 15, legendary: 5 };
}

function rollRarity(bossLevel: number): ItemRarity {
const weights = getRarityWeights(bossLevel);
const total = Object.values(weights).reduce((a, b) => a + b, 0);
let roll = Math.random() * total;
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
return pool[Math.floor(Math.random() * pool.length)];
}

export function generateLoot(bossLevel: number = 1): LootDrop {
const items: Item[] = [];

// All levels draw from the full item pool.
const pools = ITEM_POOLS;

// Drop chance and item count by boss level
// Boss 8 (Patchwork King) always drops
// Early levels guarantee an item drop so the player always has augments to equip.
// Without stat growth from augments the player is stuck at base stats and
// falls behind enemy defense scaling within 3-4 fights.
const dropChance = bossLevel === 1 ? 1.00  // always drop - first fight tutorial
: bossLevel === 2 ? 1.00
: bossLevel === 3 ? 0.90
: bossLevel === 4 ? 0.90
: bossLevel === 5 ? 0.85
: bossLevel === 6 ? 0.85
: bossLevel === 7 ? 0.85
: 1.00; // boss 8 guaranteed

const shouldDrop = Math.random() < dropChance;
if (!shouldDrop) {
const baseGold = 20 + 15 * bossLevel;
return { items: [], gold: baseGold + Math.floor(Math.random() * baseGold) };
}

// Item count - mostly 1, occasionally 2 from boss 5+, boss 8 gets 2-3
const maxItems = bossLevel >= 8 ? 3
: bossLevel >= 5 ? 2
: 1;
const numItems = bossLevel >= 8
? 2 + (Math.random() < 0.5 ? 1 : 0)
: bossLevel >= 5
? (Math.random() < 0.40 ? 2 : 1)
: 1;

for (let i = 0; i < Math.min(numItems, maxItems); i++) {
const rarity = rollRarity(bossLevel);
const slot = AUGMENTATION_SLOTS[Math.floor(Math.random() * AUGMENTATION_SLOTS.length)];
const item = getRandomItemFromPool(rarity, pools, slot);
if (item) items.push(instancedItem(item));
}

// Stim drop - independent of item drop, from level 2+
// Chance rises with level so consumables feel more available as fights get harder
if (bossLevel >= 2) {
const stimChance = bossLevel <= 3 ? 0.25
: bossLevel <= 6 ? 0.40
: bossLevel <= 9 ? 0.55
: 0.70; // level 10+ (Patchwork King area)
if (Math.random() < stimChance && STIM_POOL.length > 0) {
// Overclock (rare) only from level 5+
const availableStims = bossLevel >= 5
? STIM_POOL
: STIM_POOL.filter(s => s.id !== 'stim_overclock');
const stim = availableStims[Math.floor(Math.random() * availableStims.length)];
if (stim) items.push(instancedItem(stim));
}
}

const baseGold = 20 + 15 * bossLevel;
const gold = baseGold + Math.floor(Math.random() * baseGold);

return { items, gold };
}

// Patchwork King (level 10) drops a guaranteed rare augment + stim
export function generatePatchworkKingLoot(): LootDrop {
const pool = ITEM_POOLS;
const items: Item[] = [];
// Guaranteed rare augment
const slot = AUGMENTATION_SLOTS[Math.floor(Math.random() * AUGMENTATION_SLOTS.length)];
const rareItem = getRandomItemFromPool('rare', pool, slot)
|| getRandomItemFromPool('uncommon', pool, slot);
if (rareItem) items.push(instancedItem(rareItem));
// Bonus roll - 50% chance of epic
if (Math.random() < 0.50) {
const bonusSlot = AUGMENTATION_SLOTS[Math.floor(Math.random() * AUGMENTATION_SLOTS.length)];
const bonus = getRandomItemFromPool('epic', pool, bonusSlot)
|| getRandomItemFromPool('rare', pool, bonusSlot);
if (bonus) items.push(instancedItem(bonus));
}
// Always drop a stim
const stim = STIM_POOL[Math.floor(Math.random() * STIM_POOL.length)];
if (stim) items.push(instancedItem(stim));
const gold = 300 + Math.floor(Math.random() * 100);
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