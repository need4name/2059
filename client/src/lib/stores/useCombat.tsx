import { create } from 'zustand';
import { persist, subscribeWithSelector } from 'zustand/middleware';
import {
Character, CombatPhase, CombatAction, CombatLog, LootDrop,
PlayerClass, CombatGrid, TilePosition, AugmentationSlot,
getHeatMultipliers, getFlankBonus,
} from '../combat/types';
import {
createPlayer, createBoss, createPatchworkKing, calculateDamage, scaleBossAction,
getBossStartingHeat, createCombatLog, CLASS_DEFINITIONS, BOSS_ATTACKS,
getPatchworkKingAction, PATCHWORK_KING_MONOLOGUE,
} from '../combat/actions';
import { generateLoot, generatePatchworkKingLoot } from '../combat/loot';
import { useInventory } from './useInventory';
import { useLoadout } from './useLoadout';
import { useAudio } from './useAudio';
import { canHitTarget } from '../combat/patterns';
import {
generateBattlefield, emptyGrid, getReachableTiles, stepTowardAttackPosition,
hazardDamageAt, chebyshev, tileAt,
} from '../combat/grid';
import { PlayerProgression, getXpForLevel, getXpFromBoss, getAwarenessMessage } from '../combat/skills';
import { useAugmentTrees } from './useAugmentTrees';

// Fights after which the Arms Market opens
export const SHOP_LEVELS = [10, 14, 18];
// Dying on this level or higher (while unclassified) unlocks class choice for good
export const CLASS_UNLOCK_LEVEL = 11;

// Pacing (ms)
const ENEMY_TURN_DELAY = 700;
const ENEMY_STEP_DELAY = 550;
const TURN_HANDOFF_DELAY = 600;

export interface VictorySummary {
gold: number;
xp: number;
levelsGained: number;
pointsGained: number;
}

interface CombatState {
phase: CombatPhase;
player: Character;
boss: Character;
combatLog: CombatLog[];
playerDefenseBoost: number;
bossDefenseBoost: number;
currentLoot: LootDrop | null;
lastVictory: VictorySummary | null;
pendingShop: boolean;
bossLevel: number;
farmLevel: number | null;
playerClass: PlayerClass;
classesUnlocked: boolean;
introCompleted: boolean;
grid: CombatGrid;
debugMode: boolean;
progression: PlayerProgression;
originalPosition: TilePosition | null;
selectedMovement: TilePosition | null;
selectedAction: CombatAction | null;
hasMoved: boolean;
playerMoveRange: number;

// Turn control: fightId changes whenever a fight starts or ends so stale timers
// can tell they belong to a finished fight; inputLocked blocks repeat input
// while an action resolves.
fightId: number;
inputLocked: boolean;

// Heat system
playerHeat: number;
bossHeat: number;
doubleActionReady: boolean;
bossChargingHeavy: boolean;
pendingBossAction: CombatAction | null;

// Structural / malfunction
playerMalfunctioning: boolean;
bossMalfunctioning: boolean;

// Consumable effects
overclockActive: boolean;
kizunaJustFired: boolean;

// Patchwork King scripted fight
patchworkKingTurn: number;

setPlayerClass: (playerClass: PlayerClass) => void;
startCombat: () => void;
startFarmCombat: (level: number) => void;
executePlayerTurn: () => void;
moveTentatively: (position: TilePosition) => void;
undoMove: () => void;
setSelectedMovement: (position: TilePosition | null) => void;
setSelectedAction: (action: CombatAction | null) => void;
endTurn: () => void;
useConsumableItem: (itemId: string) => void;
enemyTurn: () => void;
executeEnemyAttack: (action: CombatAction) => void;
resetCombat: () => void;
resetAll: () => void;
rebirth: (newClass?: PlayerClass) => void;
continueFromVictory: () => void;
leaveShop: () => void;
completeIntro: () => void;
addLog: (log: CombatLog) => void;
toggleDebugMode: () => void;
gainXp: (xp: number) => { levelsGained: number };
}

// Fallback for bosses whose moves can't reach an adjacent player
const CLOSE_QUARTERS: CombatAction = {
type: 'attack', name: 'Close-Quarters Strike', description: '', damage: 12,
accuracy: 'variable', physicalRatio: 0.7, heatTransfer: 3, heatGenerated: 6, attackPattern: 'melee',
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function clampHeat(h: number) { return Math.max(0, Math.min(100, h)); }
const isFightPhase = (p: CombatPhase) => p === 'player_turn' || p === 'enemy_turn';

function equippedSlotList(): AugmentationSlot[] {
const eq = useInventory.getState().equippedAugmentations;
return (Object.keys(eq) as AugmentationSlot[]).filter(s => eq[s] !== null);
}

function buildPlayer(playerClass: PlayerClass) {
const augBonuses = useInventory.getState().getTotalAugmentationBonuses();
const treeBonus = useAugmentTrees.getState().getTreeStatBonuses(equippedSlotList());
const player = createPlayer({
...augBonuses,
treeAttack: treeBonus.attack,
treeDefense: treeBonus.defense,
treeHp: treeBonus.hp,
}, playerClass);
return { player, moveRange: 1 + (treeBonus.moveRange ?? 0) };
}

function freshFightState(grid: CombatGrid) {
return {
combatLog: [] as CombatLog[],
playerDefenseBoost: 0, bossDefenseBoost: 0,
currentLoot: null, lastVictory: null, pendingShop: false,
introCompleted: true,
selectedMovement: null, selectedAction: null, hasMoved: false,
originalPosition: { ...grid.playerPosition },
inputLocked: false,
playerHeat: 20, doubleActionReady: false, bossChargingHeavy: false, pendingBossAction: null,
playerMalfunctioning: false, bossMalfunctioning: false,
overclockActive: false, kizunaJustFired: false, patchworkKingTurn: 0,
};
}

const initialProgression = (): PlayerProgression => ({
level: 1, currentXp: 0, xpToNextLevel: getXpForLevel(2), deathCount: 0,
});

// ── Store ─────────────────────────────────────────────────────────────────────

export const useCombat = create<CombatState>()(
subscribeWithSelector(persist((set, get) => {

// Runs fn after ms, but only if the same fight is still in progress.
const later = (fn: () => void, ms: number) => {
const id = get().fightId;
setTimeout(() => {
const s = get();
if (s.fightId !== id || !isFightPhase(s.phase)) return;
fn();
}, ms);
};

const log = (message: string, type: CombatLog['type'] = 'info') => get().addLog(createCombatLog(message, type));

const beginPlayerTurn = () => {
const { grid, playerHeat } = get();
set({
phase: 'player_turn', inputLocked: false, hasMoved: false,
selectedMovement: null, selectedAction: null,
originalPosition: { ...grid.playerPosition },
doubleActionReady: playerHeat <= 15,
});
};

const handlePlayerDefeated = () => {
const { bossLevel, playerClass, classesUnlocked } = get();
const unlockNow = !classesUnlocked && playerClass === 'none' && bossLevel >= CLASS_UNLOCK_LEVEL;
set({
phase: 'defeat', inputLocked: true, fightId: get().fightId + 1,
classesUnlocked: classesUnlocked || unlockNow,
});
};

const handleBossDefeated = () => {
const { farmLevel, bossLevel } = get();
const level = farmLevel ?? bossLevel;
const isKing = level === 10 && farmLevel === null;
const loot = isKing ? generatePatchworkKingLoot() : generateLoot(level);
// Loot goes straight into the inventory so no screen can lose it
useInventory.getState().addItems(loot.items);
useInventory.getState().addGold(loot.gold);
const xp = getXpFromBoss(level);
if (isKing) log('PATCHWORK KING: ...well fought. Contract noted.');
set({
phase: 'victory', inputLocked: true, fightId: get().fightId + 1,
currentLoot: loot,
pendingShop: farmLevel === null && SHOP_LEVELS.includes(level),
bossLevel: farmLevel !== null ? bossLevel : level + 1,
patchworkKingTurn: 0, bossChargingHeavy: false, pendingBossAction: null,
});
const { levelsGained } = get().gainXp(xp);
set({ lastVictory: { gold: loot.gold, xp, levelsGained, pointsGained: levelsGained } });
useAudio.getState().playSuccess();
};

// Damage from the tile a combatant ends its turn on. Returns true if it was fatal.
const applyHazard = (who: 'player' | 'boss'): boolean => {
const { grid, player, boss } = get();
const pos = who === 'player' ? grid.playerPosition : grid.bossPosition;
const dmg = hazardDamageAt(pos, grid);
if (dmg <= 0) return false;
const name = tileAt(pos, grid)?.name ?? 'Hazard';
if (who === 'player') {
const hp = Math.max(0, player.currentHp - dmg);
set({ player: { ...player, currentHp: hp } });
log(`${name}: -${dmg} HP`, 'damage');
if (hp <= 0) { handlePlayerDefeated(); return true; }
} else {
const hp = Math.max(0, boss.currentHp - dmg);
set({ boss: { ...boss, currentHp: hp } });
log(`${boss.name} burns on ${name}: -${dmg}`, 'damage');
if (hp <= 0) { handleBossDefeated(); return true; }
}
return false;
};

// After the player's action resolves: hazard tick, then either a bonus
// action (double action) or the enemy's turn.
const finishPlayerAction = (allowDouble: boolean) => {
if (applyHazard('player')) return;
if (allowDouble && get().doubleActionReady) {
log('DOUBLE ACTION -- cold efficiency!');
set({ doubleActionReady: false });
later(() => {
const g = get().grid;
set({ inputLocked: false, hasMoved: false, selectedMovement: null, selectedAction: null, originalPosition: { ...g.playerPosition } });
}, 300);
return;
}
set({ phase: 'enemy_turn', selectedAction: null, selectedMovement: null, doubleActionReady: false });
later(() => get().enemyTurn(), ENEMY_TURN_DELAY);
};

const finishEnemyTurn = (delay = TURN_HANDOFF_DELAY) => {
later(() => {
if (applyHazard('boss')) return;
beginPlayerTurn();
}, delay);
};

// Boss chooses its next action from its roster, filtered by range and heat.
const chooseBossAction = (): CombatAction => {
const { boss, grid, playerHeat, patchworkKingTurn } = get();
if (boss.name === 'Patchwork King') {
const turn = patchworkKingTurn + 1;
set({ patchworkKingTurn: turn });
if (turn === 4) log(PATCHWORK_KING_MONOLOGUE[2]);
if (turn === 7) log(PATCHWORK_KING_MONOLOGUE[3]);
return getPatchworkKingAction(turn);
}
const roster = BOSS_ATTACKS[boss.name] ?? [];
const dist = chebyshev(grid.bossPosition, grid.playerPosition);
const filtered = roster.filter(a => {
// Heavy attacks punish a player who runs hot
if (a.isHeavy && playerHeat < 45) return false;
// Shields only come out when the boss is hurt, and not every time
if (a.type === 'defend' && (boss.currentHp > boss.maxHp * 0.5 || Math.random() > 0.35)) return false;
const pat = a.attackPattern;
if (!pat) return true;
if ((pat === 'charge' || pat === 'lunge') && dist < 2) return false;
if ((pat === 'sweep_arc' || pat === 'melee') && dist > 2) return false;
return true;
});
let pool = filtered.length ? filtered : roster.filter(a => a.type === 'attack');
// Point blank with nothing that reaches: lash out instead of backing away
if (dist <= 1 && !pool.some(a => a.type === 'defend' || a.isHeavy || canHitTarget(grid.bossPosition, grid.playerPosition, a.attackPattern ?? 'melee_long', grid))) {
pool = [CLOSE_QUARTERS];
}
return pool[Math.floor(Math.random() * pool.length)];
};

const moveBossToward = (pattern: CombatAction['attackPattern']): boolean => {
if (get().bossHeat >= 100) {
log(`${get().boss.name}: OVERHEATED -- movement locked`);
return false;
}
const step = stepTowardAttackPosition(get().grid, pattern ?? 'melee_long');
if (!step) return false;
set({ grid: { ...get().grid, bossPosition: step } });
return true;
};

const startFight = (level: number, farm: boolean) => {
const { playerClass } = get();
const { player, moveRange } = buildPlayer(playerClass);
const isKing = !farm && level === 10;
const base = createBoss(level);
const boss = isKing ? createPatchworkKing() : base;
const grid = generateBattlefield(level);
set({
...freshFightState(grid),
phase: 'player_turn', player, boss, grid,
playerMoveRange: moveRange,
farmLevel: farm ? level : null,
bossHeat: getBossStartingHeat(base.name),
fightId: get().fightId + 1,
combatLog: isKing
? PATCHWORK_KING_MONOLOGUE.slice(0, 2).map((line, i) => ({ ...createCombatLog(line, 'info'), id: `king_intro_${i}` }))
: [],
});
};

return {
phase: 'menu',
player: createPlayer(),
boss: createBoss(1),
combatLog: [],
playerDefenseBoost: 0,
bossDefenseBoost: 0,
currentLoot: null,
lastVictory: null,
pendingShop: false,
bossLevel: 1,
farmLevel: null,
playerClass: 'none',
classesUnlocked: false,
introCompleted: false,
debugMode: false,
originalPosition: null,
selectedMovement: null,
selectedAction: null,
hasMoved: false,
playerMoveRange: 1,
fightId: 0,
inputLocked: false,
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
progression: initialProgression(),
grid: emptyGrid(),

setPlayerClass: (playerClass) => {
if (get().classesUnlocked) set({ playerClass });
},

startCombat: () => startFight(get().bossLevel, false),
startFarmCombat: (level) => startFight(level, true),

setSelectedMovement: (pos) => set({ selectedMovement: pos }),
setSelectedAction: (action) => {
const { phase, inputLocked } = get();
if (phase !== 'player_turn' || inputLocked) return;
set({ selectedAction: action });
},

moveTentatively: (position) => {
const { phase, inputLocked, grid, originalPosition, playerHeat, playerMoveRange } = get();
if (phase !== 'player_turn' || inputLocked || !originalPosition) return;
// Tapping your starting tile undoes a move
if (position.row === originalPosition.row && position.col === originalPosition.col) {
get().undoMove();
return;
}
if (playerHeat >= 100) {
log('OVERHEATED -- movement locked');
return;
}
const reachable = getReachableTiles(originalPosition, { ...grid, playerPosition: originalPosition }, playerMoveRange);
if (!reachable.has(`${position.row},${position.col}`)) return;
set({ grid: { ...grid, playerPosition: position }, selectedMovement: position, hasMoved: true });
},

undoMove: () => {
const { originalPosition, grid, phase, inputLocked } = get();
if (!originalPosition || phase !== 'player_turn' || inputLocked) return;
set({ grid: { ...grid, playerPosition: originalPosition }, selectedMovement: null, hasMoved: false });
},

endTurn: () => {
const { selectedAction, phase, inputLocked } = get();
if (phase !== 'player_turn' || inputLocked) return;
if (!selectedAction) {
set({ inputLocked: true });
log('-- PASS --');
finishPlayerAction(false);
return;
}
get().executePlayerTurn();
},

useConsumableItem: (itemId) => {
const { phase, inputLocked, player } = get();
if (phase !== 'player_turn' || inputLocked) return;
const consumable = useInventory.getState().useConsumable(itemId);
if (!consumable) return;

const effect = consumable.consumableEffect;
const updatedPlayer = { ...player };
let newHeat = get().playerHeat;
let overclock = false;
let msg = '';

if (effect === 'bio_stim') {
const heal = Math.floor(player.maxHp * 0.60);
updatedPlayer.currentHp = Math.min(player.maxHp, player.currentHp + heal);
msg = `BIO-STIM -- +${heal} HP`;
} else if (effect === 'structural_patch') {
const repair = Math.floor(player.maxStructuralHp * 0.60);
updatedPlayer.currentStructuralHp = Math.min(player.maxStructuralHp, player.currentStructuralHp + repair);
msg = `STRUCTURAL PATCH -- +${repair} structural HP`;
} else if (effect === 'heat_flush') {
newHeat = 0;
msg = 'HEAT FLUSH -- thermal systems purged to zero';
} else if (effect === 'overclock') {
overclock = true;
msg = 'OVERCLOCK -- next attack is guaranteed critical';
} else {
const heal = consumable.hpBonus || 0;
updatedPlayer.currentHp = Math.min(player.maxHp, player.currentHp + heal);
newHeat = clampHeat(newHeat - 10);
msg = `STIM -- +${heal} HP`;
}
log(msg, effect === 'bio_stim' ? 'heal' : 'info');

set({
player: updatedPlayer,
playerMalfunctioning: updatedPlayer.currentStructuralHp <= 0,
selectedAction: null, selectedMovement: null,
playerHeat: newHeat,
overclockActive: overclock || get().overclockActive,
});
// Overclock doesn't use up your turn; other stims do.
if (!overclock) {
set({ inputLocked: true });
finishPlayerAction(false);
}
},

executePlayerTurn: () => {
const { player, boss, bossDefenseBoost, grid, playerClass, selectedAction, playerHeat, playerMalfunctioning, phase, inputLocked } = get();
if (!selectedAction || phase !== 'player_turn' || inputLocked) return;
const action = selectedAction;

// ── BRACE ────────────────────────────────────────────────────────────────
if (action.type === 'brace' || action.type === 'defend') {
set({ inputLocked: true });
const newHeat = clampHeat(playerHeat + (action.heatGenerated ?? -25));
const wasMalfunctioning = player.currentStructuralHp <= 0;
const newStructuralHp = Math.min(player.maxStructuralHp, player.currentStructuralHp + 35);
set({
player: { ...player, currentStructuralHp: newStructuralHp },
playerDefenseBoost: action.defenseBoost || 8,
playerMalfunctioning: newStructuralHp <= 0,
selectedAction: null,
playerHeat: newHeat,
});
if (wasMalfunctioning && newStructuralHp > 0) log('STRUCTURAL INTEGRITY RESTORED -- system nominal');
log(`${action.name.toUpperCase()} -- guard up`);
finishPlayerAction(false);
return;
}

// ── ATTACK / SPECIAL ─────────────────────────────────────────────────────
const attackPattern = action.attackPattern
?? (action.type === 'special' ? (CLASS_DEFINITIONS[playerClass]?.specialAbility?.attackPattern || 'ranged') : 'melee_long');
const ignoresRange = action.ignoreRange || (action.type === 'special' && CLASS_DEFINITIONS[playerClass]?.specialAbility?.ignoreRange);
if (!ignoresRange && !canHitTarget(grid.playerPosition, grid.bossPosition, attackPattern, grid)) {
log('Out of range! Move closer.');
return;
}
set({ inputLocked: true });

const heatMult = getHeatMultipliers(playerHeat);
const flankBonus = getFlankBonus(grid.playerPosition, grid.bossPosition);
const tileDistance = chebyshev(grid.playerPosition, grid.bossPosition);

// Kizuna cold-start: first strike at cool heat fires as 'precise'
const kizunaFiredNow = !!player.hasKizuna && playerHeat <= 20 && !get().kizunaJustFired;
const { overclockActive } = get();
let finalAction = kizunaFiredNow ? { ...action, accuracy: 'precise' as const } : action;
if (overclockActive) finalAction = { ...finalAction, accuracy: 'precise' as const };
const dmg = calculateDamage(
player, boss, finalAction, bossDefenseBoost,
overclockActive ? 2.0 : heatMult.dealt,
flankBonus, tileDistance, playerMalfunctioning,
overclockActive ? 100 : playerHeat,
player.bypassStructuralDefense ?? false,
);
if (kizunaFiredNow) log('KIZUNA ACTIVE -- cold-start precision lock');
if (playerMalfunctioning) log('MALFUNCTION', 'malfunction');

const newBossHp = Math.max(0, boss.currentHp - dmg.bioDamage);
const newBossStructuralHp = Math.max(0, boss.currentStructuralHp - dmg.structuralDamage);
const bossBecomesMalfunctioning = boss.currentStructuralHp > 0 && newBossStructuralHp <= 0;

const adjacentHeat = tileDistance === 1 ? 2 : 0;
const newHeat = clampHeat(playerHeat + (action.heatGenerated ?? 15) + adjacentHeat);
const bossHeatDelta = action.heatTransfer ?? 0;
const newBossHeat = clampHeat(get().bossHeat + bossHeatDelta);

const updatedPlayer = { ...player };
if (action.healing && action.healing > 0) {
updatedPlayer.currentHp = Math.min(player.maxHp, player.currentHp + action.healing);
}

set({
player: updatedPlayer,
boss: { ...boss, currentHp: newBossHp, currentStructuralHp: newBossStructuralHp },
bossMalfunctioning: newBossStructuralHp <= 0,
bossDefenseBoost: 0,
playerDefenseBoost: action.defenseBoost && action.defenseBoost > 0 ? action.defenseBoost : 0,
overclockActive: false,
kizunaJustFired: kizunaFiredNow || get().kizunaJustFired,
selectedAction: null,
playerHeat: newHeat,
bossHeat: newBossHeat,
});
useAudio.getState().playHit();

if (bossBecomesMalfunctioning) log(`${boss.name}: MALFUNCTION`, 'malfunction');
if (bossHeatDelta !== 0) log(`${boss.name} heat: ${bossHeatDelta > 0 ? '+' : ''}${bossHeatDelta} (${newBossHeat})`);
log(`${dmg.isCrit ? 'CRITICAL! ' : ''}Dealt ${dmg.bioDamage} bio / ${dmg.structuralDamage} structural${dmg.isFlank ? ' [FLANK]' : ''}`, dmg.isCrit ? 'critical' : 'damage');

if (newBossHp <= 0) {
handleBossDefeated();
return;
}
finishPlayerAction(true);
},

enemyTurn: () => {
const { pendingBossAction, boss } = get();

// ── FIRE TELEGRAPHED HEAVY ATTACK ──────────────────────────────────────
// It lands only if the player is still in its pattern; stepping out dodges it.
if (pendingBossAction) {
set({ bossChargingHeavy: false, pendingBossAction: null });
const g = get().grid;
if (canHitTarget(g.bossPosition, g.playerPosition, pendingBossAction.attackPattern ?? 'melee_long', g)) {
get().executeEnemyAttack(pendingBossAction);
} else {
log(`${boss.name}'s ${pendingBossAction.name} misses -- you evaded`);
finishEnemyTurn();
}
return;
}

const action = chooseBossAction();

if (action.type === 'defend') {
get().executeEnemyAttack(action);
return;
}

// ── TELEGRAPH HEAVY ATTACK ─────────────────────────────────────────────
// Move into a firing position this turn, fire next turn.
if (action.isHeavy) {
moveBossToward(action.attackPattern);
set({ bossChargingHeavy: true, pendingBossAction: action });
log(`${boss.name} is charging ${action.name.toUpperCase()}!`, 'critical');
finishEnemyTurn();
return;
}

// ── NORMAL ATTACK ──────────────────────────────────────────────────────
const pattern = action.attackPattern ?? 'melee_long';
const hits = () => { const g = get().grid; return canHitTarget(g.bossPosition, g.playerPosition, pattern, g); };
if (hits()) {
get().executeEnemyAttack(action);
return;
}
if (moveBossToward(pattern)) {
later(() => {
if (hits()) get().executeEnemyAttack(action);
else finishEnemyTurn(0);
}, ENEMY_STEP_DELAY);
} else {
finishEnemyTurn();
}
},

executeEnemyAttack: (bossAction) => {
const { player, boss, playerDefenseBoost, grid, bossMalfunctioning } = get();

if (bossAction.type === 'defend') {
set({
bossDefenseBoost: bossAction.defenseBoost || 0,
bossHeat: clampHeat(get().bossHeat + (bossAction.heatGenerated ?? 0)),
});
log(`${boss.name}: ${bossAction.name.toUpperCase()} -- guard up`);
finishEnemyTurn();
return;
}

// Boss heat does NOT scale boss damage -- heat is a player-side tactic.
const level = get().farmLevel ?? get().bossLevel;
const dmg = calculateDamage(boss, player, scaleBossAction(bossAction, level), playerDefenseBoost, 1.0, 0, chebyshev(grid.playerPosition, grid.bossPosition), bossMalfunctioning);
const newPlayerHp = Math.max(0, player.currentHp - dmg.bioDamage);
const newPlayerStructuralHp = Math.max(0, player.currentStructuralHp - dmg.structuralDamage);
const playerBecomesMalfunctioning = player.currentStructuralHp > 0 && newPlayerStructuralHp <= 0;

const newBossHeat = clampHeat(get().bossHeat + (bossAction.heatGenerated ?? 15));
const newPlayerHeat = clampHeat(get().playerHeat + (bossAction.heatTransfer ?? 0));
if (newPlayerHeat >= 100 && get().playerHeat < 100) log('OVERHEATED -- movement locked next turn');

set({
player: { ...player, currentHp: newPlayerHp, currentStructuralHp: newPlayerStructuralHp },
playerMalfunctioning: newPlayerStructuralHp <= 0,
playerDefenseBoost: 0,
playerHeat: newPlayerHeat,
bossHeat: newBossHeat,
});
useAudio.getState().playHit();

log(`${boss.name} -- ${bossAction.name}: ${dmg.bioDamage} bio / ${dmg.structuralDamage} structural`, 'damage');
if (playerBecomesMalfunctioning) log('MALFUNCTION', 'malfunction');

if (newPlayerHp <= 0) {
handlePlayerDefeated();
return;
}
finishEnemyTurn(800);
},

resetCombat: () => {
// Abandoning a fight: bump fightId so pending timers can't drag you back in
set({ phase: 'menu', combatLog: [], inputLocked: false, fightId: get().fightId + 1, bossChargingHeavy: false, pendingBossAction: null });
},

continueFromVictory: () => {
set({ phase: get().pendingShop ? 'shop' : 'menu', pendingShop: false, currentLoot: null });
},

leaveShop: () => {
set({ phase: 'menu', currentLoot: null });
},

completeIntro: () => set({ introCompleted: true }),

rebirth: (newClass) => {
const { progression, classesUnlocked, playerClass } = get();
const finalClass: PlayerClass = classesUnlocked
? (newClass && newClass !== 'none' ? newClass : (playerClass !== 'none' ? playerClass : 'melee'))
: 'none';

// A new body: implants, credits, weapons, loadout and upgrade trees all start fresh.
useInventory.getState().clearInventory();
useLoadout.getState().resetLoadout();
useAugmentTrees.getState().resetTrees();

set({
phase: 'menu',
player: createPlayer(undefined, finalClass),
boss: createBoss(1),
combatLog: [],
playerDefenseBoost: 0, bossDefenseBoost: 0,
currentLoot: null, lastVictory: null, pendingShop: false, bossLevel: 1, farmLevel: null,
playerClass: finalClass,
introCompleted: true,
selectedMovement: null, selectedAction: null, hasMoved: false, inputLocked: false,
progression: { ...initialProgression(), deathCount: progression.deathCount + 1 },
grid: emptyGrid(),
fightId: get().fightId + 1,
playerHeat: 20, bossHeat: 50, doubleActionReady: false, bossChargingHeavy: false, pendingBossAction: null,
playerMalfunctioning: false, bossMalfunctioning: false,
});
},

resetAll: () => {
useInventory.getState().clearInventory();
useLoadout.getState().resetLoadout();
useAugmentTrees.getState().resetTrees();
set({
phase: 'menu',
player: createPlayer(),
boss: createBoss(1),
combatLog: [],
playerDefenseBoost: 0, bossDefenseBoost: 0,
currentLoot: null, lastVictory: null, pendingShop: false, bossLevel: 1, farmLevel: null,
playerClass: 'none', classesUnlocked: false, introCompleted: false,
selectedMovement: null, selectedAction: null, hasMoved: false, inputLocked: false,
progression: initialProgression(),
grid: emptyGrid(),
fightId: get().fightId + 1,
playerHeat: 20, bossHeat: 50, doubleActionReady: false, bossChargingHeavy: false, pendingBossAction: null,
playerMalfunctioning: false, bossMalfunctioning: false,
});
},

addLog: (entry) => {
set((state) => ({ combatLog: [...state.combatLog.slice(-7), entry] }));
},

toggleDebugMode: () => set((state) => ({ debugMode: !state.debugMode })),

gainXp: (xp) => {
const { progression } = get();
let newXp = progression.currentXp + xp;
let newLevel = progression.level;
let levelsGained = 0;
while (newXp >= getXpForLevel(newLevel + 1)) {
newXp -= getXpForLevel(newLevel + 1);
newLevel++;
levelsGained++;
}
set({ progression: { ...progression, level: newLevel, currentXp: newXp, xpToNextLevel: getXpForLevel(newLevel + 1) } });
if (levelsGained > 0) {
const msg = getAwarenessMessage(newLevel);
if (msg) log(`SYSTEM: ${msg}`);
// 1 augment tree upgrade point per level gained
useAugmentTrees.getState().addPoints(levelsGained);
}
return { levelsGained };
},
};
}, {
name: '2059-combat',
version: 1,
// Only between-fight progress is saved. Reloading mid-fight returns you to base.
partialize: (s) => ({
phase: isFightPhase(s.phase) ? 'menu' : s.phase,
boss: s.boss,
currentLoot: s.currentLoot,
lastVictory: s.lastVictory,
pendingShop: s.pendingShop,
bossLevel: s.bossLevel,
playerClass: s.playerClass,
classesUnlocked: s.classesUnlocked,
introCompleted: s.introCompleted,
progression: s.progression,
}),
}))
);
