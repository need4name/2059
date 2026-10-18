import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { saveStorage } from '../save';
import * as M from '../engine/map';

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
  reset: () => void;
}

const pick = (s: MapStore): M.MapState => ({ room: s.room, cameFrom: s.cameFrom, cleared: s.cleared, visited: s.visited, goals: s.goals, looked: s.looked, taken: s.taken ?? [], done: s.done ?? false });

export const useMap = create<MapStore>()(persist((set, get) => ({
  ...M.newMapState(),
  go: (i) => set(M.go(pick(get()), i)),
  clearRoom: () => set(M.clearRoom(pick(get()))),
  look: () => { const r = M.look(pick(get())); set(r.state); return r.found; },
  takeCache: () => { const before = pick(get()); const after = M.takeCache(before); set(after); return after !== before; },
  finishChapter: () => set(M.finishChapter(pick(get()))),
  newHost: () => set(M.newHost(pick(get()))),
  reset: () => set(M.newMapState()),
}), { name: '2059-map', storage: createJSONStorage(() => saveStorage), version: 1, partialize: pick }));
