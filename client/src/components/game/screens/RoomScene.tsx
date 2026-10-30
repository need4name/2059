import { useEffect, useRef } from 'react';
import { activeChapter } from '@/lib/combat/chapters';
import { drawSea, drawSlab, drawDeckTile, drawSeams, drawObstacle, drawHazard, drawFootShadow, hasCover, type Open } from '@/lib/rendering/board';
import { drawFigure } from '@/lib/rendering/figures';

/** A stable 0..1 number from a string and a salt, so a room always looks the same. */
function seeded(id: string, salt: number) {
  let h = 2166136261 ^ salt;
  for (let i = 0; i < id.length; i++) h = Math.imul(h ^ id.charCodeAt(i), 16777619);
  return ((h >>> 0) % 10000) / 10000;
}

/**
 * A small pixel picture of the room: the chapter's own sea and floor, a strip
 * of deck with a piece or two of cover, the host standing on it, and whoever
 * holds the room waiting at the far end. Built from the board's own sprites,
 * laid out from the room's id so every room looks a little different.
 */
export function RoomScene({ roomId, enemy }: { roomId: string; enemy?: string | null }) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d')!;
    const t = activeChapter().tileset;
    let raf = 0, last = 0;

    const paint = (now: number) => {
      const dpr = window.devicePixelRatio || 1;
      const w = canvas.clientWidth, h = canvas.clientHeight;
      if (canvas.width !== Math.round(w * dpr)) { canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr); }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      drawSea(ctx, w, h, t, Date.now());

      // One row of deck, with a gap or two where the slab breaks
      const s = Math.round(h * 0.3);
      const cols = Math.ceil(w / s) + 1;
      const y = h - s - Math.round(s * 0.42);
      const x0 = Math.round(-seeded(roomId, 1) * s * 0.6);
      const gapAt = seeded(roomId, 2) > 0.45 ? 1 + Math.floor(seeded(roomId, 3) * (cols - 3)) : -1;
      const floor = (c: number) => c >= 0 && c < cols && c !== gapAt;
      const cells: { x: number; y: number; w: number; h: number; open: Open }[] = [];
      for (let c = 0; c < cols; c++) if (floor(c)) cells.push({ x: x0 + c * s, y, w: s, h: s, open: { up: true, down: true, left: !floor(c - 1), right: !floor(c + 1) } });
      const r = s * 0.14;
      drawSlab(ctx, cells, t, r);
      cells.forEach((cell, k) => drawDeckTile(ctx, cell.x, cell.y, cell.w, cell.h, cell.open, r, 0, k, t));
      drawSeams(ctx, cells, t.floor.seam);

      // What stands on it, back to front: cover, a hazard, the host, the enemy
      const hostAt = cells.findIndex(c => c.x >= s * 0.3);
      let foeAt = -1;
      cells.forEach((c, k) => { if (c.x + s <= w - s * 0.35) foeAt = k; });
      const free = cells.map((_, k) => k).filter(k => k !== hostAt && k !== foeAt && cells[k].x > s * 0.5 && cells[k].x < w - s);
      const pick = (salt: number) => free.length ? free[Math.floor(seeded(roomId, salt) * free.length)] : -1;
      const coverAt = pick(4), hazardAt = seeded(roomId, 7) > 0.55 ? pick(8) : -1;
      const covers = t.obstacles.filter(o => hasCover(o.art));
      const at = (k: number) => ({ x: cells[k].x + s / 2, y: cells[k].y + s / 2 });
      if (hazardAt >= 0 && hazardAt !== coverAt && t.hazards.length) {
        const p = at(hazardAt);
        drawHazard(ctx, t.hazards[Math.floor(seeded(roomId, 9) * t.hazards.length)].art, p.x, p.y, s, now);
      }
      if (coverAt >= 0 && covers.length) {
        const p = at(coverAt);
        drawObstacle(ctx, covers[Math.floor(seeded(roomId, 5) * covers.length)].art, p.x, p.y, s);
      }
      const size = s * 1.25;
      if (hostAt >= 0) {
        const p = at(hostAt);
        drawFootShadow(ctx, p.x, p.y + s * 0.36, s);
        drawFigure(ctx, 'host', p.x - size / 2, p.y - size / 2 - s * 0.12, size, 'idle', Math.floor(now / 500) % 2, false);
      }
      if (enemy && foeAt > hostAt && foeAt >= 0) {
        const p = at(foeAt);
        drawFootShadow(ctx, p.x, p.y + s * 0.36, s);
        drawFigure(ctx, enemy, p.x - size / 2, p.y - size / 2 - s * 0.12, size, 'idle', Math.floor(now / 500) % 2, true);
      }
      // Dark at the edges, so it sits in the card like a window
      const v = ctx.createRadialGradient(w / 2, h / 2, h * 0.3, w / 2, h / 2, w * 0.7);
      v.addColorStop(0, 'rgba(0,0,0,0)');
      v.addColorStop(1, 'rgba(0,0,0,0.5)');
      ctx.fillStyle = v;
      ctx.fillRect(0, 0, w, h);
    };

    // A slow frame rate is plenty for a drifting sea
    const loop = (now: number) => {
      if (now - last > 90) { last = now; paint(now); }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [roomId, enemy]);

  return <canvas ref={ref} className="block h-[132px] w-full" aria-hidden />;
}
