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

test('ally levels add 8% each, and Handshake adds 25% health', () => {
  const def = allyDef('bale')!;
  const l1 = allyUnit(def, 1), l5 = allyUnit(def, 5);
  assert.ok(Math.abs(l5.maxHp / l1.maxHp - Math.pow(1.08, 4)) < 0.02);
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

test('Draw fire pulls every enemy onto the ally until the next turn', () => {
  const s = fight([ally('bale', [8, 0])]);
  const taunted = Fight.resolveAllyMove(s, 0, 1).state;
  assert.equal(taunted.allies[0].taunting, true);
  assert.equal(Fight.victimOf(taunted, 0), 0);
  assert.equal(Fight.canAllyUse(taunted, 0, 1), false, 'one action a round');
  const next = Fight.startPlayerTurn(taunted);
  assert.equal(next.allies[0].taunting, false);
  assert.equal(next.allies[0].cooldowns[1], 1, 'cooldown ticks down');
  assert.equal(Fight.canAllyUse(next, 0, 1), false);
  assert.equal(Fight.canAllyUse(Fight.startPlayerTurn(next), 0, 1), true);
});

test('a hit on an ally hurts the ally, not the player; a knockout does not end the fight', () => {
  const s = fight([{ ...ally('bale', [3, 3]), unit: { ...ally('bale', [3, 3]).unit, currentHp: 5 } }]);
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

test('ally gear: a limb replaces the first attack; affinity makers count for more', () => {
  const bale = allyDef('bale')!;
  const limb = implant({ name: '[VOLKOV] Test Arm', parts: { head: 'fist', mods: [] } });
  const fitLimb = { ...limb, name: '[TIANXIA] Test Arm' };
  const plain = allyMoves(bale, 1, { limb });
  assert.equal(plain[0].effect, 'attack');
  assert.notEqual(plain[0].name, bale.moves[0].name, 'the limb implant is its attack now');
  assert.equal(plain[1].name, bale.moves[1].name, 'support move kept');
  const fit = allyMoves(bale, 1, { limb: fitLimb });
  assert.ok(fit[0].damage! > plain[0].damage!, 'Tianxia limb hits harder on Bale');
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
