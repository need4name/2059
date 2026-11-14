import { withClass } from '@/lib/engine/firmware';
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
  const fwLevel = useFirmware(st => st.level(playerClass));

  return useMemo(() => {
    const equippedSlots = (Object.keys(equippedAugmentations) as AugmentationSlot[]).filter(s => equippedAugmentations[s] !== null);
    // Firmware's own attack takes Strike's place (same key, so it drops into Strike's slot on the bar)
    const pool: LoadoutAction[] = [
      { ...basicAttack(playerClass, createPlayer(getTotalAugmentationBonuses(), playerClass).physicalAttack, fwLevel), key: 'base_strike', unlocked: true, source: playerClass !== 'none' ? 'class' : 'base' },
      { ...PLAYER_ACTIONS[1], key: 'base_brace', unlocked: true, source: 'base' },
    ];
    pool.push(...getAugmentCombatActions(equippedSlots));
    if (equippedWeapon) {
      pool.push({ ...gunMove(equippedWeapon), key: `weapon_${equippedWeapon.id}`, unlocked: true, source: 'weapon' });
    }
    return pool;
    // owned upgrades are read inside getAugmentCombatActions
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playerClass, fwLevel, equippedAugmentations, equippedWeapon, owned, getAugmentCombatActions, getTotalAugmentationBonuses]);
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
  const fwLv = useFirmware(st => st.level(cls));
  useFirmware(st => st.forks);
  // The play-i tree's Fifth slot, and the Wretch's own slots
  // Reflex brace (memory): while Brace is on the bar it takes no slot, so the bar is one longer
  const mem = usePlayi(st => st.ranks), memPerks = memoryPerks(mem);
  const slotCount = BASE_SLOT_COUNT + memPerks.extraSlots + withClass(NO_PERKS, cls, fwLv).extraSlots + (memPerks.braceFree && slots.some(a => a?.key === 'base_brace') ? 1 : 0);
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
    knownKeys.current = pool.map(a => a.key);
    if (changed) setSlots(next);
  }, [pool, slots, phase, setSlots, slotCount]);
}
