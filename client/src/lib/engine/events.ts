// Room events: a small choice waiting in a room once its fight is won (content/events.json,
// placed by `event` on a map room). Each host gets each event once. Pure functions: the
// combat store rolls the dice and moves the items.

import data from '../../content/events.json';
import type { Item, ItemRarity } from '../combat/types';
import { type MapState, type Room, roomById, hasFight } from './map';

export interface EventCost { credits?: number; health?: number; part?: boolean }
export interface EventOutcome { implant?: ItemRarity | 'better'; stims?: number; credits?: number; health?: number; text: string }
export interface EventChoice { label: string; cost?: EventCost; odds?: number; win: EventOutcome; lose?: EventOutcome }
export interface RoomEvent { text: string; choices: EventChoice[] }

export const EVENTS = (data as { events: Record<string, RoomEvent> }).events;
export const RARITY_ORDER: ItemRarity[] = ['common', 'uncommon', 'rare', 'epic', 'legendary'];

/** The event waiting in this room for this host, if its fight is won and it hasn't been used. */
export function eventHere(s: MapState, room: Room = roomById(s.room)): RoomEvent | null {
  if (!room.event || hasFight(s, room) || (s.spent ?? []).includes(room.id)) return null;
  return EVENTS[room.event] ?? null;
}

/** This host has used the room's event. */
export const spendEvent = (s: MapState): MapState => ((s.spent ?? []).includes(s.room) ? s : { ...s, spent: [...(s.spent ?? []), s.room] });

/** Max health lost this host (events that cut or bite). */
export const scar = (s: MapState, health: number): MapState => ({ ...s, scar: (s.scar ?? 0) + health });

/** The part a "give a part" choice takes: the weakest implant you carry, worn ones last. */
export function partToGive(carried: Item[], worn: Item[], power: (i: Item) => number): Item | null {
  const pick = (list: Item[]) => list.filter(i => i.type === 'augmentation' && !i.signature).sort((a, b) => power(a) - power(b))[0] ?? null;
  return pick(carried) ?? pick(worn);
}

/** What stops a choice: the reason in plain words, or null if you can take it. */
export function cantChoose(choice: EventChoice, credits: number, hasPart: boolean): string | null {
  if (choice.cost?.credits && credits < choice.cost.credits) return 'Not enough credits';
  if (choice.cost?.part && !hasPart) return 'Nothing to give';
  return null;
}

/** One grade better than a rarity (legendary stays legendary). */
export const gradeUp = (r: ItemRarity): ItemRarity => RARITY_ORDER[Math.min(RARITY_ORDER.length - 1, RARITY_ORDER.indexOf(r) + 1)];
