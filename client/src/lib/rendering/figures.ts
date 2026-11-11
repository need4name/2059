// Each character's look, from content/figures.json: its body and maker, colours,
// headwear, clothes, built-in limbs and what it holds. rendering/dolls.ts draws it
// (dollSpecs.ts turns a look plus carried implants into a doll).

import data from '../../content/figures.json';

export interface FigureSpec {
  /** The body it stands in (a frame in dolls.ts) and whose plastic its built-in limbs are. */
  body?: string; maker?: string;
  build: 'slim' | 'medium' | 'heavy' | 'hunched';
  skin: string; cloth: string; accent: string; eyes: string; hair: string;
  head: 'bare' | 'hood' | 'helmet' | 'visor' | 'mask' | 'surgical' | 'cap' | 'scarf' | 'crown' | 'blank';
  arms: [ArmKind, ArmKind];
  legs: 'flesh' | 'metal';
  chest: string[];
  weapon: 'none' | 'hook' | 'baton' | 'gun' | 'scalpel' | 'shield';
}
export type ArmKind = 'flesh' | 'metal' | 'crane' | 'claw' | 'blade' | 'pump';

export const FIGURES = (data as unknown as { figures: Record<string, FigureSpec> }).figures;
export const HEAD_KINDS = ['bare', 'hood', 'helmet', 'visor', 'mask', 'surgical', 'cap', 'scarf', 'crown', 'blank'] as const;
export const ARM_KINDS = ['flesh', 'metal', 'crane', 'claw', 'blade', 'pump'] as const;
export const CHEST_KINDS = ['chip', 'rags', 'belt', 'stripes', 'pump', 'robe', 'antenna', 'stitches', 'apron', 'tank', 'badge', 'pads', 'number', 'chain', 'coat', 'cape', 'cross'] as const;
export const WEAPON_KINDS = ['none', 'hook', 'baton', 'gun', 'scalpel', 'shield'] as const;
