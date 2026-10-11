// Lets the game's stores run in Node: in-memory storage and instant timers.
// Import this before any store.
const mem = new Map<string, string>();
(globalThis as any).localStorage = {
  getItem: (k: string) => mem.get(k) ?? null,
  setItem: (k: string, v: string) => { mem.set(k, v); },
  removeItem: (k: string) => { mem.delete(k); },
  clear: () => mem.clear(),
};

const queue: { t: number; fn: () => void }[] = [];
let now = 0;
(globalThis as any).setTimeout = (fn: () => void, ms = 0) => { queue.push({ t: now + ms, fn }); queue.sort((a, b) => a.t - b.t); return 0; };

/** Runs every queued timer, in time order, until none are left. */
export function drainTimers() {
  let n = 0;
  while (queue.length && n++ < 10000) { const x = queue.shift()!; now = x.t; x.fn(); }
}
