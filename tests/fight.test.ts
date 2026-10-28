import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as Fight from '../client/src/lib/engine/fight';
import type { FightState } from '../client/src/lib/engine/fight';
import { seedRandom } from '../client/src/lib/engine/rng';
import { createPlayer, createBoss, PLAYER_ACTIONS } from '../client/src/lib/combat/actions';
import type { CombatGrid, CombatAction } from '../client/src/lib/combat/types';
import { getReachableTiles } from '../client/src/lib/combat/grid';
import { canHitTarget, getHitTiles } from '../client/src/lib/combat/patterns';

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

test('both sides cool down at the start of a round; cool players act twice', () => {
  const base = fight({ playerHeat: 20 });
  const s = Fight.startPlayerTurn({ ...base, foes: [{ ...base.foes[0], heat: 3 }] });
  assert.equal(s.playerHeat, 20 - Fight.PASSIVE_COOLING);
  assert.equal(s.foes[0].heat, 0);
  assert.equal(s.doubleActionReady, true);
  assert.equal(Fight.startPlayerTurn(fight({ playerHeat: 60 })).doubleActionReady, false);
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

test('with no implants, structural hits spill onto health at half strength', () => {
  seedRandom(2);
  const bare = fight({ player: createPlayer() });
  const step = Fight.resolveFoeAction(bare, 0, hitFor(30, 0), 1);
  assert.ok(step.state.player.currentHp < bare.player.currentHp, 'flesh takes the spill');
  assert.equal(step.state.playerMalfunctioning, false, 'no implants, no malfunction');
});

test('implants absorb structural hits and malfunction at zero', () => {
  seedRandom(3);
  const s = fight({ player: withImplants() });
  const step = Fight.resolveFoeAction(s, 0, hitFor(60, 0), 1);
  assert.equal(step.state.player.currentStructuralHp, 0);
  assert.equal(step.state.playerMalfunctioning, true);
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

test('enemies hold heavy attacks against a cool player', () => {
  for (let k = 0; k < 40; k++) {
    seedRandom(k);
    const { action } = Fight.chooseFoeAction(fight({ playerHeat: 0 }), 0);
    assert.ok(!action?.isHeavy);
  }
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
  const lit = Fight.applyPlayerHazard(fight({ grid: g })).state;
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
  const { rollParts, HEADS } = await import('../client/src/lib/combat/augments');
  const arm = (rarity: any, name = '[CBN] Test Arm') => ({ id: 'x', name, rarity, type: 'augmentation' as const, slot: 'right_arm' as const, icon: '' });
  for (let k = 0; k < 30; k++) {
    seedRandom(k);
    const c = rollParts(arm('common'))!;
    assert.ok(HEADS[c.head].basic, 'commons only roll basic heads');
    assert.equal(c.mods.length, 0);
    const l = rollParts(arm('legendary'))!;
    assert.ok(l.mods.length >= 1 || HEADS[l.head].signature, 'legendaries carry mods or a signature');
  }
  seedRandom(9); const a = rollParts(arm('epic'));
  seedRandom(9); const b = rollParts(arm('epic'));
  assert.deepEqual(a, b);
  assert.equal(rollParts(arm('rare', '[HELIX] Housing')), undefined, 'Helix parts are braces');
});

test('a common implant only hits the nearest enemy in its shape; better parts hit everyone', () => {
  const s = crowd(); // player 5,3; foes 4,3 and 4,4
  const hook = { ...PLAYER_ACTIONS[0], attackPattern: 'sweep_arc' as const };
  assert.equal(Fight.struckAt(s, { ...hook, effects: { focus: true } }, 'none', { row: 4, col: 3 }).length, 1);
  assert.equal(Fight.struckAt(s, hook, 'none', { row: 4, col: 3 }).length, 2);
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

test('rounds go fastest first, the player winning ties; the order can change mid-fight', () => {
  const base = fight();
  const two = { ...base, foes: [base.foes[0], Fight.newFoe(createBoss(3), { row: 1, col: 1 }, 40)] };
  const s = carrying(carrying(two, 0, ['HELIX']), 1, ['VOLKOV']);
  assert.deepEqual(Fight.roundOrder(s), [1, 'player', 0]);
  assert.deepEqual(Fight.roundOrder(carrying(s, 1, ['PATCHWORK'])), ['player', 1, 0], 'tie: player first, then foes in order');
  assert.deepEqual(Fight.roundOrder({ ...s, playerHasted: 2 }), ['player', 1, 0]);
  const dead = { ...s, foes: s.foes.map((f, n) => (n === 1 ? { ...f, unit: { ...f.unit, currentHp: 0 } } : f)) };
  assert.deepEqual(Fight.roundOrder(dead), ['player', 0]);
});

test('slowed and hasted last two rounds', () => {
  let s = fight({ playerSlowed: 2 });
  s = Fight.tickSpeed(s); assert.equal(s.playerSlowed, 1);
  s = Fight.tickSpeed(s); assert.equal(s.playerSlowed, 0);
  assert.equal(Fight.tickSpeed(s).playerSlowed, 0);
});

test('a fast enemy that acts last this round and first next round is flagged as acting twice', () => {
  const s = carrying(fight(), 0, ['VOLKOV']);
  // This round the player was slowed (so the foe still has to act after you); next round it leads again
  assert.deepEqual(Fight.doubleTurns(s, [0]), [0]);
  assert.deepEqual(Fight.doubleTurns(s, []), [], 'it already acted this round');
  assert.deepEqual(Fight.doubleTurns(carrying(fight(), 0, ['HELIX']), [0]), [], 'slow enemy: next round you go first');
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
