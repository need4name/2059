export type AnimationState = 'idle' | 'walk' | 'attack' | 'defend' | 'hurt';

export interface SpriteAnimation {
  frames: number;
  frameDuration: number;
}

export const ANIMATIONS: Record<AnimationState, SpriteAnimation> = {
  idle: { frames: 4, frameDuration: 250 },
  walk: { frames: 6, frameDuration: 120 },
  attack: { frames: 5, frameDuration: 100 },
  defend: { frames: 3, frameDuration: 150 },
  hurt: { frames: 3, frameDuration: 150 },
};

// Color indices for palette-based rendering
const TRANSPARENT = 0;
const OUTLINE = 1;

// Survivor palette - dystopian augmented human, dark industrial tones
const WANDERER_PALETTE: Record<number, string> = {
  [TRANSPARENT]: 'transparent',
  [OUTLINE]: '#0a0f14',
  2: '#1a2530', // jacket dark
  3: '#243340', // jacket mid
  4: '#2e4050', // jacket
  5: '#3a5060', // jacket light
  6: '#1a2028', // undersuit dark
  7: '#252d38', // undersuit
  8: '#303a48', // undersuit light
  9: '#5a6570', // skin shadow (pallid)
  10: '#7a8590', // skin (pale, indoor)
  11: '#9aa5b0', // skin highlight
  12: '#0a0f14', // hair/eye dark
  13: '#1a2028', // hair
  14: '#151a20', // boots
  15: '#4a5560', // cybernetic arm
  16: '#3a4550', // cybernetic dark
  17: '#35404a', // gear
  18: '#00d4ff', // eye glow (cyan augment)
  19: '#ff6b35', // accent (amber warning)
};

// Enforcer palette - corporate security, tactical industrial
const DRUNKARD_PALETTE: Record<number, string> = {
  [TRANSPARENT]: 'transparent',
  [OUTLINE]: '#0a0808',
  2: '#2a1518', // armor dark
  3: '#3a2028', // armor mid
  4: '#4a2a30', // armor
  5: '#5a3540', // armor light
  6: '#1a1518', // undersuit dark
  7: '#252025', // undersuit
  8: '#302830', // undersuit light
  9: '#4a4045', // skin shadow (grayed)
  10: '#5a5055', // skin
  11: '#6a6065', // skin highlight
  12: '#ff3030', // visor glow (red threat)
  13: '#1a1015', // hair dark
  14: '#252020', // hair/helmet
  15: '#151012', // boots
  16: '#3a3035', // weapon dark
  17: '#4a4045', // weapon
  18: '#5a5055', // weapon light
  19: '#2a2025', // belt/strap
  20: '#ff5030', // warning light
  21: '#ff2020', // eye visor glow
  22: '#0a0808', // lens
  23: '#1a1518', // tactical gear
};

// 32x32 sprite grid type
type SpriteGrid = number[][];

// Create empty grid
function createGrid(): SpriteGrid {
  return Array.from({ length: 32 }, () => Array(32).fill(TRANSPARENT));
}

// Draw filled rectangle on grid
function fillRect(grid: SpriteGrid, x: number, y: number, w: number, h: number, color: number) {
  for (let py = y; py < y + h && py < 32; py++) {
    for (let px = x; px < x + w && px < 32; px++) {
      if (px >= 0 && py >= 0 && px < 32 && py < 32) {
        grid[py][px] = color;
      }
    }
  }
}

// Draw filled ellipse on grid
function fillEllipse(grid: SpriteGrid, cx: number, cy: number, rx: number, ry: number, color: number) {
  for (let py = Math.floor(cy - ry); py <= Math.ceil(cy + ry); py++) {
    for (let px = Math.floor(cx - rx); px <= Math.ceil(cx + rx); px++) {
      const dx = (px - cx) / rx;
      const dy = (py - cy) / ry;
      if (dx * dx + dy * dy <= 1 && px >= 0 && py >= 0 && px < 32 && py < 32) {
        grid[py][px] = color;
      }
    }
  }
}

// Draw filled triangle on grid
function fillTriangle(grid: SpriteGrid, x1: number, y1: number, x2: number, y2: number, x3: number, y3: number, color: number) {
  const minY = Math.max(0, Math.floor(Math.min(y1, y2, y3)));
  const maxY = Math.min(31, Math.ceil(Math.max(y1, y2, y3)));
  
  for (let y = minY; y <= maxY; y++) {
    const intersections: number[] = [];
    const edges = [[x1, y1, x2, y2], [x2, y2, x3, y3], [x3, y3, x1, y1]];
    
    for (const [ax, ay, bx, by] of edges) {
      if ((ay <= y && by > y) || (by <= y && ay > y)) {
        const t = (y - ay) / (by - ay);
        intersections.push(ax + t * (bx - ax));
      }
    }
    
    if (intersections.length >= 2) {
      intersections.sort((a, b) => a - b);
      for (let x = Math.max(0, Math.floor(intersections[0])); x <= Math.min(31, Math.ceil(intersections[1])); x++) {
        grid[y][x] = color;
      }
    }
  }
}

// Apply shading - darken bottom/right edges of filled areas
function applyShading(grid: SpriteGrid, baseColor: number, darkColor: number, lightColor: number) {
  for (let y = 0; y < 32; y++) {
    for (let x = 0; x < 32; x++) {
      if (grid[y][x] === baseColor) {
        // Check if this is a bottom or right edge
        const hasBelow = y < 31 && grid[y + 1][x] === baseColor;
        const hasRight = x < 31 && grid[y][x + 1] === baseColor;
        const hasAbove = y > 0 && grid[y - 1][x] === baseColor;
        const hasLeft = x > 0 && grid[y][x - 1] === baseColor;
        
        if (!hasBelow || !hasRight) {
          grid[y][x] = darkColor;
        } else if (!hasAbove || !hasLeft) {
          grid[y][x] = lightColor;
        }
      }
    }
  }
}

// Generate outline by dilating the silhouette
function addOutline(grid: SpriteGrid): SpriteGrid {
  const result = createGrid();
  
  // First pass: copy original and mark outline positions
  for (let y = 0; y < 32; y++) {
    for (let x = 0; x < 32; x++) {
      if (grid[y][x] !== TRANSPARENT) {
        result[y][x] = grid[y][x];
      }
    }
  }
  
  // Second pass: add outline around filled pixels
  for (let y = 0; y < 32; y++) {
    for (let x = 0; x < 32; x++) {
      if (grid[y][x] !== TRANSPARENT) {
        // Check 8 neighbors
        const neighbors = [
          [y - 1, x], [y + 1, x], [y, x - 1], [y, x + 1],
          [y - 1, x - 1], [y - 1, x + 1], [y + 1, x - 1], [y + 1, x + 1]
        ];
        
        for (const [ny, nx] of neighbors) {
          if (ny >= 0 && ny < 32 && nx >= 0 && nx < 32) {
            if (grid[ny][nx] === TRANSPARENT && result[ny][nx] === TRANSPARENT) {
              result[ny][nx] = OUTLINE;
            }
          }
        }
      }
    }
  }
  
  return result;
}

// Render grid to canvas using horizontal spans (no gaps)
function renderGrid(
  ctx: CanvasRenderingContext2D,
  grid: SpriteGrid,
  palette: Record<number, string>,
  x: number,
  y: number,
  scale: number,
  flipX: boolean = false
) {
  ctx.save();
  
  if (flipX) {
    ctx.translate(x + 32 * scale, y);
    ctx.scale(-1, 1);
    x = 0;
  } else {
    ctx.translate(x, y);
    x = 0;
  }
  
  // Render row by row with horizontal spans for solid fills
  for (let row = 0; row < 32; row++) {
    let spanStart = -1;
    let spanColor = TRANSPARENT;
    
    for (let col = 0; col <= 32; col++) {
      const currentColor = col < 32 ? grid[row][col] : TRANSPARENT;
      
      if (currentColor !== spanColor) {
        // End current span
        if (spanColor !== TRANSPARENT && spanStart >= 0) {
          ctx.fillStyle = palette[spanColor] || 'magenta';
          ctx.fillRect(spanStart * scale, row * scale, (col - spanStart) * scale, scale);
        }
        // Start new span
        spanStart = col;
        spanColor = currentColor;
      }
    }
  }
  
  ctx.restore();
}

// Build Wanderer sprite - mysterious pilgrim with character
// Design pillars: weathered traveler, story through details, big expressive eyes
function buildWandererGrid(state: AnimationState, frame: number): SpriteGrid {
  const grid = createGrid();
  
  // Animation offsets
  let bodyBob = 0;
  let cloakSway = 0;
  let headTilt = 0;
  let staffSwing = 0;
  
  if (state === 'idle') {
    // Gentle breathing rhythm
    bodyBob = frame === 1 || frame === 3 ? 1 : 0;
    cloakSway = frame === 0 || frame === 2 ? 0 : (frame === 1 ? 1 : -1);
  } else if (state === 'walk') {
    bodyBob = frame % 2;
    cloakSway = Math.floor(Math.sin((frame / 6) * Math.PI * 2) * 2);
  } else if (state === 'attack') {
    // Staff thrust forward
    staffSwing = frame < 2 ? -2 : (frame < 4 ? 4 : 1);
    bodyBob = frame === 2 ? -1 : 0;
    headTilt = frame >= 2 && frame < 4 ? 1 : 0;
  } else if (state === 'hurt') {
    bodyBob = frame === 0 ? -2 : (frame === 1 ? 1 : 0);
    headTilt = frame === 0 ? 2 : 0;
    cloakSway = frame === 0 ? 2 : 0;
  }
  
  const by = bodyBob;
  const cs = cloakSway;
  const ht = headTilt;
  const ss = staffSwing;
  
  // === STAFF (behind body, but talismans visible) ===
  const staffX = 22 + ss;
  const staffY = 4 + by;
  
  // Gnarled wooden staff
  fillRect(grid, staffX, staffY, 2, 24, 15); // main shaft
  fillRect(grid, staffX + 1, staffY, 1, 24, 16); // shadow side
  
  // Curved top (shepherd's crook style)
  fillRect(grid, staffX - 1, staffY, 2, 2, 15);
  fillRect(grid, staffX - 2, staffY + 1, 2, 2, 15);
  fillRect(grid, staffX - 3, staffY + 2, 2, 3, 16);
  
  // Dangling talismans on leather cords
  const talismanSway = cs * 0.5;
  // Small bone/tooth
  fillRect(grid, Math.round(staffX - 4 + talismanSway), staffY + 5 + by, 1, 3, 18);
  // Feather
  fillRect(grid, Math.round(staffX - 2 + talismanSway), staffY + 4 + by, 1, 4, 5);
  fillRect(grid, Math.round(staffX - 2 + talismanSway), staffY + 4 + by, 1, 1, 12);
  // Small pouch/charm
  fillRect(grid, Math.round(staffX - 3 + talismanSway * 0.8), staffY + 7 + by, 2, 2, 17);
  
  // === CLOAK (dramatic triangular silhouette) ===
  // Outer cloak edge (darkest)
  fillTriangle(grid, 15, 11 + by, 4 + cs, 30 + by, 26 - cs, 30 + by, 2);
  // Main cloak body
  fillTriangle(grid, 15, 12 + by, 6 + cs, 29 + by, 24 - cs, 29 + by, 3);
  // Inner cloak (lighter)
  fillTriangle(grid, 15, 13 + by, 8 + cs, 28 + by, 22 - cs, 28 + by, 4);
  
  // Tattered/worn bottom edge (visual storytelling)
  for (let i = 0; i < 6; i++) {
    const tx = 6 + i * 4 + cs;
    const torn = (i + frame) % 3;
    if (torn === 0) {
      fillRect(grid, tx, 28 + by, 2, 2, 2);
    } else if (torn === 1) {
      fillRect(grid, tx + 1, 29 + by, 1, 2, 3);
    }
  }
  
  // Cloak patches (this traveler has been on the road a long time)
  fillRect(grid, 10 + cs, 22 + by, 2, 3, 5); // leather patch
  fillRect(grid, 18 - cs, 20 + by, 3, 2, 4); // darker cloth patch
  
  // === HOOD (deep, mysterious) ===
  // Hood outer rim
  fillEllipse(grid, 14 + ht, 8 + by, 8, 7, 2);
  // Hood mid layer
  fillEllipse(grid, 14 + ht, 8 + by, 7, 6, 3);
  // Hood inner shadow (creates depth)
  fillEllipse(grid, 14 + ht, 9 + by, 6, 5, 4);
  // Deep shadow inside hood
  fillEllipse(grid, 14 + ht, 10 + by, 5, 4, 1);
  
  // === FACE (emerging from shadow - big expressive eyes) ===
  // Face in shadow
  fillEllipse(grid, 14 + ht, 11 + by, 4, 4, 9);
  // Face highlight (catches light)
  fillEllipse(grid, 14 + ht, 10 + by, 3, 3, 10);
  fillEllipse(grid, 15 + ht, 10 + by, 2, 2, 11);
  
  // === EYES - the window to the soul ===
  // Big, round, expressive (Binding of Isaac/indie game style)
  // Left eye - large white with dark pupil
  fillEllipse(grid, 12 + ht, 10 + by, 2, 2, 18); // white sclera
  fillRect(grid, 12 + ht, 10 + by, 1, 2, 12); // vertical pupil
  fillRect(grid, 11 + ht, 9 + by, 1, 1, 18); // catchlight
  
  // Right eye
  fillEllipse(grid, 16 + ht, 10 + by, 2, 2, 18); // white sclera
  fillRect(grid, 16 + ht, 10 + by, 1, 2, 12); // vertical pupil
  fillRect(grid, 17 + ht, 9 + by, 1, 1, 18); // catchlight
  
  // Subtle eyebrow hints (inside hood shadow)
  fillRect(grid, 11 + ht, 8 + by, 3, 1, 1);
  fillRect(grid, 15 + ht, 8 + by, 3, 1, 1);
  
  // === BODY (under cloak glimpse) ===
  fillRect(grid, 11, 14 + by, 8, 9, 6); // tunic base
  fillRect(grid, 12, 15 + by, 6, 7, 7); // tunic lighter center
  fillRect(grid, 13, 16 + by, 4, 5, 8); // tunic highlight
  
  // Wide leather belt with pouches
  fillRect(grid, 10, 19 + by, 10, 2, 13);
  fillRect(grid, 11, 19 + by, 8, 2, 14);
  // Belt buckle (brass)
  fillRect(grid, 14, 19 + by, 2, 2, 19);
  fillRect(grid, 14, 19 + by, 1, 1, 20);
  
  // === ARMS ===
  // Left arm (holding cloak edge)
  fillRect(grid, 8 + cs, 15 + by, 3, 5, 4); // cloak covered arm
  fillRect(grid, 8 + cs, 20 + by, 2, 1, 10); // hand peeking out
  
  // Right arm (gripping staff)
  fillRect(grid, 19, 14 + by, 3, 5, 4);
  fillRect(grid, 20, 18 + by, 2, 2, 10); // hand
  fillRect(grid, 21, 18 + by, 1, 2, 9); // hand shadow
  
  // === SATCHEL (well-traveled, bulging with contents) ===
  // Main bag
  fillRect(grid, 7, 16 + by, 4, 5, 16);
  fillRect(grid, 8, 17 + by, 3, 4, 17);
  // Flap
  fillRect(grid, 7, 16 + by, 4, 2, 14);
  // Strap across chest
  fillRect(grid, 7, 14 + by, 1, 3, 14);
  fillRect(grid, 8, 13 + by, 4, 1, 14);
  fillRect(grid, 11, 13 + by, 1, 2, 14);
  // Items peeking out (scroll, herbs)
  fillRect(grid, 8, 21 + by, 1, 1, 18); // paper edge
  fillRect(grid, 10, 20 + by, 1, 2, 5); // dried herb
  
  // === LEGS ===
  fillRect(grid, 12, 23 + by, 3, 5, 7);
  fillRect(grid, 15, 23 + by, 3, 5, 6);
  
  // === WORN BOOTS ===
  fillRect(grid, 11, 27 + by, 4, 3, 13);
  fillRect(grid, 15, 27 + by, 4, 3, 14);
  // Boot straps
  fillRect(grid, 12, 27 + by, 2, 1, 14);
  fillRect(grid, 16, 27 + by, 2, 1, 13);
  
  return grid;
}

// Build Drunkard sprite - pot-bellied tavern regular with tankard
function buildDrunkardGrid(state: AnimationState, frame: number, randomSeed: number): SpriteGrid {
  const grid = createGrid();
  
  // Slower, lazier animation with random variation
  let sway = 0;
  let headBob = 0;
  let tankardTilt = 0;
  let bellyBulge = 0;
  
  // Use randomSeed to add variation to idle
  const randomOffset = (randomSeed % 100) / 100;
  
  if (state === 'idle') {
    // Much slower sway - one cycle per ~4 frames at 250ms = 1 second
    const t = ((frame + randomOffset * 2) / 4) * Math.PI * 2;
    sway = Math.round(Math.sin(t) * 1.5);
    headBob = Math.round(Math.sin(t * 0.5) * 0.5);
    tankardTilt = Math.round(Math.sin(t * 0.7) * 2);
    bellyBulge = Math.abs(Math.sin(t)) > 0.5 ? 1 : 0;
  } else if (state === 'walk') {
    sway = Math.round(Math.sin((frame / 6) * Math.PI * 2) * 2);
    headBob = frame % 2;
  } else if (state === 'attack') {
    tankardTilt = frame < 2 ? -3 : (frame < 4 ? 6 : 2);
    sway = frame === 3 ? 2 : 0;
  } else if (state === 'hurt') {
    sway = frame === 0 ? 3 : (frame === 1 ? -1 : 0);
    headBob = frame === 0 ? -1 : 0;
  }
  
  const sw = sway;
  const hb = headBob;
  const tt = tankardTilt;
  const bb = bellyBulge;
  
  // === LEGS (wide, unsteady stance) ===
  fillRect(grid, 10 + sw, 23, 4, 5, 7); // left leg
  fillRect(grid, 18 + sw, 23, 4, 5, 6); // right leg
  
  // Boots
  fillRect(grid, 9 + sw, 27, 5, 2, 15);
  fillRect(grid, 17 + sw, 27, 5, 2, 15);
  
  // === BODY - pot belly ===
  // Main torso - pear shaped
  fillEllipse(grid, 16 + sw, 18, 6 + bb, 6, 3); // belly
  fillEllipse(grid, 16 + sw, 17, 5 + bb, 5, 4); // belly highlight
  fillRect(grid, 11 + sw, 12, 10, 6, 3); // upper body
  
  // Ale stains on shirt
  fillRect(grid, 14 + sw, 16, 2, 2, 5);
  fillRect(grid, 17 + sw, 18, 1, 2, 5);
  
  // Belt (struggling)
  fillRect(grid, 10 + sw, 21, 12, 1, 23);
  
  // === ARMS ===
  // Left arm (dangling)
  fillRect(grid, 8 + sw, 14, 3, 5, 4);
  fillRect(grid, 7 + sw, 18, 2, 2, 10); // hand
  
  // Right arm (holding tankard up)
  const armX = 21 + sw + Math.round(tt * 0.3);
  const armY = 12 + Math.round(tt * 0.1);
  fillRect(grid, armX, armY, 3, 4, 4);
  fillRect(grid, armX + 1, armY + 3, 2, 2, 10); // hand
  
  // === TANKARD ===
  const tankX = 23 + sw + tt;
  const tankY = 8 + Math.round(tt * 0.2);
  fillRect(grid, tankX, tankY, 4, 5, 17); // body
  fillRect(grid, tankX, tankY, 1, 5, 16); // left shadow
  fillRect(grid, tankX + 3, tankY, 1, 5, 16); // right shadow
  fillRect(grid, tankX, tankY, 4, 1, 16); // top rim
  fillRect(grid, tankX, tankY + 4, 4, 1, 16); // bottom
  // Handle
  fillRect(grid, tankX + 4, tankY + 1, 2, 3, 16);
  // Foam
  fillRect(grid, tankX, tankY - 1, 4, 2, 19);
  fillRect(grid, tankX + 1, tankY - 2, 2, 1, 20);
  
  // Foam splash during attack
  if (state === 'attack' && frame >= 2) {
    fillRect(grid, tankX - 1, tankY - 2, 1, 1, 19);
    fillRect(grid, tankX + 4, tankY - 1, 1, 1, 19);
  }
  
  // === HEAD - round, flushed ===
  fillEllipse(grid, 16 + sw, 8 + hb, 5, 5, 10); // face
  fillEllipse(grid, 16 + sw, 7 + hb, 4, 4, 11); // highlight
  
  // Flushed cheeks
  fillEllipse(grid, 13 + sw, 9 + hb, 2, 1, 12);
  fillEllipse(grid, 19 + sw, 9 + hb, 2, 1, 12);
  
  // Big red nose
  fillEllipse(grid, 16 + sw, 9 + hb, 2, 2, 12);
  
  // Eyes - droopy, unfocused
  // Left eye (half closed)
  fillRect(grid, 13 + sw, 7 + hb, 2, 2, 21);
  fillRect(grid, 13 + sw, 8 + hb, 2, 1, 22);
  // Right eye (slightly more open)
  fillRect(grid, 17 + sw, 6 + hb, 2, 3, 21);
  fillRect(grid, 17 + sw, 7 + hb, 2, 1, 22);
  
  // Heavy eyelids
  fillRect(grid, 12 + sw, 6 + hb, 4, 1, 9);
  fillRect(grid, 16 + sw, 5 + hb, 4, 1, 9);
  
  // Dopey smile
  fillRect(grid, 14 + sw, 11 + hb, 4, 1, 9);
  
  // === MESSY HAIR ===
  fillRect(grid, 12 + sw, 3 + hb, 8, 2, 14);
  fillRect(grid, 13 + sw, 2 + hb, 2, 2, 13);
  fillRect(grid, 17 + sw, 2 + hb, 2, 2, 13);
  fillRect(grid, 11 + sw, 4 + hb, 2, 3, 14);
  fillRect(grid, 19 + sw, 4 + hb, 2, 3, 14);
  
  // Stubble
  fillRect(grid, 13 + sw, 11 + hb, 1, 1, 14);
  fillRect(grid, 15 + sw, 12 + hb, 1, 1, 14);
  fillRect(grid, 18 + sw, 11 + hb, 1, 1, 14);
  
  return grid;
}

// Draw Wanderer with premium quality (outlines, solid fills)
export function drawWanderer(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  size: number,
  state: AnimationState,
  frame: number,
  facingLeft: boolean = false
) {
  const scale = size / 32;
  const grid = buildWandererGrid(state, frame);
  const outlined = addOutline(grid);
  renderGrid(ctx, outlined, WANDERER_PALETTE, x, y, scale, facingLeft);
}

// Draw Drunkard with premium quality
export function drawDrunkard(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  size: number,
  state: AnimationState,
  frame: number,
  facingLeft: boolean = true,
  randomSeed: number = 0
) {
  const scale = size / 32;
  const grid = buildDrunkardGrid(state, frame, randomSeed);
  const outlined = addOutline(grid);
  renderGrid(ctx, outlined, DRUNKARD_PALETTE, x, y, scale, facingLeft);
}

// Animation state manager with random stumble timing for drunkard
export class SpriteAnimator {
  private state: AnimationState = 'idle';
  private frame: number = 0;
  private lastFrameTime: number = 0;
  private onComplete?: () => void;
  private randomSeed: number = Math.floor(Math.random() * 1000);
  private isDrunkard: boolean = false;
  
  // Drunkard-specific: random stumble system
  private nextStumbleTime: number = 0;
  private stumbleIntensity: number = 0; // 0 = none, 1 = small, 2 = medium, 3 = big
  private stumblePhase: number = 0;
  private stumbleStartTime: number = 0;
  
  constructor(isDrunkard: boolean = false) {
    this.isDrunkard = isDrunkard;
    if (isDrunkard) {
      this.scheduleNextStumble();
    }
  }
  
  // Schedule the next random stumble event
  private scheduleNextStumble() {
    // Random interval between 800ms and 3000ms
    const delay = 800 + Math.random() * 2200;
    this.nextStumbleTime = Date.now() + delay;
    // Random intensity for variety
    this.stumbleIntensity = Math.random() < 0.3 ? 3 : (Math.random() < 0.5 ? 2 : 1);
  }
  
  setState(newState: AnimationState, onComplete?: () => void) {
    if (this.state !== newState) {
      this.state = newState;
      this.frame = 0;
      this.lastFrameTime = Date.now();
      this.onComplete = onComplete;
      // New random seed for variation
      this.randomSeed = Math.floor(Math.random() * 1000);
    }
  }
  
  getState(): AnimationState {
    return this.state;
  }
  
  getFrame(): number {
    return this.frame;
  }
  
  getRandomSeed(): number {
    return this.randomSeed;
  }
  
  // Get current stumble offset for drunkard (for use in drawing)
  getStumbleOffset(): { x: number; y: number; rot: number } {
    if (!this.isDrunkard || this.state !== 'idle' || this.stumbleIntensity === 0) {
      return { x: 0, y: 0, rot: 0 };
    }
    
    const now = Date.now();
    const elapsed = now - this.stumbleStartTime;
    const duration = 400 + this.stumbleIntensity * 150; // 550-850ms per stumble
    
    if (elapsed > duration) {
      return { x: 0, y: 0, rot: 0 };
    }
    
    // Stumble animation curve: quick lurch, slow recovery
    const progress = elapsed / duration;
    const curve = Math.sin(progress * Math.PI); // smooth bump
    const wobble = Math.sin(progress * Math.PI * 3) * (1 - progress); // wobble that fades
    
    const intensity = this.stumbleIntensity;
    return {
      x: Math.round(curve * intensity * (this.stumblePhase % 2 === 0 ? 1 : -1) + wobble * 0.5),
      y: Math.round(Math.abs(curve) * intensity * 0.5),
      rot: curve * intensity * 0.05 * (this.stumblePhase % 2 === 0 ? 1 : -1)
    };
  }
  
  update(): void {
    const now = Date.now();
    
    // Drunkard random stumble check
    if (this.isDrunkard && this.state === 'idle') {
      if (now >= this.nextStumbleTime) {
        // Start a new stumble
        this.stumbleStartTime = now;
        this.stumblePhase++;
        this.randomSeed = Math.floor(Math.random() * 1000);
        this.scheduleNextStumble();
      }
    }
    
    const animation = ANIMATIONS[this.state];
    // Drunkard idle is much slower - 1.5 seconds per frame
    const duration = this.isDrunkard && this.state === 'idle' 
      ? 1500 
      : animation.frameDuration;
    
    if (now - this.lastFrameTime >= duration) {
      this.frame++;
      this.lastFrameTime = now;
      
      if (this.frame >= animation.frames) {
        if (this.state === 'attack' || this.state === 'hurt' || this.state === 'defend') {
          this.state = 'idle';
          this.frame = 0;
          this.randomSeed = Math.floor(Math.random() * 1000);
          if (this.onComplete) {
            this.onComplete();
            this.onComplete = undefined;
          }
        } else {
          this.frame = 0;
          // New random seed each idle cycle for variety
          if (this.isDrunkard) {
            this.randomSeed = Math.floor(Math.random() * 1000);
          }
        }
      }
    }
  }
}
