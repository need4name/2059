// One save file for the whole game. Every store that persists writes its part
// into a single versioned record under SAVE_KEY, so a save can be exported as
// text, imported on another device, and migrated as the game changes.
import type { StateStorage } from 'zustand/middleware';
import { alliesUnlockedBy } from './combat/allies';
import { dailyDay, DAILY_SAVE_KEY } from './daily';
import upgrades from '../content/upgrades.json';

export const SAVE_KEY = '2059-save';
/** The slot this page reads and writes: the player's own game, or today's run (its own slot, see daily.ts). */
const slot = () => (dailyDay ? DAILY_SAVE_KEY : SAVE_KEY);
/** Bump this and add a step to MIGRATIONS whenever the save's shape changes. */
export const SAVE_VERSION = 19;
const EXPORT_PREFIX = '2059SAVE:';

/** The stores that make up a save (each persists under its own name). */
export const SAVE_PARTS = ['2059-combat', '2059-inventory', '2059-loadout', '2059-trees', '2059-market', '2059-playi', '2059-allies', '2059-journal', '2059-map', '2059-strain', '2059-firmware', '2059-stats'] as const;

export interface SaveFile {
  game: '2059';
  version: number;
  savedAt: string;
  /** Each store's own persisted JSON, by store name. */
  parts: Record<string, string>;
}

/** MIGRATIONS[n] upgrades a version-n save to version n + 1. */
const MIGRATIONS: Record<number, (save: SaveFile) => SaveFile> = {
  // 1 -> 2: allies are met in rooms on the map instead of unlocked by best level cleared
  1: (save) => {
    const raw = save.parts['2059-allies'];
    if (!raw) return save;
    try {
      const part = JSON.parse(raw);
      const best = part?.state?.bestCleared ?? 0;
      const met = alliesUnlockedBy(best);
      const { bestCleared: _old, ...rest } = part.state ?? {};
      return { ...save, parts: { ...save.parts, '2059-allies': JSON.stringify({ ...part, state: { ...rest, met }, version: 2 }) } };
    } catch { return save; }
  },
  // 2 -> 3: allies wear implants (gear starts empty)
  2: (save) => {
    const raw = save.parts['2059-allies'];
    if (!raw) return save;
    try {
      const part = JSON.parse(raw);
      return { ...save, parts: { ...save.parts, '2059-allies': JSON.stringify({ ...part, state: { gear: {}, ...part.state }, version: 3 }) } };
    } catch { return save; }
  },
  // 3 -> 4: the map knows which chapter it's for (every older save is in chapter one)
  3: (save) => {
    const raw = save.parts['2059-map'];
    if (!raw) return save;
    try {
      const part = JSON.parse(raw);
      return { ...save, parts: { ...save.parts, '2059-map': JSON.stringify({ ...part, state: { chapter: 'indian-ocean', ...part.state }, version: 2 }) } };
    } catch { return save; }
  },
  // 4 -> 5: the signal remembers the implants its last body wore (nothing yet)
  4: (save) => {
    const raw = save.parts['2059-playi'];
    if (!raw) return save;
    try {
      const part = JSON.parse(raw);
      return { ...save, parts: { ...save.parts, '2059-playi': JSON.stringify({ ...part, state: { lastBody: [], ...part.state }, version: 2 }) } };
    } catch { return save; }
  },
  // 5 -> 6: the map remembers the last lost host's body and its part (none yet)
  5: (save) => {
    const raw = save.parts['2059-map'];
    if (!raw) return save;
    try {
      const part = JSON.parse(raw);
      return { ...save, parts: { ...save.parts, '2059-map': JSON.stringify({ ...part, state: { corpse: null, ...part.state } }) } };
    } catch { return save; }
  },  // 6 -> 7: room events: which ones this host has used, and the max health they cost it
  6: (save) => {
    const raw = save.parts['2059-map'];
    if (!raw) return save;
    try {
      const part = JSON.parse(raw);
      return { ...save, parts: { ...save.parts, '2059-map': JSON.stringify({ ...part, state: { spent: [], scar: 0, ...part.state } }) } };
    } catch { return save; }
  },
  // 7 -> 8: strain joins the save as its own part (older saves have none: locked, nothing on)
  7: (save) => save,
  // 8 -> 9: implant upgrades became forked trees; the trees store gives back every point spent on the old ones
  8: (save) => save,
  // 9 -> 10: every implant grows its own tree; the trees store gives back every point spent on the shared one
  9: (save) => save,
  // 10 -> 11: firmware grows over hosts and joins the save as its own part (older saves start it at level 1)
  10: (save) => save,
  // 11 -> 12: the Self page's run numbers join the save as their own part (they start from zero)
  11: (save) => save,
  // 12 -> 13: firmware forks (none taken: the first side) and Splice's spliced pairs (none); the stores fill both in
  12: (save) => save,
  // 13 -> 14: the play-i tree's Set point (cold or warm start; older saves start cold) and the Wretch firmware; the stores fill both in
  13: (save) => save,
  // 14 -> 15: hints are gone, and the part that remembered which ones you'd seen with them
  14: (save) => { const { ['2059-tutorial']: _gone, ...parts } = save.parts; return { ...save, parts }; },
  // 15 -> 16: guns are built from parts now; the old fixed guns are sold back at what they cost
  15: (save) => {
    const raw = save.parts['2059-inventory'];
    if (!raw) return save;
    try {
      const part = JSON.parse(raw);
      const st = part.state ?? {};
      const old = (st.ownedWeapons ?? []) as { price?: number; gunParts?: unknown }[];
      const refund = old.filter(w => !w.gunParts).reduce((n, w) => n + (w.price ?? 0), 0);
      const kept = old.filter(w => w.gunParts);
      const eq = st.equippedWeapon && st.equippedWeapon.gunParts ? st.equippedWeapon : null;
      return { ...save, parts: { ...save.parts, '2059-inventory': JSON.stringify({ ...part, state: { ...st, gold: (st.gold ?? 0) + refund, ownedWeapons: kept, equippedWeapon: eq } }) } };
    } catch { return save; }
  },
  // 16 -> 17: chapter one ends at the King. Rooms past him are gone: a host in one wakes at the dock (or the
  // weigh-station's server), and a King already beaten finishes the chapter. The weigh-station holds the server now.
  16: (save) => {
    const raw = save.parts['2059-map'];
    if (!raw) return save;
    try {
      const part = JSON.parse(raw);
      const st = part.state ?? {};
      if ((st.chapter ?? 'indian-ocean') !== 'indian-ocean') return save;
      const kept = new Set(CHAPTER_ONE_ROOMS);
      const only = (xs: unknown) => (Array.isArray(xs) ? xs.filter((x: string) => kept.has(x)) : []);
      const kingDown = (st.beaten ?? []).includes('throne') || !!st.done;
      const beaten = kingDown ? ['weigh'] : [];
      const next = {
        ...st,
        room: kept.has(st.room) ? st.room : kingDown ? 'weigh' : 'dock', cameFrom: kept.has(st.cameFrom) ? st.cameFrom : null,
        cleared: only(st.cleared), visited: only(st.visited), looked: only(st.looked), taken: only(st.taken), fell: only(st.fell), spent: only(st.spent),
        goals: (st.goals ?? []).filter((g: string) => g === 'slab' || g === 'manifest'),
        corpse: st.corpse && !kept.has(st.corpse.room) ? { ...st.corpse, room: 'dock' } : st.corpse ?? null,
        done: kingDown, beaten, lit: beaten, recalled: [],
      };
      return { ...save, parts: { ...save.parts, '2059-map': JSON.stringify({ ...part, state: next }) } };
    } catch { return save; }
  },
  // 17 -> 18: nothing is looked at any more (goals are found by clearing their rooms): the map forgets what was looked at
  // ...guns don't grow any more: points spent on a gun's tree come back; and implants already held count as seen
  17: (save) => {
    let out = save;
    const raw = save.parts['2059-map'];
    if (raw) try { const part = JSON.parse(raw); const { looked: _gone, ...st } = part.state ?? {}; out = { ...out, parts: { ...out.parts, '2059-map': JSON.stringify({ ...part, state: st }) } }; } catch { /* keep it */ }
    // Implants an old save already holds count as seen (only what comes after is new)
    if (out.parts['2059-inventory']) try {
      const part = JSON.parse(out.parts['2059-inventory']); const st = part.state ?? {};
      out = { ...out, parts: { ...out.parts, '2059-inventory': JSON.stringify({ ...part, state: { ...st, seen: (st.items ?? []).map((i: { id: string }) => i.id) } }) } };
    } catch { /* keep it */ }
    const inv = out.parts['2059-inventory'], trees = out.parts['2059-trees'];
    if (inv && trees) try {
      const i = JSON.parse(inv).state ?? {}, t = JSON.parse(trees);
      const guns = new Set([...(i.ownedWeapons ?? []), ...(i.equippedWeapon ? [i.equippedWeapon] : [])].filter((w: { gunParts?: unknown }) => w.gunParts).map((w: { id: string }) => w.id));
      const owned = { ...(t.state?.owned ?? {}) } as Record<string, string[]>;
      let back = 0;
      for (const id of Object.keys(owned)) if (guns.has(id)) { back += owned[id].reduce((n, _x, k) => n + (GUN_TREE_COSTS[Math.min(GUN_TREE_COSTS.length - 1, k)] ?? 1), 0); delete owned[id]; }
      if (back) out = { ...out, parts: { ...out.parts, '2059-trees': JSON.stringify({ ...t, state: { ...t.state, owned, availablePoints: (t.state?.availablePoints ?? 0) + back } }) } };
    } catch { /* keep it */ }
    return out;
  },
  // 18 -> 19: firmware a save had already earned under the new rules but never got (it beat a boss before
  // the boss held firmware): past the weigh-station opens the Enforcer, a beaten King the Operative
  18: (save) => {
    const raw = save.parts['2059-map'];
    if (!raw) return save;
    try {
      const st = JSON.parse(raw).state ?? {};
      const past = ['lanes', 'barge', 'cables', 'nets', 'generator', 'approach', 'throne'];
      const inOne = (st.chapter ?? 'indian-ocean') === 'indian-ocean';
      const enforcer = !inOne || (st.beaten ?? []).includes('weigh') || (st.visited ?? []).some((r: string) => past.includes(r));
      const operative = !inOne || !!st.done;
      const earned = [...(enforcer ? ['melee'] : []), ...(operative ? ['ranged'] : [])];
      if (!earned.length) return save;
      const fw = save.parts['2059-firmware'] ? JSON.parse(save.parts['2059-firmware']) : { state: { xp: {}, opened: [], fresh: [], forks: {} }, version: 1 };
      const f = fw.state ?? {};
      const add = earned.filter(c => !(f.opened ?? []).includes(c));
      if (!add.length) return save;
      return { ...save, parts: { ...save.parts, '2059-firmware': JSON.stringify({ ...fw, state: { ...f, opened: [...(f.opened ?? []), ...add], fresh: [...(f.fresh ?? []), ...add] } }) } };
    } catch { return save; }
  },
};

/** What each step down an upgrade tree cost (content/upgrades.json `costs`), for giving gun points back (save step 17). */
const GUN_TREE_COSTS: number[] = (upgrades as { costs: number[] }).costs;

/** Chapter one's rooms since it ends at the King (save step 16). */
const CHAPTER_ONE_ROOMS = ['dock', 'deck', 'bottles', 'walkway', 'shacks', 'stall', 'hull', 'bilge', 'pumps', 'weigh', 'lanes', 'barge', 'cables', 'nets', 'generator', 'approach', 'throne'];

function storage(): Storage | null {
  try { return typeof localStorage === 'undefined' ? null : localStorage; } catch { return null; }
}

const emptySave = (): SaveFile => ({ game: '2059', version: SAVE_VERSION, savedAt: new Date().toISOString(), parts: {} });

function migrate(save: SaveFile): SaveFile {
  let s = save;
  while (s.version < SAVE_VERSION) {
    const step = MIGRATIONS[s.version];
    if (!step) throw new Error(`No way to upgrade a version ${s.version} save`);
    s = { ...step(s), version: s.version + 1 };
  }
  return s;
}

let cache: SaveFile | null = null;

/** Reads the save, moving an older six-key save into the single file the first time. */
export function readSave(): SaveFile {
  if (cache) return cache;
  const ls = storage();
  let save = emptySave();
  const raw = ls?.getItem(slot());
  if (raw) {
    try { save = migrate(JSON.parse(raw) as SaveFile); } catch { save = emptySave(); }
  } else if (ls && !dailyDay) {
    // Before the single save file, each store had its own key
    for (const part of SAVE_PARTS) {
      const old = ls.getItem(part);
      if (old !== null) save.parts[part] = old;
    }
    if (Object.keys(save.parts).length) {
      ls.setItem(slot(), JSON.stringify(save));
      for (const part of SAVE_PARTS) ls.removeItem(part);
    }
  }
  cache = save;
  return save;
}

function writeSave(save: SaveFile) {
  cache = { ...save, savedAt: new Date().toISOString() };
  storage()?.setItem(slot(), JSON.stringify(cache));
}

/** Storage for zustand's persist: every store reads and writes its part of the one save. */
export const saveStorage: StateStorage = {
  getItem: (name) => readSave().parts[name] ?? null,
  setItem: (name, value) => {
    const save = readSave();
    if (save.parts[name] === value) return;
    writeSave({ ...save, parts: { ...save.parts, [name]: value } });
  },
  removeItem: (name) => {
    const save = readSave();
    const parts = { ...save.parts };
    delete parts[name];
    writeSave({ ...save, parts });
  },
};

/** The whole save as a line of text the player can copy somewhere safe. */
export function exportSave(): string {
  const json = JSON.stringify(readSave());
  return EXPORT_PREFIX + btoa(unescape(encodeURIComponent(json)));
}

/** Checks and stores a pasted save. The page must reload afterwards to use it. */
export function importSave(text: string): { ok: true } | { ok: false; reason: string } {
  const body = text.trim();
  if (!body.startsWith(EXPORT_PREFIX)) return { ok: false, reason: "That doesn't look like a 2059 save. It should start with 2059SAVE:" };
  let save: SaveFile;
  try {
    save = JSON.parse(decodeURIComponent(escape(atob(body.slice(EXPORT_PREFIX.length))))) as SaveFile;
  } catch {
    return { ok: false, reason: 'The save text is damaged or incomplete. Copy it again in full.' };
  }
  if (save?.game !== '2059' || typeof save.version !== 'number' || typeof save.parts !== 'object') {
    return { ok: false, reason: "That save is missing parts the game needs." };
  }
  if (save.version > SAVE_VERSION) return { ok: false, reason: 'That save is from a newer version of the game. Update the game first.' };
  try { save = migrate(save); } catch (e) { return { ok: false, reason: (e as Error).message }; }
  writeSave(save);
  return { ok: true };
}

/** For tests: forget the in-memory copy so the next read comes from storage. */
export function resetSaveCache() { cache = null; }
