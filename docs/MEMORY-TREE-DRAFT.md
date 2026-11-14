# The memory network (draft, agreed in planning; not built)

Replaces the play-i tree. Mockup: `client/src/components/game/screens/MemoryMockup.tsx` (`#mock-tree`, `#mock-death` in dev).

## Rules
- One memory point per lost host. Points are saved and spent on the network (death screen, or the Memory page). Shown only as the gold number in the core (max 999).
- The network is a hand-placed, uneven neural net in pixel art: clusters and long reaches, no filler, no branch names (colour tells branches apart). Paths fork and meet at shared neurons.
- A neuron has ranks (a pip each, under it); each rank costs points. Stat boosts come in small ranks at 1 point; game-changing unlocks are single big purchases (3-4 points).
- A neuron at full rank opens its specialisations (a small square light each on its upper edge: dark = not yet, strand colour = on offer, white = kept). All can be taken.
- How the last host died makes one branch 1 point cheaper (never free): a soft yellow glow round every neuron it applies to. Heat 70+ = Processing; a heavy, hazard or the sea = Locomotion; structure broken = Grafting/Fault; a long fight = Subroutines; an ally down = Network; else Signal.
- Rings: chapter one's part is the inner ring; each chapter finished opens the next (fifth and sixth slots, Phase step, a second ally live further out).
- Hosts start with 3 move slots (to confirm); the fourth is a neuron.
- Wording: say only what is gained ("start fights with 4 less heat per rank"), never "x instead of y"; "per rank".
- Numbers are placeholders to be tuned by playtest, a chapter at a time.

## Chapter one's ring (1 point a rank unless shown; > = specialisation)
**Signal**: Signal strength 8r +8 max health (> Second wind 3r: first time under a third each fight heal 5%; > Holdfast (3): once a host a killing blow leaves 1). Steady pulse 5r +0.5% mending (> Knitting frame (2): it also repairs structure). Thick skin 5r 2% less damage. Stim pouch 2r +1 starting Bio-Stim. Haggling 4r 5% lower prices.
**Processing**: Heat sink 5r 1 more heat shed a round (> Thermal tolerance 3r: hot damage taken 20% smaller). Cold start 5r 4 less starting heat. Hot streak 5r +3% crit at 86+ heat. Burnout drill 3r overheating hurts 25% less (> Runaway (3): it costs no turn). Redline (3): once a fight two actions on a turn started at 86+.
**Subroutines**: Targeting 8r +2% damage (> Finisher 5r +5% under 30% health; > First strike 3r +10% first attack). Flank logic 5r +3% side, +5% behind. Crit training 5r +5% crit damage. Momentum 4r +5 Overload a takedown. Fourth slot (4).
**Guard**: Practised guard 5r all defensive moves +4% (> Cool head 4r they remove 2 heat; > Counterweight 3r next attack +5%). Braced 4r Brace +1 guard (> Deep breath 5r Brace removes 2 more heat; > Patch job 5r Brace repairs 4% more). Reflex brace (4): Brace takes no slot.
**Fault** (placeholder until malfunction is redesigned): Breaker 5r +4% structure damage (> Exploit 5r +3% to malfunctioning enemies; > Seize up (3): breaking structure costs the enemy its next turn). Feedback 4r breaking structure adds 5 heat. Fail-safe 5r broken implants keep 5% more. Steady hands 5r weakest hits +4% while malfunctioning. Reboot 4r once a fight 5% structure back.
**Grafting**: Reinforced housings 6r +4% structure (> Sealed 3r mend at 10% rate while broken). Clean interface 5r implant health costs 10% lower. Graft memory 3r (2 each) +1 starting upgrade point. Salvage instinct (3). Pick of the wreck (3).
**Locomotion**: Gait calibration 2r (3 each) +1 movement (> Hit and fade (2); > Sidestep (3)). Sure footing 5r hazards 10% less. Clean break 5r parting blows 10% less. Sea legs 3r climbing out 20% cheaper.
**Network** (dark until an ally is linked): Handshake 5r allies +5% health (> Stand together (2)). Shared memory 4r allies +25% xp (> Coordinated 4r +5% on enemies your ally hit).
**Shared**: Cold blood (Signal/Processing) 3r; Hot hands (Processing/Subroutines) 5r; Kinship (Subroutines/Grafting) 5r; Brace for impact (Guard/Fault) 3r; Cover step (Locomotion/Network) 4r.

## Endless neurons (agreed direction)
Plain stat neurons (Signal strength, Targeting, Reinforced housings, Practised guard, Handshake, and a credits one in Luck) never fill: points always have somewhere to go. No hard caps. Two soft caps work together: each rank gives less than the last, and each rank costs more. The first 3-5 ranks are very strong, then a steep drop; far along, a rank costs 10+ points for an amount you can't notice. Example (Signal strength): ranks 1-3 +12/+10/+8 health at 1 point; 4-5 +6/+4 at 2; 6-10 +3 at 3; 11-20 +2 at 5; 21-40 +1 at 8; 41+ +0.5 at 12, climbing. Specialisations open at rank 5.

The two soft caps are out of step: reward drops and price rises land on different ranks, and each endless neuron has its own pattern, so there is never one obvious rank to stop at.

## Luck (new branch, to draft)
Drop rates: implant drop chance, rarity, credits, stim finds, market stock. Pick of the wreck moves here.

## Firmware (agreed direction)
Firmware levels are replaced. Each firmware has its own small cluster, bought with that firmware's own points, earned only by playing as it; its neurons evolve its starting move and rule (today's level rewards and forks, re-cut as neurons). General firmware is a branch of the main network (memory points). One of the main network's strands runs down to a separate square hub, and each firmware has a lane out of that hub with its own points (earned only by playing as it), its neurons set at stages along the lane. A zoomed-out view shows the memory and the lanes together with every pool of points; zoomed in, only that cluster's. Zooming out is opened by chapter one's threat-5 boss (the first firmware). Mockups: `#mock-zoom`, `#mock-firmware`.

## Open
- Malfunction gets its own redesign conversation; the Fault branch follows it.
- Draft each firmware's cluster from today's levels (Enforcer and Operative first: chapter one's two).

## v9 mockup: everything laid out
- The main network now has ten branches (Signal, Processing, Subroutines, Guard, Fault, Grafting, Locomotion, Network, Luck, general Firmware) and five shared neurons; every neuron, rank, specialisation and wording is in the mockup's data (`N` in MemoryMockup.tsx), which is the working list.
- Luck: Scavenger 5r (+3% implant drop chance; > Fine pickings 5r, > Pick of the wreck (3)), Lucky find 4r (+5% Bio-Stim chance), Loose change (endless, credits), Market eye 3r (+1 item on sale), Second chance (3).
- General firmware (memory points; its strand runs on to the hub): Tuned 5r (+2% own-move damage), Quick study 5r (firmware points 10% faster), Cold boot 3r (own move 1 less heat), Cross-load (4): carry a second firmware's own move as an ordinary move.
- Firmware lanes (`FWS`): all six. A lane's first node is the firmware itself: given, not bought, when its holder is beaten; it holds the lane's points and shows the firmware's own move and rule. Along the lane, today's level rewards re-cut: "Hits harder"/"Runs cooler" as ranks, the level-3 reward as a big moment, the three either/or level choices as forks whose both sides can be bought. Three stages a lane, split by dotted lines (reading: later stages open with later chapters; to confirm).
