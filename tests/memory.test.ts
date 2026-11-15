import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as M from '../client/src/lib/engine/memory';
import { NO_PERKS } from '../client/src/lib/engine/playi';
import * as Fight from '../client/src/lib/engine/fight';
import type { FightState } from '../client/src/lib/engine/fight';
import { createPlayer, createBoss, liveStats } from '../client/src/lib/combat/actions';
import { seedRandom } from '../client/src/lib/engine/rng';
import type { CombatAction, CombatGrid } from '../client/src/lib/combat/types';

const withPoints = (points: number, ranks: Record<string, number> = {}, taught: string | null = null): M.MemoryState => ({ points, ranks, taught });

test('the network is well formed: links join real neurons, ids are unique, every neuron and specialisation does something', () => {
  const ids = new Set<string>();
  for (const n of M.NEURONS) {
    for (const id of [n.id, ...(n.specs ?? []).map(s => s.id)]) { assert.ok(!ids.has(id), `${id} twice`); ids.add(id); }
    assert.ok(n.fx.length > 0 && n.name && n.text, `${n.id} does something`);
    for (const fx of [...n.fx, ...(n.specs ?? []).flatMap(s => s.fx)]) assert.ok(fx.perk in NO_PERKS, `${n.id}: ${fx.perk} is a real perk`);
    assert.ok(!/instead of|, a rank/.test(n.text + (n.specs ?? []).map(s => s.text).join(' ')), `${n.id} says what it adds`);
    if (n.curve) for (const steps of [n.curve.give, n.curve.price]) assert.equal(steps[0][0], 1);
  }
  const all = new Set(M.MEMORY.neurons.map(n => n.id));
  for (const [a, b] of M.MEMORY.links) assert.ok((a === 'core' || all.has(a)) && all.has(b), `${a}-${b}`);
  // Everything can be reached from the core
  const seen = new Set(['core']); let grew = true;
  while (grew) { grew = false; for (const [a, b] of M.MEMORY.links) for (const [x, y] of [[a, b], [b, a]]) if (seen.has(x) && !seen.has(y)) { seen.add(y); grew = true; } }
  for (const n of M.NEURONS) assert.ok(seen.has(n.id), `${n.id} can be reached`);
});

test('a lost host gives one point (up to 999) and teaches a branch by how it went', () => {
  const s = M.hostLost(M.newMemory(), 'hot');
  assert.equal(s.points, 1); assert.equal(s.taught, 'heat');
  assert.equal(M.hostLost(withPoints(999), 'other').points, 999);
  assert.equal(M.causeOf({ heat: 90, by: 'heavy', structureBroken: true, rounds: 20, allyDown: true }), 'hot');
  assert.equal(M.causeOf({ heat: 10, by: 'sea', structureBroken: false, rounds: 3, allyDown: false }), 'hazard');
  assert.equal(M.causeOf({ heat: 10, by: 'other', structureBroken: false, rounds: 3, allyDown: false }), 'other');
});

test('a neuron opens once something it links to is kept; points are spent; a full one closes', () => {
  const s = withPoints(10);
  assert.ok(M.open(s, 'p1', false), 'beside the core');
  assert.ok(!M.open(s, 'p2', false), 'not until Heat sink is kept');
  const one = M.learn(s, 'p1', false);
  assert.equal(one.points, 9); assert.equal(one.ranks.p1, 1);
  assert.ok(M.open(one, 'p2', false));
  let full = one; for (let k = 0; k < 4; k++) full = M.learn(full, 'p1', false);
  assert.equal(full.ranks.p1, 5); assert.ok(!M.open(full, 'p1', false), 'full');
  assert.equal(M.learn(withPoints(0), 'p1', false).ranks.p1, undefined, 'no points, no rank');
  // Allies' neurons stay dark until someone is linked
  assert.ok(!M.open(s, 'n1', false) && M.open(s, 'n1', true));
});

test('specialisations open at full rank, and each can be bought', () => {
  const part = withPoints(10, { p1: 4 }), full = withPoints(10, { p1: 5 });
  const spec = M.neuron('p1')!.specs![0].id;
  assert.ok(!M.open(part, spec, false)); assert.ok(M.open(full, spec, false));
  const got = M.learn(full, spec, false);
  assert.equal(got.ranks[spec], 1);
  assert.ok(M.memoryPerks(got.ranks).hotTakenMult < 1);
});

test('an endless neuron never fills: each rank gives less and costs more, out of step', () => {
  const n = M.neuron('s1')!;
  assert.ok(n.curve);
  const hp = (r: number) => M.memoryPerks({ s1: r }).maxHpBonus;
  assert.equal(hp(1), 12); assert.equal(hp(3), 30);
  assert.ok(hp(2) - hp(1) > hp(6) - hp(5) && hp(6) - hp(5) > hp(30) - hp(29), 'smaller steps as it goes');
  assert.equal(M.basePrice('s1', {}), 1);
  assert.ok(M.basePrice('s1', { s1: 20 }) > M.basePrice('s1', { s1: 5 }));
  assert.ok(M.open(withPoints(1, { s1: 200 }), 's1', false), 'still open at rank 200');
  // The reward and the price don't change on the same ranks
  const gives = n.curve!.give.map(g => g[0]).slice(1), prices = n.curve!.price.map(p => p[0]).slice(1);
  assert.ok(prices.some(p => !gives.includes(p)));
});

test('what the last host taught is a point cheaper, never free', () => {
  assert.equal(M.priceOf(withPoints(5, {}, 'combat'), 'c5'), 3);
  assert.equal(M.priceOf(withPoints(5, {}, 'heat'), 'c5'), 4);
  assert.equal(M.priceOf(withPoints(5, {}, 'heat'), 'p1'), 1, 'a one-point neuron stays one');
  assert.equal(M.priceOf(withPoints(5, { j1: 0 }, 'guard'), 'j1'), 1);
});

test('kept ranks add up to perks', () => {
  const p = M.memoryPerks({ p1: 3, p2: 2, c5: 1, s3: 5, d3: 1 });
  assert.equal(p.extraCooling, 3); assert.equal(p.startHeat, 12); assert.equal(p.extraSlots, 1);
  assert.equal(p.damageTakenMult, 0.9); assert.equal(p.braceFree, true);
  assert.deepEqual(M.memoryPerks({}), NO_PERKS);
});

// ── The new effects in a fight ──────────────────────────────────────────────
function arena(player: [number, number], boss: [number, number]): CombatGrid {
  const rows = 9, cols = 7, tiles = Array.from({ length: rows }, () => Array.from({ length: cols }, () => ({ type: 'empty' as const })) as any[]);
  return { rows, cols, tiles, playerPosition: { row: player[0], col: player[1] }, bossPosition: { row: boss[0], col: boss[1] } } as CombatGrid;
}
function fight(over: Partial<FightState> = {}): FightState {
  const grid = over.grid ?? arena([5, 3], [4, 3]);
  return { player: createPlayer(), foes: [Fight.newFoe(createBoss(3), grid.bossPosition, 40)], target: 0, grid, playerHeat: 30, playerDefenseBoost: 0, playerMalfunctioning: false, overclockActive: false, kizunaJustFired: false, doubleActionReady: false, ...Fight.BASE_FIGHT_FLAGS, ...over };
}
const hit: CombatAction = { type: 'attack', name: 'Test Blow', description: '', damage: 20, physicalRatio: 0.5, accuracy: 'precise', attackPattern: 'melee' };
const lost = (a: FightState, b: FightState) => (a.foes[0].unit.currentHp + a.foes[0].unit.currentStructuralHp) - (b.foes[0].unit.currentHp + b.foes[0].unit.currentStructuralHp);

test('First strike, Hot hands and Exploit lift the blows they should', () => {
  const base = fight();
  const plain = lost(base, Fight.resolvePlayerAttack({ ...base, firstStrikeUsed: true }, hit, 'none').state);
  const first = { ...base, perks: { ...NO_PERKS, firstStrikeBonus: 0.3 } };
  assert.ok(lost(first, Fight.resolvePlayerAttack(first, hit, 'none').state) > lost(base, Fight.resolvePlayerAttack(base, hit, 'none').state));
  assert.equal(lost(first, Fight.resolvePlayerAttack({ ...first, firstStrikeUsed: true }, hit, 'none').state), plain, 'only the first');
  const hot = { ...base, perks: { ...NO_PERKS, hotHands: 0.5 }, firstStrikeUsed: true };
  assert.equal(lost(hot, Fight.resolvePlayerAttack(hot, hit, 'none').state), plain, 'not while cool');
});

test('Breaker takes more off structure; breaking it can seize the enemy up and heat it', () => {
  const u = createBoss(3);
  const foe = { ...Fight.newFoe({ ...u, maxStructuralHp: 20, currentStructuralHp: 2 }, { row: 4, col: 3 }, 10) };
  const s = fight({ foes: [foe], perks: { ...NO_PERKS, seizeUp: true, feedback: 20 } });
  const after = Fight.resolvePlayerAttack(s, { ...hit, physicalRatio: 1 }, 'none').state.foes[0];
  assert.equal(after.unit.currentStructuralHp, 0);
  assert.ok(after.stunned, 'seized up');
  assert.ok(after.heat >= 30, 'feedback heat');
});

test('Second wind heals once a fight under a third; Reboot returns structure the turn after it breaks', () => {
  const p = createPlayer();
  const low = fight({ player: { ...p, currentHp: Math.floor(p.maxHp / 4) }, perks: { ...NO_PERKS, secondWind: 0.15 } });
  const a = Fight.playerConditions(low).state;
  assert.ok(a.player.currentHp >= low.player.currentHp + Math.round(p.maxHp * 0.15));
  assert.ok(a.memo?.secondWind);
  const again = Fight.playerConditions({ ...a, player: { ...a.player, currentHp: low.player.currentHp } }).state;
  assert.ok(again.player.currentHp - low.player.currentHp < Math.round(p.maxHp * 0.15), 'only once');
  const broken = fight({ player: { ...p, maxStructuralHp: 40, currentStructuralHp: 0 }, playerMalfunctioning: true, perks: { ...NO_PERKS, reboot: 0.2 }, memo: { reboot: 'due' } });
  const r = Fight.playerConditions(broken).state;
  assert.equal(r.player.currentStructuralHp, 8); assert.equal(r.memo?.reboot, 'used'); assert.equal(r.playerMalfunctioning, false);
});

test('Brace: Braced adds guard, Practised guard scales it, Cool head sheds heat, Counterweight lifts the next blow', () => {
  const brace: CombatAction = { type: 'brace', name: 'Brace', description: '', defenseBoost: 8, heatGenerated: -25 };
  const s = fight({ playerHeat: 60, perks: { ...NO_PERKS, braceGuard: 3, defendMult: 1.5, defendCool: 4, afterDefend: 0.5 } });
  const b0 = Fight.resolveBrace(s, brace).state;
  // A sturdy enemy, so neither blow is cut short by killing it
  const b = { ...b0, foes: b0.foes.map(f => ({ ...f, unit: { ...f.unit, maxHp: 500, currentHp: 500 } })) };
  assert.equal(b.playerDefenseBoost, 12 + 3);
  assert.equal(b.playerHeat, 60 - 25 - 4);
  assert.ok(b.memo?.afterDefend);
  seedRandom(3); const lifted = lost(b, Fight.resolvePlayerAttack({ ...b, firstStrikeUsed: true }, hit, 'none').state);
  seedRandom(3); const plain = lost(b, Fight.resolvePlayerAttack({ ...b, firstStrikeUsed: true, memo: {} }, hit, 'none').state);
  assert.ok(lifted > plain);
  assert.equal(Fight.resolvePlayerAttack(b, hit, 'none').state.memo?.afterDefend, false, 'spent by the attack');
});

test('Cold blood mends at the end of a cool turn; Fail-safe keeps more of broken implants; Sealed mends a little while broken', () => {
  const p = createPlayer();
  const s = fight({ playerHeat: 20, player: { ...p, currentHp: 50 }, perks: { ...NO_PERKS, coldBlood: 0.03 } });
  assert.ok(Fight.endPlayerTurn(s).player.currentHp > 50);
  assert.equal(Fight.endPlayerTurn({ ...s, playerHeat: 60 }).player.currentHp, 50);
  const worn = { ...p, maxStructuralHp: 40, currentStructuralHp: 0, implantStats: { pa: 10, sa: 10, pd: 10, sd: 10 } } as typeof p;
  assert.ok(liveStats(worn, 0.25).physicalAttack > liveStats(worn).physicalAttack);
  const broken = fight({ player: { ...p, currentHp: 50, maxStructuralHp: 40, currentStructuralHp: 0 } });
  assert.equal(Fight.mendAmount(broken), 0);
  assert.ok(Fight.mendAmount({ ...broken, perks: { ...NO_PERKS, sealed: 0.3 } }) > 0);
});

test('every effect a neuron grants is read somewhere in the game (nothing bought does nothing)', async () => {
  const { readdirSync, readFileSync, statSync } = await import('node:fs');
  const { join } = await import('node:path');
  const files: string[] = [];
  const walk = (dir: string) => { for (const f of readdirSync(dir)) { const p = join(dir, f); if (statSync(p).isDirectory()) walk(p); else if (/\.tsx?$/.test(f) && !/^(playi|memory)\.ts$|MemoryMockup/.test(f)) files.push(p); } };
  walk('client/src');
  const src = files.map(f => readFileSync(f, 'utf8')).join('\n');
  const perks = new Set(M.NEURONS.flatMap(n => [...n.fx, ...(n.specs ?? []).flatMap(s => s.fx)].map(f => f.perk)));
  for (const perk of Array.from(perks)) assert.ok(new RegExp(`\\.${perk}\\b`).test(src), `${perk} is used by the game`);
});

test('Second chance rolls another part for the same slot at the same grade', async () => {
  const { rerollImplant, rollCarried } = await import('../client/src/lib/combat/loot');
  seedRandom(11);
  const [part] = rollCarried(6, 1, 'normal');
  const again = rerollImplant(part)!;
  assert.ok(again && again.id !== part.id);
  assert.equal(again.slot, part.slot); assert.equal(again.rarity, part.rarity);
});

test('the preview of a blow counts what the memory adds to it', () => {
  const base = fight({ firstStrikeUsed: true });
  const plain = Fight.estimateHit(base, hit, 'none', base.foes[0].pos, 0)!;
  const lifted = Fight.estimateHit({ ...base, firstStrikeUsed: false, perks: { ...NO_PERKS, firstStrikeBonus: 0.5 } }, hit, 'none', base.foes[0].pos, 0)!;
  assert.ok(lifted.max > plain.max);
});

test('options over numbers: Triage, Brace and shove, Riposte, Jam, Controlled burn, Carry, Backstab step', () => {
  const brace: CombatAction = { type: 'brace', name: 'Brace', description: '', defenseBoost: 8, heatGenerated: -25 };
  // Triage: a turn without an attack mends
  const hurt = fight({ perks: { ...NO_PERKS, triage: 0.05 } });
  const low = { ...hurt, player: { ...hurt.player, currentHp: 50 } };
  assert.ok(Fight.endPlayerTurn(low).player.currentHp > 50);
  assert.equal(Fight.endPlayerTurn({ ...low, memo: { attacked: true } }).player.currentHp, 50, 'not after attacking');
  // Brace and shove: an enemy beside you goes back a tile
  const s = fight({ perks: { ...NO_PERKS, braceShove: true } });
  const me = s.grid.playerPosition, beside = { row: me.row - 1, col: me.col };
  const near = { ...s, foes: [{ ...s.foes[0], pos: beside }] };
  assert.equal(Fight.resolveBrace(near, brace).state.foes[0].pos.row, beside.row - 1);
  // Riposte: armed by a defensive move, ready next turn, then gone
  const r = Fight.resolveBrace(fight({ perks: { ...NO_PERKS, riposte: true } }), brace).state;
  assert.equal(r.memo?.riposte, 'armed');
  const next = Fight.endPlayerTurn(r);
  assert.equal(next.memo?.riposte, 'ready');
  assert.equal(Fight.partingFoes({ ...next, foes: [{ ...next.foes[0], pos: beside }] }, me, { row: me.row + 2, col: me.col }).length > 0 && Fight.partingBlows({ ...next, foes: [{ ...next.foes[0], pos: beside }] }, me, 1).events.length, 0, 'no parting blow');
  assert.equal(Fight.endPlayerTurn(next).memo?.riposte, undefined);
  // Jam: hitting a malfunctioning enemy makes its next move misfire for certain
  const j = fight({ perks: { ...NO_PERKS, jam: true } });
  const broken = { ...j, foes: [{ ...j.foes[0], pos: beside, malfunctioning: true, unit: { ...j.foes[0].unit, currentStructuralHp: 0, maxHp: 500, currentHp: 500 } }] };
  const hitIt = Fight.resolvePlayerAttack({ ...broken, firstStrikeUsed: true }, hit, 'none').state;
  assert.ok(hitIt.foes[0].jammed);
  for (let n = 0; n < 10; n++) { seedRandom(n + 1); assert.ok(Fight.foeTurn(hitIt, 0, 1).events.some(e => e.kind === 'misfire')); }
  // Controlled burn: once a fight, a burnout sets everyone beside you alight
  const b = fight({ playerHeat: 100, perks: { ...NO_PERKS, controlledBurn: true } });
  const out = Fight.burnout({ ...b, foes: [{ ...b.foes[0], pos: beside, unit: { ...b.foes[0].unit, maxHp: 500, currentHp: 500 } }] }, []);
  assert.ok(out.foes[0].burning > 0 && out.memo?.burned);
});
