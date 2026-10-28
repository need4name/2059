# 2059 design bible

The rules of the game as they are built today. Every number here comes from the code; the file that owns each rule is named so the two can be kept in step. When a rule changes, change it here in the same commit.

Story and setting live in the owner's universe notes, which stay out of this public repo. This file covers mechanics only. In-game text never explains the world: maker blurbs on implant cards are what's stamped on the part ("Cleared for passage."), enemy descriptions say what you see and how it fights, and the title, first hint and death screen don't explain what the signal is.

---

## 1. Fights

**Where:** `client/src/lib/engine/fight.ts` (rules), `client/src/lib/stores/useCombat.tsx` (timing), `client/src/lib/combat/grid.ts` (arenas).

### Turn order
1. **Start of your turn.** You and the enemy each lose 6 heat. If your heat is then 15 or less, you get a **double action** this turn.
2. **Move.** 1 tile (2 and 3 with the play-i Locomotion nodes, more with leg upgrades), 8 directions, around obstacles. Tap your start tile to undo. At 100 heat you can't move.
3. **Act.** One action from your bar of four, or a stim, or pass. Overclock is the only stim that doesn't end your turn.
4. **Hazard.** If you end on a hazard tile, you take its damage.
5. **Parting blows.** Every enemy you started the turn beside, and walked away from (no longer beside you), hits you once for a 12-damage close-quarters blow, scaled by threat. A stunned enemy, one winding up a heavy, or one your attack killed doesn't. Move tiles that would earn one show orange dots.
6. **Enemy turn.** Each enemy in turn fires a wound-up heavy, or **attacks from where it stands** with a move that reaches (a shield, heavy wind-up or ordinary attack), **then walks** up to 2 tiles (3 if Fast). With nothing in reach it only walks. It walks like a hunter: of the tiles it can reach it ends where its attacks cover its victim's tile and as many of the tiles the victim could step to as it can (avoiding hazards), or closes in the usual way when nothing covers the victim yet. Then it takes hazard damage if it's standing on one.

### Several enemies
- A level can throw 1–3 enemies at you (random for now; the story will set it later). The first level, every 5th level (elites, bosses) and the first-life Enforcer are always alone.
- Groups are scaled down: two enemies each have 60% health and 70% attack, three have 45% and 55%. Extra enemies are drawn from this level's type and the two before it.
- **Aiming:** picking an attack aims it at a tile automatically (the aim that hits the most enemies; the enemy you last looked at, then the nearest, win ties). Faint outlines show every tile it can be aimed at; the bright tiles are where it lands, and "Hit" shows over each enemy in them. Tap another outlined tile to aim there. **Every enemy on the bright tiles is hit**, each with its own damage roll; there's no target to pick first. Tapping an enemy outside the attack's reach just shows its details.
- **Arm moves have a side:** a left-arm implant's move only aims at tiles level with or left of you, a right-arm move level with or right of you (straight up and down work for both). Its button says "◀ left side" or "right side ▶".
- **Enemy turn:** each living enemy acts in turn and treats the others as obstacles. A guard soaks one hit, so a crowd can't all hit a braced player at full guard.
- The fight is won when the last enemy falls.

### Arenas
- **Every fight room has its own drawn arena** (`arena` in `map-indian-ocean.json`, built by `buildArena` in `grid.ts`), the same on every run so a place is a place. Text rows: `.` deck, `~` open water, `#` crates, `d` drums, `n` nets, `p` pumps, `?` a loose crate (there half the time, seeded per fight), `f` fuel fire, `c` live cable, `b` chemical bilge, `h` split decking, `P` your start, `E` enemy starts (the first is the lead; extra enemies start near the E tiles). Sizes run from 5 to 9 wide and 7 to 13 tall.
- **Location types** give rooms their feel: raft clusters (islands and 1-wide bridges over water), gantries (tall and narrow, long open lines), container yards and holds (mazes of cover), foundries and smelters (fire channels), hulls and pump rooms (wide, pillars), the chapel (symmetric, open centre), ambush pockets (the barge and archive: you start near enemies on two sides), and boss stages (the throne hall, the foundry floor, the ring of deck round the drowned spire's water).
- The content check rejects arenas with ragged rows, unknown characters, no or several P, no E, or an E the player can't walk to; every fight room must have one.
- Farm fights (no room) still roll an arena: portrait, 7x9 growing with movement and bodies up to 9x13, one of four outlines (open, corridor, L-shape, cross) with scattered cover and hazards.
- **Open water:** a body knocked into the sea takes collision damage (30% of the hit, at least 4) but doesn't drown. While it's in the water it can't be hit or targeted, makes no threat and draws no parting blow; on its next turn it climbs out onto the nearest open deck tile, and that's its whole turn. The player in the sea is left alone by enemies and spends their next turn climbing out.

### Attack shapes
Each shape has one job and one way to beat it (`client/src/lib/combat/patterns.ts`). Player moves use the same shapes.

| Shape | Hits | Beat it by |
| --- | --- | --- |
| Strike (`melee`) | the one adjacent tile you're on | not ending next to it |
| Reach (`melee_long`) | a straight line of 2 | leaving its row or column |
| Lunge | only the tile exactly 2 away, any of 8 directions | standing adjacent, or 3 away |
| Sweep (`sweep_arc`) | a 3-tile arc in front | getting behind or beside it |
| Cone | a wedge along a row or column: 1 tile, then 3 | getting to its side |
| Shot (`ranged`) | one tile 2–4 away on a row, column or diagonal, with no cover, void or body in between | breaking the line |
| Knockback | a straight line of up to 3; the one hit is pushed 1 tile straight back if there's room | keeping your back off hazards |
| Charge | a lane of 3 toward the target; the attacker dashes down it, stopping short of anything in the way | leaving the lane |
| X-burst (`diagonal_cross`) | all four diagonals, 2 deep | standing square to it |
| Ring | every tile exactly 2 away | hugging it or backing off |
| Beam | the whole row or column toward the target, to the edge | changing row or column |
| Blast (`aoe`) | a 3×3 square centred on a tile up to 3 away | leaving the square |

### Enemy behaviour
- **Heavy attacks lock their tiles.** The enemy winds up where it stands, aimed at where its target stands; the orange tiles are exactly the tiles that fire next turn. Anyone on them then is hit (allies included), anyone off them is safe, wherever they are. If the shape can't reach its target from there, the heavy isn't wound up. Enemies only use heavies when your heat is **45 or more**.
- **Collisions:** a knockback whose next tile is solid (cover, the arena edge, another body) doesn't move its target; instead the target slams into it for 30% of the hit again (at least 4) and is **stunned**. A body it slams into takes the same damage.
- **Stunned:** loses its next turn (an enemy also loses any heavy it was winding up; a stunned ally sits out the round).
- **Burning:** ending a turn on a fuel fire sets you (or an enemy) burning for 2 turns: 4% of max health each turn (at least 3), at the start of that unit's turn. A flame and circling stars show over units that are burning or stunned.
- **Overload:** a meter (0–100) that fills as blows are traded: 25 × (damage you deal ÷ the target's max health) per hit, and 50 × (damage you take ÷ your max health). When full and an enemy is within 2 tiles, **Signal Surge** replaces the meter: every enemy within 2 tiles takes 1.5× the strongest move on your fight bar (precise), your heat vents to 0, and it uses your turn. The meter empties at the start of each fight.
- **Speed and turn order** (`SPEED`, `DRIVE`, `roundOrder` in fight.ts): every round, everyone is sorted by speed, fastest first; the player wins ties, then enemies in their order. Allies act in the player's turn.
  - Speed = 10 + the average drive of the body's implants: Volkov +3; IOA and Kizuna +2; Tianxia, CBN and Crown +1; Patchwork 0; PARSU −1; Helix −2. No implants means 0. Enemies use the implants they carry, and Fast adds +1. At 85 heat or more, −2.
  - **Slowed** (−4) and **Hasted** (+4) last 2 rounds: the order is set first, then they count down. They come from the Sap mod (slows everyone you hit; Kizuna, PARSU, Patchwork) and the Rush mod (hastes you when you hit; Volkov, IOA, Patchwork), and from the Cadre's Storm Liturgy, the Warden's Shock Baton and the Listener's Static Cross, which slow you. Stun still costs a whole turn.
  - The order is worked out again each round, so it changes as heat, Slowed and Hasted change. An enemy that acts after you one round and first the next gets two turns before your next one; the HUD warns ("acts twice before your next turn") and the strip marks it ×2.
  - If anything is faster than you at the start of a fight, it moves first ("They are faster than you"). Your opening turn skips the round-start cooling, as before.
  - The turn strip (top right of the board) shows this round's order (who has acted is faded, whoever is acting is lit, allies sit beside you) and then the first three of next round. Status shows your speed; implant cards show each maker's speed push.
- **Enemy side effects** (`effects` on a move in `enemies.json`: knock, pull, bleed, stun chance): the Boarder's Crane Hook and the Enforcer's Collector's Hook are grapples that drag you to them; the Cadre's Rib-Graft Ram, the Volkov Operator's Hydraulic Drive and the Fitter's Piston Drive knock you back (into cover, hazards or the sea); the Ghost-MIL's Signal Bleed is a long shot across the board that makes you bleed, and the Raider's Catheter Blade bleeds too; the Surgeon's Sedative Dart is a bolt with a 25% stun, Tianxia's Neural Disrupt 20%, the Unregistered Operator's Vestibular Strike 30%; IOA's Transit Denial and the Listener's Carrier Wave pierce; the Listener's Undertow drags everyone it hits toward it. Bleeding on you works like an enemy's: 5% of max health (at least 3) at the start of your next 2 turns. Being dragged stops at bodies, cover and water.
- **Purple-edged red tiles** are where an enemy's hit also drags or shoves you.
- **Signature heavies:** Scavenger charge, Boarder cone, Cadre blast, Ghost-MIL X-burst, Raider ring, Surgeon strike (a grab), IOA knockback, Tianxia beam, Warden knockback, Volkov charge, Enforcer ring, Unregistered beam.
- **The red zone is a promise:** it shows every tile each enemy's normal attacks (and its close-quarters strike) can hit from where it stands. Because enemies attack before they move, ending your turn outside the red means no normal attack can reach you this enemy turn (other enemies don't count as cover here, since they may move first). Heavies show only as their locked orange tiles.
- **Grades:** enemies show how upgraded they are: Raw (threat 1–4), Grafted (5–9), Augmented (10–19), Chromed (20–29), Ascended (30+). The target card shows the grade and how many implants they carry (1 up to threat 5, 2 up to 10, then 3); in a fight the HUD names the implants, and each glows on the sprite in the grade's colour.
- **Implant traits:** each implant an enemy carries gives a trait by body slot (`ENEMY_TRAITS` in `actions.ts`): eyes **Sighted** (gains an optic shot at 80% of its usual hit if it has no gun), legs **Fast** (+1 movement), arms **Armed** (+10% damage), lungs **Enduring** (heals 2% of max health at the start of its turn), brain **Focused** (heavies from 30 heat instead of 45), ears **Alert** (no flanking bonus against it), nose **Filtered** (hazards don't hurt it), spine **Braced** (takes 10% less damage). The fight HUD names the target's traits.
- **Salvage:** implant drops come from the body slots the beaten enemies carried first (at the fight's rarity), then any slot.
- **Lines:** at the start of a fight the lead enemy says one line of horror at the walking corpse (`lines` in `enemies.json`; `lateLines` join once 5 or more hosts are lost). The first time any host meets a kind of enemy, the signal notes its impression (`firstSight`) in the journal (`client/src/lib/stores/useJournal.tsx`), shown on the Status tab. Lines are flavour and use `Math.random`, so they don't change seeded runs.
- **Shields** come out only when the enemy is under half health, and then 35% of the time.
- Charges and lunges need a gap of 2 or more.
- An enemy right next to you with nothing that reaches falls back to a 12-damage close-quarters strike.

---

## 2. Damage

**Where:** `calculateDamage` and `estimateDamage` in `client/src/lib/combat/actions.ts`.

Every hit has two parts: **bio** (to health) and **structural** (to the implant bar). `physicalRatio` splits a move's damage between them (default 70% bio).

```
bio base        = move damage × physicalRatio       + attack stat × weight
structural base = move damage × (1 − physicalRatio) + disrupt stat × weight
after defence   = base × 40 ÷ (40 + defence)          (bio at least 2)
× flank bonus × heat multiplier × crit (×1.75) × range band
× accuracy roll                                        (bio at least 3)
```

- **Stat weight:** the player's attack and disrupt stats count at **60%**; enemy stats count in full.
- **Defence:** 40 defence halves damage. Brace adds its guard to bio defence for the next enemy hit.
- **CBN grafts** (`bypass_sdef`) make your structural damage ignore the enemy's shielding.
- **No implants:** you have no structure bar, so half of any structural damage you take lands on your health instead.

### Accuracy (share of the rolled damage that lands)

| Tier | Range | Notes |
| --- | --- | --- |
| Precise | 100% | Implant moves that are precise cost 3 extra heat |
| Variable | 70–95% | The default |
| Unreliable | 50–100% | Can match a precise hit on a good roll |
| Malfunction | 25–60% | Replaces your accuracy while your structure bar is at zero |

Enemy evasion lowers the bottom of the range by 1.5% per point (up to 30%), except for precise hits.

### Worked example
Strike (10 damage, 70% bio, variable) from a player with 12 attack and 5 disrupt, at warm heat, against an enemy with 6 armour and 4 shielding, face on:

- Bio: 7 + 12 × 0.6 = 14.2 → 14; × 40/46 = 12; × 1.1 warm = 13; rolled 70–95% → **9 to 12**
- Structural: 3 + 5 × 0.6 = 6; × 40/44 = 5; × 1.1 = 5; rolled → **3 to 4**

---

## 3. Heat

**Where:** `getHeatPhase` and `getHeatMultipliers` in `client/src/lib/combat/types.ts`.

| Heat | Band | Your damage | Damage you take | Crit chance |
| --- | --- | --- | --- | --- |
| 0–40 | Cool | ×1.00 | ×1.00 | 0% |
| 41–70 | Warm | ×1.10 | ×1.10 | 8% |
| 71–90 | Hot | ×1.25 | ×1.25 | 18% |
| 91–100 | Critical | ×1.50 | ×1.75 | 30% |

- Actions add their own heat (Strike +11; brace −25; Helix braces −15 to −18). Standing next to the enemy when you attack adds +2.
- Some moves push heat onto the target (`heatTransfer`); some enemy attacks heat you up or cool you down.
- At **15 or less** you act twice. At **45 or more** enemies start using heavies. At **100** you can't move until you cool.

---

## 4. Implants

**Where:** `client/src/lib/combat/augments.ts`, data in `client/src/content/items.json`.

- **10 slots.** Active: left arm, right arm, left leg, right leg, eyes. Passive: brain, ears, nose, lungs, spine.
- **Active implants** each give one combat move, built from the slot (arm, leg or eyes), the maker and the rarity. Damage scales ×1.00 / 1.20 / 1.45 / 1.75 / 2.10 from common to legendary. Helix active implants give braces, never attacks.
- **Passive implants** give stats and always-on effects only.
- **Maker** is read from the `[MAKER]` prefix in the item's name.

### Power bands
Each implant's stats are scaled so its power score lands near its rarity's target: common 4, uncommon 8, rare 14, epic 22, legendary 34. Power = attack + defence + health ÷ 4 + structural attack + structural defence + 2 × evasion. Bands never overlap (tested).

### Condition
Worn 80%, degraded 60%, corroded 45% of the implant's stats. Condition never makes a stat negative. Degraded parts cost 2 max health, corroded parts 5.

### Structure bar
The sum over installed implants of **slot size × maker toughness × rarity × condition**, plus upgrade defence.

| Slot | Size | | Maker | Toughness |
| --- | --- | --- | --- | --- |
| Arms, legs | 12 | | Helix | 1.5 |
| Spine | 11 | | PARSU | 1.4 |
| Lungs | 6 | | Volkov | 1.35 |
| Eyes, brain | 4 | | Tianxia | 1.3 |
| Ears, nose | 3 | | Patchwork | 1.0 |
| | | | IOA, Crown | 0.9 |
| | | | CBN | 0.8 |
| | | | Kizuna | 0.6 |

Rarity multiplies structure by 1.00 / 1.15 / 1.30 / 1.50 / 1.75. Brace repairs 40% of the bar; a Structural Patch repairs 60%. At zero you **malfunction** (see accuracy).

### Health cost
CBN parts cost 5 max health, Volkov and IOA 3, scaled by rarity (×1.00 to ×1.75), plus any condition cost. Max health never drops below **30**.

### Implant parts
Active implants (arms, legs, eyes) are built from parts when they drop, like guns in Borderlands (`rollParts` in `augments.ts`, seeded): the **frame** is the maker (base damage, heat, accuracy, structure, health cost), the **head** is the attack's shape, and **mods** are side effects. Two drops with the same name can fight differently. Helix arms and legs are braces and have no parts. Implants saved before parts existed keep their old maker shape with no mods.

| Quality | Heads | Mods |
| --- | --- | --- |
| Common | basic heads only; **hits only the nearest enemy** in its shape | 0 |
| Uncommon | basic heads | 0 or 1 (half the time) |
| Rare | any non-signature head | 1 |
| Epic | any non-signature head | 2 |
| Legendary | half the time the maker's signature head, else any | 2 (signatures carry their own effects) |

- **Heads** (damage multiplier): arms jab ×1.0, drive (reach 2) ×0.95, lash (exactly 2) ×1.1 [basic]; hook (arc) ×0.85, cutter (X-burst) ×0.8, spread (cone) ×0.85, grapple (line of 3, pulls) ×0.8. Legs stomp ×1.0, kick (knockback line) ×0.9, lunge ×1.05 [basic]; charge ×1.0, sweep ×0.85, step-cut (jab, then step back) ×0.95. Eyes bolt ×1.0, scope (2–4 shot) ×1.05 [basic]; lance (pierce) ×0.9, mortar (lob) ×0.8.
- **Signatures** (legendary): Volkov Breach Line (charge lane, dash through, knockback), Tianxia Crowd Press (arc, pushes all back), Kizuna Monowire (pierce through cover), Crown Bedside Manner (jab, drain 50%, vents 10 heat), CBN Harvest (grapple, pull, drain 40%, bleed), IOA Override Pulse (lob, 60% stun), PARSU Ground Slam (burst, crush), Patchwork Scrapstorm (cone, bleed, knockback); any maker's legs Sprint Strike (charge, dash), any maker's eyes Long Shot.
- **Mods:** Knockback (push every enemy hit a tile), Crush (knockback collisions ×2), Bleed (5% of max health, at least 3, at the start of its next 2 turns), Stun 25%, Drain (heal 25% of damage dealt), Coolant (vent 8 heat), Ignores cover. Makers carry their own: Volkov knockback/crush, Tianxia knockback/coolant, Kizuna cover/coolant, Crown drain/coolant, CBN bleed/drain, IOA stun/cover, PARSU crush/knockback, Patchwork any.
- A head picks from its maker's usual heads 60% of the time (Volkov reach, jab, spread, charge, kick, scope, lance; Tianxia jab, hook, kick, stomp, bolt, scope; Kizuna cutter, lash, lunge, step-cut, scope, lance; Crown jab, reach, sweep, step-cut, scope, bolt; CBN lash, grapple, lunge, kick, bolt, lance; IOA spread, hook, charge, kick, mortar, bolt; PARSU jab, hook, stomp, kick, bolt, mortar).
- The move's name is the maker's word plus the head ("Graft Grapple", "Hydraulic Drive"); the card shows the head and mods, and every attack button shows a small footprint picture: you in cyan, where it can reach faint, where it lands bright.
- **New shapes:** bolt (line of 4, stops at the first body; water doesn't block, cover does), pierce (line of 4, through every body), long shot (any line to the edge, not within 2), grapple (line of 2–3, first body), lob (2–4 away over anything, hits the tile and the four beside it), burst (all 8 around you).
- **Dash** puts you on the farthest open tile of the lane; **step-cut** steps you a tile straight back from the enemy hit (onto open, non-hazard deck). Neither earns a parting blow.

### Upgrades
- Stored per implant (by id), so only installed implants can be upgraded and a part keeps its upgrades if you take it out.
- Picking path A or B is free; tiers 2 and 3 cost 1 point each.
- On an active implant, path A adds 18% damage and 2 heat per tier; path B adds 8% damage, runs 2 heat cooler per tier, and raises accuracy one step at tier 2.
- Points: 1 per level-up, plus 1 for each new threat cleared.
- Each tier also adds the stats listed for it in `augmentTrees.ts`. The upgrade screen works its text out from these real numbers (`components/game/upgradeText.ts`): a headline, the move's damage and heat before and after, and the stat totals. The paths' old flavour descriptions aren't shown.
- The implants screen is a body map: each slot is marked on a host figure with a card per slot down each side.

---

## 5. Progression and loot

**Where:** `client/src/lib/combat/loot.ts`, `client/src/lib/combat/skills.ts`, `client/src/lib/combat/actions.ts` (enemy scaling).

### Enemy scaling by threat
- Base health: 36 + 17 × threat + 0.85 × threat². Attack +4.4 and defence +2.4 per threat on top of each enemy's base. Move damage +19% per threat.
- On top of that, every enemy's health is × 0.39 × 1.06^(threat − 1) and its attack × 1.34 × 1.047^(threat − 1) (`ENEMY_TUNING`, `ENEMY_GROWTH`). Fights stay short early, and the compounding growth means each host meets a wall it can't push through yet.
- **Levels come in sectors of 10.** The 5th level of each sector is an **elite** (×1.3 health, ×0.95 attack; Cartel Enforcer, CBN Extraction Surgeon, Unregistered Operator in turn). The 10th is a **boss** (×1.75 health, ×1.05 attack): **The Fitter** at threat 20 (the Volkov foundry: Armed, a whole-row Press Line heavy, and at half health it bolts on a leg and becomes Fast) and **The Listener** at 30 (the drowned spire: Sighted, Focused and Alert, an Undertow ring heavy, and at half health it becomes Enduring). Bosses carry innate traits on top of their implants and turn once below half health (`traits` and `enrage` in `enemies.json`). Regular rooms name their enemy on the map (`enemy` in the map file), so each place has its own people; anything not named walks the regular rotation.
- Threat 10 is the **Patchwork King**, built from a level-10 frame with his own ×1.7 health, ×1.45 attack, ×1.25 defence and three scripted phases.
- Enemies carry 1–3 random common or uncommon implants.
- **First life only:** threat 3 is the **Cartel Enforcer** (×2.6 health, ×2.7 attack). It waits on the walkway and is meant to end the first run.
- Simulator targets: about 7 turns for a regular fight, about 14 for a boss. Median best level is about 9 after 5 hosts lost and 18–20 after 10.

### Drops: strip them for parts
- **Implants only come off bodies.** Every enemy carries real implants (`carried`, rolled by `rollCarried` in `loot.ts` when it's created): 1 up to threat 5, 2 up to 10, then 3, one per body slot, each built from parts (see Implant parts). It's worn gear, so it rolls at the drop odds of **six threats lower** (`CARRIED_QUALITY_LAG`): at threat 1–2 odds that's commons and a few uncommons; rares appear from threat 3 odds, epics from 5, legendaries from 6, and commons stop around 20. Half are used gear: 35% worn, 15% degraded.
- Their stats count for less on an enemy as quality rises (common and uncommon ×1, rare ×0.6, epic ×0.4, legendary ×0.25), so a lucky epic doesn't make an early enemy unkillable. The traits they give still come from the body slot.
- **Signature implants:** each boss and elite carries one (`signature` in `enemies.json`, the item in `items.json` with `signature` and its own `heads`): Cartel Enforcer *Collector's Hook*, CBN Surgeon *Surgeon's Hands*, Unregistered Operator *Unlogged Legs*, the Fitter *Fitter's Crane Arm*, the Listener *Listener's Array*, the Patchwork King *Patchwork Crown*. The name and slot are fixed; quality rolls every time (bosses epic, or legendary 15% + 1% per threat up to 50%; the King's crown legendary 35%; elites uncommon or better, rare or better from threat 15) and so do the head (from its own list, its signature head only at legendary) and mods. Signature implants never appear in shops or random rolls.
- **After a win you strip the bodies:** the win screen opens with a highlighted card listing every beaten enemy's implants by body; you tap one to keep it (two with Pick of the wreck). "Back to the hideout" stays locked until you pick; a small "Choose for me" link keeps the rarest. The rest are scrapped for a quarter of their sell price (at least 2 credits each).
- First life: the first enemy carries a common arm (an active move) and the second an uncommon passive, so both kinds are met early.
- Stims from threat 2: 15% chance rising to 25%. Bosses always drop one.
- Credits: 10 + 8 × threat, plus up to the same again at random. The King pays 160–220 and a stim.

### XP
Level n needs 100 × 1.5^(n−1) XP. Threats 1–5 give 120 / 150 / 210 / 230 / 250 XP, then +20 per threat.

---

## 6. Economy

**Where:** `client/src/lib/combat/economy.ts`, `client/src/lib/stores/useMarket.tsx`.

- Buy prices: common 45, uncommon 95, rare 190, epic 360, legendary 640 credits, scaled by condition (worn ×0.75, degraded ×0.5, corroded ×0.3).
- Selling returns 40% of the buy price (at least 5).
- The Grey Lane stocks 7 implants and 3 stims, rerolled after every fight. Overclock appears from threat 5. From threat 12 there is a 25% chance (rising 3% a threat, up to 60%) of one legendary.
- Weapons: 12 base weapons (4 makers × pistol, revolver, shotgun) and their 12 upgrades. Pistols fire a **bolt** (stops at the first body), revolvers **pierce** (through everyone in the line), shotguns hit a **cone**, steadier and cooler than their listed heat. Tier-2 guns gain their maker's side effect: Volkov knockback, Tianxia vents 6 heat, CBN bleed, IOA 15% stun.

---

## 7. Death and the signal

**Where:** `rebirth` in `client/src/lib/stores/useCombat.tsx`.

- When the host dies, the signal jumps to a new body at threat 1. Implants, credits, weapons, loadout extras and upgrades are lost. The host count, the class unlock, the play-i tree and allies are kept.
- Dying at threat 11 or higher while unclassified permanently unlocks the Enforcer and Operative firmware.
- **The play-i tree** (`client/src/content/playi-tree.json`, `client/src/lib/engine/playi.ts`): what the signal keeps. 34 nodes in 6 branches, hidden from the player. After each death the player picks 1 of 2 random open nodes (a node is open when one of its required nodes is owned; tier 1 needs nothing; Network nodes need an unlocked ally). When fewer than two are open, a repeatable Signal fragment (+5 max health) fills the gap.
- Node effects reach the fight engine through `perks` on the fight state (cooling, double-action heat, brace repair and venting, damage, flanking, clean first strike, finisher, chain, hot-damage taken, damage taken, Holdfast, Sidestep, hazards), the new host (starting implant, Bio-Stims, upgrade points, max health, structure, health costs), movement (extra tiles, Reflex loop, Phase step, Runaway), the fight bar (Fifth slot), the market (Haggler) and loot (Pick of the wreck).
- Holdfast is once per host; Sidestep and Clean first strike reset every fight.

### Allies

**Where:** `client/src/content/allies.json` (roster), `client/src/lib/combat/allies.ts` (bodies, moves, levels), `client/src/lib/stores/useAllies.tsx` (unlocks, levels, party), the Allies part of `client/src/lib/engine/fight.ts`.

- Five allies, each met in a room of the map: **Bale** (Tianxia tank, the cranes), **Matron** (Crown healer, the hold), **Ghostline** (Kizuna spotter, the road), **Breaker** (Volkov damage, the foundry), **Ward** (Helix shield, the theatre path). Once the room is clear the panel offers "Link with …"; linking keeps them for every later host and they join now if there's room. Their stat level still comes from their old unlock level (10/15/20/25/30). Old saves (version 1) keep the allies they had unlocked.
- One ally per host (two with the Second link capstone), chosen on the death screen after the tree pick. The last host's ally is kept by default.
- Each ally has two fixed moves and moves 2 tiles. Effects: **attack** (needs range on your target), **taunt** (every enemy aims at the ally until your next turn, ally guards up), **heal** (a share of your max health, any range), **mark** (your hits on the target do more this round), **guard** (you guard up against the next hit). Support moves have cooldowns of 2–3 rounds.
- In your turn you can move the ally once (tap it, or its name, then a lit tile) and use one of its moves, before or after your own move. The turn ends when you execute.
- Enemies go for whoever is nearest, the player winning ties, unless an ally is drawing fire. A heavy wound up at an ally can be dodged by moving that ally.
- Allies have no structure bar: half the structural part of a hit spills onto their health. A knocked-out ally sits out the rest of that fight only. Allies don't take hazard damage. Every fight starts them at full health.
- Stats: built like a regular enemy of the unlock level (health × the ally's `hp`, attack and defence from its base plus the level scaling), then × 0.55 health and × 0.75 attack (`ALLY_TUNING`), plus their implants. Move damage scales like an enemy move of the unlock level.
- Levels: +8% health, attack, defence and move damage a level, up to 10. Each win gives the party 1 XP (2 with Shared memory); level n to n + 1 takes n + 1 XP. Levels survive death, so an early ally can be raised for the late game.
- Network perks: Handshake (+25% ally health), Shared memory (double ally XP), Coordinated (+20% damage on a foe your ally hit this round), Second link (two allies).
- **Implants on allies** (the Allies tile at the hideout, `screens/AlliesTab.tsx`): each met ally wears two implants, a **limb** (any active implant that deals damage) and one **other** (anything else). Giving one takes it out of the stash or off your body; whatever was in that slot goes back to the stash. Allies keep their implants when a host is lost, so they're the one place an implant survives death.
  - The limb replaces the ally's first attack: its name, shape and accuracy, with damage scaled like the ally's own moves (so a common is weaker than the built-in attack and a rare or better is stronger). Side effects from mods don't carry over.
  - Both implants add their stats (attack, defence, health and the structural ones) to the ally.
  - **Affinity** (`affinity` in allies.json): Bale Tianxia and PARSU, Matron Crown, Ghostline Kizuna and IOA, Ward Helix, Breaker Volkov and CBN. An affinity implant's stats count × 1.5 and a limb hits × 1.25 (`AFFINITY`).
- **Links**: every ally riding with the host gives you something, whatever it wears (`link` in allies.json, effect in `ALLY_LINKS`): Bale +10% structure bar, Matron every brace heals 5% of your health, Ghostline your first attack each fight lands in full, Ward parting blows do half damage, Breaker enemies you knock into things take +50% collision damage. The content check fails an ally without a link.
- Save version 3 added ally gear (empty for older saves).

---

## 7b. The hidden map

**Where:** `client/src/content/map-indian-ocean.json` (rooms), `client/src/lib/engine/map.ts` (rules), `client/src/lib/stores/useMap.tsx`, `screens/RoomPanel.tsx`.

- Chapter one is a web of 37 rooms the player never sees as a map. The hideout screen leads with a Next step card (install new salvage, pick a free upgrade path, spend points, fill the fight bar, then fight or explore), then the room you're in (about two sentences), what's there and its exits as buttons, each with a hint ("East: the smell of fuel"), then four Get ready tiles (fight bar, implants, upgrades, status) that each open a full page. Exits you've been through before say "familiar".
- **Threat comes from the room.** Fight rooms hold one threat level, rising with depth from the body dock (1) to the drowned spire (30). Elites sit on 5, 15 and 25, bosses on 10 (the Patchwork King), 20 and 30. The fight footer button starts the room's fight.
- **Enemies hold the room:** while a room's fight is uncleared, every exit but the one you came in by is blocked. Win and the room stays clear for that host.
- **Markets** are in three safe rooms (the body dock, the Grey Lane stall, the canopy stall). The Grey Lane is only reachable from those rooms.
- **Things to look at:** 21 rooms have something to look closer at once they're clear; what you see goes into the journal.
- **Caches:** five rooms (pumps, generator, containers, smelt, drift) hide a cache that can be searched once per host once the room is clear: half the time a stim (never Overclock), otherwise 20–50 credits + 2 × threat. Seeded from the run seed and the room.
- **Upgrade points come from new depths:** a win gives a point only when it is deeper than any fight this host has already won (`hostBestThreat`), so walking back over cleared ground can't farm points.
- **Hidden goals:** three (the slab, the manifest, the Mother: placeholders until the story is written), each found by looking at something in a particular room. They're never listed. When all three are found, the sealed way from the wake down to the drowned spire opens.
- **Chapter ending:** winning the end room (`end` in the map file, the drowned spire) finishes the chapter. The victory screen shows the ending text, hosts used, places seen, things looked at and allies linked, and what the signal keeps. From then on the spire reads its `quiet` text and holds no fight for any host; the rest of the map keeps refilling, so the run can go on.
- **Death:** a new host is another corpse reanimating at the body dock. Fights and caches refill; visited rooms, things looked at, allies met and goals are kept.
- The content check rejects exits to missing rooms, unreachable rooms, a goal in more or fewer than one room, and fights in market rooms. It also rejects an ally waiting in more or fewer than one room, and a named enemy that doesn't exist or sits outside a regular room. The balance simulator walks the map like a player: it takes the shortest way through cleared rooms to the easiest uncleared fight, looks at things, links allies and searches caches on the way.

### Tides

**Where:** the Tides part of `client/src/lib/engine/fight.ts` (`TIDE`, `startTide`, `tideTick`).

- Drawn arenas can mark mud flats with `m`. A board with mud has a tide; one without has none.
- Fights start at low tide. At the start of every round the tide counts down, and every 3 rounds (`TIDE.every`) it turns. When it comes in, the mud becomes open sea: anyone standing on it is in the water, with no damage, can't be hit, and spends their next turn climbing out onto the nearest dry ground (enemies also lose a wound-up heavy). When it goes out, the mud is ground again.
- The HUD shows the tide and when it turns ("Tide comes in next round · get off the mud"), and mud about to go under glows blue. The board keeps its size while the mud is under water.

## 7c. Chapters

**Where:** `client/src/content/chapters.json` (order, map, cast, tileset, ready), `client/src/lib/combat/chapters.ts`, `MAPS` in `client/src/lib/engine/map.ts`.

- Chapters are played in the order of `chapters.json`. Each names its map (`content/map-<map>.json`, registered in `MAPS`), its **cast** and its tileset. The map store records which chapter the signal is in (`chapter`); everything that depends on the place reads `activeChapter()`.
- **Cast:** regular enemies walk the `rotation` across the regular threat levels; `elites` guard threat 5, 15 and 25 in turn; `bosses` hold 20 and 30 (and every 10 after, in turn); `firstFight` is the first host's set piece on threat 3; `setPiece` is the chapter's built fight on 10 (chapter one: the Patchwork King). Enemies start at their own `startingHeat` (bosses used to start at 50 whatever their data said).
- **Moving on:** once a chapter's end fight is won, and only if the next chapter is marked `ready`, the victory screen offers "Go on" (or "Stay here a while"; the hideout's Next step card then offers it). Going on wakes a new host at the next chapter's entry with a fresh map: implants, credits, weapons, loadout and upgrades stay behind as on a death, while allies, their implants, the play-i tree and the journal carry on. It counts as a new host but offers no play-i card. A chapter can't be returned to.
- Each threat level means the same strength in every chapter; a chapter feels different through its cast, board rule and map, and the signal arrives stronger through its tree and allies.

## 8. Runs, seeds and saves

- Save version 4 added the map's chapter (older saves are in chapter one).
- Every run has a seed. Each fight is seeded from the run seed and the fight number, and each market visit from the run seed and its visit key, so the same seed and choices replay exactly (`client/src/lib/engine/rng.ts`).
- One versioned save holds everything (`client/src/lib/save.ts`). Players can copy it as text and load it back in from the Status tab.

## 8b. Sound

**Where:** `client/src/lib/audio/sfx.ts`, `client/src/lib/stores/useAudio.tsx`.

- Every effect is synthesised in the browser (square and triangle blips, filtered noise), in keeping with the pixel art; there are no effect files. A slow sea wash plays under the music.
- The fight engine marks moments with sound-only events (`collide`, `burn`, `telegraph`, `surge`, plus `hit`, takedowns, an ally down, a chain action and the host lost). The combat store maps them to effects; moving, searching a cache and walking through a door have their own.
- Sound starts off, since browsers only allow audio after a tap; the sound button is that tap.

## 9. Checks that guard these rules

`npm run verify` runs before every deploy:
- **Typecheck.**
- **Content check** (`scripts/check-content.ts`): schemas, allowed values, ids, cross-references, the ally roster.
- **Tests** (`tests/`): the rules on this page, including rarity bands, structure, health floor, dodging heavies, heat damage, the play-i tree, allies and save round trips.
- **Balance simulator** (`scripts/sim.ts --check`): seeded bot runs. New players must die on enemy 2 or 3 in at least 85% of runs, win rates per threat band must stay within 65–99%, and the median best run must reach threat 9, regular fights must average 8 turns or fewer and bosses 16 or fewer, and the median best level must be 9–22 after 10 hosts lost (allies keep implants across hosts). Win rates are compared rounded, as printed. It runs 20 seeded runs of 250 fights; the bot aims with the game's own rules, prefers a tile outside the red it can still attack from, and avoids parting blows (both with its skill). Between fights it gives spare implants to allies riding along, best fit first. Turn order comes from the store, so the bot plays speed rounds like a player. The best-level median is noisy at 20 runs (one run spans roughly 17–26); `RUNS=60` gives a steadier read.
