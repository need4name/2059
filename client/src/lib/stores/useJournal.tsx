import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { saveStorage } from '../save';
import { firstSightOf } from '../combat/actions';

export interface JournalNote { id: string; text: string; about: string; host: number }

// What the signal has noticed about this world, across every host. Survives
// death; only a full save wipe clears it.
interface JournalState {
  seen: string[];
  notes: JournalNote[];
  /** The first time any host meets a kind of enemy, note the signal's impression. Returns it, or null if already seen. */
  sight: (enemy: string, host: number) => JournalNote | null;
  /** Note something the signal found (looked at in a room). Ignored if already noted. */
  addNote: (id: string, text: string, about: string, host: number) => void;
  reset: () => void;
}

export const useJournal = create<JournalState>()(persist((set, get) => ({
  seen: [],
  notes: [],
  sight: (enemy, host) => {
    if (get().seen.includes(enemy)) return null;
    const text = firstSightOf(enemy);
    set({ seen: [...get().seen, enemy] });
    if (!text) return null;
    const note = { id: `sight:${enemy}`, text, about: enemy, host };
    set({ notes: [...get().notes, note] });
    return note;
  },
  addNote: (id, text, about, host) => {
    if (get().notes.some(n => n.id === id)) return;
    set({ notes: [...get().notes, { id, text, about, host }] });
  },
  reset: () => set({ seen: [], notes: [] }),
}), { name: '2059-journal', storage: createJSONStorage(() => saveStorage), version: 1 }));
