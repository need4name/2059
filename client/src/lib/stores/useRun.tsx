import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { saveStorage } from '../save';
import type { Difficulty } from '../slots';

// The run this save is: its difficulty, fixed when the signal first wakes (engine/difficulty.ts).
interface RunState {
  difficulty: Difficulty;
  begin: (d: Difficulty) => void;
}

export const useRun = create<RunState>()(persist((set) => ({
  difficulty: 'normal',
  begin: (difficulty) => set({ difficulty }),
}), { name: '2059-run', storage: createJSONStorage(() => saveStorage), version: 1 }));
