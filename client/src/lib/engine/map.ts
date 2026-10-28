// The hidden map: a chapter is a web of rooms the player learns by walking it.
// The data lives in content/map-*.json; this file answers what a room holds and
// which exits are open. Pure functions, no store.

import oceanMap from '../../content/map-indian-ocean.json';
import deltasMap from '../../content/map-deltas.json';
import { activeChapter, chapterById } from '../combat/chapters';

export interface Exit { dir: string; label?: string; hint: string; to: string; requires?: 'goals' }
export interface Look { text: string; goal?: string }
export interface Room { id: string; name: string; text: string; threat?: number; market?: boolean; look?: Look; ally?: string; cache?: boolean; enemy?: string; quiet?: string; arena?: string[]; exits: Exit[] }
export interface ChapterMap { chapter: string; title: string; entry: string; end: string; ending: string; goals: string[]; rooms: Room[] }

/** Every chapter's map, by the map name in chapters.json. */
export const MAPS: Record<string, ChapterMap> = { 'indian-ocean': oceanMap as ChapterMap, deltas: deltasMap as ChapterMap };
const index = new Map(Object.entries(MAPS).map(([k, m]) => [k, new Map(m.rooms.map(r => [r.id, r]))]));
/** The active chapter's map. */
export const chapterMap = (): ChapterMap => MAPS[activeChapter().map];
export const mapOf = (chapterId: string): ChapterMap => MAPS[chapterById(chapterId).map];
export const roomById = (id: string): Room => { const rooms = index.get(activeChapter().map)!; return rooms.get(id) ?? rooms.get(chapterMap().entry)!; };

/** Where the player stands and what they've done. */
export interface MapState {
  /** Which chapter this map is for (chapters.json id). */
  chapter: string;
  room: string;
  /** The room they came in from (an uncleared fight only lets you back out that way). */
  cameFrom: string | null;
  /** Fight rooms this host has cleared. A new host finds them full again. */
  cleared: string[];
  /** Rooms any host has been in. The signal remembers them. */
  visited: string[];
  /** Hidden goals found (kept across hosts). */
  goals: string[];
  /** Things looked at (kept across hosts). */
  looked: string[];
  /** Supply caches already searched by this host. */
  taken: string[];
  /** The chapter's last fight is won (kept across hosts; the end room stays quiet). */
  done?: boolean;
}

export const newMapState = (chapter = activeChapter().id): MapState => {
  const entry = mapOf(chapter).entry;
  return { chapter, room: entry, cameFrom: null, cleared: [], visited: [entry], goals: [], looked: [], taken: [] };
};

/** A room with a fight nobody has cleared yet this host. */
export const hasFight = (s: MapState, room = roomById(s.room)) =>
  room.threat !== undefined && !s.cleared.includes(room.id) && !(s.done && room.id === mapOf(s.chapter).end);
/** What the room says: the end room reads differently once the chapter is done. */
export const roomText = (s: MapState, room = roomById(s.room)) => (s.done && room.quiet ? room.quiet : room.text);
/** Is this the fight that ends the chapter? */
export const isChapterEnd = (s: MapState) => s.room === mapOf(s.chapter).end && !s.done;
export const finishChapter = (s: MapState): MapState => ({ ...s, done: true });
export const allGoals = (s: MapState) => mapOf(s.chapter).goals.every(g => s.goals.includes(g));

export type ExitState = 'open' | 'blocked' | 'sealed';
/** Can the player take this exit? Enemies hold every way but the one you came in by; sealed ways need every goal. */
export function exitState(s: MapState, exit: Exit): ExitState {
  if (exit.requires === 'goals' && !allGoals(s)) return 'sealed';
  if (hasFight(s) && exit.to !== s.cameFrom) return 'blocked';
  return 'open';
}

export function go(s: MapState, exitIndex: number): MapState {
  const room = roomById(s.room);
  const exit = room.exits[exitIndex];
  if (!exit || exitState(s, exit) !== 'open') return s;
  return { ...s, room: exit.to, cameFrom: room.id, visited: s.visited.includes(exit.to) ? s.visited : [...s.visited, exit.to] };
}

export const clearRoom = (s: MapState): MapState => (s.cleared.includes(s.room) ? s : { ...s, cleared: [...s.cleared, s.room] });

/** Look at the thing in the room. Returns the new state and whether it was a goal found just now. */
export function look(s: MapState): { state: MapState; found: string | null } {
  const room = roomById(s.room);
  if (!room.look || hasFight(s)) return { state: s, found: null };
  const looked = s.looked.includes(room.id) ? s.looked : [...s.looked, room.id];
  const goal = room.look.goal;
  const found = goal && !s.goals.includes(goal) ? goal : null;
  return { state: { ...s, looked, goals: found ? [...s.goals, found] : s.goals }, found };
}

/** A supply cache this host can still search (once the room is clear). */
export const cacheReady = (s: MapState, room = roomById(s.room)) => !!room.cache && !hasFight(s, room) && !(s.taken ?? []).includes(room.id);
export const takeCache = (s: MapState): MapState => (cacheReady(s) ? { ...s, taken: [...(s.taken ?? []), s.room] } : s);

/** A new host wakes at the entry: fights refill, caches restock, memory and goals stay. */
export const newHost = (s: MapState): MapState => ({ ...s, room: mapOf(s.chapter).entry, cameFrom: null, cleared: [], taken: [] });

/** Exits you can see from here, as the screen shows them. */
export const DIR_LABEL: Record<string, string> = { north: 'North', south: 'South', east: 'East', west: 'West', up: 'Up', down: 'Down', in: 'In', out: 'Out' };
