// Chapters: self-contained awakenings in different places. The data lives in
// content/chapters.json; for now every fight uses chapter one.
import data from '../../content/chapters.json';

export interface Tileset {
  floor: { light: string; dark: string; seam: string };
  sea: { top: string; bottom: string; foam: string };
  hazards: { art: string; name: string; damage: number }[];
  obstacles: { art: string; name: string }[];
}
export interface Chapter { id: string; name: string; place: string; tileset: Tileset }

export const CHAPTERS = (data as { chapters: Chapter[] }).chapters;
export const currentChapter = (): Chapter => CHAPTERS[0];
