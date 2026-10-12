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
- Portrait grids. **7×9 at threat 1, growing to 9×13 by threat 12.** You start on the bottom row, the enemy on the top row.
- Shapes: open, corridor (3 wide), L-shape, cross. Void tiles are holes you can't enter.
- Obstacles cover 8% of walkable tiles at threat 1, rising to 14%. Hazards start at threat 2 (2% rising to 6%). A path from you to the enemy always exists.
- Flanking (the enemy faces down the arena): hitting from **behind gives +30%**, from the **side +15%**.

### Enemy behaviour
- **Heavy attacks** are telegraphed: the enemy moves into position and winds up, and the orange tiles show where it lands next turn. Step out of them and it misses. Enemies only use heavies when your heat is **45 or more**.
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

---

## 5. Progression and loot

**Where:** `client/src/lib/combat/loot.ts`, `client/src/lib/combat/skills.ts`, `client/src/lib/combat/actions.ts` (enemy scaling).

### Enemy scaling by threat
- Base health: 36 + 17 × threat + 0.85 × threat². Attack +4.4 and defence +2.4 per threat on top of each enemy's base. Move damage +19% per threat.
- On top of that, every enemy's health is × 0.36 × 1.075^(threat − 1) and its attack × 0.98 × 1.07^(threat − 1) (`ENEMY_TUNING`, `ENEMY_GROWTH`). Fights stay short early, and the compounding growth means each host meets a wall it can't push through yet.
- **Levels come in sectors of 10.** The 5th level of each sector is an **elite** (×1.3 health, ×0.95 attack; Cartel Enforcer, CBN Extraction Surgeon, Unregistered Operator in turn). The 10th is a **boss** (×1.6 health, ×1.05 attack; stand-ins Volkov Operator and Helix Continuity Warden until the real bosses are built). Other levels walk the regular rotation.
- Threat 10 is the **Patchwork King**, built from a level-10 frame with his own ×1.7 health, ×1.45 attack, ×1.25 defence and three scripted phases.
- Enemies carry 1–3 random common or uncommon implants.
- **First life only:** threat 3 is the **Cartel Enforcer** (×2.4 health, ×2.2 attack). It is meant to end the first run.
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

- When the host dies, the signal jumps to a new body at threat 1. Implants, credits, weapons, loadout extras and upgrades are lost. The host count and the class unlock are kept.
- Dying at threat 11 or higher while unclassified permanently unlocks the Enforcer and Operative firmware.
- **The play-i tree** (`client/src/content/playi-tree.json`, `client/src/lib/engine/playi.ts`): what the signal keeps. 34 nodes in 6 branches, hidden from the player. After each death the player picks 1 of 2 random open nodes (a node is open when one of its required nodes is owned; tier 1 needs nothing; Network nodes need an unlocked ally). When fewer than two are open, a repeatable Signal fragment (+5 max health) fills the gap.
- Node effects reach the fight engine through `perks` on the fight state (cooling, double-action heat, brace repair and venting, damage, flanking, clean first strike, finisher, chain, hot-damage taken, damage taken, Holdfast, Sidestep, hazards), the new host (starting implant, Bio-Stims, upgrade points, max health, structure, health costs), movement (extra tiles, Reflex loop, Phase step, Runaway), the fight bar (Fifth slot), the market (Haggler) and loot (Pick of the wreck).
- Holdfast is once per host; Sidestep and Clean first strike reset every fight.

---

## 8. Runs, seeds and saves

- Every run has a seed. Each fight is seeded from the run seed and the fight number, and each market visit from the run seed and its visit key, so the same seed and choices replay exactly (`client/src/lib/engine/rng.ts`).
- One versioned save holds everything (`client/src/lib/save.ts`). Players can copy it as text and restore it from the Status tab.

## 9. Checks that guard these rules

`npm run verify` runs before every deploy:
- **Typecheck.**
- **Content check** (`scripts/check-content.ts`): schemas, allowed values, ids, cross-references.
- **Tests** (`tests/`): the rules on this page, including rarity bands, structure, health floor, dodging heavies, heat damage and save round trips.
- **Balance simulator** (`scripts/sim.ts --check`): seeded bot runs. New players must die on enemy 2 or 3 in at least 85% of runs, win rates per threat band must stay within 65–99%, and the median best run must reach threat 9, regular fights must average 8 turns or fewer and bosses 16 or fewer, and the median best level must be 7–14 after 10 hosts lost and 13–25 after 20. It runs 20 seeded runs of 150 fights.
