import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as Fight from '../client/src/lib/engine/fight';
import type { FightState, Ally } from '../client/src/lib/engine/fight';
import { seedRandom } from '../client/src/lib/engine/rng';
import { createPlayer, createBoss, PLAYER_ACTIONS } from '../client/src/lib/combat/actions';
import type { CombatGrid, CombatAction, Item } from '../client/src/lib/combat/types';
import { ALLIES, allyDef, allyUnit, allyMoves, alliesUnlockedBy, ALLY_MAX_LEVEL, ALLY_LINKS, allySlotFor, withLinks } from '../client/src/lib/combat/allies';
import { useInventory } from '../client/src/lib/stores/useInventory';
import { useAllies } from '../client/src/lib/stores/useAllies';
import { perksFor, NO_PERKS } from '../client/src/lib/engine/playi';

function arena(player: [number, number], boss: [number, number]): CombatGrid {
  const tiles = Array.from({ length: 9 }, () => Array.from({ length: 7 }, () => ({ type: 'empty' as const })) as any[]);
  return { rows: 9, cols: 7, tiles, playerPosition: { row: player[0], col: player[1] }, bossPosition: { row: boss[0], col: boss[1] } } as CombatGrid;
}
function ally(id: string, pos: [number, number], level = 1): Ally {
  const def = allyDef(id)!;
  const moves = allyMoves(def, level);
  return { id, unit: allyUnit(def, level), pos: { row: pos[0], col: pos[1] }, moves, move: def.move, cooldowns: moves.map(() => 0), moved: false, acted: false, taunting: false, defenseBoost: 0, burning: 0, stunned: false };
}
function fight(allies: Ally[], over: Partial<FightState> = {}): FightState {
  const grid = over.grid ?? arena([7, 3], [2, 3]);
  return {
    player: createPlayer(), foes: [Fight.newFoe(createBoss(10), grid.bossPosition, 40)], target: 0, grid,
    playerHeat: 30, playerDefenseBoost: 0, playerMalfunctioning: false, overclockActive: false, kizunaJustFired: false, doubleActionReady: false,
    ...Fight.BASE_FIGHT_FLAGS, allies, ...over,
  };
}
const blow: CombatAction = { type: 'attack', name: 'Blow', description: '', damage: 20, physicalRatio: 1, accuracy: 'precise', attackPattern: 'melee' };

test('the roster unlocks in order and later allies are stronger at level 1', () => {
  assert.deepEqual(alliesUnlockedBy(9), []);
  assert.deepEqual(alliesUnlockedBy(10), ['bale']);
  assert.equal(alliesUnlockedBy(40).length, 5, "the first five, for old saves");
  const atk = (id: string) => allyUnit(allyDef(id)!, 1).physicalAttack;
  assert.ok(atk('breaker') > atk('bale'));
});

test('allies toughen as they level, their kit grades up, and Handshake adds 25% health', () => {
  const def = allyDef('bale')!;
  const l1 = allyUnit(def, 1), l5 = allyUnit(def, 5);
  assert.ok(l5.maxHp > l1.maxHp * 1.3, 'the body toughens');
  assert.ok(l5.maxStructuralHp > l1.maxStructuralHp, 'a better-grade kit, a bigger structure bar');
  assert.ok(allyUnit(def, 1, 1.25).maxHp > l1.maxHp * 1.2);
  assert.ok(allyMoves(def, 5)[0].damage! > allyMoves(def, 1)[0].damage!);
});

test('enemies go for whoever is nearest, the player winning ties', () => {
  const near = fight([ally('bale', [3, 3])]);
  assert.equal(Fight.victimOf(near, 0), 0);
  const far = fight([ally('bale', [8, 0])]);
  assert.equal(Fight.victimOf(far, 0), -1);
  const tie = fight([ally('bale', [3, 3])], { grid: arena([3, 2], [2, 3]) });
  assert.equal(Fight.victimOf(tie, 0), -1);
});

test("Draw fire pulls the enemies near the ally onto it until the ally's next turn", () => {
  const s0 = fight([ally('bale', [8, 0])]);
  // Put the ally within reach of the enemy for the pull to work
  const foe = s0.foes[0].pos;
  const s = { ...s0, allies: [{ ...s0.allies[0], pos: { row: foe.row + 2, col: foe.col } }] };
  const taunted = Fight.resolveAllyMove(s, 0, 1).state;
  assert.equal(taunted.allies[0].taunting, true);
  assert.equal(Fight.victimOf(taunted, 0), 0);
  // Too far away, the pull doesn't reach
  const far = { ...taunted, allies: [{ ...taunted.allies[0], pos: { row: foe.row + Fight.TAUNT_RANGE + 2, col: foe.col } }] };
  assert.notEqual(Fight.victimOf(far, 0), 0);
  assert.equal(Fight.canAllyUse(taunted, 0, 1), false, 'one action a turn');
  assert.equal(Fight.startPlayerTurn(taunted).allies[0].taunting, true, "the player's turn doesn't end it");
  const next = Fight.startAllyTurn(taunted, 0).state;
  assert.equal(next.allies[0].taunting, false);
  assert.equal(next.allies[0].cooldowns[1], 1, 'cooldown ticks down');
  assert.equal(Fight.canAllyUse(next, 0, 1), false);
  assert.equal(Fight.canAllyUse(Fight.startAllyTurn(next, 0).state, 0, 1), true);
});

test('allies take their own turns on the clock, as often as their speed allows', () => {
  const slow = fight([{ ...ally('bale', [8, 0]), speed: 8 }]);
  const quick = fight([{ ...ally('bale', [8, 0]), speed: 14 }]);
  const count = (s: any) => Fight.forecast(s, Fight.startClock(s), 30).filter(a => a === 'ally0').length;
  assert.ok(count(slow) > 0, 'an ally gets turns');
  assert.ok(count(quick) > count(slow), 'a faster ally gets more of them');
  assert.equal(Fight.allyOf('ally0'), 0);
  assert.equal(Fight.allyOf('player'), null);
  assert.equal(Fight.allyOf(2), null);
  // A knocked out ally drops out of the order
  const out = { ...slow, allies: slow.allies.map(a => ({ ...a, unit: { ...a.unit, currentHp: 0 } })) };
  assert.equal(Fight.forecast(out, Fight.startClock(out), 20).filter(a => a === 'ally0').length, 0);
});

test("a stunned ally loses its own turn; an ally's mark lasts until the player's turn ends", () => {
  const s = fight([{ ...ally('bale', [8, 0]), stunned: true }]);
  const start = Fight.startAllyTurn(s, 0);
  assert.equal(start.skipTurn, true);
  assert.equal(start.state.allies[0].stunned, false);
  const marked = { ...s, mark: { foe: 0, bonus: 0.2 }, allyHitFoes: [0] };
  assert.deepEqual(Fight.startPlayerTurn(marked).mark, marked.mark, 'still there when the player acts');
  const ended = Fight.endPlayerTurn(marked);
  assert.equal(ended.mark, null);
  assert.deepEqual(ended.allyHitFoes, []);
});

test('a hit on an ally hurts the ally, not the player; a knockout does not end the fight', () => {
  const s = fight([{ ...ally('bale', [3, 3]), unit: { ...ally('bale', [3, 3]).unit, currentHp: 5, currentStructuralHp: 0 } }]);
  seedRandom(1);
  const step = Fight.resolveFoeAction(s, 0, blow, 10);
  assert.equal(step.state.player.currentHp, s.player.currentHp);
  assert.equal(step.state.allies[0].unit.currentHp, 0);
  assert.ok(step.events.some(e => e.kind === 'allyDown'));
  assert.equal(Fight.isOver(step), false);
  assert.equal(Fight.victimOf(step.state, 0), -1, 'a knocked out ally is ignored');
});

test('ally attacks need range and count for Coordinated', () => {
  const far = fight([ally('bale', [8, 0])]);
  assert.equal(Fight.canAllyUse(far, 0, 0), false);
  const close = fight([ally('bale', [3, 3])], { perks: perksFor(['network_1', 'network_2', 'network_3']) });
  assert.equal(Fight.canAllyUse(close, 0, 0), true);
  seedRandom(2);
  const hit = Fight.resolveAllyMove(close, 0, 0);
  assert.ok(hit.state.foes[0].unit.currentHp < close.foes[0].unit.currentHp);
  assert.deepEqual(hit.state.allyHitFoes, [0]);
  // The player's next hit on that foe gets the Coordinated bonus
  const sturdy = (st: FightState) => ({ ...st, grid: arena([3, 3], [2, 3]), foes: [{ ...st.foes[0], pos: { row: 2, col: 3 }, unit: { ...st.foes[0].unit, currentHp: 9999, maxHp: 9999 } }] });
  const strike = { ...PLAYER_ACTIONS[0], damage: 60, accuracy: 'precise' as const };
  seedRandom(3); const plain = 9999 - Fight.resolvePlayerAttack(sturdy({ ...hit.state, allyHitFoes: [] }), strike).state.foes[0].unit.currentHp;
  seedRandom(3); const coord = 9999 - Fight.resolvePlayerAttack(sturdy(hit.state), strike).state.foes[0].unit.currentHp;
  assert.ok(coord > plain);
});

test('Field mend heals, Paint target boosts your hits, Aegis guards your next hit', () => {
  const hurt = { ...createPlayer(), currentHp: 10 };
  const healed = Fight.resolveAllyMove(fight([ally('matron', [8, 0])], { player: hurt }), 0, 1).state;
  assert.equal(healed.player.currentHp, 10 + Math.round(hurt.maxHp * 0.25));

  const marked = Fight.resolveAllyMove(fight([ally('ghostline', [8, 0])]), 0, 1).state;
  assert.deepEqual(marked.mark, { foe: 0, bonus: 0.35 });

  const guarded = Fight.resolveAllyMove(fight([ally('ward', [8, 0])]), 0, 1).state;
  assert.equal(guarded.allyGuard, 14);
  const near = { ...guarded, grid: arena([3, 3], [2, 3]) };
  seedRandom(4); const withGuard = Fight.resolveFoeAction(near, 0, blow, 10);
  seedRandom(4); const without = Fight.resolveFoeAction({ ...near, allyGuard: 0 }, 0, blow, 10);
  assert.ok(withGuard.state.player.currentHp > without.state.player.currentHp);
  assert.equal(withGuard.state.allyGuard, 0, 'the guard soaks one hit');
});

test('allies move once, before acting, and not onto other units', () => {
  const s = fight([ally('bale', [6, 3])]);
  const reach = Fight.allyReach(s, 0);
  assert.ok(!reach.has('7,3'), 'not onto the player');
  assert.ok(reach.has('4,3'));
  const moved = Fight.moveAlly(s, 0, { row: 4, col: 3 });
  assert.deepEqual(moved.allies[0].pos, { row: 4, col: 3 });
  assert.equal(Fight.allyReach(moved, 0).size, 0);
  assert.equal(Fight.moveAlly(s, 0, { row: 0, col: 0 }), s, 'too far: nothing changes');
});

test('a heavy wound up at an ally misses if the ally steps away', () => {
  const heavy: CombatAction = { ...blow, isHeavy: true, name: 'Slam' };
  const s = fight([ally('bale', [3, 3])], { grid: arena([8, 6], [2, 3]) });
  const wound = Fight.telegraphHeavy(s, 0, heavy).state;
  assert.equal(wound.foes[0].pendingVictim, 0);
  const away = { ...wound, allies: [{ ...wound.allies[0], pos: { row: 7, col: 0 } }] };
  const rel = Fight.releaseHeavy(away, 0);
  assert.equal(rel.connects, false);
  assert.equal(Fight.releaseHeavy(wound, 0).connects, true);
});

test('the ally store: meeting, party size, levelling to the cap', () => {
  const A = useAllies.getState();
  A.reset();
  assert.deepEqual(A.unlocked(), []);
  assert.equal(useAllies.getState().meet('bale'), true);
  assert.equal(useAllies.getState().meet('bale'), false, 'only the first time');
  assert.equal(useAllies.getState().meet('nobody'), false);
  useAllies.getState().meet('matron');
  useAllies.getState().setParty(['bale', 'matron', 'ghostline'], 1);
  assert.deepEqual(useAllies.getState().party, ['bale'], 'one per host, locked allies dropped');
  useAllies.getState().setParty(['bale', 'matron'], 2);
  assert.deepEqual(useAllies.getState().party, ['bale', 'matron']);
  assert.deepEqual(useAllies.getState().gainXp(2), ['bale', 'matron']);
  for (let k = 0; k < 100; k++) useAllies.getState().gainXp(2);
  assert.equal(useAllies.getState().progress('bale').level, ALLY_MAX_LEVEL);
  useAllies.getState().reset();
});

const implant = (over: Partial<Item>): Item => ({ id: `i${Math.random()}`, name: '[VOLKOV] Test Arm', rarity: 'rare', type: 'augmentation', slot: 'right_arm', icon: '', ...over });

test('ally gear: an active implant adds a third move; affinity makers count for more', () => {
  const bale = allyDef('bale')!;
  const limb = implant({ name: '[VOLKOV] Test Arm', parts: { head: 'jab', mods: [] } });
  const fitLimb = { ...limb, name: '[TIANXIA] Test Arm' };
  const plain = allyMoves(bale, 1, { limb });
  assert.equal(plain.length, 3, 'its own two moves, and one from your implant');
  assert.equal(plain[0].name, bale.moves[0].name, 'its kit attack keeps its name');
  assert.equal(plain[1].name, bale.moves[1].name, 'support move kept');
  assert.equal(plain[2].effect, 'attack');
  const fit = allyMoves(bale, 1, { limb: fitLimb });
  assert.ok(fit[2].damage! > plain[2].damage!, 'Tianxia limb hits harder on Bale');
  const other = implant({ name: '[PARSU] Test Lung', slot: 'lungs', attackBonus: 10, hpBonus: 20 });
  const off = implant({ name: '[CROWN] Test Lung', slot: 'lungs', attackBonus: 10, hpBonus: 20 });
  const base = allyUnit(bale, 1);
  assert.equal(allyUnit(bale, 1, 1, { other: off }).maxHp, base.maxHp + 20);
  assert.equal(allyUnit(bale, 1, 1, { other }).maxHp, base.maxHp + 30, 'PARSU suits Bale: x1.5');
  assert.equal(allySlotFor(limb), 'limb');
  assert.equal(allySlotFor(other), 'other');
});

test('link bonuses: each ally in the party changes your perks', () => {
  const p = withLinks(NO_PERKS, ['bale', 'matron', 'ghostline', 'ward', 'breaker']);
  assert.ok(Math.abs(p.structureMult - 1.1) < 1e-9);
  assert.equal(p.braceHeal, 0.05);
  assert.equal(p.firstStrikePrecise, true);
  assert.equal(p.partingTakenMult, 0.5);
  assert.equal(p.collisionMult, 1.5);
  assert.deepEqual(withLinks(NO_PERKS, []), NO_PERKS);
  assert.ok(ALLIES.every(a => a.id in ALLY_LINKS));
});

test("Matron's link: a brace heals 5% of your health", () => {
  const s = fight([], { perks: { ...NO_PERKS, braceHeal: 0.05 } });
  const hurtS = { ...s, player: { ...s.player, currentHp: s.player.maxHp - 50 } };
  const after = Fight.resolveBrace(hurtS, { type: 'brace', name: 'Brace', description: '', defenseBoost: 8 }).state;
  assert.equal(after.player.currentHp, hurtS.player.currentHp + Math.round(s.player.maxHp * 0.05));
});

test('giving an implant to an ally moves it out of the stash; taking it back returns it', () => {
  useAllies.getState().reset();
  useInventory.getState().clearInventory();
  const arm = implant({ name: '[TIANXIA] Gift Arm', parts: { head: 'fist', mods: [] } });
  useInventory.getState().addItems([arm]);
  assert.equal(useAllies.getState().giveImplant('bale', arm), false, 'only met allies');
  useAllies.getState().meet('bale');
  assert.equal(useAllies.getState().giveImplant('bale', arm), true);
  assert.equal(useInventory.getState().items.length, 0);
  assert.equal(useAllies.getState().gear.bale.limb?.id, arm.id);
  const arm2 = { ...arm, id: 'second' };
  useInventory.getState().addItems([arm2]);
  useAllies.getState().giveImplant('bale', arm2);
  assert.deepEqual(useInventory.getState().items.map(i => i.id), [arm.id], 'swap: the old one goes back');
  useAllies.getState().takeImplant('bale', 'limb');
  assert.equal(useInventory.getState().items.length, 2);
  assert.equal(useAllies.getState().gear.bale.limb, undefined);
  useAllies.getState().reset();
  useInventory.getState().clearInventory();
});

test('in a chapter of machines, a new host wakes in a machine frame', async () => {
  const { useCombat } = await import('../client/src/lib/stores/useCombat');
  const { useMap } = await import('../client/src/lib/stores/useMap');
  useCombat.getState().resetAll();
  useMap.getState().travel('corridor');
  useCombat.getState().rebirth();
  const worn = Object.values(useInventory.getState().equippedAugmentations).filter(Boolean).map(i => i!.templateId ?? i!.id);
  assert.ok(worn.length >= 3, `frame parts fitted (${worn.join(', ')})`);
  assert.ok(worn.every(id => id.startsWith('frame_')));
  const kinds = new Set(worn.map(id => id.split('_')[1]));
  assert.equal(kinds.size, 1, 'one frame, not a mix');
  useCombat.getState().resetAll();
});

test('an ally lets its story slip at levels 3, 6 and 10', async () => {
  const { ALLIES, storySoFar, ALLY_STORY_AT } = await import('../client/src/lib/combat/allies');
  const def = ALLIES[0];
  assert.deepEqual(ALLY_STORY_AT, [3, 6, 10]);
  assert.equal(storySoFar(def, 2).length, 0);
  assert.deepEqual(storySoFar(def, 3), def.story.slice(0, 1));
  assert.equal(storySoFar(def, 9).length, 2);
  assert.deepEqual(storySoFar(def, 10), def.story);
});

test("an ally's move can be changed, or taken back, until its turn ends", () => {
  const s = fight([ally('bale', [8, 0])]);
  const origin = { row: 8, col: 0 };
  const a = Fight.placeAlly(s, 0, { row: 7, col: 0 }, origin);
  assert.deepEqual(a.allies[0].pos, { row: 7, col: 0 });
  assert.equal(a.allies[0].moved, false, 'not settled');
  const b = Fight.placeAlly(a, 0, { row: 8, col: 1 }, origin);
  assert.deepEqual(b.allies[0].pos, { row: 8, col: 1 }, 'a second tap moves it again, counted from where it started');
  assert.deepEqual(Fight.placeAlly(b, 0, origin, origin).allies[0].pos, origin, 'tapping where it started takes the move back');
  assert.equal(Fight.placeAlly(b, 0, { row: 0, col: 0 }, origin), b, 'out of reach: nothing happens');
});

test("an ally's attack goes for the enemy it can reach when the target is out of range", () => {
  const grid = arena([8, 3], [0, 0]);
  const s = fight([ally('bale', [5, 3])], { grid, foes: [Fight.newFoe(createBoss(10), { row: 0, col: 0 }, 40), Fight.newFoe(createBoss(10), { row: 4, col: 3 }, 40)], target: 0 });
  const atk = s.allies[0].moves.findIndex(m => m.effect === 'attack');
  assert.equal(Fight.allyAimFoe(s, 0, atk), 1, 'the one beside it, not the far target');
  assert.equal(Fight.canAllyUse(s, 0, atk), true);
  const hit = Fight.resolveAllyMove(s, 0, atk).state;
  assert.ok(hit.foes[1].unit.currentHp < s.foes[1].unit.currentHp);
  assert.equal(hit.foes[0].unit.currentHp, s.foes[0].unit.currentHp);
});

test('allies start beside or behind the player, not between it and the enemy', async () => {
  const { allySpawnPositions } = await import('../client/src/lib/combat/grid');
  const grid = arena([5, 3], [0, 3]);
  const spots = allySpawnPositions(grid, 2, [{ row: 0, col: 3 }]);
  assert.equal(spots.length, 2);
  for (const p of spots) assert.ok(p.row >= 5, `ally at row ${p.row} is in front of the player`);
});

test('every ally has a preset kit built from parts: its attack gets the parts, the same for everyone', () => {
  const bale = allyDef('bale')!, matron = allyDef('matron')!;
  const a = allyMoves(bale, 1), b = allyMoves(bale, 1);
  assert.deepEqual(a, b, 'never rolled');
  assert.ok(a[0].effects?.knock, "Bale's kit arm knocks back");
  assert.ok((allyMoves(matron, 1)[0].physicalRatio ?? 1) < 0.5, "Matron's kit couples special");
  assert.ok(allyMoves(bale, 10)[0].damage! > allyMoves(bale, 1)[0].damage!, 'the kit grades up with the ally');
  assert.ok(allyUnit(bale, 1).maxStructuralHp > 0, 'a structure bar from its kit');
  for (const m of allyMoves(bale, 5)) assert.equal(m.heatGenerated ?? 0, 0, 'allies never run hot');
});

test("an ally's wide kit attack can hit several, and a defensive implant you give it covers you", () => {
  const tally = allyDef('tally')!;
  const s0 = fight([ally('tally', [4, 3])], { grid: arena([6, 3], [3, 3]) });
  const s = { ...s0, foes: [s0.foes[0], { ...s0.foes[0], pos: { row: 3, col: 4 } }] };
  const hits = Fight.allyStruck(s, 0, 0);
  assert.ok(hits.length >= 1 && hits.length <= 2, `Split 2 hook: ${hits.length}`);
  const mend = implant({ name: '[CROWN] Test Arm', parts: { head: 'mend', mods: [], lens: 'stock', coupling: 'servo', core: 'hot', targeting: 'focused' } });
  const moves = allyMoves(tally, 1, { limb: mend });
  assert.equal(moves[2].effect, 'defend');
  const hurt = fight([{ ...ally('tally', [5, 3]), moves, cooldowns: [0, 0, 0] }], { player: { ...createPlayer(), currentHp: 30 } });
  const healed = Fight.resolveAllyMove(hurt, 0, 2).state;
  assert.ok(healed.player.currentHp > 30, 'the most hurt in reach (you) gets it');
});
