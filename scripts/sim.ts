// Balance simulator: a bot plays the real game stores, headless and fast.
//   npm run sim            print the balance report
//   npm run sim -- --check fail (exit 1) if a number leaves its agreed range
// Runs are seeded, so the same code always gives the same report.

import { drainTimers as drain } from './headless';
import { useCombat as C } from '../client/src/lib/stores/useCombat';
import { useInventory as I } from '../client/src/lib/stores/useInventory';
import { useAugmentTrees as T } from '../client/src/lib/stores/useAugmentTrees';
import { useLoadout as L } from '../client/src/lib/stores/useLoadout';
import { usePlayi as Y } from '../client/src/lib/stores/usePlayi';
import * as P from '../client/src/lib/combat/patterns';
import * as G from '../client/src/lib/combat/grid';
import * as A from '../client/src/lib/combat/actions';
import * as W from '../client/src/lib/combat/weapons2059';

// The bot's own dice, separate from the game's seeded stream
let botState = 1;
const botRandom = () => { botState = (botState + 0x6d2b79f5) >>> 0; let t = botState; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };

// ── Between fights: install better parts, spend points, buy a weapon, set the bar
function betweenFights() {
  const value = (x: any) => (x.attackBonus || 0) + (x.defenseBonus || 0) + (x.hpBonus || 0) / 3;
  for (const it of I.getState().items.filter((i: any) => i.type === 'augmentation')) {
    const eq = I.getState().equippedAugmentations[it.slot!];
    if (!eq || value(it) > value(eq)) { I.getState().equipAugmentation(it); T.getState().unlockSlot(it.slot!); }
  }
  const slots = Object.entries(I.getState().equippedAugmentations).filter(([, v]) => v).map(([k]) => k as any);
  for (const s of slots) if (!T.getState().getProgress(s)?.chosenPath) T.getState().choosePath(s, botRandom() < 0.5 ? 'A' : 'B');
  for (let g = 30; T.getState().availablePoints > 0 && g--;) {
    const s = slots.find(sl => { const pr = T.getState().getProgress(sl); return pr?.chosenPath && pr.tier < 3; });
    if (!s) break; T.getState().upgradeTier(s);
  }
  const inv = I.getState();
  const afford = W.TIER1_WEAPONS.filter(w => w.price <= inv.gold).sort((a, b) => (b.combatAction.damage ?? 0) - (a.combatAction.damage ?? 0))[0];
  if (afford && !inv.equippedWeapon && inv.buyWeapon(afford)) inv.equipWeapon(afford);
  const cls = C.getState().playerClass; const def = A.CLASS_DEFINITIONS[cls];
  const pool: any[] = [{ ...A.PLAYER_ACTIONS[0], key: 'base_strike' }, { ...A.PLAYER_ACTIONS[1], key: 'base_brace' }];
  if (cls !== 'none') { const sp = def.specialAbility; const st = A.createPlayer(I.getState().getTotalAugmentationBonuses(), cls); pool.push({ type: 'special', name: sp.name, description: '', damage: Math.floor(st.physicalAttack * (sp.damage || 1)), heatGenerated: 25, accuracy: 'precise', attackPattern: sp.attackPattern, ignoreRange: sp.ignoreRange, physicalRatio: sp.physicalRatio, key: 'cls' }); }
  pool.push(...T.getState().getAugmentCombatActions(slots).filter((a: any) => a.damage));
  const w = I.getState().equippedWeapon; if (w) pool.push({ ...w.combatAction, key: 'w' });
  const extra = pool.slice(2).sort((a, b) => (b.damage || 0) - (a.damage || 0)).slice(0, 2);
  L.getState().setSlots([pool[0], pool[1], extra[0] ?? null, extra[1] ?? null]);
}

// ── One player turn: aim, dodge telegraphs (most of the time), get in range, hit
function playerTurn(skill: number) {
  const s = C.getState(); const slots = L.getState().slots.filter(Boolean) as any[];
  const stims = I.getState().items.filter((i: any) => i.type === 'consumable');
  if (s.player.currentHp < s.player.maxHp * 0.35) { const bio = stims.find((i: any) => i.consumableEffect === 'bio_stim'); if (bio) { s.useConsumableItem(bio.id); return; } }
  const living = s.foes.map((f, i) => ({ f, i })).filter(x => x.f.unit.currentHp > 0);
  const atks = slots.filter(a => a.type !== 'brace' && a.damage).sort((a, b) => (b.damage || 0) - (a.damage || 0));
  const g = s.grid;
  const viewAt = (pos: any, i: number) => ({ ...g, playerPosition: pos, bossPosition: s.foes[i].pos, occupied: living.filter(x => x.i !== i).map(x => x.f.pos) });
  const canHit = (pos: any, a: any, i: number) => a.ignoreRange || P.canHitTarget(pos, s.foes[i].pos, a.attackPattern || 'melee_long', viewAt(pos, i));
  const danger = new Set<string>();
  for (const { f, i } of living) if (f.pendingAction && botRandom() < skill) {
    for (let r = 0; r < g.rows; r++) for (let c = 0; c < g.cols; c++) if (P.canHitTarget(f.pos, { row: r, col: c }, f.pendingAction.attackPattern || 'melee_long', viewAt({ row: r, col: c }, i))) danger.add(`${r},${c}`);
  }
  const nearest = (pos: any) => Math.min(...living.map(x => G.chebyshev(pos, x.f.pos)));
  const opts = [g.playerPosition, ...Array.from(G.getReachableTiles(g.playerPosition, g, s.playerMoveRange)).map((k: any) => { const [row, col] = k.split(',').map(Number); return { row, col }; })];
  const score = (pos: any) => { let v = 0; if (danger.has(`${pos.row},${pos.col}`)) v -= 100; if (g.tiles[pos.row][pos.col].type === 'hazard') v -= 30; if (living.some(x => atks.some(a => canHit(pos, a, x.i)))) v += 50; v -= nearest(pos); return v; };
  const best = opts.sort((a, b) => score(b) - score(a))[0];
  if (s.playerHeat < 100 && (best.row !== g.playerPosition.row || best.col !== g.playerPosition.col)) s.moveTentatively(best);
  const pos = C.getState().grid.playerPosition; const brace = slots.find(a => a.type === 'brace');
  // Aim at the weakest foe this position can hit, else the nearest
  const hittable = living.filter(x => atks.some(a => canHit(pos, a, x.i))).sort((a, b) => a.f.unit.currentHp - b.f.unit.currentHp);
  const aim = hittable[0] ?? living.sort((a, b) => G.chebyshev(pos, a.f.pos) - G.chebyshev(pos, b.f.pos))[0];
  if (aim) C.getState().setTarget(aim.i);
  let act = aim ? atks.find(a => canHit(pos, a, aim.i)) : undefined;
  if ((s.playerMalfunctioning || s.playerHeat >= 85) && brace && botRandom() < skill) act = brace;
  if (act) C.getState().setSelectedAction(act);
  C.getState().endTurn();
}

interface Fight { lvl: number; won: boolean; turns: number; lowest: number; deathsBefore: number }

function playRun(seed: number, maxFights: number, skill: number): Fight[] {
  botState = seed * 7919 + 1;
  C.getState().resetAll(); C.getState().setRunSeed(seed); C.getState().completeIntro();
  const out: Fight[] = [];
  while (out.length < maxFights) {
    betweenFights();
    const lvl = C.getState().bossLevel; const deathsBefore = C.getState().progression.deathCount;
    C.getState().startCombat(); let turns = 0, lowest = 1;
    while (C.getState().phase === 'player_turn' || C.getState().phase === 'enemy_turn') {
      if (C.getState().phase === 'player_turn' && !C.getState().inputLocked) { playerTurn(skill); turns++; }
      drain(); const st = C.getState(); lowest = Math.min(lowest, st.player.currentHp / st.player.maxHp);
      if (turns > 80) { C.getState().resetCombat(); break; }
    }
    const won = C.getState().phase === 'victory';
    out.push({ lvl, won, turns, lowest, deathsBefore });
    if (won) { C.getState().continueFromVictory(); if (C.getState().phase === 'shop') C.getState().leaveShop(); }
    else if (C.getState().phase === 'defeat') {
      // The bot picks one of the two cards the tree offers
      const offer = Y.getState().offer;
      if (offer) Y.getState().pick(offer[botRandom() < 0.5 ? 0 : 1]);
      // A new host keeps the same run seed sequence, so reseed per host for variety
      C.getState().rebirth(C.getState().classesUnlocked ? (botRandom() < 0.5 ? 'melee' : 'ranged') : undefined);
      C.getState().setRunSeed(seed * 31 + C.getState().progression.deathCount);
    }
  }
  return out;
}

// ── Run and report ─────────────────────────────────────────────────────────
const args = process.argv.slice(2);
const RUNS = Number(process.env.RUNS ?? 20), FIGHTS = Number(process.env.FIGHTS ?? 30), SKILL = Number(process.env.SKILL ?? 0.8);
const runs = Array.from({ length: RUNS }, (_, i) => playRun(i + 1, FIGHTS, SKILL));
const all = runs.flat();
const band = (l: number) => l <= 3 ? '1-3' : l <= 6 ? '4-6' : l <= 9 ? '7-9' : l === 10 ? '10 King' : l <= 14 ? '11-14' : l <= 20 ? '15-20' : '21+';
const bands = ['1-3', '4-6', '7-9', '10 King', '11-14', '15-20', '21+'];
const rows = bands.map(b => { const f = all.filter(x => band(x.lvl) === b); return { band: b, fights: f.length, winRate: f.length ? f.filter(x => x.won).length / f.length : NaN, avgTurns: f.length ? f.reduce((a, x) => a + x.turns, 0) / f.length : NaN }; }).filter(r => r.fights > 0);
const firstDeath = runs.map(r => r.find(f => !f.won)?.lvl ?? null);
const reached = runs.map(r => Math.max(...r.map(f => f.lvl)));
const pct = (n: number) => `${Math.round(n * 100)}%`;
console.table(rows.map(r => ({ band: r.band, fights: r.fights, winRate: pct(r.winRate), avgTurns: r.avgTurns.toFixed(1) })));
console.log('first death at threat:', firstDeath.join(' '));
console.log('highest threat reached:', reached.join(' '));

// Agreed ranges (see the development plan). Bands with few fights are skipped.
const checks: [string, boolean][] = [];
const firstDeathEarly = firstDeath.filter(l => l === 2 || l === 3).length / runs.length;
checks.push([`first death on enemy 2 or 3 in >= 85% of runs (got ${pct(firstDeathEarly)})`, firstDeathEarly >= 0.85]);
for (const r of rows) if (r.fights >= 15 && r.band !== '1-3') checks.push([`win rate ${r.band} within 65-99% (got ${pct(r.winRate)})`, r.winRate >= 0.65 && r.winRate <= 0.99]);
const median = [...reached].sort((a, b) => a - b)[Math.floor(reached.length / 2)];
checks.push([`median highest threat >= 9 (got ${median})`, median >= 9]);
for (const [label, ok] of checks) console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}`);
if (args.includes('--check') && checks.some(([, ok]) => !ok)) process.exit(1);
