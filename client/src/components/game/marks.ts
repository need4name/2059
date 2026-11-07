// Tiny pixel marks for what a move does besides its damage, drawn on the tiles it lands on
// (the board in CombatScene, the attack pictures in hud.tsx's Footprint). Colour and shape
// carry the meaning; there is no legend. Marks on the target's tiles are what happens to
// whoever stands there; marks on your own tile are what the move does for you.
import type { CombatAction } from '@/lib/combat/types';

export type MarkId =
  | 'bleed' | 'stun' | 'ignite' | 'slow' | 'crush' | 'heat' | 'cover'
  | 'drain' | 'cool' | 'haste' | 'reap' | 'hot' | 'low' | 'heal';

/** 5x5 bitmaps (`#` is lit) and colours. */
export const MARKS: Record<MarkId, { rows: string[]; color: string }> = {
  bleed:  { color: '#ef4444', rows: ['..#..', '.###.', '#####', '#####', '.###.'] },
  stun:   { color: '#facc15', rows: ['..###', '.##..', '#####', '..##.', '###..'] },
  ignite: { color: '#fb923c', rows: ['..#..', '.##.#', '.####', '#####', '.###.'] },
  slow:   { color: '#60a5fa', rows: ['#...#', '.#.#.', '..#..', '#...#', '.#.#.'] },
  crush:  { color: '#d6d3d1', rows: ['#.#.#', '.###.', '##.##', '.###.', '#.#.#'] },
  heat:   { color: '#f97316', rows: ['..#..', '.###.', '#.#.#', '..#..', '..#..'] },
  cover:  { color: '#e5e7eb', rows: ['#....', '.#...', '..#..', '...#.', '....#'] },
  drain:  { color: '#4ade80', rows: ['..#..', '..#..', '#####', '..#..', '..#..'] },
  heal:   { color: '#86efac', rows: ['.....', '.#.#.', '#####', '.###.', '..#..'] },
  cool:   { color: '#38bdf8', rows: ['..#..', '#.#.#', '.###.', '#.#.#', '..#..'] },
  haste:  { color: '#a5f3fc', rows: ['..#..', '.#.#.', '#...#', '..#..', '.#.#.'] },
  reap:   { color: '#e5e7eb', rows: ['.###.', '#.#.#', '#####', '.#.#.', '.....'] },
  hot:    { color: '#fb7185', rows: ['..#..', '..#..', '..#..', '.###.', '.###.'] },
  low:    { color: '#f43f5e', rows: ['##.##', '#####', '.###.', '..#..', '.....'] },
};

/** Heat pushed into the target worth marking (most moves push a little). */
const BIG_PUSH = 6;

/** What a move's marks are: on the tiles it lands on, and on your own tile. */
export function effectMarks(action: CombatAction | null | undefined): { target: MarkId[]; self: MarkId[] } {
  const target: MarkId[] = [], self: MarkId[] = [];
  if (!action || (action.type !== 'attack' && action.type !== 'special')) return { target, self };
  const fx = action.effects ?? {};
  if (fx.bleed) target.push('bleed');
  if (fx.stun) target.push('stun');
  if (fx.ignite) target.push('ignite');
  if (fx.slow) target.push('slow');
  if (fx.crush) target.push('crush');
  if ((action.heatTransfer ?? 0) >= BIG_PUSH) target.push('heat');
  if (fx.ignoreCover) target.push('cover');
  if (fx.drain) self.push('drain');
  if (action.healing) self.push('heal');
  if (fx.cool) self.push('cool');
  if (fx.haste) self.push('haste');
  if (fx.reap) self.push('reap');
  if (fx.hotBonus) self.push('hot');
  if (fx.lowBonus) self.push('low');
  return { target, self };
}

/** Draw a row of marks on a canvas, centred on (cx, cy), each mark `px` canvas pixels a dot. */
export function drawMarks(ctx: CanvasRenderingContext2D, marks: MarkId[], cx: number, cy: number, px: number) {
  if (!marks.length) return;
  const w = 5 * px, gap = px * 1.5, total = marks.length * w + (marks.length - 1) * gap;
  let x = cx - total / 2;
  for (const id of marks) {
    const m = MARKS[id];
    // A dark backing so a mark reads on any tile colour
    ctx.fillStyle = 'rgba(8,10,14,0.75)';
    ctx.fillRect(Math.round(x - px * 0.6), Math.round(cy - w / 2 - px * 0.6), Math.round(w + px * 1.2), Math.round(w + px * 1.2));
    ctx.fillStyle = m.color;
    m.rows.forEach((row, r) => row.split('').forEach((ch, c) => {
      if (ch === '#') ctx.fillRect(Math.round(x + c * px), Math.round(cy - w / 2 + r * px), Math.ceil(px), Math.ceil(px));
    }));
    x += w + gap;
  }
}
