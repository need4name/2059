import type { Item, ItemRarity, Weapon } from './types';
import { GUN_FRAMES, rollGun } from './guns';
import { ITEMS_2059 } from './items2059';
import { instancedItem } from './loot';

import { random } from '../engine/rng';
import { ladderDepth } from './chapters';
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

/** Calling a beaten boss back costs about this many fights' worth of credits at its threat. */
export const RECALL_FIGHTS = 3;
/** Boss implants sell for this share of what calling their boss back costs: farming pays, but no better than fighting. */
export const BOSS_SELL_SHARE = 0.9;
/** Credits to call a beaten boss back (a fight at its threat pays 10 + 8 per threat, plus up to the same again). */
export const recallCost = (threat: number) => Math.round(RECALL_FIGHTS * 1.5 * (10 + 8 * threat));

export function sellPrice(item: Item): number {
  const base = Math.max(5, Math.round(buyPrice(item) * SELL_RATE));
  // A boss's own implant: worth a little less than calling the boss back
  return item.bossThreat ? Math.max(base, Math.round(recallCost(item.bossThreat) * BOSS_SELL_SHARE)) : base;
}

// Market stock: rarer goods appear as the threat level climbs
function stockRarityWeights(level: number): Record<ItemRarity, number> {
  // On the loot ladder (`ladderDepth`), a step ahead of what bodies drop: you pay for it
  const d = ladderDepth(level);
  if (d <= 4) return { common: 85, uncommon: 15, rare: 0, epic: 0, legendary: 0 };
  if (d <= 10) return { common: 70, uncommon: 27, rare: 3, epic: 0, legendary: 0 };
  if (d <= 20) return { common: 50, uncommon: 38, rare: 11, epic: 1, legendary: 0 };
  if (d <= 40) return { common: 30, uncommon: 40, rare: 23, epic: 6, legendary: 1 };
  if (d <= 70) return { common: 15, uncommon: 33, rare: 33, epic: 15, legendary: 4 };
  return { common: 12, uncommon: 33, rare: 33, epic: 17, legendary: 5 };
}

function rollRarity(level: number): ItemRarity {
  const w = stockRarityWeights(level);
  let roll = random() * Object.values(w).reduce((a, b) => a + b, 0);
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
    const pick = pool[Math.floor(random() * pool.length)];
    usedTemplates.add(pick.id);
    stock.push(instancedItem(pick));
  }
  // From chapter two's last third (ladder depth 40) the stall sometimes has a legendary, so a missing piece can be bought instead of farmed
  if (ladderDepth(level) >= 40 && random() < Math.min(0.6, 0.25 + 0.03 * (ladderDepth(level) - 40))) {
    const legs = augments.filter(i => i.rarity === 'legendary' && !usedTemplates.has(i.id));
    if (legs.length) stock.unshift(instancedItem(legs[Math.floor(random() * legs.length)]));
  }
  for (let i = 0; i < 3 && stims.length; i++) stock.push(instancedItem(stims[Math.floor(random() * stims.length)]));
  return stock;
}

/** The Grey Lane's gun rack: three guns rolled from the frames at the stall's grades (it restocks only for a new host or a server rest). */
export function generateGunRack(level: number): Weapon[] {
  const out: Weapon[] = [];
  for (let k = 0; k < 3; k++) out.push(rollGun(GUN_FRAMES[Math.floor(random() * GUN_FRAMES.length)], rollRarity(level)));
  return out;
}

/** Credits for scrapping the implants left on the bodies after a fight: a quarter of their sell price. */
export const scrapValue = (items: Item[]) => items.reduce((n, i) => n + Math.max(2, Math.round(sellPrice(i) * 0.25)), 0);
