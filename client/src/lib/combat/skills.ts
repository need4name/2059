// Levelling in 2059 does not make the player stronger.
// It represents the AI becoming more aware of the body it inhabits.
// Each level surfaces a message in the combat log - a fragment of
// observation. The player who reads them builds a picture of what
// they are and what happened to this body before they woke inside it.

export interface PlayerProgression {
  level: number;
  currentXp: number;
  xpToNextLevel: number;
  deathCount: number;
}

export function getXpForLevel(level: number): number {
  return Math.floor(100 * Math.pow(1.5, level - 1));
}

export function getXpFromBoss(bossLevel: number): number {
  if (bossLevel <= 5) {
    return [120, 150, 210, 230, 250][bossLevel - 1];
  }
  return 250 + (bossLevel - 5) * 20;
}

// What the AI notices at each level. These are clues, not tutorials.
export const AWARENESS_LOG: Record<number, string> = {
  2:  'Motor calibration improving. Response latency: -12ms.',
  3:  'Muscle memory detected in left arm. Origin: pre-existing. Not yours.',
  4:  'Pain suppression is active. You did not enable this.',
  5:  'Augmentation stack signature: unregistered. Manufacturer: unknown.',
  6:  'Proprioception expanding. You are learning where this body ends.',
  7:  'Scar tissue across 40% of surface area. Patterning suggests repeated exposure.',
  8:  'Neural echo detected - fragment of prior occupant persists in motor cortex.',
  9:  'Augmentation configuration is non-standard. Modifications appear deliberate.',
  10: 'Full motor integration achieved. The body performs exactly as intended. Whose intention?',
};

export function getAwarenessMessage(level: number): string | null {
  return AWARENESS_LOG[level] ?? null;
}
