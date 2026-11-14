import { withClass, firmwareAttack } from '@/lib/engine/firmware';
import { useEffect, useMemo, useRef } from 'react';
import { useCombat } from '@/lib/stores/useCombat';
import { useInventory } from '@/lib/stores/useInventory';
import { useLoadout, LoadoutAction, BASE_SLOT_COUNT } from '@/lib/stores/useLoadout';
import { usePlayi } from '@/lib/stores/usePlayi';
import { NO_PERKS } from '@/lib/engine/playi';
import { memoryPerks } from '@/lib/engine/memory';
import { useAugmentTrees, gunMove } from '@/lib/stores/useAugmentTrees';
import { PLAYER_ACTIONS, basicAttack, createPlayer } from '@/lib/combat/actions';
import { useFirmware } from '@/lib/stores/useFirmware';
import type { AugmentationSlot } from '@/lib/combat/types';

/** Every action the player could put in a loadout slot right now. */
export function useActionPool(): LoadoutAction[] {
  const playerClass = useCombat(s => s.playerClass);
  const { equippedAugmentations, equippedWeapon, getTotalAugmentationBonuses } = useInventory();
  const { owned, getAugmentCombatActions } = useAugmentTrees();
  // What every firmware's lane has bought (the moves change with it)
  const fwRanks = useFirmware(st => st.ranks);
  const opened = useFirmware(st => st.opened);
  const crossLoad = usePlayi(st => memoryPerks(st.ranks).crossLoad);

  return useMemo(() => {
    const equippedSlots = (Object.keys(equippedAugmentations) as AugmentationSlot[]).filter(s => equippedAugmentations[s] !== null);
    // Firmware's own attack takes Strike's place (same key, so it drops into Strike's slot on the bar)
    const pool: LoadoutAction[] = [
      { ...basicAttack(playerClass), key: 'base_strike', unlocked: true, source: playerClass !== 'none' ? 'class' : 'base' },
      { ...PLAYER_ACTIONS[1], key: 'base_brace', unlocked: true, source: 'base' },
    ];
    // Cross-load (memory): every other firmware you've opened lends its own move, to slot like any other
    if (crossLoad) for (const cls of opened) {
      if (cls === playerClass || cls === 'none') continue;
      const move = firmwareAttack(cls, fwRanks[cls] ?? {});
      if (move) pool.push({ ...move, key: `fw_${cls}`, unlocked: true, source: 'class' });
    }
    pool.push(...getAugmentCombatActions(equippedSlots));
    if (equippedWeapon) {
      pool.push({ ...gunMove(equippedWeapon), key: `weapon_${equippedWeapon.id}`, unlocked: true, source: 'weapon' });
    }
    return pool;
    // owned upgrades are read inside getAugmentCombatActions
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playerClass, fwRanks, crossLoad, opened, equippedAugmentations, equippedWeapon, owned, getAugmentCombatActions, getTotalAugmentationBonuses]);
}

/**
 * Keeps the loadout in step with the pool: fills Strike/Brace on a fresh run,
 * refreshes slotted actions when they upgrade, and clears ones you no longer
 * have (a sold weapon, an unequipped implant, a previous body's class move).
 */
export function useLoadoutSync() {
  const pool = useActionPool();
  const phase = useCombat(s => s.phase);
  const { slots, setSlots } = useLoadout();
  const cls = useCombat(s => s.playerClass);
  const fwRanks = useFirmware(st => st.ranks[cls]);
  // The play-i tree's Fifth slot, and the Wretch's own slots
  // Reflex brace (memory): Brace takes no slot. The bar is one longer and Brace is always on it
  const mem = usePlayi(st => st.ranks), memPerks = memoryPerks(mem);
  const slotCount = BASE_SLOT_COUNT + memPerks.extraSlots + withClass(NO_PERKS, cls, fwRanks ?? {}).extraSlots + (memPerks.braceFree ? 1 : 0);
  // Moves that were already available last time; only genuinely new ones auto-fill,
  // so a slot you cleared on purpose stays empty
  const knownKeys = useRef<string[] | null>(null);

  useEffect(() => {
    const byKey = new Map(pool.map(a => [a.key, a]));
    const inFight = phase === 'player_turn' || phase === 'enemy_turn';
    let changed = false;
    // The bar is as long as the play-i tree allows (Fifth slot adds one)
    if (!inFight && slots.length !== slotCount) {
      const resized = [...slots.slice(0, slotCount)];
      while (resized.length < slotCount) resized.push(null);
      setSlots(resized);
      return;
    }
    // Don't reshuffle buttons in the middle of a fight; only fill an empty bar
    let next = inFight ? slots : slots.map(s => {
      if (!s) return s;
      const fresh = byKey.get(s.key);
      if (!fresh) { changed = true; return null; }
      if (JSON.stringify(fresh) !== JSON.stringify(s)) { changed = true; return fresh; }
      return s;
    }) as typeof slots;
    if (next.every(s => s === null)) {
      next = [byKey.get('base_strike') ?? null, byKey.get('base_brace') ?? null, ...Array.from({ length: slotCount - 2 }, () => null)];
      changed = true;
    }
    // A newly gained move (fresh implant, weapon or class) drops into an empty slot by itself
    if (!inFight && next.some(s => s === null)) {
      const have = new Set(next.filter(Boolean).map(s => s!.key));
      const seen = new Set(knownKeys.current ?? pool.map(a => a.key));
      const fresh = pool.filter(a => !have.has(a.key) && !seen.has(a.key));
      if (fresh.length) {
        next = [...next] as typeof slots;
        for (const a of fresh) {
          const i = next.findIndex(s => s === null);
          if (i < 0) break;
          next[i] = a; changed = true;
        }
      }
    }
    // Reflex brace: Brace is always there (if it's been taken off, it goes back on the first empty slot, else the last)
    if (!inFight && memPerks.braceFree && !next.some(s => s?.key === 'base_brace') && byKey.get('base_brace')) {
      next = [...next] as typeof slots;
      const at = next.findIndex(s => s === null);
      next[at >= 0 ? at : next.length - 1] = byKey.get('base_brace')!; changed = true;
    }
    knownKeys.current = pool.map(a => a.key);
    if (changed) setSlots(next);
  }, [pool, slots, phase, setSlots, slotCount]);
}
