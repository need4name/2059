import { create } from 'zustand';
import { persist, createJSONStorage, subscribeWithSelector } from 'zustand/middleware';
import { saveStorage } from '../save';
import {
Character, CombatPhase, CombatAction, CombatLog, LootDrop, Item,
PlayerClass, CombatGrid, TilePosition, AugmentationSlot, AUGMENTATION_SLOTS,
} from '../combat/types';
import {
CLASS_DEFINITIONS, createPlayer, createBoss, createPatchworkKing, createEcho, createSetPiece, ECHO_NAME,
getBossStartingHeat, createCombatLog, PATCHWORK_KING_MONOLOGUE, enemyNamesNear, enemyLines, isNotable, ORDINARY_LINE_CHANCE,
} from '../combat/actions';
import { generateLoot, generatePatchworkKingLoot } from '../combat/loot';
import { scrapValue } from '../combat/economy';
import { useInventory } from './useInventory';
import { useLoadout } from './useLoadout';
import { useAudio } from './useAudio';
import type { Sfx } from '../audio/sfx';
import { generateBattlefield, buildArena, emptyGrid, getPlayerReach, spawnFoePositions, allySpawnPositions } from '../combat/grid';
import { useAllies, partyForFight } from './useAllies';
import { nextChapter, activeChapter } from '../combat/chapters';
import { withLinks, allyDef, storySoFar } from '../combat/allies';
import { useJournal } from './useJournal';
import { useMap } from './useMap';
import { roomById, isChapterEnd, hasFight, healthNow, hurtAfterWin } from '../engine/map';
import { withTreePerks } from '../engine/upgrades';
import { PlayerProgression, getXpForLevel, getXpFromBoss, getAwarenessMessage } from '../combat/skills';
import { useAugmentTrees } from './useAugmentTrees';

import { random, seedRandom, mixSeed, newRunSeed, hashSeed } from '../engine/rng';
import * as Fight from '../engine/fight';
import type { FightState, Step } from '../engine/fight';
import { usePlayi } from './usePlayi';
import { NO_PERKS } from '../engine/playi';
import { instancedItem, ITEM_POOLS } from '../combat/loot';
import { ITEMS_2059 } from '../combat/items2059';
import { ACTIVE_SLOTS } from '../combat/types';
import { powerOf } from '../combat/augments';
import { eventHere, partToGive, cantChoose, gradeUp } from '../engine/events';
import { useStrain } from './useStrain';
import { useFirmware } from './useFirmware';
import { useRunStats } from './useRunStats';
import { tally, type Doer } from '../engine/runStats';
import { withClass, withSplice, firmwareXpFor, levelStep, firmwarePassives, TWIN_HEAT, opensAt } from '../engine/firmware';
import { firstLifeAt } from '../daily';
import { strainUnit, strainHeat, strainCredits, strainPicks } from '../engine/strain';
// Dying on this level or higher (while unclassified) unlocks class choice for good
export const CLASS_UNLOCK_LEVEL = 11;
/** Enemies beaten (by every host together) before a death opens the Enforcer. */
export const ENFORCER_KILLS = 5;

// Pacing (ms)
const ENEMY_TURN_DELAY = 700;
const ENEMY_STEP_DELAY = 550;
const TURN_HANDOFF_DELAY = 600;
const FOE_GAP_DELAY = 450;

export interface Strip { bodies: { name: string; color: string; items: Item[] }[]; picks: number; taken: string[] }

export interface VictorySummary {
gold: number;
xp: number;
levelsGained: number;
pointsGained: number;
/** The level the loaded firmware reached in this fight, if it went up. */
firmwareUp?: number | null;
/** Firmware this win opened. */
firmwareFound?: PlayerClass[];
/** Party members that went up a level. */
allyLevelUps: string[];
/** This win finished the chapter (first time only). */
chapterDone?: boolean;
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
/** Firmware the last death opened (for the "New" tag on the defeat screen; not saved). */
justOpened: PlayerClass[];
introCompleted: boolean;
grid: CombatGrid;
debugMode: boolean;
progression: PlayerProgression;
originalPosition: TilePosition | null;
selectedMovement: TilePosition | null;
selectedAction: CombatAction | null;
/** Where the selected attack is aimed. Everyone on the tiles it lands on is hit. */
aim: TilePosition | null;
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
/** Signal Surge: spend a full overload meter (see the engine). */
surge: () => void;
/** Rewrite the room's order in force (once a fight, in chapters with orders). */
rewriteOrder: (id: Fight.OrderId) => void;
/** The deepest threat this host has beaten (points come from beating deeper ones). */
hostBestThreat: number;
/** The enemy taking its turn right now (for the turn-order strip), or null. */
actingFoe: number | null;
/** The turn clock (see Fight.Clock): when each body next acts. Faster bodies come round more often. */
clock: Fight.Clock;
/** Whoever is mid-turn (their turn is spent on the clock when the next one starts). */
acting: Fight.Actor | null;
/** The player hasn't had a turn yet this fight (the opening turn skips cooling). */
openingTurn: boolean;
/** Rounds started this fight. */
round: number;
/** Search the room's supply cache: a stim or some credits, once per host. Returns what was found. */
openRoomCache: () => string | null;
/** Take choice k of the event in this room. Returns what happened, or null if it can't be taken. */
chooseEvent: (k: number) => string | null;
/** Fight whatever holds the room you're standing in on the hidden map. */
startRoomFight: () => void;
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
/** Aim the selected attack at a tile. Returns false if it can't be aimed there. */
setAim: (tile: TilePosition) => boolean;
/** Reflex loop: after attacking without moving, you may still step 1 tile. */
reflexMoveOpen: boolean;
/** The second action of a cool turn: act again from where you stand (no second move). */
moveSpent: boolean;
/** Holdfast has saved this host already. */
holdfastSpent: boolean;
/** Pick of the wreck: implant drops waiting for the player to choose 1 of 2. */
/** After a win: the beaten enemies' implants, to strip for parts. You keep `picks` of them; the rest are scrapped. */
strip: Strip | null;
/** Take one implant off a body (while picks are left). */
takePart: (itemId: string) => void;
/** What the enemy said when it saw you, and what the signal noticed (shown at the start of a fight). */
fightIntro: { speaker: string; color: string; line: string | null; note: string | null } | null;
dismissIntro: () => void;
/** Which ally the next grid tap moves (null: taps move the player). */
allyMoveMode: number | null;
/** The ally whose turn it is (the action bar shows its moves), or null. */
allyTurn: number | null;
/** Where that ally stood when its turn began: its move can be changed until it acts or the turn ends. */
allyOrigin: TilePosition | null;
toggleAllyMove: (ally: number) => void;
moveAlly: (pos: TilePosition) => void;
allyAct: (ally: number, move: number) => void;
resetCombat: () => void;
resetAll: () => void;
/** A new host wakes with this firmware, at the entry or a server reached before (`at`). */
rebirth: (newClass?: PlayerClass, at?: string) => void;
/** The chapter is done: wake in a new body at the next chapter's entry (allies, the play-i tree and ally implants come too). */
goToNextChapter: () => void;
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
// The play-i tree's perks plus what the allies riding with this host bring
const linked = withLinks(usePlayi.getState().perks(), useAllies.getState().party);
// The loaded firmware may act twice in a turn (Courier: while cool, then always)
const fw = firmwarePassives(playerClass, useFirmware.getState().level(playerClass));
const twinned = fw.twin ? { ...linked, doubleActionHeat: Math.max(linked.doubleActionHeat, TWIN_HEAT[fw.twin]) } : linked;
// What the fitted implants' slot upgrades add (cooler head, filtered nose, steadier spine...)
// The firmware's class rules (Enforcer chains takedowns, Operative acts twice cool, ...), then the slot upgrades
const classed = withTreePerks(withClass(twinned, playerClass, useFirmware.getState().level(playerClass)), useAugmentTrees.getState().getTreePerks(equippedSlotList()));
// Splice: each spliced pair runs the host hotter and thins its structure
const pairs = playerClass === 'splice' ? Object.values(useInventory.getState().spliced ?? {}).filter(Boolean).length : 0;
const perks = withSplice(classed, pairs);
const raw = useInventory.getState().getTotalAugmentationBonuses();
// Events can cost max health for the rest of this host's life (the scar)
const augBonuses = { ...raw, hp: raw.hp + perks.maxHpBonus, structure: Math.round(raw.structure * perks.structureMult), hpCost: Math.round(raw.hpCost * perks.healthCostMult) + (useMap.getState().scar ?? 0) };
const treeBonus = useAugmentTrees.getState().getTreeStatBonuses(equippedSlotList());
const player = createPlayer({
...augBonuses,
evasion: augBonuses.evasion + treeBonus.evasion,
treeAttack: treeBonus.attack,
treeDefense: treeBonus.defense,
treeHp: treeBonus.hp,
}, playerClass);
return { player, moveRange: Fight.moveReach(perks.moveBonus + (treeBonus.moveRange ?? 0)), perks };
}

function freshFightState(grid: CombatGrid) {
return {
combatLog: [] as CombatLog[],
playerDefenseBoost: 0,
currentLoot: null, lastVictory: null, pendingShop: false,
introCompleted: true,
selectedMovement: null, selectedAction: null, aim: null, hasMoved: false, moveSpent: false,
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

function planFoes(level: number, firstRun: boolean, farm: boolean, roomEnemy?: string): Character[] {
// Threat 10 is the chapter's set piece: the Patchwork King, or the Echo wearing your last body's implants
if (!farm && level === 10) {
const piece = activeChapter().cast.setPiece;
return [piece === ECHO_NAME ? createEcho(usePlayi.getState().lastBody) : piece === 'Patchwork King' ? createPatchworkKing() : createSetPiece(piece)];
}
// A room can name who holds it (regular fights only; the first-life Enforcer always comes first)
const named = roomEnemy && level % 5 !== 0 && !(firstRun && level === 3) ? roomEnemy : undefined;
const lead = createBoss(level, firstRun && !farm, named);
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

/** Who the next applied step belongs to, for the run's numbers (reset after each step). */
let doer: Doer = { kind: 'other' };

/** A fight whose first turn waits for its opening line to be dismissed. */
let heldStart: { fightId: number; begin: () => void } | null = null;

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
allies: s.allies, mark: s.mark, allyHitFoes: s.allyHitFoes, allyGuard: s.allyGuard,
playerBurning: s.playerBurning, playerStunned: s.playerStunned, overload: s.overload,
playerSwimming: s.playerSwimming, playerBleeding: s.playerBleeding, noParting: s.noParting,
playerSlowed: s.playerSlowed, playerHasted: s.playerHasted, playerDrive: s.playerDrive, tide: s.tide, alarm: s.alarm, flinchUsed: s.flinchUsed, wind: s.wind, orders: s.orders,
};
};

// Save an engine state, keeping the grid's enemy position on the current target
// (older screen code still reads it) and the headline enemy up to date.
const save = (state: FightState) => {
const target = state.foes[state.target] ?? state.foes[0];
set({
...state,
grid: target ? { ...state.grid, bossPosition: target.pos, occupied: [...state.foes.filter(f => f !== target && Fight.isAlive(f)).map(f => f.pos), ...state.allies.filter(Fight.allyAlive).map(a => a.pos)] } : state.grid,
...(target ? { boss: target.unit } : {}),
});
};

// Point the selected attack at whatever it hits best from where the player now stands
const reAim = () => {
const { selectedAction, playerClass } = get();
const attacking = selectedAction && (selectedAction.type === 'attack' || selectedAction.type === 'special');
set({ aim: attacking ? Fight.bestAim(fightState(), selectedAction, playerClass) : null });
};

// Engine events that make a sound
const CUE: Partial<Record<Fight.FightEvent['kind'], Sfx>> = {
hit: 'hit', collide: 'collide', burn: 'burn', telegraph: 'telegraph', surge: 'surge',
foeDown: 'foeDown', allyDown: 'allyDown', extraAction: 'chain', playerDown: 'defeat',
};

// Apply an engine step: save its state, write its log lines, play its sounds.
// Returns true if the fight ended (and handles the ending).
const apply = (step: Step): boolean => {
// The Self page's numbers: what changed, credited to whoever acted (engine/runStats.ts)
const before = fightState();
save(step.state);
useRunStats.getState().add(tally(before, step.state, doer, step.events));
doer = { kind: 'other' };
for (const e of step.events) {
if (e.kind === 'log') log(e.message, e.type);
else if (e.kind === 'holdfast') set({ holdfastSpent: true });
else if (e.kind in CUE) useAudio.getState().play(CUE[e.kind]!);
}
if (step.events.some(e => e.kind === 'playerDown')) { handlePlayerDefeated(); return true; }
if (step.events.some(e => e.kind === 'allFoesDown')) { handleBossDefeated(); return true; }
return false;
};

const beginPlayerTurn = () => {
save(Fight.startPlayerTurn(fightState()));
// Burning ticks now; a stun costs the whole turn
set({ actingFoe: null });
const cond = Fight.playerConditions(fightState());
if (apply(cond)) return;
// A host with a sleeper inside may flinch (chapters with dreamers only, so other chapters' rolls stay the same)
if (!cond.skipTurn && activeChapter().rules?.flinch && apply(Fight.dreamerFlinch(fightState()))) return;
const { grid } = get();
set({
phase: 'player_turn', inputLocked: cond.skipTurn, hasMoved: false, moveSpent: false, allyMoveMode: null, allyTurn: null,
selectedMovement: null, selectedAction: null,
originalPosition: { ...grid.playerPosition },
});
if (cond.skipTurn) later(() => finishPlayerAction(false), TURN_HANDOFF_DELAY);
};

const handlePlayerDefeated = () => {
const { bossLevel, classesUnlocked, runSeed, progression } = get();
// The signal learns something from every lost host: deal two cards to choose from
seedRandom(mixSeed(runSeed, 0x5eed, progression.deathCount));
usePlayi.getState().makeOffer(useAllies.getState().unlocked().length > 0);
// Firmware opened by this death: Enforcer once hosts have beaten enough enemies, Operative (and Enforcer) deep enough
const before = availableFirmware();
if (useRunStats.getState().total.enemiesKilled >= ENFORCER_KILLS) useFirmware.getState().open('melee');
const unlockNow = !classesUnlocked && bossLevel >= CLASS_UNLOCK_LEVEL;
set({ classesUnlocked: classesUnlocked || unlockNow });
set({
phase: 'defeat', inputLocked: true, fightId: get().fightId + 1,
justOpened: availableFirmware().filter(c => !before.includes(c)),
});
};

const handleBossDefeated = () => {
const { farmLevel, bossLevel, player } = get();
// The host keeps its wounds into the next fight, less a breath caught after winning
if (farmLevel === null) { useMap.getState().setHurt(hurtAfterWin(player.currentHp, player.maxHp)); useMap.getState().setOverload(get().overload); }
const level = farmLevel ?? bossLevel;
const isKing = level === 10 && farmLevel === null && activeChapter().cast.setPiece === 'Patchwork King';
const firstRun = get().progression.deathCount === 0 && farmLevel === null;
const loot = isKing ? generatePatchworkKingLoot() : generateLoot(level, firstRun);
// A boss's own implant is marked with its threat: it sells for a little less than calling the boss back
const bossRoom = farmLevel === null && !!roomById(useMap.getState().room).server;
const mark = (it: Item) => (bossRoom && it.signature ? { ...it, bossThreat: level } : it);
const direct = loot.items.map(mark);
// Strip the bodies: every beaten enemy's implants, to choose from (two picks with Pick of the wreck)
const bodies = get().foes.map(f => ({ name: f.unit.name, color: f.unit.spriteColor, items: (f.unit.carried ?? []).map(mark) })).filter(b => b.items.length);
const strip: Strip | null = bodies.length ? { bodies, picks: (usePlayi.getState().perks().pickOfTwo ? 2 : 1) + strainPicks(useStrain.getState().active), taken: [] } : null;
// The room on the hidden map is clear for this host; the last room ends the chapter
const chapterDone = farmLevel === null && isChapterEnd(useMap.getState());
if (farmLevel === null) useMap.getState().clearRoom();
if (chapterDone) { useMap.getState().finishChapter(); useStrain.getState().unlock(); }
// Loot goes straight into the inventory so no screen can lose it
useInventory.getState().addItems(direct);
set({ strip });
const earned = strainCredits(loot.gold, useStrain.getState().active);
useInventory.getState().addGold(earned);
useRunStats.getState().add({ fightsWon: 1, credits: earned, ...(farmLevel === null && (level % 10 === 0) ? { bossesKilled: 1 } : farmLevel === null && level % 5 === 0 ? { elitesKilled: 1 } : {}) });
const xp = getXpFromBoss(level);
// Allies: the party learns from every win
const allies = useAllies.getState();
const allyLevelUps = allies.gainXp(Math.round(get().perks.allyXpMult));
// A level can bring out a line of an ally's story: it goes into the journal
for (const id of allyLevelUps) {
const def = allyDef(id), lv = useAllies.getState().progress(id).level;
if (def) storySoFar(def, lv).forEach((line, k) => useJournal.getState().addNote(`ally:${id}:${k}`, line, def.name, get().progression.deathCount + 1));
}
if (isKing) log('PATCHWORK KING: ...well fought. Contract noted.');
set({
phase: 'victory', inputLocked: true, fightId: get().fightId + 1,
currentLoot: loot,
pendingShop: false,
bossLevel: farmLevel !== null ? bossLevel : level + 1,
});
const { levelsGained } = get().gainXp(xp);
// Upgrade points come from wins: one for every WINS_PER_POINT fights won (engine/upgrades.ts)
// Going deep opens new firmware (Courier at 15, Foreman at 20): a won room fight at that threat or deeper
const firmwareFound = farmLevel === null ? opensAt(level, useFirmware.getState().opened) : [];
for (const cls of firmwareFound) { useFirmware.getState().open(cls); log(`NEW FIRMWARE -- ${CLASS_DEFINITIONS[cls].name}`, 'critical'); }
// The loaded firmware learns from every room fight won (elites and bosses teach it more)
const firmwareUp = farmLevel === null ? useFirmware.getState().gain(get().playerClass, firmwareXpFor(level)) : null;
if (firmwareUp) log(`FIRMWARE -- level ${firmwareUp}: ${levelStep(get().playerClass, firmwareUp)?.text ?? ''}`);
const pointsBefore = useAugmentTrees.getState().availablePoints;
if (farmLevel === null) { useAugmentTrees.getState().winFight(); set({ hostBestThreat: Math.max(get().hostBestThreat, level) }); }
const pointsGained = useAugmentTrees.getState().availablePoints - pointsBefore;
set({ lastVictory: { gold: loot.gold, xp, levelsGained, pointsGained, allyLevelUps, chapterDone, firmwareUp, firmwareFound } });
useAudio.getState().playSuccess();
};



// After the player's action resolves: hazard tick, then either a bonus
// action (double action) or the enemy's turn.
const finishPlayerAction = (allowDouble: boolean) => {
set({ reflexMoveOpen: false });
// Walking away from an enemy you started beside: it gets a parting blow
const from = get().originalPosition;
if (from && apply(Fight.partingBlows(fightState(), from, get().farmLevel ?? get().bossLevel))) return;
if (apply(Fight.applyPlayerHazard(fightState()))) return;
if (allowDouble && get().doubleActionReady) {
log('Running cool: one more action, from where you stand');
set({ doubleActionReady: false });
later(() => {
const g = get().grid;
// The move is spent: the second action is taken from here
set({ inputLocked: false, hasMoved: false, moveSpent: true, selectedMovement: null, selectedAction: null, originalPosition: { ...g.playerPosition } });
}, 300);
return;
}
// The wind pushes everyone as your turn ends (the red zone already showed where it leaves you)
if (apply(Fight.windTick(fightState()))) return;
set({ phase: 'enemy_turn', selectedAction: null, selectedMovement: null, doubleActionReady: false, moveSpent: false });
later(nextActor, ENEMY_TURN_DELAY);
};

// A new round of clock time: tides, alarms and orders tick; Slowed and Hasted count down
const beginRound = () => {
// The tide turns at the start of a round (boards with mud flats only)
if (apply(Fight.tideTick(fightState()))) return;
if (apply(Fight.alarmTick(fightState()))) return;
if (apply(Fight.ordersTick(fightState()))) return;
save(Fight.tickSpeed(fightState()));
set({ round: get().round + 1 });
nextActor();
};

// Whoever the clock says is next takes their turn (the last one's turn is spent first)
const nextActor = () => {
let { clock } = get();
const done = get().acting;
if (done === 'player') save(Fight.endPlayerTurn(fightState()));
if (done !== null) { clock = Fight.spendTurn(fightState(), clock, done); set({ clock, acting: null }); }
const { who, at } = Fight.nextUp(fightState(), clock);
if (Fight.roundOf(at) > get().round) { beginRound(); return; }
set({ clock: { ...clock, now: at }, acting: who });
if (who === 'player') {
// The opening turn skips the start-of-turn cooling, as it always has
if (get().openingTurn) { set({ phase: 'player_turn', inputLocked: false, actingFoe: null, openingTurn: false }); return; }
beginPlayerTurn();
return;
}
const k = Fight.allyOf(who);
if (k !== null) { beginAllyTurn(k); return; }
set({ phase: 'enemy_turn', inputLocked: true });
runFoeTurn(who as number);
};

// Ally k's own turn: the action bar shows its moves and grid taps move it. A stun or a climb out of the sea costs it
const beginAllyTurn = (k: number) => {
set({ actingFoe: null, selectedAction: null, selectedMovement: null, openingTurn: false });
const start = Fight.startAllyTurn(fightState(), k);
if (apply(start)) return;
if (start.skipTurn) { set({ phase: 'enemy_turn', inputLocked: true, allyTurn: null }); later(nextActor, FOE_GAP_DELAY); return; }
set({ phase: 'player_turn', inputLocked: false, allyTurn: k, allyOrigin: { ...get().allies[k].pos }, allyMoveMode: Fight.allyReach(fightState(), k).size ? k : null });
};

// Ally k's turn is over (it acted, or the player ended it)
const endAllyTurn = () => {
if (get().allyTurn === null) return;
set({ allyTurn: null, allyMoveMode: null, allyOrigin: null, phase: 'enemy_turn', inputLocked: true });
later(nextActor, FOE_GAP_DELAY);
};

// Foe i takes its turn: attack (or wind up, or walk), then walk, then whoever is next.
const runFoeTurn = (i: number) => {
const s = get();
set({ actingFoe: i });
const level = s.farmLevel ?? s.bossLevel;
const step = Fight.foeTurn(fightState(), i, level);
doer = { kind: 'foe' };
if (apply(step)) return;
const done = () => {
if (apply(Fight.applyFoeHazard(fightState(), i))) return;
later(nextActor, typeof Fight.forecast(fightState(), get().clock, 1, i)[0] !== 'number' ? TURN_HANDOFF_DELAY : FOE_GAP_DELAY);
};
// Enemies attack first, then walk
if (step.walkAfter) later(() => { doer = { kind: 'foe' }; if (apply(Fight.foeWalk(fightState(), i))) return; done(); }, ENEMY_STEP_DELAY);
else done();
};

// A new body: implants, credits, weapons, loadout and upgrade trees all start fresh.
// `place` puts the signal on the map (the chapter's entry, or the next chapter's).
/** The strongest implant the host is wearing (not a machine frame's built-in part): what stays on its body. */
const bodyLeftBehind = (): Item | null => {
const worn = AUGMENTATION_SLOTS.map(sl => useInventory.getState().equippedAugmentations[sl]).filter((i): i is Item => !!i && !i.id.startsWith('frame_'));
return worn.length ? worn.reduce((a, b) => (powerOf(b) > powerOf(a) ? b : a)) : null;
};

const wakeNewHost = (finalClass: PlayerClass, place: () => void) => {
const { progression, runSeed: lastSeed } = get();
// The signal remembers what the body it left was wearing (chapter two's Echo wears it)
usePlayi.getState().rememberBody(AUGMENTATION_SLOTS.map(sl => useInventory.getState().equippedAugmentations[sl]).filter((i): i is Item => !!i));

useInventory.getState().clearInventory();
useLoadout.getState().resetLoadout();
useAugmentTrees.getState().resetTrees();
// The strain the player picked takes hold for this host; its numbers start from zero
useStrain.getState().wake();
useRunStats.getState().newHost();

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
hostBestThreat: 0,
});
place();
// Seeded from the host that just died, so a replayed run gets the same gifts
giveNewHostPerks(mixSeed(lastSeed, progression.deathCount + 1));
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
// In chapters of machines, the new host is a machine: one of the frames, its parts already fitted
if (activeChapter().rules?.machines) {
const frame = MACHINE_FRAMES[Math.floor(random() * MACHINE_FRAMES.length)];
for (const id of frame.parts) {
const t = ITEMS_2059.find(i => i.id === id);
if (!t?.slot) continue;
useInventory.getState().equipAugmentation(instancedItem(t));
}
}
};

/** The machines a host can wake as in a chapter of machines: each frame's built-in parts (items.json). */
const MACHINE_FRAMES = [
{ name: 'loader', parts: ['frame_loader_legs_l', 'frame_loader_legs_r', 'frame_loader_spine'] },
{ name: 'gantry', parts: ['frame_gantry_arm_r', 'frame_gantry_arm_l', 'frame_gantry_spine'] },
{ name: 'swarm', parts: ['frame_swarm_eyes', 'frame_swarm_core', 'frame_swarm_ears'] },
];

const startFight = (level: number, farm: boolean, roomEnemy?: string) => {
const { playerClass, runSeed, fightsStarted } = get();
// Same run seed + same fight number = same arena, rolls and loot
seedRandom(mixSeed(runSeed, fightsStarted));
set({ fightsStarted: fightsStarted + 1 });
const { player: fresh, moveRange, perks } = buildPlayer(playerClass);
// Health carries from fight to fight (practice fights start whole)
const player = farm ? fresh : { ...fresh, currentHp: healthNow(useMap.getState(), fresh.maxHp) };
const isKing = !farm && level === 10 && activeChapter().cast.setPiece === 'Patchwork King';
const strain = useStrain.getState().active;
const units = planFoes(level, !farm && firstLifeAt(get().progression.deathCount, level), farm, roomEnemy).map(u => strainUnit(u, strain));
const party = partyForFight(perks);
// The arena makes room for how far you move and how many bodies are on it
// Map fights use the room's own drawn arena; farm fights roll one
const fightRoom = !farm ? roomById(useMap.getState().room) : undefined;
const drawn = fightRoom?.arena;
const grid = drawn ? buildArena(drawn, fightRoom?.tileset) : generateBattlefield(level, { move: moveRange, units: 1 + units.length + party.length });
const spots = spawnFoePositions(grid, units.length);
const foes = units.slice(0, spots.length).map((u, k) => Fight.newFoe(u, spots[k], strainHeat(getBossStartingHeat(u.name), strain)));
const allySpots = allySpawnPositions(grid, party.length, foes.map(f => f.pos));
const allies: Fight.Ally[] = party.slice(0, allySpots.length).map((a, k) => ({ ...a, pos: allySpots[k], moved: false, acted: false, taunting: false, defenseBoost: 0, burning: 0, stunned: false }));
set({
...freshFightState(grid),
playerHeat: perks.startHeat,
perks, firstStrikeUsed: false, sidestepReady: perks.sidestep, holdfastReady: perks.holdfast && !get().holdfastSpent,
reflexMoveOpen: false, allyMoveMode: null, allyTurn: null, allyOrigin: null,
phase: 'player_turn', player, grid,
playerMoveRange: moveRange,
farmLevel: farm ? level : null,
fightId: get().fightId + 1,
combatLog: isKing
? PATCHWORK_KING_MONOLOGUE.slice(0, 2).map((line, i) => ({ ...createCombatLog(line, 'info'), id: `king_intro_${i}` }))
: foes.length > 1 ? [{ ...createCombatLog(`${foes.length} enemies on the field. Tap one to aim at it.`, 'info'), id: 'group_intro' }] : [],
});
save({ ...fightState(), foes, allies, mark: null, allyHitFoes: [], allyGuard: 0, playerBurning: 0, playerStunned: false, overload: farm ? 0 : (useMap.getState().overload ?? 0), target: 0,
  playerSwimming: false, playerBleeding: 0, noParting: false, playerSlowed: 0, playerHasted: 0, tide: Fight.startTide(grid), alarm: Fight.startAlarm(!!activeChapter().rules?.alarm && !grid.tilesetOf), flinchUsed: false, wind: Fight.startWind(!!activeChapter().rules?.wind), orders: Fight.startOrders(!!activeChapter().rules?.orders), playerDrive: Fight.implantDrive(equippedSlotList().map(sl => useInventory.getState().equippedAugmentations[sl]!)) + firmwarePassives(get().playerClass, useFirmware.getState().level(get().playerClass)).speed });
set({ round: 0, clock: Fight.startClock(fightState()), acting: null, openingTurn: true });
// The enemy sees a corpse get up. Flavour only, so it doesn't touch the seeded rolls.
const lead = foes[0]?.unit;
if (lead) {
const host = get().progression.deathCount;
// Elites, bosses and set pieces always speak; anyone else the first time its kind is met, then rarely
const firstMeeting = !useJournal.getState().seen.includes(lead.name);
const speaks = isNotable(lead.name) || firstMeeting || Math.random() < ORDINARY_LINE_CHANCE;
const lines = isKing || !speaks ? [] : enemyLines(lead.name, host);
const line = lines.length ? lines[Math.floor(Math.random() * lines.length)] : null;
let note: string | null = null;
for (const f of foes) { const n = useJournal.getState().sight(f.unit.name, host + 1); if (n && !note) note = n.text; }
if (line) log(`${lead.name}: "${line}"`);
set({ fightIntro: line || note ? { speaker: lead.name, color: lead.spriteColor, line, note } : null });
}
// If something is faster than you, it moves first (after a beat to see the board)
const begin = () => {
if (typeof Fight.nextUp(fightState(), get().clock).who !== 'number') nextActor();
else { set({ phase: 'enemy_turn', inputLocked: true }); log('They move first', 'critical'); later(nextActor, ENEMY_TURN_DELAY * 2); }
};
// An opening line holds the fight: nothing moves until the player has read it and tapped on
if (get().fightIntro) { set({ phase: 'enemy_turn', inputLocked: true }); heldStart = { fightId: get().fightId, begin }; }
else begin();
};

return {
phase: 'menu',
player: createPlayer(),
boss: createBoss(1),
foes: [],
target: 0,
...Fight.BASE_FIGHT_FLAGS,
reflexMoveOpen: false,
moveSpent: false,
allyMoveMode: null,
allyTurn: null,
allyOrigin: null,
actingFoe: null,
clock: { now: 0, at: {} }, acting: null, openingTurn: true, round: 0,
hostBestThreat: 0,
fightIntro: null,
dismissIntro: () => {
set({ fightIntro: null });
// The fight was waiting on the line: start it now
const held = heldStart;
heldStart = null;
if (held && held.fightId === get().fightId && isFightPhase(get().phase)) held.begin();
},
holdfastSpent: false,
strip: null,
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
justOpened: [],
introCompleted: false,
debugMode: false,
originalPosition: null,
selectedMovement: null,
selectedAction: null,
aim: null,
hasMoved: false,
playerMoveRange: Fight.MOVE_BASE_REACH,
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
if (!availableFirmware().includes(playerClass)) return;
// Only Splice holds spliced pairs: any other firmware takes them back out
if (playerClass !== 'splice') useInventory.getState().unspliceAll();
set({ playerClass });
},

startCombat: () => startFight(get().bossLevel, false),
openRoomCache: () => {
const map = useMap.getState();
if (!map.takeCache()) return null;
useAudio.getState().play('cache');
// Seeded per host and room, so a replayed run finds the same things
seedRandom(mixSeed(get().runSeed, hashSeed(map.room)));
if (random() < 0.5) {
const stims = ITEMS_2059.filter(i => i.type === 'consumable' && i.consumableEffect && i.consumableEffect !== 'overclock');
const stim = stims[Math.floor(random() * stims.length)];
if (stim) { useInventory.getState().addItems([instancedItem(stim)]); return `You find a ${stim.name.replace(/^\[[A-Z]+\]\s*/, '')}.`; }
}
const credits = 20 + Math.floor(random() * 30) + Math.max(0, roomById(map.room).threat ?? 0) * 2;
useInventory.getState().addGold(credits);
return `You find ¤${credits} in a sealed bag.`;
},
chooseEvent: (k) => {
const map = useMap.getState();
const ev = eventHere(map);
const choice = ev?.choices[k];
if (!ev || !choice) return null;
const inv = useInventory.getState();
const worn = AUGMENTATION_SLOTS.map(sl => inv.equippedAugmentations[sl]).filter((i): i is Item => !!i && !i.id.startsWith('frame_'));
const part = choice.cost?.part ? partToGive(inv.items, worn, powerOf) : null;
if (cantChoose(choice, inv.gold, !!part)) return null;
// Seeded per host and room, so a replayed run gets the same outcome
seedRandom(mixSeed(get().runSeed, hashSeed(`${map.room}:event:${k}`)));
if (choice.cost?.credits) inv.spendGold(choice.cost.credits);
if (part) {
if (part.slot && inv.equippedAugmentations[part.slot as AugmentationSlot]?.id === part.id) inv.unequipAugmentation(part.slot as AugmentationSlot);
useInventory.getState().removeItem(part.id);
useAugmentTrees.getState().forget(part);
}
const won = choice.odds === undefined || random() < choice.odds;
const out = won ? choice.win : (choice.lose ?? { text: '' });
const got: string[] = [];
if (out.implant) {
const rarity = out.implant === 'better' ? gradeUp(part?.rarity ?? 'common') : out.implant;
const pool = ITEM_POOLS[rarity];
const t = pool[Math.floor(random() * pool.length)];
if (t) { const it = instancedItem(t); useInventory.getState().addItems([it]); got.push(it.name); }
}
for (let n = 0; n < (out.stims ?? 0); n++) {
const stims = ITEMS_2059.filter(i => i.type === 'consumable' && i.consumableEffect && i.consumableEffect !== 'overclock');
const stim = stims[Math.floor(random() * stims.length)];
if (stim) { useInventory.getState().addItems([instancedItem(stim)]); got.push(stim.name); }
}
if (out.credits) { useInventory.getState().addGold(out.credits); got.push(`¤${out.credits}`); }
useMap.getState().spendEvent((choice.cost?.health ?? 0) + (out.health ?? 0));
useAudio.getState().play('cache');
return [out.text, got.length ? `You get ${got.map(g => g.replace(/^\[[A-Z]+\]\s*/, '')).join(', ')}.` : ''].filter(Boolean).join(' ');
},
startRoomFight: () => {
const room = roomById(useMap.getState().room);
if (room.threat === undefined || !hasFight(useMap.getState(), room)) return;
set({ bossLevel: room.threat });
startFight(room.threat, false, room.enemy);
},
startFarmCombat: (level) => startFight(level, true),

setSelectedMovement: (pos) => set({ selectedMovement: pos }),
setSelectedAction: (action) => {
if (get().allyTurn !== null) return; // an ally's turn: only its moves
const { phase, inputLocked, reflexMoveOpen } = get();
if (phase !== 'player_turn' || inputLocked || reflexMoveOpen) return;
set({ selectedAction: action });
reAim();
},

moveTentatively: (position) => {
if (get().allyTurn !== null) return; // an ally's turn: only its moves
const { phase, inputLocked, grid, originalPosition, playerHeat, playerMoveRange } = get();
if (phase !== 'player_turn' || inputLocked || !originalPosition) return;
// Tapping your starting tile undoes a move
if (!get().reflexMoveOpen && position.row === originalPosition.row && position.col === originalPosition.col) {
get().undoMove();
return;
}
if (get().orders?.now === 'hold') { log('Hold position: nobody moves this round'); return; }
if (get().moveSpent && !get().reflexMoveOpen) return; // a cool turn's second action: no second move
if (playerHeat >= 100 && !get().perks.runaway) {
log('OVERHEATED -- movement locked');
return;
}
const reflex = get().reflexMoveOpen;
const from = reflex ? grid.playerPosition : originalPosition;
const reachable = getPlayerReach(from, { ...grid, playerPosition: from }, reflex ? Fight.STEP_REACH : playerMoveRange, get().perks.phaseStep);
if (!reachable.has(`${position.row},${position.col}`)) return;
set({ grid: { ...grid, playerPosition: position }, selectedMovement: position, hasMoved: true });
useAudio.getState().play('step');
reAim();
if (reflex) { set({ inputLocked: true }); finishPlayerAction(true); }
},

undoMove: () => {
if (get().allyTurn !== null) return; // an ally's turn: only its moves
const { originalPosition, grid, phase, inputLocked } = get();
if (!originalPosition || phase !== 'player_turn' || inputLocked) return;
set({ grid: { ...grid, playerPosition: originalPosition }, selectedMovement: null, hasMoved: false });
reAim();
},

endTurn: () => {
const { selectedAction, phase, inputLocked } = get();
if (phase !== 'player_turn' || inputLocked) return;
if (get().allyTurn !== null) { log(`-- ${get().allies[get().allyTurn!]?.unit.name ?? 'Ally'} waits --`); endAllyTurn(); return; }
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
if (get().allyTurn !== null) return; // an ally's turn: only its moves
const { phase, inputLocked } = get();
if (phase !== 'player_turn' || inputLocked) return;
const consumable = useInventory.getState().useConsumable(itemId);
if (!consumable) return;

const step = Fight.resolveConsumable(fightState(), consumable);
useRunStats.getState().add({ stimsUsed: 1 });
apply(step);
set({ selectedAction: null, selectedMovement: null });
// Overclock doesn't use up your turn; other stims do.
if (step.endsTurn) {
set({ inputLocked: true });
finishPlayerAction(false);
}
},

executePlayerTurn: () => {
if (get().allyTurn !== null) return; // an ally's turn: only its moves
const { playerClass, selectedAction, phase, inputLocked } = get();
if (!selectedAction || phase !== 'player_turn' || inputLocked) return;
const action = selectedAction;

if (action.type === 'brace' || action.type === 'defend') {
set({ inputLocked: true, selectedAction: null });
doer = { kind: 'player', move: action.name };
apply(Fight.resolveBrace(fightState(), action));
finishPlayerAction(false);
return;
}

const aim = get().aim;
if (!aim || !Fight.foesStruck(fightState(), action, playerClass, aim).length) {
log('Nothing to hit there. Move closer, or tap a lit square to aim.');
return;
}
set({ inputLocked: true, selectedAction: null });
const step = Fight.resolvePlayerAttack(fightState(), action, playerClass, aim);
doer = { kind: 'player', move: action.name };
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

rewriteOrder: (id) => {
const { phase, inputLocked } = get();
if (phase !== 'player_turn' || inputLocked) return;
apply(Fight.rewriteOrder(fightState(), id));
reAim();
},
enemyTurn: () => nextActor(),

surge: () => {
if (get().allyTurn !== null) return; // an ally's turn: only its moves
const { phase, inputLocked, reflexMoveOpen } = get();
if (phase !== 'player_turn' || inputLocked || reflexMoveOpen || !Fight.canSurge(fightState())) return;
// Scaled from the strongest move on your fight bar
const best = Math.max(10, ...useLoadout.getState().slots.map(a => (a && a.type !== 'brace' ? a.damage ?? 0 : 0)));
set({ inputLocked: true, selectedAction: null });
useRunStats.getState().add({ surges: 1 });
doer = { kind: 'player', move: Fight.SURGE_NAME[get().perks.surgeKind ?? 'blast'] };
const step = Fight.resolveSurge(fightState(), best);
if (apply(step)) return;
// Blink: act again at once
if (step.events.some(e => e.kind === 'extraAction')) {
later(() => { const g = get().grid; set({ inputLocked: false, hasMoved: false, selectedMovement: null, selectedAction: null, originalPosition: { ...g.playerPosition } }); }, 300);
return;
}
finishPlayerAction(false);
},

toggleAllyMove: (ally) => {
const { phase, inputLocked, reflexMoveOpen, allies, allyMoveMode } = get();
if (phase !== 'player_turn' || inputLocked || reflexMoveOpen || get().allyTurn !== ally) return;
if (allyMoveMode === ally || !allies[ally]) { set({ allyMoveMode: null }); return; }
set({ allyMoveMode: Fight.allyReach(fightState(), ally).size ? ally : null });
},

moveAlly: (pos) => {
const { phase, inputLocked, allyMoveMode, allyOrigin } = get();
if (phase !== 'player_turn' || inputLocked || allyMoveMode === null || get().allyTurn !== allyMoveMode || !allyOrigin) return;
// Like your own move: it can be changed (or taken back by tapping where it started) until the ally acts or its turn ends
const cur = fightState();
const next = Fight.placeAlly(cur, allyMoveMode, pos, allyOrigin);
if (next !== cur) save(next);
},

allyAct: (ally, move) => {
const { phase, inputLocked, reflexMoveOpen } = get();
if (phase !== 'player_turn' || inputLocked || reflexMoveOpen || get().allyTurn !== ally) return;
if (!Fight.canAllyUse(fightState(), ally, move)) {
const m = get().allies[ally]?.moves[move];
if (m?.effect === 'attack') log(`${get().allies[ally].unit.name}: out of range. Move closer.`);
return;
}
set({ allyMoveMode: null, inputLocked: true });
doer = { kind: 'ally' };
if (apply(Fight.resolveAllyMove(fightState(), ally, move))) return;
// Acting ends its turn
later(endAllyTurn, ENEMY_STEP_DELAY);
},

setTarget: (index) => {
const { phase, inputLocked } = get();
if (phase !== 'player_turn' || inputLocked) return;
save(Fight.setTarget(fightState(), index));
},

setAim: (tile) => {
const { phase, inputLocked, selectedAction, playerClass } = get();
if (phase !== 'player_turn' || inputLocked || !selectedAction || (selectedAction.type !== 'attack' && selectedAction.type !== 'special')) return false;
if (!Fight.aimTiles(fightState(), selectedAction, playerClass, tile).length) return false;
set({ aim: tile });
return true;
},

resetCombat: () => {
// Abandoning a fight: bump fightId so pending timers can't drag you back in
set({ phase: 'menu', combatLog: [], inputLocked: false, fightId: get().fightId + 1, foes: [] });
},

takePart: (itemId) => {
const st = get().strip;
if (!st || st.taken.length >= st.picks || st.taken.includes(itemId)) return;
const item = st.bodies.flatMap(b => b.items).find(i => i.id === itemId);
if (!item) return;
useInventory.getState().addItems([item]);
useRunStats.getState().add({ partsTaken: 1 });
set({ strip: { ...st, taken: [...st.taken, itemId] } });
useAudio.getState().play('cache');
},

continueFromVictory: () => {
// Leaving without choosing takes the best part for you; the rest are scrapped for credits
const st = get().strip;
if (st) {
  const order = ['legendary', 'epic', 'rare', 'uncommon', 'common'];
  const left = () => st.bodies.flatMap(b => b.items).filter(i => !get().strip!.taken.includes(i.id));
  while (get().strip!.taken.length < st.picks && left().length) get().takePart(left().sort((a, b) => order.indexOf(a.rarity) - order.indexOf(b.rarity))[0].id);
  const scrap = scrapValue(left());
  if (scrap) useInventory.getState().addGold(scrap);
  set({ strip: null });
}
set({ phase: 'menu', pendingShop: false, currentLoot: null });
},

leaveShop: () => {
set({ phase: 'menu', currentLoot: null });
},

openMarket: () => {
if (get().phase === 'menu' && !useStrain.getState().active.includes('shut')) set({ phase: 'shop' });
},

completeIntro: () => set({ introCompleted: true }),

rebirth: (newClass, at) => {
const { playerClass } = get();
// Wake with the chosen firmware if it's open (else the last one, else the first open), or none
const open = availableFirmware();
const finalClass: PlayerClass = !open.length ? 'none'
: newClass && open.includes(newClass) ? newClass : open.includes(playerClass) ? playerClass : open[0];
// The new corpse wakes at the chapter's entry (or a server a host reached); fights refill, memory stays.
// The best part the lost host wore stays on its body, where it fell.
const left = bodyLeftBehind();
wakeNewHost(finalClass, () => useMap.getState().newHost(left, at));
},

goToNextChapter: () => {
const next = nextChapter(useMap.getState().chapter);
if (!next || !useMap.getState().done) return;
wakeNewHost(get().playerClass, () => useMap.getState().travel(next.id));
},

resetAll: () => {
usePlayi.getState().reset();
useJournal.getState().reset();
useMap.getState().reset();
useStrain.getState().reset();
useFirmware.getState().reset();
useRunStats.getState().reset();
useAllies.getState().reset();
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
hostBestThreat: 0,
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
strip: s.strip,
holdfastSpent: s.holdfastSpent,
hostBestThreat: s.hostBestThreat,
runSeed: s.runSeed,
fightsStarted: s.fightsStarted,
playerClass: s.playerClass,
classesUnlocked: s.classesUnlocked,
introCompleted: s.introCompleted,
progression: s.progression,
}),
}))
);

/** Every firmware a new host can wake with: Enforcer and Operative once a death opened them, then whatever going deep opened. */
/** The host's health between fights: what it would start the next fight on, out of its max. */
export function hostHealth(): { hp: number; max: number } {
const max = buildPlayer(useCombat.getState().playerClass).player.maxHp;
return { hp: healthNow(useMap.getState(), max), max };
}

/** Testing: every firmware is open from the start, so each class can be tried. Turn off to use the unlock rules. */
export const ALL_FIRMWARE_OPEN = true;

export function availableFirmware(): PlayerClass[] {
if (ALL_FIRMWARE_OPEN) return ['melee', 'ranged', 'swift', 'crowd', 'splice'];
const all = [...(useCombat.getState().classesUnlocked ? (['melee', 'ranged'] as PlayerClass[]) : []), ...useFirmware.getState().opened];
return all.filter((c, k) => all.indexOf(c) === k);
}
