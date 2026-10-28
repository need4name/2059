import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { saveStorage } from '../save';
import * as M from '../engine/map';
import { setActiveChapter } from '../combat/chapters';

const CHAPTER_ONE = 'indian-ocean';

// Where the signal is on the chapter's hidden map. Survives death (a new host
// wakes at the entry); only a full save wipe clears it.
interface MapStore extends M.MapState {
  go: (exitIndex: number) => void;
  clearRoom: () => void;
  look: () => string | null;
  /** Mark this room's cache searched. Returns false if there was nothing to take. */
  takeCache: () => boolean;
  /** The chapter's last fight is won. */
  finishChapter: () => void;
  newHost: () => void;
  /** Wake in another chapter's entry room (a fresh map for it). */
  travel: (chapter: string) => void;
  reset: () => void;
}

const pick = (s: MapStore): M.MapState => ({ chapter: s.chapter, room: s.room, cameFrom: s.cameFrom, cleared: s.cleared, visited: s.visited, goals: s.goals, looked: s.looked, taken: s.taken ?? [], done: s.done ?? false });

export const useMap = create<MapStore>()(persist((set, get) => ({
  ...M.newMapState(CHAPTER_ONE),
  go: (i) => set(M.go(pick(get()), i)),
  clearRoom: () => set(M.clearRoom(pick(get()))),
  look: () => { const r = M.look(pick(get())); set(r.state); return r.found; },
  takeCache: () => { const before = pick(get()); const after = M.takeCache(before); set(after); return after !== before; },
  finishChapter: () => set(M.finishChapter(pick(get()))),
  newHost: () => set(M.newHost(pick(get()))),
  travel: (chapter) => { setActiveChapter(chapter); set(M.newMapState(chapter)); },
  reset: () => { setActiveChapter(M.newMapState(CHAPTER_ONE).chapter); set(M.newMapState(CHAPTER_ONE)); },
}), {
  name: '2059-map', storage: createJSONStorage(() => saveStorage), version: 2, partialize: pick,
  // Version 2 added the chapter (older saves were all in chapter one)
  migrate: (old: any, version) => (version < 2 ? { ...old, chapter: CHAPTER_ONE } : old),
  // The rest of the game reads the active chapter: keep it in step with the saved map
  onRehydrateStorage: () => (state) => { if (state) setActiveChapter(state.chapter ?? CHAPTER_ONE); },
}));
