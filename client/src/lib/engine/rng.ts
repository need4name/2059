// Seeded random numbers for every roll that affects play (damage, crits, enemy
// choices, arenas, loot, market stock). The same seed and the same choices give
// the same run, so a bug can be replayed and the balance simulator is repeatable.
// Unique ids and purely visual effects keep using Math.random.

let state = (Date.now() ^ 0x9e3779b9) >>> 0;

/** A number in [0, 1), like Math.random, from the seeded stream (mulberry32). */
export function random(): number {
  state = (state + 0x6d2b79f5) >>> 0;
  let t = state;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

export function seedRandom(seed: number): void { state = seed >>> 0; }
export function getRandomState(): number { return state; }

/** Mixes numbers into one seed, e.g. a run seed and a fight number. */
export function mixSeed(...parts: number[]): number {
  let h = 0x811c9dc5;
  for (const p of parts) {
    h = Math.imul(h ^ (p >>> 0), 0x01000193) >>> 0;
    h = Math.imul(h ^ (h >>> 13), 0x5bd1e995) >>> 0;
  }
  return h >>> 0;
}

/** Turns text (a seed someone typed, a stock key) into a seed number. */
export function hashSeed(text: string): number {
  return mixSeed(...Array.from(text, c => c.charCodeAt(0)));
}

/** A fresh seed for a new run. */
export function newRunSeed(): number { return (Math.random() * 4294967296) >>> 0; }

export function pick<T>(list: readonly T[]): T { return list[Math.floor(random() * list.length)]; }
