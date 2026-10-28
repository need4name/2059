import { activeChapter } from './chapters';
import { rollCarried, signatureImplant } from './loot';
import { CombatAction, Character, CombatLog, PlayerClass, ClassStats, getHeatPhase, RangeBand, AugmentationSlot, Item } from './types';
import { ITEMS_2059 } from './items2059';
import enemyContent from '../../content/enemies.json';
import { MIN_PLAYER_HP, actionForItem } from './augments';

import { random } from '../engine/rng';
// ── Range falloff ─────────────────────────────────────────────────────────────
// Returns a damage multiplier based on how far attacker is from optimal range.
// close:  full at distance 1,  70% at 2,   50% at 3+
// medium: 70% at 1,  full at 2,  80% at 3,   55% at 4+
// far:    55% at 1,  65% at 2,  80% at 3,   full at 4+
export function getRangeBand(distance: number, optimal: RangeBand): number {
if (optimal === 'close') {
if (distance <= 1) return 1.00;
if (distance === 2) return 0.70;
return 0.50;
}
if (optimal === 'medium') {
if (distance <= 1) return 0.70;
if (distance === 2) return 1.00;
if (distance === 3) return 0.80;
return 0.55;
}
// far
if (distance <= 1) return 0.55;
if (distance === 2) return 0.65;
if (distance === 3) return 0.80;
return 1.00;
}

const PATCHWORK_AUG_POOL = ITEMS_2059.filter(i => i.type === 'augmentation');

// ── Class definitions ─────────────────────────────────────────────────────────

export const CLASS_DEFINITIONS: Record<PlayerClass, ClassStats> = {
none: {
name: 'Unclassified',
description: 'No operator firmware loaded. The host runs on instinct.',
icon: '🚶',
baseHp: 120,
baseAttack: 14,
baseDefense: 5,
specialAbility: {
name: 'Brute Strike',
description: 'Unaugmented force. 150% damage.',
damage: 1.5,
attackPattern: 'melee',
physicalRatio: 0.85,
},
},
melee: {
name: 'Enforcer',
description: 'Volkov operator firmware. Built for close range.',
icon: '⚔️',
baseHp: 140,
baseAttack: 17,
baseDefense: 8,
specialAbility: {
name: 'Hydraulic Slam',
description: 'Full-frame impact. 200% damage.',
damage: 2.0,
attackPattern: 'melee_long',
physicalRatio: 0.60,
},
},
ranged: {
name: 'Operative',
description: 'Kizuna targeting firmware. Precision at distance.',
icon: '🎯',
baseHp: 110,
baseAttack: 20,
baseDefense: 4,
specialAbility: {
name: 'Precision Shot',
description: 'Optical lock. 180% damage from any range.',
damage: 1.8,
attackPattern: 'ranged',
ignoreRange: true,
physicalRatio: 0.80,
},
},
};

// ── Player actions ────────────────────────────────────────────────────────────
// heatGenerated: positive = heat up, negative = cooling

export const PLAYER_ACTIONS: CombatAction[] = [
{
type: 'attack',
name: 'Strike',
description: 'Close-range attack. Hits all 8 adjacent tiles.',
damage: 10,
heatGenerated: 11,
heatTransfer: +5,
accuracy: 'variable',
physicalRatio: 0.70,
attackPattern: 'melee',
},
{
type: 'brace',
name: 'Brace',
description: 'Cool down and absorb the next hit.',
defenseBoost: 8,
heatGenerated: -25,
heatTransfer: 0,
},
{
type: 'special',
name: 'Special',
description: 'Class ability.',
damage: 20,
heatGenerated: 12,
accuracy: 'precise',
},
];

// ── Damage calculation ────────────────────────────────────────────────────────

// Defence reduces damage by a percentage instead of subtracting from it, so stacking
// defence makes you tougher without ever making an attacker useless.
// At DEFENSE_K defence a hit is halved.
/**
 * Share of the rolled damage that lands, per accuracy tier. Unreliable moves
 * can match a precise hit on a good roll; malfunctioning hardware can't.
 */
export const ACCURACY_RANGE: Record<'precise' | 'variable' | 'unreliable' | 'malfunction', [number, number]> = {
precise: [1, 1], variable: [0.7, 0.95], unreliable: [0.5, 1.0], malfunction: [0.25, 0.6],
};

export const DEFENSE_K = 40;
export function mitigate(base: number, defense: number): number {
return base * DEFENSE_K / (DEFENSE_K + Math.max(0, defense));
}

// Boss growth per threat level. Players gain a lot from implants and upgrade
// trees, so bosses have to keep pace or fights stop mattering by level 5.
export const BOSS_SCALING = { hpBase: 36, hpPerLevel: 17, hpQuadratic: 0.85, atkPerLevel: 4.4, defPerLevel: 2.4, moveDamagePerLevel: 0.19 };

/** A boss move's base damage grows with threat level so late hits still matter. */
export function scaleBossAction(action: CombatAction, level: number): CombatAction {
if (!action.damage) return action;
return { ...action, damage: Math.round(action.damage * (1 + BOSS_SCALING.moveDamagePerLevel * (level - 1))) };
}

export interface DamageResult {
damage: number;
bioDamage: number;
structuralDamage: number;
isCrit: boolean;
isFlank: boolean;
}

export function calculateDamage(
attacker: Character,
defender: Character,
action: CombatAction,
defenseBoost: number = 0,
heatMultiplier: number = 1.0,
flankBonus: number = 0,
tileDistance: number = 1,
isMalfunctioning: boolean = false,
playerHeat: number = 0,
bypassStructuralDefense: boolean = false,
criticalCrit: number = 0.30,
): DamageResult {
// physicalRatio controls the nature of the attack: 1.0 = pure physical, 0.0 = pure structural
const physRatio = action.physicalRatio ?? 0.7;
const strRatio  = 1 - physRatio;

// Base damage per channel: action.damage scaled by ratio, then attacker stat applied
const w = statWeight(attacker);
const basePhys = Math.floor((action.damage || 0) * physRatio + attacker.physicalAttack * w);
const baseStr  = Math.floor((action.damage || 0) * strRatio  + attacker.structuralAttack * w);

// Defense per channel (Brace defenseBoost feeds physical only)
// bypassStructuralDefense (CBN): structural channel ignores defender S-DEF entirely
const totalPhysDef = defender.physicalDefense  + defenseBoost;
const totalStrDef  = (bypassStructuralDefense || action.bypassStructuralDefense) ? 0 : defender.structuralDefense;

let physDamage = Math.max(2, Math.floor(mitigate(basePhys, totalPhysDef)));
let strDamage  = Math.max(0, Math.floor(mitigate(baseStr, totalStrDef)));

// Flanking bonus applies to both channels
const isFlank = flankBonus > 0;
if (isFlank) {
physDamage = Math.floor(physDamage * (1 + flankBonus));
strDamage  = Math.floor(strDamage  * (1 + flankBonus));
}

// Heat multiplier
physDamage = Math.floor(physDamage * heatMultiplier);
strDamage  = Math.floor(strDamage  * heatMultiplier);

// Crit roll - chance derived from player heat phase, amplifies both channels
const CRIT_CHANCES: Record<string, number> = { cool: 0, warm: 0.08, hot: 0.18, critical: criticalCrit };
const critChance = CRIT_CHANCES[getHeatPhase(playerHeat)] ?? 0;
const isCrit = action.type === 'attack' && random() < critChance;
if (isCrit) {
physDamage = Math.floor(physDamage * 1.75);
strDamage  = Math.floor(strDamage  * 1.75);
}

// Range falloff
if (action.rangeOptimal) {
const rangeMult = getRangeBand(tileDistance, action.rangeOptimal);
physDamage = Math.floor(physDamage * rangeMult);
strDamage  = Math.floor(strDamage  * rangeMult);
}

// Accuracy-tier variance (malfunction has its own, harsher range)
// Evasion shifts the variance floor down per point, capped at -0.30
const evasionPenalty = Math.min(0.30, (defender.evasion || 0) * 0.015);
const tier = isMalfunctioning ? 'malfunction' : (action.accuracy ?? 'variable');
let [lo, hi] = ACCURACY_RANGE[tier];
if (tier !== 'precise') { lo = Math.max(0.10, lo - evasionPenalty); }
const variance = lo + random() * (hi - lo);
physDamage = Math.max(3, Math.floor(physDamage * variance)); // floor 3 prevents brick-wall fights
strDamage  = Math.max(0, Math.floor(strDamage  * variance));

const totalDamage = physDamage + strDamage;
return { damage: totalDamage, bioDamage: physDamage, structuralDamage: strDamage, isCrit, isFlank };
}

// The player's flat attack stat counts at 60% so the move you pick still matters
// once you're loaded with implants. Enemy stats are tuned for full weight.
export const PLAYER_STAT_WEIGHT = 0.6;
function statWeight(attacker: Character) { return attacker.id === 'player' ? PLAYER_STAT_WEIGHT : 1; }

// Expected damage range for an action, ignoring crits. Mirrors calculateDamage so the
// numbers on the action buttons match what actually lands.
export function estimateDamage(
attacker: Character,
defender: Character,
action: CombatAction,
opts: { defenseBoost?: number; heatMultiplier?: number; flankBonus?: number; tileDistance?: number; isMalfunctioning?: boolean; bypassStructuralDefense?: boolean } = {},
): { min: number; max: number } {
const physRatio = action.physicalRatio ?? 0.7;
const w = statWeight(attacker);
const basePhys = Math.floor((action.damage || 0) * physRatio + attacker.physicalAttack * w);
const baseStr  = Math.floor((action.damage || 0) * (1 - physRatio) + attacker.structuralAttack * w);
const strDef = (opts.bypassStructuralDefense || action.bypassStructuralDefense) ? 0 : defender.structuralDefense;
let phys = Math.max(2, Math.floor(mitigate(basePhys, defender.physicalDefense + (opts.defenseBoost ?? 0))));
let str  = Math.max(0, Math.floor(mitigate(baseStr, strDef)));
const mult = (1 + (opts.flankBonus ?? 0)) * (opts.heatMultiplier ?? 1)
* (action.rangeOptimal ? getRangeBand(opts.tileDistance ?? 1, action.rangeOptimal) : 1);
phys = Math.floor(phys * mult); str = Math.floor(str * mult);
const tier = opts.isMalfunctioning ? 'malfunction' : (action.accuracy ?? 'variable');
const [lo, hi] = ACCURACY_RANGE[tier];
const roll = (v: number) => Math.floor(phys * v);
return {
min: Math.max(3, roll(lo)) + Math.floor(str * lo),
max: Math.max(3, roll(hi)) + Math.floor(str * hi),
};
}

// ── Player creation ───────────────────────────────────────────────────────────

export interface AugmentationBonuses {
physicalAttack: number;
structuralAttack: number;
physicalDefense: number;
structuralDefense: number;
hp: number;
evasion: number;
structure?: number;               // implant health bar, summed from installed implants
hpCost?: number;                  // health the implants take from you
bypassStructuralDefense: boolean; // CBN: attacks ignore enemy S-DEF
hasKizuna: boolean;               // Kizuna: cold-start accuracy override
// Tree progression bonuses (from augment path choices)
treeAttack: number;
treeDefense: number;
treeHp: number;
}

export function createPlayer(
augmentationBonuses?: AugmentationBonuses,
playerClass: PlayerClass = 'none',
): Character {
const classStats = CLASS_DEFINITIONS[playerClass] || CLASS_DEFINITIONS['none'];
const augPAtk = augmentationBonuses?.physicalAttack  || 0;
const augSAtk = augmentationBonuses?.structuralAttack || 0;
const augPDef = augmentationBonuses?.physicalDefense  || 0;
const augSDef = augmentationBonuses?.structuralDefense || 0;
const augHp   = augmentationBonuses?.hp               || 0;
const augEvasion = augmentationBonuses?.evasion        || 0;
// Tree path progression bonuses -- split 70/30 phys/structural like base stats
const treePAtk = Math.floor((augmentationBonuses?.treeAttack  || 0) * 0.7);
const treeSAtk = Math.ceil ((augmentationBonuses?.treeAttack  || 0) * 0.3);
const treePDef = Math.floor((augmentationBonuses?.treeDefense || 0) * 0.7);
const treeSDef = Math.ceil ((augmentationBonuses?.treeDefense || 0) * 0.3);
const treeHp   = augmentationBonuses?.treeHp || 0;

// Class base: split baseAttack 70/30 phys/structural, baseDefense 70/30 phys/structural
const maxHp = Math.max(MIN_PLAYER_HP, classStats.baseHp + augHp + treeHp - (augmentationBonuses?.hpCost || 0));
const basePAtk = Math.floor(classStats.baseAttack  * 0.7);
const baseSAtk = Math.ceil (classStats.baseAttack  * 0.3);
const basePDef = Math.floor(classStats.baseDefense * 0.7);
const baseSDef = Math.ceil (classStats.baseDefense * 0.3);
// Structure is the implants themselves: no implants, no bar. Upgrades harden it a little.
const augStructure = augmentationBonuses?.structure || 0;
const maxStructuralHp = augStructure > 0 ? augStructure + treePDef + treeSDef : 0;

return {
id: 'player',
name: classStats.name,
maxHp,
currentHp: maxHp,
maxStructuralHp,
currentStructuralHp: maxStructuralHp,
physicalAttack:   basePAtk + augPAtk + treePAtk,
structuralAttack: baseSAtk + augSAtk + treeSAtk,
physicalDefense:  basePDef + augPDef + treePDef,
structuralDefense: baseSDef + augSDef + treeSDef,
evasion: augEvasion,
bypassStructuralDefense: augmentationBonuses?.bypassStructuralDefense ?? false,
hasKizuna: augmentationBonuses?.hasKizuna ?? false,
spriteColor: '#3b82f6',
};
}

// ── Boss definitions ──────────────────────────────────────────────────────────

// Who you fight lives in content/enemies.json: the regular rotation, the
// set-piece specials, and each enemy's stats, dossier line and moves.
interface EnemyData {
color: string; baseAttack: number; baseDefense: number; startingHeat: number;
statSplit: { pAtkR: number; sAtkR: number; pDefR: number; sDefR: number };
dossier: string; moves: CombatAction[];
lines: string[]; lateLines?: string[]; firstSight: string;
traits?: string[]; enrage?: { at: number; gain: string[]; line: string }; signature?: string;
}
const ENEMY_DATA = enemyContent as unknown as {
enemies: Record<string, EnemyData>;
patchworkKing: { color: string; dossier: string; firstSight: string; phases: CombatAction[][]; monologue: string[] };
};
const enemyType = (name: string) => ({ name, ...ENEMY_DATA.enemies[name] });
// Who you fight comes from the active chapter's cast (content/chapters.json)
const cast = () => activeChapter().cast;
const rotationTypes = () => cast().rotation.map(enemyType);

/** What an enemy says when it sees you: horror at a corpse that got up. Later lines once many hosts are lost. */
export function enemyLines(name: string, hostsLost: number): string[] {
const e = ENEMY_DATA.enemies[name];
if (!e) return [];
return hostsLost >= 5 && e.lateLines?.length ? [...e.lines, ...e.lateLines] : e.lines;
}
/** The signal's first impression of a kind of enemy. */
export function firstSightOf(name: string): string | null {
if (name === 'Patchwork King') return ENEMY_DATA.patchworkKing.firstSight;
return ENEMY_DATA.enemies[name]?.firstSight ?? null;
}

/** Short dossier lines shown on the base screen before a fight. */
export const BOSS_DOSSIERS: Record<string, string> = {
...Object.fromEntries(Object.entries(ENEMY_DATA.enemies).map(([n, e]) => [n, e.dossier])),
'Patchwork King': ENEMY_DATA.patchworkKing.dossier,
};

/** Which enemy you face at a threat level. Threat 10 and 20 are bosses. */
// Elites guard the 5th level of each sector; bosses the 10th (the set piece on 10 is built separately)

export type EnemyRole = 'normal' | 'elite' | 'boss' | 'setpiece';
export function enemyRole(level: number, firstRun = false): EnemyRole {
if (firstRun && level === 3) return 'setpiece';
if (level % 10 === 5) return 'elite';
if (level % 10 === 0) return 'boss';
return 'normal';
}

/** Which enemy you face at a level. */
function enemyTypeForLevel(level: number, firstRun = false) {
const role = enemyRole(level, firstRun);
const { elites, bosses, firstFight } = cast();
if (role === 'setpiece') return enemyType(firstFight);
const sector = Math.floor((level - 1) / 10);
if (role === 'elite') return enemyType(elites[sector % elites.length]);
if (role === 'boss') return enemyType(bosses[(sector - 1 + bosses.length) % bosses.length]);
// Regular levels walk the rotation, skipping the elite and boss levels
const idx = level - 1 - Math.floor(level / 5);
const types = rotationTypes();
return types[idx % types.length];
}

/** How much tougher each role is than a regular enemy of the same level. */
export const ROLE_MULT: Record<EnemyRole, { hp: number; atk: number }> = {
normal: { hp: 1, atk: 1 }, elite: { hp: 1.3, atk: 0.95 }, boss: { hp: 1.75, atk: 1.05 }, setpiece: { hp: 2.6, atk: 2.7 },
};
/** Compounding growth per level on top of the steady scaling, so every host meets a wall. */
export const ENEMY_GROWTH = { hp: 1.06, atk: 1.047 };
/** Overall enemy health and attack, the main knobs for fight length and difficulty. */
export const ENEMY_TUNING = { hp: 0.39, atk: 1.34 };
const growth = (level: number) => ({ hp: ENEMY_TUNING.hp * Math.pow(ENEMY_GROWTH.hp, level - 1), atk: ENEMY_TUNING.atk * Math.pow(ENEMY_GROWTH.atk, level - 1) });

/** Which enemy waits at a given threat level (matches createBoss and the level-10 King). */
// The Patchwork King is a wall: a level-10 boss with these multipliers.
export const KING_MULT = { hp: 1.7, atk: 1.45, def: 1.25 };

export function createPatchworkKing(): Character {
// Built from a regular level-10 frame; the King's own multipliers make him the wall
const base = createBoss(10, false, 'Helix Continuity Warden');
const pDef = Math.round(base.physicalDefense * KING_MULT.def), sDef = Math.round(base.structuralDefense * KING_MULT.def);
const hp = Math.round(base.maxHp * KING_MULT.hp), shp = Math.max(8, (pDef + sDef) * 3);
// He wears the Patchwork Crown (epic, or legendary a third of the time) over his frame's own implants
const crown = signatureImplant('sig_patchwork_crown', random() < 0.35 ? 'legendary' : 'epic');
const carried = [...(crown ? [crown] : []), ...(base.carried ?? [])].slice(0, 3);
return { ...base, name: 'Patchwork King', spriteColor: '#fbbf24', carried, implants: carried.map(i => i.name.replace(/^\[[A-Z]+\]\s*/, '').replace(/\s*\([LR]\)/, '').trim()), implantSlots: carried.flatMap(i => (i.slot ? [i.slot] : [])),
maxHp: hp, currentHp: hp, maxStructuralHp: shp, currentStructuralHp: shp,
physicalAttack: Math.round(base.physicalAttack * KING_MULT.atk), structuralAttack: Math.round(base.structuralAttack * KING_MULT.atk),
physicalDefense: pDef, structuralDefense: sDef };
}

/** Chapter two's set piece: a copy of the signal. */
export const ECHO_NAME = 'The Echo';
const RARITY_RANK: Record<string, number> = { legendary: 0, epic: 1, rare: 2, uncommon: 3, common: 4 };

/**
 * The Echo: a copy of the signal wearing the implants its last body wore when the
 * signal left it (up to three, best first), and fighting with their moves. Its
 * own heavy is the strongest of them, held too long. With no remembered implants
 * it wears whatever it found. A wall like the King (KING_MULT).
 */
export function createEcho(lastBody: Item[], level = 10): Character {
const base = createBoss(level, false, ECHO_NAME);
const worn = lastBody.filter(i => i.type === 'augmentation' && i.slot).sort((a, b) => RARITY_RANK[a.rarity] - RARITY_RANK[b.rarity]).slice(0, 3);
const carried = worn.length ? worn.map(i => ({ ...i, id: `echo_${i.id}` })) : (base.carried ?? []);
const attacks = carried.map(i => actionForItem(i)).filter((a): a is CombatAction => !!a && a.type === 'attack' && (a.damage ?? 0) > 0);
const own = ENEMY_DATA.enemies[ECHO_NAME].moves;
const strongest = attacks.reduce<CombatAction | null>((m, a) => (!m || (a.damage ?? 0) > (m.damage ?? 0) ? a : m), null);
const moves: CombatAction[] = strongest ? [
...attacks.map(a => ({ ...a, description: 'One of yours.', isHeavy: false, heatGenerated: 8, heatTransfer: 5 })),
{ ...strongest, name: `${strongest.name}, held too long`, description: 'One of yours, wound up.', damage: Math.round((strongest.damage ?? 10) * 1.6), isHeavy: true, accuracy: 'precise', heatGenerated: 12, heatTransfer: 9 },
...own.filter(m => m.type === 'defend'),
] : own;
const slots = carried.flatMap(i => (i.slot ? [i.slot] : []));
const pDef = Math.round(base.physicalDefense * KING_MULT.def), sDef = Math.round(base.structuralDefense * KING_MULT.def);
const hp = Math.round(base.maxHp * KING_MULT.hp), shp = Math.max(8, (pDef + sDef) * 3);
return { ...base, carried, moves, implantSlots: slots,
implants: carried.map(i => i.name.replace(/^\[[A-Z]+\]\s*/, '').replace(/\s*\([LR]\)/, '').trim()),
traits: slots.map(sl => TRAIT_OF_SLOT[sl]).filter((t, n, all) => t && all.indexOf(t) === n),
maxHp: hp, currentHp: hp, maxStructuralHp: shp, currentStructuralHp: shp,
physicalAttack: Math.round(base.physicalAttack * KING_MULT.atk), structuralAttack: Math.round(base.structuralAttack * KING_MULT.atk),
physicalDefense: pDef, structuralDefense: sDef };
}

export function getBossPreview(level: number, firstRun = false, roomEnemy?: string): { name: string; color: string; hp: number } {
const S = BOSS_SCALING;
const baseHp = Math.floor((S.hpBase + level * S.hpPerLevel + level * level * S.hpQuadratic) * growth(level).hp);
if (level === 10) return cast().setPiece === 'echo'
? { name: ECHO_NAME, color: ENEMY_DATA.enemies[ECHO_NAME]?.color ?? '#7fe9ff', hp: Math.round(baseHp * KING_MULT.hp) }
: { name: 'Patchwork King', color: '#fbbf24', hp: Math.round(baseHp * KING_MULT.hp) };
// A room's named enemy, for regular fights (matches planFoes)
const named = roomEnemy && level % 5 !== 0 && !(firstRun && level === 3) && ENEMY_DATA.enemies[roomEnemy] ? enemyType(roomEnemy) : null;
const t = named ?? enemyTypeForLevel(level, firstRun);
return { name: t.name, color: t.color, hp: Math.round(baseHp * ROLE_MULT[enemyRole(level, firstRun)].hp) };
}

/** How each enemy splits its attack and defence between flesh and structure. */
export const BOSS_STAT_PROFILES: Record<string, EnemyData['statSplit']> =
Object.fromEntries(Object.entries(ENEMY_DATA.enemies).map(([n, e]) => [n, e.statSplit]));

/** Regular enemies a group at this level can be drawn from: this level's type and the two before it. */
export function enemyNamesNear(level: number): string[] {
const types = rotationTypes();
const idx = types.findIndex(t => t.name === enemyTypeForLevel(level).name);
return [0, 1, 2].map(k => types.at((idx - k + types.length) % types.length)!.name);
}

/** How upgraded enemies are at a threat level: what you can see of the compounding growth. */
export const ENEMY_GRADES = [
  { name: 'Raw', from: 1, color: '#9ca3af' },
  { name: 'Grafted', from: 5, color: '#34d399' },
  { name: 'Augmented', from: 10, color: '#60a5fa' },
  { name: 'Chromed', from: 20, color: '#c084fc' },
  { name: 'Ascended', from: 30, color: '#fbbf24' },
] as const;
export const enemyGradeAt = (level: number) => ENEMY_GRADES.reduce((g, x, i) => (level >= x.from ? i : g), 0);
/** What an implant does for an enemy, by the body slot it sits in. */
export const ENEMY_TRAITS: Record<string, { name: string; text: string }> = {
  sighted: { name: 'Sighted', text: 'An optic: it can shoot along clear lines' },
  fast: { name: 'Fast', text: 'A leg graft: it moves an extra tile' },
  armed: { name: 'Armed', text: 'An arm graft: its hits land 10% harder' },
  enduring: { name: 'Enduring', text: 'A lung pack: it heals a little every turn' },
  focused: { name: 'Focused', text: 'A brain graft: it uses heavy attacks from 30 heat' },
  alert: { name: 'Alert', text: 'An ear graft: it can\'t be flanked' },
  filtered: { name: 'Filtered', text: 'A nose filter: hazards don\'t hurt it' },
  braced: { name: 'Braced', text: 'A spine brace: it takes 10% less damage' },
};
export const TRAIT_OF_SLOT: Record<AugmentationSlot, string> = {
  eyes: 'sighted', left_leg: 'fast', right_leg: 'fast', left_arm: 'armed', right_arm: 'armed',
  lungs: 'enduring', brain: 'focused', ears: 'alert', nose: 'filtered', misc: 'braced',
};

/** How many implants an enemy carries at a threat level. */
export const enemyImplantCount = (level: number) => (level <= 5 ? 1 : level <= 10 ? 2 : 3);

export function createBoss(level: number = 1, firstRun = false, typeName?: string): Character {
const bossType = typeName && ENEMY_DATA.enemies[typeName] ? enemyType(typeName) : enemyTypeForLevel(level, firstRun);
const S = BOSS_SCALING;
const bossHp      = Math.floor(S.hpBase + level * S.hpPerLevel + level * level * S.hpQuadratic);
// Scaling: 1.1/lvl for ATK, 0.5/lvl for DEF keeps early fights fair.
// Boss identity (base stats) matters more than raw level scaling through level 8.
const totalAtk    = bossType.baseAttack  + Math.floor((level - 1) * S.atkPerLevel);
const totalDef    = bossType.baseDefense + Math.floor((level - 1) * S.defPerLevel);

const profile = BOSS_STAT_PROFILES[bossType.name] ?? { pAtkR: 0.6, sAtkR: 0.4, pDefR: 0.6, sDefR: 0.4 };

let pAtk = Math.floor(totalAtk * profile.pAtkR);
let sAtk = Math.ceil (totalAtk * profile.sAtkR);
let pDef = Math.floor(totalDef * profile.pDefR);
let sDef = Math.ceil (totalDef * profile.sDefR);

// The implants it carries are real items built from parts: the player strips them
// from the body afterwards. Their stats count for less on higher-quality parts, so
// a lucky epic doesn't make an early enemy unkillable.
const numAugs = enemyImplantCount(level);
const role = typeName ? 'normal' : enemyRole(level, firstRun);
const carried = rollCarried(level, numAugs, role, firstRun, bossType.signature);
const implantNames: string[] = [];
const implantSlots: AugmentationSlot[] = [];
let bonusPAtk = 0, bonusSAtk = 0, bonusPDef = 0, bonusSDef = 0, bonusHp = 0;
const ENEMY_PART_WEIGHT: Record<string, number> = { common: 1, uncommon: 1, rare: 0.6, epic: 0.4, legendary: 0.25 };
for (const aug of carried) {
if (aug.slot) implantSlots.push(aug.slot);
// Short names for the target card: no maker tag, side or condition
implantNames.push(String(aug.name ?? '').replace(/^\[[A-Z]+\]\s*/, '').replace(/\s*-\s*[A-Z]+$/, '').replace(/\s*\([LR]\)/, '').trim());
const k = ENEMY_PART_WEIGHT[aug.rarity] ?? 1;
bonusPAtk += Math.round((aug.attackBonus || 0) * k);
bonusSAtk += Math.floor((aug.attackBonus || 0) * k * profile.sAtkR);
bonusPDef += Math.round((aug.defenseBonus || 0) * k);
bonusSDef += Math.floor((aug.defenseBonus || 0) * k * profile.sDefR);
bonusHp   += Math.max(0, Math.round((aug.hpBonus || 0) * k));
}

pAtk += bonusPAtk; sAtk += bonusSAtk;
pDef += bonusPDef; sDef += bonusSDef;
let finalHp = bossHp + bonusHp;
const structuralHp = Math.max(8, (pDef + sDef) * 3);
// Elites, bosses and the first-life set piece are tougher; everything grows level on level
const g = growth(level);
finalHp = Math.round(finalHp * ROLE_MULT[role].hp * g.hp);
pAtk = Math.round(pAtk * ROLE_MULT[role].atk * g.atk); sAtk = Math.round(sAtk * ROLE_MULT[role].atk * g.atk);

return {
id: 'boss',
name: bossType.name,
maxHp: finalHp,
currentHp: finalHp,
maxStructuralHp: structuralHp,
currentStructuralHp: structuralHp,
physicalAttack:    pAtk,
structuralAttack:  sAtk,
physicalDefense:   pDef,
structuralDefense: sDef,
evasion: 0,
spriteColor: bossType.color,
grade: enemyGradeAt(level),
implants: implantNames.filter(Boolean),
implantSlots,
carried,
traits: [...(bossType.traits ?? []), ...implantSlots.map(sl => TRAIT_OF_SLOT[sl])].filter((t, n, all) => t && all.indexOf(t) === n),
...(bossType.enrage ? { enrage: bossType.enrage } : {}),
};
}

// Boss attack rosters.
// isHeavy: true -- the enemy tell fires the turn BEFORE this attack lands.
// heatTransfer: heat applied to the TARGET when this attack hits.
// Keep one isHeavy attack per boss.
export const BOSS_ATTACKS: Record<string, CombatAction[]> =
Object.fromEntries(Object.entries(ENEMY_DATA.enemies).map(([n, e]) => [n, e.moves]));

// Export for store consumption
export function getBossStartingHeat(bossName: string): number {
return ENEMY_DATA.enemies[bossName]?.startingHeat ?? 50;
}

export function getBossAction(bossName: string): CombatAction {
const actions = BOSS_ATTACKS[bossName];
if (!actions || actions.length === 0) {
return { type: 'attack', name: 'Strike', description: '', damage: 10, physicalRatio: 0.70 };
}
return actions[Math.floor(random() * actions.length)];
}

export function createCombatLog(message: string, type: CombatLog['type'] = 'info'): CombatLog {
return {
id: Math.random().toString(36),
message,
timestamp: Date.now(),
type,
};
}

export const PATCHWORK_KING_PHASES: CombatAction[][] = ENEMY_DATA.patchworkKing.phases;

/** Every attack an enemy can use (the King's scripted phases included). */
export function getBossRoster(bossName: string): CombatAction[] {
if (bossName === 'Patchwork King') return PATCHWORK_KING_PHASES.flat();
return BOSS_ATTACKS[bossName] ?? [];
}

export function getPatchworkKingAction(turnCount: number): CombatAction {
  const phaseIndex = turnCount <= 3 ? 0 : turnCount <= 6 ? 1 : 2;
  const phase = PATCHWORK_KING_PHASES[phaseIndex];
  return phase[Math.floor(random() * phase.length)];
}

export const PATCHWORK_KING_MONOLOGUE: string[] = ENEMY_DATA.patchworkKing.monologue;