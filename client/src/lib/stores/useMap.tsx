import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { saveStorage } from '../save';
import * as M from '../engine/map';
import * as E from '../engine/events';
import { setActiveChapter } from '../combat/chapters';
import type { Item } from '../combat/types';

const CHAPTER_ONE = 'indian-ocean';

// Where the signal is on the chapter's hidden map. Survives death (a new host
// wakes at the entry or a server reached before); only a full save wipe clears it.
interface MapStore extends M.MapState {
  go: (exitIndex: number) => void;
  clearRoom: () => void;
  look: () => string | null;
  /** Mark this room's cache searched. Returns false if there was nothing to take. */
  takeCache: () => boolean;
  /** The chapter's last fight is won. */
  finishChapter: () => void;
  /** A host is lost; `left` is the part that stays on its body. */
  newHost: (left?: Item | null, at?: string) => void;
  /** Rest at this room's server: this host's won fights come back. */
  rest: () => void;
  /** Take the part back off the last host's body, if it lies here. */
  takeCorpse: () => Item | null;
  /** This host used the room's event (and lost `health` max health to it). */
  spendEvent: (health?: number) => void;
  /** Wake in another chapter's entry room (a fresh map for it). */
  travel: (chapter: string) => void;
  reset: () => void;
}

const pick = (s: MapStore): M.MapState => ({ chapter: s.chapter, room: s.room, cameFrom: s.cameFrom, cleared: s.cleared, visited: s.visited, goals: s.goals, looked: s.looked, taken: s.taken ?? [], done: s.done ?? false, fell: s.fell ?? [], corpse: s.corpse ?? null, spent: s.spent ?? [], scar: s.scar ?? 0, lit: s.lit ?? [] });

export const useMap = create<MapStore>()(persist((set, get) => ({
  ...M.newMapState(CHAPTER_ONE),
  go: (i) => set(M.go(pick(get()), i)),
  clearRoom: () => set(M.clearRoom(pick(get()))),
  look: () => { const r = M.look(pick(get())); set(r.state); return r.found; },
  takeCache: () => { const before = pick(get()); const after = M.takeCache(before); set(after); return after !== before; },
  finishChapter: () => set(M.finishChapter(pick(get()))),
  newHost: (left, at) => set(M.newHost(pick(get()), left ?? null, at)),
  rest: () => set(M.rest(pick(get()))),
  spendEvent: (health = 0) => set(E.scar(E.spendEvent(pick(get())), health)),
  takeCorpse: () => { const r = M.takeCorpse(pick(get())); set(r.state); return r.item; },
  travel: (chapter) => { setActiveChapter(chapter); set(M.newMapState(chapter)); },
  reset: () => { setActiveChapter(M.newMapState(CHAPTER_ONE).chapter); set(M.newMapState(CHAPTER_ONE)); },
}), {
  name: '2059-map', storage: createJSONStorage(() => saveStorage), version: 2, partialize: pick,
  // Version 2 added the chapter (older saves were all in chapter one)
  migrate: (old: any, version) => (version < 2 ? { ...old, chapter: CHAPTER_ONE } : old),
  // The rest of the game reads the active chapter: keep it in step with the saved map
  onRehydrateStorage: () => (state) => { if (state) setActiveChapter(state.chapter ?? CHAPTER_ONE); },
}));
