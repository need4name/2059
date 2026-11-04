// The hidden map: a chapter is a web of rooms the player learns by walking it.
// The data lives in content/map-*.json; this file answers what a room holds and
// which exits are open. Pure functions, no store.

import oceanMap from '../../content/map-indian-ocean.json';
import deltasMap from '../../content/map-deltas.json';
import hillsMap from '../../content/map-helix-hills.json';
import rainMap from '../../content/map-rain-machine.json';
import corridorMap from '../../content/map-corridor.json';
import { activeChapter, chapterById } from '../combat/chapters';

export interface Exit { dir: string; label?: string; hint: string; to: string; requires?: 'goals' }
export interface Look { text: string; goal?: string }
export interface Room { id: string; /** Where the room is drawn on the map (grid cell). */ at: [number, number]; name: string; text: string; threat?: number; market?: boolean; look?: Look; ally?: string; cache?: boolean; enemy?: string; quiet?: string; arena?: string[]; tileset?: string; exits: Exit[] }
/** A choice at the end of the last chapter, and what it leads to. */
export interface Ending { choice: string; text: string }
export interface ChapterMap { chapter: string; title: string; entry: string; end: string; ending: string; endTitle?: string; endings?: Ending[]; goals: string[]; rooms: Room[] }

/** Every chapter's map, by the map name in chapters.json. */
export const MAPS: Record<string, ChapterMap> = { 'indian-ocean': oceanMap as unknown as ChapterMap, deltas: deltasMap as unknown as ChapterMap, 'helix-hills': hillsMap as unknown as ChapterMap, 'rain-machine': rainMap as unknown as ChapterMap, corridor: corridorMap as unknown as ChapterMap };
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
  /** Rooms where hosts were lost, oldest first (kept across hosts). */
  fell?: string[];
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
export const newHost = (s: MapState): MapState => ({
  ...s, room: mapOf(s.chapter).entry, cameFrom: null, cleared: [], taken: [],
  fell: [...(s.fell ?? []).filter(id => id !== s.room), s.room],
});

/**
 * The one thing a found room shows on the map, most pressing first: a fight still
 * waiting for this host (boss, elite or regular), someone to link with, a cache to
 * search, something not yet looked at, the Grey Lane, or a fight already won.
 */
export type RoomMark = 'boss' | 'elite' | 'fight' | 'ally' | 'cache' | 'look' | 'market' | 'cleared';
/** One room as the map draws it: been in, or only glimpsed through a door (sealed if that door won't open yet). */
export interface MapRoom { id: string; at: [number, number]; seen: boolean; mark: RoomMark | null; ally?: string; fell: boolean; sealed: boolean }

export function roomMark(s: MapState, room: Room, met: string[] = []): RoomMark | null {
  if (hasFight(s, room)) return room.threat! % 10 === 0 ? 'boss' : room.threat! % 5 === 0 ? 'elite' : 'fight';
  if (room.ally && !met.includes(room.ally)) return 'ally';
  if (cacheReady(s, room)) return 'cache';
  if (room.look && !s.looked.includes(room.id)) return 'look';
  if (room.market) return 'market';
  if (room.threat !== undefined) return 'cleared';
  return null;
}

/** What the signal remembers of a chapter's map: rooms any host has been in (each with its mark),
 *  the rooms their doors lead to (unnamed and unexplored), and the ways between them.
 *  `met` is the allies already linked, so their rooms stop calling. */
export function mapView(s: MapState, met: string[] = []): { rooms: MapRoom[]; links: [string, string][] } {
  const m = mapOf(s.chapter);
  const byId = new Map(m.rooms.map(r => [r.id, r]));
  const seen = new Set(s.visited);
  const fell = new Set(s.fell ?? []);
  const shown = new Set(seen);
  const sealed = new Set<string>();
  const links: [string, string][] = [];
  for (const id of Array.from(seen)) for (const e of byId.get(id)?.exits ?? []) {
    shown.add(e.to);
    if (e.requires === 'goals' && !allGoals(s) && !seen.has(e.to)) sealed.add(e.to);
    if (!seen.has(e.to) || id < e.to) links.push([id, e.to]);
  }
  const rooms = Array.from(shown).map(id => {
    const r = byId.get(id)!;
    const mark = seen.has(id) ? roomMark(s, r, met) : null;
    return { id, at: r.at, seen: seen.has(id), mark, ...(mark === 'ally' ? { ally: r.ally } : {}), fell: fell.has(id), sealed: sealed.has(id) };
  });
  return { rooms, links };
}

/** Exits you can see from here, as the screen shows them. */
export const DIR_LABEL: Record<string, string> = { north: 'North', south: 'South', east: 'East', west: 'West', up: 'Up', down: 'Down', in: 'In', out: 'Out' };
