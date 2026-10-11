import { useEffect, useRef } from 'react';
import { useTutorial, HintId } from '@/lib/stores/useTutorial';
import { useCombat } from '@/lib/stores/useCombat';
import { useInventory } from '@/lib/stores/useInventory';
import { useAugmentTrees } from '@/lib/stores/useAugmentTrees';
import { Btn } from './hud';

const HINTS: Record<HintId, { title: string; body: string; icon: string }> = {
  intro: {
    icon: '📡',
    title: "You're awake",
    body: "You're a stray signal living in the grey-market brain chips that raft medics install. This body belonged to a salvager in Offshore Sector 7. A Limbic Cartel scavenger has come for its implants. Take theirs first.",
  },
  move: {
    icon: '👣',
    title: 'Moving',
    body: 'Tap a lit tile to move. You can cover up to 2 tiles a turn. Tap your starting tile to change your mind.',
  },
  attack: {
    icon: '⚔️',
    title: 'Attacking',
    body: 'Pick Strike below. The tiles you can hit light up, and the enemy shows "In range" when you can reach it. Then press Execute. The numbers on each button are the damage you\'ll do.',
  },
  enemy_reach: {
    icon: '🟥',
    title: 'Reading the enemy',
    body: 'Red tiles show where the enemy can reach on its turn. Ending your turn outside them buys you time.',
  },
  heat: {
    icon: '🌡️',
    title: 'Heat',
    body: 'Attacking builds heat (the gauge on the left). Hot systems crit more but take more damage. Brace cools you down and blocks part of the next hit, and heat drops a little every round. Below 15 heat you get to act twice.',
  },
  brace: {
    icon: '🛡️',
    title: 'Brace',
    body: 'Brace cools you down, repairs implant structure and softens the next hit.',
  },
  structure: {
    icon: '🦾',
    title: 'Structure',
    body: "The grey bar under your health is your implants' structure. Some attacks wreck implants instead of flesh. More implants, and heavier ones, give you a bigger bar. With no implants, those hits land on you instead.",
  },
  malfunction: {
    icon: '⚠️',
    title: 'Malfunction',
    body: "Your implants' structure has hit zero. Until you Brace or use a Structural Patch, your attacks are shaky and unreliable.",
  },
  telegraph: {
    icon: '🟧',
    title: 'Charged attack',
    body: 'The enemy is winding up a heavy attack. The orange tiles show where it lands next turn. Step out of them and it misses.',
  },
  stims: {
    icon: '💉',
    title: 'Stims',
    body: 'You have a stim. Use it from the Stims button on your turn. Most stims end your turn; Overclock doesn\'t.',
  },
  victory: {
    icon: '🧰',
    title: 'Salvage',
    body: 'Everything you take goes into your stash. Install implants back at the hideout before the next fight.',
  },
  base: {
    icon: '🏚️',
    title: 'The hideout',
    body: 'You come back here between fights. Loadout picks the four actions you take into a fight. Implants is where you install salvage. Upgrades spends points. Grey Lane buys and sells.',
  },
  implants: {
    icon: '🔧',
    title: 'Active and passive implants',
    body: 'Active implants (arms, legs and eyes) give you a new combat action as well as stats. Passive implants (brain, ears, nose, lungs and spine) only give stats and always-on effects. Every implant adds to your structure bar, and some cost you health.',
  },
  upgrades: {
    icon: '⬆️',
    title: 'Upgrade points',
    body: "You levelled up. Spend points in Upgrades on implants you have installed. Implants sitting in your stash can't be upgraded.",
  },
  market: {
    icon: '🛒',
    title: 'Grey Lane',
    body: 'Buy implants, stims and weapons, or sell spare salvage. Filter by active or passive implants and by rarity. Stock changes after every fight.',
  },
  enforcer: {
    icon: '☠️',
    title: 'Cartel enforcer',
    body: "This one is far beyond what your body can take. Hold out as long as you can.",
  },
  death: {
    icon: '📡',
    title: 'Host lost',
    body: "This body is finished, but you aren't. Your signal jumps into a fresh host on the rafts. The implants stay with the corpse, so you start again with only what you've learned.",
  },
};

/** Watches the game and queues the next hint the player hasn't seen yet. */
export function useTutorialTriggers() {
  const t = useTutorial();
  const c = useCombat();
  const { items } = useInventory();
  const { availablePoints } = useAugmentTrees();
  const enemyActed = useRef(false);

  useEffect(() => { if (c.phase === 'enemy_turn') enemyActed.current = true; }, [c.phase]);
  useEffect(() => { enemyActed.current = false; }, [c.fightId]);

  useEffect(() => {
    if (!t.enabled || t.active) return;
    const want = (id: HintId, cond: boolean) => cond && !t.seen[id];
    const myTurn = c.phase === 'player_turn' && !c.inputLocked;
    const candidates: [HintId, boolean][] = [
      ['enforcer', myTurn && c.boss.name.includes('Enforcer')],
      ['intro', myTurn && c.progression.deathCount === 0 && c.bossLevel === 1],
      ['telegraph', myTurn && !!c.pendingBossAction],
      ['malfunction', myTurn && c.playerMalfunctioning],
      ['move', myTurn && !!t.seen.intro && !c.hasMoved],
      ['attack', myTurn && !!t.seen.move],
      ['enemy_reach', myTurn && enemyActed.current],
      ['heat', myTurn && c.playerHeat >= 35],
      ['structure', myTurn && c.player.maxStructuralHp > 0 && c.player.currentStructuralHp < c.player.maxStructuralHp],
      ['stims', myTurn && items.some(i => i.type === 'consumable')],
      ['victory', c.phase === 'victory'],
      ['death', c.phase === 'defeat'],
      ['base', c.phase === 'menu' && !!t.seen.victory],
      ['implants', c.phase === 'menu' && !!t.seen.base && items.some(i => i.type === 'augmentation')],
      ['upgrades', c.phase === 'menu' && availablePoints > 0],
      ['market', c.phase === 'shop'],
    ];
    const next = candidates.find(([id, cond]) => want(id, cond));
    if (next) t.show(next[0]);
  });
}

export function TutorialHint() {
  const { active, dismiss, skipAll } = useTutorial();
  if (!active) return null;
  const hint = HINTS[active];
  return (
    <div className="fixed inset-0 z-[60] flex items-end justify-center bg-black/45 p-4 pb-36 backdrop-blur-[2px] sm:items-center sm:pb-4">
      <div role="dialog" aria-modal="true" aria-labelledby="hint-title" className="rise-in w-full max-w-sm rounded-3xl bg-hud-panel p-5 shadow-2xl ring-1 ring-sys/30">
        <div className="flex items-start gap-3">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-sys/10 text-xl">{hint.icon}</span>
          <div className="min-w-0">
            <h2 id="hint-title" className="font-display text-lg font-semibold text-white">{hint.title}</h2>
            <p className="mt-1.5 text-sm leading-relaxed text-hud-dim">{hint.body}</p>
          </div>
        </div>
        <div className="mt-4 flex items-center justify-between gap-2">
          <Btn variant="ghost" size="sm" onClick={skipAll}>Skip tutorial</Btn>
          <Btn variant="primary" size="sm" onClick={dismiss}>Got it</Btn>
        </div>
      </div>
    </div>
  );
}
