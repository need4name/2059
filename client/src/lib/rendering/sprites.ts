import { Character } from '../combat/types';

export interface SpritePosition {
  x: number;
  y: number;
  width: number;
  height: number;
}

// Simple pixel art rendering for characters
export function drawCharacterSprite(
  ctx: CanvasRenderingContext2D,
  character: Character,
  position: SpritePosition,
  isAnimating: boolean = false
) {
  const { x, y, width, height } = position;
  const animOffset = isAnimating ? Math.sin(Date.now() / 100) * 5 : 0;
  
  // Shadow
  ctx.fillStyle = 'rgba(0, 0, 0, 0.3)';
  ctx.beginPath();
  ctx.ellipse(x + width / 2, y + height + 5, width * 0.4, height * 0.1, 0, 0, Math.PI * 2);
  ctx.fill();
  
  // Character body (simple pixel art style)
  ctx.fillStyle = character.spriteColor;
  
  // Body
  ctx.fillRect(x + width * 0.3, y + height * 0.3 + animOffset, width * 0.4, height * 0.5);
  
  // Head
  ctx.fillRect(x + width * 0.35, y + height * 0.1 + animOffset, width * 0.3, height * 0.25);
  
  // Arms
  ctx.fillRect(x + width * 0.15, y + height * 0.4 + animOffset, width * 0.15, height * 0.3);
  ctx.fillRect(x + width * 0.7, y + height * 0.4 + animOffset, width * 0.15, height * 0.3);
  
  // Legs
  ctx.fillRect(x + width * 0.35, y + height * 0.75 + animOffset, width * 0.12, height * 0.25);
  ctx.fillRect(x + width * 0.53, y + height * 0.75 + animOffset, width * 0.12, height * 0.25);
  
  // Eyes (lighter color)
  const eyeColor = '#ffffff';
  ctx.fillStyle = eyeColor;
  ctx.fillRect(x + width * 0.4, y + height * 0.18 + animOffset, width * 0.08, height * 0.08);
  ctx.fillRect(x + width * 0.52, y + height * 0.18 + animOffset, width * 0.08, height * 0.08);
  
  // Health bar
  drawHealthBar(ctx, character, { x, y: y - 20, width, height: 8 });
}

export function drawHealthBar(
  ctx: CanvasRenderingContext2D,
  character: Character,
  position: SpritePosition
) {
  const { x, y, width, height } = position;
  const healthPercent = character.currentHp / character.maxHp;
  
  // Background
  ctx.fillStyle = '#374151';
  ctx.fillRect(x, y, width, height);
  
  // Health
  const healthColor = healthPercent > 0.5 ? '#10b981' : healthPercent > 0.25 ? '#f59e0b' : '#ef4444';
  ctx.fillStyle = healthColor;
  ctx.fillRect(x, y, width * healthPercent, height);
  
  // Border
  ctx.strokeStyle = '#1f2937';
  ctx.lineWidth = 2;
  ctx.strokeRect(x, y, width, height);
}

export function drawDamageNumber(
  ctx: CanvasRenderingContext2D,
  damage: number,
  position: { x: number; y: number },
  alpha: number = 1
) {
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.font = 'bold 24px monospace';
  ctx.fillStyle = '#ef4444';
  ctx.strokeStyle = '#1f2937';
  ctx.lineWidth = 3;
  
  const text = `-${damage}`;
  const metrics = ctx.measureText(text);
  const x = position.x - metrics.width / 2;
  const y = position.y;
  
  ctx.strokeText(text, x, y);
  ctx.fillText(text, x, y);
  ctx.restore();
}

export type FloatingMessageType = 'info' | 'damage' | 'heal' | 'critical' | 'victory' | 'defeat';

export function drawFloatingMessage(
  ctx: CanvasRenderingContext2D,
  message: string,
  position: { x: number; y: number },
  type: FloatingMessageType = 'info',
  alpha: number = 1,
  scale: number = 1
) {
  ctx.save();
  ctx.globalAlpha = alpha;
  
  const baseSize = type === 'victory' || type === 'defeat' ? 32 : 18;
  ctx.font = `bold ${Math.floor(baseSize * scale)}px monospace`;
  
  const colors: Record<FloatingMessageType, { fill: string; stroke: string }> = {
    info: { fill: '#3b82f6', stroke: '#1e3a5f' },
    damage: { fill: '#ef4444', stroke: '#7f1d1d' },
    heal: { fill: '#22c55e', stroke: '#14532d' },
    critical: { fill: '#f59e0b', stroke: '#78350f' },
    victory: { fill: '#fbbf24', stroke: '#451a03' },
    defeat: { fill: '#dc2626', stroke: '#450a0a' },
  };
  
  const { fill, stroke } = colors[type];
  ctx.fillStyle = fill;
  ctx.strokeStyle = stroke;
  ctx.lineWidth = 3;
  
  const metrics = ctx.measureText(message);
  const x = position.x - metrics.width / 2;
  const y = position.y;
  
  ctx.strokeText(message, x, y);
  ctx.fillText(message, x, y);
  ctx.restore();
}
