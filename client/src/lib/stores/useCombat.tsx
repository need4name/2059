import { create } from 'zustand';
import { persist, createJSONStorage, subscribeWithSelector } from 'zustand/middleware';
import { saveStorage } from '../save';
import {
Character, CombatPhase, CombatAction, CombatLog, LootDrop, Item,
PlayerClass, CombatGrid, TilePosition, AugmentationSlot,
} from '../combat/types';
import {
createPlayer, createBoss, createPatchworkKing,
getBossStartingHeat, createCombatLog, PATCHWORK_KING_MONOLOGUE, enemyNamesNear,
} from '../combat/actions';
import { generateLoot, generatePatchworkKingLoot } from '../combat/loot';
import { useInventory } from './useInventory';
import { useLoadout } from './useLoadout';
import { useAudio } from './useAudio';
import { generateBattlefield, emptyGrid, getReachableTiles, spawnFoePositions } from '../combat/grid';
import { PlayerProgression, getXpForLevel, getXpFromBoss, getAwarenessMessage } from '../combat/skills';
import { useAugmentTrees } from './useAugmentTrees';

import { random, seedRandom, mixSeed, newRunSeed } from '../engine/rng';
import * as Fight from '../engine/fight';
import type { FightState, Step } from '../engine/fight';
import { usePlayi } from './usePlayi';
import { NO_PERKS } from '../engine/playi';
import { instancedItem, ITEM_POOLS } from '../combat/loot';
import { ITEMS_2059 } from '../combat/items2059';
import { ACTIVE_SLOTS } from '../combat/types';
// Dying on this level or higher (while unclassified) unlocks class choice for good
export const CLASS_UNLOCK_LEVEL = 11;

// Pacing (ms)
const ENEMY_TURN_DELAY = 700;
const ENEMY_STEP_DELAY = 550;
const TURN_HANDOFF_DELAY = 600;
const FOE_GAP_DELAY = 450;

export interface VictorySummary {
gold: number;
xp: number;
levelsGained: number;
pointsGained: number;
}

interface CombatState extends FightState {
phase: CombatPhase;
player: Character;
/** The enemy screens name (the one you're aiming at, or the last one standing). */
boss: Character;
combatLog: CombatLog[];
playerDefenseBoost: number;
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
doubleActionReady: boolean;

// Structural / malfunction
playerMalfunctioning: boolean;

// Consumable effects
overclockActive: boolean;
kizunaJustFired: boolean;

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
/** Aim at a different enemy. */
setTarget: (index: number) => void;
/** Reflex loop: after attacking without moving, you may still step 1 tile. */
reflexMoveOpen: boolean;
/** Holdfast has saved this host already. */
holdfastSpent: boolean;
/** Pick of the wreck: implant drops waiting for the player to choose 1 of 2. */
lootChoices: { options: [Item, Item]; picked: number | null }[];
chooseLoot: (choice: number, option: number) => void;
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
const perks = usePlayi.getState().perks();
const raw = useInventory.getState().getTotalAugmentationBonuses();
const augBonuses = { ...raw, hp: raw.hp + perks.maxHpBonus, structure: Math.round(raw.structure * perks.structureMult), hpCost: Math.round(raw.hpCost * perks.healthCostMult) };
const treeBonus = useAugmentTrees.getState().getTreeStatBonuses(equippedSlotList());
const player = createPlayer({
...augBonuses,
treeAttack: treeBonus.attack,
treeDefense: treeBonus.defense,
treeHp: treeBonus.hp,
}, playerClass);
return { player, moveRange: Fight.PLAYER_BASE_MOVE + perks.moveBonus + (treeBonus.moveRange ?? 0), perks };
}

function freshFightState(grid: CombatGrid) {
return {
combatLog: [] as CombatLog[],
playerDefenseBoost: 0,
currentLoot: null, lastVictory: null, pendingShop: false,
introCompleted: true,
selectedMovement: null, selectedAction: null, hasMoved: false,
originalPosition: { ...grid.playerPosition },
inputLocked: false,
playerHeat: 20, doubleActionReady: false,
playerMalfunctioning: false,
overclockActive: false, kizunaJustFired: false,
};
}

// How many enemies a level throws at you, and how much each is scaled down.
// Random for now (seeded); the story will set these later.
const GROUP_SCALE: Record<number, { hp: number; atk: number }> = { 1: { hp: 1, atk: 1 }, 2: { hp: 0.6, atk: 0.7 }, 3: { hp: 0.45, atk: 0.55 } };

function planFoes(level: number, firstRun: boolean, farm: boolean): Character[] {
if (!farm && level === 10) return [createPatchworkKing()];
const lead = createBoss(level, firstRun && !farm);
// Set pieces fight alone: the first fight, elites and bosses, the first-life Enforcer
if (level === 1 || level % 5 === 0 || lead.name === 'Cartel Enforcer') return [lead];
const r = random();
const count = r < 0.5 ? 1 : r < 0.85 ? 2 : 3;
if (count === 1) return [lead];
const names = enemyNamesNear(level);
const scale = GROUP_SCALE[count];
const group = [lead, ...Array.from({ length: count - 1 }, () => createBoss(level, false, names[Math.floor(random() * names.length)]))];
return group.map((u, k) => {
const hp = Math.max(10, Math.round(u.maxHp * scale.hp));
return { ...u, id: `foe_${k}`, maxHp: hp, currentHp: hp,
physicalAttack: Math.round(u.physicalAttack * scale.atk), structuralAttack: Math.round(u.structuralAttack * scale.atk) };
});
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
player: s.player, foes: s.foes, target: s.target, grid: s.grid,
playerHeat: s.playerHeat, playerDefenseBoost: s.playerDefenseBoost,
playerMalfunctioning: s.playerMalfunctioning,
overclockActive: s.overclockActive, kizunaJustFired: s.kizunaJustFired,
doubleActionReady: s.doubleActionReady,
perks: s.perks, firstStrikeUsed: s.firstStrikeUsed, sidestepReady: s.sidestepReady, holdfastReady: s.holdfastReady,
};
};

// Save an engine state, keeping the grid's enemy position on the current target
// (older screen code still reads it) and the headline enemy up to date.
const save = (state: FightState) => {
const target = state.foes[state.target] ?? state.foes[0];
set({
...state,
grid: target ? { ...state.grid, bossPosition: target.pos, occupied: state.foes.filter(f => f !== target && Fight.isAlive(f)).map(f => f.pos) } : state.grid,
...(target ? { boss: target.unit } : {}),
});
};

// Apply an engine step: save its state, write its log lines, play its sounds.
// Returns true if the fight ended (and handles the ending).
const apply = (step: Step): boolean => {
save(step.state);
for (const e of step.events) {
if (e.kind === 'log') log(e.message, e.type);
else if (e.kind === 'hit') useAudio.getState().playHit();
else if (e.kind === 'holdfast') set({ holdfastSpent: true });
}
if (step.events.some(e => e.kind === 'playerDown')) { handlePlayerDefeated(); return true; }
if (step.events.some(e => e.kind === 'allFoesDown')) { handleBossDefeated(); return true; }
return false;
};

const beginPlayerTurn = () => {
const { grid } = get();
save(Fight.startPlayerTurn(fightState()));
set({
phase: 'player_turn', inputLocked: false, hasMoved: false,
selectedMovement: null, selectedAction: null,
originalPosition: { ...grid.playerPosition },
});
};

const handlePlayerDefeated = () => {
const { bossLevel, playerClass, classesUnlocked, runSeed, progression } = get();
// The signal learns something from every lost host: deal two cards to choose from
seedRandom(mixSeed(runSeed, 0x5eed, progression.deathCount));
usePlayi.getState().makeOffer(false);
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
// Pick of the wreck: each implant drop comes with a second option of the same rarity
const choices: { options: [Item, Item]; picked: number | null }[] = [];
let direct = loot.items;
if (usePlayi.getState().perks().pickOfTwo) {
direct = [];
for (const it of loot.items) {
const pool = it.type === 'augmentation' ? ITEM_POOLS[it.rarity].filter(o => o.id !== it.templateId) : [];
if (!pool.length) { direct.push(it); continue; }
choices.push({ options: [it, instancedItem(pool[Math.floor(random() * pool.length)])], picked: null });
}
}
// Loot goes straight into the inventory so no screen can lose it
useInventory.getState().addItems(direct);
set({ lootChoices: choices });
useInventory.getState().addGold(loot.gold);
const xp = getXpFromBoss(level);
if (isKing) log('PATCHWORK KING: ...well fought. Contract noted.');
set({
phase: 'victory', inputLocked: true, fightId: get().fightId + 1,
currentLoot: loot,
pendingShop: false,
bossLevel: farmLevel !== null ? bossLevel : level + 1,
});
const { levelsGained } = get().gainXp(xp);
// A point for every new threat cleared, on top of the level-up points
const winPoint = farmLevel === null ? 1 : 0;
if (winPoint) useAugmentTrees.getState().addPoints(winPoint);
set({ lastVictory: { gold: loot.gold, xp, levelsGained, pointsGained: levelsGained + winPoint } });
useAudio.getState().playSuccess();
};



// After the player's action resolves: hazard tick, then either a bonus
// action (double action) or the enemy's turn.
const finishPlayerAction = (allowDouble: boolean) => {
set({ reflexMoveOpen: false });
if (apply(Fight.applyPlayerHazard(fightState()))) return;
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

// Each living enemy takes its turn in order, then the player's turn begins.
const runFoeTurn = (i: number) => {
const s = get();
if (i >= s.foes.length) { beginPlayerTurn(); return; }
if (!Fight.isAlive(s.foes[i])) { runFoeTurn(i + 1); return; }
const level = s.farmLevel ?? s.bossLevel;
const step = Fight.foeTurn(fightState(), i, level);
if (apply(step)) return;
const done = () => {
if (apply(Fight.applyFoeHazard(fightState(), i))) return;
later(() => runFoeTurn(i + 1), i + 1 < get().foes.length ? FOE_GAP_DELAY : TURN_HANDOFF_DELAY);
};
if (step.strikeAfterMove) {
const strike = step.strikeAfterMove;
later(() => { if (apply(Fight.foeStrikeAfterMove(fightState(), i, strike, level))) return; done(); }, ENEMY_STEP_DELAY);
} else done();
};

// What the play-i tree gives every new host before its first fight
const giveNewHostPerks = (seed: number) => {
const perks = usePlayi.getState().perks();
const gifts = [];
seedRandom(mixSeed(seed, 0x6157));
if (perks.startImplant) {
const pool = ITEM_POOLS.common.filter(i => i.slot && ACTIVE_SLOTS.includes(i.slot) && (!i.condition || i.condition === 'pristine'));
if (pool.length) gifts.push(instancedItem(pool[Math.floor(random() * pool.length)]));
}
const bio = ITEMS_2059.find(i => i.id === 'stim_bio');
for (let k = 0; k < perks.startBioStims && bio; k++) gifts.push(instancedItem(bio));
if (gifts.length) useInventory.getState().addItems(gifts);
if (perks.startPoints) useAugmentTrees.getState().addPoints(perks.startPoints);
};

const startFight = (level: number, farm: boolean) => {
const { playerClass, runSeed, fightsStarted } = get();
// Same run seed + same fight number = same arena, rolls and loot
seedRandom(mixSeed(runSeed, fightsStarted));
set({ fightsStarted: fightsStarted + 1 });
const { player, moveRange, perks } = buildPlayer(playerClass);
const isKing = !farm && level === 10;
const units = planFoes(level, !farm && get().progression.deathCount === 0, farm);
const grid = generateBattlefield(level);
const spots = spawnFoePositions(grid, units.length);
const foes = units.slice(0, spots.length).map((u, k) => Fight.newFoe(u, spots[k], getBossStartingHeat(u.name)));
set({
...freshFightState(grid),
playerHeat: perks.startHeat,
perks, firstStrikeUsed: false, sidestepReady: perks.sidestep, holdfastReady: perks.holdfast && !get().holdfastSpent,
reflexMoveOpen: false,
phase: 'player_turn', player, grid,
playerMoveRange: moveRange,
farmLevel: farm ? level : null,
fightId: get().fightId + 1,
combatLog: isKing
? PATCHWORK_KING_MONOLOGUE.slice(0, 2).map((line, i) => ({ ...createCombatLog(line, 'info'), id: `king_intro_${i}` }))
: foes.length > 1 ? [{ ...createCombatLog(`${foes.length} enemies on the field. Tap one to aim at it.`, 'info'), id: 'group_intro' }] : [],
});
save({ ...fightState(), foes, target: 0 });
};

return {
phase: 'menu',
player: createPlayer(),
boss: createBoss(1),
foes: [],
target: 0,
...Fight.BASE_FIGHT_FLAGS,
reflexMoveOpen: false,
holdfastSpent: false,
lootChoices: [],
combatLog: [],
playerDefenseBoost: 0,
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
doubleActionReady: false,
playerMalfunctioning: false,
overclockActive: false,
kizunaJustFired: false,
progression: initialProgression(),
grid: emptyGrid(),

setPlayerClass: (playerClass) => {
if (get().classesUnlocked) set({ playerClass });
},

startCombat: () => startFight(get().bossLevel, false),
startFarmCombat: (level) => startFight(level, true),

setSelectedMovement: (pos) => set({ selectedMovement: pos }),
setSelectedAction: (action) => {
const { phase, inputLocked, reflexMoveOpen } = get();
if (phase !== 'player_turn' || inputLocked || reflexMoveOpen) return;
set({ selectedAction: action });
},

moveTentatively: (position) => {
const { phase, inputLocked, grid, originalPosition, playerHeat, playerMoveRange } = get();
if (phase !== 'player_turn' || inputLocked || !originalPosition) return;
// Tapping your starting tile undoes a move
if (!get().reflexMoveOpen && position.row === originalPosition.row && position.col === originalPosition.col) {
get().undoMove();
return;
}
if (playerHeat >= 100 && !get().perks.runaway) {
log('OVERHEATED -- movement locked');
return;
}
const reflex = get().reflexMoveOpen;
const from = reflex ? grid.playerPosition : originalPosition;
const reachable = getReachableTiles(from, { ...grid, playerPosition: from }, reflex ? 1 : playerMoveRange, get().perks.phaseStep);
if (!reachable.has(`${position.row},${position.col}`)) return;
set({ grid: { ...grid, playerPosition: position }, selectedMovement: position, hasMoved: true });
if (reflex) { set({ inputLocked: true }); finishPlayerAction(true); }
},

undoMove: () => {
const { originalPosition, grid, phase, inputLocked } = get();
if (!originalPosition || phase !== 'player_turn' || inputLocked) return;
set({ grid: { ...grid, playerPosition: originalPosition }, selectedMovement: null, hasMoved: false });
},

endTurn: () => {
const { selectedAction, phase, inputLocked } = get();
if (phase !== 'player_turn' || inputLocked) return;
if (get().reflexMoveOpen) { set({ inputLocked: true }); finishPlayerAction(true); return; }
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
const step = Fight.resolvePlayerAttack(fightState(), action, playerClass);
if (apply(step)) return;
// Chain: a takedown gives you another action straight away
if (step.events.some(e => e.kind === 'extraAction')) {
later(() => { const g = get().grid; set({ inputLocked: false, hasMoved: false, selectedMovement: null, selectedAction: null, originalPosition: { ...g.playerPosition } }); }, 300);
return;
}
// Reflex loop: attacked without moving? Step one tile, or pass
if (get().perks.reflexMove && !get().hasMoved) {
log('REFLEX LOOP -- step 1 tile, or pass');
set({ reflexMoveOpen: true, inputLocked: false });
return;
}
finishPlayerAction(true);
},

enemyTurn: () => runFoeTurn(0),

setTarget: (index) => {
const { phase, inputLocked } = get();
if (phase !== 'player_turn' || inputLocked) return;
save(Fight.setTarget(fightState(), index));
},

resetCombat: () => {
// Abandoning a fight: bump fightId so pending timers can't drag you back in
set({ phase: 'menu', combatLog: [], inputLocked: false, fightId: get().fightId + 1, foes: [] });
},

chooseLoot: (choice, option) => {
const list = get().lootChoices;
const c = list[choice];
if (!c || c.picked !== null) return;
useInventory.getState().addItems([c.options[option]]);
set({ lootChoices: list.map((x, k) => (k === choice ? { ...x, picked: option } : x)) });
},

continueFromVictory: () => {
// Nothing is lost: an unanswered choice keeps its first option
get().lootChoices.forEach((c, k) => { if (c.picked === null) get().chooseLoot(k, 0); });
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
const { progression, classesUnlocked, playerClass, runSeed: lastSeed } = get();
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
playerDefenseBoost: 0,
currentLoot: null, lastVictory: null, pendingShop: false, bossLevel: 1, farmLevel: null,
playerClass: finalClass,
introCompleted: true,
selectedMovement: null, selectedAction: null, hasMoved: false, inputLocked: false,
progression: { ...initialProgression(), deathCount: progression.deathCount + 1 },
runSeed: newRunSeed(), fightsStarted: 0,
grid: emptyGrid(),
fightId: get().fightId + 1,
playerHeat: 20, doubleActionReady: false, foes: [], target: 0,
playerMalfunctioning: false,
holdfastSpent: false,
});
// Seeded from the host that just died, so a replayed run gets the same gifts
giveNewHostPerks(mixSeed(lastSeed, progression.deathCount + 1));
},

resetAll: () => {
usePlayi.getState().reset();
useInventory.getState().clearInventory();
useLoadout.getState().resetLoadout();
useAugmentTrees.getState().resetTrees();
set({
phase: 'menu',
player: createPlayer(),
boss: createBoss(1),
combatLog: [],
playerDefenseBoost: 0,
currentLoot: null, lastVictory: null, pendingShop: false, bossLevel: 1, farmLevel: null,
playerClass: 'none', classesUnlocked: false, introCompleted: false,
selectedMovement: null, selectedAction: null, hasMoved: false, inputLocked: false,
progression: initialProgression(),
runSeed: newRunSeed(), fightsStarted: 0,
grid: emptyGrid(),
fightId: get().fightId + 1,
playerHeat: 20, doubleActionReady: false, foes: [], target: 0,
playerMalfunctioning: false,
holdfastSpent: false,
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
lootChoices: s.lootChoices,
holdfastSpent: s.holdfastSpent,
runSeed: s.runSeed,
fightsStarted: s.fightsStarted,
playerClass: s.playerClass,
classesUnlocked: s.classesUnlocked,
introCompleted: s.introCompleted,
progression: s.progression,
}),
}))
);
