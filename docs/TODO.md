# To do

The working list. Chapter one first; everything from chapter two on is framework.

## Combat feel (one pass: report, proposals, then build in stages)

1. ~~Fights drag at the end~~ Done: enemy toughness moved into structure, broken enemies take more, misfire in. Watch it in playtests.
2. **Enemy attack range.** Ordinary enemies no longer hunt the tiles you could step to (red within 2 steps of you: 29% to 22%). If it still feels too red in playtests, the next lever is narrowing shooters' shapes (bolt, pierce and ranged cover every line out to range: 26 tiles from mid-board, against 8-12 for melee).
3. ~~Enemy AI~~ Done for chapter one: each enemy has a behaviour (brawler, flanker, shover, hauler, mender, cover); elites and bosses hunt. Watch it in playtests; later chapters' enemies get theirs when we get there.
4. ~~Damaging tiles feel half-baked~~ Done: damage is a share of health and each kind has its own effect (burn, stun, eat structure, catch a leg). Watch it in playtests.

## Maps

6. ~~Fight boards feel repetitive and cramped~~ Done for chapter one: every fight room but the throne has three layouts (one picked each fight), mostly 7x10 with more open space. Watch it in playtests.
7. ~~Knocking enemies off the arena is inconsistent~~ Done: at sea every open edge is a drop into the water; shove arrows show sea, hazard or a stop.

## Ongoing

10. Chapter one balance from playtests.
11. Story text: room text and chapter goals are placeholders.

## Story and feel

- ~~Time passes between hosts~~ Done: a hidden clock (gaps shrink with hosts lost), the light and weather each host wakes to, the wake beat, blood drying, the last body ageing (its part goes off). Next for it: enemy and trader lines that know how long it's been (needs writing).

## Drops (analysis before the motivation talk)

- **Part drops.** Done (stages 1-3): no repeats while something new is left, chapter one white and green (5% to 40% green), commons vary (any shape, sometimes a mod, sometimes a trait). Stage 4 done: 70 commons, seven a slot.

## Motivation (agreed direction)

Rules: strategy first (chapters get harder by asking for better play); death is the signal waking up (more to do, a little more strength); the player should feel they got better; host count is the score, not a gate; difficulty settings.

1. Re-aim the balance: a spread by skill. Measured with the expert bot (`npm run sim:expert`): King on host 5 against 8 for the average bot. The scripted first death stays and counts. Still to do: a struggling-player measure, and tuning toward expert about 4.
2. Memory network, options over numbers: ten swaps built. Seven more need a button or a screen, so mockups first: Bleed off (spend health to act again), Old debts (trade a spare at the Grey Lane), Opening read (see where enemies will stand), Follow through (turn to face after a kill), Manual override (one move can't misfire), Switch (swap places with an ally), On my mark (an ally acts right after you). Also halve the early steps of the six endless neurons.
3. End-of-chapter count: done. Hosts it took, marked with the difficulty and challenges; fewest kept per chapter on the device; time gone by. Still to do: the end of the whole story (after the last chapter) shows the run's total the same way.
4. Difficulty: done, with three saves. Easy and Normal from the start, Hard after finishing chapter one on Normal.
5. Challenges: done (eight, replacing Strain). Later: more challenges as later chapters come in (their conditions can name chapter two's bosses), and balance each against playtests.

## Hazards, next

- Generated boards (fights outside map rooms) still scatter hazards without sources.
- Enemies don't yet shove you into fuel drums on purpose.
- Chapter two on: pumps shorting into live cable, decks cracking under heavy blows, bodies going through split decking into the sea.
