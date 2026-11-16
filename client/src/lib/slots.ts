// Three saves. Each is a whole run (its own memory, firmware, map, clock and difficulty) in its own
// slot of localStorage; the page plays one of them, chosen before the stores load (like today's run:
// switching slot reloads the page). What's earned across runs (Hard, challenges) lives on the device
// (unlocks.ts), so every slot shares it.

import chapters from '../content/chapters.json';
import ocean from '../content/map-indian-ocean.json';
import deltas from '../content/map-deltas.json';
import hills from '../content/map-helix-hills.json';
import rain from '../content/map-rain-machine.json';
import corridor from '../content/map-corridor.json';

export const SLOTS = [1, 2, 3] as const;
export type Slot = typeof SLOTS[number];
/** Slot 1 keeps the old single save's key, so an existing game is slot 1. */
export const slotKey = (n: Slot) => (n === 1 ? '2059-save' : `2059-save-${n}`);
export const SLOT_FLAG = '2059-slot';
/** What the title should do once the page has reloaded into a slot: carry on, or start a new run. */
export const LAUNCH_FLAG = '2059-launch';

function ls(): Storage | null {
  try { return typeof localStorage === 'undefined' ? null : localStorage; } catch { return null; }
}

/** The slot this page plays. Fixed for the page's life. */
export const activeSlot: Slot = (() => { const n = Number(ls()?.getItem(SLOT_FLAG)); return n === 2 || n === 3 ? n : 1; })();

/** Read (and forget) what the title should do on this load. */
export function takeLaunch(): 'continue' | 'new' | null {
  const s = ls(); const v = s?.getItem(LAUNCH_FLAG) ?? null;
  if (v) s!.removeItem(LAUNCH_FLAG);
  return v === 'continue' || v === 'new' ? v : null;
}

/** Switch the page to slot n and reload; once loaded, carry on or start a new run there. */
export function openSlot(n: Slot, then: 'continue' | 'new') {
  const s = ls(); if (!s) return;
  s.setItem(SLOT_FLAG, String(n)); s.setItem(LAUNCH_FLAG, then);
  location.reload();
}

/** Wipe a slot. Wiping the one this page plays reloads it. */
export function eraseSlot(n: Slot) {
  const s = ls(); if (!s) return;
  s.removeItem(slotKey(n));
  if (n === activeSlot) location.reload();
}

export type Difficulty = 'easy' | 'normal' | 'hard';
export interface SlotSummary { chapter: string; room: string; hosts: number; difficulty: Difficulty; challenges: string[]; savedAt: string }
const MAPS: Record<string, { rooms: { id: string; name: string }[] }> = { 'indian-ocean': ocean, deltas, 'helix-hills': hills, 'rain-machine': rain, corridor } as never;

/** What a slot holds, for the title: where, how many hosts, which difficulty. Null for an empty slot. */
export function slotSummary(n: Slot): SlotSummary | null {
  try {
    const raw = ls()?.getItem(slotKey(n)); if (!raw) return null;
    const save = JSON.parse(raw) as { savedAt?: string; parts?: Record<string, string> };
    const part = (k: string) => { try { return JSON.parse(save.parts?.[k] ?? 'null')?.state ?? null; } catch { return null; } };
    const combat = part('2059-combat'), map = part('2059-map'), run = part('2059-run');
    if (!combat || !(combat.introCompleted || (combat.progression?.deathCount ?? 0) > 0)) return null;
    const ch = (chapters as { chapters: { id: string; name: string; map: string }[] }).chapters.find(c => c.id === map?.chapter) ?? (chapters as { chapters: { id: string; name: string; map: string }[] }).chapters[0];
    const room = MAPS[ch.map]?.rooms.find(r => r.id === map?.room)?.name ?? '';
    return { chapter: ch.name, room, hosts: (combat.progression?.deathCount ?? 0) + 1, difficulty: run?.difficulty ?? 'normal', challenges: run?.challenges ?? [], savedAt: save.savedAt ?? '' };
  } catch { return null; }
}

/** "Played today", "Played 3 days ago". */
export function playedAgo(iso: string, now = new Date()): string {
  const t = Date.parse(iso); if (!t) return '';
  const days = Math.floor((now.getTime() - t) / 86400000);
  return days <= 0 ? 'Played today' : days === 1 ? 'Played yesterday' : `Played ${days} days ago`;
}
