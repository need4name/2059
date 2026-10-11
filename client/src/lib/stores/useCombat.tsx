import { create } from 'zustand';
import { persist, createJSONStorage, subscribeWithSelector } from 'zustand/middleware';
import { saveStorage } from '../save';
import {
Character, CombatPhase, CombatAction, CombatLog, LootDrop,
PlayerClass, CombatGrid, TilePosition, AugmentationSlot,
} from '../combat/types';
import {
createPlayer, createBoss, createPatchworkKing,
getBossStartingHeat, createCombatLog, PATCHWORK_KING_MONOLOGUE,
} from '../combat/actions';
import { generateLoot, generatePatchworkKingLoot } from '../combat/loot';
import { useInventory } from './useInventory';
import { useLoadout } from './useLoadout';
import { useAudio } from './useAudio';
import { generateBattlefield, emptyGrid, getReachableTiles } from '../combat/grid';
import { PlayerProgression, getXpForLevel, getXpFromBoss, getAwarenessMessage } from '../combat/skills';
import { useAugmentTrees } from './useAugmentTrees';

import { seedRandom, mixSeed, newRunSeed } from '../engine/rng';
import * as Fight from '../engine/fight';
import type { FightState, Step } from '../engine/fight';
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

interface CombatState extends FightState {
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
/** Seed for this host's run; every fight is seeded from it and its fight number. */
runSeed: number;
fightsStarted: number;
/** Start a new run on a chosen seed (for replaying a bug or a shared challenge). */
setRunSeed: (seed: number) => void;
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
openMarket: () => void;
completeIntro: () => void;
addLog: (log: CombatLog) => void;
toggleDebugMode: () => void;
gainXp: (xp: number) => { levelsGained: number };
}

// ── Helpers ───────────────────────────────────────────────────────────────────

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
return { player, moveRange: Fight.PLAYER_BASE_MOVE + (treeBonus.moveRange ?? 0) };
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

// The fight's rules state, as the engine sees it
const fightState = (): FightState => {
const s = get();
return {
player: s.player, boss: s.boss, grid: s.grid,
playerHeat: s.playerHeat, bossHeat: s.bossHeat,
playerDefenseBoost: s.playerDefenseBoost, bossDefenseBoost: s.bossDefenseBoost,
playerMalfunctioning: s.playerMalfunctioning, bossMalfunctioning: s.bossMalfunctioning,
overclockActive: s.overclockActive, kizunaJustFired: s.kizunaJustFired,
bossChargingHeavy: s.bossChargingHeavy, pendingBossAction: s.pendingBossAction,
patchworkKingTurn: s.patchworkKingTurn, doubleActionReady: s.doubleActionReady,
};
};

// Apply an engine step: save its state, write its log lines, play its sounds.
// Returns true if someone went down (and handles the fight ending).
const apply = (step: Step): boolean => {
set(step.state);
for (const e of step.events) {
if (e.kind === 'log') log(e.message, e.type);
else if (e.kind === 'hit') useAudio.getState().playHit();
}
if (step.events.some(e => e.kind === 'playerDown')) { handlePlayerDefeated(); return true; }
if (step.events.some(e => e.kind === 'bossDown')) { handleBossDefeated(); return true; }
return false;
};

const beginPlayerTurn = () => {
const { grid } = get();
set({
...Fight.startPlayerTurn(fightState()),
phase: 'player_turn', inputLocked: false, hasMoved: false,
selectedMovement: null, selectedAction: null,
originalPosition: { ...grid.playerPosition },
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
const firstRun = get().progression.deathCount === 0 && farmLevel === null;
const loot = isKing ? generatePatchworkKingLoot() : generateLoot(level, firstRun);
// Loot goes straight into the inventory so no screen can lose it
useInventory.getState().addItems(loot.items);
useInventory.getState().addGold(loot.gold);
const xp = getXpFromBoss(level);
if (isKing) log('PATCHWORK KING: ...well fought. Contract noted.');
set({
phase: 'victory', inputLocked: true, fightId: get().fightId + 1,
currentLoot: loot,
pendingShop: false,
bossLevel: farmLevel !== null ? bossLevel : level + 1,
patchworkKingTurn: 0, bossChargingHeavy: false, pendingBossAction: null,
});
const { levelsGained } = get().gainXp(xp);
// A point for every new threat cleared, on top of the level-up points
const winPoint = farmLevel === null ? 1 : 0;
if (winPoint) useAugmentTrees.getState().addPoints(winPoint);
set({ lastVictory: { gold: loot.gold, xp, levelsGained, pointsGained: levelsGained + winPoint } });
useAudio.getState().playSuccess();
};

const applyHazard = (who: 'player' | 'boss'): boolean => apply(Fight.applyHazard(fightState(), who));

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

const startFight = (level: number, farm: boolean) => {
const { playerClass, runSeed, fightsStarted } = get();
// Same run seed + same fight number = same arena, rolls and loot
seedRandom(mixSeed(runSeed, fightsStarted));
set({ fightsStarted: fightsStarted + 1 });
const { player, moveRange } = buildPlayer(playerClass);
const isKing = !farm && level === 10;
const base = createBoss(level, !farm && get().progression.deathCount === 0);
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
runSeed: newRunSeed(),
fightsStarted: 0,
setRunSeed: (seed) => set({ runSeed: seed >>> 0, fightsStarted: 0 }),
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
const { phase, inputLocked } = get();
if (phase !== 'player_turn' || inputLocked) return;
const consumable = useInventory.getState().useConsumable(itemId);
if (!consumable) return;

const step = Fight.resolveConsumable(fightState(), consumable);
apply(step);
set({ selectedAction: null, selectedMovement: null });
// Overclock doesn't use up your turn; other stims do.
if (step.endsTurn) {
set({ inputLocked: true });
finishPlayerAction(false);
}
},

executePlayerTurn: () => {
const { playerClass, selectedAction, phase, inputLocked } = get();
if (!selectedAction || phase !== 'player_turn' || inputLocked) return;
const action = selectedAction;

if (action.type === 'brace' || action.type === 'defend') {
set({ inputLocked: true, selectedAction: null });
apply(Fight.resolveBrace(fightState(), action));
finishPlayerAction(false);
return;
}

if (!Fight.canPlayerHit(fightState(), action, playerClass)) {
log('Out of range! Move closer.');
return;
}
set({ inputLocked: true, selectedAction: null });
if (apply(Fight.resolvePlayerAttack(fightState(), action))) return;
finishPlayerAction(true);
},

enemyTurn: () => {
// A wound-up heavy fires now; it lands only if you're still in its shape
if (get().pendingBossAction) {
const step = Fight.releaseHeavy(fightState());
apply(step);
if (step.connects && step.action) get().executeEnemyAttack(step.action);
else finishEnemyTurn();
return;
}

const choice = Fight.chooseBossAction(fightState());
apply(choice);
const action = choice.action;

if (action.type === 'defend') {
get().executeEnemyAttack(action);
return;
}
if (action.isHeavy) {
apply(Fight.telegraphHeavy(fightState(), action));
finishEnemyTurn();
return;
}
if (Fight.canBossHit(fightState(), action.attackPattern)) {
get().executeEnemyAttack(action);
return;
}
const walk = Fight.moveBossToward(fightState(), action.attackPattern);
apply(walk);
if (walk.moved) {
later(() => {
if (Fight.canBossHit(fightState(), action.attackPattern)) get().executeEnemyAttack(action);
else finishEnemyTurn(0);
}, ENEMY_STEP_DELAY);
} else {
finishEnemyTurn();
}
},

executeEnemyAttack: (bossAction) => {
const level = get().farmLevel ?? get().bossLevel;
if (apply(Fight.resolveBossAction(fightState(), bossAction, level))) return;
finishEnemyTurn(bossAction.type === 'defend' ? undefined : 800);
},

resetCombat: () => {
// Abandoning a fight: bump fightId so pending timers can't drag you back in
set({ phase: 'menu', combatLog: [], inputLocked: false, fightId: get().fightId + 1, bossChargingHeavy: false, pendingBossAction: null });
},

continueFromVictory: () => {
set({ phase: 'menu', pendingShop: false, currentLoot: null });
},

leaveShop: () => {
set({ phase: 'menu', currentLoot: null });
},

openMarket: () => {
if (get().phase === 'menu') set({ phase: 'shop' });
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
runSeed: newRunSeed(), fightsStarted: 0,
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
runSeed: newRunSeed(), fightsStarted: 0,
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
name: '2059-combat', storage: createJSONStorage(() => saveStorage),
version: 1,
// Only between-fight progress is saved. Reloading mid-fight returns you to base.
partialize: (s) => ({
phase: isFightPhase(s.phase) ? 'menu' : s.phase,
boss: s.boss,
currentLoot: s.currentLoot,
lastVictory: s.lastVictory,
pendingShop: s.pendingShop,
bossLevel: s.bossLevel,
runSeed: s.runSeed,
fightsStarted: s.fightsStarted,
playerClass: s.playerClass,
classesUnlocked: s.classesUnlocked,
introCompleted: s.introCompleted,
progression: s.progression,
}),
}))
);
