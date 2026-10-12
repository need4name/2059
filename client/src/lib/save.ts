// One save file for the whole game. Every store that persists writes its part
// into a single versioned record under SAVE_KEY, so a save can be exported as
// text, imported on another device, and migrated as the game changes.
import type { StateStorage } from 'zustand/middleware';

export const SAVE_KEY = '2059-save';
/** Bump this and add a step to MIGRATIONS whenever the save's shape changes. */
export const SAVE_VERSION = 1;
const EXPORT_PREFIX = '2059SAVE:';

/** The stores that make up a save (each persists under its own name). */
export const SAVE_PARTS = ['2059-combat', '2059-inventory', '2059-loadout', '2059-trees', '2059-market', '2059-tutorial', '2059-playi'] as const;

export interface SaveFile {
  game: '2059';
  version: number;
  savedAt: string;
  /** Each store's own persisted JSON, by store name. */
  parts: Record<string, string>;
}

/** MIGRATIONS[n] upgrades a version-n save to version n + 1. */
const MIGRATIONS: Record<number, (save: SaveFile) => SaveFile> = {};

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
  const raw = ls?.getItem(SAVE_KEY);
  if (raw) {
    try { save = migrate(JSON.parse(raw) as SaveFile); } catch { save = emptySave(); }
  } else if (ls) {
    // Before the single save file, each store had its own key
    for (const part of SAVE_PARTS) {
      const old = ls.getItem(part);
      if (old !== null) save.parts[part] = old;
    }
    if (Object.keys(save.parts).length) {
      ls.setItem(SAVE_KEY, JSON.stringify(save));
      for (const part of SAVE_PARTS) ls.removeItem(part);
    }
  }
  cache = save;
  return save;
}

function writeSave(save: SaveFile) {
  cache = { ...save, savedAt: new Date().toISOString() };
  storage()?.setItem(SAVE_KEY, JSON.stringify(cache));
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
