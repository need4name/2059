// What the signal's memory and a host's firmware and implants add up to: the modifiers
// (`Perks`) the rules engine and a new host read. The memory network itself (what can be
// learned, what it costs) is engine/memory.ts; its data is content/memory.json.

// ── What owned nodes do ──────────────────────────────────────────────────────

export interface Perks {
  moveBonus: number;          // extra movement tiles
  reflexMove: boolean;        // move 1 tile after attacking if you haven't moved
  hazardMult: number;         // damage you take from hazards
  sidestep: boolean;          // first heavy aimed at you each fight misses
  phaseStep: boolean;         // move through enemies and obstacles
  extraCooling: number;       // extra heat shed each round
  startHeat: number;          // heat at the start of each fight
  hotTakenMult: number;       // scales the extra damage taken while hot (1 = normal)
  doubleActionHeat: number;   // act twice at or below this heat
  ventBonus: number;          // extra cooling on brace
  runaway: boolean;           // burnout at 100 heat costs no turn, critical crit chance 45%
  damageMult: number;         // all your damage
  mend: number;               // extra mending: a share of max health healed at the start of each turn, at full structure
  extraSlots: number;         // extra fight-bar slots
  flankMult: number;          // multiplies flank bonuses
  firstStrikePrecise: boolean;
  finisherBonus: number;      // extra damage vs enemies under 30% health
  chain: boolean;             // a takedown gives another action
  healthCostMult: number;     // implant health costs
  structureMult: number;      // structure bar
  startImplant: boolean;      // new hosts start with a common active implant
  startPoints: number;        // new hosts start with upgrade points
  pickOfTwo: boolean;         // choose 1 of 2 when a win drops an implant
  braceRepair: number;        // share of structure a brace repairs
  maxHpBonus: number;
  startBioStims: number;
  priceMult: number;          // Grey Lane prices
  holdfast: boolean;          // once per host, survive a killing blow on 1 health
  damageTakenMult: number;    // everything you take
  allyHpMult: number;
  allyXpMult: number;
  coordinated: boolean;       // +20% vs an enemy your ally hit this round
  allySlots: number;
  braceHeal: number;          // share of max health a brace heals (Matron's link)
  partingTakenMult: number;   // damage you take from parting blows (Ward's link)
  collisionMult: number;      // collision damage enemies take from your knockbacks (Breaker's link)
  noFlinch: boolean;          // the sleeper inside your host never flinches (Ninety's link)
  windproof: boolean;         // the wind never pushes you (Dust's link)
  // Firmware class (firmware.json identity)
  heatGenBonus: number;       // extra heat on every hit you make (Enforcer)
  ventMult: number;           // multiplies venting bursts (Enforcer)
  transferBonus: number;      // extra heat pushed into whoever you hit (Foreman)
  surgeKind: SurgeKind;       // what Overload does when it goes off
  splicePairs: number;        // how many passive slots can hold a spliced pair (Splice)
  spliceHeatCut: number;      // heat a turn taken off each spliced pair's cost (Splice)
  splicedNow: number;         // spliced pairs the host is wearing (set when the host is built)
  momentum: number;           // Overload added by each takedown
  hitAndFade: boolean;        // while warm (36-60), an attack lets you step a tile after
  redline: boolean;           // once a fight, starting a turn at 86+ heat gives a second action
  resonance: boolean;         // Firmware resonance: the loaded firmware's own rule grows stronger
  // What resonance (and the Wretch) turn on
  chainVent: number;          // a chained takedown also vents this much heat (Enforcer)
  reflexReach: number;        // reach of the step after attacking (Courier: 2 tiles)
  overheatSpread: number;     // an enemy that overheats pushes this much heat into everyone beside it (Foreman)
  strikeHot: boolean;         // Strike gains a hot effect: sets them alight (Unclassified)
  implantDamage: number;      // extra damage on implant moves (Wretch)
  implantTreeDiscount: number; // points off each active implant upgrade node (Wretch; never below 1)
  implantHeatCut: number;     // heat off implant moves (Wretch's Cool grafts)
  kinship: boolean;           // implant moves' mods count twice (Wretch's Kinship)
  activeStatMult: number;     // active implants' stat bonuses (Wretch's Abomination)
  // Passive implant parts (partPerks in augments.ts)
  specialHeatTakenMult: number; // heat you take from special hits (Baffle regulator)
  startOverload: number;      // Overload added at the start of each fight (Charged trait)
  partSpeed: number;          // speed from traits (Quick)
  // The memory network (content/memory.json)
  secondWind: number;         // the first time each fight you drop under a third, heal this share of max health
  mendRepairs: boolean;       // the memory's extra mending also repairs structure
  hotCrit: number;            // extra crit chance at 86+ heat
  burnoutMult: number;        // what overheating costs you
  firstStrikeBonus: number;   // extra damage on your first attack each fight
  flankSide: number;          // extra flank bonus from the side
  flankBack: number;          // ... and from behind
  critDamage: number;         // extra crit damage
  defendMult: number;         // every defensive move (guard, heals, repairs)
  defendCool: number;         // heat any defensive move also removes
  afterDefend: number;        // extra damage on the attack after a defensive move
  braceGuard: number;         // extra guard from Brace
  braceFree: boolean;         // Brace takes no move slot
  structureDamage: number;    // extra damage to structure
  exploit: number;            // extra damage to malfunctioning enemies
  seizeUp: boolean;           // an enemy whose structure you break loses its next turn
  feedback: number;           // heat added to an enemy whose structure you break
  failSafe: number;           // share of their strength your implants keep while your structure is broken
  steadyHands: number;        // lifts your weakest hits while malfunctioning
  reboot: number;             // once a fight, this share of structure comes back the turn after it breaks
  sealed: number;             // share of normal mending you keep with structure broken
  climbMult: number;          // what climbing out of the water costs
  allyGetUp: number;          // rounds sooner a knocked-out ally gets up
  coordinatedBonus: number;   // extra damage to an enemy your ally hit this round
  dropChance: number;         // extra chance a won fight drops an implant
  rarityUp: number;           // chance a dropped implant is one rarity higher
  stimChance: number;         // chance of a Bio-Stim after a won fight
  creditMult: number;         // credits from fights
  marketExtra: number;        // more items on sale at the Grey Lane
  secondChance: boolean;      // once a host, swap a dropped implant for another roll
  firmwareDamage: number;     // extra damage on every firmware's own move
  firmwareHeatCut: number;    // heat off every firmware's own move
  fwPointRate: number;        // firmware points come this much faster
  crossLoad: boolean;         // carry a second firmware's own move
  coldBlood: number;          // end a turn at 35 heat or less: heal this share of max health
  hotHands: number;           // extra damage at 61+ heat
  coverStep: number;          // guard for you and an ally you end your move beside
}
/** Each firmware's Overload ultimate; unclassified hosts get the plain Signal Surge. */
export type SurgeKind = 'blast' | 'piledriver' | 'overwatch' | 'blink' | 'overrun' | 'resonance';

export const NO_PERKS: Perks = {
  moveBonus: 0, reflexMove: false, hazardMult: 1, sidestep: false, phaseStep: false,
  extraCooling: 0, startHeat: 20, hotTakenMult: 1, doubleActionHeat: 0, ventBonus: 0, runaway: false,
  damageMult: 1, mend: 0, extraSlots: 0, flankMult: 1, firstStrikePrecise: false, finisherBonus: 0, chain: false,
  healthCostMult: 1, structureMult: 1, startImplant: false, startPoints: 0, pickOfTwo: false, braceRepair: 0.4,
  maxHpBonus: 0, startBioStims: 0, priceMult: 1, holdfast: false, damageTakenMult: 1,
  allyHpMult: 1, allyXpMult: 1, coordinated: false, allySlots: 1,
  braceHeal: 0, partingTakenMult: 1, collisionMult: 1, noFlinch: false, windproof: false,
  heatGenBonus: 0, ventMult: 1, transferBonus: 0, surgeKind: 'blast', splicePairs: 0, spliceHeatCut: 0, splicedNow: 0,
  momentum: 0, hitAndFade: false, redline: false, resonance: false,
  chainVent: 0, reflexReach: 0, overheatSpread: 0, strikeHot: false, implantDamage: 0,
  implantTreeDiscount: 0, implantHeatCut: 0, kinship: false, activeStatMult: 1,
  specialHeatTakenMult: 1, startOverload: 0, partSpeed: 0,
  secondWind: 0, mendRepairs: false, hotCrit: 0, burnoutMult: 1, firstStrikeBonus: 0, flankSide: 0, flankBack: 0, critDamage: 0,
  defendMult: 1, defendCool: 0, afterDefend: 0, braceGuard: 0, braceFree: false,
  structureDamage: 0, exploit: 0, seizeUp: false, feedback: 0, failSafe: 0, steadyHands: 0, reboot: 0, sealed: 0, climbMult: 1,
  allyGetUp: 0, coordinatedBonus: 0, dropChance: 0, rarityUp: 0, stimChance: 0, creditMult: 1, marketExtra: 0, secondChance: false,
  firmwareDamage: 0, firmwareHeatCut: 0, fwPointRate: 1, crossLoad: false, coldBlood: 0, hotHands: 0, coverStep: 0,
};
