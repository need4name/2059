// Checks every content file before it can ship: shapes, allowed values, unique
// ids and cross-references. `npm run check:content` prints problems and fails;
// tests/content.test.ts runs the same check.
import { ARENA_CHARS } from '../client/src/lib/combat/grid';
import { z } from 'zod';
import items from '../client/src/content/items.json';
import weapons from '../client/src/content/weapons.json';
import enemies from '../client/src/content/enemies.json';
import allies from '../client/src/content/allies.json';
import { ALLY_LINKS } from '../client/src/lib/combat/allies';
import chapters from '../client/src/content/chapters.json';
import { MAPS } from '../client/src/lib/engine/map';
import figures from '../client/src/content/figures.json';
import events from '../client/src/content/events.json';
import upgrades from '../client/src/content/upgrades.json';
import firmware from '../client/src/content/firmware.json';
import { HEAD_KINDS, ARM_KINDS, CHEST_KINDS, WEAPON_KINDS } from '../client/src/lib/rendering/figures';
import { MAKER_INFO, HEADS } from '../client/src/lib/combat/augments';

const slot = z.enum(['brain', 'ears', 'eyes', 'nose', 'lungs', 'left_arm', 'right_arm', 'left_leg', 'right_leg', 'misc']);
const rarity = z.enum(['common', 'uncommon', 'rare', 'epic', 'legendary']);
const pattern = z.enum(['melee', 'melee_long', 'diagonal_cross', 'cone', 'aoe', 'ranged', 'sweep_arc', 'lunge', 'knockback', 'charge', 'ring', 'beam', 'bolt', 'pierce', 'longshot', 'lob', 'burst', 'grapple']);
const stat = z.number().int().min(-50).max(120).optional();
const text = z.string().trim().min(1);

const actionFields = {
  type: z.enum(['attack', 'defend', 'brace', 'special']),
  name: text,
  description: z.string(),
  damage: z.number().min(0).max(200).optional(),
  healing: z.number().min(0).optional(),
  defenseBoost: z.number().min(0).max(60).optional(),
  heatGenerated: z.number().min(-60).max(60).optional(),
  heatTransfer: z.number().min(-40).max(40).optional(),
  isHeavy: z.boolean().optional(),
  accuracy: z.enum(['precise', 'variable', 'unreliable']).optional(),
  rangeOptimal: z.enum(['close', 'mid', 'far']).optional(),
  physicalRatio: z.number().min(0).max(1).optional(),
  bypassStructuralDefense: z.boolean().optional(),
  attackPattern: pattern.optional(),
  ignoreRange: z.boolean().optional(),
  effects: z.object({ knock: z.boolean().optional(), pull: z.boolean().optional(), bleed: z.boolean().optional(), stun: z.number().gt(0).max(1).optional(), slow: z.boolean().optional() }).strict().optional(),
};
const action = z.object(actionFields).strict().refine(a => a.type !== 'attack' || (a.damage ?? 0) > 0, 'an attack needs damage');

const allyMove = z.object({
  ...actionFields,
  effect: z.enum(['attack', 'taunt', 'heal', 'mark', 'guard']),
  cooldown: z.number().int().min(0).max(5).optional(),
  amount: z.number().min(0).max(1).optional(),
}).strict()
  .refine(m => m.effect !== 'attack' || ((m.damage ?? 0) > 0 && !!m.attackPattern), 'an attack move needs damage and a pattern')
  .refine(m => !['heal', 'mark'].includes(m.effect) || (m.amount ?? 0) > 0, 'heal and mark moves need an amount')
  .refine(m => !['taunt', 'guard'].includes(m.effect) || (m.defenseBoost ?? 0) > 0, 'taunt and guard moves need a defenseBoost');
const ally = z.object({
  id: z.string().regex(/^[a-z]+$/), name: text, maker: text, role: text,
  unlockLevel: z.number().int().min(1).max(200), color: z.string().regex(/^#[0-9a-f]{6}$/i), blurb: text,
  hp: z.number().min(0.3).max(3), attack: z.number().min(0).max(40), defense: z.number().min(0).max(40),
  move: z.number().int().min(1).max(4),
  affinity: z.array(z.enum(['HELIX', 'VOLKOV', 'TIANXIA', 'KIZUNA', 'CROWN', 'IOA', 'CBN', 'PARSU', 'PATCHWORK'])).min(1).max(3),
  link: z.string().trim().min(1).max(120),
  story: z.array(z.string().trim().min(1).max(160)).length(3),
  speed: z.number().int().min(6).max(14),
  moves: z.array(allyMove).length(2),
}).strict();
// Art names the board can draw (lib/rendering/board.ts)
const hex = z.string().regex(/^#[0-9a-f]{6}$/i);
const chapterFile = z.object({
  about: text,
  chapters: z.array(z.object({
    id: z.string().regex(/^[a-z-]+$/), name: text, place: text, map: z.string().regex(/^[a-z-]+$/), ready: z.boolean(),
    cast: z.object({
      rotation: z.array(text).min(3), elites: z.array(text).min(1).max(3), bosses: z.array(text).min(1).max(2),
      firstFight: text, setPiece: text,
    }).strict(),
    rules: z.object({ alarm: z.boolean().optional(), flinch: z.boolean().optional(), wind: z.boolean().optional(), orders: z.boolean().optional(), machines: z.boolean().optional() }).strict().optional(),
    tileset: z.object({
      floor: z.object({ light: hex, dark: hex, seam: hex, pattern: z.enum(['plastic', 'boards', 'ward', 'steel', 'panel']).optional() }).strict(),
      sea: z.object({ top: hex, bottom: hex, foam: hex }).strict(),
      hazards: z.array(z.object({ art: z.enum(['fire', 'cable', 'chem', 'hole', 'oil', 'sump', 'steam', 'coolant', 'grate', 'light']), name: text, damage: z.number().int().min(1).max(30) }).strict()).min(1),
      obstacles: z.array(z.object({ art: z.enum(['crate', 'drum', 'nets', 'pump', 'cases', 'bollard', 'locker', 'canister', 'cot', 'terminal', 'planter', 'mast', 'rack']), name: text }).strict()).min(1),
    }).strict(),
  }).strict()).min(1),
}).strict();
const DIRS = ['north', 'south', 'east', 'west', 'up', 'down', 'in', 'out'] as const;
/** A drawn arena: rectangular, known characters, one player start, enemy starts the player can reach. */
function arenaProblems(id: string, rows?: string[]): string[] {
  if (!rows) return [`map ${id}: a fight room needs an arena`];
  const out: string[] = [];
  const w = rows[0].length;
  if (rows.some(r => r.length !== w)) out.push(`map ${id}: arena rows must all be the same width`);
  const bad = Array.from(new Set(rows.join(''))).filter(ch => !ARENA_CHARS.includes(ch));
  if (bad.length) out.push(`map ${id}: arena uses unknown characters ${bad.join(' ')}`);
  const at = (ch: string) => rows.flatMap((r, ri) => Array.from(r).map((c, ci) => (c === ch ? [ri, ci] : null)).filter(Boolean) as number[][]);
  const P = at('P'), E = at('E');
  if (P.length !== 1) out.push(`map ${id}: arena needs exactly one P`);
  if (!E.length) out.push(`map ${id}: arena needs at least one E`);
  if (out.length) return out;
  const solid = (r: number, c: number) => '~#dnp?o'.includes(rows[r][c]);
  const seen = new Set([P[0].join(',')]); const queue = [P[0]];
  while (queue.length) {
    const [r, c] = queue.shift()!;
    for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) {
      const nr = r + dr, nc = c + dc, k = `${nr},${nc}`;
      if (nr < 0 || nc < 0 || nr >= rows.length || nc >= w || seen.has(k) || solid(nr, nc)) continue;
      seen.add(k); queue.push([nr, nc]);
    }
  }
  for (const e of E) if (!seen.has(e.join(','))) out.push(`map ${id}: enemy start ${e.join(',')} can't be reached from P`);
  return out;
}
const OPPOSITE: Record<string, string> = { up: 'down', down: 'up', north: 'south', south: 'north', east: 'west', west: 'east', in: 'out', out: 'in' };
const mapFile = z.object({
  about: text, chapter: text, title: text, entry: text, end: text, ending: z.string().trim().min(1).max(300), goals: z.array(text).min(1),
  endTitle: text.optional(),
  endings: z.array(z.object({ choice: text, text: z.string().trim().min(1).max(400) }).strict()).min(2).max(4).optional(),
  rooms: z.array(z.object({
    id: z.string().regex(/^[a-z0-9]+$/), at: z.tuple([z.number().int().min(0).max(40), z.number().int().min(0).max(40)]), name: text, text: z.string().trim().min(1).max(260),
    threat: z.number().int().min(1).max(200).optional(), market: z.boolean().optional(),
    tileset: z.string().regex(/^[a-z-]+$/).optional(),
    look: z.object({ text: z.string().trim().min(1).max(200), goal: text.optional() }).strict().optional(),
    ally: text.optional(), cache: z.boolean().optional(), server: z.string().trim().min(1).max(260).optional(), event: z.string().regex(/^[a-z]+$/).optional(), enemy: text.optional(), quiet: z.string().trim().min(1).max(260).optional(), arena: z.array(z.string().min(5).max(9)).min(7).max(13).optional(),
    exits: z.array(z.object({ dir: z.enum(DIRS), label: text.optional(), hint: text, to: text, requires: z.literal('goals').optional() }).strict()).min(1),
  }).strict()).min(2),
}).strict();
const figure = z.object({
  build: z.enum(['slim', 'medium', 'heavy', 'hunched']),
  skin: hex, cloth: hex, accent: hex, eyes: hex, hair: hex,
  head: z.enum(HEAD_KINDS), arms: z.tuple([z.enum(ARM_KINDS), z.enum(ARM_KINDS)]),
  legs: z.enum(['flesh', 'metal']), chest: z.array(z.enum(CHEST_KINDS)), weapon: z.enum(WEAPON_KINDS),
}).strict();
const outcome = z.object({
  implant: z.union([rarity, z.literal('better')]).optional(), stims: z.number().int().min(1).max(3).optional(),
  credits: z.number().int().min(1).max(500).optional(), health: z.number().int().min(1).max(40).optional(),
  text: z.string().trim().min(1).max(200),
}).strict();
const eventFile = z.object({
  events: z.record(z.string().regex(/^[a-z]+$/), z.object({
    text: z.string().trim().min(1).max(260),
    choices: z.array(z.object({
      label: z.string().trim().min(1).max(40),
      cost: z.object({ credits: z.number().int().min(1).max(500).optional(), health: z.number().int().min(1).max(40).optional(), part: z.literal(true).optional() }).strict().optional(),
      odds: z.number().gt(0).lt(1).optional(), win: outcome, lose: outcome.optional(),
    }).strict()
      .refine(c => (c.odds === undefined) === (c.lose === undefined), 'a choice with odds needs a lose outcome, and only then')
      .refine(c => c.win.implant !== 'better' || c.cost?.part, '"better" needs a part given up')).min(1).max(3),
  }).strict()),
}).strict();
const fxFields = z.object({ knock: z.boolean(), crush: z.boolean(), bleed: z.boolean(), drain: z.number().gt(0).max(1), stun: z.number().gt(0).max(1), cool: z.number().int().min(1).max(30), haste: z.boolean(), slow: z.boolean(), ignite: z.boolean(), hotBonus: z.number().gt(0).max(2), lowBonus: z.number().gt(0).max(2), reap: z.boolean() }).partial().strict();
const upgradeKind = z.object({
  id: z.string().regex(/^[a-z]+$/), name: z.string().trim().min(1).max(20),
  makers: z.array(z.enum(['HELIX', 'VOLKOV', 'TIANXIA', 'KIZUNA', 'CROWN', 'IOA', 'CBN', 'PARSU', 'PATCHWORK', 'any'])).min(1),
  slots: z.array(z.enum(['brain', 'eyes', 'ears', 'nose', 'lungs', 'misc', 'left_arm', 'right_arm', 'left_leg', 'right_leg'])).min(1).optional(),
  effect: z.object({
    dmg: z.number().gt(0).max(1), heat: z.number().int().min(-15).max(10), steady: z.literal(true), precise: z.literal(true), guard: z.number().gt(0).max(1),
    attack: z.number().int().min(-10).max(20), defense: z.number().int().min(1).max(20), hp: z.number().int().min(-20).max(40), move: z.literal(1), evasion: z.number().int().min(1).max(10),
    fx: fxFields,
    perk: z.object({
      cooling: z.number().int().min(1).max(10), finisher: z.number().gt(0).max(1), flank: z.number().gt(0).max(1), firstLook: z.literal(true),
      partingCut: z.number().gt(0).max(1), sidestep: z.literal(true), hazardCut: z.number().gt(0).max(1), vent: z.number().int().min(1).max(15),
      braceHeal: z.number().gt(0).max(0.2), structure: z.number().gt(0).max(0.5), toughness: z.number().gt(0).max(0.2), holdfast: z.literal(true), coolAct: z.number().int().min(16).max(60),
    }).partial().strict(),
  }).partial().strict().refine(e => Object.keys(e).length > 0, 'an upgrade must do something'),
}).strict();
const perTree = z.object({ attack: z.array(upgradeKind).min(1), brace: z.array(upgradeKind).min(1), passive: z.array(upgradeKind).min(1) }).strict();
const shape = z.object({ nodes: z.number().int().min(3).max(16), depth: z.number().int().min(2).max(6), leaves: z.number().int().min(2).max(6), rootKids: z.number().int().min(2).max(3), scale: z.number().gt(0).max(2) }).strict();
const upgradeFile = z.object({
  about: text, costs: z.array(z.number().int().min(1).max(5)).min(3).max(8), winsPerPoint: z.number().int().min(1).max(5),
  shapes: z.object({ common: shape, uncommon: shape, rare: shape, epic: shape, legendary: shape }).strict(),
  kinds: perTree, capstones: perTree, legendary: perTree,
}).strict();
const firmwareStep = z.object({
  text: z.string().trim().min(1).max(60), scale: z.number().gt(0).max(1).optional(), heat: z.number().int().min(-10).max(10).optional(),
  accuracy: z.enum(['precise', 'variable', 'unreliable']).optional(), pattern: pattern.optional(), fx: fxFields.extend({ ignoreCover: z.boolean(), retreat: z.boolean() }).partial().optional(),
  speed: z.number().int().min(1).max(4).optional(), twin: z.enum(['cool', 'always']).optional(),
}).strict().refine(st => Object.keys(st).length > 1, 'a level must add something');
const identity = z.object({
  rule: text, heat: text, ultimate: text, surge: z.enum(['piledriver', 'overwatch', 'blink', 'overrun']),
  perks: z.object({ chain: z.literal(true), heatGenBonus: z.number().int().min(1).max(10), ventMult: z.number().gt(1).max(3), coolAct: z.number().int().min(16).max(60), extraCooling: z.number().int().min(1).max(10), reflexMove: z.literal(true), transferBonus: z.number().int().min(1).max(20) }).partial().strict(),
}).strict();
const firmwareDef = z.object({ identity, base: action, scale: z.number().gt(0).max(3), levels: z.array(firmwareStep), unlockAt: z.number().int().min(2).max(30).optional(), speed: z.number().int().min(1).max(4).optional() }).strict();
const firmwareFile = z.object({
  about: text, xp: z.object({ win: z.number().int().min(1), elite: z.number().int().min(1), boss: z.number().int().min(1) }).strict(),
  xpToNext: z.array(z.number().int().min(1).max(200)).min(1).max(20),
  firmware: z.object({ melee: firmwareDef, ranged: firmwareDef, swift: firmwareDef, crowd: firmwareDef }).strict()
    .refine(f => !f.melee.unlockAt && !f.ranged.unlockAt, 'Enforcer and Operative open with a death, not by going deep')
    .refine(f => !!f.swift.unlockAt && !!f.crowd.unlockAt, 'Courier and Foreman open by going deep: they need unlockAt'),
}).strict().refine(f => Object.values(f.firmware).every(fw => fw.levels.length === f.xpToNext.length), 'every firmware needs one step per level (as many as xpToNext)');
const allyFile = z.object({ about: text, allies: z.array(ally).min(1) }).strict();

const item = z.object({
  id: z.string().regex(/^[a-z0-9_]+$/, 'ids are lower-case letters, digits and _'),
  name: text,
  description: text,
  rarity,
  type: z.enum(['augmentation', 'consumable']),
  slot: slot.optional(),
  attackBonus: stat, defenseBonus: stat, hpBonus: stat, evasionBonus: stat,
  structuralAttackBonus: stat, structuralDefenseBonus: stat,
  passiveEffect: z.enum(['kizuna_coldstart', 'bypass_sdef']).optional(),
  consumableEffect: z.enum(['bio_stim', 'structural_patch', 'heat_flush', 'overclock']).optional(),
  condition: z.enum(['pristine', 'worn', 'degraded', 'corroded']).optional(),
  icon: text,
  /** Signature implants: carried by one boss or elite, never in shops or random drops. */
  signature: z.boolean().optional(),
  /** Heads a signature implant can roll (legendaries may roll its signature head). */
  heads: z.array(text).optional(),
}).strict();

const weapon = z.object({
  id: z.string().regex(/^[a-z0-9_]+$/),
  name: text, description: text,
  manufacturer: z.enum(['volkov', 'tianxia', 'cbn', 'ioa']),
  weaponType: z.enum(['pistol', 'revolver', 'shotgun']),
  tier: z.union([z.literal(1), z.literal(2)]),
  upgradeOfId: z.string().optional(),
  price: z.number().int().positive(), sellPrice: z.number().int().positive(), upgradePrice: z.number().int().positive().optional(),
  icon: text,
  combatAction: action,
}).strict();

const enemy = z.object({
  color: z.string().regex(/^#[0-9a-f]{6}$/i),
  baseAttack: z.number().int().min(1).max(40), baseDefense: z.number().int().min(0).max(30),
  startingHeat: z.number().int().min(0).max(100),
  statSplit: z.object({ pAtkR: z.number(), sAtkR: z.number(), pDefR: z.number(), sDefR: z.number() }).strict()
    .refine(s => Math.abs(s.pAtkR + s.sAtkR - 1) < 0.01 && Math.abs(s.pDefR + s.sDefR - 1) < 0.01, 'stat splits must add up to 1'),
  dossier: text,
  moves: z.array(action).min(2),
  // What they say at the start of a fight (later ones once 5+ hosts are lost), and the signal's first impression
  lines: z.array(z.string().trim().min(1).max(110)).min(1),
  lateLines: z.array(z.string().trim().min(1).max(110)).optional(),
  firstSight: z.string().trim().min(1).max(110),
  traits: z.array(z.enum(['sighted', 'fast', 'armed', 'enduring', 'focused', 'alert', 'filtered', 'braced'])).optional(),
  signature: text.optional(),
  enrage: z.object({ at: z.number().gt(0).lt(1), gain: z.array(z.enum(['sighted', 'fast', 'armed', 'enduring', 'focused', 'alert', 'filtered', 'braced'])).min(1), line: text }).strict().optional(),
}).strict();

const enemyFile = z.object({
  enemies: z.record(enemy),
  patchworkKing: z.object({ color: z.string(), dossier: text, firstSight: z.string().trim().min(1).max(110), phases: z.array(z.array(action).min(1)).length(3), monologue: z.array(text).min(4) }).strict(),
}).strict();

export function checkContent(): string[] {
  const problems: string[] = [];
  const report = (where: string, r: z.SafeParseReturnType<unknown, unknown>) => {
    if (!r.success) for (const i of r.error.issues) problems.push(`${where} ${i.path.join('.')}: ${i.message}`);
  };

  // Items
  const ids = new Set<string>();
  (items as unknown[]).forEach((raw, n) => {
    const r = item.safeParse(raw); const id = (raw as { id?: string }).id ?? `#${n}`;
    report(`items.json ${id}`, r);
    if (!r.success) return;
    const it = r.data;
    if (ids.has(it.id)) problems.push(`items.json ${it.id}: duplicate id`);
    ids.add(it.id);
    if (it.type === 'augmentation') {
      if (!it.slot) problems.push(`items.json ${it.id}: implants need a slot`);
      const maker = it.name.match(/^\[([A-Z]+)\]/)?.[1];
      if (!maker || !(maker in MAKER_INFO)) problems.push(`items.json ${it.id}: name must start with a known [MAKER]`);
      for (const h of it.heads ?? []) if (!(h in HEADS)) problems.push(`items.json ${it.id}: unknown head "${h}"`);
      if (it.heads && !it.signature) problems.push(`items.json ${it.id}: only signature implants list heads`);
    } else if (!it.consumableEffect && !it.hpBonus) problems.push(`items.json ${it.id}: a consumable needs an effect`);
  });

  // Weapons
  const wids = new Set((weapons as { id: string }[]).map(w => w.id));
  (weapons as unknown[]).forEach(raw => {
    const r = weapon.safeParse(raw); const id = (raw as { id?: string }).id ?? '?';
    report(`weapons.json ${id}`, r);
    if (r.success && r.data.tier === 2 && !wids.has(r.data.id.replace(/_mk2$|_t2$/, '_t1')) && !(r.data.upgradeOfId && wids.has(r.data.upgradeOfId))) {
      problems.push(`weapons.json ${id}: tier 2 weapon has no tier 1 to upgrade from`);
    }
    if (r.success && r.data.sellPrice >= r.data.price) problems.push(`weapons.json ${id}: sells for more than it costs`);
  });

  // Enemies
  const er = enemyFile.safeParse(enemies);
  report('enemies.json', er);
  if (er.success) {
    for (const [n, e] of Object.entries(er.data.enemies)) {
      if (e.moves.filter(m => m.isHeavy).length > 1) problems.push(`enemies.json ${n}: keep to one heavy attack`);
      if (e.signature) {
        const sig = (items as { id: string; signature?: boolean }[]).find(i => i.id === e.signature);
        if (!sig?.signature) problems.push(`enemies.json ${n}: signature "${e.signature}" isn't a signature implant in items.json`);
      }
      if (!e.moves.some(m => m.type === 'attack' && !m.isHeavy)) problems.push(`enemies.json ${n}: needs a normal attack`);
    }
  }
  // Upgrade trees: each rarity's shape fits the price list, and every tree kind has enough to fill a branch
  const ur = upgradeFile.safeParse(upgrades);
  report('upgrades.json', ur);
  if (ur.success) {
    for (const [r, sh] of Object.entries(ur.data.shapes)) {
      if (sh.depth >= ur.data.costs.length) problems.push(`upgrades.json shapes.${r}: deeper than the costs list reaches`);
      if (sh.nodes < sh.rootKids + 1) problems.push(`upgrades.json shapes.${r}: too few nodes for its root to fork`);
    }
    for (const [kind, list] of Object.entries(ur.data.kinds)) {
      const deepest = Math.max(...Object.values(ur.data.shapes).map(sh => sh.depth));
      if (list.length < deepest) problems.push(`upgrades.json kinds.${kind}: needs at least ${deepest} kinds so no branch repeats one`);
      if (new Set(list.map(k => k.id)).size !== list.length) problems.push(`upgrades.json kinds.${kind}: duplicate ids`);
    }
  }
  // Firmware
  report('firmware.json', firmwareFile.safeParse(firmware));
  // Room events
  const evr = eventFile.safeParse(events);
  report('events.json', evr);
  const usedEvents = new Set<string>();
  for (const m of Object.values(MAPS)) for (const r of m.rooms) if (r.event) {
    usedEvents.add(r.event);
    if (!(r.event in (events as { events: Record<string, unknown> }).events)) problems.push(`map ${r.id}: event "${r.event}" isn't in events.json`);
    if (r.threat === undefined) problems.push(`map ${r.id}: events wait in fight rooms (they appear once the fight is won)`);
    if (r.market || r.ally || r.cache) problems.push(`map ${r.id}: an event can't share a room with a market, an ally or a cache`);
  }
  for (const id of Object.keys((events as { events: Record<string, unknown> }).events)) if (!usedEvents.has(id)) problems.push(`events.json: "${id}" isn't placed in any room`);
  // Chapters
  const cr = chapterFile.safeParse(chapters);
  report('chapters.json', cr);
  if (cr.success) {
    const defined = (enemies as { enemies: Record<string, unknown> }).enemies;
    for (const c of cr.data.chapters) {
      if (!MAPS[c.map]) problems.push(`chapters.json ${c.id}: no map "${c.map}" (add content/map-${c.map}.json to MAPS in lib/engine/map.ts)`);
      const { rotation, elites, bosses, firstFight } = c.cast;
      if (c.cast.setPiece !== 'Patchwork King' && !defined[c.cast.setPiece]) problems.push(`chapters.json ${c.id}: set piece "${c.cast.setPiece}" isn't in enemies.json`);
      for (const n of [...rotation, ...elites, ...bosses, firstFight]) if (!defined[n]) problems.push(`chapters.json ${c.id}: "${n}" is in the cast but not in enemies.json`);
    }
    if (!cr.data.chapters[0].ready) problems.push('chapters.json: the first chapter must be ready');
  }

  // The hidden map: exits lead somewhere, every room can be reached, each goal is findable once
  const allyRooms: Record<string, number> = {};
  for (const [mapName, mapData] of Object.entries(MAPS)) {
  const mr = mapFile.safeParse(mapData);
  report(`map-${mapName}.json`, mr);
  if (mr.success) {
    const m = mr.data;
    const ids = new Set(m.rooms.map(r => r.id));
    if (ids.size !== m.rooms.length) problems.push('map: duplicate room ids');
    if (!ids.has(m.entry)) problems.push(`map: entry "${m.entry}" is not a room`);
    const spots = new Map<string, string>();
    for (const r of m.rooms) { const k = r.at.join(','); if (spots.has(k)) problems.push(`map ${r.id}: drawn on the same spot as ${spots.get(k)} (at ${k})`); spots.set(k, r.id); }
    const endRoom = m.rooms.find(r => r.id === m.end);
    if (!endRoom || endRoom.threat === undefined) problems.push(`map: end "${m.end}" must be a room with a fight`);
    else if (!endRoom.quiet) problems.push(`map ${m.end}: the end room needs quiet text for after the chapter`);
    for (const r of m.rooms) {
      for (const e of r.exits) if (!ids.has(e.to)) problems.push(`map ${r.id}: exit ${e.dir} leads to missing room "${e.to}"`);
      if (r.threat !== undefined && r.market) problems.push(`map ${r.id}: a market room can't hold a fight`);
      if (r.server && (r.threat === undefined || r.threat % 10 !== 0 || r.id === m.end)) problems.push(`map ${r.id}: a server belongs in a boss room (threat 10 or 20; it wakes once the boss is beaten), not the chapter's end`);
      if (r.server && !r.quiet) problems.push(`map ${r.id}: a boss room with a server needs quiet text for once the boss is beaten`);
      if (r.threat !== undefined) problems.push(...arenaProblems(r.id, r.arena));
      else if (r.arena) problems.push(`map ${r.id}: an arena on a room with no fight`);
      if (r.enemy && !(r.enemy in (enemies as { enemies: Record<string, unknown> }).enemies)) problems.push(`map ${r.id}: enemy "${r.enemy}" isn't in enemies.json`);
      if (r.enemy && (r.threat === undefined || r.threat % 5 === 0)) problems.push(`map ${r.id}: only regular fight rooms name their enemy (elites and bosses come from the threat)`);
      // A way back must be the opposite way: up comes back down, north comes back south
      for (const e of r.exits) for (const b of m.rooms.find(x => x.id === e.to)?.exits ?? []) if (b.to === r.id && b.dir !== OPPOSITE[e.dir]) problems.push(`map ${r.id}: goes ${e.dir} to ${e.to}, but the way back is ${b.dir} (should be ${OPPOSITE[e.dir]})`);
      if (r.look?.goal && !m.goals.includes(r.look.goal)) problems.push(`map ${r.id}: goal "${r.look.goal}" isn't one of the chapter's goals`);
    }
    const allyIds = (allies as { allies: { id: string }[] }).allies.map(a => a.id);
    for (const r of m.rooms) if (r.ally && !allyIds.includes(r.ally)) problems.push(`map ${r.id}: ally "${r.ally}" isn't in allies.json`);
    for (const r of m.rooms) if (r.ally) allyRooms[r.ally] = (allyRooms[r.ally] ?? 0) + 1;
    for (const g of m.goals) {
      const n = m.rooms.filter(r => r.look?.goal === g).length;
      if (n !== 1) problems.push(`map: goal "${g}" should be in exactly one room (found ${n})`);
    }
    const seen = new Set([m.entry]); const queue = [m.entry];
    while (queue.length) { const at = queue.shift(); const r = m.rooms.find(x => x.id === at)!; for (const e of r.exits) if (!seen.has(e.to) && ids.has(e.to)) { seen.add(e.to); queue.push(e.to); } }
    for (const r of m.rooms) if (!seen.has(r.id)) problems.push(`map ${r.id}: can't be reached from the entry`);
  }
  }
  for (const id of (allies as { allies: { id: string }[] }).allies.map(a => a.id)) if (allyRooms[id] !== 1) problems.push(`maps: ally "${id}" should wait in exactly one room across all chapters (found ${allyRooms[id] ?? 0})`);

  // Figures: every character that appears in a fight has a look
  const looks = (figures as { figures: Record<string, unknown> }).figures;
  for (const [id, f] of Object.entries(looks)) report(`figures.json ${id}`, figure.safeParse(f));
  const needed = ['host', 'Patchwork King', ...Object.keys((enemies as { enemies: Record<string, unknown> }).enemies), ...(allies as { allies: { id: string }[] }).allies.map(a => a.id)];
  for (const id of needed) if (!looks[id]) problems.push(`figures.json: no look for "${id}"`);

  // Allies
  const ar = allyFile.safeParse(allies);
  report('allies.json', ar);
  if (ar.success) {
    const seen = new Set<string>();
    for (const a of ar.data.allies) {
      if (seen.has(a.id)) problems.push(`allies.json ${a.id}: duplicate id`);
      seen.add(a.id);
      if (!a.moves.some(m => m.effect === 'attack')) problems.push(`allies.json ${a.id}: needs at least one attack`);
      if (!(a.id in ALLY_LINKS)) problems.push(`allies.json ${a.id}: no link bonus in ALLY_LINKS (lib/combat/allies.ts)`);
    }
  }
  return problems;
}

if (process.argv[1]?.endsWith('check-content.ts')) {
  const problems = checkContent();
  if (problems.length) { console.error(problems.map(p => `  - ${p}`).join('\n')); console.error(`${problems.length} content problem(s)`); process.exit(1); }
  console.log(`Content OK: ${(items as unknown[]).length} items, ${(weapons as unknown[]).length} weapons, ${Object.keys(enemies.enemies).length} enemies + the Patchwork King, ${allies.allies.length} allies, ${chapters.chapters.length} chapters, ${Object.values(MAPS).reduce((n, m) => n + m.rooms.length, 0)} map rooms`);
}
