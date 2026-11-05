// Today's run: one host, chapter one, a seed made from the date (UTC), so everyone
// gets the same rooms, fights and drops. It lives in its own save slot (save.ts picks
// the slot when the page loads), so the player's own game is never touched. Records
// (best level each day) sit under their own key and survive both slots.

import { hashSeed } from './engine/rng';

export const DAILY_FLAG = '2059-daily-on';
export const DAILY_SAVE_KEY = '2059-daily-save';
export const DAILY_RECORDS = '2059-daily';

function ls(): Storage | null {
  try { return typeof localStorage === 'undefined' ? null : localStorage; } catch { return null; }
}

/** Today, as the daily run counts days (UTC, so it's the same day for everyone). */
export const todayKey = (now = new Date()) => now.toISOString().slice(0, 10);
/** The run seed for a day. */
export const dailySeed = (day: string) => hashSeed(`daily:${day}`);

/** The day of the daily run this page is playing, or null when it's the player's own game. Fixed for the page's life. */
export const dailyDay: string | null = ls()?.getItem(DAILY_FLAG) ?? null;

export type DailyRecords = Record<string, { best: number; runs: number }>;
export function dailyRecords(): DailyRecords {
  try { return JSON.parse(ls()?.getItem(DAILY_RECORDS) ?? '{}') as DailyRecords; } catch { return {}; }
}
/** A finished run's deepest level, kept if it's the day's best. */
export function recordDaily(records: DailyRecords, day: string, level: number): DailyRecords {
  const was = records[day] ?? { best: 0, runs: 0 };
  return { ...records, [day]: { best: Math.max(was.best, level), runs: was.runs + 1 } };
}

/** Leave the player's own game (it stays saved) and start today's run. */
export function startDaily() {
  const s = ls();
  if (!s) return;
  s.setItem(DAILY_FLAG, todayKey());
  s.removeItem(DAILY_SAVE_KEY);
  location.reload();
}

/** End the daily run: keep its result, throw its save away, go back to the player's own game. */
export function endDaily(level: number | null) {
  const s = ls();
  if (!s) return;
  if (level !== null && dailyDay) s.setItem(DAILY_RECORDS, JSON.stringify(recordDaily(dailyRecords(), dailyDay, level)));
  s.removeItem(DAILY_FLAG);
  s.removeItem(DAILY_SAVE_KEY);
  location.reload();
}

/** The first life's set piece (the Enforcer on threat 3) is skipped in a daily run: one life shouldn't end on a script. */
export const firstLifeAt = (deathCount: number, level: number) => deathCount === 0 && !(dailyDay && level === 3);
