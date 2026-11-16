import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { saveStorage } from '../save';
import type { Difficulty } from '../slots';
import type { ChallengeId } from '../challenges';
import { wakeNow, type Clock, type Wake } from '../engine/clock';

// The run this save is: its difficulty and challenges, fixed when the signal first wakes
// (engine/difficulty.ts, lib/challenges.ts).
interface RunState {
  difficulty: Difficulty;
  challenges: ChallengeId[];
  begin: (d: Difficulty, challenges?: ChallengeId[]) => void;
}

export const useRun = create<RunState>()(persist((set) => ({
  difficulty: 'normal',
  challenges: [],
  begin: (difficulty, challenges = []) => set({ difficulty, challenges }),
}), { name: '2059-run', storage: createJSONStorage(() => saveStorage), version: 2, migrate: (old: any) => ({ difficulty: old?.difficulty ?? 'normal', challenges: old?.challenges ?? [] }) }));

/** Is this challenge on for the run? */
export const challengeOn = (id: ChallengeId) => useRun.getState().challenges.includes(id);

/** What the host awake now woke to, as the world shows it: Bad weather (a challenge) makes it always rain, always night. */
export function seenWake(c: Clock | null | undefined): Wake {
  const w = wakeNow(c);
  return challengeOn('weather') ? { ...w, weather: 'rain', dayPart: 'night' } : w;
}
