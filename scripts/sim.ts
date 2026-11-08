// Balance simulator: a bot plays the real game stores, headless and fast.
//   npm run sim            print the balance report
//   npm run sim -- --check fail (exit 1) if a number leaves its agreed range
// Runs are seeded, so the same code always gives the same report.

import { drainTimers as drain } from './headless';
import { useCombat as C } from '../client/src/lib/stores/useCombat';
import { useInventory as I } from '../client/src/lib/stores/useInventory';
import { useAugmentTrees as T, nodesOf } from '../client/src/lib/stores/useAugmentTrees';
import * as UP from '../client/src/lib/engine/upgrades';
import { useFirmware as FW } from '../client/src/lib/stores/useFirmware';
import * as FWE from '../client/src/lib/engine/firmware';
import { NO_PERKS } from '../client/src/lib/engine/playi';
import { useRunStats } from '../client/src/lib/stores/useRunStats';
import { availableFirmware, hostHealth } from '../client/src/lib/stores/useCombat';
import { useLoadout as L } from '../client/src/lib/stores/useLoadout';
import { usePlayi as Y } from '../client/src/lib/stores/usePlayi';
import { useAllies as AL } from '../client/src/lib/stores/useAllies';
import * as F from '../client/src/lib/engine/fight';
import * as MAP from '../client/src/lib/engine/map';
import { useStrain as ST } from '../client/src/lib/stores/useStrain';
import type { StrainId } from '../client/src/lib/engine/strain';
import { useMap as MP } from '../client/src/lib/stores/useMap';
import * as P from '../client/src/lib/combat/patterns';
import * as G from '../client/src/lib/combat/grid';
import * as A from '../client/src/lib/combat/actions';
import * as GN from '../client/src/lib/combat/guns';
import { useMarket as MK } from '../client/src/lib/stores/useMarket';
import * as T2 from '../client/src/lib/stores/useAugmentTrees';
import * as ALD from '../client/src/lib/combat/allies';
import * as A2 from '../client/src/lib/combat/augments';
import * as CH from '../client/src/lib/combat/chapters';

// The bot's own dice, separate from the game's seeded stream
let botState = 1;
const botRandom = () => { botState = (botState + 0x6d2b79f5) >>> 0; let t = botState; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };

// ── Between fights: install better parts, spend points, buy a weapon, set the bar
// HEALER=1 (a rough check, not part of --check): every host wears a rare Crown Mend arm and keeps it
const HEALER_ARM = { id: 'sim-mend', name: '[CROWN] Sim Mend Arm', rarity: 'rare', type: 'augmentation', slot: 'right_arm', icon: '', treeSeed: 1, parts: { head: 'mend', mods: [], lens: 'stock', coupling: 'servo', core: 'stock', targeting: 'focused' } } as any;
let healsUsed = 0, attackTurns = 0, gunShots = 0;
function betweenFights() {
  const value = (x: any) => (x.attackBonus || 0) + (x.defenseBonus || 0) + (x.hpBonus || 0) / 3;
  if (process.env.HEALER && I.getState().equippedAugmentations.right_arm?.id !== HEALER_ARM.id) { I.getState().addItems([HEALER_ARM]); I.getState().equipAugmentation(HEALER_ARM); }
  for (const it of I.getState().items.filter((i: any) => i.type === 'augmentation')) {
    if (process.env.HEALER && it.slot === 'right_arm') continue;
    const eq = I.getState().equippedAugmentations[it.slot!];
    if (!eq || value(it) > value(eq)) { I.getState().equipAugmentation(it); }
  }
  // Splice: splice the best compatible spare into each passive slot, up to the pair limit
  if (C.getState().playerClass === 'splice') {
    const limit = FWE.withClass(NO_PERKS, 'splice', FW.getState().level('splice')).splicePairs;
    for (const slot of ['brain', 'ears', 'nose', 'lungs', 'misc'] as const) {
      const inv = I.getState(), main = inv.equippedAugmentations[slot];
      if (!main || inv.spliced[slot] || Object.values(inv.spliced).filter(Boolean).length >= limit) continue;
      const best = inv.items.filter((x: any) => x.slot === slot && A2.canSplice(main, x)).sort((a: any, b: any) => value(b) - value(a))[0];
      if (best) I.getState().spliceIn(best);
    }
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
  // Spend upgrade points: walk each implant's tree, a coin flip at every fork
  for (let g = 60; T.getState().availablePoints > 0 && g--;) {
    let took = false;
    for (const sl of slots) {
      const item = I.getState().equippedAugmentations[sl as keyof ReturnType<typeof I.getState>['equippedAugmentations']];
      const tree = item ? nodesOf(item) : null;
      if (!item || !tree) continue;
      const open = tree.filter(n => !UP.blockedIn(tree, T.getState().owned[item.id] ?? [], n.id, T.getState().availablePoints));
      if (open.length) { T.getState().take(sl, open[Math.floor(botRandom() * open.length)].id); took = true; break; }
    }
    if (!took) break;
  }
  const inv = I.getState();
  // The Grey Lane's gun rack (it restocks after every won fight and for every new host): carry the best gun you can afford, selling the old one
  if (!process.env.NOGUNS) {
    MK.getState().ensureGuns(`${C.getState().progression.deathCount}-${useRunStats.getState().total.fightsWon}`, C.getState().bossLevel);
    const now = I.getState().equippedWeapon, worth = now ? (GN.gunAction(now).damage ?? 0) : 0;
    const best = MK.getState().guns.filter(w => w.price <= I.getState().gold + (now?.sellPrice ?? 0)).sort((a, b) => (GN.gunAction(b).damage ?? 0) - (GN.gunAction(a).damage ?? 0))[0];
    if (best && (GN.gunAction(best).damage ?? 0) > worth * 1.15) { if (now) { T.getState().forget(GN.gunItem(now)); I.getState().sellWeapon(now.id); } MK.getState().buyGun(best.id); }
  }
  const cls = C.getState().playerClass;
  // Firmware's attack stands in for Strike, as on the player's bar
  const pool: any[] = [{ ...A.basicAttack(cls, A.createPlayer(I.getState().getTotalAugmentationBonuses(), cls).physicalAttack, FW.getState().level(cls)), key: 'base_strike' }, { ...A.PLAYER_ACTIONS[1], key: 'base_brace' }];
  const implantMoves = T.getState().getAugmentCombatActions(slots);
  pool.push(...implantMoves.filter((a: any) => a.damage));
  const w = I.getState().equippedWeapon; if (w) pool.push({ ...T2.gunMove(w), key: 'w' });
  // A sensible player keeps one heal or repair on the bar when an implant gives one
  const heals = implantMoves.filter((a: any) => a.defend && (a.defend.heal || a.defend.healOver || a.defend.repair));
  const atks = pool.slice(2).sort((a, b) => (b.damage || 0) - (a.damage || 0));
  const extra = heals.length ? [atks[0] ?? null, heals[0]] : atks.slice(0, 2);
  L.getState().setSlots([pool[0], pool[1], extra[0] ?? null, extra[1] ?? null]);
}

// ── An ally's own turn: heal a hurt player, else get in range and hit, else support; then the turn ends
function allyTurnBot(k: number) {
  const a = C.getState().allies[k];
  if (a && a.unit.currentHp > 0) {
    const st = C.getState();
    const find = (e: string) => a.moves.findIndex((m, n) => m.effect === e && F.canAllyUse(st, k, n));
    const heal = find('heal');
    if (heal >= 0 && st.player.currentHp < st.player.maxHp * 0.5) { st.allyAct(k, heal); return; }
    const atk = a.moves.findIndex(m => m.effect === 'attack');
    const tgt = st.foes[st.target];
    if (tgt && !F.canAllyUse(st, k, atk)) {
      const tiles = Array.from(F.allyReach(st, k)).map(key => { const [row, col] = key.split(',').map(Number); return { row, col }; });
      const at = (pos: any) => ({ ...st, allies: st.allies.map((o, n) => (n === k ? { ...o, pos } : o)) });
      const best = tiles.find(p => F.canAllyUse(at(p), k, atk)) ?? tiles.sort((x, y) => G.chebyshev(x, tgt.pos) - G.chebyshev(y, tgt.pos))[0];
      if (best && G.chebyshev(best, tgt.pos) < G.chebyshev(a.pos, tgt.pos) + (F.canAllyUse(at(best), k, atk) ? 1 : 0)) {
        if (C.getState().allyMoveMode !== k) C.getState().toggleAllyMove(k);
        C.getState().moveAlly(best);
      }
    }
    const now = C.getState();
    const support = ['mark', 'guard', 'taunt'].map(e => a.moves.findIndex((m, n) => m.effect === e && F.canAllyUse(now, k, n))).find(n => n >= 0);
    if (support !== undefined && (a.moves[support].effect !== 'taunt' || now.player.currentHp < now.player.maxHp * 0.6)) { now.allyAct(k, support); return; }
    for (let n = 0; n < a.moves.length; n++) if (a.moves[n].effect === 'attack' && F.canAllyUse(now, k, n)) { now.allyAct(k, n); return; }
  }
  // Nothing worth doing: it waits
  if (C.getState().allyTurn === k) C.getState().endTurn();
}

// SMART=1: a careful player who never stands where a hit can land, even if it means not attacking (kiting)
const SMART = !!process.env.SMART;
// ── One player turn: aim, dodge telegraphs (most of the time), get in range, hit
function playerTurn(skill: number) {
  // After attacking without moving (Reflex), the game waits for a step or a pass: the bot passes
  if (C.getState().reflexMoveOpen) { C.getState().endTurn(); return; }
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
  const red = F.dangerTiles(s as any);
  const opts = [g.playerPosition, ...Array.from(G.getPlayerReach(g.playerPosition, g, s.playerMoveRange)).map((k: any) => { const [row, col] = k.split(',').map(Number); return { row, col }; })];
  // Only dodge the red when there's a safe tile to fight from; otherwise walk in
  const canAttackSomewhere = opts.some(p => atks.some(a => canHitFrom(p, a)));
  const score = (pos: any) => { let v = 0; if (danger.has(`${pos.row},${pos.col}`)) v -= 100; if (g.tiles[pos.row][pos.col].type === 'hazard') v -= 30; if ((canAttackSomewhere || SMART) && red.has(`${pos.row},${pos.col}`)) v -= (SMART ? 70 : 20) * skill; if (F.partingFoes(s as any, g.playerPosition, pos).length) v -= 15 * skill; if ((s as any).alarm?.on && F.besideColdPod(s as any, pos)) v += 25 * skill; if (atks.some(a => canHitFrom(pos, a))) v += 50; v -= nearest(pos); return v; };
  const best = opts.sort((a, b) => score(b) - score(a))[0];
  if (s.playerHeat < 100 && (best.row !== g.playerPosition.row || best.col !== g.playerPosition.col)) s.moveTentatively(best);
  const pos = C.getState().grid.playerPosition; const brace = slots.find(a => a.type === 'brace');
  // The strongest attack that hits anyone from here; picking it aims it at its best tiles
  let act = atks.find(a => F.canPlayerHitAny(C.getState() as any, a, C.getState().playerClass));
  if ((s.playerMalfunctioning || s.playerHeat >= 85) && brace && botRandom() < skill) act = brace;
  // Hurt with a heal or repair move to hand: use it (a sensible player patches up before it's too late)
  const now = C.getState();
  const mend = slots.find(a => a.defend && (a.defend.heal || a.defend.healOver || a.defend.repair) && F.canDefend(now as any, a, now.hasMoved));
  if (mend && now.player.currentHp < now.player.maxHp * 0.45 && botRandom() < skill) { act = mend; healsUsed++; }
  if (act) { C.getState().setSelectedAction(act); if (act.damage) { attackTurns++; if (act.gun) gunShots++; } }
  C.getState().endTurn();
}

const ALLY_ORDER = (id: string) => ['bale', 'matron', 'ghostline', 'ward', 'breaker'].indexOf(id);

// ── The hidden map: walk to the easiest fight still standing ─────────────────
// On the way the bot meets allies and searches caches (goals are found by clearing their rooms).
function tidyRoom() {
  const s = MP.getState(); const room = MAP.roomById(s.room);
  if (MAP.hasFight(s, room)) return;
  if (room.ally && !AL.getState().met.includes(room.ally)) {
    AL.getState().meet(room.ally);
    const slots = Y.getState().perks().allySlots;
    if (AL.getState().party.length < slots) AL.getState().setParty([...AL.getState().party, room.ally], slots);
  }
  if (MAP.cacheReady(s, room)) C.getState().openRoomCache();
  // The last host's body: take its part back
  if (MAP.corpseHere(s, room)) { const it = MP.getState().takeCorpse(); if (it) I.getState().addItems([it]); }
}

/** Walk to the lowest-threat uncleared fight the bot can reach. False when none is left (chapter done). */
/** The deepest threat on the current chapter's map: its last boss. */
const lastThreat = () => Math.max(...MAP.chapterMap().rooms.map(r => r.threat ?? 0));

/** Badly hurt (under half health): walk back through quiet rooms to a server and rest there, if one is in reach. */
function restIfHurt() {
  const { hp, max } = hostHealth();
  if (hp >= max * 0.5) return;
  const s = MP.getState();
  const prev = new Map<string, { from: string; exit: number }>();
  const seen = new Set([s.room]); const queue = [s.room]; let goal = MAP.canRest(s) ? s.room : null;
  while (queue.length && !goal) {
    const id = queue.shift()!;
    MAP.roomById(id).exits.forEach((e, k) => {
      if (goal || seen.has(e.to) || (e.requires === 'goals' && !MAP.allGoals(s))) return;
      if (!KNOWN && !s.visited.includes(e.to)) return;
      const room = MAP.roomById(e.to);
      if (MAP.hasFight(s, room)) return;
      seen.add(e.to); prev.set(e.to, { from: id, exit: k }); queue.push(e.to);
      if (MAP.isServer(s, room)) goal = e.to;
    });
  }
  if (!goal) return;
  const path: number[] = [];
  for (let cur = goal; cur !== s.room;) { const p = prev.get(cur)!; path.unshift(p.exit); cur = p.from; }
  for (const ex of path) MP.getState().go(ex);
  MP.getState().rest();
  rested++;
}

/** RUSH=1: a player who heads straight for the next boss, fighting only what stands in the way. True if it reached a fight. */
function rushToBoss(): boolean {
  const s = MP.getState();
  const prev = new Map<string, { from: string; exit: number }>(); const seen = new Set([s.room]); const queue = [s.room]; let goal = null as string | null;
  while (queue.length && !goal) {
    const id = queue.shift()!;
    MAP.roomById(id).exits.forEach((e, k) => {
      if (goal || seen.has(e.to) || (e.requires === 'goals' && !MAP.allGoals(s))) return;
      seen.add(e.to); prev.set(e.to, { from: id, exit: k }); queue.push(e.to);
      const room = MAP.roomById(e.to);
      if (room.threat !== undefined && room.threat % 5 === 0 && MAP.hasFight(s, room)) goal = e.to;
    });
  }
  if (!goal) return false;
  const path: number[] = [];
  for (let cur = goal; cur !== s.room;) { const p = prev.get(cur)!; path.unshift(p.exit); cur = p.from; }
  for (const ex of path) { MP.getState().go(ex); tidyRoom(); if (MAP.hasFight(MP.getState())) return true; }
  return MAP.hasFight(MP.getState());
}

// ── A new player's map: the bot only knows rooms some host has been in (the map remembers them across
// hosts). It sees a known room's exits but not what's behind an unknown one. It fights a known fight it
// can likely handle (no deeper than one past the deepest it has won here); otherwise it explores the
// nearest unknown room (ties at random), and walks into whatever waits there. KNOWN=1 gives it the whole map.
const KNOWN = !!process.env.KNOWN;
let bestWonHere = 0;
function exploreToFight(): boolean {
  for (let tries = 0; tries < 60; tries++) {
    tidyRoom();
    const s = MP.getState();
    if (MAP.hasFight(s)) return true;
    const known = new Set(s.visited);
    const prev = new Map<string, { from: string; exit: number }>(); const dist = new Map([[s.room, 0]]);
    const seen = new Set([s.room]); const queue = [s.room];
    const fights: string[] = [], frontier: string[] = [];
    while (queue.length) {
      const id = queue.shift()!;
      MAP.roomById(id).exits.forEach((e, k) => {
        if (seen.has(e.to) || (e.requires === 'goals' && !MAP.allGoals(s))) return;
        seen.add(e.to); prev.set(e.to, { from: id, exit: k }); dist.set(e.to, dist.get(id)! + 1);
        if (!known.has(e.to)) { frontier.push(e.to); return; }
        const room = MAP.roomById(e.to);
        if (MAP.hasFight(s, room)) { fights.push(e.to); return; }
        queue.push(e.to);
      });
    }
    const threat = (id: string) => MAP.roomById(id).threat ?? 0;
    const byThreat = [...fights].sort((a, b) => threat(a) - threat(b));
    const order = frontier.map(id => ({ id, d: dist.get(id)!, r: botRandom() })).sort((a, b) => a.d - b.d || a.r - b.r).map(x => x.id);
    const target = byThreat.find(id => threat(id) <= bestWonHere + 1) ?? order[0] ?? byThreat[0];
    if (!target) return false;
    const path: number[] = [];
    for (let cur = target; cur !== s.room;) { const p = prev.get(cur)!; path.unshift(p.exit); cur = p.from; }
    for (const ex of path) { MP.getState().go(ex); tidyRoom(); if (MAP.hasFight(MP.getState())) return true; }
  }
  return false;
}

function walkToFight(): boolean {
  if (process.env.RUSH && (MAP.hasFight(MP.getState()) || rushToBoss())) return true;
  if (!KNOWN && !process.env.RUSH) return exploreToFight();
  for (let tries = 0; tries < 40; tries++) {
    tidyRoom();
    const s = MP.getState();
    if (MAP.hasFight(s)) return true;
    // Search through clear rooms; a fight room ends a path. With no fight in reach,
    // go and look at whatever hasn't been looked at (that's where the goals are).
    const prev = new Map<string, { from: string; exit: number }>();
    const seen = new Set([s.room]); const queue = [s.room]; const fights: string[] = [];
    while (queue.length) {
      const id = queue.shift()!;
      MAP.roomById(id).exits.forEach((e, k) => {
        if (seen.has(e.to) || (e.requires === 'goals' && !MAP.allGoals(s))) return;
        seen.add(e.to); prev.set(e.to, { from: id, exit: k });
        const room = MAP.roomById(e.to);
        if (MAP.hasFight(s, room)) fights.push(e.to);
        else queue.push(e.to);
      });
    }
    const targets = fights.sort((a, b) => (MAP.roomById(a).threat ?? 0) - (MAP.roomById(b).threat ?? 0));
    if (!targets.length) return false;
    let cur = targets[0];
    const path: number[] = [];
    while (cur !== s.room) { const p = prev.get(cur)!; path.unshift(p.exit); cur = p.from; }
    for (const ex of path) { MP.getState().go(ex); tidyRoom(); }
    if (MAP.hasFight(MP.getState())) return true;
  }
  return false;
}

/** How deep a fight is across chapters: chapter one runs 1-10, every later chapter 30 more. */
const depthOf = (ch: number, lvl: number) => (ch <= 0 ? lvl : 10 + 30 * (ch - 1) + lvl);

interface Fight { lvl: number; won: boolean; turns: number; lowest: number; deathsBefore: number; allies: number; timedOut: boolean; cls: string; ch: number; depth: number; hpStart: number; gear: number; hostWins: number; cards: number; foes: number; fwLevel: number; worn: number[]; gun: string | null }

// DEATHS=1: what the fights a host dies in look like
const deaths: { lvl: number; ch: number; start: number; turns: number; trace: number[]; stuns: number; biggest: number; burnouts: number; mal: number }[] = [];
let chaptersDone = 0, stuckAtDoor = 0, debugShown = false, rested = 0;
function playRun(seed: number, maxFights: number, skill: number): Fight[] {
  botState = seed * 7919 + 1;
  C.getState().resetAll(); C.getState().setRunSeed(seed); C.getState().completeIntro();
  // STRAIN=tough,fierce,hot,shut plays every host under that strain (a rough check, not part of --check)
  if (process.env.STRAIN) { const on = process.env.STRAIN.split(',') as StrainId[]; ST.setState({ unlocked: true, chosen: on, active: on }); }
  // CHAPTER=<id> plays that chapter's map from a fresh start (a rough check of its numbers)
  if (process.env.CHAPTER) MP.getState().travel(process.env.CHAPTER);
  const out: Fight[] = [];
  while (out.length < maxFights) {
    betweenFights();
    restIfHurt();
    // No fight left in reach: either the last boss is down, or the goals door is still shut
    // A chapter done: on to the next one (a fresh map, a new host), until the last
    const here = CH.CHAPTERS.findIndex(c => c.id === MP.getState().chapter);
    bestWonHere = Math.max(0, ...out.filter(f => f.ch === here && f.won).map(f => f.lvl));
    // ONLYCH1=1: stop once chapter one is done (quick runs for chapter-one numbers)
    if (process.env.ONLYCH1 && MP.getState().done) { chaptersDone++; break; }
    const found = walkToFight();
    if (!found && MP.getState().done && CH.nextChapter(MP.getState().chapter)) { chaptersDone++; C.getState().goToNextChapter(); continue; }
    if (!found) { if (out.some(f => f.won && f.lvl === lastThreat())) chaptersDone++; else { stuckAtDoor++; if (process.env.DEBUGDOOR) { const s = MP.getState(); console.log("door shut", s.room, "done", s.done, "cleared spire", s.cleared.includes("spire"), "spire fights", out.filter(f => f.lvl >= 30).map(f => [f.lvl, f.won, f.timedOut]), "last", lastThreat(), "fights", out.length); } } break; }
    const lvl = MAP.roomById(MP.getState().room).threat!; const deathsBefore = C.getState().progression.deathCount;
    // What the host brings to this fight (for VARY=1): health carried in, implant quality, wins so far, play-i cards
    const RANK: Record<string, number> = { common: 1, uncommon: 2, rare: 3, epic: 4, legendary: 5 };
    const hh = hostHealth(), hpStart = hh.hp / hh.max;
    const gear = Object.values(I.getState().equippedAugmentations).reduce((n, it) => n + (it ? RANK[it.rarity] ?? 1 : 0), 0);
    const hostWins = (() => { let n = 0; for (let k = out.length - 1; k >= 0 && out[k].deathsBefore === deathsBefore && out[k].won; k--) n++; return n; })();
    const worn = [0, 0, 0, 0, 0]; for (const it of Object.values(I.getState().equippedAugmentations)) if (it) worn[(RANK[it.rarity] ?? 1) - 1]++;
    const gun = I.getState().equippedWeapon?.rarity ?? null;
    const cards = Y.getState().owned.length, fwLevel = FW.getState().level(C.getState().playerClass);
    C.getState().startRoomFight(); C.getState().dismissIntro(); const foeCount = C.getState().foes.length; const trace: number[] = []; let turns = 0, lowest = 1, timedOut = false; const allyCount = C.getState().allies.length;
    while (C.getState().phase === 'player_turn' || C.getState().phase === 'enemy_turn') {
      if (C.getState().phase === 'player_turn' && !C.getState().inputLocked) { const k = C.getState().allyTurn; if (k !== null) allyTurnBot(k); else { trace.push(C.getState().player.currentHp / C.getState().player.maxHp); playerTurn(skill); turns++; } }
      drain(); const st = C.getState(); lowest = Math.min(lowest, st.player.currentHp / st.player.maxHp);
      if (turns > 80) {
        if (process.env.DEBUGTO && !debugShown && (process.env.DEBUGTO === '1' || Number(process.env.DEBUGTO) === lvl)) { debugShown = true; const st = C.getState(); console.log('TIMEOUT threat', lvl, 'shape', st.grid.arenaShape, 'player', JSON.stringify(st.grid.playerPosition), 'hp', st.player.currentHp, 'heat', st.playerHeat, 'alarm', JSON.stringify((st as any).alarm), 'reflex', st.reflexMoveOpen, 'locked', st.inputLocked, 'foes', JSON.stringify(st.foes.map(f => [f.unit.name, f.unit.currentHp, f.pos, f.unit.traits])), 'allies', JSON.stringify(st.allies.map(a => [a.id, a.unit.currentHp, a.pos, a.taunting])), 'foeState', JSON.stringify(st.foes.map(f => ({ heat: f.heat, pend: f.pendingAction?.name, stun: f.stunned })))); console.log(st.grid.tiles.map((r, ri) => r.map((t, ci) => st.grid.playerPosition.row === ri && st.grid.playerPosition.col === ci ? 'P' : st.foes.some(f => f.unit.currentHp > 0 && f.pos.row === ri && f.pos.col === ci) ? 'E' : t.type === 'void' ? ' ' : t.type === 'obstacle' ? '#' : t.type === 'hazard' ? '~' : '.').join('')).join('\n')); console.log(st.combatLog.slice(-14).map(l => l.message).join(' | ')); }
        C.getState().resetCombat(); timedOut = true; break;
      }
    }
    const won = C.getState().phase === 'victory';
    if (!won && process.env.DEATHS) {
      const log = C.getState().combatLog.map(l => l.message);
      const t2 = [...trace, 0]; let biggest = 0; for (let k = 1; k < t2.length; k++) biggest = Math.max(biggest, t2[k - 1] - t2[k]);
      deaths.push({ lvl: MAP.roomById(MP.getState().room).threat ?? 0, ch: CH.CHAPTERS.findIndex(c => c.id === MP.getState().chapter), start: trace[0] ?? 1, turns: trace.length, trace, stuns: log.filter(m => m.startsWith('STUNNED')).length, biggest, burnouts: log.filter(m => m.startsWith('BURNOUT')).length, mal: log.filter(m => m === 'MALFUNCTION').length });
    }
    if (process.env.DEBUGLOSS && !won && Number(process.env.DEBUGLOSS) === lvl && !debugShown) { debugShown = true; console.log('LOSS', lvl, 'turns', turns, C.getState().foes.map(f => [f.unit.name, f.unit.currentHp, f.unit.maxHp])); console.log(C.getState().combatLog.slice(-8).map(l => l.message).join(' | ')); }
    const ch = CH.CHAPTERS.findIndex(c => c.id === MP.getState().chapter);
    out.push({ lvl, won, turns, lowest, deathsBefore, allies: allyCount, timedOut, cls: C.getState().playerClass, ch, depth: depthOf(ch, lvl), hpStart, gear, hostWins, cards, foes: foeCount, fwLevel, worn, gun });
    if (won) { C.getState().takeBestParts(); C.getState().continueFromVictory(); if (C.getState().phase === 'shop') C.getState().leaveShop(); }
    else if (C.getState().phase === 'defeat') {
      // The bot picks one of the two cards the tree offers
      const offer = Y.getState().offer;
      if (offer) Y.getState().pick(offer[botRandom() < 0.5 ? 0 : 1]);
      // Link with the highest-level allies the tree allows
      const open = AL.getState().unlocked().sort((x, y) => AL.getState().progress(y).level - AL.getState().progress(x).level || ALLY_ORDER(y) - ALLY_ORDER(x));
      AL.getState().setParty(open, Y.getState().perks().allySlots);
      // A new host keeps the same run seed sequence, so reseed per host for variety
      { const open = availableFirmware().filter(c => c !== 'none'); C.getState().rebirth(open.length ? open[Math.floor(botRandom() * open.length)] : undefined); }
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
// Bands by depth: chapter one is threats 1-10, then each chapter adds its 30 (chapter two's threat 1 is depth 11)
const band = (l: number) => l <= 3 ? '1-3' : l <= 6 ? '4-6' : l <= 9 ? '7-9' : l === 10 ? '10 King' : l <= 25 ? 'ch2 1-15' : l <= 40 ? 'ch2 16-30' : 'ch3+';
const bands = ['1-3', '4-6', '7-9', '10 King', 'ch2 1-15', 'ch2 16-30', 'ch3+'];
const rows = bands.map(b => { const f = all.filter(x => band(x.depth) === b); return { band: b, fights: f.length, winRate: f.length ? f.filter(x => x.won).length / f.length : NaN, avgTurns: f.length ? f.reduce((a, x) => a + x.turns, 0) / f.length : NaN }; }).filter(r => r.fights > 0);
// Each firmware's record: win rates by stretch of the map, and fights played with it loaded
if (process.env.BYCLASS) {
  const stretch = (l: number) => l <= 9 ? '1-9' : l <= 20 ? '10-20' : '21+';
  const classes = Array.from(new Set(all.map(f => f.cls)));
  console.table(classes.map(c => { const f = all.filter(x => x.cls === c); const row: any = { firmware: c, fights: f.length }; for (const b of ['1-9', '10-20', '21+']) { const g = f.filter(x => stretch(x.lvl) === b); row[b] = g.length ? `${Math.round(100 * g.filter(x => x.won).length / g.length)}% (${g.length})` : '-'; } row.turns = (f.reduce((a, x) => a + x.turns, 0) / f.length).toFixed(1); row.lowestHp = `${Math.round(100 * f.filter(x => x.won).reduce((a, x) => a + x.lowest, 0) / Math.max(1, f.filter(x => x.won).length))}%`; return row; }));
}
const firstDeath = runs.map(r => r.find(f => !f.won)?.lvl ?? null);
const reached = runs.map(r => Math.max(...r.map(f => f.depth)));
const pct = (n: number) => `${Math.round(n * 100)}%`;
console.table(rows.map(r => ({ band: r.band, fights: r.fights, winRate: pct(r.winRate), avgTurns: r.avgTurns.toFixed(1) })));
if (process.env.PERLEVEL) { const per: Record<number, [number, number]> = {}; for (const f of all) { per[f.lvl] ??= [0, 0]; per[f.lvl][1]++; if (f.won) per[f.lvl][0]++; } console.log('per level win%:', Object.entries(per).map(([l, [w, n]]) => `${l}:${Math.round(100 * w / n)}%(${n})`).join(' ')); const to = all.filter(f => f.timedOut); if (to.length) console.log('timed out (80 turns):', to.length, 'at threats', Array.from(new Set(to.map(f => f.lvl))).join(' ')); }
console.log('first death at threat:', firstDeath.join(' '));
// How far a first life gets: wins before the first host is lost
const firstLifeWins = runs.map(r => { const k = r.findIndex(f => !f.won); return k < 0 ? r.length : k; });
const firstLife5 = firstLifeWins.filter(n => n >= 5).length / runs.length;
console.log(`first life wins: ${firstLifeWins.join(' ')} (5+ wins in ${pct(firstLife5)} of runs; past the King in ${pct(runs.filter(r => r.some(f => f.depth === 10 && f.won && f.deathsBefore === 0)).length / runs.length)})`);
// When the firmware bosses first fall: the host number (hosts lost + 1) of the first win over chapter one's threat 5 and its King
const firstWinHost = (pred: (f: Fight) => boolean) => runs.map(r => { const f = r.find(x => pred(x) && x.won); return f ? f.deathsBefore + 1 : null; });
const at5 = (lo: number, hi: number) => { const f = all.filter(x => x.ch === 0 && x.lvl === 5 && x.deathsBefore >= lo && x.deathsBefore <= hi); return `${f.length ? pct(f.filter(x => x.won).length / f.length) : '-'} (${f.length})`; };
console.log(`chapter one's threat-5 boss won, by hosts lost: 0-2 ${at5(0, 2)} | 3-5 ${at5(3, 5)} | 6-10 ${at5(6, 10)} | 11+ ${at5(11, 999)}`);
const boss5 = firstWinHost(f => f.ch === 0 && f.lvl === 5), king = firstWinHost(f => f.ch === 0 && f.lvl === 10);
console.log(`chapter one's threat-5 boss first beaten on host: ${boss5.join(' ')} | the King: ${king.join(' ')}`);
// Firmware against none: chapter one's threats 6-9 won with and without
const loaded = (on: boolean) => { const f = all.filter(x => x.ch === 0 && x.lvl >= 6 && x.lvl <= 9 && (x.cls !== 'none') === on); return { n: f.length, rate: f.length ? f.filter(x => x.won).length / f.length : NaN }; };
const withFw = loaded(true), noFw = loaded(false);
console.log(`chapter one threats 6-9 won: with firmware ${pct(withFw.rate)} (${withFw.n}), without ${pct(noFw.rate)} (${noFw.n})`);
// CH1=1: chapter one threat by threat: which host first wins it (median and spread), win rate, and where hosts are lost
if (process.env.CH1) {
  const q = (xs: number[], f: number) => { const v = [...xs].sort((a, b) => a - b); return v[Math.min(v.length - 1, Math.floor(v.length * f))]; };
  console.table(Array.from({ length: 10 }, (_, k) => k + 1).map(t => {
    const firsts = runs.map(r => r.find(f => f.ch === 0 && f.lvl === t && f.won)).filter(Boolean).map(f => f!.deathsBefore + 1);
    const fights = all.filter(f => f.ch === 0 && f.lvl === t);
    return { threat: t, 'first won on host (median)': firsts.length ? q(firsts, 0.5) : '-', 'quickest-slowest': firsts.length ? `${Math.min(...firsts)}-${Math.max(...firsts)}` : '-', 'runs that got there': `${firsts.length}/${runs.length}`, 'win rate': fights.length ? pct(fights.filter(f => f.won).length / fights.length) : '-', 'hosts lost here': fights.filter(f => !f.won).length };
  }));
  const done = runs.map(r => r.find(f => f.ch === 0 && f.lvl === 10 && f.won)).filter(Boolean).map(f => f!.deathsBefore + 1);
  const host1 = runs.map(r => r.find(f => !f.won)?.lvl ?? null);
  console.log(`host 1 lost at threat: ${[1, 2, 3, 4, 5].map(t => `${t}: ${pct(host1.filter(x => x === t).length / runs.length)}`).join(', ')}, later: ${pct(host1.filter(x => x === null || x > 5).length / runs.length)}`);
  console.log(`chapter one finished on host: median ${q(done, 0.5)}, ${Math.min(...done)}-${Math.max(...done)} (${done.length}/${runs.length} runs)`);
}
// VARY=1: what decides chapter one's boss fights, and why some runs take far longer than others
if (process.env.VARY) {
  const rate = (f: Fight[]) => f.length ? `${pct(f.filter(x => x.won).length / f.length)} (${f.length})` : '-';
  for (const [name, t] of [['threat-5 boss', 5], ['the King', 10], ['threats 2-4', -1]] as const) {
    const f = all.filter(x => x.ch === 0 && (t === -1 ? x.lvl >= 2 && x.lvl <= 4 && x.deathsBefore > 0 : x.lvl === t));
    console.log(`\n${name}: won ${rate(f)}`);
    console.log('  by health carried in:', [[0, 0.5], [0.5, 0.8], [0.8, 1.01]].map(([a, b]) => `${Math.round(a * 100)}-${Math.min(100, Math.round(b * 100))}%: ${rate(f.filter(x => x.hpStart >= a && x.hpStart < b))}`).join(' | '));
    console.log('  by implant quality worn:', [[0, 3], [3, 6], [6, 10], [10, 99]].map(([a, b]) => `${a}-${b - 1}: ${rate(f.filter(x => x.gear >= a && x.gear < b))}`).join(' | '));
    console.log('  by play-i cards:', [[0, 2], [2, 4], [4, 7], [7, 99]].map(([a, b]) => `${a}-${b - 1}: ${rate(f.filter(x => x.cards >= a && x.cards < b))}`).join(' | '));
    console.log('  by wins this host first:', [[0, 1], [1, 3], [3, 6], [6, 99]].map(([a, b]) => `${a}-${b - 1}: ${rate(f.filter(x => x.hostWins >= a && x.hostWins < b))}`).join(' | '));
    if (t === -1) console.log('  by enemies in the room:', [1, 2, 3].map(n => `${n}: ${rate(f.filter(x => x.foes === n))}`).join(' | '));
    if (t === 10) console.log('  by firmware level:', [[1, 2], [2, 3], [3, 4], [4, 99]].map(([a, b]) => `${a}${b === 99 ? '+' : ''}: ${rate(f.filter(x => x.fwLevel >= a && x.fwLevel < b))}`).join(' | '));
  }
  // What hosts wear into chapter one's fights: implants by rarity (average per fight) and guns carried
  console.log('\nimplants worn into chapter one fights (average: common / uncommon / rare / epic / legendary), and the gun carried:');
  for (const [lo, hi] of [[1, 1], [2, 4], [5, 5], [6, 9], [10, 10]]) {
    const f = all.filter(x => x.ch === 0 && x.lvl >= lo && x.lvl <= hi); if (!f.length) continue;
    const avg = [0, 1, 2, 3, 4].map(k => (f.reduce((n, x) => n + x.worn[k], 0) / f.length).toFixed(2)).join(' / ');
    const guns = ['common', 'uncommon', 'rare', 'epic', 'legendary'].map(r => `${r[0]}${pct(f.filter(x => x.gun === r).length / f.length)}`).join(' ');
    console.log(`  threat ${lo}${hi > lo ? `-${hi}` : ''}: ${avg}  | gun: none ${pct(f.filter(x => !x.gun).length / f.length)} ${guns}`);
  }
  // Slow runs against quick ones: where their hosts were lost before the first boss fell
  const per = runs.map(r => { const k = r.findIndex(x => x.ch === 0 && x.lvl === 5 && x.won); const before = k < 0 ? r : r.slice(0, k); return { host: k < 0 ? 99 : r[k].deathsBefore + 1, lost: before.filter(x => !x.won).map(x => x.lvl), tries5: before.filter(x => x.lvl === 5).length }; });
  const group = (lo: number, hi: number) => { const g = per.filter(x => x.host >= lo && x.host <= hi); const at = (t: (l: number) => boolean) => (g.reduce((n, x) => n + x.lost.filter(t).length, 0) / Math.max(1, g.length)).toFixed(1); return `${g.length} runs: hosts lost at 2: ${at(l => l === 2)}, 3-4: ${at(l => l === 3 || l === 4)}, 5: ${at(l => l === 5)}, elsewhere: ${at(l => l > 5)}`; };
  console.log('\nbefore the first boss fell, per run: quick (host 1-3)', group(1, 3), '\n  middle (4-6)', group(4, 6), '\n  slow (7+)', group(7, 98));
}
if (process.env.DEATHS && deaths.length) {
  const share = (f: (d: typeof deaths[number]) => boolean) => pct(deaths.filter(f).length / deaths.length);
  const avg = (f: (d: typeof deaths[number]) => number) => (deaths.reduce((n, d) => n + f(d), 0) / deaths.length).toFixed(1);
  console.log(`\nhosts lost: ${deaths.length}`);
  console.log(`  started the fight at 90%+ health: ${share(d => d.start >= 0.9)}; turns from the start to death: ${avg(d => d.turns)} (died within 3 turns: ${share(d => d.turns <= 3)})`);
  console.log(`  stunned at least once: ${share(d => d.stuns > 0)}; twice or more: ${share(d => d.stuns >= 2)}; burnouts: ${share(d => d.burnouts > 0)}; malfunctioned: ${share(d => d.mal > 0)}`);
  console.log(`  biggest loss between two of your turns: average ${Math.round(100 * Number(avg(d => d.biggest)))}% of max health; over half in one go: ${share(d => d.biggest > 0.5)}`);
  console.log(`  health at each turn, a few deaths: ${deaths.slice(0, 8).map(d => `[t${d.lvl}${d.ch ? ` ch${d.ch + 1}` : ''}: ${d.trace.map(x => Math.round(x * 100)).join(' ')}${d.stuns ? ` · ${d.stuns} stun` : ''}]`).join(' ')}`);
}
// The curve: threats 4-9 by how many hosts the signal had lost before the fight
const midBy = (lo: number, hi: number) => { const f = all.filter(x => x.ch === 0 && x.lvl >= 4 && x.lvl <= 9 && x.deathsBefore >= lo && x.deathsBefore <= hi); return { n: f.length, rate: f.length ? f.filter(x => x.won).length / f.length : NaN }; };
const mid12 = midBy(1, 2), mid34 = midBy(3, 4), mid5 = midBy(5, 999);
console.log(`threats 4-9 win rate by hosts lost: 1-2: ${pct(mid12.rate)} (${mid12.n}) | 3-4: ${pct(mid34.rate)} (${mid34.n}) | 5+: ${pct(mid5.rate)} (${mid5.n})`);
// How far players get as the signal learns: best level reached by the time k hosts are lost
const med = (xs: number[]) => { const v = [...xs].sort((a, b) => a - b); return v.length ? v[Math.floor(v.length / 2)] : NaN; };
const bestBy = (k: number) => runs.filter(r => r.some(f => f.deathsBefore >= k)).map(r => Math.max(0, ...r.filter(f => f.deathsBefore <= k && f.won).map(f => f.depth)));
const kind = (l: number) => l % 10 === 0 ? 'boss' : l % 5 === 0 ? 'elite' : 'normal';
const turnsOf = (k: string) => { const f = all.filter(x => kind(x.lvl) === k && x.won); return f.length ? (f.reduce((a, x) => a + x.turns, 0) / f.length).toFixed(1) : '-'; };
console.log(`turns per won fight: normal ${turnsOf('normal')}, elite ${turnsOf('elite')}, boss ${turnsOf('boss')}`);
if (process.env.PERLEVEL) console.log('won boss fights, turns by threat:', [10, 20, 30].map(t => { const f = all.filter(x => x.lvl === t && x.won); return `${t}: ${f.length ? (f.reduce((a, x) => a + x.turns, 0) / f.length).toFixed(1) : '-'} (${f.length})`; }).join(' | '));
console.log('median best level after hosts lost:', [0, 5, 10, 20].map(k => `${k}: ${med(bestBy(k))}`).join(' | '));
console.log('deepest fight reached (chapter one is 1-10, chapter two 11-40):', reached.join(' '));
console.log(`rests at a server: ${rested}`);
console.log(`heal or repair moves used: ${healsUsed}`);
console.log(`gun shots: ${gunShots} of ${attackTurns} attacking turns (${attackTurns ? Math.round(100 * gunShots / attackTurns) : 0}%)`);
console.log(`fights with an ally: ${pct(all.filter(x => x.allies > 0).length / all.length)}`);
if (process.env.STATS) { console.log('firmware:', JSON.stringify(FW.getState().xp), 'opened by going deep:', JSON.stringify(FW.getState().opened)); console.log('last run, every host:', JSON.stringify({ ...useRunStats.getState().total, moves: Object.entries(useRunStats.getState().total.moves).sort((a, b) => b[1].uses - a[1].uses).slice(0, 4) })); }
console.log(`chapters finished: ${chaptersDone} across ${runs.length} runs; stopped at the goals door: ${stuckAtDoor}`);

// Agreed ranges (see the development plan). Bands with few fights are skipped.
const checks: [string, boolean][] = [];
const firstDeathEarly = firstDeath.filter(l => l === 2 || l === 3).length / runs.length;
// The first life's set piece on threat 3 is tough but beatable: most new players still die there
// (chapter one only: nobody starts the game in a later chapter)
if (!process.env.CHAPTER) checks.push([`a first life wins 5 fights in under 60% of runs (got ${pct(firstLife5)})`, firstLife5 < 0.6]);
const host1At2 = firstDeath.filter(l => l === 2).length / runs.length;
if (!process.env.CHAPTER) checks.push([`host 1 lost at threat 2 in 90%+ of runs (got ${pct(host1At2)})`, host1At2 >= 0.9]);
// The King is chapter one's wall: a host that reaches him usually needs a few tries (35%+)
for (const r of rows) if (r.fights >= 15 && r.band !== '1-3') { const floor = r.band === '10 King' ? 35 : 65; checks.push([`win rate ${r.band} within ${floor}-100% (got ${pct(r.winRate)})`, Math.round(r.winRate * 100) >= floor]); }
const median = [...reached].sort((a, b) => a - b)[Math.floor(reached.length / 2)];
checks.push([`median highest threat >= 9 (got ${median})`, median >= 9]);
const normalTurns = Number(turnsOf('normal')), bossTurns = Number(turnsOf('boss'));
checks.push([`normal fights take <= 8 turns (got ${turnsOf('normal')})`, normalTurns <= 8]);
if (!Number.isNaN(bossTurns)) checks.push([`boss fights take <= 16 turns (got ${turnsOf('boss')})`, bossTurns <= 16]);
// The signal should make steady progress, not snowball: best level after 10 and 20 hosts lost.
// Allies keep their implants across hosts, so progress carries over a little more than it used to
const best10 = med(bestBy(10)), best20 = med(bestBy(20));
// (depth: chapter one is 1-10, chapter two 11-40, and on)
if (!Number.isNaN(best10)) checks.push([`deepest win after 10 hosts lost within 20-60 (got ${best10})`, best10 >= 20 && best10 <= 60]);
if (!Number.isNaN(best20)) checks.push([`deepest win after 20 hosts lost within 25-90 (got ${best20})`, best20 >= 25 && best20 <= 90]);
// The curve (chapter one): threats 4-9 are real fights for a young signal and easy for a seasoned one
if (!process.env.CHAPTER && mid12.n >= 30) checks.push([`threats 4-9 with 1-2 hosts lost won 65-95% (got ${pct(mid12.rate)})`, mid12.rate >= 0.65 && mid12.rate <= 0.95]);
// Firmware (chapter one): its first boss takes a few hosts, the King a few more, and firmware is a massive upgrade
if (!process.env.CHAPTER && !process.env.RUSH) {
  const mid = (xs: (number | null)[]) => med(xs.map(x => x ?? 99));
  const b5 = mid(boss5), k = mid(king);
  checks.push([`chapter one's first boss first beaten on host 3-5 (median ${b5})`, b5 >= 3 && b5 <= 5]);
  checks.push([`the King first beaten on host 7-11 (median ${k}; aim 8-10)`, k >= 7 && k <= 11]);
  if (withFw.n >= 30 && noFw.n >= 30) checks.push([`threats 6-9: firmware wins at least 10 points more than none (${pct(withFw.rate)} vs ${pct(noFw.rate)})`, withFw.rate - noFw.rate >= 0.1]);
}
// (88%+: chapter one stays hard until the King, about 8 hosts in, so a signal 5 hosts in is still climbing)
if (!process.env.CHAPTER && mid5.n >= 30) checks.push([`threats 4-9 with 5+ hosts lost won 88%+ (got ${pct(mid5.rate)})`, mid5.rate >= 0.88]);
for (const [label, ok] of checks) console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}`);
if (args.includes('--check') && checks.some(([, ok]) => !ok)) process.exit(1);
