// Pixel-art people built from what they carry. Every character is a body
// (a frame: one per firmware, and a few for enemies) with its implants drawn on
// where they're fitted: the maker sets the style, the rarity how much of it
// there is, upgrades add lit marks. Implants are moulded plastic: rounded
// shells with a glossy edge, joined by black rubber. A thin rim in the team's
// colour (white you, teal allies, red enemies) says whose side someone is on.
// Frames are painted once per look, pose and frame, and cached.

import type { AnimationState } from './pixelSprites';

export type Team = 'you' | 'ally' | 'enemy';
export type MakerKey = 'volkov' | 'tianxia' | 'helix' | 'kizuna' | 'crown' | 'cbn' | 'ioa' | 'parsu' | 'patchwork' | 'unmarked';
export type BodySlot = 'left_arm' | 'right_arm' | 'left_leg' | 'right_leg' | 'eyes' | 'ears' | 'nose' | 'brain' | 'lungs' | 'misc';
/** One fitted implant as drawn: its maker, its rarity (0 common .. 4 legendary) and upgrade nodes taken. */
export interface PartLook { maker: MakerKey; tier: number; ups?: number }
export type HeadKind = 'bare' | 'hood' | 'helmet' | 'visor' | 'mask' | 'surgical' | 'cap' | 'scarf' | 'crown' | 'blank';
export type Weapon = 'none' | 'hook' | 'baton' | 'gun' | 'scalpel' | 'shield';

export interface Frame {
  S: number; shoulder: number; hip: number; top: number; bot: number; lean: number;
  headR: number; headRy: number; headY: number; armLen: number;
  skin: string; cloth: string; skin2?: string; cloth2?: string; hair?: string; eyes?: string; accent?: string;
  neck?: number; stitches?: boolean; rags?: boolean; plates?: boolean; slabs?: string; coat?: number; collar?: boolean;
  scarf?: string; scarfLen?: number; harness?: boolean; pack?: boolean; cap?: string; cloak?: boolean; seam?: boolean;
  uneven?: boolean; robe?: boolean; king?: boolean; drone?: boolean; drip?: boolean; special?: 'swarm' | 'quadruped' | 'gantry' | 'tower';
}

export interface DollSpec {
  frame: FrameId;
  team: Team;
  parts?: Partial<Record<BodySlot, PartLook>>;
  /** Colours and touches over the frame's own. */
  look?: Partial<Frame>;
  head?: HeadKind;
  chest?: string[];
  weapon?: Weapon;
  /** The Patchwork King's own parts still bolted on (they come off in the fight). */
  kingParts?: string[];
  /** A boss's own signature pieces, by its name (see SIGNATURES). */
  signature?: string;
}

// ── Makers: plastic colours ─────────────────────────────────────────────────
interface Pal { main: string; dark: string; lit: string; light: string; stripe?: string; seam?: string; gem?: string; graft?: string; stitch?: string }
const MAKERS: Record<MakerKey, Pal> = {
  volkov:    { main: '#c23a2e', dark: '#6e1d16', lit: '#ee7a62', light: '#ffb04a' },
  tianxia:   { main: '#e07a1e', dark: '#7a3e0c', lit: '#ffae4a', light: '#ffe04a', stripe: '#1c1a18' },
  helix:     { main: '#e4ecef', dark: '#8a99a2', lit: '#ffffff', light: '#5ff0e4', seam: '#2ec8c0' },
  kizuna:    { main: '#6a3ac8', dark: '#2e1470', lit: '#9a6af0', light: '#f0b0ff' },
  crown:     { main: '#ece2c8', dark: '#a8945a', lit: '#fffaf0', light: '#ffe08a', gem: '#e83a5a' },
  cbn:       { main: '#c27a72', dark: '#6a2e2a', lit: '#e8a89a', light: '#c0ff6a', graft: '#5a9a4a', stitch: '#2a0a0a' },
  ioa:       { main: '#5a7a9a', dark: '#24364a', lit: '#8aaccc', light: '#4ad8ff' },
  parsu:     { main: '#a8987a', dark: '#5e5240', lit: '#d0c4a4', light: '#ffd890' },
  patchwork: { main: '#7a848c', dark: '#3a4248', lit: '#a0aab2', light: '#ffcf4a' },
  unmarked:  { main: '#b4b0a6', dark: '#6e6a62', lit: '#d8d4ca', light: '#f0ece2' },
};
const PATCH_CYCLE: MakerKey[] = ['volkov', 'tianxia', 'helix', 'cbn', 'ioa'];
/** Cheap off-white plastic: what a common part is moulded from, in its maker's shape. */
const COMMON: Pal = { main: '#b4b0a6', dark: '#6e6a62', lit: '#d8d4ca', light: '#f0ece2', stripe: '#5a564e', seam: '#8a867c', gem: '#8a867c', graft: '#8a867c', stitch: '#4a463e' };
const pal = (maker: MakerKey, tier: number, seg = 0): Pal =>
  tier <= 0 || maker === 'unmarked' ? COMMON : maker === 'patchwork' ? MAKERS[PATCH_CYCLE[seg % PATCH_CYCLE.length]] : MAKERS[maker];
const RUBBER = '#2a2d31', RUBBER_LIT = '#454a50', OUTLINE = '#0a0f14';
const TEAM: Record<Team, string> = { you: '#eef8ff', ally: '#2ee6c8', enemy: '#ff4a3a' };

export function shade(hex: string, amt: number): string {
  const n = parseInt(hex.slice(1, 7), 16);
  const f = (c: number) => Math.max(0, Math.min(255, Math.round(c + (amt > 0 ? (255 - c) * amt : c * amt))));
  return `#${[(n >> 16) & 255, (n >> 8) & 255, n & 255].map(c => f(c).toString(16).padStart(2, '0')).join('')}`;
}

// ── Frames ──────────────────────────────────────────────────────────────────
// Pixel numbers on an S×S grid; the character faces right.
export const FRAMES = {
  // One per firmware
  unclassified: { S: 48, shoulder: 4, hip: 3, top: 20, bot: 31, lean: 1, headR: 4, headRy: 5, headY: 13, armLen: 13, skin: '#8f979b', cloth: '#3b4652', stitches: true, rags: true },
  enforcer:     { S: 48, shoulder: 8, hip: 5, top: 19, bot: 32, lean: 0, headR: 5, headRy: 4, headY: 14, armLen: 13, skin: '#8a6e5a', cloth: '#34363c', neck: 5, plates: true, slabs: '#5a5e66' },
  operative:    { S: 48, shoulder: 4, hip: 3, top: 16, bot: 29, lean: 0, headR: 4, headRy: 5, headY: 9, armLen: 14, skin: '#a08070', cloth: '#1e2a36', coat: 14, collar: true, hair: '#14181c' },
  courier:      { S: 48, shoulder: 4, hip: 3, top: 20, bot: 28, lean: 5, headR: 4, headRy: 4, headY: 14, armLen: 12, skin: '#7a6458', cloth: '#2c3a30', scarf: '#3ac8a0', scarfLen: 12, hair: '#e8e0d0' },
  foreman:      { S: 48, shoulder: 6, hip: 5, top: 19, bot: 32, lean: 0, headR: 5, headRy: 5, headY: 13, armLen: 13, skin: '#9a7a64', cloth: '#3a4a3a', harness: true, pack: true, cap: '#d8a020' },
  wretch:       { S: 48, shoulder: 5, hip: 4, top: 23, bot: 33, lean: 4, headR: 4, headRy: 4, headY: 19, armLen: 14, skin: '#7d7466', cloth: '#2e2a26', cloak: true, stitches: true },
  splice:       { S: 48, shoulder: 5, hip: 4, top: 19, bot: 31, lean: 1, headR: 4, headRy: 5, headY: 12, armLen: 13, skin: '#9a8a7a', skin2: '#6a7a8a', cloth: '#3a2e3e', cloth2: '#5a4a2e', seam: true, uneven: true },
  // Enemy and ally bodies
  standard:     { S: 48, shoulder: 5, hip: 4, top: 19, bot: 31, lean: 0, headR: 4, headRy: 5, headY: 12, armLen: 13, skin: '#9a7a64', cloth: '#3a4652' },
  stalker:      { S: 48, shoulder: 4, hip: 3, top: 17, bot: 30, lean: 2, headR: 4, headRy: 5, headY: 10, armLen: 15, skin: '#6c7078', cloth: '#2a2e36' },
  brute:        { S: 48, shoulder: 8, hip: 6, top: 18, bot: 33, lean: 0, headR: 4, headRy: 4, headY: 13, armLen: 14, skin: '#8a6e5a', cloth: '#d9772b', neck: 5 },
  crawler:      { S: 48, shoulder: 5, hip: 4, top: 25, bot: 34, lean: 5, headR: 4, headRy: 4, headY: 22, armLen: 13, skin: '#7d7466', cloth: '#4d5236' },
  // Bosses: a little bigger, with bigger heads so what they wear there reads
  boss:         { S: 56, shoulder: 7, hip: 5, top: 23, bot: 37, lean: 0, headR: 5, headRy: 6, headY: 15, armLen: 15, skin: '#9a7a64', cloth: '#3a4652' },
  bossBrute:    { S: 56, shoulder: 10, hip: 7, top: 22, bot: 38, lean: 0, headR: 5, headRy: 5, headY: 15, armLen: 16, skin: '#8a6e5a', cloth: '#3a4652', neck: 6 },
  king:         { S: 56, shoulder: 10, hip: 7, top: 22, bot: 38, lean: 1, headR: 5, headRy: 6, headY: 14, armLen: 16, skin: '#8a7a6a', skin2: '#6e7c86', cloth: '#3e2a48', robe: true, king: true, neck: 5 },
  sleeper:      { S: 48, shoulder: 4, hip: 3, top: 22, bot: 32, lean: 3, headR: 4, headRy: 5, headY: 17, armLen: 14, skin: '#a8a49c', cloth: '#c8d4d8', coat: 9, drip: true },
  bigSleeper:   { S: 56, shoulder: 6, hip: 5, top: 26, bot: 38, lean: 4, headR: 5, headRy: 6, headY: 20, armLen: 16, skin: '#a8a49c', cloth: '#c8d4d8', coat: 11, drip: true },
  swarm:        { S: 48, shoulder: 0, hip: 0, top: 0, bot: 0, lean: 0, headR: 0, headRy: 0, headY: 0, armLen: 0, skin: '#000000', cloth: '#3a4652', special: 'swarm' },
  quadruped:    { S: 48, shoulder: 0, hip: 0, top: 0, bot: 0, lean: 0, headR: 0, headRy: 0, headY: 0, armLen: 0, skin: '#000000', cloth: '#3a4652', special: 'quadruped' },
  tower:        { S: 56, shoulder: 0, hip: 0, top: 0, bot: 0, lean: 0, headR: 0, headRy: 0, headY: 0, armLen: 0, skin: '#8a7a6a', cloth: '#3a4652', special: 'tower' },
  gantry:       { S: 48, shoulder: 0, hip: 0, top: 0, bot: 0, lean: 0, headR: 0, headRy: 0, headY: 0, armLen: 0, skin: '#000000', cloth: '#3a4652', special: 'gantry' },
  drone:        { S: 48, shoulder: 0, hip: 0, top: 0, bot: 0, lean: 0, headR: 0, headRy: 0, headY: 0, armLen: 0, skin: '#000000', cloth: '#000000', drone: true },
} satisfies Record<string, Frame>;
export type FrameId = keyof typeof FRAMES;

// ── Painting ────────────────────────────────────────────────────────────────
interface Grid { S: number; c: (string | null)[][]; glow: { x: number; y: number; col: string; r: number }[] }
const makeGrid = (S: number): Grid => ({ S, c: Array.from({ length: S }, () => Array<string | null>(S).fill(null)), glow: [] });
type Painter = ReturnType<typeof api>;
function api(g: Grid) {
  const px = (x: number, y: number, col: string | undefined) => { x = Math.round(x); y = Math.round(y); if (col && x >= 0 && y >= 0 && x < g.S && y < g.S) g.c[y][x] = col; };
  const rect = (x: number, y: number, w: number, h: number, col: string | undefined) => { for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) px(x + i, y + j, col); };
  const oval = (cx: number, cy: number, rx: number, ry: number, col: string) => { for (let y = -ry; y <= ry; y++) for (let x = -rx; x <= rx; x++) if ((x * x) / (rx * rx + 0.3) + (y * y) / (ry * ry + 0.3) <= 1) px(cx + x, cy + y, col); };
  const glow = (x: number, y: number, col: string, r = 3) => { g.glow.push({ x, y, col, r }); };
  const clear = (x: number, y: number) => { if (x >= 0 && y >= 0 && x < g.S && y < g.S) g.c[y][x] = null; };
  const at = (x: number, y: number) => g.c[y]?.[x] ?? null;
  return { px, rect, oval, glow, clear, at };
}
type Dim = (c: string) => string;
const same: Dim = c => c;

/** A moulded plastic shell: rounded corners, a lit top-left edge with a glossy highlight, a darker underside. */
function shell(P: Painter, x: number, y: number, w: number, h: number, p: Pal, dim: Dim = same) {
  if (w <= 0 || h <= 0) return;
  P.rect(x, y, w, h, dim(p.main));
  P.rect(x, y + h - 1, w, 1, dim(p.dark)); P.rect(x + w - 1, y + 1, 1, h - 1, dim(shade(p.main, -0.18)));
  P.rect(x + 1, y, Math.max(1, w - 2), 1, dim(p.lit)); P.rect(x, y + 1, 1, Math.max(1, h - 2), dim(p.lit));
  if (w >= 3 && h >= 3) P.px(x + 1, y + 1, dim(shade(p.lit, 0.55)));
  if (w >= 3 && h >= 2) { P.clear(x, y); P.clear(x + w - 1, y); P.clear(x, y + h - 1); P.clear(x + w - 1, y + h - 1); }
}
/** Lit pips for upgrade nodes taken on a part (up to 3). */
function pips(P: Painter, x: number, y: number, n: number, col: string) { for (let i = 0; i < Math.min(3, n); i++) P.px(x, y + i * 2, col); }

// Each maker's limb: shell widths, its hand and its decal
const LIMB: Record<MakerKey, { up: number; fore: number; hand: 'fist' | 'claw' | 'mitt' | 'blade' | 'hand'; decal?: string }> = {
  volkov:    { up: 4, fore: 6, hand: 'fist' },
  tianxia:   { up: 3, fore: 5, hand: 'claw', decal: 'hazard' },
  helix:     { up: 3, fore: 4, hand: 'mitt', decal: 'seam' },
  kizuna:    { up: 2, fore: 3, hand: 'blade', decal: 'edge' },
  crown:     { up: 3, fore: 3, hand: 'hand', decal: 'trim' },
  cbn:       { up: 3, fore: 5, hand: 'claw', decal: 'stitch' },
  ioa:       { up: 3, fore: 4, hand: 'hand', decal: 'lamp' },
  parsu:     { up: 4, fore: 5, hand: 'fist', decal: 'grain' },
  patchwork: { up: 3, fore: 4, hand: 'hand', decal: 'patch' },
  unmarked:  { up: 3, fore: 4, hand: 'hand' },
};

/** An arm hanging from the shoulder (sx, sy). Returns where its hand is. */
function paintArm(P: Painter, F: Frame, part: PartLook | undefined, sx: number, sy: number, front: boolean): { x: number; y: number } {
  const len = F.armLen;
  const dim: Dim = c => (front ? c : shade(c, -0.28));
  const upper = Math.round(len * 0.42), fore = len - upper - 2;
  if (!part) {
    P.rect(sx, sy, 3, upper, dim(F.cloth));
    P.rect(sx, sy + upper, 3, fore + 1, dim(F.skin));
    P.rect(sx, sy + len - 1, 3, 2, dim(shade(F.skin, -0.25)));
    return { x: sx + 1, y: sy + len };
  }
  const { maker, tier, ups = 0 } = part;
  const L = LIMB[maker], p = pal(maker, tier), big = tier >= 2 ? 1 : 0;
  const pp = (k: number) => (maker === 'patchwork' ? pal(maker, tier, k) : p);
  P.rect(sx, sy - 1, L.up, 2, dim(RUBBER));
  shell(P, sx, sy, L.up, upper, pp(0), dim);
  P.rect(sx, sy + upper, Math.max(2, L.up - 1), 2, dim(RUBBER)); P.px(sx, sy + upper, dim(RUBBER_LIT));
  const fw = L.fore + big, fx = sx - Math.floor((fw - L.up) / 2), fy = sy + upper + 2;
  shell(P, fx, fy, fw, fore, pp(1), dim);
  const d = L.decal;
  if (tier >= 1 && d === 'hazard') for (let y = fy + 2; y < fy + fore - 1; y += 2) P.rect(fx + 1, y, fw - 2, 1, dim(p.stripe!));
  if (tier >= 1 && d === 'seam') P.rect(fx + Math.floor(fw / 2), fy + 1, 1, fore - 2, dim(p.seam!));
  if (tier >= 1 && d === 'edge') P.rect(fx + fw - 1, fy, 1, fore, dim(p.light));
  if (tier >= 1 && d === 'trim') { P.rect(fx, fy + 1, fw, 1, dim(p.dark)); P.px(fx + 1, fy + Math.floor(fore / 2), p.gem); }
  if (d === 'stitch') { for (let y = fy + 1; y < fy + fore - 1; y += 2) P.px(fx + Math.floor(fw / 2), y, dim(p.stitch ?? '#222222')); if (tier >= 1) P.rect(fx - 1, sy + 2, 1, upper + fore, dim(p.graft!)); }
  if (tier >= 1 && d === 'lamp') P.px(fx + fw - 2, fy + 2, p.light);
  if (d === 'grain') for (let y = fy + 1; y < fy + fore - 1; y += 2) P.px(fx + 1 + (y % 3), y, dim(p.dark));
  const hy = fy + fore;
  if (L.hand === 'fist') shell(P, fx, hy, fw, 3, pp(2), dim);
  else if (L.hand === 'claw') { P.rect(fx, hy, fw, 1, dim(RUBBER)); P.rect(fx, hy + 1, 1, 3, dim(p.lit)); P.rect(fx + fw - 1, hy + 1, 1, 3, dim(p.lit)); P.px(fx + Math.floor(fw / 2), hy + 2, dim(p.lit)); }
  else if (L.hand === 'mitt') P.oval(fx + Math.floor(fw / 2), hy + 1, Math.max(1, Math.floor(fw / 2)), 2, dim(p.main));
  else if (L.hand === 'blade') { const bl = 4 + tier; P.rect(fx + 1, hy, 1, bl, dim(shade(p.lit, 0.3))); P.px(fx + 1, hy + bl, '#ffffff'); if (tier >= 1) P.rect(fx, hy, 1, bl - 1, dim(p.main)); }
  else { P.rect(fx, hy, fw, 2, dim(RUBBER)); P.rect(fx, hy + 2, Math.max(1, fw - 1), 1, dim(RUBBER_LIT)); }
  if (tier >= 3) { P.px(fx + 1, fy + 1, p.light); P.glow(fx + 1, fy + 1, p.light, tier >= 4 ? 5 : 3); }
  if (tier >= 4) P.glow(fx + 1, hy, p.light, 5);
  if (ups) pips(P, fx + fw - 2, fy + 2, ups, p.light);
  return { x: fx + Math.floor(fw / 2), y: hy + 1 };
}

function paintLeg(P: Painter, F: Frame, part: PartLook | undefined, x: number, top: number, front: boolean) {
  const foot = F.S - 3;
  const dim: Dim = c => (front ? c : shade(c, -0.25));
  if (!part) {
    P.rect(x, top, 3, foot - top, dim(shade(F.cloth, -0.3)));
    P.rect(x, foot, 4, 2, dim('#1c2024'));
    return;
  }
  const { maker, tier, ups = 0 } = part;
  const L = LIMB[maker], p = pal(maker, tier), big = tier >= 2 ? 1 : 0;
  const pp = (k: number) => (maker === 'patchwork' ? pal(maker, tier, k + 2) : p);
  const knee = Math.round((top + foot) / 2);
  const w = Math.max(3, Math.min(5, L.up + big));
  if (maker === 'kizuna') {
    // Bent backwards at the knee, like a runner's blade
    shell(P, x, top, 3, knee - top, p, dim); P.rect(x - 2, knee, 3, 2, dim(RUBBER));
    shell(P, x - 2, knee + 2, 2, foot - knee - 2, p, dim); P.rect(x - 2, foot, 5, 2, dim(p.dark));
    if (tier >= 1) P.px(x - 2, knee + 3, p.light);
  } else {
    const wide = L.fore > 4 ? 1 : 0;
    shell(P, x, top, w, knee - top, pp(0), dim);
    P.rect(x, knee, w, 1, dim(RUBBER));
    shell(P, x - wide, knee + 1, w + wide, foot - knee - 1, pp(1), dim);
    P.rect(x - 1, foot, w + 2, 2, dim(maker === 'tianxia' ? '#1c1a18' : p.dark));
    if (tier >= 1 && L.decal === 'hazard') for (let y = knee + 2; y < foot - 1; y += 2) P.rect(x + 1, y, w - 2, 1, dim(p.stripe!));
    if (tier >= 1 && L.decal === 'seam') P.rect(x + 1, top + 1, 1, foot - top - 2, dim(p.seam!));
    if (L.decal === 'stitch' && tier >= 1) P.rect(x - 1, knee - 3, 1, 6, dim(p.graft!));
    if (tier >= 1 && L.decal === 'lamp') P.px(x + w - 2, knee + 2, p.light);
  }
  if (tier >= 3) { P.px(x + 1, knee - 2, p.light); P.glow(x + 1, knee - 2, p.light, tier >= 4 ? 5 : 3); }
  if (ups) pips(P, x + 1, top + 2, ups, p.light);
}

/** What a character wears on its head (from its look): drawn before head implants, which sit on top. */
function paintHeadwear(P: Painter, F: Frame, head: HeadKind | undefined, hx: number, hy: number, accent: string) {
  const r = F.headR, ry = F.headRy, cloth = F.cloth, clothDark = shade(cloth, -0.35), hair = F.hair ?? '#20262c';
  switch (head) {
    case 'bare': P.oval(hx - 1, hy - ry + 1, r, 2, hair); P.rect(hx - r, hy - ry + 1, 2, 4, hair); break;
    case 'hood': P.oval(hx - 1, hy, r + 1, ry + 1, clothDark); P.oval(hx + 1, hy + 1, r - 1, ry - 2, '#14181c'); P.px(hx + 1, hy, F.eyes ?? '#d8dee2'); P.px(hx + 3, hy, F.eyes ?? '#d8dee2'); break;
    case 'helmet': P.oval(hx, hy - 2, r + 1, Math.max(2, ry - 2), hair); P.rect(hx - r - 1, hy - 1, r * 2 + 3, 1, shade(hair, -0.3)); break;
    case 'visor': P.oval(hx, hy, r, ry, shade(cloth, -0.2)); P.rect(hx - 1, hy - 1, r + 3, 2, accent); P.px(hx + r, hy - 1, shade(accent, 0.5)); break;
    case 'mask': P.oval(hx, hy, r, ry, '#c8ccc4'); P.rect(hx, hy, r + 2, 1, accent); P.rect(hx - r, hy - 1, 1, 4, '#8a8e86'); break;
    case 'surgical': P.oval(hx, hy - ry + 2, r, 2, shade(cloth, 0.2)); P.rect(hx - 1, hy + 1, r + 2, 3, accent); break;
    case 'cap': P.rect(hx - r, hy - ry, r * 2 + 1, 3, cloth); P.rect(hx, hy - ry + 2, r + 3, 1, clothDark); P.px(hx - 1, hy - ry + 1, accent); break;
    case 'scarf': P.oval(hx - 1, hy - ry + 2, r, 3, cloth); P.rect(hx - r, hy + 1, r * 2 + 2, 3, clothDark); break;
    case 'blank': P.px(hx + 1, hy, shade(F.skin, 0.25)); P.px(hx + 3, hy, F.skin); break;
    default: break;
  }
}

function paintHeadParts(P: Painter, F: Frame, parts: DollSpec['parts'] & object, hx: number, hy: number) {
  const r = F.headR;
  const e = parts.eyes;
  if (e) {
    const p = pal(e.maker, e.tier);
    if (e.maker === 'volkov') { P.oval(hx + 2, hy, 2, 2, p.dark); P.oval(hx + 2, hy, 1, 1, p.lit); P.px(hx + 2, hy, e.tier ? p.light : '#d0d8dc'); }
    else if (e.maker === 'kizuna') { P.rect(hx, hy, r + 2, 1, p.main); P.rect(hx + 1, hy, r, 1, e.tier ? p.light : p.lit); }
    else if (e.maker === 'crown') { P.rect(hx + 1, hy - 1, 3, 3, p.main); P.px(hx + 2, hy, e.tier ? p.gem : p.lit); P.px(hx + 2, hy - 2, p.lit); }
    else if (e.maker === 'cbn') { P.px(hx + 1, hy, p.light); P.px(hx + 3, hy, p.light); P.px(hx + 2, hy - 2, e.tier ? p.light : COMMON.lit); P.px(hx + 3, hy + 1, e.tier ? p.graft : COMMON.dark); }
    else if (e.maker === 'helix') { P.rect(hx - 1, hy - 1, r + 3, 3, p.main); P.rect(hx, hy, r + 2, 1, e.tier ? p.seam : p.dark); }
    else if (e.maker === 'tianxia') { P.rect(hx - r, hy - 1, r * 2 + 1, 1, '#1c1a18'); P.rect(hx + 1, hy - 1, 3, 2, p.main); P.px(hx + 2, hy - 1, p.light); }
    else { P.rect(hx + 1, hy - 1, 3, 3, p.dark); P.px(hx + 2, hy, e.tier ? p.light : p.lit); }
    if (e.tier >= 3) P.glow(hx + 2, hy, p.light, e.tier >= 4 ? 6 : 4);
  }
  const ear = parts.ears;
  if (ear) { const p = pal(ear.maker, ear.tier); P.oval(hx - r, hy, 1, 2, p.main); P.px(hx - r, hy, p.dark); if (ear.tier >= 1) { P.rect(hx - r - 1, hy - r - 3, 1, r + 2, p.dark); P.px(hx - r - 1, hy - r - 4, p.light); } if (ear.tier >= 3) P.glow(hx - r - 1, hy - r - 4, p.light, 3); }
  const nose = parts.nose;
  if (nose) { const p = pal(nose.maker, nose.tier); shell(P, hx, hy + 2, r + 2, 3, p); P.rect(hx + r, hy + 3, 2, 1, p.dark); if (nose.tier >= 1) P.px(hx + 1, hy + 3, p.light); }
  const brain = parts.brain;
  if (brain) {
    const p = pal(brain.maker, brain.tier);
    shell(P, hx - r + 1, hy - F.headRy, r * 2 - 1, 3, p);
    if (brain.tier >= 1) for (let i = -r + 2; i < r; i += 3) P.px(hx + i, hy - F.headRy + 1, p.light);
    if (brain.tier >= 2) { P.rect(hx - 1, hy - F.headRy - 3, 1, 3, RUBBER); P.px(hx - 1, hy - F.headRy - 4, p.light); }
    if (brain.tier >= 3) P.glow(hx, hy - F.headRy, p.light, brain.tier >= 4 ? 6 : 4);
  }
}

function paintBackParts(P: Painter, parts: DollSpec['parts'] & object, tl: number, top: number, bot: number) {
  const l = parts.lungs;
  if (l) { const p = pal(l.maker, l.tier), t = l.tier >= 2 ? 1 : 0; shell(P, tl - 4 - t, top + 1, 4 + t, 8 + t, p); P.rect(tl - 3 - t, top, 2, 1, RUBBER); if (l.tier >= 1) { P.px(tl - 2, top + 3, p.light); P.px(tl - 2, top + 6, p.light); } if (l.tier >= 3) P.glow(tl - 2, top + 4, p.light, 4); }
  const sp = parts.misc;
  if (sp) { const p = pal(sp.maker, sp.tier); for (let y = top - 1; y <= bot; y += 2) { P.rect(tl - 1, y, 2, 1, p.main); P.px(tl - 1, y + 1, p.dark); } if (sp.tier >= 2) for (let k = 0; k < 3; k++) P.rect(tl - 2 - k, top - 2 - k * 2, 1, 2, p.lit); if (sp.tier >= 3) P.glow(tl - 3, top - 4, p.light, 4); }
}

interface Pose { dx: number; by: number; legPhase: number; reach: boolean; /** 0-3 through an idle cycle, -1 otherwise. */ idle: number }
function poseOf(state: AnimationState, f: number): Pose {
  if (state === 'walk') return { dx: 0, by: f % 2, legPhase: [0, 1, 0, -1, 0, 1][f % 6], reach: false, idle: -1 };
  if (state === 'attack') return { dx: [0, 1, 3, 2, 1][f % 5], by: 0, legPhase: 0, reach: f % 5 >= 1 && f % 5 <= 3, idle: -1 };
  if (state === 'defend') return { dx: 0, by: 1, legPhase: 0, reach: true, idle: -1 };
  if (state === 'hurt') return { dx: [-2, -1, 0][f % 3], by: 0, legPhase: 0, reach: false, idle: -1 };
  // Idle: a slow breath (down on the out-breath)
  return { dx: 0, by: [0, 0, 1, 1][f % 4], legPhase: 0, reach: false, idle: f % 4 };
}

/** The front arm thrust forward: painted hanging, then turned to point the way the character faces. */
function paintArmForward(P: Painter, g: Grid, F: Frame, part: PartLook | undefined, sx: number, sy: number) {
  const T = makeGrid(g.S), TP = api(T);
  const ox = 10, oy = 4;
  paintArm(TP, F, part, ox, oy, true);
  // A Volkov arm punches out on its piston; a Tianxia claw reaches a little further
  const thrust = part?.maker === 'volkov' ? 3 : part?.maker === 'tianxia' ? 1 : 0;
  // The piston rod shows in the gap as the forearm shoots out
  if (thrust) { P.rect(sx + 5, sy, thrust + 2, 2, '#2a2d31'); P.rect(sx + 5, sy, thrust + 2, 1, '#8a949c'); }
  for (let y = 0; y < T.S; y++) for (let x = 0; x < T.S; x++) { const col = T.c[y][x]; if (col) P.px(sx + (y - oy) + 1 + (y - oy > 4 ? thrust : 0), sy + (ox + 2 - x), col); }
  for (const gl of T.glow) g.glow.push({ ...gl, x: sx + (gl.y - oy) + 1 + thrust, y: sy + (ox + 2 - gl.x) });
  // A Kizuna blade leaves a short bright arc behind its edge
  if (part?.maker === 'kizuna') { const tip = sx + F.armLen + 4; for (let k = 0; k < 6; k++) P.px(tip - k, sy - 2 - Math.round(Math.sin(k / 5 * Math.PI) * 3), k % 2 ? '#f0b0ff88' : '#ffffffaa'); }
  return { x: sx + F.armLen + 1 + thrust, y: sy + 1 };
}

function paintDrone(g: Grid, P: Painter, spec: DollSpec, pose: Pose) {
  const p = MAKERS[(spec.look?.accent ? 'tianxia' : 'tianxia')];
  const cloth = spec.look?.cloth ?? p.main, accent = spec.look?.accent ?? '#a8e0d0';
  // A drone hovers: a slow rise and fall
  const cx = 24 + pose.dx, cy = 22 - (pose.idle >= 0 ? [0, 1, 2, 1][pose.idle] : pose.by);
  P.rect(cx - 14, cy - 8, 10, 1, '#c8ccd0'); P.rect(cx + 4, cy - 8, 10, 1, '#c8ccd0');
  P.rect(cx - 10, cy - 7, 1, 3, '#5a646e'); P.rect(cx + 9, cy - 7, 1, 3, '#5a646e');
  P.rect(cx - 10, cy - 4, 20, 2, shade(cloth, -0.4));
  P.oval(cx, cy, 7, 5, cloth); P.rect(cx - 6, cy - 1, 13, 1, shade(cloth, -0.35)); P.rect(cx - 4, cy - 4, 6, 1, shade(cloth, 0.35));
  P.oval(cx + 3, cy + 1, 2, 2, '#1a1a1a'); P.px(cx + 3, cy + 1, '#ff5a3a'); P.glow(cx + 3, cy + 1, '#ff5a3a', 3);
  P.rect(cx - 3, cy + 5, 6, 4, '#8a9aa2'); P.px(cx - 2, cy + 9, accent); P.px(cx + 1, cy + 9, accent);
  P.rect(cx, cy + 9, 1, 4, '#5a646e'); P.px(cx - 1, cy + 13, '#c8ccd0'); P.px(cx + 1, cy + 13, '#c8ccd0');
}

/** Paint one pose of a character into a pixel grid. */
export function paintDoll(spec: DollSpec, state: AnimationState, frame: number): Grid {
  const F: Frame = { ...FRAMES[spec.frame], ...(spec.look ?? {}) };
  const g = makeGrid(F.S), P = api(g);
  const pose = poseOf(state, frame);
  if (F.drone) { paintDrone(g, P, spec, pose); return finish(g, spec.team); }
  if (F.special) { paintMachine(g, P, F, spec, pose); return finish(g, spec.team); }
  const parts = spec.parts ?? {};
  const chest = new Set(spec.chest ?? []);
  const accent = F.accent ?? '#00d4ff';
  const S = F.S, cx = Math.round(S / 2) + pose.dx;
  const top = F.top + pose.by, bot = F.bot + pose.by;
  // Sleepers sway where they stand
  if (F.drip && pose.idle >= 0) F.lean += [0, 1, 1, 0][pose.idle];
  const tl = cx - F.shoulder + F.lean, tr = cx + F.shoulder + F.lean - 1;
  const hl = cx - F.hip, hr = cx + F.hip - 1;
  const hx = cx + F.lean + 1, hy = F.headY + pose.by;
  const clothDark = shade(F.cloth, -0.35), clothLit = shade(F.cloth, 0.22);
  const sig = spec.signature ? SIGNATURES[spec.signature] : undefined;
  const G: Geo = { F, S, cx, tl, tr, top, bot, hx, hy, pose, accent };

  // ── Behind the body ──
  sig?.back?.(P, g, G);
  if (F.cloak || F.robe || chest.has('cape')) for (let y = top; y <= S - 4; y++) { const w = Math.floor((y - top) / 4); P.rect(tl - 2 - w, y, (tr - tl) + 3 + w, 1, shade(F.cloth, -0.45)); }
  if (chest.has('tank')) { shell(P, tl - 4, top + 1, 4, 8, { main: accent, dark: shade(accent, -0.4), lit: shade(accent, 0.3), light: accent }); }
  paintBackParts(P, parts, tl, top, bot);
  if (F.drip) { const dx = tl - 7; P.rect(dx, top - 10, 1, S - top + 7, '#8a949c'); P.rect(dx - 2, S - 3, 5, 1, '#5a646e'); shell(P, dx - 2, top - 10, 4, 6, { main: '#d8eef0', dark: '#8aa8b0', lit: '#ffffff', light: '#ffffff' }); for (let i = 0; i < 6; i++) P.px(dx + 2 + Math.floor(i / 2), top - 4 + i, '#7ad0d8'); }
  if (F.pack) { P.rect(tl - 6, top + 1, 6, 10, '#5a6a5a'); P.rect(tl - 6, top + 1, 6, 1, '#7a8a7a'); P.rect(tl - 5, top - 3, 1, 4, '#6a7278'); P.px(tl - 5, top - 4, '#f2b33d'); }
  if (F.harness) { P.rect(tl - 2, top - 4, 1, bot - top + 5, '#6a7278'); P.rect(tl - 2, top - 4, tr - tl + 5, 1, '#6a7278'); P.rect(tr + 2, top - 4, 1, 6, '#6a7278'); P.px(tl - 2, top - 5, '#f2b33d'); }
  // ── Back arm ──
  paintArm(P, F, parts.left_arm, tl - 3, top + 1 + (F.uneven ? -2 : 0), false);
  // ── Legs ──
  paintLeg(P, F, parts.left_leg, cx - 4 - pose.legPhase, bot + 1, false);
  paintLeg(P, F, parts.right_leg, cx + 1 + pose.legPhase, bot + 1, true);
  // ── Torso: shoulders to hips, shaded ──
  for (let y = top; y <= bot; y++) {
    const t = (y - top) / Math.max(1, bot - top);
    const l = Math.round(tl + (hl - tl) * t), r = Math.round(tr + (hr - tr) * t);
    P.rect(l, y, r - l + 1, 1, F.cloth); P.px(l, y, clothDark); P.px(r, y, clothLit);
  }
  P.rect(tl + 1, top, tr - tl - 1, 1, clothLit);
  const mid = Math.round((tl + tr) / 2);
  if (F.cloth2) for (let y = top; y <= bot; y++) for (let x = tl; x < mid; x++) if (P.at(x, y) === F.cloth) P.px(x, y, F.cloth2);
  if (F.slabs) { P.rect(tl - 3, top - 1, 5, 4, F.slabs); P.rect(tr - 1, top - 1, 5, 4, F.slabs); P.rect(tl - 3, top - 1, 5, 1, shade(F.slabs, 0.3)); P.rect(tr - 1, top - 1, 5, 1, shade(F.slabs, 0.3)); }
  if (F.coat || chest.has('coat')) { const n = F.coat ?? 6; P.rect(hl - 2, bot + 1, hr - hl + 5, n, F.cloth); P.rect(hl - 2, bot + 1, 1, n, clothDark); P.rect(cx, bot + 1, 1, n, clothDark); }
  if (F.robe || chest.has('robe')) { P.rect(hl - 2, bot + 1, hr - hl + 5, F.robe ? 14 : 8, F.cloth); P.rect(cx, bot + 1, 1, F.robe ? 14 : 8, clothDark); }
  if (F.rags || chest.has('rags')) for (let i = hl; i <= hr; i += 2) P.px(i, bot + 1, clothDark);
  if (chest.has('apron')) P.rect(tl + 2, top + 3, tr - tl - 3, bot - top + 4, shade(F.cloth, 0.35));
  if (chest.has('stripes')) { P.rect(tl + 1, top + 4, tr - tl - 1, 2, accent); P.rect(tl + 1, top + 9, tr - tl - 1, 2, accent); }
  if (chest.has('belt')) { P.rect(hl, bot - 1, hr - hl + 1, 1, '#1a1e22'); P.px(cx, bot - 1, accent); }
  if (chest.has('badge')) P.px(tl + 2, top + 2, accent);
  if (chest.has('cross')) { P.rect(mid - 1, top + 3, 3, 1, accent); P.rect(mid, top + 2, 1, 3, accent); }
  if (chest.has('chain')) for (let i = tl + 1; i < tr; i += 2) P.px(i, top + 2 + (i % 4 === 1 ? 1 : 0), accent);
  if (chest.has('number')) { for (const [dx, dy] of [[-1, 3], [1, 3], [-1, 4], [0, 4], [1, 4]]) P.px(mid + dx, top + dy, '#1a1a14'); }
  if (chest.has('pump') || (parts.lungs && parts.lungs.tier >= 1)) { const c = parts.lungs ? pal(parts.lungs.maker, parts.lungs.tier) : { dark: '#1a2626', light: accent }; P.rect(mid - 1, top + 3, 3, 3, c.dark); P.px(mid, top + 4, c.light); }
  if (chest.has('pads')) { P.rect(tl - 2, top, 3, 2, shade(F.cloth, 0.15)); P.rect(tr, top, 3, 2, shade(F.cloth, 0.15)); }
  if (F.stitches || chest.has('stitches')) for (let i = 0; i < 5; i++) P.px(tl + 2 + i, top + 3 + (i % 2), '#2a0e0e');
  if (F.seam) { P.rect(mid, top, 1, bot - top, '#2a0e0e'); for (let y = top + 1; y < bot; y += 2) P.px(mid + 1, y, '#2a0e0e'); }
  if (F.plates) { P.rect(tl, top + 2, tr - tl + 1, 1, '#4a4c52'); P.rect(tl, top + 6, tr - tl + 1, 1, '#4a4c52'); }
  if (F.harness) { P.rect(tl + 1, top, 1, bot - top, '#2a2e32'); P.rect(tr - 1, top, 1, bot - top, '#2a2e32'); P.rect(tl, top + 5, tr - tl + 1, 1, '#2a2e32'); }

  // ── Head ──
  const skin = F.skin, skinDark = shade(skin, -0.3);
  P.rect(hx - 1, hy + F.headRy - 1, F.neck ?? 3, top - (hy + F.headRy - 1) + 1, skinDark);
  P.oval(hx, hy, F.headR, F.headRy, skin);
  if (F.skin2) for (let y = -F.headRy; y <= F.headRy; y++) for (let x = -F.headR; x <= 0; x++) if (P.at(hx + x, hy + y) === skin) P.px(hx + x, hy + y, F.skin2);
  P.rect(hx - F.headR, hy - 1, 1, 4, skinDark);
  if (spec.head !== 'blank' && spec.head !== 'visor' && spec.head !== 'mask') { P.px(hx + 1, hy, F.eyes ?? '#d8dee2'); P.px(hx + 3, hy, F.eyes ?? '#d8dee2'); }
  if (F.stitches) { P.px(hx - 1, hy - 3, '#2a0e0e'); P.px(hx, hy - 2, '#2a0e0e'); P.px(hx - 1, hy - 1, '#2a0e0e'); }
  if (F.hair && !spec.head) { P.oval(hx - 1, hy - F.headRy + 1, F.headR, 2, F.hair); P.rect(hx - F.headR, hy - F.headRy + 1, 2, 4, F.hair); }
  if (F.cap) { P.rect(hx - F.headR, hy - F.headRy, F.headR * 2 + 1, 3, F.cap); P.rect(hx, hy - F.headRy + 2, F.headR + 3, 1, shade(F.cap, -0.3)); }
  if (F.collar) { P.rect(hx - 3, top - 4, 2, 5, shade(F.cloth, 0.1)); P.rect(hx + 2, top - 3, 2, 4, shade(F.cloth, 0.1)); }
  if (F.scarf) { P.rect(hx - F.headR, hy + 2, F.headR * 2 + 1, 3, F.scarf); for (let i = 0; i < (F.scarfLen ?? 6); i++) P.rect(hx - F.headR - 1 - i, hy + 3 + Math.floor(i / 3), 1, 2, F.scarf); }
  if (spec.head && spec.head !== 'crown') paintHeadwear(P, F, spec.head, hx, hy, accent);
  if (F.king) paintCrown(g, P, F, hx, hy);
  paintHeadParts(P, F, parts, hx, hy);
  if (chest.has('antenna')) { P.rect(hx - 2, hy - F.headRy - 4, 1, 4, RUBBER); P.px(hx - 2, hy - F.headRy - 5, accent); }
  if (chest.has('chip')) { P.px(hx - F.headR - 1, hy + 3, accent); P.px(hx - F.headR, hy + 3, shade(accent, 0.5)); }

  // ── Front arm, and what it holds ──
  if (F.king) paintKing(g, P, F, spec, tl, tr, top, hx, hy, pose);
  else {
    const hand = pose.reach ? paintArmForward(P, g, F, parts.right_arm, tr, top + 1) : paintArm(P, F, parts.right_arm, tr, top + 1, true);
    paintWeapon(P, F, spec.weapon, hand, pose, tr, top, accent);
  }
  sig?.front?.(P, g, G);
  if (sig?.ghost) ghostOf(g, sig.ghost.dx, sig.ghost.tint);
  return finish(g, spec.team);
}

// ── Bosses' signature pieces ────────────────────────────────────────────────
interface Geo { F: Frame; S: number; cx: number; tl: number; tr: number; top: number; bot: number; hx: number; hy: number; pose: Pose; accent: string }
type Touch = (P: Painter, g: Grid, G: Geo) => void;
/** An afterimage: the body again, faint and a few pixels behind. */
function ghostOf(g: Grid, dx: number, tint: string) {
  const src = g.c.map(r => r.slice());
  for (let y = 0; y < g.S; y++) for (let x = 0; x < g.S; x++) if (src[y][x] && !src[y][x]!.endsWith('55')) { const nx = x + dx; if (nx >= 0 && nx < g.S && !g.c[y][nx]) g.c[y][nx] = `${tint}55`; }
}
const BONE = '#e8e0cc', WIRE = '#2a2d31';
/** Where a boss is in its idle (0-3), for its own small motions. */
const beat = (G: Geo) => (G.pose.idle >= 0 ? G.pose.idle : 0);
export const SIGNATURES: Record<string, { back?: Touch; front?: Touch; ghost?: { dx: number; tint: string } }> = {
  // Fits limbs to whoever pays, and has fitted most of them to itself: a third arm from its back, a welder's visor, an apron
  'The Fitter': {
    back: (P, _g, G) => paintArm(P, G.F, { maker: 'volkov', tier: 2 }, G.tl - 6, G.top - 4, false),
    front: (P, g, G) => { P.rect(G.tl + 2, G.top + 4, G.tr - G.tl - 3, G.bot - G.top + 2, '#6a4a2e'); P.rect(G.tl + 2, G.top + 4, G.tr - G.tl - 3, 1, '#8a6a4a'); P.rect(G.hx - 3, G.hy - 1, 8, 2, '#1c1a18'); const arc = ['#ff8a2a', '#ffd27a', '#ff8a2a', '#ffffff'][beat(G)]; P.rect(G.hx, G.hy - 1, 4, 1, arc); g.glow.push({ x: G.hx + 2, y: G.hy - 1, col: '#ff8a2a', r: beat(G) === 3 ? 6 : 4 }); },
  },
  // Wired into every chip on the water: a dish on its back, cables into the floor, a ring of listening chips round its head
  'The Listener': {
    back: (P, _g, G) => { P.oval(G.hx - 7, G.hy - 5, 5, 5, '#8a99a2'); P.oval(G.hx - 7, G.hy - 5, 3, 3, '#5a6a74'); P.px(G.hx - 7, G.hy - 5, '#4ad8ff'); for (let i = 0; i < 14; i++) { P.px(G.tl - 2 - Math.floor(i / 3), G.top + 4 + i * 2, WIRE); P.px(G.tl - 4 - Math.floor(i / 2), G.top + 6 + i * 2, '#2a5a6a'); } },
    front: (P, g, G) => { const r = G.F.headR + 3; for (let a = 0; a < 12; a++) { const t = (a / 12) * Math.PI * 2; P.px(G.hx + Math.round(Math.cos(t) * r), G.hy + Math.round(Math.sin(t) * (r - 1)), (a + beat(G)) % 3 ? '#2a5a6a' : '#4ad8ff'); } g.glow.push({ x: G.hx, y: G.hy, col: '#4ad8ff', r: 6 }); for (const [x, y] of [[G.tl + 2, G.top + 5], [G.tr - 2, G.top + 9], [G.cx, G.bot - 2]]) P.px(x, y, '#7ad0e8'); },
  },
  // A captain grown into her ship: a mast and a torn sail on her back, ribs for a keel, cables for hair
  'The Living Vessel': {
    back: (P, _g, G) => { P.rect(G.tl - 3, 2, 2, G.top, '#6a4a2e'); P.rect(G.tl - 1, 5, 9, 1, '#6a4a2e'); for (let y = 6; y < G.top - 2; y++) for (let x = G.tl - 1; x < G.tl + 8; x++) if ((x * 7 + y * 3) % 11) P.px(x, y, y % 4 ? '#d8d0b8' : '#b8b098'); },
    front: (P, _g, G) => { for (let k = 0; k < 4; k++) { const y = G.top + 3 + k * 3; P.rect(G.tl + 1, y, G.tr - G.tl - 1, 1, BONE); P.px(G.tl + 1, y + 1, BONE); P.px(G.tr - 1, y + 1, BONE); } for (let i = 0; i < 4; i++) P.rect(G.hx - G.F.headR + i * 2, G.hy + 2, 1, 6 + i, i % 2 ? WIRE : '#5a646e'); },
  },
  // Fused to the scanning array: an arch round it with a red scan line, cables into its back
  'The Registrar': {
    back: (P, g, G) => { const l = G.tl - 7, r = G.tr + 7, t = G.top - 16; shell(P, l, t, 3, G.S - 3 - t, MAKERS.ioa); shell(P, r - 2, t, 3, G.S - 3 - t, MAKERS.ioa); shell(P, l, t, r - l + 1, 3, MAKERS.ioa); const sy = t + 3 + beat(G) * Math.round((G.S - 6 - t) / 4); P.rect(l + 3, sy, r - l - 5, 1, '#ff3a3a'); g.glow.push({ x: G.cx, y: sy, col: '#ff3a3a', r: 6 }); for (let i = 0; i < 8; i++) P.px(l + 3 + i, G.top + 2 + i, WIRE); },
  },
  // Keeps the count, one over: tally marks on its chest and a clipboard held like a wall
  'The Count': {
    front: (P, _g, G) => { const y = G.top + 3; for (let k = 0; k < 4; k++) P.rect(G.tl + 2 + k * 2, y, 1, 5, '#22262a'); P.rect(G.tl + 1, y + 2, 8, 1, '#22262a'); P.rect(G.tl + 11, y, 1, 5, '#ff5a3a'); shell(P, G.tr + 2, G.top - 2, 7, 11, { main: '#a8865a', dark: '#5a4428', lit: '#c8a67a', light: '#ffffff' }); P.rect(G.tr + 3, G.top, 5, 7, '#f0ece2'); for (let y2 = G.top + 1; y2 < G.top + 7; y2 += 2) P.rect(G.tr + 4, y2, 3, 1, '#8a8e86'); P.rect(G.tr + 4, G.top - 3, 3, 2, '#5a646e'); },
  },
  // The oldest sleeper: its pod open behind it, long hair, more lines in its arms
  'The First Sleeper': {
    back: (P, _g, G) => { const l = G.tl - 9, w = G.tr - G.tl + 18, t = G.top - 18; P.oval(l + Math.floor(w / 2), t + 20, Math.floor(w / 2), 22, '#b8d0d8'); P.oval(l + Math.floor(w / 2), t + 21, Math.floor(w / 2) - 2, 20, '#8aa8b4'); for (let i = 0; i < 3; i++) { P.rect(l + 3 + i * 3, t + 2, 1, 14, '#7ad0d8'); P.px(l + 3 + i * 3, t + 17 + ((beat(G) + i) % 4) * 2, '#d8f4ff'); } },
    front: (P, _g, G) => { for (let i = 0; i < 5; i++) P.rect(G.hx - G.F.headR + i * 2, G.hy - 3, 1, 10 + (i % 2) * 3, '#d8d4ca'); },
  },
  // The dream made of your memories: it trails a faint second self
  'The Long Sleeper': { ghost: { dx: -4, tint: '#9ac8ff' } },
  // Keeps every worker in step: a speaker horn on its shoulder, a whistle, a baton beating time
  'The Overseer': {
    back: (P, _g, G) => { P.rect(G.tl - 2, G.top - 6, 2, 6, WIRE); for (let i = 0; i < 4; i++) P.rect(G.tl - 4 - i, G.top - 9 - i, 4 + i * 2, 1, i === 3 ? '#e07a1e' : '#c8ccd0'); },
    front: (P, _g, G) => { P.px(G.hx + 4, G.hy + 3, '#e4ecef'); P.px(G.hx + 5, G.hy + 3, '#e4ecef'); const tick = [0, 1, 0, -1][beat(G)]; for (let i = 0; i < 10; i++) P.px(G.tr + 2 + Math.round((tick * (10 - i)) / 6), G.top - 8 + i, '#2a2e32'); P.rect(G.tr + 1 + tick, G.top - 5, 3, 2, '#e07a1e'); },
  },
  // Signs off every order: a pen as long as an arm, a red seal on its chest
  'The Signatory': {
    front: (P, g, G) => { P.oval(G.tl + 3, G.top + 5, 2, 2, '#c82a2a'); P.px(G.tl + 3, G.top + 5, '#ff8a7a'); for (let i = 0; i < 12; i++) P.rect(G.tr + 2 + Math.floor(i / 2), G.top + 12 - i, 2, 1, i < 2 ? '#e8c060' : '#1c1e22'); g.glow.push({ x: G.tr + 2, y: G.top + 12, col: '#e8c060', r: 3 }); },
  },
  // The light coming down the corridor: a lens for a face, a halo behind, too bright to look at
  'The Pass': {
    back: (P, g, G) => { P.oval(G.hx, G.hy, G.F.headR + 6, G.F.headR + 6, '#fff4c0'); P.oval(G.hx, G.hy, G.F.headR + 4, G.F.headR + 4, '#ffe08a'); for (let k = 0; k < 8; k++) { const t = (k / 8) * Math.PI * 2 + beat(G) * 0.1; for (let d = 9; d < 13 + ((k + beat(G)) % 2) * 2; d++) P.px(G.hx + Math.round(Math.cos(t) * d), G.hy + Math.round(Math.sin(t) * d), '#fff4c0'); } g.glow.push({ x: G.hx, y: G.hy, col: '#fff4c0', r: 12 }); },
    front: (P, _g, G) => { P.oval(G.hx + 1, G.hy, G.F.headR - 1, G.F.headR - 1, '#ffffff'); P.oval(G.hx + 1, G.hy, 1, 1, '#ffe08a'); },
  },
  // The fastest thing you'll fight: it leaves itself behind
  'The Lead Operator': { ghost: { dx: -5, tint: '#c8a0ff' } },
};

function paintWeapon(P: Painter, F: Frame, w: Weapon | undefined, hand: { x: number; y: number }, pose: Pose, tr: number, top: number, accent: string) {
  const METAL_LIT = '#b8c4cc';
  switch (w) {
    case 'hook': P.rect(hand.x + 1, hand.y - 1, 1, 4, METAL_LIT); P.px(hand.x + 2, hand.y + 3, METAL_LIT); P.px(hand.x + 3, hand.y + 2, METAL_LIT); break;
    case 'baton': P.rect(hand.x + 1, hand.y - 4, 1, 7, '#2a2e32'); P.px(hand.x + 1, hand.y - 5, accent); break;
    case 'gun': P.rect(hand.x, hand.y, 5, 2, '#22262a'); P.rect(hand.x, hand.y + 2, 2, 2, '#22262a'); P.px(hand.x + 4, hand.y, '#4a5058'); break;
    case 'scalpel': P.rect(hand.x + 1, hand.y, 3, 1, METAL_LIT); break;
    case 'shield': {
      const sx = pose.reach ? tr + 4 : tr + 3;
      shell(P, sx, top - 1, 4, 13, { main: shade(F.cloth, 0.15), dark: shade(F.cloth, -0.3), lit: shade(F.cloth, 0.4), light: accent });
      P.rect(sx + 3, top, 1, 11, accent);
      break;
    }
    default: break;
  }
}

/** The Patchwork King's crown is worn, not perched: it sits low on the brow, its pieces wired into his skull. */
function paintCrown(g: Grid, P: Painter, F: Frame, hx: number, hy: number) {
  const r = F.headR, ry = F.headRy, by = hy - 2;
  const bits = ['#ece2c8', '#c23a2e', '#5a7a9a', '#e07a1e', '#e4ecef', '#6a3ac8', '#c27a72'];
  for (let y = hy - ry; y < by; y++) for (let x = -r; x <= r; x++) if (P.at(hx + x, y)) P.px(hx + x, y, bits[((x + 9) >> 1) % bits.length]);
  for (let x = -r; x <= r; x += 2) P.px(hx + x, hy - ry + 1, '#1c1e22');
  P.rect(hx - r - 1, by, r * 2 + 3, 2, '#b8902e'); P.rect(hx - r - 1, by, r * 2 + 3, 1, '#e8c060'); P.rect(hx - r - 1, by + 2, 2, 4, '#b8902e');
  for (let x = -r; x <= r; x += 3) P.px(hx + x, by + 1, '#5a4410');
  P.rect(hx - 3, hy - ry - 3, 1, 3, RUBBER); P.px(hx - 3, hy - ry - 4, '#4ad8ff');
  P.rect(hx, hy - ry - 2, 2, 2, '#1c1e22'); P.px(hx + 1, hy - ry - 2, '#ff5a3a');
  P.rect(hx + 3, hy - ry - 3, 1, 3, '#c27a72'); P.px(hx + 3, hy - ry - 4, '#e8a89a');
  P.rect(hx - 5, hy - ry - 1, 2, 2, '#e4ecef');
  P.px(hx + 2, by + 2, RUBBER); P.px(hx + 2, by + 3, RUBBER); P.px(hx - 2, by + 2, '#5a9a4a'); P.px(hx - 2, by + 3, '#5a9a4a');
  for (let x = -r + 1; x <= r; x += 2) P.px(hx + x, by + 2, '#2a0e0e');
  g.glow.push({ x: hx + 1, y: hy - ry - 2, col: '#ff5a3a', r: 3 });
}

/** The King's own parts: the hull plate on his chest and the salvage hook for an arm, while he still wears them. */
function paintKing(g: Grid, P: Painter, F: Frame, spec: DollSpec, tl: number, tr: number, top: number, hx: number, hy: number, pose: Pose) {
  const has = (k: string) => (spec.kingParts ?? ['plate', 'hook', 'crown']).includes(k);
  if (has('plate')) {
    P.rect(tl + 2, top + 2, tr - tl - 3, 8, '#d8dcd6'); P.rect(tl + 2, top + 2, tr - tl - 3, 1, '#f4f6f2'); P.rect(tl + 2, top + 9, tr - tl - 3, 1, '#8a948e');
    P.rect(tl + 2, top + 6, tr - tl - 3, 1, '#2e6aa8');
    for (const [x, y] of [[tl + 3, top + 3], [tr - 2, top + 3], [tl + 3, top + 8], [tr - 2, top + 8]]) P.px(x, y, '#5a646e');
  }
  for (let i = 0; i < 12; i++) { P.px(hx - F.headR - 1 - Math.floor(i / 4), hy + 1 + i, RUBBER); P.px(hx - F.headR - 2 - Math.floor(i / 3), hy + 2 + i, '#5a9a4a'); }
  P.rect(hx + 1, hy + 2, 3, 2, '#c49a84'); P.px(hx, hy + 2, '#2a0e0e'); P.px(hx, hy + 3, '#2a0e0e');
  if (has('hook')) {
    const sx = tr, sy = top + 1;
    shell(P, sx - 1, sy - 2, 6, 4, MAKERS.tianxia);
    if (pose.reach) {
      for (let x = sx + 4; x < sx + 18; x++) P.rect(x, sy, 1, 3, (x % 4 < 2) ? '#e07a1e' : '#1c1a18');
      for (const [dx, dy] of [[0, 0], [1, 0], [2, 0], [3, 1], [3, 2], [2, 3], [3, -1]]) P.px(sx + 18 + dx, sy + 1 + dy, '#d8dcd6');
    } else {
      for (let y = sy + 2; y < sy + 16; y++) P.rect(sx + 1, y, 3, 1, (y % 4 < 2) ? '#e07a1e' : '#1c1a18');
      P.rect(sx + 2, sy + 16, 1, 3, RUBBER);
      for (const [dx, dy] of [[0, 0], [0, 1], [0, 2], [-1, 3], [-2, 3], [-3, 2], [1, 3], [1, 2]]) P.px(sx + 2 + dx, sy + 19 + dy, '#d8dcd6');
    }
  } else {
    // Where the hook was: a stump of cable and rubber
    P.rect(tr, top + 1, 3, 4, RUBBER); P.px(tr + 1, top + 5, '#5a9a4a'); P.px(tr + 1, top + 6, '#5a9a4a');
  }
}

/** A dark outline round the silhouette, then a thin, soft rim in the team's colour outside it. */
function finish(g: Grid, team: Team): Grid {
  const S = g.S, src = g.c;
  const filled = (x: number, y: number) => !!src[y]?.[x];
  const out = src.map(r => r.slice());
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) if (!filled(x, y) && (filled(x - 1, y) || filled(x + 1, y) || filled(x, y - 1) || filled(x, y + 1))) out[y][x] = OUTLINE;
  const rim = `${TEAM[team]}a0`;
  const isOut = (x: number, y: number) => out[y]?.[x] === OUTLINE;
  const res = out.map(r => r.slice());
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) if (!out[y][x] && (isOut(x - 1, y) || isOut(x + 1, y) || isOut(x, y - 1) || isOut(x, y + 1))) res[y][x] = rim;
  return { S, c: res, glow: g.glow };
}

/** Bodies that aren't people: a drone swarm, a four-legged loader, a crane on the ceiling rails. Built from their maker's plastic. */
function paintMachine(g: Grid, P: Painter, F: Frame, spec: DollSpec, pose: Pose) {
  const maker = (spec.parts?.right_arm?.maker ?? spec.parts?.left_arm?.maker ?? 'ioa') as MakerKey;
  const p = MAKERS[maker];
  const eye = spec.look?.accent ?? '#ff5a3a';
  const dx = pose.dx, by = pose.by;
  if (F.special === 'swarm') {
    // Many small drones, moving as one
    const spots = [[16, 10], [30, 8], [23, 18], [12, 24], [34, 22], [22, 30], [30, 34]];
    spots.forEach(([x, y], n) => {
      // Each drone in the swarm keeps its own small jitter
      const j = pose.idle >= 0 ? pose.idle : by, bob = [0, 1, 0, -1][(n * 3 + j) % 4], cx = x + dx + ((n + j) % 3 === 0 ? 1 : 0), cy = y + bob;
      P.rect(cx - 4, cy - 3, 3, 1, '#c8ccd0'); P.rect(cx + 2, cy - 3, 3, 1, '#c8ccd0');
      shell(P, cx - 2, cy - 2, 5, 4, p); P.px(cx + 1, cy, eye);
    });
    g.glow.push({ x: 23 + dx, y: 18, col: eye, r: 3 });
    // The Weather: one drone leads, bigger than the rest
    if (spec.signature === 'The Weather') { shell(P, 19 + dx, 15 + by, 10, 7, p); P.rect(20 + dx, 13 + by, 8, 1, '#c8ccd0'); P.rect(22 + dx, 17 + by, 4, 2, '#1a1a1a'); P.px(25 + dx, 17 + by, '#ffffff'); g.glow.push({ x: 25 + dx, y: 18 + by, col: '#ffffff', r: 5 }); }
    return;
  }
  if (F.special === 'tower') {
    // An air-lift tower that breathes cloud, with its crew fused into the crane arm
    for (const x of [18, 34]) shell(P, x + dx, 12, 3, 41, p);
    for (let y = 14; y < 52; y += 6) { for (let i = 0; i < 14; i++) P.px(20 + dx + i, y + Math.floor(i / 3), '#5a646e'); for (let i = 0; i < 14; i++) P.px(33 + dx - i, y + Math.floor(i / 3), '#5a646e'); }
    P.rect(14 + dx, 52, 26, 3, '#3a4248');
    shell(P, 16 + dx, 22 + by, 22, 8, p); P.rect(19 + dx, 24 + by, 6, 3, '#1a2a34'); P.oval(22 + dx, 25 + by, 1, 1, '#8a7a6a'); P.px(23 + dx, 25 + by, '#ff5a3a');
    const reach = pose.reach ? 4 : 0;
    for (let x = 38; x < 52 + reach; x++) P.rect(x + dx, 23 + by, 1, 3, (x % 4 < 2) ? p.main : (p.stripe ?? p.dark));
    P.rect(50 + reach + dx, 26 + by, 1, 6, WIRE); for (const [x, y] of [[49, 32], [49, 33], [50, 34], [52, 33], [52, 32]]) P.px(x + reach + dx, y + by, '#d8dcd6');
    // It breathes cloud: the puffs drift up and off as it idles
    const drift = pose.idle >= 0 ? pose.idle : 0;
    for (const [x, y, r] of [[22, 6, 4], [30, 4, 5], [38, 7, 3], [26, 9, 3]]) { P.oval(x + dx + drift, y - by - drift, r, Math.max(2, r - 1), '#e8eef2'); P.px(x + dx + drift - 1, y - by - drift - 1, '#ffffff'); }
    g.glow.push({ x: 23 + dx, y: 25 + by, col: '#ff5a3a', r: 3 });
    return;
  }
  if (F.special === 'quadruped') {
    // A loader on four plastic legs: a box body, a sensor head at the front, a cargo frame
    const top = 20 + by;
    for (const [x, back] of [[12, true], [18, false], [28, true], [34, false]] as [number, boolean][]) {
      const lx = x + dx + (pose.legPhase && back ? pose.legPhase : 0);
      shell(P, lx, top + 8, 3, 8, p, back ? c => shade(c, -0.25) : same); P.rect(lx, top + 16, 3, 1, RUBBER); shell(P, lx - 1, top + 17, 4, 8, p, back ? c => shade(c, -0.25) : same); P.rect(lx - 2, 45, 6, 2, RUBBER);
    }
    shell(P, 9 + dx, top, 30, 10, p);
    if (p.stripe) for (let x = 12; x < 36; x += 4) P.rect(x + dx, top + 7, 2, 2, p.stripe);
    P.rect(12 + dx, top - 5, 1, 5, '#6a7278'); P.rect(22 + dx, top - 5, 1, 5, '#6a7278'); P.rect(12 + dx, top - 5, 11, 1, '#6a7278');
    shell(P, 37 + dx, top + 1, 7, 6, p); P.rect(40 + dx, top + 3, 3, 2, '#1a1a1a'); P.px(42 + dx, top + 3, eye);
    g.glow.push({ x: 42 + dx, y: top + 3, col: eye, r: 3 });
    return;
  }
  // Gantry: a trolley on the ceiling rail, a cab hanging below, a claw reaching down
  P.rect(2, 3, 44, 2, '#5a646e'); P.rect(2, 3, 44, 1, '#8a949c');
  shell(P, 16 + dx, 5, 16, 5, p);
  P.rect(23 + dx, 10, 2, 8 + by, RUBBER);
  shell(P, 15 + dx, 18 + by, 18, 11, p);
  if (p.stripe) for (let x = 16; x < 32; x += 3) P.px(x + dx, 27 + by, p.stripe);
  P.rect(27 + dx, 21 + by, 4, 3, '#1a1a1a'); P.px(29 + dx, 22 + by, eye);
  g.glow.push({ x: 29 + dx, y: 22 + by, col: eye, r: 3 });
  const reach = pose.reach ? 8 : 0;
  P.rect(23 + dx, 29 + by, 2, 6 + reach, '#6a7278');
  for (const [x, y] of [[20, 35], [21, 37], [22, 39], [27, 35], [26, 37], [25, 39]]) P.rect(x + dx, y + by + reach, 2, 2, p.lit);
}

// ── Drawing ─────────────────────────────────────────────────────────────────

const PAD = 6;
const cache = new Map<string, HTMLCanvasElement>();
function canvasFor(spec: DollSpec, state: AnimationState, frame: number): HTMLCanvasElement {
  const key = `${JSON.stringify(spec)}|${state}|${frame}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const grid = paintDoll(spec, state, frame);
  const c = document.createElement('canvas');
  c.width = grid.S + PAD * 2; c.height = grid.S + PAD * 2;
  const ctx = c.getContext('2d')!;
  // Glows under the pixels: soft light from lit parts
  // Lit parts breathe with the idle: the glow swells and settles
  const swell = state === 'idle' ? [1, 1.18, 1.35, 1.18][frame % 4] : 1;
  for (const gl of grid.glow) {
    const gx = gl.x + PAD + 0.5, gy = gl.y + PAD + 0.5, r = gl.r * swell;
    const rad = ctx.createRadialGradient(gx, gy, 0, gx, gy, r);
    rad.addColorStop(0, `${gl.col}aa`); rad.addColorStop(1, `${gl.col}00`);
    ctx.fillStyle = rad; ctx.fillRect(gx - r, gy - r, r * 2, r * 2);
  }
  for (let y = 0; y < grid.S; y++) for (let x = 0; x < grid.S; x++) { const col = grid.c[y][x]; if (col) { ctx.fillStyle = col; ctx.fillRect(x + PAD, y + PAD, 1, 1); } }
  if (cache.size > 600) cache.clear();
  cache.set(key, c);
  return c;
}

const whites = new Map<string, HTMLCanvasElement>();
/** The same pose as a white silhouette: the one-frame flash when a blow lands. */
function whiteOf(spec: DollSpec, state: AnimationState, frame: number): HTMLCanvasElement {
  const key = `${JSON.stringify(spec)}|${state}|${frame}`;
  const hit = whites.get(key);
  if (hit) return hit;
  const src = canvasFor(spec, state, frame);
  const c = document.createElement('canvas'); c.width = src.width; c.height = src.height;
  const ctx = c.getContext('2d')!;
  ctx.drawImage(src, 0, 0);
  ctx.globalCompositeOperation = 'source-in'; ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, c.width, c.height);
  if (whites.size > 200) whites.clear();
  whites.set(key, c);
  return c;
}

/**
 * Draw a character in the box (x, y, size) that a regular 48-pixel body fills; bigger
 * bodies (bosses) grow up and out from the same feet. Faces right unless flipped.
 */
export function drawDoll(ctx: CanvasRenderingContext2D, spec: DollSpec, x: number, y: number, size: number, state: AnimationState, frame: number, faceLeft = false,
  opts: { white?: boolean; fall?: number } = {}) {
  const img = opts.white ? whiteOf(spec, state, frame) : canvasFor(spec, state, frame);
  const S = FRAMES[spec.frame].S;
  const unit = size / 48;
  const w = img.width * unit, h = img.height * unit;
  const feetX = x + size / 2, feetY = y + size;
  const left = feetX - w / 2, topY = feetY - (S + PAD) * unit;
  ctx.save();
  const smooth = ctx.imageSmoothingEnabled;
  ctx.imageSmoothingEnabled = false;
  // Falling: it tips over backwards from its feet, sinks and fades
  if (opts.fall) {
    const k = opts.fall, dir = faceLeft ? 1 : -1;
    ctx.globalAlpha *= 1 - Math.max(0, (k - 0.55) / 0.45);
    ctx.translate(feetX, feetY + k * size * 0.05);
    ctx.rotate(dir * Math.min(1, k * 1.4) * Math.PI * 0.45);
    ctx.translate(-feetX, -feetY);
  }
  if (faceLeft) { ctx.translate(left + w, topY); ctx.scale(-1, 1); ctx.drawImage(img, 0, 0, w, h); }
  else ctx.drawImage(img, left, topY, w, h);
  ctx.imageSmoothingEnabled = smooth;
  ctx.restore();
}

/** A portrait: the character drawn so its head sits at (cx, cy), at `unit` screen pixels a pixel. */
export function drawDollHead(ctx: CanvasRenderingContext2D, spec: DollSpec, cx: number, cy: number, unit: number) {
  const F: Frame = { ...FRAMES[spec.frame], ...(spec.look ?? {}) };
  const img = canvasFor(spec, 'idle', 0);
  const hx = F.drone || F.special ? 24 : Math.round(F.S / 2) + F.lean + 1, hy = F.drone ? 22 : F.special === 'gantry' ? 23 : F.special ? 22 : F.headY + 1;
  ctx.save();
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(img, cx - (hx + PAD + 0.5) * unit, cy - (hy + PAD + 0.5) * unit, img.width * unit, img.height * unit);
  ctx.restore();
}

/**
 * Where each implant slot sits on a body (grid pixels, standing still): for the
 * implants screen's body map, so its markers land on the parts of this host's body.
 */
export function slotAnchors(spec: DollSpec): Record<BodySlot, { x: number; y: number }> {
  const F: Frame = { ...FRAMES[spec.frame], ...(spec.look ?? {}) };
  const cx = Math.round(F.S / 2), top = F.top, bot = F.bot;
  const tl = cx - F.shoulder + F.lean, tr = cx + F.shoulder + F.lean - 1;
  const hx = cx + F.lean + 1, hy = F.headY, mid = Math.round((tl + tr) / 2);
  const elbow = top + 1 + Math.round(F.armLen * 0.42) + 3, knee = Math.round((bot + 1 + F.S - 3) / 2);
  return {
    brain: { x: hx, y: hy - F.headRy + 1 }, eyes: { x: hx + 2, y: hy }, ears: { x: hx - F.headR, y: hy }, nose: { x: hx + 3, y: hy + 3 },
    lungs: { x: mid, y: top + 4 }, misc: { x: tl + 1, y: top + Math.round((bot - top) / 2) },
    left_arm: { x: tl - 2, y: elbow }, right_arm: { x: tr + 2, y: elbow },
    left_leg: { x: cx - 3, y: knee }, right_leg: { x: cx + 2, y: knee },
  };
}

/**
 * A body as a scanner hologram (the implants screen): the frame's shape in cyan, lit on
 * its top-left edges with faint scan lines, and every fitted implant in its own plastic.
 * Returns an S x S grid of colours (null where empty).
 */
export function hologram(spec: DollSpec): { S: number; c: (string | null)[][] } {
  const full = paintDoll({ ...spec, team: 'you' }, 'idle', 0).c;
  const bare = paintDoll({ ...spec, team: 'you', parts: {} }, 'idle', 0).c;
  const S = full.length;
  const solid = (x: number, y: number) => { const v = full[y]?.[x]; return !!v && v !== OUTLINE && !v.startsWith(TEAM.you); };
  const out: (string | null)[][] = Array.from({ length: S }, () => Array<string | null>(S).fill(null));
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    if (!solid(x, y)) continue;
    // An implant pixel: something the bare body doesn't have there
    if (full[y][x] !== bare[y]?.[x]) { out[y][x] = full[y][x]; continue; }
    const edge = !solid(x - 1, y) || !solid(x + 1, y) || !solid(x, y - 1) || !solid(x, y + 1);
    const lit = !solid(x - 1, y) || !solid(x, y - 1);
    out[y][x] = edge ? (lit ? '#6ee8fa' : '#2896af') : y % 4 === 0 ? '#18465a' : (x + y) % 2 ? '#10303c' : '#123542';
  }
  return { S, c: out };
}
