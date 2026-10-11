import { CombatAction, Character, CombatLog, PlayerClass, ClassStats, getHeatPhase, RangeBand } from './types';
import { ITEMS_2059 } from './items2059';
import { MIN_PLAYER_HP } from './augments';

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
description: 'No combat profile loaded. Operating on instinct.',
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
description: 'Salvaged hydraulic combat frame. Built for close range.',
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
description: 'Repurposed targeting optics. Precision at distance.',
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
const CRIT_CHANCES: Record<string, number> = { cool: 0, warm: 0.08, hot: 0.18, critical: 0.30 };
const critChance = CRIT_CHANCES[getHeatPhase(playerHeat)] ?? 0;
const isCrit = action.type === 'attack' && Math.random() < critChance;
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

// Accuracy-tier variance (malfunction overrides to unreliable)
// Evasion shifts the variance floor down per point, capped at -0.30
const evasionPenalty = Math.min(0.30, (defender.evasion || 0) * 0.015);
const tier = isMalfunctioning ? 'unreliable' : (action.accuracy ?? 'variable');
let lo: number, hi: number;
if (tier === 'precise')         { lo = 1.00; hi = 1.00; }
else if (tier === 'unreliable') { lo = 0.25; hi = 0.70; }
else                            { lo = 0.60; hi = 0.85; }
if (tier !== 'precise') { lo = Math.max(0.10, lo - evasionPenalty); }
const variance = lo + Math.random() * (hi - lo);
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
const tier = opts.isMalfunctioning ? 'unreliable' : (action.accuracy ?? 'variable');
const [lo, hi] = tier === 'precise' ? [1, 1] : tier === 'unreliable' ? [0.25, 0.70] : [0.60, 0.85];
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

// Who you fight. Early threats are the pirate federations and cartel crews of the
// plastic archipelago; corporate security takes over as you draw attention.
const BOSS_TYPES = [
{ name: 'Limbic Cartel Scavenger',  color: '#fb7185', baseAttack: 8,  baseDefense: 2, startingHeat: 45 },
{ name: 'SALV Boarder',             color: '#f59e0b', baseAttack: 7,  baseDefense: 3, startingHeat: 40 },
{ name: 'Pump-Fleet Cadre',         color: '#a3e635', baseAttack: 8,  baseDefense: 6, startingHeat: 40 },
{ name: 'Ghost-MIL Infiltrator',    color: '#c084fc', baseAttack: 12, baseDefense: 1, startingHeat: 25 },
{ name: 'Non-Continuous Raider',    color: '#f87171', baseAttack: 11, baseDefense: 2, startingHeat: 60 },
{ name: 'CBN Extraction Surgeon',   color: '#22c55e', baseAttack: 6,  baseDefense: 4, startingHeat: 45 },
{ name: 'IOA Interdiction Officer', color: '#fb923c', baseAttack: 9,  baseDefense: 6, startingHeat: 35 },
{ name: 'Tianxia Compliance Unit',  color: '#06b6d4', baseAttack: 8,  baseDefense: 7, startingHeat: 35 },
{ name: 'Helix Continuity Warden',  color: '#e2e8f0', baseAttack: 8,  baseDefense: 8, startingHeat: 40 },
{ name: 'Volkov Operator',          color: '#ef4444', baseAttack: 13, baseDefense: 5, startingHeat: 50 },
];

// Set-piece enemies outside the regular rotation
const SPECIAL_TYPES = [
{ name: 'Cartel Enforcer',          color: '#e11d48', baseAttack: 20, baseDefense: 6, startingHeat: 70 },
{ name: 'Unregistered Operator',    color: '#f8fafc', baseAttack: 16, baseDefense: 8, startingHeat: 20 },
];

// Short dossier lines shown on the base screen before a fight
export const BOSS_DOSSIERS: Record<string, string> = {
'Limbic Cartel Scavenger':  'Raft scavenger with cheap SCAR grafts and a PLM calm in his eyes. Wants the implants in your new body.',
'SALV Boarder':             'Bay of Bengal boarding crew, fused to crane limbs and spinal clamps. Sweeps wide, then hooks you in.',
'Pump-Fleet Cadre':         'Raider from the Matriarchal Pump-Fleets. Internal pumps keep her standing long after she should fall.',
'Ghost-MIL Infiltrator':    'Interface ports scavenged from robotics control rigs. Jams your sensors from range. Fragile up close.',
'Non-Continuous Raider':    'Scarred, half-starved and fast. Raids for medical supplies and identity tokens, and hits hard.',
'CBN Extraction Surgeon':   'Cartel Biotech Networks field surgeon with a BASM kit. Sedates first, harvests after.',
'IOA Interdiction Officer': 'Indian Ocean Authority maritime security. Denies transit by force, from range, by the book.',
'Tianxia Compliance Unit':  'Mass-produced labour frame repurposed for enforcement. Cools your systems to slow you down.',
'Helix Continuity Warden':  'Contracted security for a Helix platform. Heavy structural housing; Helix makes no weapons, so the Warden brought his own.',
'Volkov Operator':          'Full operator limb suite, charged on Helix power it resents. Precise, brutal, and very hard to put down.',
'Patchwork King':           'The pirate king of the plastic island. Once a corporate operator, discarded by the people who built him. Three phases.',
'Cartel Enforcer':          "The Limbic Cartel's collector. Far heavier than anything this body can handle.",
'Unregistered Operator':    "A Kizuna operator who doesn't exist on any MIL register. A ghost story with a body count.",
};

/** Which enemy you face at a threat level. Threat 10 and 20 are bosses. */
function enemyTypeForLevel(level: number, firstRun = false) {
if (firstRun && level === 3) return SPECIAL_TYPES[0];
if (level === 20) return SPECIAL_TYPES[1];
const idx = level < 10 ? level - 1 : level < 20 ? level - 2 : level - 3;
return BOSS_TYPES[idx % BOSS_TYPES.length];
}

/** Which enemy waits at a given threat level (matches createBoss and the level-10 King). */
// The Patchwork King is a wall: a level-10 boss with these multipliers.
export const KING_MULT = { hp: 1.7, atk: 1.45, def: 1.25 };
// The first-life Cartel Enforcer: built so a fresh body can't win
export const ENFORCER_MULT = { hp: 2.4, atk: 2.2 };

export function createPatchworkKing(): Character {
const base = createBoss(10);
const pDef = Math.round(base.physicalDefense * KING_MULT.def), sDef = Math.round(base.structuralDefense * KING_MULT.def);
const hp = Math.round(base.maxHp * KING_MULT.hp), shp = Math.max(8, (pDef + sDef) * 3);
return { ...base, name: 'Patchwork King', spriteColor: '#fbbf24',
maxHp: hp, currentHp: hp, maxStructuralHp: shp, currentStructuralHp: shp,
physicalAttack: Math.round(base.physicalAttack * KING_MULT.atk), structuralAttack: Math.round(base.structuralAttack * KING_MULT.atk),
physicalDefense: pDef, structuralDefense: sDef };
}

export function getBossPreview(level: number, firstRun = false): { name: string; color: string; hp: number } {
const S = BOSS_SCALING;
const baseHp = Math.floor(S.hpBase + level * S.hpPerLevel + level * level * S.hpQuadratic);
if (level === 10) return { name: 'Patchwork King', color: '#fbbf24', hp: Math.round(baseHp * KING_MULT.hp) };
const t = enemyTypeForLevel(level, firstRun);
const mult = t.name === 'Cartel Enforcer' ? ENFORCER_MULT.hp : t.name === 'Unregistered Operator' ? 1.6 : 1;
return { name: t.name, color: t.color, hp: Math.round(baseHp * mult) };
}

// Stat profiles: [pAtk, sAtk, pDef, sDef] - Patchwork are heavily modified
// Raider: SCAR limbs, boarding hooks - high S-DEF (cybernetic chassis), balanced attack
// Scrapper: brute salvage work - high P-ATK, moderate S-DEF (industrial prosthetics)
// Ghost: interface ports, neural disruption - S-ATK dominant, low S-DEF (unarmoured)
// Helix/Tianxia/CBN: corporate profiles, used at higher levels
const BOSS_STAT_PROFILES: Record<string, { pAtkR: number; sAtkR: number; pDefR: number; sDefR: number }> = {
'Limbic Cartel Scavenger':  { pAtkR: 0.70, sAtkR: 0.30, pDefR: 0.55, sDefR: 0.45 },
'SALV Boarder':             { pAtkR: 0.60, sAtkR: 0.40, pDefR: 0.40, sDefR: 0.60 },
'Pump-Fleet Cadre':         { pAtkR: 0.65, sAtkR: 0.35, pDefR: 0.60, sDefR: 0.40 },
'Ghost-MIL Infiltrator':    { pAtkR: 0.30, sAtkR: 0.70, pDefR: 0.50, sDefR: 0.50 },
'Non-Continuous Raider':    { pAtkR: 0.85, sAtkR: 0.15, pDefR: 0.70, sDefR: 0.30 },
'CBN Extraction Surgeon':   { pAtkR: 0.80, sAtkR: 0.20, pDefR: 0.65, sDefR: 0.35 },
'IOA Interdiction Officer': { pAtkR: 0.55, sAtkR: 0.45, pDefR: 0.50, sDefR: 0.50 },
'Tianxia Compliance Unit':  { pAtkR: 0.40, sAtkR: 0.60, pDefR: 0.45, sDefR: 0.55 },
'Helix Continuity Warden':  { pAtkR: 0.50, sAtkR: 0.50, pDefR: 0.40, sDefR: 0.60 },
'Volkov Operator':          { pAtkR: 0.65, sAtkR: 0.35, pDefR: 0.50, sDefR: 0.50 },
'Cartel Enforcer':          { pAtkR: 0.75, sAtkR: 0.25, pDefR: 0.55, sDefR: 0.45 },
'Unregistered Operator':    { pAtkR: 0.55, sAtkR: 0.45, pDefR: 0.50, sDefR: 0.50 },
};

export function createBoss(level: number = 1, firstRun = false): Character {
const bossType = enemyTypeForLevel(level, firstRun);
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

// Roll boss augments - capped to common/uncommon to prevent runaway defense scaling.
// Rare+ items have defenseBonus up to 16 which can make bosses unkillable at low levels.
const numAugs = level <= 5 ? 1 : level <= 10 ? 2 : 3;
let bonusPAtk = 0, bonusSAtk = 0, bonusPDef = 0, bonusSDef = 0, bonusHp = 0;
const cappedPool = PATCHWORK_AUG_POOL.filter(i =>
(i as any).rarity === 'common' || (i as any).rarity === 'uncommon'
);
const pool = [...(cappedPool.length > 0 ? cappedPool : PATCHWORK_AUG_POOL)];
for (let i = 0; i < numAugs; i++) {
if (pool.length === 0) break;
const idx = Math.floor(Math.random() * pool.length);
const aug = pool.splice(idx, 1)[0];
// attackBonus -> physical attack (crude weapons), defenseBonus -> physical defense
// structural attack/defense get a smaller bonus derived from the same items
bonusPAtk += aug.attackBonus  || 0;
bonusSAtk += Math.floor((aug.attackBonus  || 0) * profile.sAtkR);
bonusPDef += aug.defenseBonus || 0;
bonusSDef += Math.floor((aug.defenseBonus || 0) * profile.sDefR);
bonusHp   += aug.hpBonus      || 0;
}

pAtk += bonusPAtk; sAtk += bonusSAtk;
pDef += bonusPDef; sDef += bonusSDef;
let finalHp = bossHp + bonusHp;
const structuralHp = Math.max(8, (pDef + sDef) * 3);
if (bossType.name === 'Cartel Enforcer') {
// A set-piece wall for the first life: meant to end it
finalHp = Math.round(finalHp * ENFORCER_MULT.hp);
pAtk = Math.round(pAtk * ENFORCER_MULT.atk); sAtk = Math.round(sAtk * ENFORCER_MULT.atk);
} else if (bossType.name === 'Unregistered Operator') {
finalHp = Math.round(finalHp * 1.6);
}

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
};
}

// Boss attack rosters.
// isHeavy: true -- the enemy tell fires the turn BEFORE this attack lands.
// heatTransfer: heat applied to the TARGET when this attack hits.
// Keep one isHeavy attack per boss.
export const BOSS_ATTACKS: Record<string, CombatAction[]> = {
'Limbic Cartel Scavenger': [
{ type: 'attack', name: 'Graft Hook',        description: '', damage: 11, accuracy: 'variable',   physicalRatio: 0.75, heatTransfer: +5,  heatGenerated: 8,  attackPattern: 'melee' },
{ type: 'attack', name: 'Calm-Haze Rush',    description: '', damage: 18, isHeavy: true, accuracy: 'unreliable', physicalRatio: 0.80, heatTransfer: +8, heatGenerated: 12, attackPattern: 'charge' },
{ type: 'defend', name: 'PLM Numbing',       description: '', defenseBoost: 6, heatGenerated: -6 },
],
'SALV Boarder': [
{ type: 'attack', name: 'Crane Sweep',       description: '', damage: 11, accuracy: 'variable',   physicalRatio: 0.65, heatTransfer: +6,  heatGenerated: 9,  attackPattern: 'sweep_arc' },
{ type: 'attack', name: 'Boarding Clamp',    description: '', damage: 18, isHeavy: true, accuracy: 'variable', physicalRatio: 0.6, heatTransfer: +9, heatGenerated: 12, attackPattern: 'melee_long' },
{ type: 'defend', name: 'Spinal Lock',       description: '', defenseBoost: 9, heatGenerated: -5 },
],
'Pump-Fleet Cadre': [
{ type: 'attack', name: 'Rib-Graft Ram',     description: '', damage: 12, accuracy: 'variable',   physicalRatio: 0.70, heatTransfer: +5,  heatGenerated: 8,  attackPattern: 'melee_long' },
{ type: 'attack', name: 'Storm Liturgy',     description: '', damage: 20, isHeavy: true, accuracy: 'variable', physicalRatio: 0.65, heatTransfer: +10, heatGenerated: 13, attackPattern: 'aoe' },
{ type: 'defend', name: 'Pump Surge',        description: '', defenseBoost: 10, heatGenerated: -8 },
],
'Ghost-MIL Infiltrator': [
{ type: 'attack', name: 'Signal Bleed',      description: '', damage: 14, accuracy: 'unreliable', physicalRatio: 0.15, heatTransfer: -6,  heatGenerated: 7,  attackPattern: 'ranged' },
{ type: 'attack', name: 'Feedback Loop',     description: '', damage: 24, isHeavy: true, accuracy: 'unreliable', physicalRatio: 0.10, heatTransfer: -10, heatGenerated: 9, attackPattern: 'diagonal_cross' },
{ type: 'defend', name: 'Sensor Ghosting',   description: '', defenseBoost: 5, heatGenerated: -5 },
],
'Non-Continuous Raider': [
{ type: 'attack', name: 'Catheter Blade',    description: '', damage: 14, accuracy: 'unreliable', physicalRatio: 0.90, heatTransfer: +7,  heatGenerated: 9,  attackPattern: 'lunge' },
{ type: 'attack', name: 'Continuity Theft',  description: '', damage: 24, isHeavy: true, accuracy: 'unreliable', physicalRatio: 0.85, heatTransfer: +11, heatGenerated: 14, attackPattern: 'charge' },
{ type: 'defend', name: 'Scatter',           description: '', defenseBoost: 6, heatGenerated: -4 },
],
'CBN Extraction Surgeon': [
{ type: 'attack', name: 'Sedative Dart',     description: '', damage: 9,  accuracy: 'variable',   physicalRatio: 1.00, heatTransfer: +3,  heatGenerated: 5,  attackPattern: 'ranged' },
{ type: 'attack', name: 'BASM Harvest',      description: '', damage: 20, isHeavy: true, accuracy: 'variable', physicalRatio: 0.80, heatTransfer: +4, heatGenerated: 7, attackPattern: 'melee' },
{ type: 'defend', name: 'Sterile Field',     description: '', defenseBoost: 12, heatGenerated: -10 },
],
'IOA Interdiction Officer': [
{ type: 'attack', name: 'Transit Denial',    description: '', damage: 12, accuracy: 'variable',   physicalRatio: 0.60, heatTransfer: +5,  heatGenerated: 7,  attackPattern: 'ranged' },
{ type: 'attack', name: 'Boarding Order',    description: '', damage: 20, isHeavy: true, accuracy: 'precise', physicalRatio: 0.70, heatTransfer: +8, heatGenerated: 10, attackPattern: 'knockback' },
{ type: 'defend', name: 'Certified Cover',   description: '', defenseBoost: 9, heatGenerated: -7 },
],
'Tianxia Compliance Unit': [
{ type: 'attack', name: 'Neural Disrupt',    description: '', damage: 11, accuracy: 'variable',   physicalRatio: 0.20, heatTransfer: -5,  heatGenerated: 6,  attackPattern: 'ranged' },
{ type: 'attack', name: 'Crackdown Order',   description: '', damage: 19, isHeavy: true, accuracy: 'variable', physicalRatio: 0.70, heatTransfer: +8, heatGenerated: 10, attackPattern: 'knockback' },
{ type: 'defend', name: 'Perimeter Lock',    description: '', defenseBoost: 10, heatGenerated: -6 },
],
'Helix Continuity Warden': [
{ type: 'attack', name: 'Shock Baton',       description: '', damage: 12, accuracy: 'variable',   physicalRatio: 0.40, heatTransfer: +6,  heatGenerated: 8,  attackPattern: 'sweep_arc' },
{ type: 'attack', name: 'Service Denial',    description: '', damage: 21, isHeavy: true, accuracy: 'precise', physicalRatio: 0.35, heatTransfer: +9, heatGenerated: 11, attackPattern: 'charge' },
{ type: 'defend', name: 'Structural Housing', description: '', defenseBoost: 12, heatGenerated: -8 },
],
'Volkov Operator': [
{ type: 'attack', name: 'Hydraulic Drive',   description: '', damage: 16, accuracy: 'precise',    physicalRatio: 0.70, heatTransfer: +7,  heatGenerated: 10, attackPattern: 'melee_long' },
{ type: 'attack', name: 'Operator Breach',   description: '', damage: 28, isHeavy: true, accuracy: 'precise', physicalRatio: 0.65, heatTransfer: +12, heatGenerated: 15, attackPattern: 'charge' },
{ type: 'defend', name: 'Pain Suppression',  description: '', defenseBoost: 8, heatGenerated: -6 },
],
'Cartel Enforcer': [
{ type: 'attack', name: 'Collector\'s Hook', description: '', damage: 18, accuracy: 'variable',   physicalRatio: 0.75, heatTransfer: +8,  heatGenerated: 9,  attackPattern: 'sweep_arc' },
{ type: 'attack', name: 'Debt Called In',    description: '', damage: 26, isHeavy: true, accuracy: 'precise', physicalRatio: 0.80, heatTransfer: +12, heatGenerated: 12, attackPattern: 'charge' },
],
'Unregistered Operator': [
{ type: 'attack', name: 'Unlogged Cut',      description: '', damage: 18, accuracy: 'precise',    physicalRatio: 0.60, heatTransfer: +6,  heatGenerated: 8,  attackPattern: 'lunge' },
{ type: 'attack', name: 'Vestibular Strike', description: '', damage: 16, accuracy: 'precise',    physicalRatio: 0.40, heatTransfer: -8,  heatGenerated: 6,  attackPattern: 'diagonal_cross' },
{ type: 'attack', name: 'Clean Paperwork',   description: '', damage: 32, isHeavy: true, accuracy: 'precise', physicalRatio: 0.60, heatTransfer: +14, heatGenerated: 14, attackPattern: 'charge' },
],
};

// Export for store consumption
export function getBossStartingHeat(bossName: string): number {
const bt = [...BOSS_TYPES, ...SPECIAL_TYPES].find(b => b.name === bossName);
return bt?.startingHeat ?? 50;
}

export function getBossAction(bossName: string): CombatAction {
const actions = BOSS_ATTACKS[bossName];
if (!actions || actions.length === 0) {
return { type: 'attack', name: 'Strike', description: '', damage: 10, physicalRatio: 0.70 };
}
return actions[Math.floor(Math.random() * actions.length)];
}

export function createCombatLog(message: string, type: CombatLog['type'] = 'info'): CombatLog {
return {
id: Math.random().toString(36),
message,
timestamp: Date.now(),
type,
};
}

const PATCHWORK_KING_PHASES: CombatAction[][] = [
  [
    { type: 'attack', name: 'Salvage Rights',   description: '', damage: 18, accuracy: 'variable',   physicalRatio: 0.65, heatTransfer: +7,  heatGenerated: 10, attackPattern: 'sweep_arc' },
    { type: 'attack', name: 'Claim the Dead',   description: '', damage: 14, accuracy: 'unreliable', physicalRatio: 0.80, heatTransfer: +5,  heatGenerated: 8,  attackPattern: 'charge' },
    { type: 'defend', name: 'Scrap Ward',        description: '', defenseBoost: 10, heatGenerated: -7 },
  ],
  [
    { type: 'attack', name: 'Iron Tithe',        description: '', damage: 24, accuracy: 'variable',   physicalRatio: 0.55, heatTransfer: +12, heatGenerated: 16, attackPattern: 'diagonal_cross' },
    { type: 'attack', name: 'Splinter Barrage',  description: '', damage: 20, isHeavy: true, accuracy: 'unreliable', physicalRatio: 0.70, heatTransfer: +10, heatGenerated: 14, attackPattern: 'aoe' },
    { type: 'defend', name: 'Sovereign Guard',   description: '', defenseBoost: 14, heatGenerated: -9 },
  ],
  [
    { type: 'attack', name: 'Fleet Command',    description: '', damage: 26, accuracy: 'variable', physicalRatio: 0.60, heatTransfer: +10, heatGenerated: 14, attackPattern: 'charge' },
    { type: 'attack', name: 'Plunder Protocol', description: '', damage: 34, isHeavy: true, accuracy: 'variable', physicalRatio: 0.70, heatTransfer: +16, heatGenerated: 20, attackPattern: 'sweep_arc' },
    { type: 'attack', name: "The King's Due",   description: '', damage: 40, isHeavy: true, accuracy: 'precise',  physicalRatio: 0.75, heatTransfer: +18, heatGenerated: 22, attackPattern: 'charge' },
  ],
];

/** Every attack an enemy can use (the King's scripted phases included). */
export function getBossRoster(bossName: string): CombatAction[] {
if (bossName === 'Patchwork King') return PATCHWORK_KING_PHASES.flat();
return BOSS_ATTACKS[bossName] ?? [];
}

export function getPatchworkKingAction(turnCount: number): CombatAction {
  const phaseIndex = turnCount <= 3 ? 0 : turnCount <= 6 ? 1 : 2;
  const phase = PATCHWORK_KING_PHASES[phaseIndex];
  return phase[Math.floor(Math.random() * phase.length)];
}

export const PATCHWORK_KING_MONOLOGUE: string[] = [
  'The Patchwork King rises. Everything you carry -- he has already counted.',
  'He built his throne from the parts others left behind.',
  'You still breathe. He finds that... inconvenient.',
  'There is no negotiation. Only settlement.',
];