// Chapters: self-contained awakenings in different places, played in order. The
// data lives in content/chapters.json: each chapter's map, cast (who you fight)
// and tileset. The map store says which chapter the signal is in; everything
// that depends on the place (enemies, board look) reads activeChapter().
import data from '../../content/chapters.json';

export interface Tileset {
  floor: { light: string; dark: string; seam: string };
  sea: { top: string; bottom: string; foam: string };
  hazards: { art: string; name: string; damage: number }[];
  obstacles: { art: string; name: string }[];
}
/** Who you fight in a chapter. */
export interface Cast {
  /** Regular enemies, walked in order across the regular threat levels. */
  rotation: string[];
  /** Elites on threat 5, 15 and 25. */
  elites: string[];
  /** Bosses on threat 20 and 30 (and every 10 after, in turn). */
  bosses: string[];
  /** The first host's set piece on threat 3. */
  firstFight: string;
  /** Who holds threat 10, made a wall (KING_MULT): the Patchwork King and the Echo are built specially; any other enemy name uses its enemies.json entry. */
  setPiece: string;
}
/** Board rules that hold in every fight of a chapter. */
export interface ChapterRules {
  /** The alarm trips early in each fight and the whole board heats up every round (cold pods help). */
  alarm?: boolean;
  /** Hosts still have a dreamer inside, who may flinch once a fight and move you a tile. */
  flinch?: boolean;
  /** Wind pushes everyone a tile as each of your turns ends, and changes direction every few turns. */
  wind?: boolean;
  /** The room issues an order every two rounds that binds everyone; you can rewrite one a fight. */
  orders?: boolean;
  /** New hosts wake as a machine: a frame with its own built-in parts. */
  machines?: boolean;
}
export interface Chapter { id: string; name: string; place: string; map: string; ready: boolean; cast: Cast; tileset: Tileset; rules?: ChapterRules }

export const CHAPTERS = (data as { chapters: Chapter[] }).chapters;
export const chapterById = (id: string): Chapter => CHAPTERS.find(c => c.id === id) ?? CHAPTERS[0];

let active = CHAPTERS[0];
/** The chapter the signal is in (set by the map store). */
export const activeChapter = (): Chapter => active;
export const setActiveChapter = (id: string) => { active = chapterById(id); };

/** The chapter after this one, if it's ready to play. */
export function nextChapter(id: string): Chapter | null {
  const i = CHAPTERS.findIndex(c => c.id === id);
  const next = i >= 0 ? CHAPTERS[i + 1] : undefined;
  return next && next.ready ? next : null;
}
