// Guns: bought in the Grey Lane, built from parts like implants. A gun isn't an
// implant, so it never heats you; instead it holds a few rounds, and any turn you
// don't attack reloads it. Its frame (maker and model line) comes from
// content/weapons.json; the rest rolls when the rack is stocked.
//   Action:   pistol (a bolt, stops at the first body), revolver (pierces a line), shotgun (a cone)
//   Barrel:   how it aims (the lenses: clear always lands in full, cracked can roll low but hits harder)
//   Round:    the damage type: slug (physical), flechette (bleeds), thermal (special, heats them), EMP (special, can stun)
//   Mods:     the maker's extra (Volkov knockback, Tianxia vents your heat, CBN bleed, IOA stun) and an extended magazine
// Rarity scales the damage like an implant's.

import type { ActionEffects, AttackPatternType, CombatAction, Item, ItemRarity, Weapon, WeaponType } from './types';
import { LENSES, modelOf } from './augments';
import { random } from '../engine/rng';
import { BASE_WEAPONS } from './weapons2059';
import type { UpgradeEffect } from '../engine/upgrades';

export type GunRound = 'slug' | 'flechette' | 'thermal' | 'emp';
export const ROUNDS: Record<GunRound, { label: string; phys: number; transfer?: number; fx?: ActionEffects }> = {
  slug:      { label: 'Slug rounds',      phys: 0.9 },
  flechette: { label: 'Flechette rounds', phys: 0.6, fx: { bleed: true } },
  thermal:   { label: 'Thermal rounds',   phys: 0.2, transfer: 4 },
  emp:       { label: 'EMP rounds',       phys: 0.1, fx: { stun: 0.15 } },
};
/** Each action's shape, rounds and punch (× an implant attack of the same rarity). */
export const ACTIONS: Record<WeaponType, { pattern: AttackPatternType; mag: number; mult: number; noun: string; letter: string }> = {
  pistol:   { pattern: 'bolt',   mag: 3, mult: 1.6, noun: 'Pistol',   letter: 'P' },
  revolver: { pattern: 'pierce', mag: 2, mult: 1.85, noun: 'Revolver', letter: 'R' },
  shotgun:  { pattern: 'cone',   mag: 2, mult: 1.5, noun: 'Shotgun',  letter: 'S' },
};
/** An implant attack's base damage, before rarity: what a gun's punch is measured against. */
export const GUN_BASE = 12;
const RARITY_DAMAGE: Record<ItemRarity, number> = { common: 1, uncommon: 1.2, rare: 1.45, epic: 1.75, legendary: 2.1 };
const RARITY_PRICE: Record<ItemRarity, number> = { common: 160, uncommon: 260, rare: 420, epic: 650, legendary: 950 };
/** Each maker's extra, and what its parts lean toward. */
const MAKER: Record<string, { mod: ActionEffects; barrel: string; rounds: GunRound[] }> = {
  volkov:  { mod: { knock: true }, barrel: 'clear',   rounds: ['slug'] },
  tianxia: { mod: { cool: 6 },     barrel: 'cracked', rounds: ['slug', 'flechette'] },
  cbn:     { mod: { bleed: true }, barrel: 'stock',   rounds: ['flechette'] },
  ioa:     { mod: { stun: 0.15 },  barrel: 'stock',   rounds: ['emp', 'thermal'] },
};
const pick = <T,>(xs: T[]): T => xs[Math.floor(random() * xs.length)];

/** The gun frames the rack can stock: one per maker and action (content/weapons.json, first tier). */
export const GUN_FRAMES = BASE_WEAPONS.filter(w => w.tier === 1);

/** Roll a gun from a frame at a rarity (seeded, so a run's rack replays). */
export function rollGun(frame: Weapon, rarity: ItemRarity): Weapon {
  const lean = MAKER[frame.manufacturer];
  const barrel = random() < 0.6 ? lean.barrel : pick(Object.keys(LENSES));
  const round = random() < 0.6 ? pick(lean.rounds) : pick(Object.keys(ROUNDS) as GunRound[]);
  const mods: string[] = [];
  if (rarity !== 'common' && random() < (rarity === 'uncommon' ? 0.5 : 0.85)) mods.push('maker');
  if ((rarity === 'epic' || rarity === 'legendary') && random() < 0.5) mods.push('extmag');
  const price = RARITY_PRICE[rarity];
  const w: Weapon = {
    ...frame, id: `${frame.id}-${Math.floor(random() * 1e9).toString(36)}`, rarity, tier: 1, upgradeOfId: undefined, upgradePrice: undefined,
    price, sellPrice: Math.round(price * 0.4), treeSeed: Math.floor(random() * 4294967296), gunParts: { barrel, round, mods },
  } as Weapon;
  return { ...w, combatAction: gunAction(w) };
}

/** A gun seen as an item: for its model number and its upgrade tree (it grows the attack kinds, none of a body slot's). */
export function gunItem(w: Weapon): Item {
  return {
    id: w.id, name: w.name, rarity: w.rarity ?? 'common', type: 'augmentation', icon: '', treeSeed: w.treeSeed, isGun: true,
    parts: { head: w.weaponType, mods: w.gunParts?.mods.includes('maker') ? Object.keys(MAKER[w.manufacturer].mod).map(k => (k === 'knock' ? 'knock' : k === 'cool' ? 'cool' : k)) : [], lens: w.gunParts?.barrel, coupling: w.gunParts?.round },
  };
}
/** A gun's model number: its maker's line with the action's letter ("VK-P3", "IO-S22"). */
export function gunModel(w: Weapon): string {
  return modelOf(gunItem(w)).replace('-', `-${ACTIONS[w.weaponType].letter}`);
}
/** A gun's name as shown: its model number and its frame's name ("VK-P3 Operator Sidearm"). */
export const gunName = (w: Weapon) => `${gunModel(w)} ${w.name.replace(/^\[[A-Z]+\]\s*/, '').replace(/\s+MK-\d+$/, '')}`;
/** How many rounds a gun holds (with an extended magazine, and any from its tree). */
export const magazineOf = (w: Weapon, up: UpgradeEffect = {}) => ACTIONS[w.weaponType].mag + (w.gunParts?.mods.includes('extmag') ? 1 : 0) + (up.ammo ?? 0);

/** The attack a gun gives, with its upgrade tree's effect on top. It never heats you. */
export function gunAction(w: Weapon, up: UpgradeEffect = {}): CombatAction {
  const act = ACTIONS[w.weaponType], gp = w.gunParts ?? { barrel: 'stock', round: 'slug', mods: [] };
  const lens = LENSES[gp.barrel] ?? LENSES.stock;
  const round = ROUNDS[gp.round as GunRound] ?? ROUNDS.slug;
  let accuracy = lens.accuracy;
  if (up.steady) accuracy = accuracy === 'unreliable' ? 'variable' : 'precise';
  if (up.precise) accuracy = 'precise';
  const effects: ActionEffects = { ...(round.fx ?? {}), ...(gp.mods.includes('maker') ? MAKER[w.manufacturer].mod : {}), ...(up.fx ?? {}) };
  return {
    type: 'attack', name: `${gunModel(w)} ${act.noun}`, description: w.description,
    damage: Math.round(GUN_BASE * act.mult * RARITY_DAMAGE[w.rarity ?? 'common'] * lens.mult * (1 + (up.dmg ?? 0))),
    accuracy, attackPattern: act.pattern,
    physicalRatio: Math.max(0, Math.min(1, Math.round((round.phys + (up.phys ?? 0)) * 100) / 100)),
    heatGenerated: 0, heatTransfer: (round.transfer ?? 0) + (up.transfer ?? 0),
    ...(Object.keys(effects).length ? { effects } : {}),
    gun: { mag: magazineOf(w, up) },
  };
}
