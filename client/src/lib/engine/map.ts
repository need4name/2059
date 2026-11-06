// The hidden map: a chapter is a web of rooms the player learns by walking it.
// The data lives in content/map-*.json; this file answers what a room holds and
// which exits are open. Pure functions, no store.

import oceanMap from '../../content/map-indian-ocean.json';
import deltasMap from '../../content/map-deltas.json';
import hillsMap from '../../content/map-helix-hills.json';
import rainMap from '../../content/map-rain-machine.json';
import type { Item } from '../combat/types';
import corridorMap from '../../content/map-corridor.json';
import { activeChapter, chapterById } from '../combat/chapters';

export interface Exit { dir: string; label?: string; hint: string; to: string; requires?: 'goals' }
export interface Look { text: string; goal?: string }
export interface Room { id: string; /** Where the room is drawn on the map (grid cell). */ at: [number, number]; name: string; text: string; threat?: number; market?: boolean; look?: Look; ally?: string; cache?: boolean; /** A boss's room: once the boss is beaten it stays down for every host, and this server (what you see of it) wakes up: later hosts can wake here, a host can rest, and the boss can be called back. */ server?: string; /** A room event (content/events.json), there once the fight is won. */ event?: string; enemy?: string; quiet?: string; arena?: string[]; tileset?: string; exits: Exit[] }
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
  /** The last lost host's body and the best part still fitted to it, where it fell.
   *  The next host can take it back; losing another host first loses it for good. */
  corpse?: { room: string; item: Item } | null;
  /** Rooms whose event this host has used. A new host finds them waiting again. */
  spent?: string[];
  /** Max health this host has lost to events. */
  scar?: number;
  /** Health this host is missing: it carries from fight to fight. Resting at a server or a new host clears it. */
  hurt?: number;
  /** Server rooms any host has reached: a new host can wake in one (kept across hosts). */
  lit?: string[];
  /** Boss rooms beaten (kept across hosts): the boss stays down unless called back. */
  beaten?: string[];
  /** Beaten bosses this host has called back to fight again. */
  recalled?: string[];
}

export const newMapState = (chapter = activeChapter().id): MapState => {
  const entry = mapOf(chapter).entry;
  // Every field, so a store that merges this in (a new game, the next chapter) forgets the old map
  return { chapter, room: entry, cameFrom: null, cleared: [], visited: [entry], goals: [], looked: [], taken: [], done: false, fell: [], corpse: null, spent: [], scar: 0, hurt: 0, lit: [], beaten: [], recalled: [] };
};

/** A room with a fight nobody has cleared yet this host. */
export const hasFight = (s: MapState, room = roomById(s.room)) =>
  room.threat !== undefined && !s.cleared.includes(room.id) && !(s.done && room.id === mapOf(s.chapter).end)
  && !((s.beaten ?? []).includes(room.id) && !(s.recalled ?? []).includes(room.id));
/** A beaten boss's room, its server awake. */
export const isServer = (s: MapState, room = roomById(s.room)) => !!room.server && (s.beaten ?? []).includes(room.id);
/** What the room says: the end room once the chapter is done, and a boss's room once it's beaten (and not called back), read differently. */
export const roomText = (s: MapState, room = roomById(s.room)) =>
  (room.quiet && ((s.done && room.id === mapOf(s.chapter).end) || (isServer(s, room) && !hasFight(s, room))) ? room.quiet : room.text);
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
  const lit = s.lit ?? [];
  return { ...s, room: exit.to, cameFrom: room.id, visited: s.visited.includes(exit.to) ? s.visited : [...s.visited, exit.to],
    lit: isServer(s, roomById(exit.to)) && !lit.includes(exit.to) ? [...lit, exit.to] : lit };
}

/** Rooms a new host can wake in: the chapter's entry, then every server reached, in the order found. */
export const wakePlaces = (s: MapState): string[] => {
  const m = mapOf(s.chapter);
  return [m.entry, ...(s.lit ?? []).filter(id => id !== m.entry && m.rooms.some(r => r.id === id && r.server) && (s.beaten ?? []).includes(id))];
};
/** A server this host can rest at (in this room, and nothing here is fighting you). */
export const canRest = (s: MapState, room = roomById(s.room)) => isServer(s, room) && !hasFight(s, room);
/** Rest at the server: you heal, and every fight this host has won comes back (beaten bosses stay down). Caches and events stay used. */
export const rest = (s: MapState): MapState => (canRest(s) ? { ...s, cleared: [], hurt: 0, recalled: [] } : s);
/** Call the beaten boss here back for this host to fight again (for its drop). */
export const recall = (s: MapState): MapState =>
  (canRest(s) ? { ...s, recalled: [...(s.recalled ?? []), s.room], cleared: s.cleared.filter(id => id !== s.room) } : s);

/** Share of max health a host gets back after winning a fight (catching its breath). */
export const WIN_RECOVER = 0.3;
/** What a host is still missing after a won fight that left it on `hp` of `max`. */
export const hurtAfterWin = (hp: number, max: number) => Math.max(0, max - hp - Math.round(max * WIN_RECOVER));
/** The health a host starts its next fight on. */
export const healthNow = (s: MapState, max: number) => Math.max(1, max - (s.hurt ?? 0));

export const clearRoom = (s: MapState): MapState => {
  if (s.cleared.includes(s.room)) return s;
  const next = { ...s, cleared: [...s.cleared, s.room] };
  // A boss beaten for the first time stays down, and its server wakes (a place to wake, rest and call it back)
  if (!roomById(s.room).server || (s.beaten ?? []).includes(s.room)) return next;
  return { ...next, beaten: [...(s.beaten ?? []), s.room], lit: [...(s.lit ?? []).filter(id => id !== s.room), s.room] };
};

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

/** A new host wakes at the entry (or a server reached before, `at`): fights refill, caches restock, memory and goals stay. */
export const newHost = (s: MapState, left: Item | null = null, at?: string): MapState => ({
  ...s, room: at && wakePlaces(s).includes(at) ? at : mapOf(s.chapter).entry, cameFrom: null, cleared: [], taken: [], spent: [], scar: 0, hurt: 0, recalled: [],
  fell: [...(s.fell ?? []).filter(id => id !== s.room), s.room],
  corpse: left ? { room: s.room, item: left } : null,
});

/** The last host's body lies in this room, and nothing here is fighting you for it. */
export const corpseHere = (s: MapState, room = roomById(s.room)) => !!s.corpse && s.corpse.room === room.id && !hasFight(s, room);
/** Take the part back off the last host's body. */
export function takeCorpse(s: MapState): { state: MapState; item: Item | null } {
  if (!corpseHere(s)) return { state: s, item: null };
  return { state: { ...s, corpse: null }, item: s.corpse!.item };
}

/**
 * The one thing a found room shows on the map, most pressing first: a fight still
 * waiting for this host (boss, elite or regular), someone to link with, a cache to
 * search, someone with an offer (an event this host hasn't used), something not yet looked at, a server, the Grey Lane, or a fight already won.
 */
export type RoomMark = 'boss' | 'elite' | 'fight' | 'ally' | 'cache' | 'event' | 'look' | 'server' | 'market' | 'cleared';
/** One room as the map draws it: been in, or only glimpsed through a door (sealed if that door won't open yet). */
export interface MapRoom { id: string; at: [number, number]; /** Height in levels (up exits climb one). */ z: number; seen: boolean; mark: RoomMark | null; ally?: string; fell: boolean; sealed: boolean; /** The last host's body (and its part) waits here. */ corpse: boolean }

export function roomMark(s: MapState, room: Room, met: string[] = []): RoomMark | null {
  if (hasFight(s, room)) return room.threat! % 10 === 0 ? 'boss' : room.threat! % 5 === 0 ? 'elite' : 'fight';
  if (room.ally && !met.includes(room.ally)) return 'ally';
  if (cacheReady(s, room)) return 'cache';
  if (room.event && !(s.spent ?? []).includes(room.id)) return 'event';
  if (room.look && !s.looked.includes(room.id)) return 'look';
  if (isServer(s, room)) return 'server';
  if (room.market) return 'market';
  if (room.threat !== undefined) return 'cleared';
  return null;
}

/** What the signal remembers of a chapter's map: rooms any host has been in (each with its mark),
 *  the rooms their doors lead to (unnamed and unexplored), and the ways between them.
 *  `met` is the allies already linked, so their rooms stop calling. */
export function mapView(s: MapState, met: string[] = []): { rooms: MapRoom[]; links: [string, string][] } {
  const m = mapOf(s.chapter);
  const heights = roomHeights(m);
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
    return { id, at: r.at, z: heights[id] ?? 0, seen: seen.has(id), mark, ...(mark === 'ally' ? { ally: r.ally } : {}), fell: fell.has(id), sealed: sealed.has(id), corpse: s.corpse?.room === id };
  });
  return { rooms, links };
}

/**
 * How high each room sits, for the drawn map: up exits climb a level, down exits
 * drop one, every other way stays level. Where loops of exits don't quite agree,
 * the heights that fit every exit best win (a least-squares settle, the entry at
 * 0), so a disagreement shows as a gentle slope rather than a wrong way round.
 */
const heightCache = new Map<string, Record<string, number>>();
export function roomHeights(m: ChapterMap): Record<string, number> {
  const hit = heightCache.get(m.chapter);
  if (hit) return hit;
  const rise = (dir: string) => (dir === 'up' ? 1 : dir === 'down' ? -1 : 0);
  const z: Record<string, number> = Object.fromEntries(m.rooms.map(r => [r.id, 0]));
  // Start from a walk outward, then settle each room toward what its exits say
  const queue = [m.entry], seen = new Set(queue);
  while (queue.length) {
    const a = queue.shift()!;
    for (const e of m.rooms.find(r => r.id === a)!.exits) if (!seen.has(e.to)) { seen.add(e.to); z[e.to] = z[a] + rise(e.dir); queue.push(e.to); }
  }
  const links = m.rooms.flatMap(r => r.exits.map(e => ({ a: r.id, b: e.to, d: rise(e.dir) })));
  for (let pass = 0; pass < 300; pass++) {
    for (const r of m.rooms) {
      if (r.id === m.entry) continue;
      const mine = links.filter(l => l.a === r.id || l.b === r.id);
      if (!mine.length) continue;
      z[r.id] = mine.reduce((n, l) => n + (l.a === r.id ? z[l.b] - l.d : z[l.a] + l.d), 0) / mine.length;
    }
  }
  const out = Object.fromEntries(Object.entries(z).map(([k, v]) => [k, Math.round(v * 100) / 100]));
  heightCache.set(m.chapter, out);
  return out;
}

/** Exits you can see from here, as the screen shows them. */
export const DIR_LABEL: Record<string, string> = { north: 'North', south: 'South', east: 'East', west: 'West', up: 'Up', down: 'Down', in: 'In', out: 'Out' };
