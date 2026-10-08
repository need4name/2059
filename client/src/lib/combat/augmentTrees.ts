import { AugmentationSlot, CombatAction } from './types';

// ── Tree structure ────────────────────────────────────────────────────────────

export type TreePath = 'A' | 'B';
export type TreeTier = 0 | 1 | 2 | 3; // 0=equipped only, 1=branch chosen, 2=upgraded, 3=capstone

export interface TreeTierData {
// Stat bonuses granted at this tier (on top of previous tiers)
attackBonus: number;
defenseBonus: number;
hpBonus: number;
moveRange?: number;  // extra movement tiles granted at this tier (cumulative with lower tiers)
// Combat action unlocked/upgraded at this tier. null = passive (Phase 6)
combatAction: CombatAction | null;
// Name of the augment itself at this tier (flavour label)
augmentLabel: string;
}

export interface TreePathData {
name: string;          // short path name shown on branch choice screen
description: string;   // what this path commits you to
tiers: [TreeTierData, TreeTierData, TreeTierData]; // tier 1, 2, 3
}

export interface AugmentTree {
id: string;
slot: AugmentationSlot;
displayName: string;   // generic name before any path is chosen
paths: {
A: TreePathData;
B: TreePathData;
};
}

// ── Helper to build a CombatAction cleanly ───────────────────────────────────

function action(
type: CombatAction['type'],
name: string,
opts: Partial<CombatAction>
): CombatAction {
return { type, name, description: '', ...opts };
}

// ── Tree definitions - one per body slot ─────────────────────────────────────
// Placeholder stats. Full tuning pass comes later.

export const AUGMENT_TREES: Record<AugmentationSlot, AugmentTree> = {

// ── RIGHT ARM ───────────────────────────────────────────────────────────────
right_arm: {
id: 'tree_right_arm',
slot: 'right_arm',
displayName: 'Right Arm Augment',
paths: {
A: {
name: 'FORCE',
description: 'Increase striking power. More damage, more heat.',
tiers: [
{
augmentLabel: 'Reinforced Strike (Mk.1)',
attackBonus: 2, defenseBonus: 0, hpBonus: 0,
combatAction: action('attack', 'Reinforced Strike', {
damage: 14, heatGenerated: 18,
attackPattern: 'melee_long',
}),
},
{
augmentLabel: 'Reinforced Strike (Mk.2)',
attackBonus: 3, defenseBonus: 0, hpBonus: 0,
combatAction: action('attack', 'Power Strike', {
damage: 18, heatGenerated: 20,
attackPattern: 'melee_long',
}),
},
{
augmentLabel: 'Hydraulic Slam',
attackBonus: 4, defenseBonus: 0, hpBonus: 0,
combatAction: action('attack', 'Hydraulic Slam', {
damage: 26, heatGenerated: 28,
attackPattern: 'lunge',
}),
},
],
},
B: {
name: 'GUARD',
description: 'Reinforce the arm for blocking. More defense, better brace.',
tiers: [
{
augmentLabel: 'Arm Brace (Mk.1)',
attackBonus: 0, defenseBonus: 2, hpBonus: 5,
combatAction: action('brace', 'Arm Guard', {
defenseBoost: 10, heatGenerated: -20,
}),
},
{
augmentLabel: 'Arm Brace (Mk.2)',
attackBonus: 0, defenseBonus: 3, hpBonus: 5,
combatAction: action('brace', 'Iron Block', {
defenseBoost: 14, heatGenerated: -25,
}),
},
{
augmentLabel: 'Iron Wall',
attackBonus: 0, defenseBonus: 5, hpBonus: 10,
combatAction: action('brace', 'Iron Wall', {
defenseBoost: 20, heatGenerated: -30,
}),
},
],
},
},
},

// ── LEFT ARM ────────────────────────────────────────────────────────────────
left_arm: {
id: 'tree_left_arm',
slot: 'left_arm',
displayName: 'Left Arm Augment',
paths: {
A: {
name: 'OFFHAND',
description: 'Secondary strike. Low heat, quick to use.',
tiers: [
{
augmentLabel: 'Offhand Jab (Mk.1)',
attackBonus: 2, defenseBonus: 0, hpBonus: 0,
combatAction: action('attack', 'Offhand Jab', {
damage: 8, heatGenerated: 10,
attackPattern: 'melee',
}),
},
{
augmentLabel: 'Offhand Jab (Mk.2)',
attackBonus: 3, defenseBonus: 0, hpBonus: 0,
combatAction: action('attack', 'Quick Hook', {
damage: 11, heatGenerated: 10,
attackPattern: 'melee',
}),
},
{
augmentLabel: 'Cross Hook',
attackBonus: 4, defenseBonus: 0, hpBonus: 0,
combatAction: action('attack', 'Cross Hook', {
damage: 14, heatGenerated: 12,
attackPattern: 'diagonal_cross',
}),
},
],
},
B: {
name: 'SUPPRESS',
description: 'Redirect heat and reduce incoming damage.',
tiers: [
{
augmentLabel: 'Heat Vent (Mk.1)',
attackBonus: 0, defenseBonus: 2, hpBonus: 0,
combatAction: action('brace', 'Vent Pressure', {
defenseBoost: 6, heatGenerated: -28,
}),
},
{
augmentLabel: 'Heat Vent (Mk.2)',
attackBonus: 0, defenseBonus: 3, hpBonus: 5,
combatAction: action('brace', 'Pressure Release', {
defenseBoost: 8, heatGenerated: -35,
}),
},
{
augmentLabel: 'Bleed Valve',
attackBonus: 0, defenseBonus: 4, hpBonus: 10,
combatAction: action('brace', 'Bleed Valve', {
defenseBoost: 10, heatGenerated: -45,
}),
},
],
},
},
},

// ── BRAIN ───────────────────────────────────────────────────────────────────
brain: {
id: 'tree_brain',
slot: 'brain',
displayName: 'Neural Augment',
paths: {
A: {
name: 'CLARITY',
description: 'Regulate heat generation. Stay cooler, hit harder.',
tiers: [
{
augmentLabel: 'Focus Module (Mk.1)',
attackBonus: 1, defenseBonus: 0, hpBonus: 0,
combatAction: action('brace', 'Focus Pulse', {
defenseBoost: 2, heatGenerated: -35,
}),
},
{
augmentLabel: 'Focus Module (Mk.2)',
attackBonus: 2, defenseBonus: 0, hpBonus: 0,
combatAction: action('brace', 'Neural Flush', {
defenseBoost: 3, heatGenerated: -45,
}),
},
{
augmentLabel: 'System Override',
attackBonus: 3, defenseBonus: 0, hpBonus: 5,
combatAction: action('brace', 'System Override', {
defenseBoost: 4, heatGenerated: -60,
}),
},
],
},
B: {
name: 'AGGRESSION',
description: 'Overclock attack processing. Higher damage, volatile.',
tiers: [
{
augmentLabel: 'Overclocked Processor (Mk.1)',
attackBonus: 3, defenseBonus: 0, hpBonus: 0,
combatAction: action('attack', 'Overclock Strike', {
damage: 16, heatGenerated: 30,
attackPattern: 'ranged',
ignoreRange: true,
}),
},
{
augmentLabel: 'Overclocked Processor (Mk.2)',
attackBonus: 5, defenseBonus: 0, hpBonus: 0,
combatAction: action('attack', 'Spike Protocol', {
damage: 20, heatGenerated: 35,
attackPattern: 'ranged',
ignoreRange: true,
}),
},
{
augmentLabel: 'Kill Switch',
attackBonus: 7, defenseBonus: 0, hpBonus: 0,
combatAction: action('attack', 'Kill Switch', {
damage: 28, heatGenerated: 45,
attackPattern: 'ranged',
ignoreRange: true,
}),
},
],
},
},
},

// ── LUNGS ───────────────────────────────────────────────────────────────────
lungs: {
id: 'tree_lungs',
slot: 'lungs',
displayName: 'Respiratory Augment',
paths: {
A: {
name: 'ENDURANCE',
description: 'Increase survivability. More HP, slower heat climb.',
tiers: [
{
augmentLabel: 'Filtered Liner (Mk.1)',
attackBonus: 0, defenseBonus: 1, hpBonus: 15,
combatAction: action('brace', 'Controlled Breath', {
defenseBoost: 4, heatGenerated: -22,
}),
},
{
augmentLabel: 'Filtered Liner (Mk.2)',
attackBonus: 0, defenseBonus: 2, hpBonus: 20,
combatAction: action('brace', 'Recovery Breath', {
defenseBoost: 6, heatGenerated: -28,
}),
},
{
augmentLabel: 'Iron Lung',
attackBonus: 0, defenseBonus: 3, hpBonus: 30,
combatAction: action('brace', 'Iron Lung', {
defenseBoost: 8, heatGenerated: -38,
}),
},
],
},
B: {
name: 'BURST',
description: 'Supercharge output. High damage window, burns resources.',
tiers: [
{
augmentLabel: 'Stimulant Inhaler (Mk.1)',
attackBonus: 2, defenseBonus: 0, hpBonus: 5,
combatAction: action('special', 'Adrenaline Burst', {
damage: 18, heatGenerated: 30,
attackPattern: 'melee_long',
}),
},
{
augmentLabel: 'Stimulant Inhaler (Mk.2)',
attackBonus: 3, defenseBonus: 0, hpBonus: 5,
combatAction: action('special', 'Combat Stimulant', {
damage: 22, heatGenerated: 35,
attackPattern: 'melee_long',
}),
},
{
augmentLabel: 'Overdrive Lung',
attackBonus: 4, defenseBonus: 0, hpBonus: 10,
combatAction: action('special', 'Overdrive', {
damage: 30, heatGenerated: 45,
attackPattern: 'aoe',
}),
},
],
},
},
},

// ── RIGHT LEG ───────────────────────────────────────────────────────────────
right_leg: {
id: 'tree_right_leg',
slot: 'right_leg',
displayName: 'Right Leg Augment',
paths: {
A: {
name: 'MOBILITY',
description: 'Expand movement range. Reach flanking positions faster.',
tiers: [
{
augmentLabel: 'Stabiliser (Mk.1)',
attackBonus: 0, defenseBonus: 1, hpBonus: 5, moveRange: 1,
combatAction: action('brace', 'Planted Stance', {
defenseBoost: 8, heatGenerated: -18,
}),
},
{
augmentLabel: 'Stabiliser (Mk.2)',
attackBonus: 0, defenseBonus: 2, hpBonus: 8, moveRange: 1,
combatAction: action('brace', 'Combat Brace', {
defenseBoost: 12, heatGenerated: -22,
}),
},
{
augmentLabel: 'Anchor Frame',
attackBonus: 0, defenseBonus: 4, hpBonus: 15, moveRange: 2,
combatAction: action('brace', 'Anchor', {
defenseBoost: 16, heatGenerated: -28,
}),
},
],
},
B: {
name: 'STOMP',
description: 'Leg-driven impact. Area strike, close range.',
tiers: [
{
augmentLabel: 'Impact Leg (Mk.1)',
attackBonus: 2, defenseBonus: 0, hpBonus: 0,
combatAction: action('attack', 'Heel Drop', {
damage: 12, heatGenerated: 18,
attackPattern: 'sweep_arc',
}),
},
{
augmentLabel: 'Impact Leg (Mk.2)',
attackBonus: 3, defenseBonus: 0, hpBonus: 0,
combatAction: action('attack', 'Ground Pound', {
damage: 18, heatGenerated: 22,
attackPattern: 'sweep_arc',
}),
},
{
augmentLabel: 'Piston Leg',
attackBonus: 5, defenseBonus: 0, hpBonus: 0,
combatAction: action('attack', 'Piston Kick', {
damage: 24, heatGenerated: 28,
attackPattern: 'aoe',
}),
},
],
},
},
},

// ── LEFT LEG ────────────────────────────────────────────────────────────────
left_leg: {
id: 'tree_left_leg',
slot: 'left_leg',
displayName: 'Left Leg Augment',
paths: {
A: {
name: 'MOBILITY',
description: 'Speed and repositioning. Better flanking.',
tiers: [
{
augmentLabel: 'Sprinter Brace (Mk.1)',
attackBonus: 1, defenseBonus: 0, hpBonus: 5,
combatAction: action('brace', 'Side Step', {
defenseBoost: 5, heatGenerated: -20,
}),
},
{
augmentLabel: 'Sprinter Brace (Mk.2)',
attackBonus: 2, defenseBonus: 0, hpBonus: 8,
combatAction: action('brace', 'Dodge Roll', {
defenseBoost: 7, heatGenerated: -24,
}),
},
{
augmentLabel: 'Ghost Step',
attackBonus: 3, defenseBonus: 0, hpBonus: 12,
combatAction: action('brace', 'Ghost Step', {
defenseBoost: 9, heatGenerated: -32,
}),
},
],
},
B: {
name: 'SWEEP',
description: 'Wide-arc kick. Hits diagonally.',
tiers: [
{
augmentLabel: 'Sweep Leg (Mk.1)',
attackBonus: 2, defenseBonus: 0, hpBonus: 0,
combatAction: action('attack', 'Leg Sweep', {
damage: 10, heatGenerated: 14,
attackPattern: 'diagonal_cross',
}),
},
{
augmentLabel: 'Sweep Leg (Mk.2)',
attackBonus: 3, defenseBonus: 0, hpBonus: 0,
combatAction: action('attack', 'Spinning Sweep', {
damage: 14, heatGenerated: 16,
attackPattern: 'diagonal_cross',
}),
},
{
augmentLabel: 'Arc Breaker',
attackBonus: 4, defenseBonus: 0, hpBonus: 0,
combatAction: action('attack', 'Arc Breaker', {
damage: 22, heatGenerated: 22,
attackPattern: 'charge',
}),
},
],
},
},
},

// ── EYES ────────────────────────────────────────────────────────────────────
eyes: {
id: 'tree_eyes',
slot: 'eyes',
displayName: 'Optical Augment',
paths: {
A: {
name: 'RANGE',
description: 'Targeting optics. Effective at distance.',
tiers: [
{
augmentLabel: 'Targeting Reticle (Mk.1)',
attackBonus: 2, defenseBonus: 0, hpBonus: 0,
combatAction: action('attack', 'Targeted Shot', {
damage: 13, heatGenerated: 15,
attackPattern: 'ranged', ignoreRange: true,
}),
},
{
augmentLabel: 'Targeting Reticle (Mk.2)',
attackBonus: 3, defenseBonus: 0, hpBonus: 0,
combatAction: action('attack', 'Precision Shot', {
damage: 17, heatGenerated: 15,
attackPattern: 'ranged', ignoreRange: true,
}),
},
{
augmentLabel: 'Long Sight',
attackBonus: 5, defenseBonus: 0, hpBonus: 0,
combatAction: action('attack', 'Long Sight', {
damage: 24, heatGenerated: 18,
attackPattern: 'ranged', ignoreRange: true,
}),
},
],
},
B: {
name: 'SCAN',
description: 'Read the enemy. Reduce heat, gain positioning edge.',
tiers: [
{
augmentLabel: 'Threat Scanner (Mk.1)',
attackBonus: 1, defenseBonus: 1, hpBonus: 0,
combatAction: action('brace', 'Threat Scan', {
defenseBoost: 5, heatGenerated: -30,
}),
},
{
augmentLabel: 'Threat Scanner (Mk.2)',
attackBonus: 2, defenseBonus: 1, hpBonus: 0,
combatAction: action('brace', 'Target Lock', {
defenseBoost: 7, heatGenerated: -36,
}),
},
{
augmentLabel: 'Combat Analysis',
attackBonus: 3, defenseBonus: 2, hpBonus: 0,
combatAction: action('brace', 'Combat Analysis', {
defenseBoost: 9, heatGenerated: -44,
}),
},
],
},
},
},

// ── EARS ────────────────────────────────────────────────────────────────────
ears: {
id: 'tree_ears',
slot: 'ears',
displayName: 'Auditory Augment',
paths: {
A: {
name: 'ALERT',
description: 'Enhanced threat awareness. Defensive edge.',
tiers: [
{
augmentLabel: 'Threat Mic (Mk.1)',
attackBonus: 0, defenseBonus: 2, hpBonus: 5,
combatAction: action('brace', 'Alert Stance', {
defenseBoost: 9, heatGenerated: -20,
}),
},
{
augmentLabel: 'Threat Mic (Mk.2)',
attackBonus: 0, defenseBonus: 3, hpBonus: 8,
combatAction: action('brace', 'Threat Response', {
defenseBoost: 12, heatGenerated: -24,
}),
},
{
augmentLabel: 'Sonic Profile',
attackBonus: 0, defenseBonus: 4, hpBonus: 12,
combatAction: action('brace', 'Sonic Profile', {
defenseBoost: 16, heatGenerated: -30,
}),
},
],
},
B: {
name: 'DISRUPT',
description: 'Sonic attack. Disorients rather than damages.',
tiers: [
{
augmentLabel: 'Disruptor Ear (Mk.1)',
attackBonus: 1, defenseBonus: 1, hpBonus: 0,
combatAction: action('special', 'Sonic Burst', {
damage: 10, heatGenerated: 20,
attackPattern: 'aoe',
}),
},
{
augmentLabel: 'Disruptor Ear (Mk.2)',
attackBonus: 2, defenseBonus: 1, hpBonus: 0,
combatAction: action('special', 'Frequency Spike', {
damage: 14, heatGenerated: 22,
attackPattern: 'aoe',
}),
},
{
augmentLabel: 'Wavebreak',
attackBonus: 3, defenseBonus: 2, hpBonus: 0,
combatAction: action('special', 'Wavebreak', {
damage: 20, heatGenerated: 28,
attackPattern: 'aoe',
}),
},
],
},
},
},

// ── NOSE ────────────────────────────────────────────────────────────────────
nose: {
id: 'tree_nose',
slot: 'nose',
displayName: 'Olfactory Augment',
paths: {
A: {
name: 'FILTER',
description: 'Toxin resistance. HP and defense focus.',
tiers: [
{
augmentLabel: 'Particulate Filter (Mk.1)',
attackBonus: 0, defenseBonus: 2, hpBonus: 10,
combatAction: action('brace', 'Filter Breath', {
defenseBoost: 7, heatGenerated: -22,
}),
},
{
augmentLabel: 'Particulate Filter (Mk.2)',
attackBonus: 0, defenseBonus: 3, hpBonus: 15,
combatAction: action('brace', 'Deep Filter', {
defenseBoost: 10, heatGenerated: -28,
}),
},
{
augmentLabel: 'Sealed Respirator',
attackBonus: 0, defenseBonus: 5, hpBonus: 20,
combatAction: action('brace', 'Sealed Breath', {
defenseBoost: 14, heatGenerated: -36,
}),
},
],
},
B: {
name: 'CHEMICAL',
description: 'Exhale weaponised compounds. Area damage.',
tiers: [
{
augmentLabel: 'Compound Exhaust (Mk.1)',
attackBonus: 2, defenseBonus: 0, hpBonus: 0,
combatAction: action('special', 'Compound Exhaust', {
damage: 11, heatGenerated: 22,
attackPattern: 'cone',
}),
},
{
augmentLabel: 'Compound Exhaust (Mk.2)',
attackBonus: 3, defenseBonus: 0, hpBonus: 0,
combatAction: action('special', 'Toxic Cloud', {
damage: 15, heatGenerated: 25,
attackPattern: 'cone',
}),
},
{
augmentLabel: 'Corrosive Breath',
attackBonus: 4, defenseBonus: 0, hpBonus: 0,
combatAction: action('special', 'Corrosive Breath', {
damage: 22, heatGenerated: 30,
attackPattern: 'aoe',
}),
},
],
},
},
},

// ── MISC ────────────────────────────────────────────────────────────────────
misc: {
id: 'tree_misc',
slot: 'misc',
displayName: 'Misc Augment',
paths: {
A: {
name: 'UPTIME',
description: 'System stability. Consistent heat management.',
tiers: [
{
augmentLabel: 'Uptime Module (Mk.1)',
attackBonus: 1, defenseBonus: 1, hpBonus: 5,
combatAction: action('brace', 'System Stabilise', {
defenseBoost: 6, heatGenerated: -25,
}),
},
{
augmentLabel: 'Uptime Module (Mk.2)',
attackBonus: 1, defenseBonus: 2, hpBonus: 8,
combatAction: action('brace', 'Deep Stabilise', {
defenseBoost: 8, heatGenerated: -32,
}),
},
{
augmentLabel: 'Zero Downtime',
attackBonus: 2, defenseBonus: 3, hpBonus: 12,
combatAction: action('brace', 'Zero Downtime', {
defenseBoost: 12, heatGenerated: -40,
}),
},
],
},
B: {
name: 'OUTPUT',
description: 'Push output beyond rated limits. More damage.',
tiers: [
{
augmentLabel: 'Overdrive Coupler (Mk.1)',
attackBonus: 3, defenseBonus: 0, hpBonus: 0,
combatAction: action('attack', 'Surge Strike', {
damage: 15, heatGenerated: 25,
attackPattern: 'knockback',
}),
},
{
augmentLabel: 'Overdrive Coupler (Mk.2)',
attackBonus: 4, defenseBonus: 0, hpBonus: 0,
combatAction: action('attack', 'Power Surge', {
damage: 20, heatGenerated: 30,
attackPattern: 'melee_long',
}),
},
{
augmentLabel: 'Red Line',
attackBonus: 6, defenseBonus: 0, hpBonus: 0,
combatAction: action('attack', 'Red Line', {
damage: 28, heatGenerated: 40,
attackPattern: 'melee_long',
}),
},
],
},
},
},
};