import type { Item, ItemRarity } from './types';
import { ITEMS_2059 } from './items2059';
import { instancedItem } from './loot';

// What things cost at the Grey Lane market. Sellers get a fraction back.
const RARITY_PRICE: Record<ItemRarity, number> = {
  common: 45, uncommon: 95, rare: 190, epic: 360, legendary: 640,
};

const CONDITION_MULT: Record<string, number> = { pristine: 1, worn: 0.75, degraded: 0.5, corroded: 0.3 };

const STIM_PRICE: Record<string, number> = {
  bio_stim: 45, structural_patch: 40, heat_flush: 35, overclock: 90,
};

export const SELL_RATE = 0.4;

export function buyPrice(item: Item): number {
  if (item.type === 'consumable') return STIM_PRICE[item.consumableEffect ?? ''] ?? 40;
  return Math.round(RARITY_PRICE[item.rarity] * (CONDITION_MULT[item.condition ?? 'pristine'] ?? 1));
}

export function sellPrice(item: Item): number {
  return Math.max(5, Math.round(buyPrice(item) * SELL_RATE));
}

// Market stock: rarer goods appear as the threat level climbs
function stockRarityWeights(level: number): Record<ItemRarity, number> {
  if (level <= 2) return { common: 70, uncommon: 28, rare: 2, epic: 0, legendary: 0 };
  if (level <= 5) return { common: 45, uncommon: 40, rare: 13, epic: 2, legendary: 0 };
  if (level <= 9) return { common: 25, uncommon: 40, rare: 25, epic: 9, legendary: 1 };
  return { common: 12, uncommon: 33, rare: 33, epic: 17, legendary: 5 };
}

function rollRarity(level: number): ItemRarity {
  const w = stockRarityWeights(level);
  let roll = Math.random() * Object.values(w).reduce((a, b) => a + b, 0);
  for (const [r, n] of Object.entries(w)) { roll -= n; if (roll <= 0) return r as ItemRarity; }
  return 'common';
}

/** A fresh market stall: implants across slots plus a few stims. */
export function generateMarketStock(level: number): Item[] {
  const augments = ITEMS_2059.filter(i => i.type === 'augmentation');
  const stims = ITEMS_2059.filter(i => i.type === 'consumable' && i.consumableEffect && (level >= 5 || i.consumableEffect !== 'overclock'));
  const stock: Item[] = [];
  const usedTemplates = new Set<string>();
  for (let tries = 0; stock.length < 7 && tries < 60; tries++) {
    const rarity = rollRarity(level);
    const pool = augments.filter(i => i.rarity === rarity && !usedTemplates.has(i.id));
    if (!pool.length) continue;
    const pick = pool[Math.floor(Math.random() * pool.length)];
    usedTemplates.add(pick.id);
    stock.push(instancedItem(pick));
  }
  for (let i = 0; i < 3 && stims.length; i++) stock.push(instancedItem(stims[Math.floor(Math.random() * stims.length)]));
  return stock;
}
