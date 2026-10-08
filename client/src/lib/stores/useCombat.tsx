import { create } from 'zustand';
import { subscribeWithSelector } from 'zustand/middleware';
import {
Character, CombatPhase, CombatAction, CombatLog, LootDrop,
PlayerClass, CombatGrid, TilePosition, TileData,
getHeatMultipliers, getFlankBonus,
} from '../combat/types';
import {
createPlayer, createBoss, calculateDamage,
getBossAction, getBossStartingHeat, PLAYER_ACTIONS, createCombatLog, CLASS_DEFINITIONS,
getPatchworkKingAction, PATCHWORK_KING_MONOLOGUE,
} from '../combat/actions';
import { generateLoot, generatePatchworkKingLoot } from '../combat/loot';
import { useInventory } from './useInventory';
import { canHitTarget } from '../combat/patterns';
import { isValidMove, isTileOccupied, isWithinBounds, isTileBlocked } from '../combat/movement';
import { PlayerProgression, getXpForLevel, getXpFromBoss, getAwarenessMessage } from '../combat/skills';
import { useAugmentTrees } from './useAugmentTrees';

interface CombatState {
phase: CombatPhase;
player: Character;
boss: Character;
combatLog: CombatLog[];
playerDefenseBoost: number;
bossDefenseBoost: number;
currentLoot: LootDrop | null;
bossLevel: number;
farmLevel: number | null;
playerClass: PlayerClass;
classLocked: boolean;
introCompleted: boolean;
grid: CombatGrid;
debugMode: boolean;
progression: PlayerProgression;
originalPosition: TilePosition | null;
selectedMovement: TilePosition | null;
selectedAction: CombatAction | null;
hasMoved: boolean;

// Heat system
playerHeat: number;                        // 0-100, player starts each fight at 50
bossHeat: number;                          // 0-100, enemy heat tracked independently
doubleActionReady: boolean;                // true when player heat <= 15 at start of turn
bossChargingHeavy: boolean;                // enemy tell - true = warn player this turn
pendingBossAction: CombatAction | null;    // the telegraphed heavy attack to fire next turn

// Structural / malfunction
playerMalfunctioning: boolean;             // true when player structural HP = 0
bossMalfunctioning: boolean;               // true when boss structural HP = 0

// Consumable effects
overclockActive: boolean;                  // next attack is guaranteed crit
kizunaJustFired: boolean;                  // true for one turn after Kizuna passive triggers

// Patchwork King scripted fight
patchworkKingTurn: number;                 // tracks which phase/action in the scripted sequence

setPlayerClass: (playerClass: PlayerClass) => void;
startCombat: () => void;
startFarmCombat: (level: number) => void;
executePlayerTurn: () => void;
moveTentatively: (position: TilePosition) => void;
undoMove: () => void;
setSelectedMovement: (position: TilePosition | null) => void;
setSelectedAction: (action: CombatAction | null) => void;
confirmMove: (position?: TilePosition) => boolean;
endTurn: () => void;
useConsumableItem: (itemId: string) => void;
enemyTurn: () => void;
getBestEnemyMove: () => TilePosition | null;
executeEnemyAttack: (action?: CombatAction) => void;
resetCombat: () => void;
resetAll: () => void;
rebirth: (newClass?: PlayerClass) => void;
leaveShop: () => void;
addLog: (log: CombatLog) => void;
toggleDebugMode: () => void;
gainXp: (xp: number) => void;
getTotalSkillBonus: () => Record<string, number>;
}

// ── Tile helpers ──────────────────────────────────────────────────────────────

const OBSTACLE_TYPES = [
{ icon: '🧱', name: 'Debris' },
{ icon: '📦', name: 'Crate' },
{ icon: '🛢️', name: 'Barrel' },
{ icon: '⚡', name: 'Generator' },
];

const HAZARD_TYPES = [
{ icon: '☢️', name: 'Toxic Pool', damage: 5 },
{ icon: '🔥', name: 'Fire',       damage: 8 },
{ icon: '⚡', name: 'Live Wire',  damage: 6 },
];

function createEmptyTile(): TileData    { return { type: 'empty' }; }
function createObstacleTile(): TileData {
const o = OBSTACLE_TYPES[Math.floor(Math.random() * OBSTACLE_TYPES.length)];
return { type: 'obstacle', icon: o.icon, name: o.name };
}
function createHazardTile(): TileData {
const h = HAZARD_TYPES[Math.floor(Math.random() * HAZARD_TYPES.length)];
return { type: 'hazard', icon: h.icon, name: h.name, hazardDamage: h.damage };
}

function generateGridSize(bossLevel: number) {
const progress = Math.min((bossLevel - 1) / 49, 1);
const cols = Math.min(7, Math.max(4, Math.floor(4 + Math.random() * (0.3 + progress * 0.7) * 4)));
const rows = Math.min(5, Math.max(3, Math.floor(3 + Math.random() * (0.2 + progress * 0.8) * 3)));
return { rows, cols };
}

// ── Arena shape masks ──────────────────────────────────────────────────────
// Returns set of 'row,col' keys that should be void (impassable, invisible)
function getVoidMask(shape: 'open' | 'corridor' | 'l_shape' | 'cross', rows: number, cols: number): Set<string> {
const voids = new Set<string>();
if (shape === 'corridor') {
// One row wide in the middle - top and bottom rows cut
// Keep only the middle row (or middle 2 if rows >= 4)
const keepMin = Math.floor(rows / 2) - (rows >= 4 ? 1 : 0);
const keepMax = Math.floor(rows / 2) + (rows >= 4 ? 1 : 0);
for (let r = 0; r < rows; r++) {
if (r < keepMin || r > keepMax) {
for (let c = 0; c < cols; c++) voids.add(`${r},${c}`);
}
}
} else if (shape === 'l_shape') {
// Bottom-left quadrant cut: top-right area stays, plus bottom-left column
const cutRow = Math.floor(rows * 0.5);
const cutCol = Math.floor(cols * 0.5);
for (let r = 0; r < cutRow; r++) {
for (let c = cutCol; c < cols; c++) {
voids.add(`${r},${c}`);
}
}
} else if (shape === 'cross') {
// Corner squares void - only center column + center row remain accessible
const midRow = Math.floor(rows / 2);
const midCol = Math.floor(cols / 2);
for (let r = 0; r < rows; r++) {
for (let c = 0; c < cols; c++) {
if (r !== midRow && c !== midCol) voids.add(`${r},${c}`);
}
}
}
return voids;
}

function generateBattlefield(bossLevel: number): CombatGrid {
const { rows, cols } = generateGridSize(bossLevel);
const progress = Math.min((bossLevel - 1) / 49, 1);

// Pick arena shape. Open is always available; irregular shapes unlock progressively.
const shapeRoll = Math.random();
let shape: 'open' | 'corridor' | 'l_shape' | 'cross';
if (bossLevel < 3 || shapeRoll < 0.45) {
shape = 'open';
} else if (bossLevel < 5 || shapeRoll < 0.65) {
shape = 'corridor';
} else if (bossLevel < 7 || shapeRoll < 0.80) {
shape = 'l_shape';
} else {
shape = 'cross';
}

const voidSet = getVoidMask(shape, rows, cols);

const tiles: TileData[][] = Array.from({ length: rows }, (_, r) =>
Array.from({ length: cols }, (_, c) => {
if (voidSet.has(`${r},${c}`)) {
return { type: 'void' as const };
}
return createEmptyTile();
})
);

const numObstacles = Math.max(1, Math.floor(progress * 2)) +
Math.floor(Math.random() * (2 + Math.floor(progress * 3)));
const numHazards = Math.floor(Math.random() * Math.min(3, 1 + Math.floor(progress * 3)));

const placed = new Set<string>();

// Don't place obstacles on void tiles or edge columns
let n = 0, attempts = 0;
while (n < numObstacles && attempts < 50) {
const r = Math.floor(Math.random() * rows);
const c = 1 + Math.floor(Math.random() * (cols - 2));
const k = `${r},${c}`;
if (!placed.has(k) && !voidSet.has(k)) {
tiles[r][c] = createObstacleTile(); placed.add(k); n++;
}
attempts++;
}
n = 0; attempts = 0;
while (n < numHazards && attempts < 50) {
const r = Math.floor(Math.random() * rows);
const c = 1 + Math.floor(Math.random() * (cols - 2));
const k = `${r},${c}`;
if (!placed.has(k) && !voidSet.has(k)) {
tiles[r][c] = createHazardTile(); placed.add(k); n++;
}
attempts++;
}

// Place player and boss on non-void rows
const validRows = Array.from({ length: rows }, (_, i) => i)
.filter(r => !voidSet.has(`${r},0`));
const validBossRows = Array.from({ length: rows }, (_, i) => i)
.filter(r => !voidSet.has(`${r},${cols - 1}`));
const playerRow = validRows[Math.floor(Math.random() * validRows.length)] ?? 0;
const bossRow   = Math.random() < 0.5
? playerRow
: (validBossRows[Math.floor(Math.random() * validBossRows.length)] ?? 0);

return {
rows, cols, tiles,
arenaShape: shape,
playerPosition: { row: playerRow, col: 0 },
bossPosition:   { row: bossRow,   col: cols - 1 },
};
}

function emptyGrid(): CombatGrid {
return {
rows: 3, cols: 7,
playerPosition: { row: 1, col: 0 },
bossPosition:   { row: 1, col: 6 },
tiles: Array.from({ length: 3 }, () => Array.from({ length: 7 }, createEmptyTile)),
};
}

// ── Clamp heat to 0-100 ───────────────────────────────────────────────────────
function clampHeat(h: number) { return Math.max(0, Math.min(100, h)); }

// ── Class unlock condition ────────────────────────────────────────────────────
// Classes unlock only after dying on level 11 or higher
function shouldUnlockClasses(bossLevel: number): boolean {
return bossLevel >= 11;
}

// ── Store ─────────────────────────────────────────────────────────────────────

export const useCombat = create<CombatState>()(
subscribeWithSelector((set, get) => ({
phase: 'menu',
player: createPlayer(),
boss: createBoss(1),
combatLog: [],
playerDefenseBoost: 0,
bossDefenseBoost: 0,
currentLoot: null,
bossLevel: 1,
farmLevel: null,
playerClass: 'none',
classLocked: false,
introCompleted: false,
debugMode: false,
originalPosition: null,
selectedMovement: null,
selectedAction: null,
hasMoved: false,
playerHeat: 20,
bossHeat: 50,
doubleActionReady: false,
bossChargingHeavy: false,
pendingBossAction: null,
playerMalfunctioning: false,
bossMalfunctioning: false,
overclockActive: false,
kizunaJustFired: false,
patchworkKingTurn: 0,
progression: {
level: 1,
currentXp: 0,
xpToNextLevel: getXpForLevel(2),
deathCount: 0,
},
grid: emptyGrid(),

setPlayerClass: (playerClass) => {
if (!get().classLocked) set({ playerClass });
},

startCombat: () => {
const { bossLevel, playerClass } = get();
const augBonuses = useInventory.getState().getTotalAugmentationBonuses();
// Merge augment tree stat bonuses (path progression) into combat stats.
// getTreeStatBonuses reads the chosen path tiers for all equipped slots.
const equippedSlots = Object.keys(useInventory.getState().equippedAugmentations).filter(
slot => (useInventory.getState().equippedAugmentations as any)[slot] !== null
) as import('../combat/types').AugmentationSlot[];
const treeBonus = useAugmentTrees.getState().getTreeStatBonuses(equippedSlots);
const mergedBonuses = {
...augBonuses,
treeAttack:  treeBonus.attack,
treeDefense: treeBonus.defense,
treeHp:      treeBonus.hp,
};
const player = createPlayer(mergedBonuses, playerClass);
// Patchwork King at level 10 - always use King boss type
const isPatchworkKing = bossLevel === 10;
const boss = isPatchworkKing
? createBoss(10) // createBoss at 10 will use BOSS_TYPES[9 % 7] - we override below
: createBoss(bossLevel);
// Force King name/color when at level 10
const finalBoss = isPatchworkKing
? { ...boss, name: 'Patchwork King', spriteColor: '#fbbf24',
maxHp: 120, currentHp: 120, maxStructuralHp: 80, currentStructuralHp: 80,
physicalAttack: 22, structuralAttack: 10, physicalDefense: 10, structuralDefense: 8 }
: boss;
const grid = generateBattlefield(bossLevel);
// Build intro log - Patchwork King gets monologue
const introLog: CombatLog[] = isPatchworkKing
? PATCHWORK_KING_MONOLOGUE.slice(0, 2).map((line, i) =>
({ ...createCombatLog(line, 'info'), id: `king_intro_${i}` }))
: [];
set({
phase: 'player_turn', player, boss: finalBoss, grid,
combatLog: introLog,
playerDefenseBoost: 0, bossDefenseBoost: 0,
currentLoot: null, classLocked: true, introCompleted: true,
selectedMovement: null, selectedAction: null, hasMoved: false,
farmLevel: null, originalPosition: { ...grid.playerPosition },
playerHeat: 20, bossHeat: getBossStartingHeat(boss.name), doubleActionReady: false, bossChargingHeavy: false, pendingBossAction: null, playerMalfunctioning: false, bossMalfunctioning: false,
overclockActive: false, kizunaJustFired: false, patchworkKingTurn: 0,
});
},

startFarmCombat: (level) => {
const { playerClass } = get();
const augBonuses = useInventory.getState().getTotalAugmentationBonuses();
const equippedSlots = Object.keys(useInventory.getState().equippedAugmentations).filter(
slot => (useInventory.getState().equippedAugmentations as any)[slot] !== null
) as import('../combat/types').AugmentationSlot[];
const treeBonus = useAugmentTrees.getState().getTreeStatBonuses(equippedSlots);
const mergedBonuses = {
...augBonuses,
treeAttack:  treeBonus.attack,
treeDefense: treeBonus.defense,
treeHp:      treeBonus.hp,
};
const player = createPlayer(mergedBonuses, playerClass);
const boss   = createBoss(level);
const grid   = generateBattlefield(level);
set({
phase: 'player_turn', player, boss, grid,
combatLog: [],
playerDefenseBoost: 0, bossDefenseBoost: 0,
currentLoot: null, classLocked: true, introCompleted: true,
selectedMovement: null, selectedAction: null, hasMoved: false,
farmLevel: level, originalPosition: { ...grid.playerPosition },
playerHeat: 20, bossHeat: getBossStartingHeat(boss.name), doubleActionReady: false, bossChargingHeavy: false, pendingBossAction: null, playerMalfunctioning: false, bossMalfunctioning: false,
overclockActive: false, kizunaJustFired: false, patchworkKingTurn: 0,
});
},

setSelectedMovement: (pos) => set({ selectedMovement: pos }),
setSelectedAction:   (action) => set({ selectedAction: action }),

moveTentatively: (position) => {
const { phase, grid, originalPosition } = get();
if (phase !== 'player_turn') return;
if (!isWithinBounds(position, grid)) return;
if (isTileOccupied(position, grid)) return;
if (isTileBlocked(position, grid)) return;
if (!originalPosition || !isValidMove(originalPosition, position)) return;
set({ grid: { ...grid, playerPosition: position }, selectedMovement: position, hasMoved: true });
},

undoMove: () => {
const { originalPosition, grid } = get();
if (!originalPosition) return;
set({ grid: { ...grid, playerPosition: originalPosition }, selectedMovement: null, hasMoved: false });
},

confirmMove: (position) => {
const { phase, hasMoved: alreadyMoved, grid, playerHeat } = get();
if (!position) return false;
if (phase !== 'player_turn') return false;
if (alreadyMoved) return false;
// Heat >= 100: movement locked (overheated)
if (playerHeat >= 100) {
get().addLog(createCombatLog('OVERHEATED -- movement locked', 'info'));
return false;
}
if (!isWithinBounds(position, grid)) return false;
if (isTileOccupied(position, grid)) return false;
if (isTileBlocked(position, grid)) return false;
// Read moveRange from augment trees
const equippedSlots = Object.keys(useInventory.getState().equippedAugmentations).filter(
s => useInventory.getState().equippedAugmentations[s as any] !== null
) as any[];
const treeBonus = useAugmentTrees.getState().getTreeStatBonuses(equippedSlots);
const moveRange = 1 + (treeBonus.moveRange ?? 0);
if (!isValidMove(grid.playerPosition, position, moveRange)) return false;
set({ grid: { ...grid, playerPosition: position }, hasMoved: true, selectedMovement: null });
return true;
},

endTurn: () => {
const { selectedAction, originalPosition, grid } = get();
const hasMoved = originalPosition && (
grid.playerPosition.row !== originalPosition.row ||
grid.playerPosition.col !== originalPosition.col
);
// Do NOT write originalPosition here. It is only updated when enemy turn ends
// (beginning of next player turn). Writing it early grants a free move whenever
// executePlayerTurn returns early (e.g. out of range).
set({ hasMoved: hasMoved || false, selectedMovement: null });
// If no action is selected, pass the turn to the enemy (soft lock prevention)
if (!selectedAction) {
get().addLog(createCombatLog('-- PASS --', 'info'));
set({ phase: 'enemy_turn', selectedAction: null });
setTimeout(() => get().enemyTurn(), 800);
return;
}
get().executePlayerTurn();
},

useConsumableItem: (itemId) => {
const { phase, player } = get();
if (phase !== 'player_turn') return;
const consumable = useInventory.getState().useConsumable(itemId);
if (!consumable) return;

const effect = (consumable as any).consumableEffect;
let updatedPlayer = { ...player };
let newHeat = get().playerHeat;
let overclockSet = false;
let logMsg = '';

if (effect === 'bio_stim') {
const heal = Math.floor(player.maxHp * 0.60);
updatedPlayer.currentHp = Math.min(player.maxHp, player.currentHp + heal);
logMsg = `BIO-STIM -- +${heal} HP`;
} else if (effect === 'structural_patch') {
const repair = Math.floor(player.maxStructuralHp * 0.60);
updatedPlayer.currentStructuralHp = Math.min(player.maxStructuralHp, player.currentStructuralHp + repair);
// Clear malfunction if structural is now positive
if (updatedPlayer.currentStructuralHp > 0) {
get().addLog(createCombatLog('STRUCTURAL PATCH -- integrity restored', 'info'));
}
logMsg = `STRUCTURAL PATCH -- +${repair} structural HP`;
} else if (effect === 'heat_flush') {
newHeat = 0;
logMsg = 'HEAT FLUSH -- thermal systems purged to zero';
} else if (effect === 'overclock') {
overclockSet = true;
logMsg = 'OVERCLOCK -- next attack is guaranteed critical';
} else {
// Legacy consumable: hpBonus only
const heal = consumable.hpBonus || 0;
updatedPlayer.currentHp = Math.min(player.maxHp, player.currentHp + heal);
newHeat = clampHeat(newHeat - 10);
logMsg = `STIM -- +${heal} HP`;
}

get().addLog(createCombatLog(logMsg, 'info'));

const nowMalfunctioning = updatedPlayer.currentStructuralHp <= 0;
set({
player: updatedPlayer,
playerMalfunctioning: nowMalfunctioning,
phase: overclockSet ? 'player_turn' : 'enemy_turn', // overclock doesn't end your turn
selectedAction: null, selectedMovement: null,
playerHeat: newHeat,
overclockActive: overclockSet,
});
if (!overclockSet) {
setTimeout(() => get().enemyTurn(), 800);
}
},

executePlayerTurn: () => {
const { player, boss, bossDefenseBoost, grid, playerClass, selectedAction, playerHeat, playerMalfunctioning } = get();
if (!selectedAction) return;
const action = selectedAction;

// ── BRACE (replaces Defend) ──────────────────────────────────────────────
if (action.type === 'brace' || action.type === 'defend') {
const heatDelta = action.heatGenerated ?? -25;
const newHeat   = clampHeat(playerHeat + heatDelta);
// Brace repairs structural HP (always, even from 0)
const structuralRepair = 35; // generous repair - brace should meaningfully fight malfunction
const newStructuralHp = Math.min(player.maxStructuralHp, player.currentStructuralHp + structuralRepair);
const wasMalfunctioning = player.currentStructuralHp <= 0;
const nowMalfunctioning = newStructuralHp <= 0;
const updatedPlayer = { ...player, currentStructuralHp: newStructuralHp };
set({
player: updatedPlayer,
playerDefenseBoost: action.defenseBoost || 8,
playerMalfunctioning: nowMalfunctioning,
phase: 'enemy_turn',
selectedAction: null,
playerHeat: newHeat,
});
if (wasMalfunctioning && !nowMalfunctioning) {
get().addLog(createCombatLog('STRUCTURAL INTEGRITY RESTORED -- system nominal', 'info'));
}
setTimeout(() => get().enemyTurn(), 800);
return;
}

// ── ATTACK / SPECIAL ─────────────────────────────────────────────────────
if (action.type === 'attack' || action.type === 'special') {
// Read attackPattern from the action first; only fall back to class special or melee_long.
const attackPattern = (action as any).attackPattern
?? (action.type === 'special'
? (CLASS_DEFINITIONS[playerClass]?.specialAbility?.attackPattern || 'ranged')
: 'melee_long');

const shouldCheckRange =
action.type === 'attack' ||
!CLASS_DEFINITIONS[playerClass]?.specialAbility?.ignoreRange;

if (shouldCheckRange) {
const canHit = canHitTarget(grid.playerPosition, grid.bossPosition, attackPattern, grid);
if (!canHit) {
get().addLog(createCombatLog('Out of range! Move closer.', 'info'));
return;
}
}

// Heat modifiers
const heatMult  = getHeatMultipliers(playerHeat);
const flankBonus = getFlankBonus(grid.playerPosition, grid.bossPosition);
const tileDistance = Math.abs(grid.playerPosition.row - grid.bossPosition.row)

- Math.abs(grid.playerPosition.col - grid.bossPosition.col);

// Kizuna cold-start: first strike at cool heat fires as 'precise'
const kizunaActive = (player as any).hasKizuna && playerHeat <= 20;
const kizunaFiredNow = kizunaActive && !get().kizunaJustFired;
// Overclock: guaranteed crit - force precise + override crit in calculateDamage
const { overclockActive } = get();
let finalAction = kizunaFiredNow ? { ...action, accuracy: 'precise' as const } : action;
if (overclockActive) {
finalAction = { ...finalAction, accuracy: 'precise' as const };
}
const damageResult = calculateDamage(
player, boss, finalAction, bossDefenseBoost,
overclockActive ? 2.0 : heatMult.dealt,  // overclock: force 2x damage multiplier
flankBonus, tileDistance, playerMalfunctioning,
overclockActive ? 100 : playerHeat,       // overclock: pass heat=100 to guarantee crit roll
(player as any).bypassStructuralDefense ?? false
);
if (kizunaFiredNow) {
get().addLog(createCombatLog('KIZUNA ACTIVE -- cold-start precision lock', 'info'));
}

// Apply split damage to boss
const newBossHp = Math.max(0, boss.currentHp - damageResult.bioDamage);
const newBossStructuralHp = Math.max(0, boss.currentStructuralHp - damageResult.structuralDamage);
const bossBecomesMalfunctioning = boss.currentStructuralHp > 0 && newBossStructuralHp <= 0;
const updatedBoss = { ...boss, currentHp: newBossHp, currentStructuralHp: newBossStructuralHp };

// Heat generated by this attack (self) + heat transferred to boss
const heatDelta = action.heatGenerated ?? 15;
const adjacentHeat = (Math.abs(grid.playerPosition.row - grid.bossPosition.row) +
Math.abs(grid.playerPosition.col - grid.bossPosition.col)) === 1 ? 2 : 0;
const newHeat = clampHeat(playerHeat + heatDelta + adjacentHeat);

// Apply heat transfer to boss
const bossHeatDelta = action.heatTransfer ?? 0;
const newBossHeat = clampHeat(get().bossHeat + bossHeatDelta);

// Healing
let updatedPlayer = { ...player };
if (playerClass === 'necromancer' && action.type === 'special') {
const heal = Math.floor(damageResult.bioDamage * 0.5);
updatedPlayer.currentHp = Math.min(player.maxHp, player.currentHp + heal);
} else if (action.healing && action.healing > 0) {
updatedPlayer.currentHp = Math.min(player.maxHp, player.currentHp + action.healing);
}

// Malfunction flag on player (if already malfunctioning, log it)
if (playerMalfunctioning) {
get().addLog(createCombatLog('MALFUNCTION', 'malfunction'));
}

// Defense boost from special abilities
const newPlayerDefenseBoost = (action.defenseBoost && action.defenseBoost > 0)
? action.defenseBoost : 0;

// Double action: if doubleActionReady was true, consume it and stay on player_turn
const wasDoubleReady = get().doubleActionReady;

set({
player: updatedPlayer,
boss: updatedBoss,
bossMalfunctioning: bossBecomesMalfunctioning || (boss.currentStructuralHp <= 0),
bossDefenseBoost: 0,
playerDefenseBoost: newPlayerDefenseBoost,
overclockActive: false,
kizunaJustFired: kizunaFiredNow || get().kizunaJustFired,
selectedAction: null,
playerHeat: newHeat,
bossHeat: newBossHeat,
doubleActionReady: false,
});

if (bossBecomesMalfunctioning) {
get().addLog(createCombatLog(`${boss.name}: MALFUNCTION`, 'malfunction'));
}

// Log heat transfer to boss if nonzero
if (bossHeatDelta !== 0) {
get().addLog(createCombatLog(
`${boss.name} heat: ${bossHeatDelta > 0 ? '+' : ''}${bossHeatDelta} (${newBossHeat})`,
'info'
));
}

get().addLog(createCombatLog(
`Dealt ${damageResult.bioDamage} bio / ${damageResult.structuralDamage} structural${damageResult.isFlank ? ' [FLANK]' : ''}`,
'damage'
));

if (newBossHp <= 0) {
const { farmLevel, bossLevel } = get();
const currentLevel = farmLevel !== null ? farmLevel : bossLevel;
// Patchwork King (level 10) gets special loot
const isPatchworkKing = currentLevel === 10 && farmLevel === null;
const loot = isPatchworkKing ? generatePatchworkKingLoot() : generateLoot(currentLevel);
const xpGained = getXpFromBoss(currentLevel);
const goldReward = isPatchworkKing ? 600 : 40 + (currentLevel * 10);
useInventory.getState().addGold(goldReward);
// Shop appears after fights 10, 14, 18
const SHOP_LEVELS = [10, 14, 18];
const nextPhase = SHOP_LEVELS.includes(currentLevel) ? 'shop' : 'victory';
if (isPatchworkKing) {
get().addLog(createCombatLog('PATCHWORK KING: ...well fought. Contract noted.', 'info'));
}
set({
phase: nextPhase,
currentLoot: loot,
bossLevel: farmLevel !== null ? bossLevel : currentLevel + 1,
patchworkKingTurn: 0,
});
get().gainXp(xpGained);
} else if (wasDoubleReady) {
// Double action: skip enemy turn, give player another action phase
get().addLog(createCombatLog('DOUBLE ACTION -- cold efficiency!', 'info'));
setTimeout(() => {
const g = get().grid;
// Check if boss heat >= 100 -- boss movement locked
const currentBossHeat = get().bossHeat;
set({
phase: 'player_turn',
hasMoved: false,
selectedMovement: null,
selectedAction: null,
originalPosition: g.playerPosition,
doubleActionReady: false,
});
}, 300);
} else {
setTimeout(() => {
set({ phase: 'enemy_turn' });
get().enemyTurn();
}, 800);
}

}
},

enemyTurn: () => {
const { boss, grid, pendingBossAction } = get();

// ── FIRE TELEGRAPHED HEAVY ATTACK ────────────────────────────────────────
// If there was a pending heavy attack from last turn, execute it now
if (pendingBossAction) {
set({ bossChargingHeavy: false, pendingBossAction: null });
get().executeEnemyAttack(pendingBossAction);
return;
}

// ── ATTACK SELECTION: range-aware + heat-aware ───────────────────────────
// Patchwork King uses scripted phases; all others use smart selection.
const { playerHeat, patchworkKingTurn } = get();
const tileDistToPlayer = Math.abs(grid.bossPosition.row - grid.playerPosition.row)

- Math.abs(grid.bossPosition.col - grid.playerPosition.col);

let action: CombatAction;
if (boss.name === 'Patchwork King') {
const newKingTurn = patchworkKingTurn + 1;
set({ patchworkKingTurn: newKingTurn });
action = getPatchworkKingAction(newKingTurn);
// Phase transitions get an extra monologue line
if (newKingTurn === 4) get().addLog(createCombatLog(PATCHWORK_KING_MONOLOGUE[2], 'info'));
if (newKingTurn === 7) get().addLog(createCombatLog(PATCHWORK_KING_MONOLOGUE[3], 'info'));
} else {
// Use getBossAction's pool by calling it multiple times isn't ideal,
// but BOSS_ATTACKS isn't exported. Use a random sample approach instead:
// Build a representative sample of the boss's actions (call 6 times, dedupe by name)
const actionSample: CombatAction[] = [];
const seen = new Set<string>();
for (let _i = 0; _i < 12; _i++) {
const a = getBossAction(boss.name);
if (!seen.has(a.name)) { seen.add(a.name); actionSample.push(a); }
if (actionSample.length >= 6) break;
}
const allActions = actionSample.length > 0 ? actionSample : null;
// Smart selection: filter by range and heat context
const availableActions = allActions ? (() => {
// Heavy attacks: only when player heat is high (>= 55)
const heatAllowsHeavy = playerHeat >= 55;
// Range: charge/lunge when far (>= 3), sweep/melee when close (<= 1), ranged always ok
const filtered = allActions.filter((a: CombatAction) => {
if (a.isHeavy && !heatAllowsHeavy) return false;
const pat = (a as any).attackPattern;
if (!pat) return true;
if ((pat === 'charge' || pat === 'lunge') && tileDistToPlayer < 2) return false;
if ((pat === 'sweep_arc' || pat === 'melee') && tileDistToPlayer > 2) return false;
return true;
});
return filtered.length > 0 ? filtered : allActions;
})() : null;
action = availableActions
? availableActions[Math.floor(Math.random() * availableActions.length)]
: getBossAction(boss.name);
}
// Use the action's own attackPattern for range check, default melee_long
const attackPattern = (action as any).attackPattern ?? 'melee_long';

// Boss overheated: skip its movement this turn (can still attack if adjacent)
const bossIsOverheated = get().bossHeat >= 100;
if (bossIsOverheated) {
get().addLog(createCombatLog(`${boss.name}: OVERHEATED -- movement locked`, 'info'));
}

// ── ENEMY TELL - telegraph heavy attack ──────────────────────────────────
if (action.isHeavy) {
// Move toward player this turn (if not overheated), then fire heavy next turn
const newBossPos = bossIsOverheated ? null : get().getBestEnemyMove();
if (newBossPos) {
set({
grid: { ...grid, bossPosition: newBossPos },
bossChargingHeavy: true,
pendingBossAction: action,
});
} else {
set({ bossChargingHeavy: true, pendingBossAction: action });
}
// End enemy turn - player now has one turn to react
setTimeout(() => {
const currentGrid = get().grid;
const readyForDouble = get().playerHeat <= 15;
set({
phase: 'player_turn',
hasMoved: false,
selectedMovement: null,
selectedAction: null,
originalPosition: currentGrid.playerPosition,
doubleActionReady: readyForDouble,
});
}, 600);
return;
}

// ── NORMAL ATTACK ────────────────────────────────────────────────────────
if (action.type === 'defend') {
get().executeEnemyAttack(action);
return;
}

const canHit = canHitTarget(grid.bossPosition, grid.playerPosition, attackPattern, grid);
if (canHit) {
get().executeEnemyAttack(action);
return;
}

// Move toward player (blocked if overheated)
const newBossPos = bossIsOverheated ? null : get().getBestEnemyMove();
if (newBossPos &&
(newBossPos.row !== grid.bossPosition.row || newBossPos.col !== grid.bossPosition.col)) {
set({ grid: { ...grid, bossPosition: newBossPos } });
setTimeout(() => {
const updatedGrid = get().grid;
const canHitAfterMove = canHitTarget(
updatedGrid.bossPosition, updatedGrid.playerPosition, attackPattern, updatedGrid
);
if (canHitAfterMove) {
get().executeEnemyAttack(action);
} else {
setTimeout(() => {
const g = get().grid;
const readyForDouble = get().playerHeat <= 15;
set({ phase: 'player_turn', hasMoved: false, selectedMovement: null, selectedAction: null, originalPosition: g.playerPosition, doubleActionReady: readyForDouble });
}, 600);
}
}, 600);
} else {
setTimeout(() => {
const g = get().grid;
const readyForDouble = get().playerHeat <= 15;
set({ phase: 'player_turn', hasMoved: false, selectedMovement: null, selectedAction: null, originalPosition: g.playerPosition, doubleActionReady: readyForDouble });
}, 600);
}
},

getBestEnemyMove: () => {
const { grid: { playerPosition, bossPosition, rows, cols } } = get();
const offsets = [
{ row: -1, col: 0 }, { row: 1, col: 0 }, { row: 0, col: -1 }, { row: 0, col: 1 },
{ row: -1, col: -1 }, { row: -1, col: 1 }, { row: 1, col: -1 }, { row: 1, col: 1 },
];
let best: TilePosition | null = null;
let bestDist = Infinity;
for (const o of offsets) {
const np = { row: bossPosition.row + o.row, col: bossPosition.col + o.col };
if (np.row < 0 || np.row >= rows || np.col < 0 || np.col >= cols) continue;
if (np.row === playerPosition.row && np.col === playerPosition.col) continue;
if (isTileBlocked(np, get().grid)) continue;
const dist = Math.abs(np.row - playerPosition.row) + Math.abs(np.col - playerPosition.col);
if (dist < bestDist) { bestDist = dist; best = np; }
}
return best;
},

executeEnemyAttack: (action) => {
const { player, boss, playerDefenseBoost, grid, playerMalfunctioning, bossMalfunctioning } = get();
const bossAction = action || getBossAction(boss.name);

if (bossAction.type === 'defend') {
// Boss defends: apply its self-cool if specified
const bossHeatDelta = bossAction.heatGenerated ?? 0;
const newBossHeat = clampHeat(get().bossHeat + bossHeatDelta);
set({ bossDefenseBoost: bossAction.defenseBoost || 0, bossHeat: newBossHeat });
} else {
const bossTileDistance = Math.abs(grid.playerPosition.row - grid.bossPosition.row)

- Math.abs(grid.playerPosition.col - grid.bossPosition.col);

// Boss heat does NOT scale boss damage -- heat is a player-side tactic.
// Boss heat only matters for movement lock and heatTransfer to player.
const damageResult = calculateDamage(boss, player, bossAction, playerDefenseBoost, 1.0, 0, bossTileDistance, bossMalfunctioning);

// Apply split damage to player
const newPlayerHp = Math.max(0, player.currentHp - damageResult.bioDamage);
const newPlayerStructuralHp = Math.max(0, player.currentStructuralHp - damageResult.structuralDamage);
const playerBecomesMalfunctioning = player.currentStructuralHp > 0 && newPlayerStructuralHp <= 0;
const nowMalfunctioning = playerBecomesMalfunctioning || (player.currentStructuralHp <= 0);

// Boss self-heat + heat transfer to player
const bossHeatDelta = bossAction.heatGenerated ?? 15;
const newBossHeat = clampHeat(get().bossHeat + bossHeatDelta);
const playerHeatTransfer = bossAction.heatTransfer ?? 0;
const newPlayerHeat = clampHeat(get().playerHeat + playerHeatTransfer);

// Check if player heat >= 100 triggers an overheated warning
if (newPlayerHeat >= 100 && get().playerHeat < 100) {
get().addLog(createCombatLog('OVERHEATED -- movement locked next turn', 'info'));
}
// Check if double action becomes available after cooling
const newDoubleReady = newPlayerHeat <= 15;

set({
player: { ...player, currentHp: newPlayerHp, currentStructuralHp: newPlayerStructuralHp },
playerMalfunctioning: nowMalfunctioning,
playerDefenseBoost: 0,
playerHeat: newPlayerHeat,
bossHeat: newBossHeat,
doubleActionReady: newDoubleReady,
});

get().addLog(createCombatLog(`${boss.name}: ${damageResult.bioDamage} bio / ${damageResult.structuralDamage} structural`, 'damage'));

if (playerBecomesMalfunctioning) {
get().addLog(createCombatLog('MALFUNCTION', 'malfunction'));
}

if (newPlayerHp <= 0) {
const { bossLevel } = get();
const classesUnlocked = shouldUnlockClasses(bossLevel);
set({ phase: 'defeat', classLocked: false });
// Store whether classes should be offered on the defeat screen
// This is read by ClassSelector / rebirth logic
if (classesUnlocked) {
// Trigger class selection on next rebirth call
set({ introCompleted: true });
}
return;
}

}

setTimeout(() => {
const g = get().grid;
set({
phase: 'player_turn', hasMoved: false,
selectedMovement: null, selectedAction: null,
originalPosition: g.playerPosition,
bossChargingHeavy: false,
});
}, 800);
},

resetCombat: () => {
set({ phase: 'menu', combatLog: [] });
},

leaveShop: () => {
set({ phase: 'menu', currentLoot: null });
},

rebirth: (newClass) => {
const { progression, bossLevel } = get();
const newDeathCount = progression.deathCount + 1;

// Class unlock: only offer classes if player died on level 11+
const classesUnlocked = shouldUnlockClasses(bossLevel);

let finalClass: PlayerClass = 'none';
if (classesUnlocked && newClass && (newClass === 'melee' || newClass === 'ranged')) {
finalClass = newClass;
} else if (!classesUnlocked) {
finalClass = 'none';
} else {
const current = get().playerClass;
if (current === 'melee' || current === 'ranged') finalClass = current;
}

useInventory.getState().clearInventory();

const newProgression: PlayerProgression = {
level: 1,
currentXp: 0,
xpToNextLevel: getXpForLevel(2),
deathCount: newDeathCount,
};

const hasClass = finalClass === 'melee' || finalClass === 'ranged';

set({
phase: 'menu',
player: createPlayer(undefined, finalClass),
boss: createBoss(1),
combatLog: [],
playerDefenseBoost: 0, bossDefenseBoost: 0,
currentLoot: null, bossLevel: 1,
playerClass: finalClass, classLocked: false,
introCompleted: hasClass,
selectedMovement: null, selectedAction: null, hasMoved: false,
progression: newProgression,
grid: emptyGrid(),
playerHeat: 20, bossHeat: 50, doubleActionReady: false, bossChargingHeavy: false, pendingBossAction: null, playerMalfunctioning: false, bossMalfunctioning: false,
});
},

resetAll: () => {
useInventory.getState().clearInventory();
set({
phase: 'menu',
player: createPlayer(),
boss: createBoss(1),
combatLog: [],
playerDefenseBoost: 0, bossDefenseBoost: 0,
currentLoot: null, bossLevel: 1,
playerClass: 'none', classLocked: false, introCompleted: false,
selectedMovement: null, selectedAction: null, hasMoved: false,
progression: { level: 1, currentXp: 0, xpToNextLevel: getXpForLevel(2), deathCount: 0 },
grid: emptyGrid(),
playerHeat: 20, bossHeat: 50, doubleActionReady: false, bossChargingHeavy: false, pendingBossAction: null, playerMalfunctioning: false, bossMalfunctioning: false,
});
},

addLog: (log) => {
set((state) => ({ combatLog: [...state.combatLog.slice(-5), log] }));
},

toggleDebugMode: () => set((state) => ({ debugMode: !state.debugMode })),

gainXp: (xp) => {
const { progression } = get();
let newXp = progression.currentXp + xp;
let newLevel = progression.level;
let leveledUp = false;
let levelsGained = 0;
while (newXp >= getXpForLevel(newLevel + 1)) {
newXp -= getXpForLevel(newLevel + 1);
newLevel++;
leveledUp = true;
levelsGained++;
}
set({ progression: { ...progression, level: newLevel, currentXp: newXp, xpToNextLevel: getXpForLevel(newLevel + 1) } });
if (leveledUp) {
const msg = getAwarenessMessage(newLevel);
if (msg) get().addLog(createCombatLog(`SYSTEM: ${msg}`, 'info'));
// Award 1 augment tree upgrade point per level gained
useAugmentTrees.getState().addPoints(levelsGained);
}
},

getTotalSkillBonus: () => ({}),

}))
);