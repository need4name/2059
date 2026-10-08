                     import { useCombat } from '@/lib/stores/useCombat';
                     import { useInventory } from '@/lib/stores/useInventory';
                     import { useLoadout, LoadoutAction, getMechanicTag } from '@/lib/stores/useLoadout';
                     import { useAugmentTrees } from '@/lib/stores/useAugmentTrees';
                     import { AUGMENT_TREES } from '@/lib/combat/augmentTrees';
                     import { PLAYER_ACTIONS, createPlayer, CLASS_DEFINITIONS } from '@/lib/combat/actions';
                     import { TIER1_WEAPONS, getUpgrade } from '@/lib/combat/weapons2059';
                     import { Button } from '@/components/ui/button';
                     import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
                     import { Badge } from '@/components/ui/badge';
                     import { LootDisplay } from './LootDisplay';
                     import { Inventory } from './Inventory';
                     import { ClassSelector } from './ClassSelector';
                     import { DebugPanel } from './DebugPanel';
                     import { Heart, Sword, Shield, Bug } from 'lucide-react';
                     import { useState, useEffect } from 'react';
                     import { HeatBar } from './HeatBar';

                     export function GameUI() {
                     const [showDebugPanel, setShowDebugPanel] = useState(false);
                     const { phase, combatLog, resetCombat, resetAll, startCombat, startFarmCombat, currentLoot, bossLevel, boss, player, playerClass, classLocked, introCompleted, debugMode, toggleDebugMode, selectedAction, setSelectedAction, endTurn, useConsumableItem, progression, rebirth, setPlayerClass, hasMoved, undoMove, bossChargingHeavy, playerMalfunctioning, bossMalfunctioning, playerHeat, bossHeat, doubleActionReady, leaveShop, grid, overclockActive, kizunaJustFired } = useCombat();
                     const { items, gold, getTotalAugmentationBonuses, equippedAugmentations, ownedWeapons, equippedWeapon, buyWeapon, upgradeWeapon, sellWeapon, equipWeapon } = useInventory();
                     const { slots, editingSlot, setSlot, setEditingSlot, getActiveCombatActions } = useLoadout();
                     const { progress: treeProgress, availablePoints, choosePath, upgradeTier, getAugmentCombatActions } = useAugmentTrees();
                     const [showBag, setShowBag] = useState(false);
                     const [pendingEquipWeaponId, setPendingEquipWeaponId] = useState<string | null>(null);

                     // Guard: only create player stats and get class info if playerClass exists in CLASS_DEFINITIONS
                     // CLASS_DEFINITIONS includes 'none' (Wanderer), 'melee' (Warrior), and 'ranged' (Archer)
                     const hasValidClass = CLASS_DEFINITIONS[playerClass] !== undefined;
                     const augBonuses = getTotalAugmentationBonuses();
                     const playerStats = hasValidClass ? createPlayer(augBonuses, playerClass) : null;
                     const classInfo = hasValidClass ? CLASS_DEFINITIONS[playerClass] : null;

                     // Get consumables from inventory
                     const consumables = items.filter(item => item.type === 'consumable');

                     // Auto-close bag modal when consumables are empty
                     useEffect(() => {
                     if (showBag && consumables.length === 0) {
                     setShowBag(false);
                     }
                     }, [consumables.length, showBag]);

                     // Bug fix: Close bag modal when phase changes away from player_turn (forfeit, death, victory)
                     useEffect(() => {
                     if (phase !== 'player_turn' && showBag) {
                     setShowBag(false);
                     }
                     }, [phase, showBag]);

                     // Check if player is at full HP (with null safety for non-combat phases)
                     const isAtFullHP = player ? player.currentHp >= player.maxHp : false;

                     // Build the available action pool for this run - what the player can assign to slots
                     // Base actions always available. Class special unlocks with class. Augment actions come later.
                     // Derive which slots are currently equipped
                     const equippedSlots = Object.entries(equippedAugmentations)
                     .filter(([, item]) => item !== null)
                     .map(([slot]) => slot as import('@/lib/combat/types').AugmentationSlot);

                     // Actions unlocked through augment trees
                     const augmentActions = getAugmentCombatActions(equippedSlots);

                     const availableActions: LoadoutAction[] = hasValidClass && classInfo && playerStats ? [
                     {
                     ...PLAYER_ACTIONS[0], // Strike
                     key: 'base_strike',
                     unlocked: true,
                     source: 'base' as const,
                     },
                     {
                     ...PLAYER_ACTIONS[1], // Brace
                     key: 'base_brace',
                     unlocked: true,
                     source: 'base' as const,
                     },
                     ...(playerClass !== 'none' ? [{
                     type: 'special' as const,
                     name: classInfo.specialAbility.name,
                     description: classInfo.specialAbility.description,
                     damage: classInfo.specialAbility.damage
                     ? Math.floor(playerStats.physicalAttack * classInfo.specialAbility.damage)
                     : undefined,
                     healing: classInfo.specialAbility.healing,
                     defenseBoost: classInfo.specialAbility.defenseBoost,
                     heatGenerated: 25,
                     attackPattern: classInfo.specialAbility.attackPattern,
                     ignoreRange: classInfo.specialAbility.ignoreRange,
                     physicalRatio: classInfo.specialAbility.physicalRatio,
                     key: `class_special_${playerClass}`,
                     unlocked: true,
                     source: 'class' as const,
                     } as LoadoutAction] : []),
                     // Augment tree actions - appear here once tree is progressed past tier 0
                     ...augmentActions,
                     // Equipped weapon - generates a CombatAction in the loadout pool
                     ...(equippedWeapon ? [{
                     ...equippedWeapon.combatAction,
                     key: `weapon_${equippedWeapon.id}`,
                     unlocked: true,
                     source: 'weapon' as const,
                     } as LoadoutAction] : []),
                     ] : [];

                     // Active combat actions come from loadout slots (what player configured)
                     // Falls back to first 2 available actions for fresh runs with no loadout set
                     const activeCombatActions = getActiveCombatActions();
                     const combatActions = activeCombatActions.length > 0
                     ? activeCombatActions
                     : availableActions.filter(a => a.unlocked).slice(0, 2);

                     // Auto-equip Strike and Brace into slots 0 and 1 on a fresh run (all slots empty)
                     // This gives a new player something to work with without forcing a loadout screen
                     useEffect(() => {
                     const allEmpty = slots.every(s => s === null);
                     if (allEmpty && availableActions.length >= 2) {
                     const strike = availableActions.find(a => a.key === 'base_strike');
                     const brace  = availableActions.find(a => a.key === 'base_brace');
                     if (strike) setSlot(0, strike);
                     if (brace)  setSlot(1, brace);
                     }
                     }, [availableActions.length]); // re-check when pool grows (class unlock etc)

                     if (phase === 'menu') {
                     // Show intro page if player hasn't completed class selection
                     if (!introCompleted) {
                     // For first death (deathCount === 0), only show Melee and Ranged
                     const isFirstRun = progression.deathCount === 0;

                     return (

                       <div className="absolute inset-0 bg-gradient-to-b from-gray-950 via-slate-950 to-black flex flex-col overflow-hidden">
                       {/* Atmospheric rain effect */}
                       <div className="absolute inset-0 pointer-events-none opacity-30" style={{
                       background: 'repeating-linear-gradient(180deg, transparent, transparent 8px, rgba(100,116,139,0.03) 8px, rgba(100,116,139,0.03) 10px)'
                       }} />

                     {/* Distant orbital lights - subtle moving glow at top */}

                     <div className="absolute top-0 left-0 right-0 h-32 overflow-hidden pointer-events-none">
                       <div className="absolute top-4 left-1/4 w-2 h-2 bg-amber-400/60 rounded-full blur-sm animate-pulse" />
                       <div className="absolute top-8 left-1/2 w-1.5 h-1.5 bg-cyan-400/40 rounded-full blur-sm" style={{ animationDelay: '1s' }} />
                       <div className="absolute top-6 right-1/3 w-1 h-1 bg-white/30 rounded-full blur-sm animate-pulse" style={{ animationDelay: '2s' }} />
                     </div>

                     {/* Dim city glow on horizon */}

                     <div className="absolute bottom-0 left-0 right-0 h-48 bg-gradient-to-t from-amber-950/20 via-transparent to-transparent pointer-events-none" />

                     {/* Fog/haze layer */}

                     <div className="absolute inset-0 bg-gradient-to-b from-transparent via-slate-900/20 to-slate-950/40 pointer-events-none" />

                     <div className="flex-1 flex flex-col justify-center items-center p-4 relative z-10">
                       <div className="w-full max-w-lg mx-auto">
                         {isFirstRun ? (
                           <div className="space-y-12 text-center">
                             {/* Title - Minimal */}
                             <div className="space-y-4">
                               <h1 className="text-4xl sm:text-6xl font-light tracking-[0.4em] text-slate-400/80 font-mono">
                                 2059
                               </h1>
                               <div className="h-px w-16 mx-auto bg-gradient-to-r from-transparent via-slate-700 to-transparent" />
                             </div>

                     {/* Start button */}

                     <div className="flex flex-col gap-3 items-center">
                       <Button 
                         onClick={startCombat}
                         className="bg-slate-800/60 hover:bg-slate-700/60 text-slate-400 hover:text-slate-200 text-sm px-10 py-6 font-mono tracking-[0.2em] border border-slate-700/40 hover:border-slate-600/50 transition-all duration-300"


>
                                          BEGIN
                     
                       </Button>
                     </div>

                     {/* Subtle footer */}

                     <p className="text-xs text-slate-700/60 tracking-[0.3em] font-mono">
                       THE LONG CONVERGENCE
                     </p>

                       </div>

                     ) : (

                       <div className="space-y-6">
                       {/* Rebirth screen */}
                       <div className="text-center space-y-2">
                       <div className="text-xs text-amber-500/70 font-mono tracking-wider">
                       NEURAL BACKUP RESTORED
                       </div>
                       <h2 className="text-2xl sm:text-3xl font-light tracking-wide text-slate-300">
                       Death #{progression.deathCount}
                       </h2>
                       <p className="text-xs text-slate-500 leading-relaxed max-w-sm mx-auto">
                       Your consciousness persists. The body can be rebuilt.
                       Choose your augmentation path.
                       </p>
                       </div>

                     {/* Class Selection */}

                     <div className="grid grid-cols-1 gap-4">
                       {/* Melee Option */}
                       <div 
                         className={`cursor-pointer transition-all duration-300 p-4 rounded-sm border ${
                           playerClass === 'melee' 
                             ? 'border-amber-600/60 bg-amber-950/30' 
                             : 'border-slate-700/40 bg-slate-900/40 hover:border-slate-600/60 hover:bg-slate-800/40'
                         }`}
                         onClick={() => setPlayerClass('melee')}


>
                                          <div className="flex items-start gap-4">
                       <div className={`w-12 h-12 flex items-center justify-center rounded-sm ${playerClass === 'melee' ? 'bg-amber-900/50 text-amber-400' : 'bg-slate-800/50 text-slate-500'}`}>
                         <Sword className="w-6 h-6" />
                       </div>
                       <div className="flex-1 space-y-1">
                         <h3 className={`text-lg font-medium ${playerClass === 'melee' ? 'text-amber-300' : 'text-slate-300'}`}>
                           {CLASS_DEFINITIONS.melee.name}
                         </h3>
                         <p className="text-xs text-slate-500">
                           Salvaged combat augments. Hydraulic limbs from decommissioned security units. 
                           Close-range devastation.
                         </p>
                         <div className="flex gap-4 text-xs font-mono pt-1">
                           <span className="text-slate-500">HP:<span className={playerClass === 'melee' ? 'text-amber-400' : 'text-slate-400'}> {CLASS_DEFINITIONS.melee.baseHp}</span></span>
                           <span className="text-slate-500">ATK:<span className={playerClass === 'melee' ? 'text-amber-400' : 'text-slate-400'}> {CLASS_DEFINITIONS.melee.baseAttack}</span></span>
                           <span className="text-slate-500">DEF:<span className={playerClass === 'melee' ? 'text-amber-400' : 'text-slate-400'}> {CLASS_DEFINITIONS.melee.baseDefense}</span></span>
                         </div>
                       </div>
                       {playerClass === 'melee' && (
                         <div className="w-2 h-2 bg-amber-500 rounded-full animate-pulse" />
                       )}
                     </div>
                     
                       </div>

                     {/* Ranged Option */}

                       <div 
                         className={`cursor-pointer transition-all duration-300 p-4 rounded-sm border ${
                           playerClass === 'ranged' 
                             ? 'border-cyan-600/60 bg-cyan-950/30' 
                             : 'border-slate-700/40 bg-slate-900/40 hover:border-slate-600/60 hover:bg-slate-800/40'
                         }`}
                         onClick={() => setPlayerClass('ranged')}
                       >
                         <div className="flex items-start gap-4">
                           <div className={`w-12 h-12 flex items-center justify-center rounded-sm text-lg font-mono ${playerClass === 'ranged' ? 'bg-cyan-900/50 text-cyan-400' : 'bg-slate-800/50 text-slate-500'}`}>
                             {">>"}
                           </div>
                           <div className="flex-1 space-y-1">
                             <h3 className={`text-lg font-medium ${playerClass === 'ranged' ? 'text-cyan-300' : 'text-slate-300'}`}>
                               {CLASS_DEFINITIONS.ranged.name}
                             </h3>
                             <p className="text-xs text-slate-500">
                               Repurposed industrial targeting systems. Optical implants from orbital maintenance rigs. 
                               Precision at distance.
                             </p>
                             <div className="flex gap-4 text-xs font-mono pt-1">
                               <span className="text-slate-500">HP:<span className={playerClass === 'ranged' ? 'text-cyan-400' : 'text-slate-400'}> {CLASS_DEFINITIONS.ranged.baseHp}</span></span>
                               <span className="text-slate-500">ATK:<span className={playerClass === 'ranged' ? 'text-cyan-400' : 'text-slate-400'}> {CLASS_DEFINITIONS.ranged.baseAttack}</span></span>
                               <span className="text-slate-500">DEF:<span className={playerClass === 'ranged' ? 'text-cyan-400' : 'text-slate-400'}> {CLASS_DEFINITIONS.ranged.baseDefense}</span></span>
                             </div>
                           </div>
                           {playerClass === 'ranged' && (
                             <div className="w-2 h-2 bg-cyan-500 rounded-full animate-pulse" />
                           )}
                         </div>
                       </div>

                     </div>

                     {/* Continue button */}

                     <div className="text-center pt-2">
                       <Button 
                         onClick={startCombat}
                         disabled={playerClass === 'none'}
                         className="bg-slate-800/80 hover:bg-slate-700/80 disabled:bg-slate-900/50 text-slate-300 hover:text-slate-100 disabled:text-slate-600 text-sm px-8 py-5 font-mono tracking-wider border border-slate-600/50 hover:border-slate-500/50 disabled:border-slate-800/50 transition-all duration-300 disabled:cursor-not-allowed"


>
                                          CONTINUE
                     
                       </Button>
                     </div>

                       </div>

                     )}

                       </div>

                     </div>

                       </div>

                     );
                     }

                     // Show regular menu after intro is completed
                     return (

                     <div className="absolute inset-0 bg-gradient-to-b from-gray-950 via-slate-950 to-black p-2 sm:p-4 overflow-y-auto">
                       {/* Rain effect */}
                       <div className="absolute inset-0 pointer-events-none opacity-20" style={{
                         background: 'repeating-linear-gradient(180deg, transparent, transparent 8px, rgba(100,116,139,0.03) 8px, rgba(100,116,139,0.03) 10px)'
                       }} />

                     {/* Orbital lights */}

                       <div className="absolute top-0 left-0 right-0 h-24 overflow-hidden pointer-events-none">
                         <div className="absolute top-4 left-1/4 w-2 h-2 bg-amber-400/40 rounded-full blur-sm animate-pulse" />
                         <div className="absolute top-6 right-1/3 w-1 h-1 bg-cyan-400/30 rounded-full blur-sm animate-pulse" style={{ animationDelay: '1s' }} />
                       </div>

                       <div className="w-full max-w-lg mx-auto space-y-4 my-4 sm:my-8 relative z-10">
                         {/* Header */}
                         <div className="flex items-center justify-between text-slate-400">
                           <div className="space-y-1">
                             <span className="text-xs font-mono tracking-wider">OFFSHORE SECTOR 7</span>
                             <div className="text-lg text-slate-300">{classInfo?.name || 'Wanderer'}</div>
                           </div>
                           <div className="text-right space-y-1">
                             <div className="text-xs font-mono text-slate-500">REBOOTS: {progression.deathCount}</div>
                             <div className="text-sm font-mono text-slate-400">LV.{progression.level}</div>
                           </div>
                         </div>

                     {/* Stats Panel */}
                     {classInfo && playerStats && (

                       <div className="bg-slate-900/60 border border-slate-700/50 rounded-sm p-4 space-y-3">
                       <div className="flex items-center gap-2 text-xs font-mono text-slate-500">
                       <span className="w-1.5 h-1.5 bg-cyan-500/60 rounded-full" />
                       <span>SYSTEM STATUS</span>
                       </div>
                       <div className="grid grid-cols-3 gap-3 text-sm font-mono">
                       <div className="space-y-1">
                       <div className="text-slate-500 text-xs">HP</div>
                       <div className="text-slate-300">{playerStats.maxHp}</div>
                       </div>
                       <div className="space-y-1">
                       <div className="text-slate-500 text-xs">P-ATK</div>
                       <div className="text-slate-300">{playerStats.physicalAttack}</div>
                       </div>
                       <div className="space-y-1">
                       <div className="text-slate-500 text-xs">S-ATK</div>
                       <div className="text-slate-300">{playerStats.structuralAttack}</div>
                       </div>
                       <div className="space-y-1">
                       <div className="text-slate-500 text-xs">P-DEF</div>
                       <div className="text-slate-300">{playerStats.physicalDefense}</div>
                       </div>
                       <div className="space-y-1">
                       <div className="text-slate-500 text-xs">S-DEF</div>
                       <div className="text-slate-300">{playerStats.structuralDefense}</div>
                       </div>
                       </div>
                       </div>
                       )}

                     {/* Credits display */}

                     <div className="flex items-center justify-between text-sm">
                       <span className="text-slate-500 font-mono">CREDITS</span>
                       <span className="text-amber-400/80 font-mono">{gold}</span>
                     </div>

                     {/* Target info */}

                     <div className="bg-slate-900/40 border border-slate-700/40 rounded-sm p-4 space-y-2">
                       <div className="flex items-center justify-between">
                         <span className="text-xs font-mono text-slate-500">NEXT TARGET</span>
                         <span className="text-xs font-mono text-red-400/70">THREAT LV.{bossLevel}</span>
                       </div>
                       <p className="text-xs text-slate-500">
                         Corporate security patrol. Automated enforcement unit. Neutralize to acquire salvage.
                       </p>
                     </div>

                     {/* Loadout configuration - all 4 slots configurable here */}

                     <div className="bg-slate-900/40 border border-slate-700/40 rounded-sm p-3 space-y-2">
                       <div className="text-xs font-mono text-slate-500 tracking-wider">COMBAT LOADOUT</div>
                       <div className="grid grid-cols-4 gap-1.5">
                         {slots.map((slotAction, idx) => {
                           const tag = slotAction ? getMechanicTag(slotAction) : null;
                           return (
                             <button
                               key={`menu-slot-${idx}`}
                               onClick={() => setEditingSlot(editingSlot === idx ? null : idx)}
                               className={`h-14 flex flex-col items-center justify-center gap-0.5 rounded-sm border text-xs font-mono transition-all ${
                                 editingSlot === idx
                                   ? 'border-amber-600/60 bg-amber-950/30 text-amber-300'
                                   : slotAction
                                     ? slotAction.type === 'brace'
                                       ? 'border-cyan-800/40 bg-slate-800/60 text-cyan-300 hover:bg-slate-800'
                                       : slotAction.type === 'special'
                                         ? 'border-fuchsia-800/40 bg-fuchsia-950/30 text-fuchsia-300 hover:bg-fuchsia-950/50'
                                         : 'border-slate-700/60 bg-slate-800/60 text-slate-300 hover:bg-slate-800'
                                     : 'border-dashed border-slate-700/40 bg-transparent text-slate-700 hover:border-slate-600 hover:text-slate-500'
                               }`}


>
                                                {slotAction ? (
                             <>
                               <span className="font-bold text-xs leading-none w-full text-center truncate px-1">
                                 {slotAction.name.toUpperCase().slice(0, 9)}
                               </span>
                               {tag && <span className="text-xs opacity-50 leading-none">{tag}</span>}
                             </>
                           ) : (
                             <>
                               <span className="text-base leading-none">+</span>
                               <span className="text-xs tracking-wider">{idx + 1}</span>
                             </>
                           )}
                         </button>
                       );
                     })}
                     
                       </div>

                     {/* Inline picker for whichever slot is being edited */}
                     {editingSlot !== null && (

                     <div className="pt-1 space-y-1">
                       <div className="text-xs font-mono text-slate-600 tracking-wider">
                         SLOT {editingSlot + 1} - SELECT ACTION
                       </div>
                       <div className="grid grid-cols-2 gap-1 max-h-52 overflow-y-auto pr-0.5">
                         <button
                           onClick={() => setSlot(editingSlot, null)}
                           className="h-10 text-xs font-mono text-slate-600 hover:text-red-400 border border-dashed border-slate-800 hover:border-red-900/50 rounded-sm transition-all"


>
                                            CLEAR
                     </button>
                     {availableActions.filter(a => a.unlocked).map(action => {
                       const isInThisSlot = slots[editingSlot]?.key === action.key;
                       const isElsewhere = !isInThisSlot && slots.some(s => s?.key === action.key);
                       const tag = getMechanicTag(action);
                       return (
                         <button
                           key={action.key}
                           onClick={() => setSlot(editingSlot, action)}
                           className={`h-10 flex flex-col items-center justify-center gap-0.5 text-xs font-mono border rounded-sm transition-all ${
                             isInThisSlot
                               ? 'ring-1 ring-cyan-500 bg-slate-700 text-cyan-300 border-cyan-700'
                               : isElsewhere
                                 ? 'opacity-40 bg-slate-900/40 text-slate-600 border-slate-800 cursor-not-allowed'
                                 : action.type === 'special'
                                   ? 'bg-fuchsia-950/30 text-fuchsia-300 border-fuchsia-800/40 hover:bg-fuchsia-950/50'
                                   : action.type === 'brace'
                                     ? 'bg-slate-800 text-cyan-300 border-cyan-800/40 hover:bg-slate-700'
                                     : 'bg-slate-800 text-slate-300 border-slate-700 hover:bg-slate-700'
                           }`}
                     
>
                                                <span className="font-bold leading-none">{action.name.toUpperCase().slice(0, 10)}</span>
                           {tag && <span className="text-xs opacity-50 leading-none">{tag}</span>}
                           {isElsewhere && <span className="text-xs text-slate-600 leading-none">IN USE</span>}
                         </button>
                       );
                     })}
                     
                       </div>
                     </div>

                     )}

                     </div>

                     {/* Augment tree panel - upgrade equipped augments between fights */}
                     {equippedSlots.length > 0 && (

                       <div className="bg-slate-900/40 border border-slate-700/40 rounded-sm p-3 space-y-2">
                       <div className="flex items-center justify-between">
                       <span className="text-xs font-mono text-slate-500 tracking-wider">AUGMENT TREES</span>
                       {availablePoints > 0 && (
                       <span className="text-xs font-mono text-amber-400 tracking-wider">
                       {availablePoints} PT{availablePoints !== 1 ? 'S' : ''} AVAILABLE
                       </span>
                       )}
                       </div>

                     <div className="space-y-2">
                       {equippedSlots.map(slot => {
                         const tree = AUGMENT_TREES[slot];
                         if (!tree) return null;
                         const prog = treeProgress[slot];
                         const tier = prog?.tier ?? 0;
                         const chosenPath = prog?.chosenPath ?? null;

                     return (

                       <div key={slot} className="bg-slate-900/60 border border-slate-800/60 rounded-sm p-2 space-y-1.5">
                       {/* Slot header */}
                       <div className="flex items-center justify-between">
                       <span className="text-xs font-mono text-slate-400 tracking-wider">
                       {tree.displayName.toUpperCase()}
                       </span>
                       <span className="text-xs font-mono text-slate-600">
                       {chosenPath ? `PATH ${chosenPath} · T${tier}` : 'CHOOSE PATH'}
                       </span>
                       </div>

                     {/* Branch choice - shown only if not yet chosen */}
                     {!chosenPath && (

                       <div className="grid grid-cols-2 gap-1">
                       {(['A', 'B'] as const).map(path => (
                       <button
                       key={path}
                       onClick={() => choosePath(slot, path)}
                       className="h-12 flex flex-col items-center justify-center gap-0.5 bg-slate-800/60 hover:bg-slate-700/60 text-slate-400 hover:text-slate-200 border border-slate-700/40 hover:border-slate-600/60 rounded-sm text-xs font-mono transition-all"
                       >
                       <span className="font-bold text-xs tracking-wider">{tree.paths[path].name}</span>
                       <span className="text-xs opacity-60 text-center px-1 leading-tight">{tree.paths[path].description}</span>
                       </button>
                         ))}
                       </div>

                     )}

                     {/* Tier progress - shown once path is chosen */}
                     {chosenPath && (

                       <div className="space-y-1.5">
                       {/* Tier pip track */}
                       <div className="flex gap-1 items-center">
                       {[1, 2, 3].map(t => (
                       <div
                       key={t}
                       className={`h-1.5 flex-1 rounded-full transition-all ${ t <= tier ? t === 3 ? 'bg-amber-400' : 'bg-cyan-500' : 'bg-slate-700' }`}
                       />
                       ))}
                       <span className="text-xs font-mono text-slate-600 ml-1">
                       {tier === 3 ? 'MAX' : `T${tier}/3`}
                       </span>
                       </div>

                     {/* Current tier label */}
                     {tier >= 1 && (

                       <div className="text-xs font-mono text-slate-400">
                       ▸ {tree.paths[chosenPath].tiers[tier - 1].augmentLabel}
                       </div>
                       )}

                     {/* Next tier preview */}
                     {tier < 3 && (() => {
                     const next = tree.paths[chosenPath].tiers[tier];
                     const statParts = [
                     next.attackBonus > 0 && `+${next.attackBonus} ATK`,
                     next.defenseBonus > 0 && `+${next.defenseBonus} DEF`,
                     next.hpBonus > 0 && `+${next.hpBonus} HP`,
                     ].filter(Boolean).join(' · ');
                     const isCapstone = tier + 1 === 3;
                     return (

                       <div className={`p-1.5 rounded-sm border space-y-0.5 ${isCapstone ? 'border-amber-800/40 bg-amber-950/20' : 'border-slate-700/40 bg-slate-900/40'}`}>
                       <div className={`text-xs font-mono tracking-wider ${isCapstone ? 'text-amber-400/80' : 'text-slate-500'}`}>
                       {isCapstone ? '★ CAPSTONE' : `T${tier + 1} PREVIEW`}
                       </div>
                       <div className="text-xs font-mono text-slate-400">{next.augmentLabel}</div>
                       {next.combatAction && (
                       <div className="text-xs font-mono text-cyan-400/70">
                       ACTION: {next.combatAction.name.toUpperCase()}
                       {next.combatAction.damage ? ` · ${next.combatAction.damage} DMG` : ''}
                       {next.combatAction.defenseBoost ? ` · +${next.combatAction.defenseBoost} DEF` : ''}
                       </div>
                       )}
                       {statParts && <div className="text-xs font-mono text-emerald-400/60">{statParts}</div>}
                       </div>
                       );
                       })()}

                     {/* Upgrade button */}
                     {tier < 3 && (
                     <button
                     onClick={() => upgradeTier(slot)}
                     disabled={availablePoints < 1}
                     className={`w-full h-8 text-xs font-mono tracking-wider border rounded-sm transition-all ${ availablePoints >= 1 ? 'bg-amber-900/40 hover:bg-amber-800/40 text-amber-300 border-amber-700/50 hover:border-amber-600' : 'bg-slate-900/40 text-slate-700 border-slate-800 cursor-not-allowed' }`}

>
                     {availablePoints >= 1 ? `UPGRADE → T${tier + 1}` : 'NO POINTS'}
                     </button>

                     )}

                       </div>

                     )}

                       </div>

                     );
                     })}

                     </div>

                       </div>

                     )}

                     {/* Action buttons */}

                     <div className="space-y-3 pt-2">
                       <Button 
                         onClick={startCombat} 
                         className="w-full bg-slate-800/80 hover:bg-slate-700/80 text-slate-300 hover:text-slate-100 py-5 font-mono tracking-wider border border-slate-600/50 hover:border-slate-500/50 transition-all"


>
                                          ENGAGE TARGET
                     
                       </Button>
                     </div>

                     <Inventory />

                     {classLocked && (

                       <div className="text-center pt-2">
                       <Button 
                       onClick={resetAll} 
                       className="text-xs bg-transparent hover:bg-red-950/30 text-red-400/60 hover:text-red-400 border border-red-900/30 hover:border-red-700/50 transition-all"
                       size="sm"
                       >
                       RESET SYSTEM
                       </Button>
                       </div>
                       )}

                       </div>

                     </div>

                     );

                     }

                     // ── SHOP PHASE ────────────────────────────────────────────────────────────────
                     if (phase === 'shop') {
                     const MANUFACTURER_LABELS: Record<string, string> = {
                     volkov: 'VOLKOV', tianxia: 'TIANXIA', cbn: 'CBN', ioa: 'IOA'
                     };
                     const MANUFACTURER_COLOURS: Record<string, string> = {
                     volkov: 'text-red-400', tianxia: 'text-cyan-400', cbn: 'text-green-400', ioa: 'text-orange-400'
                     };
                     return (

                       <div className="absolute inset-0 flex items-center justify-center bg-gradient-to-b from-gray-950 via-slate-950 to-black p-2 sm:p-4 overflow-y-auto">
                       <div className="absolute inset-0 pointer-events-none opacity-20" style={{
                       background: 'repeating-linear-gradient(180deg, transparent, transparent 8px, rgba(100,116,139,0.03) 8px, rgba(100,116,139,0.03) 10px)'
                       }} />
                       <div className="w-full max-w-lg mx-auto space-y-4 relative z-10 py-4">

                     {/* Header */}

                       <div className="text-center space-y-1">
                       <div className="text-xs font-mono text-amber-500/70 tracking-wider">COASTAL SETTLEMENT</div>
                       <h2 className="text-2xl font-light tracking-wide text-amber-400/90">ARMS MARKET</h2>
                       <div className="h-px w-24 mx-auto bg-gradient-to-r from-transparent via-amber-600/50 to-transparent" />
                       <div className="text-xs font-mono text-slate-500">CREDITS: <span className="text-amber-400">{gold}</span></div>
                       </div>

                     {/* Equipped weapon display */}

                       <div className="bg-slate-900/60 border border-slate-700/50 rounded-sm p-3">
                       <div className="text-xs font-mono text-slate-500 mb-2">EQUIPPED WEAPON</div>
                       {equippedWeapon ? (
                       <div className="flex items-center justify-between">
                       <div>
                       <div className={`text-sm font-mono font-bold ${MANUFACTURER_COLOURS[equippedWeapon.manufacturer]}`}>{equippedWeapon.name}</div>
                       <div className="text-xs text-slate-500 font-mono">
                       DMG {equippedWeapon.combatAction.damage} -- {equippedWeapon.combatAction.accuracy?.toUpperCase()} -- P.RATIO {((equippedWeapon.combatAction.physicalRatio ?? 0.7) * 100).toFixed(0)}%
                       {equippedWeapon.combatAction.bypassStructuralDefense && <span className="text-green-400/70"> -- BYPASS S-DEF</span>}
                       </div>
                       </div>
                       <Button onClick={() => equipWeapon(null)} className="text-xs font-mono bg-slate-800 border border-slate-600 hover:bg-slate-700 px-2 py-1 h-auto">
                       UNEQUIP
                       </Button>
                       </div>
                       ) : (
                       <div className="text-xs font-mono text-slate-600">-- NONE --</div>
                       )}
                       </div>

                     {/* Owned weapons */}
                     {ownedWeapons.length > 0 && (

                       <div className="bg-slate-900/60 border border-slate-700/50 rounded-sm p-3 space-y-2">
                       <div className="text-xs font-mono text-slate-500 mb-2">YOUR WEAPONS</div>
                       {ownedWeapons.map(w => {
                       const upgrade = getUpgrade(w.id);
                       const isEquipped = equippedWeapon?.id === w.id;
                       const canUpgrade = upgrade && !ownedWeapons.find(o => o.id === upgrade.id);
                       const upgradeAffordable = canUpgrade && gold >= (upgrade.upgradePrice ?? upgrade.price);
                       return (
                       <div key={w.id} className={`border rounded-sm p-2 space-y-1 ${isEquipped ? 'border-amber-600/50 bg-amber-950/20' : 'border-slate-700/40 bg-slate-900/40'}`}>
                       <div className="flex items-center justify-between">
                       <div className={`text-xs font-mono font-bold ${MANUFACTURER_COLOURS[w.manufacturer]}`}>{w.name}</div>
                       {isEquipped && <span className="text-xs font-mono text-amber-400/70">EQUIPPED</span>}
                       </div>
                       <div className="text-xs text-slate-500 font-mono">
                       DMG {w.combatAction.damage} -- {w.combatAction.accuracy?.toUpperCase()} -- HEAT +{w.combatAction.heatGenerated}
                       {w.combatAction.bypassStructuralDefense && <span className="text-green-400/70"> -- BYPASS S-DEF</span>}
                       </div>
                       <div className="flex gap-1">
                       {!isEquipped && (
                       <Button onClick={() => equipWeapon(w)} className="text-xs font-mono bg-slate-800 border border-slate-600 hover:bg-slate-700 px-2 py-1 h-auto flex-1">
                       EQUIP
                       </Button>
                       )}
                       {canUpgrade && (
                       <Button
                       onClick={() => { if (upgradeAffordable) upgradeWeapon(w.id, upgrade); }}
                       className={`text-xs font-mono px-2 py-1 h-auto flex-1 border ${upgradeAffordable ? 'bg-amber-900/40 border-amber-600/50 hover:bg-amber-800/40 text-amber-300' : 'bg-slate-900/40 border-slate-700/30 text-slate-600'}`}
                       >
                       UPGRADE {upgrade.upgradePrice ?? upgrade.price}c
                       </Button>
                       )}
                       <Button onClick={() => sellWeapon(w.id)} className="text-xs font-mono bg-slate-800 border border-slate-600 hover:bg-red-900/40 px-2 py-1 h-auto">
                       SELL {w.sellPrice}c
                       </Button>
                       </div>
                       </div>
                       );
                       })}
                       </div>
                       )}

                     {/* Available to buy */}

                       <div className="bg-slate-900/60 border border-slate-700/50 rounded-sm p-3 space-y-2">
                       <div className="text-xs font-mono text-slate-500 mb-2">AVAILABLE -- TIER 1 WEAPONS</div>
                       {TIER1_WEAPONS.map(w => {
                       const alreadyOwned = ownedWeapons.find(o => o.id === w.id || o.upgradeOfId === w.id);
                       const affordable = gold >= w.price;
                       if (alreadyOwned) return null;
                       return (
                       <div key={w.id} className="border border-slate-700/40 rounded-sm p-2 space-y-1">
                       <div className="flex items-center justify-between">
                       <div className={`text-xs font-mono font-bold ${MANUFACTURER_COLOURS[w.manufacturer]}`}>{w.name}</div>
                       <div className="text-xs font-mono text-slate-400">{w.price}c</div>
                       </div>
                       <div className="text-xs text-slate-500 font-mono">
                       {w.weaponType.toUpperCase()} -- DMG {w.combatAction.damage} -- {w.combatAction.accuracy?.toUpperCase()} -- HEAT +{w.combatAction.heatGenerated}
                       {w.combatAction.bypassStructuralDefense && <span className="text-green-400/70"> -- BYPASS S-DEF</span>}
                       </div>
                       <div className="text-xs text-slate-600 font-mono">{w.description.slice(0, 90)}...</div>
                       <Button
                       onClick={() => {
                       if (affordable) {
                       const ok = buyWeapon(w);
                       if (ok) setPendingEquipWeaponId(w.id);
                       }
                       }}
                       className={`w-full text-sm font-mono py-2 h-auto border ${affordable ? 'bg-slate-800 border-slate-600 hover:bg-slate-700 text-slate-300' : 'bg-slate-900/40 border-slate-800/30 text-slate-700'}`}
                       >
                       {affordable ? 'BUY' : 'INSUFFICIENT CREDITS'}
                       </Button>
                       {pendingEquipWeaponId === w.id && (
                       <div className="space-y-1 pt-1">
                       <div className="text-xs font-mono text-cyan-400/70 text-center">ASSIGN TO LOADOUT SLOT:</div>
                       <div className="grid grid-cols-4 gap-1">
                       {[0,1,2,3].map(slotIdx => (
                       <Button
                       key={slotIdx}
                       onClick={() => {
                       const bought = ownedWeapons.find(o => o.id === w.id);
                       if (bought) {
                       equipWeapon(bought);
                       setSlot(slotIdx, { ...bought.combatAction, key: `weapon_${bought.id}`, unlocked: true, source: 'weapon' as const });
                       }
                       setPendingEquipWeaponId(null);
                       }}
                       className="text-xs font-mono bg-cyan-900/40 border border-cyan-700/50 hover:bg-cyan-800/40 text-cyan-300 py-1 h-auto"
                       >
                       [{slotIdx+1}]
                       </Button>
                       ))}
                       </div>
                       <Button onClick={() => setPendingEquipWeaponId(null)} className="w-full text-xs font-mono bg-slate-800 border border-slate-700 text-slate-500 py-1 h-auto">
                       SKIP
                       </Button>
                       </div>
                       )}
                       </div>
                       );
                       })}
                       </div>

                     {/* Continue */}
                     <Button
                     onClick={() => leaveShop()}
                     className="w-full bg-slate-800/80 hover:bg-slate-700/80 text-slate-300 py-4 font-mono tracking-wider border border-slate-600/50"

>
                     LEAVE MARKET
                     </Button>

                       </div>
                       </div>
                       );
                       }

                     if (phase === 'victory') {
                     return (

                       <div className="absolute inset-0 flex items-center justify-center bg-gradient-to-b from-gray-950 via-slate-950 to-black p-2 sm:p-4">
                       <div className="absolute inset-0 pointer-events-none opacity-20" style={{
                       background: 'repeating-linear-gradient(180deg, transparent, transparent 8px, rgba(100,116,139,0.03) 8px, rgba(100,116,139,0.03) 10px)'
                       }} />
                       <div className="w-full max-w-lg mx-auto space-y-6 relative z-10">
                       {/* Victory header */}
                       <div className="text-center space-y-2">
                       <div className="text-xs font-mono text-emerald-500/70 tracking-wider">TARGET NEUTRALIZED</div>
                       <h2 className="text-2xl sm:text-4xl font-light tracking-wide text-emerald-400/90">
                       VICTORY
                       </h2>
                       <div className="h-px w-24 mx-auto bg-gradient-to-r from-transparent via-emerald-600/50 to-transparent" />
                       </div>

                     {currentLoot && <LootDisplay loot={currentLoot} />}

                     <div className="space-y-3">
                       <Button 
                         onClick={() => resetCombat()} 
                         className="w-full bg-slate-800/80 hover:bg-slate-700/80 text-slate-300 py-4 font-mono tracking-wider border border-slate-600/50 transition-all"


>
                                          RETURN TO BASE
                     
                       </Button>
                     </div>

                       </div>

                     </div>

                     );

                     }

                     if (phase === 'defeat') {
                     // Classes unlock only if player died on level 11+ for the first time
                     const classesAvailable = bossLevel >= 11 && (playerClass === 'none');

                     return (

                     <div className="absolute inset-0 flex items-center justify-center bg-gradient-to-b from-gray-950 via-slate-950 to-black p-2 sm:p-4 overflow-y-auto">
                       <div className="absolute inset-0 pointer-events-none opacity-30" style={{
                         background: 'repeating-linear-gradient(180deg, transparent, transparent 8px, rgba(100,116,139,0.03) 8px, rgba(100,116,139,0.03) 10px)'
                       }} />

                     {/* Red warning glow */}

                       <div className="absolute top-0 left-1/2 -translate-x-1/2 w-96 h-48 bg-red-900/10 blur-3xl rounded-full pointer-events-none" />

                       <div className="w-full max-w-lg mx-auto space-y-6 relative z-10 py-4">
                         {/* Defeat header */}
                         <div className="text-center space-y-2">
                           <div className="text-xs font-mono text-red-500/70 tracking-wider animate-pulse">CRITICAL SYSTEM FAILURE</div>
                           <h2 className="text-2xl sm:text-4xl font-light tracking-wide text-red-400/90">
                             TERMINATED
                           </h2>
                           <div className="h-px w-24 mx-auto bg-gradient-to-r from-transparent via-red-600/50 to-transparent" />
                         </div>

                     <div className="text-center space-y-1">
                       <p className="text-sm text-slate-400">
                         Neutralized by <span className="text-red-400">{boss.name}</span>
                       </p>
                       <p className="text-xs font-mono text-slate-600">
                         TERMINATION #{progression.deathCount + 1}
                       </p>
                     </div>

                     {classesAvailable ? (

                       <div className="space-y-4">
                       {/* Neural backup message */}
                       <div className="bg-slate-900/60 border border-slate-700/50 rounded-sm p-4 space-y-2">
                       <div className="flex items-center gap-2 text-xs font-mono text-amber-500/70">
                       <span className="w-1.5 h-1.5 bg-amber-500/60 rounded-full animate-pulse" />
                       <span>NEURAL BACKUP DETECTED</span>
                       </div>
                       <p className="text-sm text-slate-400">
                       Consciousness preserved. Select augmentation class for body reconstruction.
                       </p>
                       </div>

                     {/* Class Selection */}

                     <div className="grid grid-cols-1 gap-3">
                       {/* Melee Option */}
                       <div 
                         className={`cursor-pointer transition-all duration-300 p-4 rounded-sm border ${
                           playerClass === 'melee' 
                             ? 'border-amber-600/60 bg-amber-950/30' 
                             : 'border-slate-700/40 bg-slate-900/40 hover:border-slate-600/60 hover:bg-slate-800/40'
                         }`}
                         onClick={() => setPlayerClass('melee')}


>
                                          <div className="flex items-start gap-4">
                       <div className={`w-10 h-10 flex items-center justify-center rounded-sm ${playerClass === 'melee' ? 'bg-amber-900/50 text-amber-400' : 'bg-slate-800/50 text-slate-500'}`}>
                         <Sword className="w-5 h-5" />
                       </div>
                       <div className="flex-1 space-y-1">
                         <h3 className={`text-base font-medium ${playerClass === 'melee' ? 'text-amber-300' : 'text-slate-300'}`}>
                           {CLASS_DEFINITIONS.melee.name}
                         </h3>
                         <p className="text-xs text-slate-500">Salvaged combat augments. Close-range devastation.</p>
                         <div className="flex gap-3 text-xs font-mono pt-1">
                           <span className="text-slate-500">HP:<span className={playerClass === 'melee' ? 'text-amber-400' : 'text-slate-400'}> {CLASS_DEFINITIONS.melee.baseHp}</span></span>
                           <span className="text-slate-500">ATK:<span className={playerClass === 'melee' ? 'text-amber-400' : 'text-slate-400'}> {CLASS_DEFINITIONS.melee.baseAttack}</span></span>
                           <span className="text-slate-500">DEF:<span className={playerClass === 'melee' ? 'text-amber-400' : 'text-slate-400'}> {CLASS_DEFINITIONS.melee.baseDefense}</span></span>
                         </div>
                       </div>
                       {playerClass === 'melee' && (
                         <div className="w-2 h-2 bg-amber-500 rounded-full animate-pulse" />
                       )}
                     </div>
                     
                       </div>

                     {/* Ranged Option */}

                       <div 
                         className={`cursor-pointer transition-all duration-300 p-4 rounded-sm border ${
                           playerClass === 'ranged' 
                             ? 'border-cyan-600/60 bg-cyan-950/30' 
                             : 'border-slate-700/40 bg-slate-900/40 hover:border-slate-600/60 hover:bg-slate-800/40'
                         }`}
                         onClick={() => setPlayerClass('ranged')}
                       >
                         <div className="flex items-start gap-4">
                           <div className={`w-10 h-10 flex items-center justify-center rounded-sm text-lg font-mono ${playerClass === 'ranged' ? 'bg-cyan-900/50 text-cyan-400' : 'bg-slate-800/50 text-slate-500'}`}>
                             {">>"}
                           </div>
                           <div className="flex-1 space-y-1">
                             <h3 className={`text-base font-medium ${playerClass === 'ranged' ? 'text-cyan-300' : 'text-slate-300'}`}>
                               {CLASS_DEFINITIONS.ranged.name}
                             </h3>
                             <p className="text-xs text-slate-500">Repurposed targeting systems. Precision at distance.</p>
                             <div className="flex gap-3 text-xs font-mono pt-1">
                               <span className="text-slate-500">HP:<span className={playerClass === 'ranged' ? 'text-cyan-400' : 'text-slate-400'}> {CLASS_DEFINITIONS.ranged.baseHp}</span></span>
                               <span className="text-slate-500">ATK:<span className={playerClass === 'ranged' ? 'text-cyan-400' : 'text-slate-400'}> {CLASS_DEFINITIONS.ranged.baseAttack}</span></span>
                               <span className="text-slate-500">DEF:<span className={playerClass === 'ranged' ? 'text-cyan-400' : 'text-slate-400'}> {CLASS_DEFINITIONS.ranged.baseDefense}</span></span>
                             </div>
                           </div>
                           {playerClass === 'ranged' && (
                             <div className="w-2 h-2 bg-cyan-500 rounded-full animate-pulse" />
                           )}
                         </div>
                       </div>

                     </div>

                     <Button
                     onClick={() => {
                     if (playerClass === 'melee' || playerClass === 'ranged') {
                     rebirth(playerClass);
                     }
                     }}
                     disabled={playerClass !== 'melee' && playerClass !== 'ranged'}
                     className="w-full bg-slate-800/80 hover:bg-slate-700/80 text-slate-300 py-4 font-mono tracking-wider border border-slate-600/50 transition-all"

>
                     RECONSTRUCT
                     </Button>

                       </div>

                     ) : (

                       <div className="space-y-4">
                       {/* Subsequent deaths - quick rebirth */}
                       <div className="bg-slate-900/60 border border-slate-700/50 rounded-sm p-4 space-y-2">
                       <div className="flex items-center gap-2 text-xs font-mono text-cyan-500/70">
                       <span className="w-1.5 h-1.5 bg-cyan-500/60 rounded-full animate-pulse" />
                       <span>NEURAL BACKUP ACTIVE</span>
                       </div>
                       <p className="text-sm text-slate-400">
                       Restoring as <span className="text-slate-300">{classInfo?.name}</span>. Progression intact.
                       </p>
                       </div>

                     <Button
                     onClick={() => rebirth()}
                     className="w-full bg-slate-800/80 hover:bg-slate-700/80 text-slate-300 py-4 font-mono tracking-wider border border-slate-600/50 transition-all"

>
                     REBOOT
                     </Button>

                       </div>

                     )}

                       </div>

                     </div>

                     );

                     }

                     return (

                       <div className="fixed inset-0 flex flex-col pointer-events-none">
                       {/* Heat bar - left side, always visible during combat */}
                       <HeatBar />

                     {/* Top HUD Bar - Player HP | Level | Boss HP */}

                     <div className="pointer-events-auto bg-slate-950/95 px-2 py-1.5 flex items-center justify-between gap-2 border-b border-slate-800">
                       {/* Player HP */}
                       <div className="flex items-center gap-1.5 min-w-0 flex-1">
                         <span className={`text-xs font-mono ${playerMalfunctioning ? 'text-orange-400 animate-pulse' : 'text-cyan-400/80'}`}>
                           {playerMalfunctioning ? 'MLF' : 'SYS'}
                         </span>
                         <div className="flex-1 flex flex-col gap-0.5">
                           <div className="h-1.5 bg-slate-900 rounded-sm overflow-hidden border border-slate-700">
                             <div
                               className="h-full bg-gradient-to-r from-slate-500 to-slate-400 transition-all duration-300"
                               style={{ width: `${Math.max(0, (player.currentStructuralHp / player.maxStructuralHp) * 100)}%` }}
                             />
                           </div>
                           <div className="h-1.5 bg-slate-900 rounded-sm overflow-hidden border border-slate-700">
                             <div
                               className="h-full bg-gradient-to-r from-cyan-600 to-cyan-500 transition-all duration-300"
                               style={{ width: `${Math.max(0, (player.currentHp / player.maxHp) * 100)}%` }}
                             />
                           </div>
                         </div>
                         <span className="text-xs text-cyan-300/80 font-mono whitespace-nowrap">{player.currentHp}/{player.maxHp}</span>
                       </div>

                     {/* Level Badge + Arena Shape */}
                     <span className="text-xs font-mono text-slate-500 px-2 shrink-0 flex flex-col items-center">
                     <span>LV.<span className="text-slate-300">{bossLevel}</span></span>
                     {grid.arenaShape && grid.arenaShape !== 'open' && (
                     <span className="text-[9px] font-mono text-slate-600 tracking-wider">
                     {grid.arenaShape.toUpperCase().replace('_', '-')}
                     </span>
                     )}
                     </span>

                     {/* Boss HP - with charging warning */}

                       <div className="flex items-center gap-1.5 min-w-0 flex-1 flex-row-reverse">
                         {bossChargingHeavy ? (
                           <span className="text-red-400/90 text-xs font-mono animate-pulse">⚠</span>
                         ) : (
                           <span className={`text-xs font-mono ${bossMalfunctioning ? 'text-orange-400 animate-pulse' : 'text-red-400/80'}`}>
                             {bossMalfunctioning ? 'MLF' : 'TGT'}
                           </span>
                         )}
                         <div className="flex-1 flex flex-col gap-0.5">
                           {/* Structural HP */}
                           <div className="h-1.5 bg-slate-900 rounded-sm overflow-hidden border border-slate-700">
                             <div
                               className="h-full bg-gradient-to-r from-slate-600 to-slate-500 transition-all duration-300 float-right"
                               style={{ width: `${Math.max(0, (boss.currentStructuralHp / boss.maxStructuralHp) * 100)}%` }}
                             />
                           </div>
                           {/* Bio HP */}
                           <div className="h-1.5 bg-slate-900 rounded-sm overflow-hidden border border-slate-700">
                             <div
                               className={`h-full transition-all duration-300 float-right ${bossChargingHeavy ? 'bg-gradient-to-r from-red-700 to-red-400 animate-pulse' : 'bg-gradient-to-r from-red-600 to-red-500'}`}
                               style={{ width: `${Math.max(0, (boss.currentHp / boss.maxHp) * 100)}%` }}
                             />
                           </div>
                           {/* Boss heat bar */}
                           <div className="h-1 bg-slate-900 rounded-sm overflow-hidden border border-slate-800 mt-0.5">
                             <div
                               className={`h-full transition-all duration-300 float-right ${bossHeat >= 100 ? 'bg-red-500 animate-pulse' : bossHeat >= 70 ? 'bg-orange-500' : bossHeat >= 40 ? 'bg-amber-400' : 'bg-cyan-500'}`}
                               style={{ width: `${bossHeat}%` }}
                             />
                           </div>
                         </div>
                         <div className="flex flex-col items-end gap-0.5">
                           <span className="text-xs text-red-300/80 font-mono whitespace-nowrap">{boss.currentHp}/{boss.maxHp}</span>
                           <span className="text-xs text-slate-500 font-mono whitespace-nowrap">S-DEF {boss.structuralDefense}</span>
                           {bossHeat >= 100 && <span className="text-xs text-red-400 font-mono animate-pulse">LOCK</span>}
                         </div>
                       </div>

                     </div>

                     {/* Middle spacer - grid is rendered behind this */}

                     <div className="flex-1" />

                     {/* Combat Action Bar - driven by loadout slots */}
                     {phase === 'player_turn' && hasValidClass && (

                       <div className="pointer-events-auto bg-slate-950/95 border-t border-slate-800 px-2 pt-2 pb-4" style={{ paddingBottom: 'max(12px, env(safe-area-inset-bottom))' }}>

                     {/* 4 configurable slots - nothing is fixed */}

                     <div className="grid grid-cols-4 gap-1.5 mb-2">
                       {slots.map((slotAction, idx) => {
                         const isSelected = slotAction && selectedAction &&
                           (selectedAction as any).key === (slotAction as any).key;

                     if (!slotAction) {
                     // Empty slot during combat - not configurable mid-fight
                     return (

                       <div
                       key={`slot-${idx}`}
                       className="h-16 flex flex-col items-center justify-center gap-0.5 bg-slate-900/30 text-slate-800 border border-slate-800/40 font-mono"
                       >
                       <span className="text-xs tracking-wider">EMPTY</span>
                       </div>
                       );
                       }

                     const heat = slotAction.heatGenerated ?? 0;
                     const heatColour = heat > 0 ? "text-orange-400/60" : heat < 0 ? "text-cyan-400/60" : "text-slate-600";
                     const heatLabel = heat > 0 ? `+${heat}🌡` : heat < 0 ? `${heat}🌡` : null;
                     const tag = getMechanicTag(slotAction);
                     const expectedDmg = slotAction.damage
                     ? Math.max(1, slotAction.damage + player.physicalAttack - boss.physicalDefense)
                     : null;
                     const accuracyDot = slotAction.accuracy === 'precise' ? '🟢'
                     : slotAction.accuracy === 'unreliable' ? '🔴'
                     : slotAction.accuracy === 'variable' ? '🟡'
                     : null;

                     // Crit chance display - only on attack-type actions
                     const CRIT_PCT: Record<string, number> = { cool: 0, warm: 8, hot: 18, critical: 30 };
                     const heatPhase = playerHeat <= 40 ? 'cool' : playerHeat <= 70 ? 'warm' : playerHeat <= 90 ? 'hot' : 'critical';
                     const critPct = slotAction.type === 'attack' ? CRIT_PCT[heatPhase] : 0;

                     const borderClass = slotAction.type === "brace"
                     ? "border-cyan-800/40 bg-slate-800 hover:bg-slate-700"
                     : slotAction.type === "special"
                     ? "border-fuchsia-800/40 bg-fuchsia-950/40 hover:bg-fuchsia-900/40"
                     : "border-slate-700 bg-slate-800 hover:bg-slate-700";

                     const textClass = slotAction.type === "brace"
                     ? "text-cyan-300"
                     : slotAction.type === "special"
                     ? "text-fuchsia-300"
                     : "text-slate-300";

                     const selectedRing = isSelected
                     ? slotAction.type === "special" ? "ring-1 ring-fuchsia-400" : "ring-1 ring-cyan-500"
                     : "";

                     return (
                     <Button
                     key={`slot-${idx}`}
                     onClick={() => setSelectedAction(slotAction)}
                     className={`h-auto py-2 min-h-[3.75rem] flex flex-col items-center justify-center gap-1 border transition-all font-mono ${borderClass} ${textClass} ${selectedRing}`}

>
                       <span className="font-bold text-xs leading-tight text-center w-full truncate px-1">
                       {slotAction.name.toUpperCase().slice(0, 10)}
                       </span>
                       {tag && <span className="text-[10px] opacity-60 leading-tight tracking-wide">{tag}</span>}
                       <span className="text-[10px] opacity-50 leading-tight flex gap-1 items-center">
                       {expectedDmg !== null && <span>{accuracyDot} {expectedDmg} dmg</span>}
                       {critPct > 0 && <span className="text-orange-400/80">{critPct}%crit</span>}
                       {heatLabel && <span className={heatColour}>{heatLabel}</span>}
                       </span>
                       </Button>
                       );
                       })}

                     </div>

                     {/* Utility row - STIM and EXIT only, no loadout changes mid-fight */}

                     <div className="grid grid-cols-2 gap-1.5 mb-2">
                       <div className="relative">
                         <Button
                           onClick={() => setShowBag(true)}
                           disabled={consumables.length === 0}
                           className="h-10 w-full bg-slate-800 hover:bg-slate-700 disabled:bg-slate-900 text-slate-300 disabled:text-slate-600 border border-slate-700 disabled:border-slate-800 transition-all font-mono disabled:cursor-not-allowed"


>
                                            <span className="font-bold text-xs">STIM</span>
                     </Button>
                     {consumables.length > 0 && (
                       <span className="absolute -top-1 -right-1 bg-fuchsia-600 text-white text-xs font-bold w-4 h-4 rounded-full flex items-center justify-center border border-slate-800 pointer-events-none">
                         {consumables.length}
                       </span>
                     )}
                     
                       </div>

                     <Button
                     onClick={() => { if (confirm("Abort mission?")) resetCombat(); }}
                     className="h-10 w-full bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 transition-all font-mono"

>
                     <span className="font-bold text-xs">EXIT</span>
                     </Button>

                     </div>

                     {hasMoved && (
                     <Button
                     onClick={undoMove}
                     className="h-10 w-full bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 transition-all font-mono"

>
                     <span className="font-bold text-sm">UNDO MOVE</span>
                     </Button>
                     )}

                     {/* Double action indicator */}
                     {doubleActionReady && (

                       <div className="w-full text-center py-1 bg-cyan-900/30 border border-cyan-700/50 rounded-sm">
                       <span className="text-xs font-mono text-cyan-400 tracking-wider">DOUBLE ACTION READY -- attack twice this turn</span>
                       </div>
                       )}

                     {/* Overheat movement lock warning */}
                     {playerHeat >= 100 && (

                       <div className="w-full text-center py-1 bg-red-950/40 border border-red-800/50 rounded-sm animate-pulse">
                       <span className="text-xs font-mono text-red-400 tracking-wider">OVERHEATED -- movement locked</span>
                       </div>
                     )}

                     {/* MALFUNCTION warning - player accuracy degraded */}
                     {playerMalfunctioning && (

                       <div className="w-full text-center py-1.5 bg-orange-950/60 border border-orange-600/60 rounded-sm animate-pulse">
                       <span className="text-xs font-mono text-orange-400 tracking-wider font-bold">MALFUNCTION -- structural integrity lost -- use BRACE or STRUCTURAL PATCH</span>
                       </div>
                     )}

                     {/* Kizuna cold-start active */}
                     {kizunaJustFired && (

                       <div className="w-full text-center py-1 bg-cyan-950/50 border border-cyan-500/50 rounded-sm">
                       <span className="text-xs font-mono text-cyan-300 tracking-wider">KIZUNA ACTIVE -- precision lock engaged</span>
                       </div>
                     )}

                     {/* Overclock ready */}
                     {overclockActive && (

                       <div className="w-full text-center py-1 bg-yellow-950/50 border border-yellow-500/60 rounded-sm animate-pulse">
                       <span className="text-xs font-mono text-yellow-300 tracking-wider font-bold">OVERCLOCK -- next attack guaranteed critical</span>
                       </div>
                     )}

                     <Button
                     onClick={endTurn}
                     className={`w-full py-4 font-mono tracking-wider border transition-all ${selectedAction ? 'bg-cyan-900/40 hover:bg-cyan-800/40 text-cyan-300 border-cyan-700/50' : 'bg-slate-800/60 hover:bg-slate-700/60 text-slate-400 border-slate-700/50'}`}

>
                     <span className="font-bold text-sm tracking-wider">
                     {selectedAction ? "EXECUTE" : "PASS TURN"}

                       </span>

                     </Button>

                       </div>

                     )}

                     {/* Bag Modal */}
                     {showBag && (

                       <div
                       className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 pointer-events-auto"
                       onClick={() => setShowBag(false)}
                       >
                       <Card
                       className="w-full max-w-sm bg-slate-900 border-2 border-cyan-500/50 shadow-[0_0_20px_rgba(0,255,255,0.3)]"
                       onClick={(e) => e.stopPropagation()}
                       >
                       <CardContent className="p-4">
                       <div className="flex justify-between items-center mb-4">
                       <h2 className="font-black text-xl text-cyan-300 font-mono">[ STIMS ]</h2>
                       <Button
                       onClick={() => setShowBag(false)}
                       className="bg-red-700 hover:bg-red-600 text-white border-2 border-red-500 shadow-[0_0_10px_rgba(255,0,0,0.3)] hover:shadow-[0_0_15px_rgba(255,0,0,0.5)] transition-all px-4 py-2 font-black font-mono pointer-events-auto"
                       >
                       CLOSE
                       </Button>
                       </div>

                     {consumables.length === 0 ? (

                       <div className="p-6 text-center bg-slate-800 border border-slate-600 rounded">
                       <span className="text-4xl mb-2 block text-slate-500 font-mono">[ EMPTY ]</span>
                       <span className="text-sm font-bold text-slate-400 font-mono">No stims available</span>
                       </div>
                     ) : (
                       <div className="grid grid-cols-2 gap-2">
                       {consumables.map((item, index) => {
                         const effect = (item as any).consumableEffect;
                         // Per-stim disabled logic - only bio_stim is disabled at full HP
                         const isDisabled =
                           (effect === 'bio_stim' && isAtFullHP) ||
                           (effect === 'overclock' && overclockActive);
                         // Icons and colors per stim type
                         const stimIcon = effect === 'heat_flush' ? '🧊'
                           : effect === 'structural_patch' ? '🔩'
                           : effect === 'overclock' ? '⚡'
                           : effect === 'bio_stim' ? '💉'
                           : item.icon || '💊';
                         const stimLabel = effect === 'heat_flush' ? 'Heat Flush'
                           : effect === 'structural_patch' ? 'Structural Patch'
                           : effect === 'overclock' ? 'Overclock'
                           : effect === 'bio_stim' ? 'Bio-Stim'
                           : item.name;
                         const stimSub = effect === 'heat_flush' ? 'Heat -> 0'
                           : effect === 'structural_patch' ? `+${Math.floor((player?.maxStructuralHp || 40) * 0.60)} STR`
                           : effect === 'overclock' ? 'Guaranteed Crit'
                           : effect === 'bio_stim' ? `+${Math.floor((player?.maxHp || 60) * 0.60)} HP`
                           : item.hpBonus ? `+${item.hpBonus} HP` : '';
                         return (
                           <Button
                             key={`bag-${item.id}-${index}`}
                             onClick={() => {
                               useConsumableItem(item.id);
                               if (effect !== 'overclock' && consumables.length <= 1) setShowBag(false);
                               if (effect === 'overclock') setShowBag(false);
                             }}
                             disabled={isDisabled}
                             className={`flex flex-col items-center h-auto py-3 px-2 border rounded transition-all pointer-events-auto ${
                               isDisabled
                                 ? 'bg-slate-800 border-slate-700 opacity-40 cursor-not-allowed'
                                 : effect === 'overclock'
                                   ? 'bg-yellow-950/40 border-yellow-600/60 hover:bg-yellow-900/50 hover:border-yellow-400'
                                   : effect === 'heat_flush'
                                     ? 'bg-cyan-950/40 border-cyan-600/60 hover:bg-cyan-900/50 hover:border-cyan-400'
                                     : effect === 'structural_patch'
                                       ? 'bg-slate-700/60 border-slate-500/60 hover:bg-slate-600/60 hover:border-slate-400'
                                       : 'bg-fuchsia-950/30 border-fuchsia-700/50 hover:bg-fuchsia-900/40 hover:border-fuchsia-500'
                             }`}
                           >
                             <span className="text-2xl mb-1">{stimIcon}</span>
                             <span className="text-xs font-bold text-slate-200 text-center leading-tight font-mono">{stimLabel}</span>
                             <span className="text-xs text-emerald-400 mt-0.5 font-bold font-mono">{stimSub}</span>
                           </Button>
                         );
                       })}
                       </div>
                     )}
                       </CardContent>

                     </Card>

                       </div>

                     )}

                     {phase === 'enemy_turn' && (

                       <div className="pointer-events-auto bg-slate-950/95 border-t border-red-900/50 px-3 pt-3 text-center" style={{ paddingBottom: 'max(12px, env(safe-area-inset-bottom))' }}>
                       <p className="text-red-400/80 font-mono text-sm tracking-wider animate-pulse">HOSTILE ACTION IN PROGRESS...</p>
                       </div>
                       )}

                       </div>

                     );
                     }