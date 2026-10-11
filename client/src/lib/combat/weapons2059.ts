import { Weapon, WeaponType, AttackPatternType } from './types';
import rawWeapons from '../../content/weapons.json';

// ── WEAPONS 2059 ──────────────────────────────────────────────────────────────
// 4 manufacturers x 3 weapon types x 2 tiers = 24 weapons
//
// Volkov:  precision violence. High P-ATK + S-ATK. Structural-shredding at higher tiers.
// Tianxia: workforce-grade. Cheap, UNRELIABLE, high raw damage to compensate.
// CBN:     bio-targeted. physicalRatio 1.0, bypassStructuralDefense. Pure meat damage.
// IOA:     dock suppression. Structural-heavy physicalRatio. Shreds cybernetics.
//
// Tier 2 ids = tier 1 id + '_mk2'
// Sell price = ~40% of buy price (rounded to nearest 10)

// Weapon data lives in content/weapons.json, checked by `npm run check:content`.
export const BASE_WEAPONS = rawWeapons as unknown as Weapon[];

// Each weapon type fires its own shape: sidearms and revolvers reach across
// the arena, shotgun-class frames spray a cone in front of you.
const WEAPON_PATTERN: Record<WeaponType, AttackPatternType> = { pistol: 'ranged', revolver: 'ranged', shotgun: 'cone' };

// Shotguns are hard to line up (a short cone), so they hit steadier and run cooler than listed.
export const WEAPONS_2059: Weapon[] = BASE_WEAPONS.map(w => ({
...w,
combatAction: {
...w.combatAction,
attackPattern: w.combatAction.attackPattern ?? WEAPON_PATTERN[w.weaponType],
...(w.weaponType === 'shotgun' ? { accuracy: 'variable' as const, heatGenerated: Math.round((w.combatAction.heatGenerated ?? 20) * 0.68) } : {}),
},
}));

export const TIER1_WEAPONS = WEAPONS_2059.filter(w => w.tier === 1);

// Helper: get tier-2 upgrade for a given tier-1 weapon id
export function getUpgrade(tier1Id: string): Weapon | undefined {
return WEAPONS_2059.find(w => w.upgradeOfId === tier1Id);
}