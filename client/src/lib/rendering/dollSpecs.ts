// Who looks like what: turns the host, an ally or an enemy into a doll (see dolls.ts).
// The host's body comes from its loaded firmware and its parts from what it has fitted;
// enemies and allies keep their look from content/figures.json (body build, colours,
// headwear, clothes, what they hold) and wear the implants they actually carry.

import type { Character, Item, PlayerClass } from '../combat/types';
import { makerOf } from '../combat/augments';
import { FIGURES, type FigureSpec, type ArmKind } from './figures';
import type { BodySlot, DollSpec, FrameId, MakerKey, PartLook, Team } from './dolls';

const TIER: Record<string, number> = { common: 0, uncommon: 1, rare: 2, epic: 3, legendary: 4 };
const SLOTS: BodySlot[] = ['left_arm', 'right_arm', 'left_leg', 'right_leg', 'eyes', 'ears', 'nose', 'brain', 'lungs', 'misc'];

/** How an implant looks fitted: its maker, rarity and upgrade nodes taken. */
export function partOf(item: Item, ups = 0): PartLook {
  return { maker: makerOf(item).toLowerCase() as MakerKey, tier: TIER[item.rarity ?? 'common'] ?? 0, ...(ups ? { ups: Math.min(3, ups) } : {}) };
}

/** Parts for a set of implants, by the slot each sits in. */
export function partsOf(items: (Item | null | undefined)[], upsOf: (item: Item) => number = () => 0): DollSpec['parts'] {
  const parts: DollSpec['parts'] = {};
  for (const it of items) {
    if (!it || it.type !== 'augmentation' || !it.slot) continue;
    const slot = it.slot as BodySlot;
    if (SLOTS.includes(slot) && !parts[slot]) parts[slot] = partOf(it, upsOf(it));
  }
  return parts;
}

/** The body each firmware wakes in. */
export const FIRMWARE_FRAME: Record<PlayerClass, FrameId> = {
  none: 'unclassified', melee: 'enforcer', ranged: 'operative', swift: 'courier', crowd: 'foreman', wretch: 'wretch', splice: 'splice',
};

/** The host: its firmware's body wearing what it has fitted. */
export function hostDoll(playerClass: PlayerClass, equipped: Record<string, Item | null | undefined>, upsOf: (item: Item) => number): DollSpec {
  return { frame: FIRMWARE_FRAME[playerClass] ?? 'unclassified', team: 'you', parts: partsOf(Object.values(equipped), upsOf) };
}

// Old builds become bodies; arms an enemy was always drawn with stay as built-in parts
const BUILD_FRAME: Record<FigureSpec['build'], FrameId> = { slim: 'stalker', medium: 'standard', heavy: 'brute', hunched: 'crawler' };
const INNATE_ARM: Partial<Record<ArmKind, PartLook>> = {
  metal: { maker: 'patchwork', tier: 0 }, crane: { maker: 'tianxia', tier: 1 }, claw: { maker: 'cbn', tier: 0 },
  blade: { maker: 'kizuna', tier: 0 }, pump: { maker: 'tianxia', tier: 0 },
};

/** Someone's look from figures.json, as a doll with nothing carried yet. */
function lookOf(id: string, team: Team, big = false): DollSpec {
  const f = FIGURES[id];
  if (!f) return { frame: big ? 'boss' : 'standard', team };
  const isDrone = id === 'Seeding Drone' || id === 'Drone Swarm';
  let frame: FrameId = isDrone ? 'drone' : BUILD_FRAME[f.build] ?? 'standard';
  if (big && !isDrone) frame = f.build === 'heavy' ? 'bossBrute' : 'boss';
  const parts: DollSpec['parts'] = {};
  const back = INNATE_ARM[f.arms[0]], front = INNATE_ARM[f.arms[1]];
  if (back) parts.left_arm = back;
  if (front) parts.right_arm = front;
  if (f.legs === 'metal') { parts.left_leg = { maker: 'patchwork', tier: 0 }; parts.right_leg = { maker: 'patchwork', tier: 0 }; }
  return {
    frame, team, parts,
    look: { skin: f.skin, cloth: f.cloth, accent: f.accent, eyes: f.eyes, hair: f.hair },
    head: f.head, chest: f.chest, weapon: f.weapon,
  };
}

/** An enemy: its look, a bigger body for bosses, and the implants it carries over the top. */
export function foeDoll(unit: Character, kingParts?: string[]): DollSpec {
  if (unit.name === 'Patchwork King') return { frame: 'king', team: 'enemy', parts: partsOf(unit.carried ?? []), kingParts: kingParts ?? ['plate', 'hook', 'crown'], look: { accent: '#e8c060' } };
  const spec = lookOf(unit.name, 'enemy', !!unit.enrage);
  return { ...spec, parts: { ...spec.parts, ...partsOf(unit.carried ?? []) } };
}

/** An ally: its look and whatever implants it wears. */
export function allyDoll(id: string, unit?: Character): DollSpec {
  const spec = lookOf(id, 'ally');
  return { ...spec, parts: { ...spec.parts, ...partsOf(unit?.carried ?? []) } };
}

/** A doll for a portrait by id: 'host', an ally's id, or an enemy's name. */
export function portraitDoll(id: string, host: () => DollSpec, allyIds: string[]): DollSpec {
  if (id === 'host') return host();
  if (allyIds.includes(id)) return allyDoll(id);
  return foeDoll({ name: id } as Character);
}
