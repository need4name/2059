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
  if (item.passiveEffect === 'kizuna_coldstart') return 'First strike while cool lands clean';
  if (item.passiveEffect === 'bypass_sdef') return 'Cuts through shielding';
  return null;
}

export function conditionText(item: Item): string | null {
  switch (item.condition) {
    case 'worn': return 'Worn';
    case 'degraded': return 'Degraded';
    case 'corroded': return 'Corroded';
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
  bolt: 'Line of 4, first body only',
  pierce: 'Line of 4, through everyone',
  longshot: 'Any line to the edge, not within 2',
  grapple: 'Line of 3, catches the first body',
  lob: 'Lobbed 2–4 away, hits a plus',
  burst: 'Every tile around you',
};

export function rangeText(action: CombatAction): string {
  if (action.type === 'brace' || action.type === 'defend') return 'Self';
  if (action.ignoreRange) return 'Any range';
  return PATTERN_TEXT[action.attackPattern ?? 'melee_long'] ?? 'Close';
}

/** The side effects an attack carries, in plain words ("pushes back · bleeds"). */
export function effectsText(action: CombatAction): string | null {
  const fx = action.effects ?? {};
  const out = [
    fx.focus && 'hits only the nearest one',
    fx.knock && 'pushes back',
    fx.pull && 'drags toward you',
    fx.bleed && 'bleeds',
    fx.stun && `${Math.round(fx.stun * 100)}% stun`,
    fx.drain && `heals you ${Math.round(fx.drain * 100)}% of damage`,
    fx.crush && 'crushing collisions',
    fx.cool && `vents ${fx.cool} heat`,
    fx.retreat && 'you step back after',
    fx.pounce && 'you leap in beside them',
    fx.vault && 'you vault over them',
    fx.dash && 'you dash through',
    fx.ignoreCover && 'through cover',
    fx.slow && 'slows them',
    fx.haste && 'hastes you',
    fx.ignite && 'sets them alight',
    (action.heatTransfer ?? 0) >= 6 && `heats them +${action.heatTransfer}`,
    action.healing && `heals you ${action.healing}`,
    fx.hotBonus && `+${Math.round(fx.hotBonus * 100)}% while hot`,
    fx.lowBonus && `+${Math.round(fx.lowBonus * 100)}% while low on health`,
    fx.reap && 'a takedown vents your heat and guards you',
  ].filter(Boolean);
  return out.length ? out.join(' · ') : null;
}

const pc = (x?: number) => `${Math.round((x ?? 0) * 100)}%`;
/** A defensive move's headline for its fight-bar button: what it mostly does, in two or three words. */
export function defendSummary(action: CombatAction): string | null {
  const d = action.defend;
  if (!d) return null;
  if (d.counter) return `${pc(d.counter.chance)} counter`;
  const now = (d.heal ?? 0) + (d.repair ?? 0), over = ((d.healOver ?? 0) + (d.repairOver ?? 0)) * (d.turns ?? 0);
  if (now || over) return `${d.heal || d.healOver ? 'heal' : 'repair'} ${pc(now + over)}${over && !now ? ' slow' : ''}`;
  if (d.physCut || d.specialCut) return `guard ${pc(Math.max(d.physCut ?? 0, d.specialCut ?? 0))}`;
  return null;
}
/** Everything a defensive move does, in plain words, for cards out of a fight. */
export function defendText(action: CombatAction): string | null {
  const d = action.defend;
  if (!d) return null;
  const who = d.targets === 'wide' ? `you and every ally within ${d.reach}` : d.targets === 'split2' ? `you and an ally within ${d.reach}` : d.targets === 'focused' ? `you or an ally within ${d.reach}` : null;
  const gives = (what: string, now?: number, over?: number) => now || over
    ? `${what} ${[now ? `${pc(now)} now` : '', over ? `${pc(over)} a turn for ${d.turns} turns` : ''].filter(Boolean).join(' and ')}`
    : null;
  return [
    who,
    gives('heals', d.heal, d.healOver),
    gives('repairs', d.repair, d.repairOver),
    d.physCut && `physical hits ${pc(d.physCut)} softer`,
    d.specialCut && `special hits ${pc(d.specialCut)} softer`,
    d.specialHeatCut && `special hits heat you ${pc(d.specialHeatCut)} less`,
    d.counter && `${pc(d.counter.chance)} chance to send ${pc(d.counter.share)} of a hit back`,
    d.counterStun && 'a counter stuns',
    d.anchor && "can't be shoved",
    d.step && `you step ${d.step === 1 ? 'a tile' : `${d.step} tiles`} back`,
    d.cleanse && 'stops bleeding and burning',
    d.overload && `+${d.overload} Overload`,
    d.haste && 'you act sooner',
    d.roll && 'can land weak or strong',
    d.lastStand && 'twice as strong under 30% health',
    d.needs === 'still' && "only if you haven't moved",
    d.needs === 'low' && 'only under half health',
    d.physCut || d.specialCut || d.counter || d.anchor ? 'lasts until your next turn' : null,
  ].filter(Boolean).join(' · ');
}

/**
 * Only what the board can't show, for the line above the fight bar: what it does to them
 * and to you. Moving (shoves, drags, dashes, leaps, steps), the damage type, aim, targets
 * and heat push all show on the tiles instead.
 */
export function statusText(action: CombatAction): string | null {
  const d = action.defend;
  if (d) {
    // Heals show on the bars, guards as an outline, steps as an arrow: the rest in words
    const out = [
      d.counter && `${pc(d.counter.chance)} chance to send ${pc(d.counter.share)} back`,
      d.counterStun && 'stuns',
      d.anchor && "can't be shoved",
      d.cleanse && 'stops bleeding and burning',
      d.overload && `+${d.overload} Overload`,
      d.haste && 'you act sooner',
      d.roll && 'can land weak or strong',
    ].filter(Boolean);
    return out.length ? out.join(' · ') : null;
  }
  const fx = action.effects ?? {};
  const out = [
    fx.bleed && 'bleeds',
    fx.stun && `${Math.round(fx.stun * 100)}% stun`,
    fx.slow && 'slows them',
    fx.ignite && 'sets them alight',
    fx.crush && 'crushing collisions',
    fx.drain && `heals you ${Math.round(fx.drain * 100)}% of damage`,
    action.healing && `heals you ${action.healing}`,
    fx.cool && `vents ${fx.cool} heat`,
    fx.haste && 'hastes you',
    fx.hotBonus && `+${Math.round(fx.hotBonus * 100)}% while hot`,
    fx.lowBonus && `+${Math.round(fx.lowBonus * 100)}% while low on health`,
    fx.reap && 'a takedown vents your heat and guards you',
  ].filter(Boolean);
  return out.length ? out.join(' · ') : null;
}

/** An item's name as shown: without the bracketed maker stamp. */
export const nameOf = (item: { name: string }) => item.name.replace(/^\[[A-Z]+\]\s*/, '').replace(/\s+-\s+[A-Z]+$/, '');
