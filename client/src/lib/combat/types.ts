export type CombatPhase = 'menu' | 'player_turn' | 'enemy_turn' | 'victory' | 'defeat' | 'shop';

export interface Character {
id: string;
name: string;
maxHp: number;
currentHp: number;
maxStructuralHp: number;
currentStructuralHp: number;
physicalAttack: number;
structuralAttack: number;
physicalDefense: number;
structuralDefense: number;
evasion: number;
moveRange?: number;
bypassStructuralDefense?: boolean;
hasKizuna?: boolean;
spriteColor: string;
element?: string;
weakness?: string;
/** Enemies: how upgraded they are (Raw to Ascended), and the implants they carry. */
grade?: number;
implants?: string[];
/** Body slots of the implants it carries, and the traits they give it (see ENEMY_TRAITS). */
implantSlots?: AugmentationSlot[];
traits?: string[];
/** Bosses: at this share of health they gain traits and say something (once). */
enrage?: { at: number; gain: string[]; line: string };
}

export type AccuracyTier = 'precise' | 'variable' | 'unreliable';
export type RangeBand = 'close' | 'medium' | 'far';

export interface CombatAction {
type: 'attack' | 'defend' | 'brace' | 'special';
name: string;
description: string;
damage?: number;
healing?: number;
defenseBoost?: number;
isInnate?: boolean;
heatGenerated?: number;   // self-heat delta (positive = heat up, negative = cool down)
heatTransfer?: number;    // heat applied to TARGET (positive = heats them, negative = cools them)
isHeavy?: boolean;        // boss telegraphs this one turn before using it
accuracy?: AccuracyTier;  // see ACCURACY_RANGE in actions.ts
rangeOptimal?: RangeBand; // which range band deals full damage
physicalRatio?: number;   // 0.0-1.0: proportion of attack that is physical vs structural. defaults 0.7
bypassStructuralDefense?: boolean; // CBN weapons: structural channel ignores enemy S-DEF
hasKizuna?: boolean;              // Tianxia cold-start: first attack at cool heat = precise
attackPattern?: AttackPatternType;
ignoreRange?: boolean;
/** Arm moves only reach their own side of the body (left arm: left, right arm: right; straight up and down are both). */
side?: 'left' | 'right';
/** Side effects from implant mods and heads (see docs/DESIGN.md, Implant parts). */
effects?: ActionEffects;
}

export interface ActionEffects {
  /** Push every enemy hit a tile away from you. */
  knock?: boolean;
  /** Drag the enemy hit toward you until something is in the way. */
  pull?: boolean;
  /** Bleeding: a share of max health at the start of its next 2 turns. */
  bleed?: boolean;
  /** Chance (0-1) to stun each enemy hit. */
  stun?: number;
  /** Heal this share of the damage dealt. */
  drain?: number;
  /** Knockback collisions hit twice as hard. */
  crush?: boolean;
  /** Heat vented after the hit. */
  cool?: number;
  /** Step a tile back from the enemy after hitting (no parting blow). */
  retreat?: boolean;
  /** You dash to the far end of the lane. */
  dash?: boolean;
  /** Cheap parts: only the nearest enemy in the shape is hit. */
  focus?: boolean;
  /** Shots go through cover. */
  ignoreCover?: boolean;
}

export type WeaponType = 'pistol' | 'revolver' | 'shotgun';
export type WeaponManufacturer = 'volkov' | 'tianxia' | 'cbn' | 'ioa';

export interface Weapon {
id: string;
name: string;
description: string;
manufacturer: WeaponManufacturer;
weaponType: WeaponType;
tier: 1 | 2;
upgradeOfId?: string;   // tier-1 id this upgrades from
price: number;          // buy price
sellPrice: number;      // sell back price (~40% of buy)
upgradePrice?: number;  // cost to upgrade to tier 2
icon: string;
combatAction: CombatAction;
}

export type AugmentationSlot =
| 'brain' | 'ears' | 'eyes' | 'nose' | 'lungs'
| 'left_arm' | 'right_arm' | 'left_leg' | 'right_leg' | 'misc';

export const AUGMENTATION_SLOTS: AugmentationSlot[] = [
'brain', 'ears', 'eyes', 'nose', 'lungs',
'left_arm', 'right_arm', 'left_leg', 'right_leg', 'misc',
];

// Active implants give you something to do in a fight (they add a combat action).
// Passive implants only change your stats or add an always-on effect.
export const ACTIVE_SLOTS: AugmentationSlot[] = ['left_arm', 'right_arm', 'left_leg', 'right_leg', 'eyes'];
export const PASSIVE_SLOTS: AugmentationSlot[] = ['brain', 'ears', 'nose', 'lungs', 'misc'];
export type AugmentKind = 'active' | 'passive';
export function augmentKind(slot: AugmentationSlot | undefined): AugmentKind {
  return slot && ACTIVE_SLOTS.includes(slot) ? 'active' : 'passive';
}

export const AUGMENTATION_SLOT_NAMES: Record<AugmentationSlot, string> = {
brain: 'Brain', ears: 'Ears', eyes: 'Eyes', nose: 'Nose', lungs: 'Lungs',
left_arm: 'Left Arm', right_arm: 'Right Arm',
left_leg: 'Left Leg', right_leg: 'Right Leg', misc: 'Spine',
};

export const AUGMENTATION_SLOT_ICONS: Record<AugmentationSlot, string> = {
brain: '🧠', ears: '👂', eyes: '👁️', nose: '👃', lungs: '🫁',
left_arm: '💪', right_arm: '🦾', left_leg: '🦵', right_leg: '🦿', misc: '🦴',
};

export type ItemRarity = 'common' | 'uncommon' | 'rare' | 'epic' | 'legendary';

export type ItemCondition = 'pristine' | 'worn' | 'degraded' | 'corroded';

export interface Item {
id: string;
templateId?: string;
name: string;
rarity: ItemRarity;
type: 'augmentation' | 'consumable';
slot?: AugmentationSlot;
attackBonus?: number;
defenseBonus?: number;
hpBonus?: number;
evasionBonus?: number;
structuralAttackBonus?: number;
structuralDefenseBonus?: number;
passiveEffect?: 'kizuna_coldstart' | 'bypass_sdef'; // manufacturer passive tags
// STIM / consumable effect type - determines what happens when used in combat
consumableEffect?: 'bio_stim' | 'structural_patch' | 'heat_flush' | 'overclock';
condition?: ItemCondition;
icon: string;
description?: string;
attackPattern?: AttackPatternType;
/** Active implants: the head (attack shape) and mods (side effects) this one was built with. */
parts?: { head: string; mods: string[] };
}

export interface LootDrop {
items: Item[];
gold: number;
}

export interface CombatLog {
id: string;
message: string;
timestamp: number;
type: 'info' | 'damage' | 'heal' | 'critical' | 'malfunction';
}

export type PlayerClass = 'none' | 'melee' | 'ranged';

export interface ClassStats {
name: string;
description: string;
icon: string;
baseHp: number;
baseAttack: number;
baseDefense: number;
specialAbility: {
name: string;
description: string;
damage?: number;
healing?: number;
defenseBoost?: number;
attackPattern?: AttackPatternType;
ignoreRange?: boolean;
physicalRatio?: number;
};
}

export interface TilePosition { row: number; col: number; }

export type TileType = 'empty' | 'obstacle' | 'hazard' | 'void';

export interface TileData {
type: TileType;
hazardDamage?: number;
icon?: string;
name?: string;
/** What the board draws for this tile (a chapter tileset art name). */
art?: string;
}

export interface CombatGrid {
rows: number;
cols: number;
arenaShape?: 'open' | 'corridor' | 'l_shape' | 'cross' | 'drawn';
/** Drawn arenas: where enemies start, lead first. */
spawns?: TilePosition[];
playerPosition: TilePosition;
bossPosition: TilePosition;
/** Other units standing on the field (blocks movement and paths). */
occupied?: TilePosition[];
tiles: TileData[][];
}

export type AttackPatternType = 'melee' | 'melee_long' | 'diagonal_cross' | 'cone' | 'aoe' | 'ranged' | 'sweep_arc' | 'lunge' | 'knockback' | 'charge' | 'ring' | 'beam'
  | 'bolt' | 'pierce' | 'longshot' | 'lob' | 'burst' | 'grapple';

export interface AttackPattern {
type: AttackPatternType;
name: string;
range: number;
getTargetTiles: (from: TilePosition, to: TilePosition, grid: CombatGrid) => TilePosition[];
}

// ── Heat system ───────────────────────────────────────────────────────────────

export type HeatPhase = 'cool' | 'warm' | 'hot' | 'critical';

export function getHeatPhase(heat: number): HeatPhase {
if (heat <= 40) return 'cool';
if (heat <= 70) return 'warm';
if (heat <= 90) return 'hot';
return 'critical';
}

/** Damage multipliers applied at each heat level */
export function getHeatMultipliers(heat: number): { dealt: number; received: number } {
const phase = getHeatPhase(heat);
switch (phase) {
case 'cool':     return { dealt: 1.00, received: 1.00 };
case 'warm':     return { dealt: 1.10, received: 1.10 };
case 'hot':      return { dealt: 1.25, received: 1.25 };
case 'critical': return { dealt: 1.50, received: 1.75 };
}
}

// ── Flanking ──────────────────────────────────────────────────────────────────

/**
 * The enemy starts on the top edge facing down the arena.
 * Getting above it (behind) or level with it (side) gives a bonus.
 */
export function getFlankBonus(
  playerPos: TilePosition,
  bossPos: TilePosition
): number {
  const rowDiff = playerPos.row - bossPos.row;   // negative = player is above (behind)
  const colAbs = Math.abs(playerPos.col - bossPos.col);
  if (rowDiff < 0) return 0.30;                         // behind - 30% bonus
  if (colAbs > 0 && colAbs >= Math.abs(rowDiff)) return 0.15; // side - 15% bonus
  return 0;                                             // frontal - no bonus
}
