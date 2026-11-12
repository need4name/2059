// The fight, played back: each step the store records (lib/combat/fx.ts) becomes a
// short scene on the board. A blow winds up, travels (a bolt flies, a beam draws, a
// lob arcs, a hook reels), lands (the shape's tiles flash outward in the damage
// colour, a beat of hit-stop, the struck flash white and recoil, sparks, the screen
// shakes for a big one), then the aftermath plays: numbers rise, bars drop with a
// pale chunk draining behind them, bodies are thrown (with a hop, a slam of dust, or
// a splash), the fallen slump while their parts pop off. Until a blow lands, the
// board keeps showing the bodies as they were, so you see the hit before the numbers.
// Visual only: Math.random is fine here, nothing touches the rules.

import type { FxPacket, FxChange, FxStrike } from '@/lib/combat/fx';
import type { AttackPatternType, TilePosition } from '@/lib/combat/types';

const RANGED = new Set<AttackPatternType>(['ranged', 'bolt', 'pierce', 'longshot', 'beam', 'lob', 'grapple']);
const CENTRED = new Set<AttackPatternType>(['aoe', 'burst', 'ring', 'diagonal_cross']);
/** Timings (ms): weighty, every blow readable. */
export const FX = { windup: 260, perTile: 75, minTravel: 110, hitStop: 85, critStop: 150, shove: 300, hold: 420, numbers: 1100, chunkHold: 380, chunkDrain: 520, death: 700, flash: 110, recoil: 140, shake: 260 };

type Pt = { x: number; y: number };
type ToScreen = (row: number, col: number) => Pt;

interface Scene {
  p: FxPacket;
  start: number;
  impact: number;
  end: number;
  stop: number;
  attacker: string | null;
  landed: boolean;
}
interface Particle { x: number; y: number; vx: number; vy: number; g: number; life: number; born: number; color: string; size: number; floor?: number }
interface Number_ { key: string; text: string; color: string; born: number; big: boolean }
interface Chunk { from: number; to: number; born: number; sFrom: number; sTo: number }

const keyOf = (b: FxStrike['by']) => (b.kind === 'player' ? 'player' : b.kind === 'foe' ? `foe:${b.i}` : `ally:${b.k}`);
const dist = (a: TilePosition, b: TilePosition) => Math.max(Math.abs(a.row - b.row), Math.abs(a.col - b.col));

export class FxDirector {
  private seen = 0;
  private queue: Scene[] = [];
  private active: Scene[] = [];
  /** Bodies shown as they were until their blow lands: key -> the change waiting. */
  private held = new Map<string, FxChange>();
  /** Bodies being thrown: key -> from, to, start, how. */
  private throws = new Map<string, { from: TilePosition; to: TilePosition; start: number; wet: boolean; slam: boolean }>();
  private flashes = new Map<string, number>();
  private recoils = new Map<string, { dx: number; dy: number; start: number }>();
  private dying = new Map<string, { start: number; pos: TilePosition }>();
  private chunks = new Map<string, Chunk>();
  private tileFlashes: { tile: TilePosition; born: number; color: string }[] = [];
  private shots: { s: FxStrike; born: number; dur: number }[] = [];
  private rings: { at: TilePosition; born: number; color: string; reach: number }[] = [];
  private particles: Particle[] = [];
  private numbers: Number_[] = [];
  private waves: { tiles: TilePosition[]; born: number; rising: boolean; c0: number; c1: number }[] = [];
  private guardsUp = new Map<string, number>();
  private flashUntil = 0;
  private shakeUntil = 0;
  private leftAt = 0;
  private shakeAmp = 0;
  /** Called when a blow starts (the attacker swings) and when it lands on someone. */
  onSwing: (key: string, faceTo: TilePosition) => void = () => {};
  onHurt: (key: string) => void = () => {};

  reset() { this.guardsUp.clear(); this.flashUntil = 0; this.leftAt = 0; this.queue = []; this.active = []; this.held.clear(); this.throws.clear(); this.flashes.clear(); this.recoils.clear(); this.dying.clear(); this.chunks.clear(); this.tileFlashes = []; this.shots = []; this.rings = []; this.particles = []; this.numbers = []; }

  /** New packets from the store (anything not seen yet). */
  feed(packets: FxPacket[], now: number) {
    for (const p of packets) {
      if (p.id <= this.seen) continue;
      this.seen = p.id;
      const s = p.strikes[0];
      const attacker = s ? keyOf(s.by) : null;
      const far = s ? Math.max(1, ...s.tiles.map(t => dist(s.from, t)), dist(s.from, s.aim)) : 0;
      const travel = s && RANGED.has(s.pattern) ? Math.max(FX.minTravel, far * FX.perTile) : 0;
      const impactIn = s ? FX.windup + travel : 0;
      const stop = s ? (p.crit ? FX.critStop : FX.hitStop) : 0;
      const scene: Scene = { p, start: 0, impact: impactIn, end: impactIn + stop + FX.hold, stop, attacker, landed: false };
      // Hold every body this step changed (except plain walking, which slides as before)
      for (const c of p.changes) {
        const walkOnly = !s && c.hp[0] === c.hp[1] && c.structure[0] === c.structure[1] && !c.wet;
        if (!walkOnly) this.held.set(c.key, c);
      }
      this.queue.push(scene);
    }
    this.advance(now);
  }

  private advance(now: number) {
    // A blow starts once the one before it has landed (a backlog plays faster)
    while (this.queue.length) {
      const last = this.active[this.active.length - 1];
      const busy = last && !last.landed && now < last.start + last.impact;
      if (busy && this.queue.length < 3) break;
      const sc = this.queue.shift()!;
      const squeeze = this.queue.length >= 2 ? 0.45 : 1;
      sc.start = now; sc.impact = Math.round(sc.impact * squeeze); sc.end = Math.round(sc.end * squeeze);
      this.active.push(sc);
      const s = sc.p.strikes[0];
      if (s && sc.attacker) {
        this.onSwing(sc.attacker, s.aim);
        if (RANGED.has(s.pattern)) this.shots.push({ s, born: now + FX.windup * squeeze, dur: sc.impact - FX.windup * squeeze });
      }
      for (const w of sc.p.windups) this.burst(`foe:${w}`, null, '#ff8a3a', 14, now, -1.2);
      for (const g of sc.p.guards ?? []) this.guardsUp.set(g, now);
    }
  }

  private pos = new Map<string, TilePosition>();
  private toScreen: ToScreen = () => ({ x: 0, y: 0 });
  private tile = 64;

  /** Every frame, before drawing: where things are, how big a tile is. */
  frame(now: number, toScreen: ToScreen, tileW: number, positions: Map<string, TilePosition>) {
    this.toScreen = toScreen; this.tile = tileW; this.pos = positions;
    this.advance(now);
    for (const sc of this.active) if (!sc.landed && now >= sc.start + sc.impact) this.land(sc, now);
    this.active = this.active.filter(sc => now < sc.start + sc.end);
    this.particles = this.particles.filter(q => now - q.born < q.life);
    this.numbers = this.numbers.filter(n => now - n.born < FX.numbers);
    this.tileFlashes = this.tileFlashes.filter(f => now - f.born < 420);
    this.shots = this.shots.filter(s => now < s.born + s.dur + 200);
    this.rings = this.rings.filter(r => now - r.born < 500);
    this.waves = this.waves.filter(w => now - w.born < 1400);
    this.throws.forEach((t, k) => { if (now - t.start > FX.shove) this.throws.delete(k); });
    this.dying.forEach((d, k) => { if (now - d.start > FX.death) this.dying.delete(k); });
  }

  private land(sc: Scene, now: number) {
    sc.landed = true;
    const { p } = sc;
    const t0 = now + sc.stop; // after the hit-stop beat
    // The shape's tiles flash outward from the attacker
    for (const s of p.strikes) {
      const color = dmgColor(s.physical);
      const centre = CENTRED.has(s.pattern) ? s.aim : s.from;
      for (const t of s.tiles) this.tileFlashes.push({ tile: t, born: now - 40 + dist(centre, t) * 45, color });
      if (CENTRED.has(s.pattern)) this.rings.push({ at: s.pattern === 'aoe' && same(s.from, s.aim) ? s.from : s.aim, born: now, color, reach: Math.max(1, ...s.tiles.map(t => dist(s.aim, t))) });
    }
    const strike = p.strikes[0];
    const color = strike ? dmgColor(strike.physical) : '#ffffff';
    let bigHit = 0;
    for (const c of p.changes) {
      this.held.delete(c.key);
      const lost = c.hp[0] - c.hp[1], sLost = c.structure[0] - c.structure[1];
      const at = c.pos[0];
      if (lost > 0 || sLost > 0) {
        this.flashes.set(c.key, t0 + FX.flash);
        this.onHurt(c.key);
        if (strike) { const dx = Math.sign(at.col - strike.from.col), dy = Math.sign(at.row - strike.from.row); this.recoils.set(c.key, { dx, dy, start: t0 }); }
        this.burst(c.key, at, color, lost > 0 ? 10 + Math.min(14, Math.round(lost / 6)) : 6, t0, 0);
        this.chunks.set(c.key, { from: c.hp[0] / Math.max(1, c.maxHp), to: c.hp[1] / Math.max(1, c.maxHp), born: t0, sFrom: c.structure[0] / Math.max(1, c.maxStructure), sTo: c.structure[1] / Math.max(1, c.maxStructure) });
        if (lost > 0) this.numbers.push({ key: c.key, text: `-${lost}`, color: p.crit ? '#ffd34a' : '#ffffff', born: t0, big: p.crit });
        else if (sLost > 0) this.numbers.push({ key: c.key, text: `-${sLost}`, color: '#a8b8c8', born: t0, big: false });
        if (c.key === 'player') bigHit = Math.max(bigHit, lost / Math.max(1, c.maxHp));
        if (c.maxStructure > 0 && c.structure[0] > 0 && c.structure[1] <= 0) this.numbers.push({ key: c.key, text: 'MALFUNCTION', color: '#ffa04a', born: t0 + 220, big: false });
      } else if (lost < 0) {
        this.numbers.push({ key: c.key, text: `+${-lost}`, color: '#4ade80', born: now, big: false });
        this.chunks.set(c.key, { from: c.hp[1] / Math.max(1, c.maxHp), to: c.hp[1] / Math.max(1, c.maxHp), born: now, sFrom: 0, sTo: 0 });
      }
      if (!same(c.pos[0], c.pos[1])) {
        this.throws.set(c.key, { from: c.pos[0], to: c.pos[1], start: t0, wet: c.wet, slam: p.collide });
        if (c.wet) setTimeout(() => this.splash(c.pos[1]), FX.shove * 0.8);
      } else if (p.collide && (lost > 0 || sLost > 0) && strike) this.dust(at, t0);
      if (c.wet && same(c.pos[0], c.pos[1])) this.splash(c.pos[1]);
      if (c.down && c.key !== 'player') { this.dying.set(c.key, { start: t0 + 80, pos: c.pos[1] }); this.shed(c.pos[1], t0 + 260); }
      // Host lost: the body drops, and the signal leaves it, a pale shape rising in a drift of cyan
      if (c.down && c.key === 'player') { this.dying.set('player', { start: t0 + 80, pos: c.pos[1] }); this.leftAt = t0 + 380; this.signal(c.pos[1], t0 + 380); }
    }
    if (bigHit > 0.15 || p.crit) { this.shakeAmp = Math.min(9, 3 + bigHit * 18 + (p.crit ? 3 : 0)); this.shakeUntil = t0 + FX.shake; }
    if (p.surge) {
      // Overload: the body screams. A white flash, a double shockwave from the host, streaks flying out
      this.shakeAmp = Math.max(this.shakeAmp, 7); this.shakeUntil = Math.max(this.shakeUntil, t0 + FX.shake * 1.6);
      this.flashUntil = now + 240;
      const from = p.strikes[0]?.from ?? this.pos.get('player');
      if (from) {
        this.rings.push({ at: from, born: now, color: '#7fe9ff', reach: 3 }, { at: from, born: now + 140, color: '#ffffff', reach: 2.2 });
        const c = this.toScreen(from.row, from.col), u = this.tile / 64;
        for (let k = 0; k < 26; k++) { const a = (k / 26) * Math.PI * 2; this.particles.push({ x: c.x, y: c.y - this.tile * 0.35, vx: Math.cos(a) * 5 * u, vy: Math.sin(a) * 3 * u, g: 0, life: 360, born: now, color: k % 3 ? '#7fe9ff' : '#ffffff', size: Math.round(3 * u) }); }
      }
    }
  }

  private burst(key: string, at: TilePosition | null, color: string, n: number, born: number, up: number) {
    const tile = at ?? this.pos.get(key); if (!tile) return;
    const c = this.toScreen(tile.row, tile.col), u = this.tile / 64;
    for (let k = 0; k < n; k++) {
      const a = Math.random() * Math.PI * 2, sp = (1.2 + Math.random() * 2.6) * u;
      this.particles.push({ x: c.x, y: c.y - this.tile * 0.35, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp + up * u, g: up < 0 ? -0.02 : 0.12 * u, life: 380 + Math.random() * 260, born, color: Math.random() < 0.3 ? '#ffffff' : color, size: Math.max(2, Math.round((1 + Math.random() * 1.6) * u * 1.6)) });
    }
  }
  private signal(at: TilePosition, born: number) {
    const c = this.toScreen(at.row, at.col), u = this.tile / 64;
    for (let k = 0; k < 28; k++) this.particles.push({ x: c.x + (Math.random() - 0.5) * this.tile * 0.5, y: c.y - this.tile * (0.2 + Math.random() * 0.6), vx: (Math.random() - 0.5) * 0.5 * u, vy: -(0.4 + Math.random() * 0.9) * u, g: -0.004 * u, life: 1100 + Math.random() * 500, born: born + Math.random() * 400, color: Math.random() < 0.35 ? '#e8fbff' : '#38d6f0', size: Math.max(2, Math.round((1 + Math.random()) * 2 * u)) });
  }
  /** The tide turning: a line of foam sweeps across the mud (in when it rises, out when it falls), spray where it breaks. */
  wave(tiles: TilePosition[], rising: boolean, now: number) {
    if (!tiles.length) return;
    const cols = tiles.map(t => t.col);
    this.waves.push({ tiles, born: now, rising, c0: Math.min(...cols), c1: Math.max(...cols) });
    const u = this.tile / 64;
    for (const t of tiles) if (Math.random() < 0.35) { const c = this.toScreen(t.row, t.col); for (let k = 0; k < 3; k++) this.particles.push({ x: c.x + (Math.random() - 0.5) * this.tile * 0.6, y: c.y, vx: (Math.random() - 0.5) * u, vy: -(1 + Math.random() * 1.5) * u, g: 0.1 * u, life: 500, born: now + (t.col - Math.min(...cols)) * 90, color: Math.random() < 0.5 ? '#e8f8ff' : '#7ac8e8', size: Math.round(2.5 * u) }); }
  }
  /** Raft breaking away: its lashed plastic comes apart into pieces that drift off on the water and fade. */
  debris(tiles: TilePosition[], centre: TilePosition, now: number) {
    const u = this.tile / 64, plastic = ['#d8d0b8', '#b8b098', '#e4ecef', '#5a7a9a', '#2a2d31'];
    for (const t of tiles) for (let k = 0; k < 3; k++) {
      const c = this.toScreen(t.row, t.col), dx = t.col - centre.col, dy = t.row - centre.row, d = Math.max(1, Math.hypot(dx, dy));
      this.particles.push({ x: c.x + (Math.random() - 0.5) * this.tile * 0.7, y: c.y + (Math.random() - 0.5) * this.tile * 0.7, vx: (dx / d) * (0.25 + Math.random() * 0.4) * u, vy: (dy / d) * (0.2 + Math.random() * 0.3) * u, g: 0, life: 1800 + Math.random() * 600, born: now + Math.random() * 200, color: plastic[Math.floor(Math.random() * plastic.length)], size: Math.round((4 + Math.random() * 5) * u) });
    }
  }

  /** The signal leaving the host: 0..1 as the pale shape rises and fades (null when it isn't). */
  leaving(now: number): number | null { if (!this.leftAt || now < this.leftAt) return null; const k = (now - this.leftAt) / 1000; return k > 1 ? null : k; }

  /** A falling body sheds its implants: little moulded pieces that pop off and bounce on the deck. */
  private shed(at: TilePosition, born: number) {
    const c = this.toScreen(at.row, at.col), u = this.tile / 64;
    const plastic = ['#c23a2e', '#e07a1e', '#e4ecef', '#6a3ac8', '#ece2c8', '#c27a72', '#5a7a9a', '#b4b0a6'];
    for (let k = 0; k < 7; k++) { const a = -Math.PI / 2 + (Math.random() - 0.5) * 2.4; this.particles.push({ x: c.x, y: c.y - this.tile * 0.3, vx: Math.cos(a) * (1 + Math.random() * 1.8) * u, vy: Math.sin(a) * (3 + Math.random() * 2) * u, g: 0.22 * u, life: 1100, born, color: plastic[Math.floor(Math.random() * plastic.length)], size: Math.round((3 + Math.random() * 3) * u), floor: c.y + this.tile * 0.3 }); }
  }
  private dust(at: TilePosition, born: number) {
    const c = this.toScreen(at.row, at.col), u = this.tile / 64;
    for (let k = 0; k < 10; k++) { const a = Math.PI + Math.random() * Math.PI; this.particles.push({ x: c.x, y: c.y + this.tile * 0.3, vx: Math.cos(a) * 1.6 * u, vy: Math.sin(a) * 0.8 * u, g: 0.02, life: 500, born, color: Math.random() < 0.5 ? '#c8c0b0' : '#8a8478', size: Math.round(3 * u) }); }
  }
  private splash(at: TilePosition) {
    const c = this.toScreen(at.row, at.col), u = this.tile / 64, born = Date.now();
    for (let k = 0; k < 16; k++) { const a = -Math.PI / 2 + (Math.random() - 0.5) * 2.2; this.particles.push({ x: c.x, y: c.y + this.tile * 0.2, vx: Math.cos(a) * (1 + Math.random() * 2) * u, vy: Math.sin(a) * (2.5 + Math.random() * 2.5) * u, g: 0.16 * u, life: 600, born, color: Math.random() < 0.4 ? '#e8f8ff' : '#5ab0d8', size: Math.round(2.5 * u) }); }
    this.rings.push({ at, born, color: '#8ad8f0', reach: 0.6 });
  }

  // ── What the board asks while drawing ──

  /** Health and structure to show for a body until its blow lands. */
  shown(key: string): { hp: number; structure: number } | null { const c = this.held.get(key); return c ? { hp: c.hp[0], structure: c.structure[0] } : null; }
  /** Where to draw a body: as it was until the blow lands, then thrown along the way. Fractional tiles. */
  where(key: string, actual: TilePosition, now: number): { row: number; col: number; hop: number } {
    const c = this.held.get(key);
    if (c) return { row: c.pos[0].row, col: c.pos[0].col, hop: 0 };
    const t = this.throws.get(key);
    if (t) {
      const k = Math.max(0, Math.min(1, (now - t.start) / FX.shove));
      const e = 1 - Math.pow(1 - k, 3);
      // A body hitting something solid doesn't move: it jolts toward it and back
      const reach = same(t.from, t.to) ? Math.sin(k * Math.PI) * 0.18 : e;
      const tr = same(t.from, t.to) && t.slam ? 0 : 1;
      return { row: t.from.row + (t.to.row - t.from.row) * reach * tr, col: t.from.col + (t.to.col - t.from.col) * reach * tr, hop: Math.sin(k * Math.PI) * 0.12 };
    }
    return { row: actual.row, col: actual.col, hop: 0 };
  }
  /** The director is placing this body right now (its blow hasn't landed, or it's being thrown). */
  owns(key: string): boolean { return this.held.has(key) || this.throws.has(key); }
  /** Still drawn (alive on screen) though the rules say it's down: its blow hasn't landed, or it's falling. */
  visible(key: string): boolean { return this.held.has(key) || this.dying.has(key); }
  /** A falling body: 0..1 through its slump. */
  falling(key: string, now: number): number | null { const d = this.dying.get(key); return d ? Math.max(0, Math.min(1, (now - d.start) / FX.death)) : null; }
  /** Pixel offset (recoil) and whether it flashes white right now. */
  jolt(key: string, now: number): { dx: number; dy: number; white: boolean } {
    const r = this.recoils.get(key); let dx = 0, dy = 0;
    if (r) { const k = (now - r.start) / FX.recoil; if (k >= 0 && k <= 1) { const a = Math.sin(k * Math.PI) * this.tile * 0.07; dx = r.dx * a; dy = r.dy * a; } }
    const f = this.flashes.get(key);
    return { dx, dy, white: !!f && now <= f && now >= f - FX.flash - 10 };
  }
  shakeOffset(now: number): Pt {
    if (now > this.shakeUntil) return { x: 0, y: 0 };
    const k = (this.shakeUntil - now) / FX.shake, a = this.shakeAmp * k;
    return { x: (Math.random() - 0.5) * 2 * a, y: (Math.random() - 0.5) * 2 * a };
  }
  /** The pale chunk behind a bar: what was just lost, draining away. */
  chunk(key: string, now: number): { hp: [number, number]; s: [number, number] } | null {
    const c = this.chunks.get(key); if (!c) return null;
    const age = now - c.born;
    if (age < 0) return { hp: [c.to, c.from], s: [c.sTo, c.sFrom] };
    if (age > FX.chunkHold + FX.chunkDrain) { this.chunks.delete(key); return null; }
    const k = age < FX.chunkHold ? 0 : (age - FX.chunkHold) / FX.chunkDrain;
    return { hp: [c.to, c.from - (c.from - c.to) * k], s: [c.sTo, c.sFrom - (c.sFrom - c.sTo) * k] };
  }

  /** Under the bodies: the struck tiles flashing, rings. */
  drawUnder(ctx: CanvasRenderingContext2D, now: number) {
    const T = this.tile;
    for (const w of this.waves) {
      // One front of water rolling across the mud: a soft wash with a thin line of foam at its edge
      const k = (now - w.born) / 1100;
      const left = this.toScreen(0, w.c0).x - T / 2, right = this.toScreen(0, w.c1).x + T / 2;
      const front = w.rising ? left + (right - left) * k : right - (right - left) * k;
      for (const t of w.tiles) {
        const c = this.toScreen(t.row, t.col);
        const d = (w.rising ? front - c.x : c.x - front) / T; // tiles behind the front are wet
        if (d < -0.6 || d > 1.6) continue;
        ctx.save();
        ctx.globalAlpha = Math.max(0, Math.min(1, 1 - Math.abs(d - 0.3) / 1.3)) * 0.55;
        ctx.fillStyle = '#6ac0e0'; ctx.fillRect(c.x - T / 2 + 2, c.y - T / 2 + 2, T - 4, T - 4);
        ctx.restore();
      }
      if (k < 1) { ctx.save(); ctx.globalAlpha = Math.sin(Math.min(1, k) * Math.PI) * 0.9; ctx.fillStyle = '#eefaff';
        const rows = w.tiles.map(t => t.row), top = this.toScreen(Math.min(...rows), 0).y - T / 2, bot = this.toScreen(Math.max(...rows), 0).y + T / 2;
        for (let y = top; y < bot; y += Math.max(3, T * 0.08)) ctx.fillRect(front + Math.sin(y * 0.15 + now / 90) * T * 0.06 - 2, y, Math.max(2, T * 0.06), Math.max(2, T * 0.05));
        ctx.restore(); }
    }
    for (const f of this.tileFlashes) {
      const age = now - f.born; if (age < 0) continue;
      const a = Math.max(0, 1 - age / 380);
      const c = this.toScreen(f.tile.row, f.tile.col);
      ctx.save();
      ctx.globalAlpha = 0.75 * a;
      ctx.fillStyle = f.color;
      roundRect(ctx, c.x - T / 2 + 3, c.y - T / 2 + 3, T - 6, T - 6, T * 0.14); ctx.fill();
      ctx.globalAlpha = a;
      ctx.lineWidth = Math.max(2, T * 0.05); ctx.strokeStyle = '#ffffff'; ctx.stroke();
      ctx.restore();
    }
    for (const r of this.rings) {
      const age = now - r.born; if (age < 0) continue;
      const k = age / 500, c = this.toScreen(r.at.row, r.at.col);
      ctx.save(); ctx.globalAlpha = 1 - k; ctx.strokeStyle = r.color; ctx.lineWidth = Math.max(2, T * 0.08 * (1 - k));
      ctx.beginPath(); ctx.ellipse(c.x, c.y + T * 0.2, T * (0.3 + r.reach * k), T * (0.15 + r.reach * k * 0.5), 0, 0, Math.PI * 2); ctx.stroke(); ctx.restore();
    }
  }

  /** A guard going up on someone just now (0..1 through it), or null. */
  guarding(key: string, now: number): number | null { const t = this.guardsUp.get(key); if (t === undefined) return null; const k = (now - t) / 650; if (k > 1) { this.guardsUp.delete(key); return null; } return Math.max(0, k); }

  /** Over the bodies: shots in flight, sparks, numbers. */
  drawOver(ctx: CanvasRenderingContext2D, now: number, drawNumber: (text: string, x: number, y: number, alpha: number, color: string, big: boolean) => void) {
    const T = this.tile;
    if (now < this.flashUntil) { ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.globalAlpha = 0.45 * ((this.flashUntil - now) / 240); ctx.fillStyle = '#eafcff'; ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height); ctx.restore(); }
    for (const sh of this.shots) {
      const k = (now - sh.born) / Math.max(1, sh.dur); if (k < 0) continue;
      const a = this.toScreen(sh.s.from.row, sh.s.from.col), farTile = sh.s.tiles.reduce((m, t) => (dist(sh.s.from, t) > dist(sh.s.from, m) ? t : m), sh.s.aim);
      const b = this.toScreen(farTile.row, farTile.col), lift = T * 0.38;
      const color = dmgColor(sh.s.physical);
      ctx.save();
      if (sh.s.pattern === 'beam' || sh.s.pattern === 'pierce') {
        // A line that draws out, holds, then thins away
        const reach = Math.min(1, k * 1.6), fade = k > 1 ? Math.max(0, 1 - (k - 1) * 4) : 1;
        ctx.globalAlpha = fade; ctx.strokeStyle = color; ctx.lineWidth = T * (sh.s.pattern === 'beam' ? 0.16 : 0.08); ctx.lineCap = 'round';
        ctx.beginPath(); ctx.moveTo(a.x, a.y - lift); ctx.lineTo(a.x + (b.x - a.x) * reach, a.y - lift + (b.y - a.y) * reach); ctx.stroke();
        ctx.strokeStyle = '#ffffff'; ctx.lineWidth *= 0.35; ctx.stroke();
      } else if (sh.s.pattern === 'grapple') {
        // A hook flies out on a line, then the line reels back
        const out = k < 1 ? k : Math.max(0, 1 - (k - 1) * 5);
        const hx = a.x + (b.x - a.x) * out, hy = a.y - lift + (b.y - a.y) * out;
        ctx.strokeStyle = '#2a2d31'; ctx.lineWidth = Math.max(2, T * 0.04); ctx.beginPath(); ctx.moveTo(a.x, a.y - lift); ctx.lineTo(hx, hy); ctx.stroke();
        ctx.fillStyle = '#d8dcd6'; ctx.fillRect(hx - T * 0.06, hy - T * 0.06, T * 0.12, T * 0.12);
      } else if (k <= 1) {
        // A round in flight (a lob arcs, with its shadow on the floor)
        const x = a.x + (b.x - a.x) * k, y0 = a.y + (b.y - a.y) * k;
        const arc = sh.s.pattern === 'lob' ? Math.sin(k * Math.PI) * T * 1.4 : 0;
        if (arc) { ctx.fillStyle = 'rgba(0,0,0,0.35)'; ctx.beginPath(); ctx.ellipse(x, y0 + T * 0.25, T * 0.1, T * 0.05, 0, 0, Math.PI * 2); ctx.fill(); }
        const y = y0 - lift - arc;
        ctx.strokeStyle = color; ctx.globalAlpha = 0.5; ctx.lineWidth = T * 0.07; ctx.beginPath(); ctx.moveTo(x - (b.x - a.x) * 0.12, y - (b.y - a.y) * 0.12); ctx.lineTo(x, y); ctx.stroke();
        ctx.globalAlpha = 1; ctx.fillStyle = '#ffffff'; const r = T * 0.06; ctx.fillRect(x - r, y - r, r * 2, r * 2);
      }
      ctx.restore();
    }
    for (const q of this.particles) {
      const t = now - q.born; if (t < 0) continue;
      const steps = t / 16;
      const x = q.x + q.vx * (q.floor !== undefined ? Math.min(steps, 28) : steps);
      let y = q.y + q.vy * steps + q.g * steps * steps * 0.5;
      // Pieces with a floor land on it and stay (a little bounce, then still)
      if (q.floor !== undefined && y > q.floor) y = q.floor - Math.abs(Math.sin(steps * 0.5)) * Math.max(0, 6 - steps * 0.1);
      ctx.globalAlpha = Math.max(0, 1 - t / q.life); ctx.fillStyle = q.color;
      ctx.fillRect(Math.round(x), Math.round(y), q.size, q.size);
    }
    ctx.globalAlpha = 1;
    for (const n of this.numbers) {
      const t = now - n.born; if (t < 0) continue;
      const tile = this.pos.get(n.key); if (!tile) continue;
      const c = this.toScreen(tile.row, tile.col), k = t / FX.numbers;
      // Pops up fast, hangs, then drifts and fades
      const rise = (1 - Math.pow(1 - Math.min(1, k * 3), 3)) * T * 0.55 + k * T * 0.25;
      drawNumber(n.text, c.x, c.y - T * 0.75 - rise, k < 0.7 ? 1 : (1 - k) / 0.3, n.color, n.big);
    }
  }
}

const same = (a: TilePosition, b: TilePosition) => a.row === b.row && a.col === b.col;
/** The damage colour: amber for physical, violet for special, blended between (as aimed tiles). */
export function dmgColor(physical: number): string {
  const p = Math.max(0, Math.min(1, physical));
  const r = Math.round(255 * p + 170 * (1 - p)), g = Math.round(176 * p + 110 * (1 - p)), b = Math.round(60 * p + 255 * (1 - p));
  return `rgb(${r},${g},${b})`;
}
function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
}

/**
 * A guard: a curved wall of small moulded plates in front of a body. `rise` 0..1 plays it going
 * up (plates snapping in one by one, a flash), and without it, it's the faint wall that holds
 * while the guard lasts.
 */
export function drawGuard(ctx: CanvasRenderingContext2D, cx: number, cy: number, tile: number, faceLeft: boolean, now: number, rise: number | null, color = '#7fe9ff') {
  const n = 7, r = tile * 0.46, dir = faceLeft ? -1 : 1;
  ctx.save();
  for (let k = 0; k < n; k++) {
    const t = k / (n - 1), a = (-0.55 + t * 1.1) * Math.PI * 0.5;
    const shown = rise === null ? 1 : Math.max(0, Math.min(1, (rise * 1.6 - t * 0.6) * 2));
    if (shown <= 0) continue;
    const x = cx + dir * Math.cos(a) * r, y = cy - tile * 0.38 + Math.sin(a) * r * 1.1;
    const w = tile * 0.12 * (0.6 + 0.4 * shown), h = tile * 0.2 * (0.6 + 0.4 * shown);
    ctx.globalAlpha = rise === null ? 0.28 + 0.08 * Math.sin(now / 300 + k) : Math.min(1, shown) * (1 - Math.max(0, (rise - 0.6) / 0.4) * 0.7);
    ctx.fillStyle = color; ctx.fillRect(x - w / 2, y - h / 2, w, h);
    ctx.fillStyle = '#ffffff'; ctx.fillRect(x - w / 2, y - h / 2, w, Math.max(1, h * 0.18));
  }
  ctx.restore();
}
