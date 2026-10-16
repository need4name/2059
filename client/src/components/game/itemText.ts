import type { Item, CombatAction } from '@/lib/combat/types';

const STIM_TEXT: Record<NonNullable<Item['consumableEffect']>, { label: string; effect: string; icon: string }> = {
  bio_stim: { label: 'Bio-Stim', effect: 'Restore 60% HP', icon: '💉' },
  structural_patch: { label: 'Structural Patch', effect: 'Repair 60% structure', icon: '🔩' },
  heat_flush: { label: 'Heat Flush', effect: 'Heat to 0', icon: '🧊' },
  overclock: { label: 'Overclock', effect: 'Next attack crits · free action', icon: '⚡' },
};

export function stimInfo(item: Item) {
  if (item.consumableEffect) return STIM_TEXT[item.consumableEffect];
  return { label: item.name, effect: item.hpBonus ? `Restore ${item.hpBonus} HP` : 'Consumable', icon: item.icon || '💊' };
}

/** Short stat line for an implant, e.g. "+3 ATK · +2 DEF · +10 HP". */
export function implantStats(item: Item): string {
  const parts = [
    item.attackBonus ? `+${item.attackBonus} ATK` : '',
    item.structuralAttackBonus ? `+${item.structuralAttackBonus} S-ATK` : '',
    item.defenseBonus ? `+${item.defenseBonus} DEF` : '',
    item.structuralDefenseBonus ? `+${item.structuralDefenseBonus} S-DEF` : '',
    item.hpBonus ? `+${item.hpBonus} HP` : '',
    item.evasionBonus ? `+${item.evasionBonus} EVA` : '',
  ].filter(Boolean);
  return parts.join(' · ') || 'No stat bonus';
}

export function passiveText(item: Item): string | null {
  if (item.passiveEffect === 'kizuna_coldstart') return 'Kizuna: first strike while cool always lands clean';
  if (item.passiveEffect === 'bypass_sdef') return 'CBN: attacks ignore enemy structural defence';
  return null;
}

export function conditionText(item: Item): string | null {
  switch (item.condition) {
    case 'worn': return 'Worn · 80% effect';
    case 'degraded': return 'Degraded · 60% effect, small infection risk';
    case 'corroded': return 'Corroded · 45% effect, infected';
    default: return null;
  }
}

const PATTERN_TEXT: Record<string, string> = {
  melee: 'One tile next to you',
  melee_long: 'Straight line, 2 tiles',
  diagonal_cross: 'X-burst, diagonals 2 deep',
  cone: 'Wedge ahead, 1 then 3',
  aoe: '3×3 blast up to 3 away',
  ranged: 'Shot, 2–4 in a clear line',
  sweep_arc: 'Arc of 3 in front',
  lunge: 'Exactly 2 away',
  knockback: 'Line of 3, pushes back',
  charge: 'Charge lane, 2–3 tiles',
  ring: 'Ring, all tiles 2 away',
  beam: 'Whole row or column',
};

export function rangeText(action: CombatAction): string {
  if (action.type === 'brace' || action.type === 'defend') return 'Self';
  if (action.ignoreRange) return 'Any range';
  return PATTERN_TEXT[action.attackPattern ?? 'melee_long'] ?? 'Close';
}
