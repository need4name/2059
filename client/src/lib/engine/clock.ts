// The hidden clock: how long passes between one host falling and the next waking. Never shown as a number
// or a date; the world shows it (the light and weather a host wakes to, how far the last body has gone,
// how dry the blood is). The gaps start long and shorten as hosts are lost, as if the signal gets quicker
// at finding a body, with a wobble on each so no two are alike. Visual only: it never touches play, and it's
// worked out from the run's seed (not the fight dice), so replays agree.

import { mixSeed } from './rng';

export type DayPart = 'dawn' | 'day' | 'dusk' | 'night';
export type Weather = 'clear' | 'overcast' | 'rain' | 'fog';
export interface Wake { /** Hours since the first host woke. */ hours: number; dayPart: DayPart; weather: Weather; /** Hours since the last host fell (0 for the first). */ gap: number }

/** firstGap hours before the second host, each next gap `shrink` of the last, never under `floor`; `wobble` the spread. */
export const CLOCK = { firstGap: 500, shrink: 0.91, floor: 4, wobble: 0.3, startHour: 10 };

const unit = (seed: number, ...k: number[]) => (mixSeed(seed, ...k) >>> 0) / 4294967296;

/** Hours between host `n` falling (n = 1 for the first host lost) and the next one waking. */
export function gapHours(seed: number, n: number): number {
  const base = CLOCK.firstGap * Math.pow(CLOCK.shrink, Math.max(0, n - 1)) + CLOCK.floor;
  // A log-normal wobble: usually within about x0.55 to x1.8
  const u1 = Math.max(1e-6, unit(seed, 71, n)), u2 = unit(seed, 73, n);
  const z = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
  return Math.max(1, base * Math.exp(z * CLOCK.wobble));
}

export const dayPartAt = (hours: number): DayPart => {
  const h = ((hours % 24) + 24) % 24;
  return h >= 5 && h < 8 ? 'dawn' : h >= 8 && h < 17 ? 'day' : h >= 17 && h < 20 ? 'dusk' : 'night';
};

/** What the host who wakes after `lost` hosts have fallen wakes to. */
export function wakeOf(seed: number, lost: number): Wake {
  let hours = CLOCK.startHour;
  for (let n = 1; n <= lost; n++) hours += gapHours(seed, n);
  const w = unit(seed, 79, lost);
  const weather: Weather = w < 0.45 ? 'clear' : w < 0.7 ? 'overcast' : w < 0.9 ? 'rain' : 'fog';
  return { hours, dayPart: dayPartAt(hours), weather: lost === 0 ? 'clear' : weather, gap: lost ? gapHours(seed, lost) : 0 };
}

/** The clock as the map keeps it: its seed (the run's, set when the first host is lost), the hours since the first wake, and the hosts lost. */
export interface Clock { seed: number; hours: number; lost: number }
export const startClock = (seed: number): Clock => ({ seed: seed >>> 0, hours: CLOCK.startHour, lost: 0 });
/** A host is lost: the next one wakes a gap later. */
export const advance = (c: Clock): Clock => ({ ...c, lost: c.lost + 1, hours: c.hours + gapHours(c.seed, c.lost + 1) });
/** What the host awake now woke to (no clock yet: the first host, mid-morning and clear). */
export function wakeNow(c: Clock | null | undefined): Wake {
  if (!c || c.lost === 0) return { hours: c?.hours ?? CLOCK.startHour, dayPart: dayPartAt(c?.hours ?? CLOCK.startHour), weather: 'clear', gap: 0 };
  const w = unit(c.seed, 79, c.lost);
  const weather: Weather = w < 0.45 ? 'clear' : w < 0.7 ? 'overcast' : w < 0.9 ? 'rain' : 'fog';
  return { hours: c.hours, dayPart: dayPartAt(c.hours), weather, gap: gapHours(c.seed, c.lost) };
}

/** How far gone something left `hours` ago is: fresh under two days, days under three weeks, then weeks. */
export type Age = 'fresh' | 'days' | 'weeks';
export const AGE = { days: 48, weeks: 504 };
export const ageOf = (hours: number): Age => (hours < AGE.days ? 'fresh' : hours < AGE.weeks ? 'days' : 'weeks');
