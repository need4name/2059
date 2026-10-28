import type { Item, ItemRarity, AugmentationSlot, CombatAction, AttackPatternType, AccuracyTier, ActionEffects } from './types';
import { random } from '../engine/rng';
import { augmentKind } from './types';

// ── Makers ────────────────────────────────────────────────────────────────────

export type Maker = 'HELIX' | 'VOLKOV' | 'TIANXIA' | 'KIZUNA' | 'CROWN' | 'IOA' | 'CBN' | 'PARSU' | 'PATCHWORK';

export const MAKER_INFO: Record<Maker, { label: string; blurb: string; tone: string }> = {
  HELIX:     { label: 'Helix',     tone: 'text-slate-200',   blurb: '\u201cContinuity is a service.\u201d' },
  VOLKOV:    { label: 'Volkov',    tone: 'text-rose-300',    blurb: '\u201cProperty of an operator. Do not remove.\u201d' },
  TIANXIA:   { label: 'Tianxia',   tone: 'text-cyan-300',    blurb: '\u201cBuilt for a lifetime of work.\u201d' },
  KIZUNA:    { label: 'Kizuna',    tone: 'text-violet-300',  blurb: '\u201cCertified. Tampering is logged.\u201d' },
  CROWN:     { label: 'Crown',     tone: 'text-amber-300',   blurb: '\u201cA gift of the clinic. Wear it well.\u201d' },
  IOA:       { label: 'IOA',       tone: 'text-orange-300',  blurb: '\u201cCleared for passage.\u201d' },
  CBN:       { label: 'CBN',       tone: 'text-emerald-300', blurb: '\u201cNo refunds. No records.\u201d' },
  PARSU:     { label: 'PARSU',     tone: 'text-yellow-200',  blurb: '\u201cOrigin withheld.\u201d' },
  PATCHWORK: { label: 'Patchwork', tone: 'text-stone-300',   blurb: '\u201cSomebody else\u2019s parts.\u201d' },
};

// Blurbs are what's stamped on the part, not an explanation of the maker
export function makerOf(item: Item): Maker {
  const m = item.name.match(/^\[([A-Z]+)\]/)?.[1] as Maker | undefined;
  return m && m in MAKER_INFO ? m : 'PATCHWORK';
}

// ── Stat budget ───────────────────────────────────────────────────────────────
// Every implant is brought into a power band for its rarity so legendaries are
// all worth chasing and no epic beats a legendary. Health costs are kept as-is.

const POWER_TARGET: Record<ItemRarity, number> = { common: 4, uncommon: 8, rare: 14, epic: 22, legendary: 34 };

export function powerOf(i: Pick<Item, 'attackBonus' | 'defenseBonus' | 'hpBonus' | 'structuralAttackBonus' | 'structuralDefenseBonus' | 'evasionBonus'>): number {
  const pos = (n?: number) => Math.max(0, n ?? 0);
  return pos(i.attackBonus) + pos(i.defenseBonus) + pos(i.hpBonus) / 4 + pos(i.structuralAttackBonus) + pos(i.structuralDefenseBonus) + 2 * pos(i.evasionBonus);
}

export function normaliseItem(item: Item): Item {
  if (item.type !== 'augmentation') return item;
  const p = powerOf(item);
  if (p <= 0) return item;
  const k = Math.max(0.6, Math.min(1.8, POWER_TARGET[item.rarity] / p));
  const scale = (n?: number) => (n && n > 0 ? Math.max(1, Math.round(n * k)) : n);
  return {
    ...item,
    attackBonus: scale(item.attackBonus),
    defenseBonus: scale(item.defenseBonus),
    hpBonus: scale(item.hpBonus),
    structuralAttackBonus: scale(item.structuralAttackBonus),
    structuralDefenseBonus: scale(item.structuralDefenseBonus),
    evasionBonus: scale(item.evasionBonus),
  };
}

// ── Condition ─────────────────────────────────────────────────────────────────
// Salvaged parts work at reduced strength. Corroded parts also carry an
// infection risk that costs health. A part never subtracts stats.

export const CONDITION_MULT: Record<string, number> = { pristine: 1, worn: 0.8, degraded: 0.6, corroded: 0.45 };
export const CONDITION_HP_COST: Record<string, number> = { pristine: 0, worn: 0, degraded: 2, corroded: 5 };

// ── Structure (the implant health bar) ────────────────────────────────────────

const SLOT_STRUCTURE: Record<AugmentationSlot, number> = {
  left_arm: 12, right_arm: 12, left_leg: 12, right_leg: 12, misc: 11,
  lungs: 6, eyes: 4, brain: 4, ears: 3, nose: 3,
};
const MAKER_STRUCTURE: Record<Maker, number> = {
  HELIX: 1.5, VOLKOV: 1.35, TIANXIA: 1.3, PARSU: 1.4, PATCHWORK: 1.0, IOA: 0.9, CROWN: 0.9, CBN: 0.8, KIZUNA: 0.6,
};
const RARITY_STRUCTURE: Record<ItemRarity, number> = { common: 1, uncommon: 1.15, rare: 1.3, epic: 1.5, legendary: 1.75 };

export function structureOf(item: Item): number {
  if (item.type !== 'augmentation' || !item.slot) return 0;
  const base = SLOT_STRUCTURE[item.slot] * MAKER_STRUCTURE[makerOf(item)] * RARITY_STRUCTURE[item.rarity];
  return Math.round(base * (CONDITION_MULT[item.condition ?? 'pristine'] ?? 1));
}

// Grafts get rejected, counterfeit firmware burns nerves, operator suites
// strain the frame. Clinic and labour hardware is gentle on the body.
const MAKER_HP_COST: Partial<Record<Maker, number>> = { CBN: 5, VOLKOV: 3, IOA: 3 };

/** Health an implant takes from you (rejection, infection, nerve damage). Positive number. */
export function healthCostOf(item: Item): number {
  if (item.type !== 'augmentation') return 0;
  const listed = item.hpBonus && item.hpBonus < 0 ? -item.hpBonus : 0;
  const maker = Math.round((MAKER_HP_COST[makerOf(item)] ?? 0) * RARITY_STRUCTURE[item.rarity]);
  return listed + maker + (CONDITION_HP_COST[item.condition ?? 'pristine'] ?? 0);
}

/** Lowest max health implants can drag you down to. */
export const MIN_PLAYER_HP = 30;

// ── Active implant actions ────────────────────────────────────────────────────

type Group = 'arm' | 'leg' | 'eyes';
interface Template {
  name: string; damage?: number; pattern?: AttackPatternType; accuracy?: AccuracyTier; heat: number;
  phys?: number; transfer?: number; healing?: number; guard?: number; brace?: boolean; flavour: string;
}

const T: Record<Group, Partial<Record<Maker, Template>> & { default: Template }> = {
  arm: {
    VOLKOV:    { name: 'Hydraulic Drive',    damage: 14, pattern: 'melee_long',     accuracy: 'precise',    heat: 14, phys: 0.75, transfer: 4, flavour: 'Operator torque through two tiles.' },
    TIANXIA:   { name: 'Labour Press',       damage: 12, pattern: 'melee',          accuracy: 'variable',   heat: 8,  phys: 0.8,  flavour: 'Industrial grip on anything adjacent.' },
    PATCHWORK: { name: 'Hook Swing',         damage: 13, pattern: 'sweep_arc',      accuracy: 'unreliable', heat: 9,  phys: 0.7,  transfer: 6, flavour: 'A wide salvage-hook swing.' },
    CBN:       { name: 'Graft Lash',         damage: 12, pattern: 'lunge',          accuracy: 'variable',   heat: 10, phys: 0.9,  healing: 5, flavour: 'Lashes out and feeds the graft.' },
    CROWN:     { name: 'Concierge Jab',      damage: 10, pattern: 'melee',          accuracy: 'precise',    heat: 5,  phys: 0.85, flavour: 'Clean, cool and exact.' },
    KIZUNA:    { name: 'Mediated Cut',       damage: 13, pattern: 'diagonal_cross', accuracy: 'precise',    heat: 9,  phys: 0.6,  flavour: 'Signed motion along the diagonals.' },
    IOA:       { name: 'Limiter-Free Swing', damage: 16, pattern: 'cone',           accuracy: 'unreliable', heat: 18, phys: 0.7,  flavour: 'Safety caps removed. Hits a cone.' },
    PARSU:     { name: 'Substrate Hammer',   damage: 13, pattern: 'melee',          accuracy: 'variable',   heat: 10, phys: 0.9,  flavour: 'Dense composite, swung hard.' },
    HELIX:     { name: 'Housing Guard',      brace: true, guard: 11, heat: -18, flavour: 'Locks structural housing: guard up, cool down, repair.' },
    default:   { name: 'Augmented Strike',   damage: 12, pattern: 'melee',          accuracy: 'variable',   heat: 9,  flavour: 'A harder hit than flesh can manage.' },
  },
  leg: {
    VOLKOV:    { name: 'Breach Charge',      damage: 15, pattern: 'charge',         accuracy: 'precise',    heat: 14, phys: 0.8,  transfer: 5, flavour: 'Closes two to three tiles and hits.' },
    TIANXIA:   { name: 'Load Kick',          damage: 11, pattern: 'knockback',      accuracy: 'variable',   heat: 7,  phys: 0.8,  flavour: 'A straight kick down a line.' },
    PATCHWORK: { name: 'Scrap Stomp',        damage: 11, pattern: 'melee',          accuracy: 'unreliable', heat: 8,  phys: 0.85, flavour: 'Heavy, clumsy, effective.' },
    CBN:       { name: 'SCAR Lunge',         damage: 13, pattern: 'lunge',          accuracy: 'variable',   heat: 10, phys: 0.85, flavour: 'A graft-driven leap.' },
    KIZUNA:    { name: 'Inertial Step-Cut',  damage: 12, pattern: 'lunge',          accuracy: 'precise',    heat: 8,  phys: 0.65, flavour: 'Balance-stabilised strike on the move.' },
    CROWN:     { name: 'Poise Sweep',        damage: 9,  pattern: 'sweep_arc',      accuracy: 'precise',    heat: 5,  phys: 0.8,  flavour: 'A graceful low sweep.' },
    HELIX:     { name: 'Anchor Stance',      brace: true, guard: 9,  heat: -15, flavour: 'Plants the frame: guard up, cool down, repair.' },
    default:   { name: 'Augmented Kick',     damage: 10, pattern: 'knockback',      accuracy: 'variable',   heat: 7,  flavour: 'A powered kick.' },
  },
  eyes: {
    CROWN:     { name: 'Glare Lance',        damage: 11, pattern: 'ranged',         accuracy: 'precise',    heat: 9,  phys: 0.6,  flavour: 'Clinic optics find the weak point at range.' },
    KIZUNA:    { name: 'Signed Target Lock', damage: 12, pattern: 'ranged',         accuracy: 'precise',    heat: 10, phys: 0.5,  flavour: 'A MIL-signed lock at range.' },
    VOLKOV:    { name: 'Operator Mark',      damage: 14, pattern: 'ranged',         accuracy: 'variable',   heat: 12, phys: 0.7,  transfer: 6, flavour: 'Targeting overlay paints the enemy hot.' },
    IOA:       { name: 'Grey HUD Snap',      damage: 13, pattern: 'ranged',         accuracy: 'unreliable', heat: 11, phys: 0.6,  flavour: 'Cracked firmware, fast aim.' },
    PATCHWORK: { name: 'Jury-Rigged Sight',  damage: 10, pattern: 'ranged',         accuracy: 'unreliable', heat: 7,  phys: 0.6,  flavour: 'Good enough to hit something.' },
    default:   { name: 'Overlay Shot',       damage: 10, pattern: 'ranged',         accuracy: 'variable',   heat: 8,  flavour: 'Retinal overlay guides a ranged hit.' },
  },
};

const RARITY_DAMAGE: Record<ItemRarity, number> = { common: 1, uncommon: 1.2, rare: 1.45, epic: 1.75, legendary: 2.1 };

function groupOf(slot: AugmentationSlot): Group | null {
  if (slot === 'left_arm' || slot === 'right_arm') return 'arm';
  if (slot === 'left_leg' || slot === 'right_leg') return 'leg';
  if (slot === 'eyes') return 'eyes';
  return null;
}

// ── Implant parts ─────────────────────────────────────────────────────────────
// Like guns in Borderlands, an active implant is built from parts when it drops:
// the frame (its maker: base damage, heat, structure, health cost), a head (the
// attack's shape) and 0-2 mods (side effects). Quality decides which heads and how
// many mods. Two drops with the same name can fight differently.

export interface Head { group: Group; noun: string; pattern: AttackPatternType; mult: number; basic?: boolean; effects?: ActionEffects; signature?: string }
export const HEADS: Record<string, Head> = {
  jab:      { group: 'arm', noun: 'Jab',      pattern: 'melee',          mult: 1.0,  basic: true },
  reach:    { group: 'arm', noun: 'Drive',    pattern: 'melee_long',     mult: 0.95, basic: true },
  lash:     { group: 'arm', noun: 'Lash',     pattern: 'lunge',          mult: 1.1,  basic: true },
  hook:     { group: 'arm', noun: 'Hook',     pattern: 'sweep_arc',      mult: 0.85 },
  cutter:   { group: 'arm', noun: 'Cutter',   pattern: 'diagonal_cross', mult: 0.8 },
  spread:   { group: 'arm', noun: 'Spread',   pattern: 'cone',           mult: 0.85 },
  grapple:  { group: 'arm', noun: 'Grapple',  pattern: 'grapple',        mult: 0.8,  effects: { pull: true } },
  stomp:    { group: 'leg', noun: 'Stomp',    pattern: 'melee',          mult: 1.0,  basic: true },
  kick:     { group: 'leg', noun: 'Kick',     pattern: 'knockback',      mult: 0.9,  basic: true },
  lunge:    { group: 'leg', noun: 'Lunge',    pattern: 'lunge',          mult: 1.05, basic: true },
  charge:   { group: 'leg', noun: 'Charge',   pattern: 'charge',         mult: 1.0 },
  sweep:    { group: 'leg', noun: 'Sweep',    pattern: 'sweep_arc',      mult: 0.85 },
  stepcut:  { group: 'leg', noun: 'Step-cut', pattern: 'melee',          mult: 0.95, effects: { retreat: true } },
  bolt:     { group: 'eyes', noun: 'Bolt',    pattern: 'bolt',           mult: 1.0,  basic: true },
  scope:    { group: 'eyes', noun: 'Scope',   pattern: 'ranged',         mult: 1.05, basic: true },
  lance:    { group: 'eyes', noun: 'Lance',   pattern: 'pierce',         mult: 0.9 },
  mortar:   { group: 'eyes', noun: 'Mortar',  pattern: 'lob',            mult: 0.8 },
  // Signatures: legendary only
  breachline:  { group: 'arm', noun: 'Breach Line',   pattern: 'charge',    mult: 1.1,  signature: 'VOLKOV',    effects: { dash: true, knock: true } },
  crowdpress:  { group: 'arm', noun: 'Crowd Press',   pattern: 'sweep_arc', mult: 1.0,  signature: 'TIANXIA',   effects: { knock: true } },
  monowire:    { group: 'arm', noun: 'Monowire',      pattern: 'pierce',    mult: 1.0,  signature: 'KIZUNA',    effects: { ignoreCover: true } },
  bedside:     { group: 'arm', noun: 'Bedside Manner', pattern: 'melee',    mult: 1.2,  signature: 'CROWN',     effects: { drain: 0.5, cool: 10 } },
  harvest:     { group: 'arm', noun: 'Harvest',       pattern: 'grapple',   mult: 1.0,  signature: 'CBN',       effects: { pull: true, drain: 0.4, bleed: true } },
  override:    { group: 'arm', noun: 'Override Pulse', pattern: 'lob',      mult: 0.9,  signature: 'IOA',       effects: { stun: 0.6 } },
  groundslam:  { group: 'arm', noun: 'Ground Slam',   pattern: 'burst',     mult: 1.0,  signature: 'PARSU',     effects: { crush: true } },
  scrapstorm:  { group: 'arm', noun: 'Scrapstorm',    pattern: 'cone',      mult: 1.0,  signature: 'PATCHWORK', effects: { bleed: true, knock: true } },
  sprint:      { group: 'leg', noun: 'Sprint Strike', pattern: 'charge',    mult: 1.1,  signature: 'any',       effects: { dash: true } },
  longshot:    { group: 'eyes', noun: 'Long Shot',    pattern: 'longshot',  mult: 1.15, signature: 'any' },
};

export interface Mod { label: string; effects: ActionEffects }
export const MODS: Record<string, Mod> = {
  knock: { label: 'Knockback', effects: { knock: true } },
  crush: { label: 'Crush', effects: { crush: true } },
  bleed: { label: 'Bleed', effects: { bleed: true } },
  stun:  { label: 'Stun 25%', effects: { stun: 0.25 } },
  drain: { label: 'Drain', effects: { drain: 0.25 } },
  cool:  { label: 'Coolant', effects: { cool: 8 } },
  cover: { label: 'Ignores cover', effects: { ignoreCover: true } },
  sap:   { label: 'Slows', effects: { slow: true } },
  rush:  { label: 'Hastes you', effects: { haste: true } },
};

// What each maker leans toward: its usual heads (picked 60% of the time) and the mods it can carry
const MAKER_PARTS: Record<Maker, { heads: string[]; mods: string[]; word: string }> = {
  VOLKOV:    { word: 'Hydraulic',    heads: ['reach', 'jab', 'spread', 'charge', 'kick', 'scope', 'lance'], mods: ['knock', 'crush', 'rush'] },
  TIANXIA:   { word: 'Labour',       heads: ['jab', 'hook', 'kick', 'stomp', 'bolt', 'scope'], mods: ['knock', 'cool'] },
  KIZUNA:    { word: 'Signed',       heads: ['cutter', 'lash', 'lunge', 'stepcut', 'scope', 'lance'], mods: ['cover', 'cool', 'sap'] },
  CROWN:     { word: 'Concierge',    heads: ['jab', 'reach', 'sweep', 'stepcut', 'scope', 'bolt'], mods: ['drain', 'cool'] },
  CBN:       { word: 'Graft',        heads: ['lash', 'grapple', 'lunge', 'kick', 'bolt', 'lance'], mods: ['bleed', 'drain'] },
  IOA:       { word: 'Limiter-free', heads: ['spread', 'hook', 'charge', 'kick', 'mortar', 'bolt'], mods: ['stun', 'cover', 'rush'] },
  PARSU:     { word: 'Substrate',    heads: ['jab', 'hook', 'stomp', 'kick', 'bolt', 'mortar'], mods: ['crush', 'knock', 'sap'] },
  PATCHWORK: { word: 'Scrap',        heads: [], mods: Object.keys(MODS) },
  HELIX:     { word: 'Housing',      heads: [], mods: [] },
};

const pick = <T,>(arr: T[]): T => arr[Math.floor(random() * arr.length)];

/** Roll the parts for a freshly dropped active implant (seeded, so runs replay). Helix parts are braces and have none. */
export function rollParts(item: Item): Item['parts'] {
  if (item.type !== 'augmentation' || !item.slot) return undefined;
  const group = groupOf(item.slot);
  const maker = makerOf(item);
  if (!group || maker === 'HELIX') return undefined;
  const r = item.rarity;
  const fits = (id: string) => HEADS[id].group === group && !HEADS[id].signature;
  let pool = Object.keys(HEADS).filter(id => fits(id) && (r === 'common' || r === 'uncommon' ? HEADS[id].basic : true));
  const sig = Object.keys(HEADS).filter(id => HEADS[id].group === group && (HEADS[id].signature === maker || HEADS[id].signature === 'any'));
  let head: string;
  // A signature implant rolls from its own heads (its signature head only at legendary)
  const own = (item.heads ?? []).filter(id => HEADS[id]?.group === group && (!HEADS[id].signature || r === 'legendary'));
  if (own.length) head = r === 'legendary' && own.some(id => HEADS[id].signature) && random() < 0.5 ? own.find(id => HEADS[id].signature)! : pick(own.filter(id => !HEADS[id].signature).length ? own.filter(id => !HEADS[id].signature) : own);
  else if (r === 'legendary' && sig.length && random() < 0.5) head = pick(sig);
  else {
    const usual = pool.filter(id => MAKER_PARTS[maker].heads.includes(id));
    head = usual.length && random() < 0.6 ? pick(usual) : pick(pool);
  }
  const count = r === 'common' ? 0 : r === 'uncommon' ? (random() < 0.5 ? 1 : 0) : r === 'rare' ? 1 : 2;
  const mods: string[] = [];
  const modPool = MAKER_PARTS[maker].mods.filter(m => !HEADS[head].effects || !Object.keys(MODS[m].effects).some(k => k in HEADS[head].effects!));
  for (let k = 0; k < count && modPool.length; k++) {
    const m = pick(modPool.filter(x => !mods.includes(x)).length ? modPool.filter(x => !mods.includes(x)) : modPool);
    if (!mods.includes(m)) mods.push(m);
  }
  return { head, mods };
}

/** Parts for an implant saved before parts existed: its old maker shape, no mods. */
function legacyParts(item: Item, group: Group, pattern: AttackPatternType | undefined): NonNullable<Item['parts']> {
  const head = Object.keys(HEADS).find(id => HEADS[id].group === group && !HEADS[id].signature && HEADS[id].pattern === pattern)
    ?? { arm: 'jab', leg: 'stomp', eyes: 'scope' }[group];
  return { head, mods: [] };
}

/** "Hook head · Bleed, Stun 25%": how the parts read on an item card. */
export function partsText(item: Item): string | null {
  const group = item.slot ? groupOf(item.slot) : null;
  if (!group || makerOf(item) === 'HELIX') return null;
  const t = T[group][makerOf(item)] ?? T[group].default;
  const parts = item.parts ?? legacyParts(item, group, t.pattern);
  const head = HEADS[parts.head];
  if (!head) return null;
  const mods = parts.mods.map(m => MODS[m]?.label).filter(Boolean);
  const cheap = item.rarity === 'common' && !head.signature ? ' · hits one' : '';
  return `${head.signature ? 'Signature: ' : ''}${head.noun} head${mods.length ? ` · ${mods.join(', ')}` : ''}${cheap}`;
}

export interface ActiveTreeMod { path: 'A' | 'B' | null; tier: number }

/**
 * The combat action an active implant gives you. Upgrade path A pushes damage
 * and heat; path B sharpens accuracy and runs cooler.
 */
export function actionForItem(item: Item, mod: ActiveTreeMod = { path: null, tier: 0 }): CombatAction | null {
  if (item.type !== 'augmentation' || !item.slot || augmentKind(item.slot) !== 'active') return null;
  const group = groupOf(item.slot);
  if (!group) return null;
  const maker = makerOf(item);
  const t = T[group][maker] ?? T[group].default;
  const cond = CONDITION_MULT[item.condition ?? 'pristine'] ?? 1;
  const tierUp = Math.max(0, mod.tier);
  const description = `${t.flavour}${mod.path ? ` Tuned path ${mod.path}, tier ${tierUp}.` : ''}`;

  if (t.brace) {
    const guard = Math.round((t.guard ?? 8) * RARITY_DAMAGE[item.rarity] * cond * (1 + 0.12 * tierUp));
    return { type: 'brace', name: t.name, description, defenseBoost: guard, heatGenerated: t.heat - (mod.path === 'B' ? 3 * tierUp : 0) };
  }

  // The parts decide the shape, name and side effects; the frame (maker) the base numbers
  const parts = item.parts ?? legacyParts(item, group, t.pattern);
  const head = HEADS[parts.head] ?? HEADS[legacyParts(item, group, t.pattern).head];
  const effects: ActionEffects = { ...(head.effects ?? {}) };
  for (const m of parts.mods) Object.assign(effects, MODS[m]?.effects ?? {});
  if (item.rarity === 'common' && item.parts && !head.signature) effects.focus = true;
  const name = head.signature ? head.noun : `${MAKER_PARTS[maker].word} ${head.noun}`;

  let damage = (t.damage ?? 10) * RARITY_DAMAGE[item.rarity] * cond * head.mult;
  // Guaranteed full damage costs extra heat
  let heat = t.heat + (t.accuracy === 'precise' ? 3 : 0);
  let accuracy = t.accuracy ?? 'variable';
  if (mod.path === 'A') { damage *= 1 + 0.18 * tierUp; heat += 2 * tierUp; }
  if (mod.path === 'B') {
    damage *= 1 + 0.08 * tierUp; heat = Math.max(3, heat - 2 * tierUp);
    if (tierUp >= 2) accuracy = accuracy === 'unreliable' ? 'variable' : 'precise';
  }
  return {
    type: 'attack',
    name,
    description,
    damage: Math.round(damage),
    attackPattern: head.pattern,
    effects: Object.keys(effects).length ? effects : undefined,
    accuracy,
    heatGenerated: heat,
    heatTransfer: t.transfer ?? 0,
    physicalRatio: t.phys ?? 0.7,
    healing: t.healing ? Math.round(t.healing * RARITY_DAMAGE[item.rarity]) : undefined,
    bypassStructuralDefense: item.passiveEffect === 'bypass_sdef' || undefined,
    side: item.slot === 'left_arm' ? 'left' : item.slot === 'right_arm' ? 'right' : undefined,
  };
}
