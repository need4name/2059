# 2059 design bible

The rules of the game as they are built today. Every number here comes from the code; the file that owns each rule is named so the two can be kept in step. When a rule changes, change it here in the same commit.

Story and setting live in the owner's universe notes, which stay out of this public repo. This file covers mechanics only.

---

## 1. Fights

**Where:** `client/src/lib/engine/fight.ts` (rules), `client/src/lib/stores/useCombat.tsx` (timing), `client/src/lib/combat/grid.ts` (arenas).

### Turn order
1. **Start of your turn.** You and the enemy each lose 6 heat. If your heat is then 15 or less, you get a **double action** this turn.
2. **Move.** 1 tile (2 and 3 with the play-i Locomotion nodes, more with leg upgrades), 8 directions, around obstacles. Tap your start tile to undo. At 100 heat you can't move.
3. **Act.** One action from your bar of four, or a stim, or pass. Overclock is the only stim that doesn't end your turn.
4. **Hazard.** If you end on a hazard tile, you take its damage.
5. **Enemy turn.** Each enemy in turn fires a wound-up heavy, or picks a move, walks up to 2 tiles toward a spot it can hit from, and attacks if it can reach. Then it takes hazard damage if it's standing on one.

### Several enemies
- A level can throw 1–3 enemies at you (random for now; the story will set it later). The first level, every 5th level (elites, bosses) and the first-life Enforcer are always alone.
- Groups are scaled down: two enemies each have 60% health and 70% attack, three have 45% and 55%. Extra enemies are drawn from this level's type and the two before it.
- **Aiming:** tap an enemy (or its chip in the top bar) to target it. Area moves (Strike's ring, sweeps, cones, blasts) also hit every other enemy standing in the struck tiles, each with its own damage roll.
- **Enemy turn:** each living enemy acts in turn and treats the others as obstacles. A guard soaks one hit, so a crowd can't all hit a braced player at full guard.
- The fight is won when the last enemy falls.

### Arenas
- Portrait grids sized for what's on them (`arenaSize` in `grid.ts`): **7×9 for a player who moves 1 tile against one enemy.** Each extra tile of your movement adds a column and two rows; each body beyond two (enemies, allies) adds a row, and a column every two. Capped at 9×13. Sometimes one row longer for variety. You start on the bottom row, the enemy on the top row.
- Shapes: open, corridor (3 wide, 4 with four or more bodies), L-shape, cross.
- **Tilesets:** each chapter has a tileset in `client/src/content/chapters.json` (floor and sea colours, the hazards and cover that can appear). Chapter one, the Indian Ocean: a raft of plain plastic deck plates over open sea (the floor never varies, so anything that stands out matters); hazards fuel fire (8), live cable (6), chemical bilge (5), split decking (4); cover crate stacks, water drums, net piles, pump stacks. Everything is pixel art, painted at 16×16 and scaled up (`client/src/lib/rendering/board.ts`).
- On screen the arena is scaled to its walkable shape (void edges aren't counted), and the fight HUD is kept short (one heavy-attack warning however many enemies are winding up, one log line) so the arena keeps as much room as possible. Void tiles are holes you can't enter.
- Obstacles cover 8% of walkable tiles at threat 1, rising to 14%. Hazards start at threat 2 (2% rising to 6%). A path from you to the enemy always exists.
- Flanking (the enemy faces down the arena): hitting from **behind gives +30%**, from the **side +15%**.

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
- **Heavy attacks lock their tiles.** The enemy moves into position, then aims at where its target stands; the orange tiles are exactly the tiles that fire next turn. Anyone on them then is hit (allies included), anyone off them is safe, wherever they are. If the shape can't reach its target after the move, the heavy isn't wound up. Enemies only use heavies when your heat is **45 or more**.
- **Signature heavies:** Scavenger charge, Boarder cone, Cadre blast, Ghost-MIL X-burst, Raider ring, Surgeon strike (a grab), IOA knockback, Tianxia beam, Warden knockback, Volkov charge, Enforcer ring, Unregistered beam.
- **The red zone** shows only each enemy's normal attacks from where it stands; heavies show only as their locked orange tiles.
- **Grades:** enemies show how upgraded they are: Raw (threat 1–4), Grafted (5–9), Augmented (10–19), Chromed (20–29), Ascended (30+). The target card shows the grade and how many implants they carry (1 up to threat 5, 2 up to 10, then 3); in a fight the HUD names the implants, and each glows on the sprite in the grade's colour.
- **Lines:** at the start of a fight the lead enemy says one line of horror at the walking corpse (`lines` in `enemies.json`; `lateLines` join once 5 or more hosts are lost). The first time any host meets a kind of enemy, the signal notes its impression (`firstSight`) in the journal (`client/src/lib/stores/useJournal.tsx`), shown on the Status tab. Lines are flavour and use `Math.random`, so they don't change seeded runs.
- **Shields** come out only when the enemy is under half health, and then 35% of the time.
- Charges and lunges need a gap of 2 or more; sweeps and adjacent hits need you within 2.
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
- On top of that, every enemy's health is × 0.36 × 1.075^(threat − 1) and its attack × 1.01 × 1.07^(threat − 1) (`ENEMY_TUNING`, `ENEMY_GROWTH`). Fights stay short early, and the compounding growth means each host meets a wall it can't push through yet.
- **Levels come in sectors of 10.** The 5th level of each sector is an **elite** (×1.3 health, ×0.95 attack; Cartel Enforcer, CBN Extraction Surgeon, Unregistered Operator in turn). The 10th is a **boss** (×1.6 health, ×1.05 attack; stand-ins Volkov Operator and Helix Continuity Warden until the real bosses are built). Other levels walk the regular rotation.
- Threat 10 is the **Patchwork King**, built from a level-10 frame with his own ×1.7 health, ×1.45 attack, ×1.25 defence and three scripted phases.
- Enemies carry 1–3 random common or uncommon implants.
- **First life only:** threat 3 is the **Cartel Enforcer** (×2.6 health, ×2.7 attack). It is meant to end the first run.
- Simulator targets: about 7 turns for a regular fight, about 14 for a boss. Median best level is about 6 after 5 hosts lost, 10 after 10 and 19 after 20.

### Drops
- Rarity odds rise with threat: commons and uncommons only at 1–2, rares from 3, epics from 5, legendaries from 6; commons stop dropping around threat 20.
- Implants per win: regular fights have a 50% chance of one. Elites always drop one (uncommon or better, rare or better from threat 15). Bosses drop two, one of them epic or better (legendary chance 15% + 1% per threat, up to 50%).
- Stims from threat 2: 15% chance rising to 25%. Bosses always drop one.
- Credits: 10 + 8 × threat, plus up to the same again at random.
- First life: threat 1 always drops an active implant, threat 2 a passive one plus a Bio-Stim.
- The King always drops an epic, a rare and a stim, with a 35% chance of a legendary, plus 160–220 credits.

### XP
Level n needs 100 × 1.5^(n−1) XP. Threats 1–5 give 120 / 150 / 210 / 230 / 250 XP, then +20 per threat.

---

## 6. Economy

**Where:** `client/src/lib/combat/economy.ts`, `client/src/lib/stores/useMarket.tsx`.

- Buy prices: common 45, uncommon 95, rare 190, epic 360, legendary 640 credits, scaled by condition (worn ×0.75, degraded ×0.5, corroded ×0.3).
- Selling returns 40% of the buy price (at least 5).
- The Grey Lane stocks 7 implants and 3 stims, rerolled after every fight. Overclock appears from threat 5. From threat 12 there is a 25% chance (rising 3% a threat, up to 60%) of one legendary.
- Weapons: 12 base weapons (4 makers × pistol, revolver, shotgun) and their 12 upgrades. Sidearms and revolvers fire at range; shotgun-class frames hit a cone, steadier and cooler than their listed heat.

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

- Five allies, each unlocked the first time any host clears its level: **Bale** (Tianxia tank, 10), **Matron** (Crown healer, 15), **Ghostline** (Kizuna spotter, 20), **Ward** (Helix shield, 25), **Breaker** (Volkov damage, 30). An unlock joins the current host straight away if there's room.
- One ally per host (two with the Second link capstone), chosen on the death screen after the tree pick. The last host's ally is kept by default.
- Each ally has two fixed moves and moves 2 tiles. Effects: **attack** (needs range on your target), **taunt** (every enemy aims at the ally until your next turn, ally guards up), **heal** (a share of your max health, any range), **mark** (your hits on the target do more this round), **guard** (you guard up against the next hit). Support moves have cooldowns of 2–3 rounds.
- In your turn you can move the ally once (tap it, or its name, then a lit tile) and use one of its moves, before or after your own move. The turn ends when you execute.
- Enemies go for whoever is nearest, the player winning ties, unless an ally is drawing fire. A heavy wound up at an ally can be dodged by moving that ally.
- Allies have no structure bar: half the structural part of a hit spills onto their health. A knocked-out ally sits out the rest of that fight only. Allies don't take hazard damage. Every fight starts them at full health.
- Stats: built like a regular enemy of the unlock level (health × the ally's `hp`, attack and defence from its base plus the level scaling), then × 0.55 health and × 0.75 attack (`ALLY_TUNING`). Move damage scales like an enemy move of the unlock level.
- Levels: +8% health, attack, defence and move damage a level, up to 10. Each win gives the party 1 XP (2 with Shared memory); level n to n + 1 takes n + 1 XP. Levels survive death, so an early ally can be raised for the late game.
- Network perks: Handshake (+25% ally health), Shared memory (double ally XP), Coordinated (+20% damage on a foe your ally hit this round), Second link (two allies).

---

## 7b. The hidden map

**Where:** `client/src/content/map-indian-ocean.json` (rooms), `client/src/lib/engine/map.ts` (rules), `client/src/lib/stores/useMap.tsx`, `screens/RoomPanel.tsx`.

- Chapter one is a web of 37 rooms the player never sees as a map. The hideout screen shows the room you're in (about two sentences), what's there, and its exits as buttons, each with a hint ("East: the smell of fuel"). Exits you've been through before say "familiar".
- **Threat comes from the room.** Fight rooms hold one threat level, rising with depth from the body dock (1) to the drowned spire (30). Elites sit on 5, 15 and 25, bosses on 10 (the Patchwork King), 20 and 30. The fight footer button starts the room's fight.
- **Enemies hold the room:** while a room's fight is uncleared, every exit but the one you came in by is blocked. Win and the room stays clear for that host.
- **Markets** are in three safe rooms (the body dock, the Grey Lane stall, the canopy stall). The Grey Lane is only reachable from those rooms.
- **Things to look at:** some rooms have something to look closer at once they're clear; what you see goes into the journal.
- **Hidden goals:** three (the slab, the manifest, the Mother: placeholders until the story is written), each found by looking at something in a particular room. They're never listed. When all three are found, the sealed way from the wake down to the drowned spire opens.
- **Death:** a new host is another corpse reanimating at the body dock. Fights refill; visited rooms, things looked at and goals are kept.
- The content check rejects exits to missing rooms, unreachable rooms, a goal in more or fewer than one room, and fights in market rooms. The balance simulator still plays threats in order, which matches walking deeper.

## 8. Runs, seeds and saves

- Every run has a seed. Each fight is seeded from the run seed and the fight number, and each market visit from the run seed and its visit key, so the same seed and choices replay exactly (`client/src/lib/engine/rng.ts`).
- One versioned save holds everything (`client/src/lib/save.ts`). Players can copy it as text and restore it from the Status tab.

## 9. Checks that guard these rules

`npm run verify` runs before every deploy:
- **Typecheck.**
- **Content check** (`scripts/check-content.ts`): schemas, allowed values, ids, cross-references, the ally roster.
- **Tests** (`tests/`): the rules on this page, including rarity bands, structure, health floor, dodging heavies, heat damage, the play-i tree, allies and save round trips.
- **Balance simulator** (`scripts/sim.ts --check`): seeded bot runs. New players must die on enemy 2 or 3 in at least 85% of runs, win rates per threat band must stay within 65–99%, and the median best run must reach threat 9, regular fights must average 8 turns or fewer and bosses 16 or fewer, and the median best level must be 7–14 after 10 hosts lost and 13–25 after 20. It runs 20 seeded runs of 150 fights.
