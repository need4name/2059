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
import { useAllies as AL } from '../client/src/lib/stores/useAllies';
import * as F from '../client/src/lib/engine/fight';
import * as MAP from '../client/src/lib/engine/map';
import { useMap as MP } from '../client/src/lib/stores/useMap';
import * as P from '../client/src/lib/combat/patterns';
import * as G from '../client/src/lib/combat/grid';
import * as A from '../client/src/lib/combat/actions';
import * as W from '../client/src/lib/combat/weapons2059';
import * as ALD from '../client/src/lib/combat/allies';
import * as A2 from '../client/src/lib/combat/augments';

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
  // Spare implants go to allies riding along, best fit first
  for (const id of AL.getState().party) {
    const def = ALD.allyDef(id)!;
    for (const slot of ['limb', 'other'] as const) {
      const score = (x: any) => value(x) * (ALD.fitsAlly(def, x) ? ALD.AFFINITY.stats : 1) + (slot === 'limb' ? (A2.actionForItem(x)?.damage ?? 0) : 0);
      const best = I.getState().items.filter((x: any) => ALD.allySlotFor(x) === slot).sort((a: any, b: any) => score(b) - score(a))[0];
      const now = AL.getState().gear[id]?.[slot];
      if (best && (!now || score(best) > score(now))) AL.getState().giveImplant(id, best);
    }
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

// ── Allies act first: heal a hurt player, else get in range and hit, else support
function allyTurn() {
  C.getState().allies.forEach((a, k) => {
    if (a.unit.currentHp <= 0) return;
    const st = C.getState();
    const find = (e: string) => a.moves.findIndex((m, n) => m.effect === e && F.canAllyUse(st, k, n));
    const heal = find('heal');
    if (heal >= 0 && st.player.currentHp < st.player.maxHp * 0.5) { st.allyAct(k, heal); return; }
    const atk = a.moves.findIndex(m => m.effect === 'attack');
    const tgt = st.foes[st.target];
    if (tgt && !F.canAllyUse(st, k, atk)) {
      const tiles = Array.from(F.allyReach(st, k)).map(key => { const [row, col] = key.split(',').map(Number); return { row, col }; })
        .filter(p => !(st.originalPosition && p.row === st.originalPosition.row && p.col === st.originalPosition.col));
      const at = (pos: any) => ({ ...st, allies: st.allies.map((o, n) => (n === k ? { ...o, pos } : o)) });
      const best = tiles.find(p => F.canAllyUse(at(p), k, atk)) ?? tiles.sort((x, y) => G.chebyshev(x, tgt.pos) - G.chebyshev(y, tgt.pos))[0];
      if (best && G.chebyshev(best, tgt.pos) < G.chebyshev(a.pos, tgt.pos) + (F.canAllyUse(at(best), k, atk) ? 1 : 0)) { st.toggleAllyMove(k); C.getState().moveAlly(best); }
    }
    const now = C.getState();
    const support = ['mark', 'guard', 'taunt'].map(e => a.moves.findIndex((m, n) => m.effect === e && F.canAllyUse(now, k, n))).find(n => n >= 0);
    if (support !== undefined && (a.moves[support].effect !== 'taunt' || now.player.currentHp < now.player.maxHp * 0.6)) { now.allyAct(k, support); return; }
    for (let n = 0; n < a.moves.length; n++) if (a.moves[n].effect === 'attack' && F.canAllyUse(now, k, n)) { now.allyAct(k, n); return; }
  });
}

// ── One player turn: aim, dodge telegraphs (most of the time), get in range, hit
function playerTurn(skill: number) {
  // After attacking without moving (Reflex), the game waits for a step or a pass: the bot passes
  if (C.getState().reflexMoveOpen) { C.getState().endTurn(); return; }
  allyTurn();
  // A full overload meter with enemies close: surge
  if (F.canSurge(C.getState() as any)) { C.getState().surge(); return; }
  const s = C.getState(); const slots = L.getState().slots.filter(Boolean) as any[];
  const stims = I.getState().items.filter((i: any) => i.type === 'consumable');
  if (s.player.currentHp < s.player.maxHp * 0.35) { const bio = stims.find((i: any) => i.consumableEffect === 'bio_stim'); if (bio) { s.useConsumableItem(bio.id); return; } }
  const living = s.foes.map((f, i) => ({ f, i })).filter(x => x.f.unit.currentHp > 0);
  const atks = slots.filter(a => a.type !== 'brace' && a.damage).sort((a, b) => (b.damage || 0) - (a.damage || 0));
  const g = s.grid;
  // Could this attack hit anyone if the bot stood at pos? (the game's own aiming rules)
  const canHitFrom = (pos: any, a: any) => F.canPlayerHitAny({ ...(s as any), grid: { ...g, playerPosition: pos } }, a, s.playerClass);
  const danger = new Set<string>();
  // Heavies lock their tiles when they wind up: step off them (most of the time)
  for (const { f } of living) if (f.pendingTiles && botRandom() < skill) for (const t of f.pendingTiles) danger.add(`${t.row},${t.col}`);
  const nearest = (pos: any) => Math.min(...living.map(x => G.chebyshev(pos, x.f.pos)));
  // The red tiles are honest (enemies hit before they move): a sensible player prefers a safe tile it can still attack from
  const red = new Set<string>(); for (const { i } of living) F.foeThreatTiles(s as any, i).forEach(k => red.add(k));
  const opts = [g.playerPosition, ...Array.from(G.getReachableTiles(g.playerPosition, g, s.playerMoveRange)).map((k: any) => { const [row, col] = k.split(',').map(Number); return { row, col }; })];
  // Only dodge the red when there's a safe tile to fight from; otherwise walk in
  const canAttackSomewhere = opts.some(p => atks.some(a => canHitFrom(p, a)));
  const score = (pos: any) => { let v = 0; if (danger.has(`${pos.row},${pos.col}`)) v -= 100; if (g.tiles[pos.row][pos.col].type === 'hazard') v -= 30; if (canAttackSomewhere && red.has(`${pos.row},${pos.col}`)) v -= 20 * skill; if (F.partingFoes(s as any, g.playerPosition, pos).length) v -= 15 * skill; if ((s as any).alarm?.on && F.besideColdPod(s as any, pos)) v += 25 * skill; if (atks.some(a => canHitFrom(pos, a))) v += 50; v -= nearest(pos); return v; };
  const best = opts.sort((a, b) => score(b) - score(a))[0];
  if (s.playerHeat < 100 && (best.row !== g.playerPosition.row || best.col !== g.playerPosition.col)) s.moveTentatively(best);
  const pos = C.getState().grid.playerPosition; const brace = slots.find(a => a.type === 'brace');
  // The strongest attack that hits anyone from here; picking it aims it at its best tiles
  let act = atks.find(a => F.canPlayerHitAny(C.getState() as any, a, C.getState().playerClass));
  if ((s.playerMalfunctioning || s.playerHeat >= 85) && brace && botRandom() < skill) act = brace;
  if (act) C.getState().setSelectedAction(act);
  C.getState().endTurn();
}

const ALLY_ORDER = (id: string) => ['bale', 'matron', 'ghostline', 'ward', 'breaker'].indexOf(id);

// ── The hidden map: walk to the easiest fight still standing ─────────────────
// On the way the bot looks at things (goals), meets allies and searches caches.
function tidyRoom() {
  const s = MP.getState(); const room = MAP.roomById(s.room);
  if (MAP.hasFight(s, room)) return;
  if (room.look && !s.looked.includes(room.id)) MP.getState().look();
  if (room.ally && !AL.getState().met.includes(room.ally)) {
    AL.getState().meet(room.ally);
    const slots = Y.getState().perks().allySlots;
    if (AL.getState().party.length < slots) AL.getState().setParty([...AL.getState().party, room.ally], slots);
  }
  if (MAP.cacheReady(s, room)) C.getState().openRoomCache();
}

/** Walk to the lowest-threat uncleared fight the bot can reach. False when none is left (chapter done). */
function walkToFight(): boolean {
  tidyRoom();
  const s = MP.getState();
  if (MAP.hasFight(s)) return true;
  // Search through clear rooms; a fight room ends a path
  const prev = new Map<string, { from: string; exit: number }>();
  const seen = new Set([s.room]); const queue = [s.room]; const targets: string[] = [];
  while (queue.length) {
    const id = queue.shift()!;
    MAP.roomById(id).exits.forEach((e, k) => {
      if (seen.has(e.to) || (e.requires === 'goals' && !MAP.allGoals(s))) return;
      seen.add(e.to); prev.set(e.to, { from: id, exit: k });
      if (MAP.hasFight(s, MAP.roomById(e.to))) targets.push(e.to); else queue.push(e.to);
    });
  }
  if (!targets.length) return false;
  let cur = targets.sort((a, b) => (MAP.roomById(a).threat ?? 0) - (MAP.roomById(b).threat ?? 0))[0];
  const path: number[] = [];
  while (cur !== s.room) { const p = prev.get(cur)!; path.unshift(p.exit); cur = p.from; }
  for (const ex of path) { MP.getState().go(ex); tidyRoom(); }
  return MAP.hasFight(MP.getState());
}

interface Fight { lvl: number; won: boolean; turns: number; lowest: number; deathsBefore: number; allies: number; timedOut: boolean }

let chaptersDone = 0, debugShown = false;
function playRun(seed: number, maxFights: number, skill: number): Fight[] {
  botState = seed * 7919 + 1;
  C.getState().resetAll(); C.getState().setRunSeed(seed); C.getState().completeIntro();
  // CHAPTER=<id> plays that chapter's map from a fresh start (a rough check of its numbers)
  if (process.env.CHAPTER) MP.getState().travel(process.env.CHAPTER);
  const out: Fight[] = [];
  while (out.length < maxFights) {
    betweenFights();
    if (!walkToFight()) { chaptersDone++; break; }
    const lvl = MAP.roomById(MP.getState().room).threat!; const deathsBefore = C.getState().progression.deathCount;
    C.getState().startRoomFight(); let turns = 0, lowest = 1, timedOut = false; const allyCount = C.getState().allies.length;
    while (C.getState().phase === 'player_turn' || C.getState().phase === 'enemy_turn') {
      if (C.getState().phase === 'player_turn' && !C.getState().inputLocked) { playerTurn(skill); turns++; }
      drain(); const st = C.getState(); lowest = Math.min(lowest, st.player.currentHp / st.player.maxHp);
      if (turns > 80) {
        if (process.env.DEBUGTO && !debugShown && (process.env.DEBUGTO === '1' || Number(process.env.DEBUGTO) === lvl)) { debugShown = true; const st = C.getState(); console.log('TIMEOUT threat', lvl, 'shape', st.grid.arenaShape, 'player', JSON.stringify(st.grid.playerPosition), 'hp', st.player.currentHp, 'heat', st.playerHeat, 'alarm', JSON.stringify((st as any).alarm), 'reflex', st.reflexMoveOpen, 'locked', st.inputLocked, 'foes', JSON.stringify(st.foes.map(f => [f.unit.name, f.unit.currentHp, f.pos, f.unit.traits])), 'allies', JSON.stringify(st.allies.map(a => [a.id, a.unit.currentHp, a.pos, a.taunting])), 'foeState', JSON.stringify(st.foes.map(f => ({ heat: f.heat, pend: f.pendingAction?.name, stun: f.stunned })))); console.log(st.grid.tiles.map((r, ri) => r.map((t, ci) => st.grid.playerPosition.row === ri && st.grid.playerPosition.col === ci ? 'P' : st.foes.some(f => f.unit.currentHp > 0 && f.pos.row === ri && f.pos.col === ci) ? 'E' : t.type === 'void' ? ' ' : t.type === 'obstacle' ? '#' : t.type === 'hazard' ? '~' : '.').join('')).join('\n')); console.log(st.combatLog.slice(-14).map(l => l.message).join(' | ')); }
        C.getState().resetCombat(); timedOut = true; break;
      }
    }
    const won = C.getState().phase === 'victory';
    out.push({ lvl, won, turns, lowest, deathsBefore, allies: allyCount, timedOut });
    if (won) { C.getState().continueFromVictory(); if (C.getState().phase === 'shop') C.getState().leaveShop(); }
    else if (C.getState().phase === 'defeat') {
      // The bot picks one of the two cards the tree offers
      const offer = Y.getState().offer;
      if (offer) Y.getState().pick(offer[botRandom() < 0.5 ? 0 : 1]);
      // Link with the highest-level allies the tree allows
      const open = AL.getState().unlocked().sort((x, y) => AL.getState().progress(y).level - AL.getState().progress(x).level || ALLY_ORDER(y) - ALLY_ORDER(x));
      AL.getState().setParty(open, Y.getState().perks().allySlots);
      // A new host keeps the same run seed sequence, so reseed per host for variety
      C.getState().rebirth(C.getState().classesUnlocked ? (botRandom() < 0.5 ? 'melee' : 'ranged') : undefined);
      C.getState().setRunSeed(seed * 31 + C.getState().progression.deathCount);
    }
  }
  return out;
}

// ── Run and report ─────────────────────────────────────────────────────────
const args = process.argv.slice(2);
const RUNS = Number(process.env.RUNS ?? 20), FIGHTS = Number(process.env.FIGHTS ?? 250), SKILL = Number(process.env.SKILL ?? 0.8);
const runs = Array.from({ length: RUNS }, (_, i) => playRun(i + 1, FIGHTS, SKILL));
const all = runs.flat();
const band = (l: number) => l <= 3 ? '1-3' : l <= 6 ? '4-6' : l <= 9 ? '7-9' : l === 10 ? '10 King' : l <= 14 ? '11-14' : l <= 20 ? '15-20' : '21+';
const bands = ['1-3', '4-6', '7-9', '10 King', '11-14', '15-20', '21+'];
const rows = bands.map(b => { const f = all.filter(x => band(x.lvl) === b); return { band: b, fights: f.length, winRate: f.length ? f.filter(x => x.won).length / f.length : NaN, avgTurns: f.length ? f.reduce((a, x) => a + x.turns, 0) / f.length : NaN }; }).filter(r => r.fights > 0);
const firstDeath = runs.map(r => r.find(f => !f.won)?.lvl ?? null);
const reached = runs.map(r => Math.max(...r.map(f => f.lvl)));
const pct = (n: number) => `${Math.round(n * 100)}%`;
console.table(rows.map(r => ({ band: r.band, fights: r.fights, winRate: pct(r.winRate), avgTurns: r.avgTurns.toFixed(1) })));
if (process.env.PERLEVEL) { const per: Record<number, [number, number]> = {}; for (const f of all) { per[f.lvl] ??= [0, 0]; per[f.lvl][1]++; if (f.won) per[f.lvl][0]++; } console.log('per level win%:', Object.entries(per).map(([l, [w, n]]) => `${l}:${Math.round(100 * w / n)}%(${n})`).join(' ')); const to = all.filter(f => f.timedOut); if (to.length) console.log('timed out (80 turns):', to.length, 'at threats', Array.from(new Set(to.map(f => f.lvl))).join(' ')); }
console.log('first death at threat:', firstDeath.join(' '));
// How far players get as the signal learns: best level reached by the time k hosts are lost
const med = (xs: number[]) => { const v = [...xs].sort((a, b) => a - b); return v.length ? v[Math.floor(v.length / 2)] : NaN; };
const bestBy = (k: number) => runs.filter(r => r.some(f => f.deathsBefore >= k)).map(r => Math.max(0, ...r.filter(f => f.deathsBefore <= k && f.won).map(f => f.lvl)));
const kind = (l: number) => l % 10 === 0 ? 'boss' : l % 5 === 0 ? 'elite' : 'normal';
const turnsOf = (k: string) => { const f = all.filter(x => kind(x.lvl) === k && x.won); return f.length ? (f.reduce((a, x) => a + x.turns, 0) / f.length).toFixed(1) : '-'; };
console.log(`turns per won fight: normal ${turnsOf('normal')}, elite ${turnsOf('elite')}, boss ${turnsOf('boss')}`);
console.log('median best level after hosts lost:', [0, 5, 10, 20].map(k => `${k}: ${med(bestBy(k))}`).join(' | '));
console.log('highest threat reached:', reached.join(' '));
console.log(`fights with an ally: ${pct(all.filter(x => x.allies > 0).length / all.length)}`);
console.log(`runs that finished chapter one: ${chaptersDone} of ${runs.length}`);

// Agreed ranges (see the development plan). Bands with few fights are skipped.
const checks: [string, boolean][] = [];
const firstDeathEarly = firstDeath.filter(l => l === 2 || l === 3).length / runs.length;
checks.push([`first death on enemy 2 or 3 in >= 85% of runs (got ${pct(firstDeathEarly)})`, firstDeathEarly >= 0.85]);
for (const r of rows) if (r.fights >= 15 && r.band !== '1-3') checks.push([`win rate ${r.band} within 65-99% (got ${pct(r.winRate)})`, Math.round(r.winRate * 100) >= 65 && Math.round(r.winRate * 100) <= 99]);
const median = [...reached].sort((a, b) => a - b)[Math.floor(reached.length / 2)];
checks.push([`median highest threat >= 9 (got ${median})`, median >= 9]);
const normalTurns = Number(turnsOf('normal')), bossTurns = Number(turnsOf('boss'));
checks.push([`normal fights take <= 8 turns (got ${turnsOf('normal')})`, normalTurns <= 8]);
if (!Number.isNaN(bossTurns)) checks.push([`boss fights take <= 16 turns (got ${turnsOf('boss')})`, bossTurns <= 16]);
// The signal should make steady progress, not snowball: best level after 10 and 20 hosts lost.
// Allies keep their implants across hosts, so progress carries over a little more than it used to
const best10 = med(bestBy(10)), best20 = med(bestBy(20));
if (!Number.isNaN(best10)) checks.push([`best level after 10 hosts lost within 9-22 (got ${best10})`, best10 >= 9 && best10 <= 22]);
if (!Number.isNaN(best20)) checks.push([`best level after 20 hosts lost within 13-25 (got ${best20})`, best20 >= 13 && best20 <= 25]);
for (const [label, ok] of checks) console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}`);
if (args.includes('--check') && checks.some(([, ok]) => !ok)) process.exit(1);
