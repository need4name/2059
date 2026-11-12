import { test } from 'node:test';
import assert from 'node:assert/strict';
import { tileWeight } from '../client/src/lib/combat/patterns';
import { withClass } from '../client/src/lib/engine/firmware';
import * as Fight from '../client/src/lib/engine/fight';
import type { FightState } from '../client/src/lib/engine/fight';
import { seedRandom, random } from '../client/src/lib/engine/rng';
import { createPlayer, createBoss, PLAYER_ACTIONS } from '../client/src/lib/combat/actions';
import type { CombatGrid, CombatAction } from '../client/src/lib/combat/types';
import { getReachableTiles, buildArena, chebyshev } from '../client/src/lib/combat/grid';
import { canHitTarget, getHitTiles } from '../client/src/lib/combat/patterns';
import { rollParts, QUIRKS, actionForItem } from '../client/src/lib/combat/augments';
import { ITEMS_2059 } from '../client/src/lib/combat/items2059';

function arena(player: [number, number], boss: [number, number], hazard?: [number, number, number]): CombatGrid {
  const rows = 9, cols = 7;
  const tiles = Array.from({ length: rows }, () => Array.from({ length: cols }, () => ({ type: 'empty' as const })) as any[]);
  if (hazard) tiles[hazard[0]][hazard[1]] = { type: 'hazard', name: 'Fuel fire', hazardDamage: hazard[2] };
  return { rows, cols, tiles, playerPosition: { row: player[0], col: player[1] }, bossPosition: { row: boss[0], col: boss[1] } } as CombatGrid;
}

function fight(over: Partial<FightState> = {}): FightState {
  const grid = over.grid ?? arena([5, 3], [4, 3]);
  return {
    player: createPlayer(), foes: [Fight.newFoe(createBoss(3), grid.bossPosition, 40)], target: 0, grid,
    playerHeat: 30, playerDefenseBoost: 0, playerMalfunctioning: false,
    overclockActive: false, kizunaJustFired: false, doubleActionReady: false,
    ...Fight.BASE_FIGHT_FLAGS,
    ...over,
  };
}
const withImplants = () => ({ ...createPlayer(), maxStructuralHp: 50, currentStructuralHp: 10 });
const hitFor = (damage: number, phys = 0.5): CombatAction => ({ type: 'attack', name: 'Test Blow', description: '', damage, physicalRatio: phys, accuracy: 'precise', attackPattern: 'melee' });

test('both sides cool down at the start of a round; only a cool Operative acts twice', () => {
  const base = fight({ playerHeat: 20 });
  const s = Fight.startPlayerTurn({ ...base, foes: [{ ...base.foes[0], heat: 3 }] });
  assert.equal(s.playerHeat, 20 - Fight.PASSIVE_COOLING);
  assert.equal(s.foes[0].heat, 0);
  assert.equal(s.doubleActionReady, false, 'no free double action without the class');
  const op = { ...base, perks: withClass(base.perks, 'ranged') };
  assert.equal(Fight.startPlayerTurn(op).doubleActionReady, true, 'the Operative acts twice when cool');
  assert.equal(Fight.startPlayerTurn({ ...op, playerHeat: 60 }).doubleActionReady, false);
});

test('firmware classes: each has its own rule and its own Overload ultimate', () => {
  const base = fight();
  assert.equal(withClass(base.perks, 'melee').chain, true, 'Enforcer: takedowns chain');
  assert.equal(withClass(base.perks, 'swift').reflexMove, true, 'Courier: a step after attacking');
  assert.ok(withClass(base.perks, 'crowd').transferBonus > 0, 'Foreman: hits push heat');
  assert.equal(withClass(base.perks, 'ranged').surgeKind, 'overwatch');
  // Overrun pumps heat into everyone it hits; Blink hits nobody and gives an action
  const full = { ...base, overload: 100 };
  const overrun = Fight.resolveSurge({ ...full, perks: withClass(base.perks, 'crowd') }, 10).state;
  assert.ok(overrun.foes[0].heat > base.foes[0].heat || overrun.foes[0].stunned);
  const blink = Fight.resolveSurge({ ...full, perks: withClass(base.perks, 'swift') }, 10);
  assert.equal(blink.state.foes[0].unit.currentHp, base.foes[0].unit.currentHp);
  assert.ok(blink.events.some(e => e.kind === 'extraAction'));
});

test('brace cools you, raises guard and repairs 40% of structure', () => {
  const { state } = Fight.resolveBrace(fight({ player: withImplants(), playerHeat: 50 }), PLAYER_ACTIONS[1]);
  assert.equal(state.player.currentStructuralHp, 30);
  assert.equal(state.playerHeat, 25);
  assert.equal(state.playerDefenseBoost, 8);
});

test('a player attack damages the enemy and heats you up', () => {
  seedRandom(1);
  const before = fight();
  const step = Fight.resolvePlayerAttack(before, { ...PLAYER_ACTIONS[0], accuracy: 'precise' });
  assert.ok(step.state.foes[0].unit.currentHp < before.foes[0].unit.currentHp);
  assert.ok(step.state.playerHeat > before.playerHeat);
  assert.ok(step.events.some(e => e.kind === 'hit'));
});

test('out-of-range attacks are caught before they resolve', () => {
  const far = fight({ grid: arena([8, 0], [0, 6]) });
  assert.equal(Fight.canPlayerHit(far, PLAYER_ACTIONS[0], 'none'), false);
  assert.equal(Fight.canPlayerHit(fight(), PLAYER_ACTIONS[0], 'none'), true);
});

test('special hits reach health without breaking anything', () => {
  seedRandom(2);
  const bare = fight({ player: createPlayer() });
  const step = Fight.resolveFoeAction(bare, 0, hitFor(30, 0), 1);
  assert.ok(step.state.player.currentHp < bare.player.currentHp, 'flesh takes the spill');
  assert.equal(step.state.playerMalfunctioning, false, 'no implants, no malfunction');
});

test('structure soaks physical hits first and malfunctions at zero; special goes to health and heats', () => {
  seedRandom(3);
  const s = fight({ player: withImplants() });
  const hard = Fight.resolveFoeAction(s, 0, hitFor(60, 1), 1);
  assert.equal(hard.state.player.currentStructuralHp, 0, 'physical wears the structure bar down first');
  assert.equal(hard.state.playerMalfunctioning, true);
  assert.ok(hard.state.player.currentHp < s.player.currentHp, 'what structure cannot soak reaches health');
  const hot = Fight.resolveFoeAction(s, 0, hitFor(60, 0), 1);
  assert.equal(hot.state.player.currentStructuralHp, 10, 'special goes past structure');
  assert.ok(hot.state.player.currentHp < s.player.currentHp);
  assert.ok(hot.state.playerHeat > s.playerHeat, 'special damage heats the target');
});

test('stepping out of a telegraphed heavy dodges it', () => {
  const heavy: CombatAction = { ...hitFor(40), isHeavy: true, attackPattern: 'melee' };
  const wound = Fight.telegraphHeavy(fight(), 0, heavy).state;
  assert.equal(wound.foes[0].chargingHeavy, true);
  const stayed = Fight.releaseHeavy(wound, 0);
  assert.equal(stayed.connects, true);
  const moved = Fight.releaseHeavy({ ...wound, grid: { ...wound.grid, playerPosition: { row: 8, col: 0 } } }, 0);
  assert.equal(moved.connects, false);
  assert.equal(moved.state.foes[0].pendingAction, null);
});

test('enemies wind up heavies from their own heat, not yours', () => {
  const cool = (s: FightState) => ({ ...s, foes: s.foes.map(f => ({ ...f, heat: 10 })) });
  for (let k = 0; k < 40; k++) {
    seedRandom(k);
    // A cool enemy holds its heavies however hot you run
    const { action } = Fight.chooseFoeAction(cool(fight({ playerHeat: 95 })), 0);
    assert.ok(!action?.isHeavy);
  }
});

test('heat: hot attacks gain their maker\'s effect, venting hot bursts out, 100 burns you out', () => {
  const move = { type: 'attack', name: 'Slam', description: '', damage: 10, accuracy: 'variable', physicalRatio: 0.7, attackPattern: 'melee', maker: 'VOLKOV' } as const;
  assert.equal(Fight.hotAction(move, 50), move, 'not hot yet');
  assert.equal(Fight.hotAction(move, 80).effects?.knock, true, 'Volkov knocks back when hot');
  assert.equal(Fight.hotAction({ ...move, maker: undefined }, 80).heatTransfer, Fight.HEAT.defaultPush, 'no maker: pushes heat');
  // Bracing from high heat hurts the enemy beside you; from low heat it doesn't
  const s = fight();
  const brace = { type: 'brace', name: 'Brace', description: '', defenseBoost: 8, heatGenerated: -25 } as const;
  const hp = (st: FightState) => st.foes[0].unit.currentHp;
  assert.ok(hp(Fight.resolveBrace({ ...s, playerHeat: 80 }, brace).state) < hp(s));
  assert.equal(hp(Fight.resolveBrace({ ...s, playerHeat: 40 }, brace).state), hp(s));
  // Burnout: hurt, heat back to 50, next turn lost
  const events: Fight.FightEvent[] = [];
  const out = Fight.burnout({ ...s, playerHeat: 100 }, events);
  assert.equal(out.playerHeat, Fight.HEAT.burnoutLeft);
  assert.ok(out.player.currentHp < s.player.currentHp);
  assert.equal(out.playerStunned, true);
  assert.ok(hp(out) < hp(s), 'the burst hits the enemy beside you');
});

test('ending a turn on a hazard burns you, and can finish you', () => {
  const s = fight({ grid: arena([5, 3], [0, 3], [5, 3, 8]) });
  assert.equal(Fight.applyPlayerHazard(s).state.player.currentHp, s.player.currentHp - 8);
  const low = { ...s, player: { ...s.player, currentHp: 5 } };
  assert.ok(Fight.isOver(Fight.applyPlayerHazard(low)));
});

test('Overclock does not use up the turn; other stims do', () => {
  const s = fight();
  const oc = Fight.resolveConsumable(s, { id: 'o', name: 'Overclock', rarity: 'rare', type: 'consumable', consumableEffect: 'overclock', icon: '' });
  assert.equal(oc.endsTurn, false); assert.equal(oc.state.overclockActive, true);
  const flush = Fight.resolveConsumable({ ...s, playerHeat: 80 }, { id: 'h', name: 'Heat Flush', rarity: 'common', type: 'consumable', consumableEffect: 'heat_flush', icon: '' });
  assert.equal(flush.endsTurn, true); assert.equal(flush.state.playerHeat, 0);
});

test('a hot player takes more damage than a cool one', () => {
  const cool = fight({ playerHeat: 10 }), hot = fight({ playerHeat: 95 });
  seedRandom(5); const a = Fight.resolveFoeAction(cool, 0, hitFor(30, 1), 5);
  seedRandom(5); const b = Fight.resolveFoeAction(hot, 0, hitFor(30, 1), 5);
  assert.ok(cool.player.currentHp - a.state.player.currentHp < hot.player.currentHp - b.state.player.currentHp);
});

// ── Several enemies ──────────────────────────────────────────────────────────

function crowd(): FightState {
  const grid = arena([5, 3], [4, 3]);
  return fight({ grid, foes: [Fight.newFoe(createBoss(3), { row: 4, col: 3 }, 40), Fight.newFoe(createBoss(3), { row: 4, col: 4 }, 40), Fight.newFoe(createBoss(3), { row: 0, col: 0 }, 40)] });
}

test('an area attack hits every enemy in the struck tiles, not just the target', () => {
  seedRandom(11);
  const s = crowd();
  const strike = { ...PLAYER_ACTIONS[0], accuracy: 'precise' as const, attackPattern: 'sweep_arc' as const }; // the arc in front
  assert.deepEqual(Fight.foesStruck(s, strike, 'none'), [0, 1]);
  const after = Fight.resolvePlayerAttack(s, strike).state;
  assert.ok(after.foes[0].unit.currentHp < s.foes[0].unit.currentHp);
  assert.ok(after.foes[1].unit.currentHp < s.foes[1].unit.currentHp);
  assert.equal(after.foes[2].unit.currentHp, s.foes[2].unit.currentHp, 'the far enemy is untouched');
});

test('when the target falls, aim moves to a living enemy; the last one ends the fight', () => {
  const s = crowd();
  const dying = { ...s, foes: s.foes.map((f, i) => (i === 0 ? { ...f, unit: { ...f.unit, currentHp: 1 } } : f)) };
  seedRandom(12);
  const step = Fight.resolvePlayerAttack(dying, { ...PLAYER_ACTIONS[0], accuracy: 'precise', attackPattern: 'melee_long' });
  assert.ok(step.events.some(e => e.kind === 'foeDown'));
  assert.notEqual(step.state.target, 0);
  assert.ok(!step.events.some(e => e.kind === 'allFoesDown'));
  const last = { ...s, foes: [{ ...s.foes[0], unit: { ...s.foes[0].unit, currentHp: 1 } }] };
  seedRandom(13);
  assert.ok(Fight.resolvePlayerAttack(last, { ...PLAYER_ACTIONS[0], accuracy: 'precise' }).events.some(e => e.kind === 'allFoesDown'));
});

test('you can only aim at living enemies', () => {
  const s = crowd();
  const dead = { ...s, foes: s.foes.map((f, i) => (i === 1 ? { ...f, unit: { ...f.unit, currentHp: 0 } } : f)) };
  assert.equal(Fight.setTarget(dead, 1).target, 0);
  assert.equal(Fight.setTarget(dead, 2).target, 2);
});

test('enemies block movement and each other', () => {
  const s = crowd();
  const reach = getReachableTiles(s.grid.playerPosition, Fight.playerView(s), 2);
  assert.ok(!reach.has('4,3') && !reach.has('4,4'), 'cannot walk onto an enemy');
  const walked = Fight.moveFoeToward(s, 2, 'melee').state.foes[2].pos;
  assert.ok(!s.foes.slice(0, 2).some(f => f.pos.row === walked.row && f.pos.col === walked.col));
});

test('shapes: a strike hits one tile, a lunge only 2 away, a shot needs a clear line', () => {
  const g = arena([5, 3], [4, 3]);
  assert.deepEqual(getHitTiles({ row: 5, col: 3 }, { row: 4, col: 3 }, 'melee', g), [{ row: 4, col: 3 }]);
  assert.equal(canHitTarget({ row: 5, col: 3 }, { row: 4, col: 3 }, 'lunge', g), false);
  assert.equal(canHitTarget({ row: 5, col: 3 }, { row: 3, col: 5 }, 'lunge', g), true);
  const open = { ...g, bossPosition: { row: 1, col: 3 } };
  assert.equal(canHitTarget({ row: 5, col: 3 }, { row: 1, col: 3 }, 'ranged', open), true);
  const tiles = open.tiles.map(r => r.slice());
  tiles[3][3] = { type: 'obstacle', name: 'Crate' } as any;
  assert.equal(canHitTarget({ row: 5, col: 3 }, { row: 1, col: 3 }, 'ranged', { ...open, tiles }), false, 'cover blocks the shot');
  assert.equal(canHitTarget({ row: 5, col: 3 }, { row: 2, col: 4 }, 'ranged', open), false, 'not on a line');
  assert.equal(getHitTiles({ row: 4, col: 3 }, { row: 6, col: 3 }, 'ring', g).length, 16);
  assert.equal(getHitTiles({ row: 0, col: 3 }, { row: 5, col: 3 }, 'beam', g).length, 8);
});

test('a heavy locks its tiles: a beam hits whoever is in that column, not where you go', () => {
  const beam: CombatAction = { ...hitFor(30), isHeavy: true, attackPattern: 'beam' };
  const s = fight({ grid: arena([6, 3], [1, 3]) });
  const wound = Fight.telegraphHeavy(s, 0, beam).state;
  assert.ok(wound.foes[0].pendingTiles!.every(t => t.col === 3));
  const stepped = { ...wound, grid: { ...wound.grid, playerPosition: { row: 6, col: 4 } } };
  assert.equal(Fight.releaseHeavy(stepped, 0).connects, false, 'one step sideways dodges it');
  assert.equal(Fight.releaseHeavy({ ...wound, grid: { ...wound.grid, playerPosition: { row: 8, col: 3 } } }, 0).connects, true, 'backing off down the column does not');
});

test('knockback pushes you a tile straight back when there is room', () => {
  const kick: CombatAction = { ...hitFor(5), attackPattern: 'knockback' };
  seedRandom(5);
  const r = Fight.resolveFoeAction(fight(), 0, kick, 1);
  assert.deepEqual(r.state.grid.playerPosition, { row: 6, col: 3 });
});

test('knockback into cover: no move, collision damage, stunned', () => {
  const kick: CombatAction = { ...hitFor(20), attackPattern: 'knockback' };
  const g = arena([5, 3], [4, 3]);
  g.tiles[6][3] = { type: 'obstacle', name: 'Crate stack' } as any;
  seedRandom(5);
  const plain = Fight.resolveFoeAction(fight({ grid: arena([5, 3], [4, 3]) }), 0, kick, 1).state;
  seedRandom(5);
  const r = Fight.resolveFoeAction(fight({ grid: g }), 0, kick, 1);
  assert.deepEqual(r.state.grid.playerPosition, { row: 5, col: 3 });
  assert.ok(r.state.player.currentHp <= plain.player.currentHp - Fight.COLLISION.min);
  assert.equal(r.state.playerStunned, true);
});

test('knocked into another body: both take the impact', () => {
  const kick: CombatAction = { ...hitFor(20), attackPattern: 'knockback' };
  const s = fight();
  const behind = Fight.newFoe(createBoss(3), { row: 2, col: 3 }, 40);
  const crowd = { ...s, grid: arena([5, 3], [3, 3]), foes: [{ ...s.foes[0], pos: { row: 3, col: 3 } }, behind] };
  seedRandom(6);
  const r = Fight.resolvePlayerAttack(crowd, { ...kick, accuracy: 'precise' }).state;
  assert.deepEqual(r.foes[0].pos, { row: 3, col: 3 }, 'nowhere to go');
  assert.equal(r.foes[0].stunned, true);
  assert.ok(r.foes[1].unit.currentHp < behind.unit.currentHp, 'the one behind is hurt too');
});

test('a stunned enemy loses its turn and any wound-up heavy', () => {
  const heavy: CombatAction = { ...hitFor(40), isHeavy: true, attackPattern: 'melee' };
  const wound = Fight.telegraphHeavy(fight(), 0, heavy).state;
  const stunned = { ...wound, foes: [{ ...wound.foes[0], stunned: true }] };
  const r = Fight.foeTurn(stunned, 0, 1);
  assert.equal(r.state.player.currentHp, stunned.player.currentHp);
  assert.equal(r.state.foes[0].pendingAction, null);
  assert.equal(r.state.foes[0].stunned, false);
});

test('ending a turn on a fuel fire sets you burning, which ticks for two turns', () => {
  const g = arena([5, 3], [1, 3]);
  g.tiles[5][3] = { type: 'hazard', name: 'Fuel fire', hazardDamage: 8, art: 'fire' } as any;
  // (structure broken, so no mending covers the burn)
  const lit = Fight.applyPlayerHazard(fight({ grid: g, player: { ...createPlayer(), currentStructuralHp: 0 } })).state;
  assert.equal(lit.playerBurning, Fight.BURN.turns);
  const t1 = Fight.playerConditions(lit);
  assert.ok(t1.state.player.currentHp < lit.player.currentHp);
  assert.equal(t1.state.playerBurning, 1);
  assert.equal(Fight.playerConditions(Fight.playerConditions(t1.state).state).state.playerBurning, 0);
});

test('a stunned player loses one turn, then acts normally', () => {
  const r = Fight.playerConditions(fight({ playerStunned: true }));
  assert.equal(r.skipTurn, true);
  assert.equal(r.state.playerStunned, false);
  assert.equal(Fight.playerConditions(r.state).skipTurn, false);
});

test('overload fills from trading blows; a full meter surges every enemy within 2 tiles', () => {
  seedRandom(7);
  const hit = Fight.resolveFoeAction(fight(), 0, hitFor(30), 3).state;
  assert.ok(hit.overload > 0, 'taking a hit fills it');
  const s = fight({ overload: 100, playerHeat: 70 });
  const far = Fight.newFoe(createBoss(3), { row: 0, col: 0 }, 40);
  const crowd = { ...s, foes: [s.foes[0], far] };
  assert.equal(Fight.canSurge(crowd), true);
  assert.deepEqual(Fight.surgeTargets(crowd), [0]);
  const r = Fight.resolveSurge(crowd, 20).state;
  assert.ok(r.foes[0].unit.currentHp < crowd.foes[0].unit.currentHp);
  assert.equal(r.foes[1].unit.currentHp, far.unit.currentHp, 'out of reach');
  assert.equal(r.overload, 0);
  assert.equal(r.playerHeat, 0, 'heat vents');
  assert.equal(Fight.canSurge({ ...crowd, overload: 99 }), false);
});

test('an enemy burns once per turn, not all at once', () => {
  const s = fight({ grid: arena([8, 0], [1, 6]) });
  const lit = { ...s, foes: [{ ...s.foes[0], burning: 2 }] };
  const r = Fight.foeTurn(lit, 0, 1).state;
  assert.equal(r.foes[0].burning, 1);
});

test('implant traits: optic shoots, leg moves further, spine braces, ears stop flanking', () => {
  const base = fight();
  const withTraits = (traits: string[]) => ({ ...base, foes: [{ ...base.foes[0], unit: { ...base.foes[0].unit, traits } }] });
  assert.ok(Fight.foeRoster(withTraits(['sighted']).foes[0]).some(a => a.attackPattern === 'ranged'));
  // Fast: walks 3 tiles instead of 2 toward a far target
  const far = { ...withTraits(['fast']), grid: arena([8, 3], [0, 3]) };
  const plain = { ...withTraits([]), grid: arena([8, 3], [0, 3]) };
  const melee = 'melee' as const;
  assert.equal(Fight.moveFoeToward(far, 0, melee).state.foes[0].pos.row - Fight.moveFoeToward(plain, 0, melee).state.foes[0].pos.row, 1);
  // Braced takes less from the same hit
  const strike = { ...PLAYER_ACTIONS[0], damage: 60, accuracy: 'precise' as const };
  const sturdy = (t: string[]) => { const x = withTraits(t); return { ...x, foes: [{ ...x.foes[0], unit: { ...x.foes[0].unit, currentHp: 9999, maxHp: 9999 } }] }; };
  seedRandom(9); const hitPlain = 9999 - Fight.resolvePlayerAttack(sturdy([]), strike).state.foes[0].unit.currentHp;
  seedRandom(9); const hitBraced = 9999 - Fight.resolvePlayerAttack(sturdy(['braced']), strike).state.foes[0].unit.currentHp;
  assert.ok(hitBraced < hitPlain);
});

test('chapter bosses: the Fitter guards threat 20 and turns faster below half health', () => {
  seedRandom(3);
  const fitter = createBoss(20);
  assert.equal(fitter.name, 'The Fitter');
  assert.ok(fitter.traits!.includes('armed'));
  assert.ok(fitter.carried!.some(i => i.signature && i.name.includes("Fitter's Crane Arm")), 'it wears its signature arm');
  assert.equal(createBoss(30).name, 'The Listener');
  const s = fight({ grid: arena([8, 3], [0, 3]) });
  const hurtBoss = { ...s, foes: [{ ...Fight.newFoe({ ...fitter, currentHp: Math.floor(fitter.maxHp * 0.4) }, { row: 0, col: 3 }, 40) }] };
  const r = Fight.foeTurn(hurtBoss, 0, 20);
  assert.equal(r.state.foes[0].enraged, true);
  assert.ok(r.state.foes[0].unit.traits!.includes('fast'));
  assert.ok(r.events.some(e => e.kind === 'log' && /fresh leg/.test(e.message)));
});

// ── Aiming and honest danger zones ──────────────────────────────────────────

test('enemies attack from where they stand, then walk; out of reach they only walk', () => {
  const far = fight({ grid: arena([8, 3], [0, 3]) });
  seedRandom(21);
  const walk = Fight.foeTurn(far, 0, 3);
  assert.equal(walk.state.player.currentHp, far.player.currentHp, 'no hit after walking up');
  assert.equal(walk.walkAfter, false);
  assert.ok(walk.state.foes[0].pos.row > 0, 'it closed in');

  const close = fight({ playerHeat: 0 });
  let hits = 0;
  for (let k = 0; k < 20; k++) {
    seedRandom(100 + k);
    const r = Fight.foeTurn(close, 0, 3);
    if (r.state.player.currentHp < close.player.currentHp) { hits++; assert.equal(r.walkAfter, true); }
  }
  assert.ok(hits > 0, 'next to you, it attacks');
});

test('ending your turn outside the red tiles means no enemy can hit you', () => {
  for (const name of [3, 7, 12]) {
    for (let k = 0; k < 30; k++) {
      seedRandom(300 + k);
      const pr = 1 + (k % 8), pc = k % 7;
      const s = fight({ playerHeat: 0, grid: arena([pr, pc], [(pr + 2 + (k % 3)) % 9, (pc + k) % 7]) });
      const foe = { ...Fight.newFoe(createBoss(name), s.grid.bossPosition, 40), unit: { ...createBoss(name), traits: ['sighted'] } };
      const st = { ...s, foes: [foe] };
      if (st.foes[0].pos.row === pr && st.foes[0].pos.col === pc) continue;
      const safe = !Fight.foeThreatTiles(st, 0).has(`${pr},${pc}`);
      const r = Fight.foeTurn(st, 0, name);
      if (safe) assert.equal(r.state.player.currentHp, st.player.currentHp, `hit outside the red at ${pr},${pc}`);
    }
  }
});

test('an aim hits everyone on its tiles; the best aim takes the most enemies', () => {
  const s = crowd(); // foes at 4,3 and 4,4; player at 5,3
  const sweep = { ...PLAYER_ACTIONS[0], attackPattern: 'sweep_arc' as const };
  assert.deepEqual(Fight.struckAt(s, sweep, 'none', { row: 4, col: 3 }), [0, 1]);
  assert.deepEqual(Fight.struckAt(s, sweep, 'none', { row: 5, col: 4 }), [1], 'a sideways arc only reaches one');
  assert.deepEqual(Fight.foesStruck(s, sweep, 'none'), [0, 1]);
  const strike = { ...PLAYER_ACTIONS[0], attackPattern: 'melee' as const };
  assert.equal(Fight.struckAt(s, strike, 'none', { row: 4, col: 4 }).length, 1, 'a single-tile strike hits one');
  assert.deepEqual(Fight.struckAt(s, strike, 'none', { row: 6, col: 3 }), [], 'aiming at empty deck hits nobody');
  // Aiming at the second enemy hits it, whoever the target was
  seedRandom(31);
  const after = Fight.resolvePlayerAttack(s, { ...strike, accuracy: 'precise' }, 'none', { row: 4, col: 4 }).state;
  assert.equal(after.foes[0].unit.currentHp, s.foes[0].unit.currentHp);
  assert.ok(after.foes[1].unit.currentHp < s.foes[1].unit.currentHp);
  assert.equal(after.target, 1, 'the screens follow who was hit');
});

test('arm moves only reach their own side', () => {
  const s = fight({ grid: arena([5, 3], [4, 2]) }); // enemy up and to the left
  const jab = { ...PLAYER_ACTIONS[0], attackPattern: 'melee' as const };
  assert.ok(Fight.canPlayerHit(s, { ...jab, side: 'left' }, 'none'));
  assert.equal(Fight.canPlayerHit(s, { ...jab, side: 'right' }, 'none'), false);
  const above = fight({ grid: arena([5, 3], [4, 3]) });
  assert.ok(Fight.canPlayerHit(above, { ...jab, side: 'right' }, 'none'), 'straight ahead works for either arm');
  assert.ok(Fight.aimableTiles(s, { ...jab, side: 'right' }, 'none').every(t => t.col >= 3));
});

test('walking away from an enemy beside you earns a parting blow; staying beside it does not', () => {
  const start = { row: 5, col: 3 }; // enemy at 4,3
  const away = fight({ grid: arena([6, 3], [4, 3]) });
  assert.deepEqual(Fight.partingFoes(away, start, { row: 6, col: 3 }), [0]);
  seedRandom(41);
  const hit = Fight.partingBlows(away, start, 3);
  assert.ok(hit.state.player.currentHp < away.player.currentHp);
  const along = fight({ grid: arena([5, 4], [4, 3]) });
  assert.deepEqual(Fight.partingFoes(along, start, { row: 5, col: 4 }), [], 'still beside it');
  const stunned = { ...away, foes: [{ ...away.foes[0], stunned: true }] };
  assert.deepEqual(Fight.partingFoes(stunned, start, { row: 6, col: 3 }), [], 'a stunned enemy lets you go');
});

test('knocked into the sea: it hurts, it cannot be hit, and climbing out costs its next turn', () => {
  const grid = arena([5, 3], [4, 3]);
  grid.tiles[3][3] = { type: 'void' } as any; // open water behind the enemy
  const s = fight({ grid });
  const events: any[] = [];
  const wet = Fight.knockBack(s, { row: 5, col: 3 }, { kind: 'foe', i: 0 }, 40, events);
  assert.equal(wet.foes[0].swimming, true);
  assert.deepEqual(wet.foes[0].pos, { row: 3, col: 3 });
  assert.ok(wet.foes[0].unit.currentHp < s.foes[0].unit.currentHp, 'the fall hurts');
  assert.ok(wet.foes[0].unit.currentHp > 0, "but doesn't drown it");
  const jab = { ...PLAYER_ACTIONS[0], attackPattern: 'melee_long' as const };
  assert.equal(Fight.canPlayerHit(wet, jab, 'none'), false, "can't be hit in the water");
  assert.equal(Fight.foeThreatTiles(wet, 0).size, 0, 'no threat while climbing out');
  seedRandom(51);
  const climb = Fight.foeTurn(wet, 0, 3);
  assert.equal(climb.state.foes[0].swimming, false);
  assert.equal(climb.state.player.currentHp, wet.player.currentHp, 'climbing out is its whole turn');
  assert.notEqual(climb.state.grid.tiles[climb.state.foes[0].pos.row][climb.state.foes[0].pos.col].type, 'void');
});

test('the player in the sea is left alone, then spends the next turn climbing out', () => {
  const grid = arena([5, 3], [2, 3]);
  grid.tiles[6][3] = { type: 'void' } as any;
  const s = fight({ grid, playerHeat: 0 });
  const wet = Fight.knockBack(s, { row: 4, col: 3 }, { kind: 'player' }, 40, []);
  assert.equal(wet.playerSwimming, true);
  seedRandom(52);
  assert.equal(Fight.chooseFoeAction(wet, 0).action, null, 'nothing to hit');
  const turn = Fight.playerConditions(wet);
  assert.equal(turn.skipTurn, true);
  assert.equal(turn.state.playerSwimming, false);
});

test('climbing out of the sea costs health as well as the turn', () => {
  const grid = arena([5, 3], [2, 3]);
  grid.tiles[6][3] = { type: 'void' } as any;
  const s = fight({ grid, playerHeat: 0 });
  const wet = Fight.knockBack(s, { row: 4, col: 3 }, { kind: 'player' }, 40, []);
  const turn = Fight.playerConditions({ ...wet, player: { ...wet.player, currentStructuralHp: 0 } });
  const cost = Math.max(Fight.WATER.min, Math.round(wet.player.maxHp * Fight.WATER.share));
  assert.equal(turn.state.player.currentHp, wet.player.currentHp - cost);
  assert.ok(JSON.stringify(turn.events).includes('turn lost'), 'the log says the turn is gone');
});

test('thrown onto a damaging tile: it hits at once, as hard as a slam, and fire sets them alight', () => {
  const grid = arena([5, 3], [4, 3]);
  grid.tiles[3][3] = { type: 'hazard', name: 'Fuel fire', hazardDamage: 8, art: 'fire' } as any;
  const s = fight({ grid });
  const thrown = Fight.knockBack(s, { row: 5, col: 3 }, { kind: 'foe', i: 0 }, 60, []);
  assert.deepEqual(thrown.foes[0].pos, { row: 3, col: 3 });
  assert.equal(s.foes[0].unit.currentHp - thrown.foes[0].unit.currentHp, Math.round(60 * Fight.COLLISION.share * s.perks.collisionMult));
  assert.equal(thrown.foes[0].burning, Fight.BURN.turns);
  assert.ok(!thrown.foes[0].stunned, 'no stun: nothing solid was hit');
  const light = Fight.knockBack(s, { row: 5, col: 3 }, { kind: 'foe', i: 0 }, 5, []);
  assert.equal(s.foes[0].unit.currentHp - light.foes[0].unit.currentHp, 8, 'never less than the tile itself');
  const filtered = { ...s, foes: [{ ...s.foes[0], unit: { ...s.foes[0].unit, traits: ['filtered'] } }] } as any;
  assert.equal(Fight.knockBack(filtered, { row: 5, col: 3 }, { kind: 'foe', i: 0 }, 60, []).foes[0].unit.currentHp, s.foes[0].unit.currentHp, 'filtered enemies shrug it off');
});

// ── Implant parts and the new shapes ────────────────────────────────────────

test('bolts stop at the first body, pierces go through, long shots skip the near tiles, lobs hit a plus', () => {
  const g = arena([8, 3], [4, 3]);
  const occ = { ...g, occupied: [{ row: 6, col: 3 }] };
  const bolt = getHitTiles({ row: 8, col: 3 }, { row: 6, col: 3 }, 'bolt', occ);
  assert.deepEqual(bolt.at(-1), { row: 6, col: 3 }, 'stops on the first body');
  assert.equal(getHitTiles({ row: 8, col: 3 }, { row: 4, col: 3 }, 'bolt', occ).length, 0, "can't aim past it");
  assert.ok(getHitTiles({ row: 8, col: 3 }, { row: 4, col: 3 }, 'pierce', occ).some(t => t.row === 6), 'pierce goes through');
  assert.equal(getHitTiles({ row: 8, col: 3 }, { row: 7, col: 3 }, 'longshot', g).length, 0, 'useless up close');
  assert.ok(getHitTiles({ row: 8, col: 3 }, { row: 0, col: 3 }, 'longshot', arena([8, 3], [0, 3])).length > 0, 'reaches the far edge');
  assert.equal(getHitTiles({ row: 8, col: 3 }, { row: 5, col: 3 }, 'lob', g).length, 5);
  assert.equal(getHitTiles({ row: 5, col: 3 }, { row: 4, col: 3 }, 'burst', g).length, 8);
});

test('implant parts: commons get basic heads and no mods, legendaries get two, and the same seed rolls the same parts', async () => {
  const { rollParts, HEADS, DEF_HEADS } = await import('../client/src/lib/combat/augments');
  const arm = (rarity: any, name = '[CBN] Test Arm') => ({ id: 'x', name, rarity, type: 'augmentation' as const, slot: 'right_arm' as const, icon: '' });
  for (let k = 0; k < 30; k++) {
    seedRandom(k);
    const c = rollParts(arm('common'))!;
    assert.ok(HEADS[c.head]?.basic || c.head in DEF_HEADS, 'commons only roll basic heads (or a defensive move)');
    assert.equal(c.mods.length, 0);
    const l = rollParts(arm('legendary'))!;
    assert.ok(l.mods.length >= 1 || HEADS[l.head]?.signature, 'legendaries carry mods or a signature');
  }
  seedRandom(9); const a = rollParts(arm('epic'));
  seedRandom(9); const b = rollParts(arm('epic'));
  assert.deepEqual(a, b);
  assert.ok(rollParts(arm('rare', '[HELIX] Housing'))!.head in DEF_HEADS, 'Helix arms are always defensive moves, built from parts');
});

test('wide shapes hit every enemy in them, common parts included', () => {
  const s = crowd(); // player 5,3; foes 4,3 and 4,4
  const hook = { ...PLAYER_ACTIONS[0], attackPattern: 'sweep_arc' as const };
  assert.equal(Fight.struckAt(s, hook, 'none', { row: 4, col: 3 }).length, 2);
  assert.ok(Fight.hitsMany(hook));
  // A common part can roll a wide shape, and no longer narrows to the nearest enemy
  const commonArm = ITEMS_2059.find(i => i.type === 'augmentation' && i.slot === 'right_arm' && i.rarity === 'common' && !i.id.startsWith('hx'))!;
  const shapes = new Set<string>();
  for (let k = 0; k < 60; k++) { seedRandom(k); const it = { ...commonArm, id: `c${k}`, parts: rollParts(commonArm) }; const a = actionForItem(it)!; shapes.add(a.attackPattern!); assert.ok(!a.effects?.focus); }
  assert.ok(shapes.has('sweep_arc') || shapes.has('cone'), 'common arms can sweep or spread');
  // The old narrowing still works if a part ever asks for it
  assert.equal(Fight.struckAt(s, { ...hook, effects: { focus: true } }, 'none', { row: 4, col: 3 }).length, 1);
});

test('pull drags an enemy to you; bleed ticks on its turn; drain heals; a hit-and-run step dodges the parting blow', () => {
  const far = fight({ grid: arena([8, 3], [5, 3]), player: { ...createPlayer(), currentHp: 50 } });
  const grab = { ...PLAYER_ACTIONS[0], damage: 10, accuracy: 'precise' as const, attackPattern: 'grapple' as const, effects: { pull: true, bleed: true, drain: 0.5 } };
  seedRandom(61);
  const pulled = Fight.resolvePlayerAttack(far, grab, 'none', { row: 5, col: 3 }).state;
  assert.deepEqual(pulled.foes[0].pos, { row: 7, col: 3 }, 'dragged to the tile beside you');
  assert.equal(pulled.foes[0].bleeding, 2);
  assert.ok(pulled.player.currentHp > 50, 'drain heals');
  const hp = pulled.foes[0].unit.currentHp;
  seedRandom(62);
  assert.ok(Fight.foeTurn(pulled, 0, 3).state.foes[0].unit.currentHp < hp, 'bleeds on its turn');

  const close = fight({ grid: arena([5, 3], [4, 3]) });
  const cut = { ...PLAYER_ACTIONS[0], accuracy: 'precise' as const, attackPattern: 'melee' as const, effects: { retreat: true } };
  seedRandom(63);
  const ran = Fight.resolvePlayerAttack(close, cut, 'none', { row: 4, col: 3 }).state;
  assert.deepEqual(ran.grid.playerPosition, { row: 6, col: 3 });
  assert.equal(Fight.partingBlows(ran, { row: 5, col: 3 }, 3).events.length, 0, 'no parting blow');
});

test('a dash carries you to the end of the lane; ignore-cover shots fly through crates', () => {
  const s = fight({ grid: arena([8, 3], [6, 3]) });
  const dash = { ...PLAYER_ACTIONS[0], accuracy: 'precise' as const, attackPattern: 'charge' as const, effects: { dash: true } };
  seedRandom(64);
  const after = Fight.resolvePlayerAttack(s, dash, 'none', { row: 6, col: 3 }).state;
  assert.deepEqual(after.grid.playerPosition, { row: 5, col: 3 }, 'past the enemy to the lane end');
  const g = arena([8, 3], [4, 3]); g.tiles[6][3] = { type: 'obstacle', name: 'Crate stack' } as any;
  const shot = { ...PLAYER_ACTIONS[0], attackPattern: 'bolt' as const };
  const behind = fight({ grid: g });
  assert.equal(Fight.canPlayerHit(behind, shot, 'none'), false, 'cover blocks a plain bolt');
  assert.ok(Fight.canPlayerHit(behind, { ...shot, effects: { ignoreCover: true } }, 'none'));
});

test('enemy moves carry side effects: a hook drags you in, a bleed ticks on your turn, and purple tiles warn of it', () => {
  const s = fight({ grid: arena([7, 3], [3, 3]), playerHeat: 0 });
  const hook: CombatAction = { type: 'attack', name: 'Crane Hook', description: '', damage: 10, accuracy: 'precise', attackPattern: 'grapple', effects: { pull: true, bleed: true } };
  seedRandom(71);
  const hit = Fight.resolveFoeAction({ ...s, grid: { ...s.grid, playerPosition: { row: 6, col: 3 } } }, 0, hook, 3);
  assert.deepEqual(hit.state.grid.playerPosition, { row: 4, col: 3 }, 'dragged up to the enemy');
  assert.equal(hit.state.playerBleeding, 2);
  const turn = Fight.playerConditions(hit.state);
  assert.ok(turn.state.player.currentHp < hit.state.player.currentHp, 'bleeds at the start of your turn');
  const boarder = { ...s.foes[0], unit: { ...createBoss(6), name: 'SALV Boarder' } };
  const st = { ...s, foes: [boarder] };
  const shoves = Fight.foeThreatTiles(st, 0, true);
  assert.ok(shoves.size > 0, 'the hook shows as purple-edged tiles');
  assert.ok(Array.from(shoves).every(k => Fight.foeThreatTiles(st, 0).has(k)), 'inside the red zone');
});

// ── Speed and turn order ──
const imp = (maker: string) => ({ id: maker, name: `[${maker}] Part`, rarity: 'common', type: 'augmentation', slot: 'lungs', icon: '' }) as any;
const carrying = (s: FightState, i: number, makers: string[]): FightState =>
  ({ ...s, foes: s.foes.map((f, n) => (n === i ? { ...f, unit: { ...f.unit, carried: makers.map(imp), traits: [] } } : f)) });

test('speed: base plus the average drive of the implants; hot, slowed and hasted shift it', () => {
  assert.equal(Fight.implantDrive([]), 0);
  assert.equal(Fight.implantDrive([imp('VOLKOV'), imp('HELIX')]), 0.5);
  const s = carrying(fight({ playerDrive: 1 }), 0, ['VOLKOV', 'IOA']);
  assert.equal(Fight.speedOf(s, 'player'), 11);
  assert.equal(Fight.speedOf(s, 0), 12.5);
  assert.equal(Fight.speedOf({ ...s, playerHeat: 90 }, 'player'), 9, 'very hot: -2');
  assert.equal(Fight.speedOf({ ...s, playerSlowed: 1 }, 'player'), 7);
  assert.equal(Fight.speedOf({ ...s, playerHasted: 2 }, 'player'), 15);
});

test('the turn clock: faster bodies act more often, the player winning ties', () => {
  const base = fight();
  const two = { ...base, foes: [base.foes[0], Fight.newFoe(createBoss(3), { row: 1, col: 1 }, 40)] };
  const s = carrying(carrying(two, 0, ['HELIX']), 1, ['VOLKOV']);
  // Speeds: player 10, foe 0 at 8, foe 1 at 13. The fast one opens.
  const c = Fight.startClock(s);
  assert.equal(Fight.nextUp(s, c).who, 1);
  const ahead = Fight.forecast(s, c, 40);
  const count = (a: Fight.Actor) => ahead.filter(x => x === a).length;
  assert.ok(count(1) > count('player') && count('player') > count(0), `fast > player > slow (${count(1)}, ${count('player')}, ${count(0)})`);
  // Over a long stretch the share of turns follows speed
  assert.ok(Math.abs(count(1) / count('player') - 1.3) < 0.15);
  // Equal speeds: the player goes first, then foes in order
  const even = carrying(carrying(two, 0, ['PATCHWORK']), 1, ['PATCHWORK']);
  assert.deepEqual(Fight.forecast(even, Fight.startClock(even), 6), ['player', 0, 1, 'player', 0, 1]);
  // The dead don't act
  const dead = { ...s, foes: s.foes.map((f, n) => (n === 1 ? { ...f, unit: { ...f.unit, currentHp: 0 } } : f)) };
  assert.ok(!Fight.forecast(dead, Fight.startClock(dead), 8).includes(1));
});

test('a turn is spent at the speed the body has as it ends: hasted acts sooner, slowed later', () => {
  const s = fight();
  const c = { now: 50, at: { player: 50, 0: 50 } };
  assert.equal(Fight.spendTurn(s, c, 'player').at.player, 150);
  assert.ok(Fight.spendTurn({ ...s, playerHasted: 2 }, c, 'player').at.player < 125);
  assert.ok(Fight.spendTurn({ ...s, playerSlowed: 2 }, c, 'player').at.player > 200);
  assert.equal(Fight.roundOf(0), 1); assert.equal(Fight.roundOf(99.9), 1); assert.equal(Fight.roundOf(100), 2);
});

test('slowed and hasted last two rounds', () => {
  let s = fight({ playerSlowed: 2 });
  s = Fight.tickSpeed(s); assert.equal(s.playerSlowed, 1);
  s = Fight.tickSpeed(s); assert.equal(s.playerSlowed, 0);
  assert.equal(Fight.tickSpeed(s).playerSlowed, 0);
});

test('a foe fast enough to act twice before your next turn is flagged', () => {
  const fast = { ...carrying(fight(), 0, ['VOLKOV']), playerSlowed: 2 };
  // Slowed (speed 6) against 13: it gets two turns in yours
  assert.deepEqual(Fight.doubleTurns(fast, { now: 0, at: { player: 0, 0: 10 } }, 'player'), [0]);
  const even = carrying(fight(), 0, ['PATCHWORK']);
  assert.deepEqual(Fight.doubleTurns(even, { now: 0, at: { player: 0, 0: 10 } }, 'player'), []);
});

test('slow and haste effects: enemy hits slow you; your hits slow them and can haste you', () => {
  seedRandom(5);
  const slowHit = { ...hitFor(10), effects: { slow: true } };
  const hit = Fight.resolveFoeAction(fight(), 0, slowHit, 3, -1);
  assert.equal(hit.state.playerSlowed, Fight.SPEED.statusRounds);
  const mine = { ...PLAYER_ACTIONS[0], accuracy: 'precise' as const, attackPattern: 'melee' as const, effects: { slow: true, haste: true } };
  const st = Fight.resolvePlayerAttack(fight(), mine).state;
  assert.equal(st.foes[0].slowed, Fight.SPEED.statusRounds);
  assert.equal(st.playerHasted, Fight.SPEED.statusRounds);
});

// ── Tides ──
function tidal(): FightState {
  const grid = arena([5, 3], [1, 3]);
  // A band of mud flats across rows 3 and 4
  for (const r of [3, 4]) for (let c = 0; c < grid.cols; c++) grid.tiles[r][c] = { type: 'empty', art: 'mud', tidal: true };
  return fight({ grid, tide: Fight.startTide(grid) });
}

test('tides: boards without mud have none; with mud they start low and turn every 3 rounds', () => {
  assert.equal(Fight.startTide(arena([5, 3], [1, 3])), null);
  let s = tidal();
  assert.deepEqual(s.tide, { high: false, turnsLeft: Fight.TIDE.every });
  s = Fight.tideTick(s).state; s = Fight.tideTick(s).state;
  assert.equal(s.tide!.high, false);
  assert.equal(s.tide!.turnsLeft, 1);
  const step = Fight.tideTick(s);
  assert.equal(step.state.tide!.high, true);
  assert.equal(step.state.grid.tiles[3][0].type, 'void', 'the mud is sea now');
  assert.equal(step.state.grid.tiles[5][0].type, 'empty', 'dry ground stays');
  let back = step.state;
  for (let k = 0; k < Fight.TIDE.every; k++) back = Fight.tideTick(back).state;
  assert.equal(back.tide!.high, false);
  assert.equal(back.grid.tiles[3][0].type, 'empty');
  assert.equal(back.grid.tiles[3][0].art, 'mud');
});

test('a rising tide puts everyone on the mud in the sea, without damage', () => {
  let s = tidal();
  s = { ...s, grid: { ...s.grid, playerPosition: { row: 4, col: 3 } }, foes: [{ ...s.foes[0], pos: { row: 3, col: 3 } }], tide: { high: false, turnsLeft: 1 } };
  const hp = s.player.currentHp, foeHp = s.foes[0].unit.currentHp;
  const after = Fight.tideTick(s).state;
  assert.equal(after.playerSwimming, true);
  assert.equal(after.foes[0].swimming, true);
  assert.equal(after.player.currentHp, hp);
  assert.equal(after.foes[0].unit.currentHp, foeHp);
  // Climbing out next turn lands on dry ground
  const cond = Fight.playerConditions(after);
  assert.equal(cond.skipTurn, true);
  const p = cond.state.grid.playerPosition;
  assert.notEqual(cond.state.grid.tiles[p.row][p.col].type, 'void');
});

test('the Echo wears the last body\'s best implants and fights with their moves', async () => {
  const { createEcho, KING_MULT, createBoss, ECHO_NAME } = await import('../client/src/lib/combat/actions');
  const arm = { id: 'a1', name: '[VOLKOV] Test Arm (R)', rarity: 'epic', type: 'augmentation', slot: 'right_arm', icon: '', attackBonus: 10, parts: { head: 'reach', mods: [] } } as any;
  const lung = { id: 'l1', name: '[HELIX] Test Lung', rarity: 'common', type: 'augmentation', slot: 'lungs', icon: '' } as any;
  seedRandom(3);
  const echo = createEcho([lung, arm]);
  assert.equal(echo.name, ECHO_NAME);
  assert.deepEqual(echo.carried!.map(i => i.slot), ['right_arm', 'lungs'], 'best first');
  assert.ok(echo.carried!.every(i => i.id.startsWith('echo_')), 'its own copies, so stripping them is safe');
  const moves = echo.moves!;
  assert.ok(moves.some(m => m.type === 'attack' && !m.isHeavy && m.attackPattern === 'melee_long'), 'your arm\'s move');
  const heavy = moves.find(m => m.isHeavy)!;
  assert.ok(heavy.name.endsWith('held too long'));
  assert.ok(echo.traits!.includes('armed') && echo.traits!.includes('enduring'));
  // With nothing remembered it still stands, on its own moves
  seedRandom(3);
  const bare = createEcho([]);
  assert.ok(bare.moves!.length > 0);
  seedRandom(3);
  const frame = createBoss(10, false, ECHO_NAME);
  assert.ok(bare.maxHp >= Math.round(frame.maxHp * KING_MULT.hp) - 1, 'a wall like the King');
  // The fight engine uses the Echo's own moves
  const f = Fight.newFoe(echo, { row: 1, col: 3 }, 30);
  assert.deepEqual(Fight.foeRoster(f).filter(a => !a.name.startsWith('Optic')), moves);
});

test('enemies keep off mud the tide is about to take', () => {
  // Mud between the foe (row 1) and the player (row 7): with the tide about to come in, it stops short
  const base = tidal();
  const grid = { ...base.grid, playerPosition: { row: 7, col: 3 } };
  const s: FightState = { ...base, grid, foes: [{ ...base.foes[0], pos: { row: 1, col: 3 } }], tide: { high: false, turnsLeft: 1 } };
  const walked = Fight.moveFoeToward(s, 0, 'melee').state.foes[0].pos;
  assert.notEqual(s.grid.tiles[walked.row][walked.col].tidal, true, 'not on the mud');
  const calm = Fight.moveFoeToward({ ...s, tide: { high: false, turnsLeft: 3 } }, 0, 'melee').state.foes[0].pos;
  assert.ok(calm.row > walked.row, 'with time to spare it crosses');
});

// ── Helix Hills: the alarm and dreamers ──
test('the alarm trips after two rounds, then heats everyone each round; cold pods cool', () => {
  const grid = arena([5, 3], [1, 3]);
  grid.tiles[5][4] = { type: 'obstacle', art: 'pod', name: 'Cold pod', cold: true };
  let s = fight({ grid, playerHeat: 30, alarm: Fight.startAlarm(true) });
  assert.equal(Fight.startAlarm(false), null);
  s = Fight.alarmTick(s).state; assert.equal(s.alarm!.on, false);
  const trip = Fight.alarmTick(s);
  assert.equal(trip.state.alarm!.on, true);
  assert.equal(trip.state.playerHeat, 30, 'tripping costs nothing yet');
  const hot = Fight.alarmTick(trip.state).state;
  assert.equal(hot.playerHeat, 30 - Fight.ALARM.cold, 'beside the pod: cooler');
  assert.equal(hot.foes[0].heat, 40 + Fight.ALARM.heat, 'the foe out in the room heats up');
  assert.equal(Fight.besideColdPod(s, { row: 1, col: 3 }), false);
});

test('a dreamer flinches at most once a fight, onto open ground beside you', () => {
  let moved = 0;
  for (let seed = 1; seed <= 60; seed++) {
    seedRandom(seed);
    const s = fight({ grid: arena([5, 3], [1, 3]) });
    const step = Fight.dreamerFlinch(s);
    if (step.state.flinchUsed) {
      moved++;
      const p = step.state.grid.playerPosition;
      assert.equal(Math.max(Math.abs(p.row - 5), Math.abs(p.col - 3)), 1);
      assert.equal(step.state.grid.tiles[p.row][p.col].type, 'empty');
      assert.deepEqual(Fight.dreamerFlinch(step.state).state, step.state, 'only once');
    }
  }
  assert.ok(moved > 3 && moved < 25, `about one in five (${moved}/60)`);
});

// ── Wind ──
test('wind pushes everyone a tile, downwind first; cover and the edge stop it', () => {
  const grid = arena([5, 3], [5, 4]);
  grid.tiles[5][6] = { type: 'obstacle', art: 'crate', name: 'Crate' };
  // Player at col 3 and foe at col 4 in a row, blowing east: the foe moves to 5, then the player to 4
  const s = fight({ grid, wind: { dir: 'east', turnsLeft: 3 } });
  const a = Fight.windTick(s).state;
  assert.deepEqual(a.foes[0].pos, { row: 5, col: 5 });
  assert.deepEqual(a.grid.playerPosition, { row: 5, col: 4 });
  assert.equal(a.wind!.turnsLeft, 2);
  // Next round the foe is against the crate and stays; the player is stopped by the foe
  const b = Fight.windTick(a).state;
  assert.deepEqual(b.foes[0].pos, { row: 5, col: 5 });
  assert.deepEqual(b.grid.playerPosition, { row: 5, col: 4 });
  assert.equal(Fight.startWind(false), null);
});

test('wind over a drop puts you in the water; it turns every few rounds to a new direction', () => {
  const grid = arena([5, 3], [1, 3]);
  grid.tiles[6][3] = { type: 'void' };
  seedRandom(4);
  const s = fight({ grid, wind: { dir: 'south', turnsLeft: 1 } });
  const step = Fight.windTick(s);
  assert.equal(step.state.playerSwimming, true);
  assert.deepEqual(step.state.grid.playerPosition, { row: 6, col: 3 });
  assert.notEqual(step.state.wind!.dir, 'south');
  assert.equal(step.state.wind!.turnsLeft, Fight.WIND.every);
});

test('with wind, the red zone shows where the push would carry you into a hit', () => {
  // A foe at (2,3) with a melee reach; wind blowing south pushes it to (3,3) and you a tile south too
  const grid = arena([7, 3], [2, 3]);
  const calm = fight({ grid });
  const windy = fight({ grid, wind: { dir: 'south', turnsLeft: 3 } });
  const before = Fight.dangerTiles(calm), after = Fight.dangerTiles(windy);
  assert.ok(before.size > 0 && after.size > 0);
  // Somewhere that's red in calm air is safe once the wind carries you off it, and vice versa
  assert.notDeepEqual(Array.from(after).sort(), Array.from(before).sort());
  // A tile is red only if the push lands you in the pushed foe's reach
  for (const k of Array.from(after)) {
    const [r, c] = k.split(',').map(Number);
    const land = r + 1 < grid.rows ? `${r + 1},${c}` : k;
    const moved = Fight.windTick({ ...windy, wind: { dir: 'south', turnsLeft: 99 } }).state;
    assert.ok(Fight.foeThreatTiles(moved, 0).has(land) || Fight.foeThreatTiles(moved, 0).has(k), k);
  }
  // Previews never roll the game's seeded dice (the wind turning would)
  seedRandom(9); const expected = random();
  seedRandom(9); Fight.dangerTiles({ ...windy, wind: { dir: 'south', turnsLeft: 1 } });
  assert.equal(random(), expected);
});

// ── Orders ──
test('orders: issued every two rounds, bind everyone, and you can rewrite one a fight', () => {
  seedRandom(2);
  assert.equal(Fight.startOrders(false), null);
  let s = fight({ orders: { now: 'precise', turnsLeft: 2, rewritten: false }, playerHeat: 50 });
  s = Fight.ordersTick(s).state; assert.equal(s.orders!.now, 'precise');
  const next = Fight.ordersTick(s).state;
  assert.notEqual(next.orders!.now, 'precise', 'a new order');
  assert.equal(next.orders!.turnsLeft, Fight.ORDERS.every);
  // Rewrite once: vent clears everyone's heat as it comes in
  const vent = Fight.rewriteOrder(s, 'vent').state;
  assert.equal(vent.orders!.now, 'vent');
  assert.equal(vent.playerHeat, 0);
  assert.equal(vent.foes[0].heat, 0);
  assert.deepEqual(Fight.rewriteOrder(vent, 'hold').state, vent, 'only once a fight');
});

test('orders: no heavies, hold position and no shoves do what they say', () => {
  // No heavies: a foe never picks a heavy while the order holds
  const heavyOnly = fight({ playerHeat: 90, orders: { now: 'noHeavies', turnsLeft: 2, rewritten: false } });
  for (let k = 0; k < 20; k++) { seedRandom(k); const a = Fight.chooseFoeAction(heavyOnly, 0).action; assert.ok(!a?.isHeavy); }
  // Hold: nobody walks
  const far = fight({ grid: arena([7, 3], [1, 3]), orders: { now: 'hold', turnsLeft: 2, rewritten: false } });
  assert.deepEqual(Fight.foeWalk(far, 0).state.foes[0].pos, { row: 1, col: 3 });
  assert.deepEqual(Fight.moveFoeToward(far, 0, 'melee').state.foes[0].pos, { row: 1, col: 3 });
  // No shoves: a knockback hit leaves you where you stand
  const shove: CombatAction = { ...hitFor(10), attackPattern: 'knockback' };
  const calm = fight({ orders: { now: 'noShoves', turnsLeft: 2, rewritten: false } });
  assert.deepEqual(Fight.resolveFoeAction(calm, 0, shove, 3, -1).state.grid.playerPosition, calm.grid.playerPosition);
});

test('an enduring boss heals half as much as an enduring regular enemy', () => {
  seedRandom(5);
  const s = fight({ playerHeat: 0, grid: arena([8, 0], [0, 6]) });
  const healOf = (enrage: boolean) => {
    const base = createBoss(12);
    const unit = { ...base, currentHp: Math.round(base.maxHp / 4), traits: ['enduring' as const], enrage: enrage ? { at: 0, gain: [], line: '' } : undefined };
    const st = { ...s, foes: [{ ...Fight.newFoe(unit, s.grid.bossPosition, 0), enraged: true }] };
    const r = Fight.foeTurn(st, 0, 12);
    return { heal: r.state.foes[0].unit.currentHp - unit.currentHp, max: unit.maxHp };
  };
  const plain = healOf(false), boss = healOf(true);
  assert.equal(plain.heal, Math.round(plain.max * Fight.ENDURING.rate));
  assert.equal(boss.heal, Math.round(boss.max * Fight.ENDURING.boss));
});

test('quirk: Sets them alight puts everyone hit on fire', () => {
  seedRandom(21);
  const s = crowd();
  const strike = { ...PLAYER_ACTIONS[0], accuracy: 'precise' as const, attackPattern: 'sweep_arc' as const, effects: { ignite: true } };
  const after = Fight.resolvePlayerAttack(s, strike).state;
  assert.equal(after.foes[0].burning, Fight.BURN.turns);
  assert.equal(after.foes[1].burning, Fight.BURN.turns);
  assert.equal(after.foes[2].burning, 0, 'not the one out of reach');
});

test('quirks: Runs hot and Desperate add damage only when their condition holds', () => {
  const base = fight();
  const hot = { ...PLAYER_ACTIONS[0], effects: { hotBonus: 0.5 } };
  assert.equal(Fight.quirkDamage({ ...base, playerHeat: Fight.QUIRK.hotAt - 1 }, hot), 1);
  assert.equal(Fight.quirkDamage({ ...base, playerHeat: Fight.QUIRK.hotAt }, hot), 1.5);
  const low = { ...PLAYER_ACTIONS[0], effects: { lowBonus: 1 } };
  assert.equal(Fight.quirkDamage(base, low), 1);
  const hurt = { ...base, player: { ...base.player, currentHp: Math.floor(base.player.maxHp * 0.2) } };
  assert.equal(Fight.quirkDamage(hurt, low), 2);
  // The bonus lands in the hit itself
  seedRandom(4); const plain = Fight.resolvePlayerAttack({ ...base, playerHeat: 70 }, { ...PLAYER_ACTIONS[0], accuracy: 'precise' }).state.foes[0].unit.currentHp;
  seedRandom(4); const boosted = Fight.resolvePlayerAttack({ ...base, playerHeat: 70 }, { ...hot, accuracy: 'precise' }).state.foes[0].unit.currentHp;
  assert.ok(boosted < plain, 'running hot hits harder');
});

test('quirk: Reaper vents all heat and guards you up on a takedown, not otherwise', () => {
  seedRandom(9);
  const base = fight({ playerHeat: 80 });
  const reap = { ...PLAYER_ACTIONS[0], accuracy: 'precise' as const, attackPattern: 'melee_long' as const, effects: { reap: true } };
  const miss = Fight.resolvePlayerAttack(base, reap).state;
  assert.ok(miss.playerHeat > 0, 'no takedown, no vent');
  const dying = { ...base, foes: [{ ...base.foes[0], unit: { ...base.foes[0].unit, currentHp: 1 } }] };
  const kill = Fight.resolvePlayerAttack(dying, reap).state;
  assert.equal(kill.playerHeat, 0);
  assert.ok(kill.playerDefenseBoost >= Fight.QUIRK.reapGuard);
});

test('only epic and legendary implants roll quirks', () => {
  const arm = ITEMS_2059.find(i => i.type === 'augmentation' && i.slot === 'right_arm' && !i.signature && !i.id.startsWith('hx'))!;
  const quirky = (rarity: any) => { let n = 0; for (let k = 0; k < 300; k++) { seedRandom(1000 + k); const p = rollParts({ ...arm, rarity }); if (p?.mods.some(m => m in QUIRKS)) n++; } return n; };
  assert.equal(quirky('common'), 0);
  assert.equal(quirky('rare'), 0);
  assert.ok(quirky('epic') > 10);
  assert.ok(quirky('legendary') > quirky('epic'));
});

test('the attack diagram matches the real rules: arm sides and flank bonus', () => {
  const jab = { ...PLAYER_ACTIONS[0], attackPattern: 'melee' as const };
  const left = Fight.attackFootprint({ ...jab, side: 'left' });
  const right = Fight.attackFootprint({ ...jab, side: 'right' });
  const both = Fight.attackFootprint(jab);
  assert.ok(left.tiles.every(t => t.col <= left.me.col), 'a left arm only reaches its own side');
  assert.ok(right.tiles.every(t => t.col >= right.me.col), 'a right arm only reaches its own side');
  assert.ok(both.tiles.some(t => t.col < both.me.col) && both.tiles.some(t => t.col > both.me.col));
  // Every tile it shows can really be aimed at or hit from there
  const at = (r: number, c: number) => both.tiles.find(t => t.row === r && t.col === c)?.mult;
  const { row, col } = both.me;
  assert.equal(at(row - 1, col), 1, 'straight ahead: no bonus');
  assert.equal(at(row, col - 1), 1.15, 'from the side: +15%');
  assert.equal(at(row + 1, col), 1.3, 'from behind: +30%');
});

test('movement is an area: reach grows slowly with points and comes out round', () => {
  assert.equal(Fight.moveTiles(0), 8, 'the eight tiles around you');
  assert.equal(Fight.moveTiles(1), 12, 'one point: two tiles straight out, not a whole 5x5');
  assert.equal(Fight.moveTiles(3), 24, 'three points to fill a 5x5');
  // Each point adds the same floor, so each extra point adds less reach
  const gain = (p: number) => Fight.moveReach(p + 1) - Fight.moveReach(p);
  assert.ok(gain(4) < gain(1));
});

test('attack shapes have sweet spots: some tiles land harder than others', () => {
  const me = { row: 5, col: 5 };
  const up = (d: number) => ({ row: 5 - d, col: 5 });
  const w = (p: Parameters<typeof tileWeight>[0], aim: { row: number; col: number }, t: { row: number; col: number }) => tileWeight(p, me, aim, t);
  assert.ok(w('melee_long', up(2), up(2)) > w('melee_long', up(2), up(1)), 'a reach hits hardest at its tip');
  assert.ok(w('charge', up(3), up(3)) > w('charge', up(3), up(1)), 'a charge hits hardest at the end of its run');
  assert.ok(w('aoe', up(3), up(3)) > w('aoe', up(3), { row: 2, col: 6 }), 'a blast hits hardest at its heart');
  assert.ok(w('sweep_arc', up(1), up(1)) > w('sweep_arc', up(1), { row: 4, col: 6 }), 'a sweep hits hardest in its middle');
  assert.equal(w('melee', up(1), up(1)), 1, 'a strike is one even hit');
});

test('leg moves that carry you: pounce lands beside them, vault lands behind them', () => {
  // Player at (5,3), enemy straight up the column at (3,3)
  const s = fight({ grid: arena([5, 3], [3, 3]) });
  const base = { type: 'attack', name: 'Leg', description: '', damage: 1, accuracy: 'precise', physicalRatio: 1 } as const;
  const pounce = Fight.resolvePlayerAttack(s, { ...base, attackPattern: 'lunge', effects: { pounce: true } }, 'none', { row: 3, col: 3 }).state;
  assert.deepEqual(pounce.grid.playerPosition, { row: 4, col: 3 }, 'pounce: the tile between');
  const near = fight({ grid: arena([4, 3], [3, 3]) });
  const vault = Fight.resolvePlayerAttack(near, { ...base, attackPattern: 'melee', effects: { vault: true } }, 'none', { row: 3, col: 3 }).state;
  assert.deepEqual(vault.grid.playerPosition, { row: 2, col: 3 }, 'vault: over to the far side');
});

test('a targeting part decides how many in the shape are hit, and trades damage for it', () => {
  const s = crowd(); // player 5,3; foes 4,3 and 4,4
  const sweep = { ...PLAYER_ACTIONS[0], attackPattern: 'sweep_arc' as const };
  const aim = { row: 4, col: 3 };
  assert.equal(Fight.struckAt(s, sweep, 'none', aim).length, 2, 'wide: everyone in it');
  const one = Fight.struckAt(s, { ...sweep, maxTargets: 1 }, 'none', aim);
  assert.deepEqual(one.map(i => s.foes[i].pos), [{ row: 4, col: 3 }], 'capped: the one on its strongest tile (the middle of the sweep)');
  // Focused: no tile lands below full strength
  assert.ok(Fight.sweetSpot(sweep, 'none', { row: 5, col: 3 }, aim, { row: 4, col: 4 }) < 1);
  assert.equal(Fight.sweetSpot({ ...sweep, focused: true }, 'none', { row: 5, col: 3 }, aim, { row: 4, col: 4 }), 1);
  // Parts roll a mix: a common sweep can carry a better targeting part, and focused parts hit harder
  const commonArm = ITEMS_2059.find(i => i.type === 'augmentation' && i.slot === 'right_arm' && i.rarity === 'common' && !i.id.startsWith('hx'))!;
  const seen = new Set<string>();
  for (let k = 0; k < 200; k++) { seedRandom(k); const p = rollParts(commonArm); if (p?.targeting) seen.add(p.targeting); }
  assert.ok(seen.has('focused') && seen.has('split2'), 'common wide shapes roll Focused or Split 2');
  const base = { ...commonArm, id: 'z', parts: { head: 'hook', mods: [] as string[] } };
  const focused = actionForItem({ ...base, parts: { ...base.parts, targeting: 'focused' as const } })!;
  const wide = actionForItem({ ...base, parts: { ...base.parts, targeting: 'wide' as const } })!;
  assert.equal(focused.maxTargets, 1);
  assert.equal(wide.maxTargets, undefined);
  assert.ok(focused.damage! > wide.damage!);
});

test("enemy attacks work like yours: sweet spots, and wide shapes hit everyone in them", () => {
  // Enemy at (4,3), player straight below. A reach hits hardest at its tip: standing two away hurts more than hugging it
  const reach: CombatAction = { ...hitFor(40, 1), attackPattern: 'melee_long' };
  const near = fight({ grid: arena([5, 3], [4, 3]) });
  const far = fight({ grid: arena([6, 3], [4, 3]) });
  const lost = (st: FightState, a: CombatAction) => st.player.currentHp - Fight.resolveFoeAction(st, 0, a, 1).state.player.currentHp;
  assert.ok(lost(far, reach) > lost(near, reach), 'the tip of a reach hits harder');
  // The red zone is shaded by how much you'd lose there: the tip of a reach costs more than hugging it
  const withReach = (st: FightState) => ({ ...st, foes: [{ ...st.foes[0], unit: { ...st.foes[0].unit, moves: [reach] } }] });
  const dmg = Fight.dangerDamage(withReach(near), 1);
  assert.ok((dmg.get('6,3') ?? 0) > (dmg.get('5,3') ?? 0), 'standing at the tip costs more');
  // Two enemies that both reach a tile add up
  const pair = withReach(near);
  const two = { ...pair, foes: [pair.foes[0], { ...pair.foes[0], pos: { row: 4, col: 4 } }] };
  assert.ok((Fight.dangerDamage(two, 1).get('5,3') ?? 0) > (dmg.get('5,3') ?? 0));
  // The shade is measured against your health now
  assert.ok(Fight.dangerShade(20, 40) > Fight.dangerShade(20, 200));
  // A wide enemy sweep hits the ally beside you as well
  const ally = { id: 'bale', unit: createPlayer(), pos: { row: 5, col: 4 }, moves: [], move: 2, cooldowns: [], moved: false, acted: false, taunting: false, defenseBoost: 0, burning: 0, stunned: false } as unknown as FightState['allies'][number];
  const sweep: CombatAction = { ...hitFor(30, 1), attackPattern: 'sweep_arc' };
  const s = { ...near, allies: [ally], foes: [{ ...near.foes[0], unit: { ...near.foes[0].unit, moves: [sweep], heavyMoves: [] } }] };
  seedRandom(3);
  const after = Fight.foeTurn(s, 0, 1).state;
  if (after.player.currentHp < s.player.currentHp) assert.ok(after.allies[0].unit.currentHp < ally.unit.currentHp, 'the sweep caught the ally too');
});

test('seven-part implants: lens sets the aim, coupling the damage type, core trades heat for power', async () => {
  const { rollParts, LENSES, COUPLINGS, CORES } = await import('../client/src/lib/combat/augments');
  const arm = { id: 'p', name: '[VOLKOV] Test Arm', rarity: 'rare' as const, type: 'augmentation' as const, slot: 'right_arm' as const, icon: '' };
  for (let k = 0; k < 20; k++) {
    seedRandom(50 + k);
    const p = rollParts(arm)!;
    assert.ok(p.lens! in LENSES && p.coupling! in COUPLINGS && p.core! in CORES, 'every active rolls a lens, a coupling and a core');
  }
  const base = { ...arm, parts: { head: 'jab', mods: [], lens: 'stock', coupling: 'servo', core: 'stock' } };
  const plain = actionForItem(base)!;
  const arc = actionForItem({ ...base, parts: { ...base.parts, coupling: 'arc' } })!;
  assert.equal(arc.physicalRatio, COUPLINGS.arc.phys, 'an arc coupling makes it mostly special');
  assert.equal(actionForItem({ ...base, parts: { ...base.parts, lens: 'clear' } })!.accuracy, 'precise');
  assert.equal(actionForItem({ ...base, parts: { ...base.parts, lens: 'cracked' } })!.accuracy, 'unreliable');
  const hot = actionForItem({ ...base, parts: { ...base.parts, core: 'hot' } })!;
  assert.ok(hot.damage! > plain.damage! && hot.heatGenerated! > plain.heatGenerated!, 'a hot core hits harder and runs hotter');
  const pump = actionForItem({ ...base, parts: { ...base.parts, core: 'pump' } })!;
  assert.ok(pump.heatTransfer! > plain.heatTransfer!, 'a heat pump pushes heat into the target');
  // Implants from before these parts existed keep their maker's old numbers
  const old = actionForItem({ ...arm, parts: { head: 'jab', mods: [] } })!;
  assert.equal(old.accuracy, 'precise');
});

test('passive parts: housing changes structure, regulators and traits change the fight', async () => {
  const { rollPassiveParts, structureOf, partPerks } = await import('../client/src/lib/combat/augments');
  const { NO_PERKS } = await import('../client/src/lib/engine/playi');
  const lung = { id: 'l', name: '[PARSU] Test Lung', rarity: 'legendary' as const, type: 'augmentation' as const, slot: 'lungs' as const, icon: '' };
  seedRandom(4);
  const pp = rollPassiveParts(lung)!;
  assert.ok(pp.housing && pp.regulator && pp.trait, 'a legendary passive always carries a trait');
  assert.equal(rollPassiveParts({ ...lung, slot: 'right_arm' }), undefined, 'actives have their own parts');
  const plated = structureOf({ ...lung, passiveParts: { housing: 'plated', regulator: 'stock' } });
  const light = structureOf({ ...lung, passiveParts: { housing: 'light', regulator: 'stock' } });
  assert.ok(plated > structureOf(lung) && light < structureOf(lung));
  const p = partPerks(NO_PERKS, [{ ...lung, passiveParts: { housing: 'stock', regulator: 'sink', trait: 'charged' } }, { ...lung, passiveParts: { housing: 'stock', regulator: 'baffle', trait: 'quick' } }]);
  assert.equal(p.extraCooling, 1);
  assert.equal(p.specialHeatTakenMult, 0.5);
  assert.equal(p.startOverload, 15);
  assert.equal(p.partSpeed, 1);
  // A baffle halves the heat special hits put into you
  seedRandom(3);
  const s = fight();
  const raw = Fight.resolveFoeAction(s, 0, hitFor(60, 0), 1).state.playerHeat - s.playerHeat;
  seedRandom(3);
  const baffled = Fight.resolveFoeAction({ ...s, perks: { ...s.perks, specialHeatTakenMult: 0.5 } }, 0, hitFor(60, 0), 1).state.playerHeat - s.playerHeat;
  assert.ok(baffled < raw);
});

test('the fight bar lists only what the tiles cannot show', async () => {
  const { statusText } = await import('../client/src/components/game/itemText');
  const t = statusText({ ...PLAYER_ACTIONS[0], heatTransfer: 8, effects: { bleed: true, stun: 0.25, drain: 0.25, ignite: true, reap: true, knock: true, retreat: true } })!;
  for (const w of ['bleeds', 'can stun', 'heals you', 'sets them alight', 'takedowns']) assert.ok(t.includes(w), w);
  for (const w of ['heats', 'pushes', 'step', '%']) assert.ok(!t.includes(w), `no "${w}": moving shows on the tiles, numbers on the cards`);
  assert.equal(statusText({ ...PLAYER_ACTIONS[0], effects: { dash: true } }), null);
});

test('part upgrades grow only on implants with that part, and two parts together can grow a synergy capstone', async () => {
  const { treeFor, partsOf } = await import('../client/src/lib/engine/upgrades');
  const arm = (parts: any, k: number) => ({ id: `t${k}`, name: '[IOA] Test Arm', rarity: 'epic' as const, type: 'augmentation' as const, slot: 'right_arm' as const, icon: '', treeSeed: 1000 + k, parts });
  const hot = { head: 'jab', mods: [], lens: 'stock', coupling: 'thermal', core: 'hot' };
  const cold = { head: 'jab', mods: [], lens: 'clear', coupling: 'hydraulic', core: 'cold' };
  assert.deepEqual(partsOf(arm(hot, 0)).core, ['hot']);
  let thermite = 0, stoke = 0;
  for (let k = 0; k < 60; k++) {
    const names = treeFor(arm(hot, k), 'attack').map(n => n.name);
    if (names.includes('Thermite')) thermite++;
    if (names.includes('Stoked core')) stoke++;
    assert.ok(!names.includes('Chilled core') && !names.includes('Cold sight'), 'no cold-core upgrades on a hot core');
    const c = treeFor(arm(cold, k), 'attack').map(n => n.name);
    assert.ok(!c.includes('Thermite') && !c.includes('Stoked core'), 'no hot-core upgrades on a cold core');
  }
  assert.ok(thermite > 5, `a thermal coupling and a hot core often end in Thermite (${thermite}/60)`);
  const t = Array.from({ length: 60 }, (_, k) => treeFor(arm(hot, k), 'attack')).flat().find(n => n.name === 'Thermite')!;
  assert.equal(t.paired, true, 'two-part capstones are marked, so they can stand out');
  assert.ok(!Array.from({ length: 10 }, (_, k) => treeFor(arm(hot, k), 'attack')).flat().some(n => n.name === 'Stoked core' && n.paired));
  assert.ok(stoke > 5, `a hot core often grows Stoked core (${stoke}/60)`);
  // Implants with no parts never grow part upgrades
  const bare = { id: 'b', name: '[IOA] Test Lung', rarity: 'legendary' as const, type: 'augmentation' as const, slot: 'lungs' as const, icon: '', treeSeed: 5 };
  assert.ok(!treeFor(bare, 'passive').some(n => ['Rivets', 'Radiator', 'Heat plate', 'Faraday cage'].includes(n.name)));
});

test('part upgrades change the move: more heat pushed, a shift toward special', () => {
  const base = { id: 'p', name: '[IOA] Test Arm', rarity: 'rare' as const, type: 'augmentation' as const, slot: 'right_arm' as const, icon: '', parts: { head: 'jab', mods: [], lens: 'stock', coupling: 'arc', core: 'stock' } };
  const plain = actionForItem(base)!;
  const fed = actionForItem(base, { transfer: 3, phys: -0.1 })!;
  assert.equal(fed.heatTransfer, plain.heatTransfer! + 3);
  assert.ok(fed.physicalRatio! < plain.physicalRatio!);
});

// ── Defensive implant moves ──────────────────────────────────────────────────
const defend = (spec: any, heat = -4): CombatAction => ({ type: 'defend', name: 'Test Guard', description: '', heatGenerated: heat, defend: { targets: 'self', ...spec } });

test('Brace guards every hit until your next turn and adds Overload', () => {
  const braced = Fight.resolveBrace(fight({ player: withImplants() }), PLAYER_ACTIONS[1]).state;
  assert.equal(braced.overload, Fight.BRACE_OVERLOAD);
  seedRandom(5);
  const once = Fight.resolveFoeAction(braced, 0, hitFor(30, 1), 1).state;
  assert.equal(once.playerDefenseBoost, braced.playerDefenseBoost, 'the guard is still up for the next hit');
  assert.equal(Fight.startPlayerTurn(once).playerDefenseBoost, 0, 'and drops at the start of your turn');
});

test('heals land now, drips land at the start of later turns', () => {
  const hurt = fight({ player: { ...createPlayer(), currentHp: 40 } });
  const now = Fight.resolveDefend(hurt, defend({ kind: 'mend', heal: 0.25 }), null).state;
  assert.equal(now.player.currentHp, 40 + Math.round(hurt.player.maxHp * 0.25));
  const drip = Fight.resolveDefend(hurt, defend({ kind: 'mend', healOver: 0.1, turns: 3 }), null).state;
  assert.equal(drip.player.currentHp, 40, 'a drip gives nothing now');
  const t1 = Fight.startPlayerTurn(drip), t2 = Fight.startPlayerTurn(t1), t3 = Fight.startPlayerTurn(t2), t4 = Fight.startPlayerTurn(t3);
  const step = Math.round(hurt.player.maxHp * 0.1);
  assert.deepEqual([t1, t2, t3, t4].map(t => t.player.currentHp), [40 + step, 40 + 2 * step, 40 + 3 * step, 40 + 3 * step], 'three turns of it, then it stops');
});

test('guards cut physical or special hits until your next turn; a counter sends a share back', () => {
  const base = fight({ player: withImplants() });
  seedRandom(8); const plain = Fight.resolveFoeAction(base, 0, hitFor(40, 1), 1).state;
  const guarded = Fight.resolveDefend(base, defend({ kind: 'anchor', physCut: 0.5 }), null).state;
  seedRandom(8); const cut = Fight.resolveFoeAction(guarded, 0, hitFor(40, 1), 1).state;
  const lost = (s: any) => base.player.currentHp - s.player.currentHp + base.player.currentStructuralHp - s.player.currentStructuralHp;
  assert.ok(lost(cut) < lost(plain), 'a physical guard softens a physical hit');
  const spOnly = Fight.resolveDefend(base, defend({ kind: 'spguard', specialCut: 0.5 }), null).state;
  seedRandom(8); assert.equal(lost(Fight.resolveFoeAction(spOnly, 0, hitFor(40, 1), 1).state), lost(plain), 'a special guard does nothing against a physical hit');
  const countering = Fight.resolveDefend(base, defend({ kind: 'counter', counter: { chance: 1, share: 0.5 } }), null).state;
  seedRandom(8); const back = Fight.resolveFoeAction(countering, 0, hitFor(40, 1), 1).state;
  assert.ok(back.foes[0].unit.currentHp < base.foes[0].unit.currentHp, 'the attacker takes the share sent back');
  assert.ok(lost(back) < lost(plain), 'and you take the rest');
});

test('an anchored host is not shoved; Dig in needs you still, Second wind needs you low; Fall back steps away', () => {
  const base = fight({ grid: arena([5, 3], [4, 3]) });
  const anchored = Fight.resolveDefend(base, defend({ kind: 'anchor', physCut: 0.3, anchor: true }), null).state;
  seedRandom(2); const shove = Fight.resolveFoeAction(anchored, 0, { ...hitFor(10, 1), attackPattern: 'knockback' }, 1).state;
  assert.deepEqual(shove.grid.playerPosition, base.grid.playerPosition);
  assert.equal(Fight.canDefend(base, defend({ kind: 'digin', needs: 'still' }), true), false);
  assert.equal(Fight.canDefend(base, defend({ kind: 'secondwind', needs: 'low' }), false), false);
  assert.equal(Fight.canDefend({ ...base, player: { ...base.player, currentHp: 10 } }, defend({ kind: 'secondwind', needs: 'low' }), false), true);
  const back = Fight.resolveDefend(base, defend({ kind: 'fallback', repair: 0.2, step: 2 }), null).state;
  const d = (s: any) => Math.max(Math.abs(s.grid.playerPosition.row - 4), Math.abs(s.grid.playerPosition.col - 3));
  assert.ok(d(back) > d(base), 'Fall back puts distance between you and them');
});

test('defensive implant moves come from parts: core sets the timing, lens the reliability, rarity the size', () => {
  const arm = (r: any, parts: any) => ({ id: 'd', name: '[CROWN] Test Arm', rarity: r, type: 'augmentation' as const, slot: 'right_arm' as const, icon: '', parts: { mods: [], lens: 'stock', coupling: 'servo', targeting: 'focused', ...parts } });
  const surge = actionForItem(arm('common', { head: 'mend', core: 'hot' }))!.defend!;
  const drip = actionForItem(arm('common', { head: 'mend', core: 'cold' }))!.defend!;
  assert.equal(surge.heal, 0.2, 'a common surge mend heals a fifth now');
  assert.ok(!drip.heal && drip.healOver! * drip.turns! > surge.heal!, 'a drip gives nothing now but more in total');
  const best = actionForItem(arm('legendary', { head: 'mend', core: 'hot' }))!.defend!;
  assert.ok(best.heal! >= 0.4, `a legendary surge heals at least 40% (${best.heal})`);
  const clear = actionForItem(arm('common', { head: 'counter', lens: 'clear' }))!.defend!;
  const cracked = actionForItem(arm('common', { head: 'counter', lens: 'cracked' }))!.defend!;
  assert.equal(clear.counter!.chance, 1);
  assert.ok(cracked.counter!.chance < clear.counter!.chance && cracked.counter!.share > clear.counter!.share, 'cracked: less often, more back');
  assert.equal(surge.targets, 'focused');
  assert.equal(actionForItem(arm('common', { head: 'counter' }))!.defend!.targets, 'self', 'a counter is yours alone');
});

test('a heal that reaches allies covers whoever you pick, or both', () => {
  const s0 = fight();
  const s = { ...s0, allies: [{ id: 'matron', unit: { ...createPlayer(), id: 'ally', name: 'Matron', currentHp: 30 }, pos: { row: s0.grid.playerPosition.row, col: s0.grid.playerPosition.col + 1 }, moves: [], move: 2, cooldowns: [], moved: false, acted: false, taunting: false, defenseBoost: 0, burning: 0, stunned: false }] } as FightState;
  const mend = (targets: any) => defend({ kind: 'mend', heal: 0.2, reach: 3, targets });
  assert.equal(Fight.defendTargets(s, mend('focused'), null).who[0].kind, 'ally', 'by default the most hurt');
  const both = Fight.resolveDefend(s, mend('split2'), null).state;
  assert.ok(both.allies[0].unit.currentHp > 30);
  const me = Fight.resolveDefend({ ...s, player: { ...s.player, currentHp: 50 } }, mend('focused'), s.grid.playerPosition).state;
  assert.ok(me.player.currentHp > 50 && me.allies[0].unit.currentHp === 30, 'tapping yourself covers you');
});

test('implant moves are named by model number: the maker stamps its line, the grade rises with quality', async () => {
  const { modelOf } = await import('../client/src/lib/combat/augments');
  const arm = (name: string, rarity: any, treeSeed = 7) => ({ id: 'm', name, rarity, type: 'augmentation' as const, slot: 'right_arm' as const, icon: '', treeSeed, parts: { head: 'counter', mods: [], lens: 'stock', coupling: 'servo', core: 'stock' } });
  assert.match(modelOf(arm('[CROWN] Test', 'common')), /^RX-[12]$/);
  assert.match(actionForItem(arm('[CROWN] Test', 'common'))!.name, /^RX-\d+ Counter$/);
  assert.match(modelOf(arm('[VOLKOV] Test', 'legendary')), /^VK-(9|10)$/);
  assert.equal(modelOf(arm('[KIZUNA] Test', 'rare')), modelOf(arm('[KIZUNA] Test', 'rare')), 'the same part always carries the same number');
});

test('every implant shows its model number in its name; its move carries the same one', async () => {
  const { displayName, modelOf } = await import('../client/src/lib/combat/augments');
  const lung = { id: 'q', name: '[CROWN] Bellows Lung', rarity: 'rare' as const, type: 'augmentation' as const, slot: 'lungs' as const, icon: '', treeSeed: 3 };
  assert.equal(displayName(lung), `${modelOf(lung)} Bellows Lung`);
  assert.match(displayName(lung), /^RX-\d+ Bellows Lung$/);
  const arm = { ...lung, slot: 'right_arm' as const, name: '[CROWN] Test Arm', parts: { head: 'mend', mods: [], lens: 'stock', coupling: 'servo', core: 'stock', targeting: 'focused' as const } };
  assert.ok(actionForItem(arm)!.name.startsWith(modelOf(arm)), 'the move and its implant share a number');
  assert.equal(displayName({ name: '[CROWN] Bio-Stim', type: 'consumable' }), 'Bio-Stim', 'stims have no model number');
  assert.ok(!displayName({ ...lung, name: '[CROWN] Grip Arm (L)' }).includes('(L)'), 'no side tag: the slot says it');
});

// ── Guns ─────────────────────────────────────────────────────────────────────
test('guns are built from parts, carry a model number, and never heat you', async () => {
  const G = await import('../client/src/lib/combat/guns');
  seedRandom(21);
  const frame = G.GUN_FRAMES.find(w => w.manufacturer === 'volkov' && w.weaponType === 'pistol')!;
  const gun = G.rollGun(frame, 'rare');
  assert.ok(gun.gunParts && gun.treeSeed !== undefined);
  assert.match(G.gunName(gun), /^VK-P\d+ /);
  const shot = G.gunAction(gun);
  assert.equal(shot.heatGenerated, 0);
  assert.equal(shot.gun!.mag, G.magazineOf(gun));
  assert.equal(shot.attackPattern, 'bolt');
  const common = G.gunAction({ ...gun, rarity: 'common' });
  assert.ok(shot.damage! > common.damage!, 'rarity scales the punch');
  const thermal = G.gunAction({ ...gun, gunParts: { ...gun.gunParts!, round: 'thermal' } });
  assert.ok(thermal.physicalRatio! < 0.5 && thermal.heatTransfer! > 0, 'thermal rounds are special and heat them');
});

test('a shot spends a round and no heat; an empty gun cannot fire; any turn you do not attack reloads it', () => {
  const pistol: CombatAction = { type: 'attack', name: 'Test Pistol', description: '', damage: 16, accuracy: 'precise', attackPattern: 'melee', heatGenerated: 0, gun: { mag: 2 } };
  let s = fight({ gunAmmo: 2, gunMag: 2, playerHeat: 40 });
  seedRandom(1);
  s = Fight.resolvePlayerAttack(s, pistol).state;
  assert.equal(s.gunAmmo, 1);
  assert.equal(s.playerHeat, 40, 'a gun never heats you');
  s = Fight.resolvePlayerAttack({ ...s, foes: fight().foes }, pistol).state;
  assert.equal(s.gunAmmo, 0);
  assert.equal(Fight.gunEmpty(s, pistol), true);
  assert.equal(Fight.canPlayerHitAny({ ...s, foes: fight().foes }, pistol, 'none'), false);
  assert.equal(Fight.reloadGun(s).gunAmmo, 2);
});

test('the gun rack restocks when its key changes (every won fight, every new host), and a gun never grows', async () => {
  const { useMarket } = await import('../client/src/lib/stores/useMarket');
  const { gunMove } = await import('../client/src/lib/stores/useAugmentTrees');
  const { gunAction } = await import('../client/src/lib/combat/guns');
  useMarket.getState().reset();
  useMarket.getState().ensureGuns('0-0', 5);
  const first = useMarket.getState().guns.map(g => g.id);
  assert.equal(first.length, 3);
  useMarket.getState().ensureGuns('0-0', 6);
  assert.deepEqual(useMarket.getState().guns.map(g => g.id), first, 'the same key, the same rack');
  useMarket.getState().ensureGuns('0-1', 6);
  assert.notDeepEqual(useMarket.getState().guns.map(g => g.id), first, 'a won fight restocks it');
  // Fixed as rolled: the move the store hands out is the rolled one, nothing added
  const g = useMarket.getState().guns[0];
  assert.deepEqual(gunMove(g), gunAction(g));
});

// ── Physical and special ─────────────────────────────────────────────────────
test('implants lean physical or special by maker and slot; parts add Sp. Def; Shielded is the special Tough', async () => {
  const { specialShare, specialLean, partsSpDef } = await import('../client/src/lib/combat/augments');
  const kz = ITEMS_2059.filter(i => i.type === 'augmentation' && i.name.startsWith('[KIZUNA]') && (i.slot === 'eyes' || i.slot === 'brain'));
  const vk = ITEMS_2059.filter(i => i.type === 'augmentation' && i.name.startsWith('[VOLKOV]') && i.slot?.includes('arm'));
  const avg = (xs: any[]) => xs.reduce((n, i) => n + specialShare(i), 0) / Math.max(1, xs.length);
  assert.ok(avg(kz) > 0.8, `Kizuna head parts are mostly special (${avg(kz).toFixed(2)})`);
  assert.ok(avg(vk) < 0.1, `Volkov arms are physical (${avg(vk).toFixed(2)})`);
  assert.equal(specialLean({ name: '[CROWN] X', slot: 'lungs' } as any), 0.6);
  const lung = { id: 'l', name: '[HELIX] L', type: 'augmentation' as const, slot: 'lungs' as const, icon: '' };
  assert.ok(partsSpDef({ ...lung, rarity: 'legendary', passiveParts: { housing: 'sealed', regulator: 'stock' } }) > partsSpDef({ ...lung, rarity: 'common', passiveParts: { housing: 'sealed', regulator: 'stock' } }), 'a sealed housing grows with grade');
  assert.equal(partsSpDef({ ...lung, rarity: 'common', passiveParts: { housing: 'stock', regulator: 'stock', trait: 'shielded' } }), 4);
});

test('implant stats fade as the structure bar empties: full at full, half at none', async () => {
  const { liveStats, IMPLANT_FADE } = await import('../client/src/lib/combat/actions');
  const p = { ...createPlayer(), physicalAttack: 100, structuralAttack: 60, implantStats: { pa: 80, sa: 40, pd: 0, sd: 0 }, maxStructuralHp: 100, currentStructuralHp: 100 };
  assert.equal(liveStats(p).physicalAttack, 100);
  const broken = liveStats({ ...p, currentStructuralHp: 0 });
  assert.equal(broken.physicalAttack, 100 - 80 * (1 - IMPLANT_FADE));
  assert.equal(broken.structuralAttack, 60 - 40 * (1 - IMPLANT_FADE));
  assert.ok(liveStats({ ...p, currentStructuralHp: 50 }).physicalAttack < 100 && liveStats({ ...p, currentStructuralHp: 50 }).physicalAttack > broken.physicalAttack);
  // so a hit from a wrecked host lands softer
  const foe = { ...createBoss(5), physicalDefense: 0, structuralDefense: 0 };
  const strike = { ...PLAYER_ACTIONS[0], accuracy: 'precise' as const, physicalRatio: 1 };
  const { estimateDamage } = await import('../client/src/lib/combat/actions');
  assert.ok(estimateDamage({ ...p, currentStructuralHp: 0 }, foe, strike).max < estimateDamage(p, foe, strike).max);
});

test('enemies that fight with special moves carry more special-leaning implants', async () => {
  const { rollCarried } = await import('../client/src/lib/combat/loot');
  const { specialShare } = await import('../client/src/lib/combat/augments');
  const avg = (lean: number) => { seedRandom(77); let n = 0, k = 0; for (let r = 0; r < 60; r++) for (const it of rollCarried(12, 3, 'normal', false, undefined, lean)) { n += specialShare(it); k++; } return n / k; };
  assert.ok(avg(0.9) > avg(0.1) + 0.15, `special fighters carry special parts (${avg(0.9).toFixed(2)} vs ${avg(0.1).toFixed(2)})`);
});

// ── The red is honest for the whole enemy round ──────────────────────────────
test('the red counts an enemy that acts twice from where it would walk, a stunned one for its second go, and the King by his phase', async () => {
  const { createPatchworkKing, PATCHWORK_KING_PHASES } = await import('../client/src/lib/combat/actions');
  const s = fight();
  const once = Fight.dangerTiles(s);
  const twice = Fight.dangerTiles(s, false, [0]);
  for (const k of Array.from(once)) assert.ok(twice.has(k), 'acting twice only adds to the red');
  assert.ok(twice.size > once.size, 'its second go, after a walk, reaches further');
  // Stunned: its first go is lost, but a second still lands
  const stunned = { ...s, foes: s.foes.map(f => ({ ...f, stunned: true })) };
  assert.equal(Fight.dangerTiles(stunned).size, 0);
  assert.ok(Fight.dangerTiles(stunned, false, [0]).size > 0);
  // The King: what he can use next is his coming phase, not a lone close-range strike
  const king = Fight.newFoe(createPatchworkKing(), s.foes[0].pos, 20);
  assert.deepEqual(Fight.foeRoster(king).map(a => a.name), PATCHWORK_KING_PHASES[0].map(a => a.name));
  assert.deepEqual(Fight.foeRoster({ ...king, parts: ['crown'] }).map(a => a.name), PATCHWORK_KING_PHASES[2].map(a => a.name));
});

// ── Mending and the stun guard ───────────────────────────────────────────────
test('the frame mends you at the start of each turn, by how much structure is left; parts, trees and cards add to it', () => {
  const hurt = (structure: number) => fight({ player: { ...createPlayer(), currentHp: 50, maxStructuralHp: 40, currentStructuralHp: structure } });
  const full = Fight.playerConditions(hurt(40)).state.player.currentHp - 50;
  assert.equal(full, Math.round(createPlayer().maxHp * Fight.MEND.base), 'full structure: the whole rate');
  assert.equal(Fight.playerConditions(hurt(20)).state.player.currentHp - 50, Math.round(createPlayer().maxHp * Fight.MEND.base * 0.5), 'half structure: half');
  assert.equal(Fight.playerConditions(hurt(0)).state.player.currentHp, 50, 'broken: nothing');
  const better = { ...hurt(40), perks: { ...hurt(40).perks, mend: 0.04 } };
  assert.ok(Fight.playerConditions(better).state.player.currentHp - 50 > full);
  const topped = fight({ player: { ...createPlayer(), maxStructuralHp: 40, currentStructuralHp: 40 } });
  assert.equal(Fight.playerConditions(topped).state.player.currentHp, topped.player.maxHp, 'never past full');
});

test('no stun-locks: a stun that costs you a turn keeps further stuns off until you have played a full turn', () => {
  let s = fight({ playerStunned: true });
  const lost = Fight.playerConditions(s);
  assert.equal(lost.skipTurn, true);
  s = Fight.endPlayerTurn(lost.state);
  assert.equal(s.stunGuard, 2);
  // The enemies' round: a stun can't land
  const g = Fight.knockBack({ ...s, grid: arena([0, 3], [1, 3]) }, { row: 1, col: 3 }, { kind: 'player' }, 5, []);
  assert.equal(g.playerStunned, false, 'guarded: slammed into the rail, but not stunned');
  // Your next turn is played in full; once it ends, stuns can land again
  s = Fight.startPlayerTurn(s);
  assert.equal(s.stunGuard, 1);
  assert.equal(Fight.playerConditions(s).skipTurn, false);
  s = Fight.endPlayerTurn(s);
  assert.equal(s.stunGuard, 0);
  assert.equal(Fight.knockBack({ ...s, grid: arena([0, 3], [1, 3]) }, { row: 1, col: 3 }, { kind: 'player' }, 5, []).playerStunned, true);
});

// ── The Patchwork King ──────────────────────────────────────────────────────

const THRONE = ['~1111111~', '122222221', '123333321', '123.E.321', '123p..321', '123...321', '123..p321', '123.P.321', '123333321', '122222221', '~1111111~'];
function kingFight(): FightState {
  const grid = buildArena(THRONE);
  const king = Fight.newFoe({ ...createBoss(5), name: 'Patchwork King' }, grid.bossPosition, 20);
  return fight({ grid, foes: [king], king: { loose: [], spoils: [], rings: 0 } });
}

test('the King wears three parts: the plate softens hits, the crown speeds him, his phase is the parts he has lost', () => {
  const s = kingFight();
  assert.deepEqual(s.foes[0].parts, ['plate', 'hook', 'crown']);
  assert.equal(Fight.kingPhaseOf(s.foes[0]), 0);
  const bare = { ...s, foes: [{ ...s.foes[0], parts: [] as any[] }] };
  assert.ok(Fight.speedOf(s, 0) > Fight.speedOf(bare, 0), 'the crown: he acts sooner');
  const near = { ...s, grid: { ...s.grid, playerPosition: { row: 4, col: 4 } } };
  const hit = (st: FightState) => { seedRandom(9); return st.foes[0].unit.currentHp - Fight.resolvePlayerAttack(st, hitFor(30), 'none').state.foes[0].unit.currentHp; };
  assert.ok(hit(near) < hit({ ...near, foes: [{ ...near.foes[0], parts: [] }] }), 'the plate: he takes less');
  assert.equal(Fight.kingPhaseOf(bare.foes[0]), 2);
});

test('breaking the King sheds a part: his structure comes back, a part lands on the raft and the outer ring breaks away', () => {
  const s = kingFight();
  const onEdge = { ...s, grid: { ...s.grid, playerPosition: { row: 0, col: 4 } } };
  const broken = { ...onEdge, foes: [{ ...onEdge.foes[0], unit: { ...onEdge.foes[0].unit, currentStructuralHp: 0 }, malfunctioning: true }] };
  const out = Fight.kingCheck(broken).state;
  assert.deepEqual(out.foes[0].parts, ['hook', 'crown']);
  assert.equal(out.foes[0].unit.currentStructuralHp, out.foes[0].unit.maxStructuralHp);
  assert.equal(Fight.kingPhaseOf(out.foes[0]), 1);
  assert.equal(out.king!.rings, 1);
  assert.equal(out.king!.loose.length, 1);
  assert.equal(out.grid.tiles[0][4].type, 'void', 'ring one is sea now');
  assert.equal(out.grid.tiles[1][4].type, 'empty', 'ring two holds');
  assert.equal(out.playerSwimming, true, 'standing on it, you went in');
  assert.notEqual(out.grid.tiles[out.king!.loose[0].pos.row][out.king!.loose[0].pos.col].type, 'void');
  assert.equal(Fight.kingCheck(out).events.length, 0, 'nothing more happens until he breaks again');
});

test('you take a fallen part by standing on it, and it is one use; he bolts it back on if he gets beside it first', () => {
  const s = kingFight();
  const fallen = { ...s, king: { loose: [{ id: 'plate' as const, pos: { row: 4, col: 4 } }], spoils: [], rings: 1 }, foes: [{ ...s.foes[0], parts: ['hook', 'crown'] as any }] };
  // You get there first
  const mine = Fight.kingCheck({ ...fallen, grid: { ...fallen.grid, playerPosition: { row: 4, col: 4 } } }).state;
  assert.deepEqual(mine.king!.spoils, ['plate']);
  assert.equal(mine.king!.loose.length, 0);
  const move = Fight.kingSpoils(mine)[0];
  assert.equal(move.spoil, 'plate');
  seedRandom(3);
  assert.deepEqual(Fight.resolvePlayerAttack(mine, move, 'none').state.king!.spoils, [], 'used up');
  // He gets there first: beside it on his turn, he bolts it back on
  seedRandom(4);
  const his = Fight.foeTurn(fallen, 0, 10).state;
  assert.deepEqual(his.foes[0].parts, ['plate', 'hook', 'crown']);
  assert.equal(his.king!.loose.length, 0);
  // Someone standing on it stops him
  const blocked = Fight.foeTurn({ ...fallen, grid: { ...fallen.grid, playerPosition: { row: 4, col: 4 } } }, 0, 10).state;
  assert.deepEqual(blocked.foes[0].parts, ['hook', 'crown']);
});

test('the King walks back toward a fallen part', () => {
  const s = kingFight();
  const far = { ...s, king: { loose: [{ id: 'plate' as const, pos: { row: 7, col: 3 } }], spoils: [], rings: 0 }, foes: [{ ...s.foes[0], parts: ['hook', 'crown'] as any, pos: { row: 1, col: 4 } }], grid: { ...s.grid, playerPosition: { row: 2, col: 7 } } };
  const walked = Fight.foeWalk(far, 0).state;
  assert.ok(chebyshev(walked.foes[0].pos, { row: 7, col: 3 }) < chebyshev(far.foes[0].pos, { row: 7, col: 3 }));
});

test('a King hurt past three-quarters sheds a part even with structure left, but not twice for the same quarter', () => {
  const s = kingFight();
  const u = s.foes[0].unit;
  const hurt = { ...s, foes: [{ ...s.foes[0], unit: { ...u, currentHp: Math.round(u.maxHp * 0.7) } }] };
  const once = Fight.kingCheck(hurt).state;
  assert.deepEqual(once.foes[0].parts, ['hook', 'crown']);
  const refitted = { ...once, foes: [{ ...once.foes[0], parts: ['plate', 'hook', 'crown'] as any }] };
  assert.deepEqual(Fight.kingCheck(refitted).state.foes[0].parts, ['plate', 'hook', 'crown'], 'bolted back on, it stays on until he breaks again');
});

test('the red says what a tile costs: a heavy locked on it adds its hit, a shove gives the way you go', () => {
  const s = fight({ grid: arena([6, 3], [4, 3]) });
  const knock: CombatAction = { ...hitFor(30, 1), attackPattern: 'melee_long', effects: { knock: true } };
  const shoving = { ...s, foes: [{ ...s.foes[0], unit: { ...s.foes[0].unit, moves: [knock] } }] };
  const d = Fight.dangerInfo(shoving, 1).get('5,3');
  assert.ok(d && d.damage > 0);
  assert.deepEqual(d!.shove, { dr: 1, dc: 0 }, 'pushed straight away from it');
  const heavy: CombatAction = { ...hitFor(60, 1), attackPattern: 'aoe', isHeavy: true };
  const winding = { ...s, foes: [{ ...s.foes[0], pendingAction: heavy, pendingTiles: [{ row: 6, col: 3 }, { row: 6, col: 2 }], pendingAim: { row: 6, col: 3 } }] };
  const h = Fight.dangerInfo(winding, 1);
  assert.ok(h.get('6,3')?.heavy && (h.get('6,3')?.damage ?? 0) > 0, 'the locked tiles carry the heavy');
  assert.equal(h.get('5,3'), undefined, 'winding up, it threatens nothing else');
});

test('the red counts a wide blow aimed at an ally that would catch you, parting blows have a price, and a second go has a number', () => {
  const s = fight({ grid: arena([6, 3], [4, 3]) });
  const sweep: CombatAction = { ...hitFor(30, 1), attackPattern: 'sweep_arc' };
  const ally = { id: 'bale', unit: createPlayer(), pos: { row: 5, col: 3 }, moves: [], move: 2, cooldowns: [], moved: false, acted: false, taunting: false, defenseBoost: 0, burning: 0, stunned: false } as unknown as FightState['allies'][number];
  const st = { ...s, allies: [ally], foes: [{ ...s.foes[0], unit: { ...s.foes[0].unit, moves: [sweep] } }] };
  // The sweep aimed at Bale (5,3) covers the tiles either side of him: standing at 5,2 you'd be caught
  const caught = getHitTiles({ row: 4, col: 3 }, { row: 5, col: 3 }, 'sweep_arc', { ...st.grid, bossPosition: { row: 4, col: 3 }, playerPosition: { row: 5, col: 3 } }).find(t => !(t.row === 5 && t.col === 3) && !(t.row === 4 && t.col === 3))!;
  assert.ok((Fight.dangerInfo(st, 1).get(`${caught.row},${caught.col}`)?.damage ?? 0) > 0, 'a blow aimed at an ally still shows where it would catch you');
  // Beside an enemy, stepping away costs; staying beside it doesn't
  const beside = fight({ grid: arena([5, 3], [4, 3]) });
  assert.ok(Fight.partingDamage(beside, { row: 5, col: 3 }, { row: 7, col: 3 }, 1) > 0);
  assert.equal(Fight.partingDamage(beside, { row: 5, col: 3 }, { row: 5, col: 4 }, 1), 0);
  assert.ok(Fight.secondGoDamage(beside, 1, [0]) > 0);
  assert.equal(Fight.secondGoDamage(beside, 1, []), 0);
});
