import { useEffect, useMemo } from 'react';
import { useCombat } from '@/lib/stores/useCombat';
import { useInventory } from '@/lib/stores/useInventory';
import { useLoadout, LoadoutAction } from '@/lib/stores/useLoadout';
import { useAugmentTrees } from '@/lib/stores/useAugmentTrees';
import { PLAYER_ACTIONS, createPlayer, CLASS_DEFINITIONS } from '@/lib/combat/actions';
import type { AugmentationSlot } from '@/lib/combat/types';

/** Every action the player could put in a loadout slot right now. */
export function useActionPool(): LoadoutAction[] {
  const playerClass = useCombat(s => s.playerClass);
  const { equippedAugmentations, equippedWeapon, getTotalAugmentationBonuses } = useInventory();
  const { progress, getAugmentCombatActions } = useAugmentTrees();

  return useMemo(() => {
    const equippedSlots = (Object.keys(equippedAugmentations) as AugmentationSlot[]).filter(s => equippedAugmentations[s] !== null);
    const classInfo = CLASS_DEFINITIONS[playerClass];
    const stats = createPlayer(getTotalAugmentationBonuses(), playerClass);
    const pool: LoadoutAction[] = [
      { ...PLAYER_ACTIONS[0], key: 'base_strike', unlocked: true, source: 'base' },
      { ...PLAYER_ACTIONS[1], key: 'base_brace', unlocked: true, source: 'base' },
    ];
    if (playerClass !== 'none' && classInfo) {
      const sp = classInfo.specialAbility;
      pool.push({
        type: 'special',
        name: sp.name,
        description: sp.description,
        damage: sp.damage ? Math.floor(stats.physicalAttack * sp.damage) : undefined,
        healing: sp.healing,
        defenseBoost: sp.defenseBoost,
        heatGenerated: 25,
        accuracy: 'precise',
        attackPattern: sp.attackPattern,
        ignoreRange: sp.ignoreRange,
        physicalRatio: sp.physicalRatio,
        key: `class_special_${playerClass}`,
        unlocked: true,
        source: 'class',
      });
    }
    pool.push(...getAugmentCombatActions(equippedSlots));
    if (equippedWeapon) {
      pool.push({ ...equippedWeapon.combatAction, key: `weapon_${equippedWeapon.id}`, unlocked: true, source: 'weapon' });
    }
    return pool;
    // progress is read inside getAugmentCombatActions
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playerClass, equippedAugmentations, equippedWeapon, progress, getAugmentCombatActions, getTotalAugmentationBonuses]);
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

  useEffect(() => {
    const byKey = new Map(pool.map(a => [a.key, a]));
    const inFight = phase === 'player_turn' || phase === 'enemy_turn';
    let changed = false;
    // Don't reshuffle buttons in the middle of a fight; only fill an empty bar
    let next = inFight ? slots : slots.map(s => {
      if (!s) return s;
      const fresh = byKey.get(s.key);
      if (!fresh) { changed = true; return null; }
      if (JSON.stringify(fresh) !== JSON.stringify(s)) { changed = true; return fresh; }
      return s;
    }) as typeof slots;
    if (next.every(s => s === null)) {
      next = [byKey.get('base_strike') ?? null, byKey.get('base_brace') ?? null, null, null];
      changed = true;
    }
    if (changed) setSlots(next);
  }, [pool, slots, phase, setSlots]);
}
