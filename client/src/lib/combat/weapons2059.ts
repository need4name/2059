import type { Weapon, WeaponManufacturer, WeaponType } from './types';
import rawFrames from '../../content/weapons.json';

// Gun frames: one per maker and action (content/weapons.json, checked by `npm run check:content`).
// A frame is the maker's model line, its name and its description; the rest of a gun rolls when
// the Grey Lane's rack is stocked (guns.ts).
export interface GunFrame { id: string; name: string; description: string; manufacturer: WeaponManufacturer; weaponType: WeaponType }
export const GUN_FRAME_DATA = rawFrames as GunFrame[];

/** A frame as an unrolled gun (price and move are filled in when it's rolled). */
export const frameAsWeapon = (f: GunFrame): Weapon => ({ ...f, tier: 1, price: 0, sellPrice: 0, icon: '', combatAction: { type: 'attack', name: f.name, description: f.description } });
