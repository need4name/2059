import { useEffect, useRef } from 'react';
import { useTutorial, HintId } from '@/lib/stores/useTutorial';
import { useCombat } from '@/lib/stores/useCombat';
import { useInventory } from '@/lib/stores/useInventory';
import { useAugmentTrees } from '@/lib/stores/useAugmentTrees';
import { useMap } from '@/lib/stores/useMap';
import { useAllies } from '@/lib/stores/useAllies';
import { CHAPTER_MAP, roomById, hasFight, cacheReady, exitState } from '@/lib/engine/map';
import * as Fight from '@/lib/engine/fight';
import { Btn } from './hud';

const HINTS: Record<HintId, { title: string; body: string; icon: string }> = {
  intro: {
    icon: '📡',
    title: "You're awake",
    body: "You're a stray signal living in the grey-market brain chips that raft medics install. This body belonged to a salvager in Offshore Sector 7. A Limbic Cartel scavenger has come for its implants. Take theirs first. After that there's no map: read each place, pick a way on and see what's there.",
  },
  move: {
    icon: '👣',
    title: 'Moving',
    body: 'Tap a lit tile to move. A fresh body manages 1 tile a turn. Tap your starting tile to change your mind.',
  },
  attack: {
    icon: '⚔️',
    title: 'Attacking',
    body: 'Pick Strike below. Faint outlines show everywhere it can reach; the bright squares are where it will land, already aimed for you. Tap another outlined square to aim there. Every enemy in the bright squares is hit. Then press Execute.',
  },
  enemy_reach: {
    icon: '🟥',
    title: 'Reading the enemy',
    body: "Red tiles are exactly where enemies can hit on their turn. They attack first and move after, so end your turn outside the red and they can't touch you. Then they close in.",
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
    body: 'The enemy is winding up a heavy attack. The orange tiles are exactly where it lands next turn. Step off them and it misses.',
  },
  stims: {
    icon: '💉',
    title: 'Stims',
    body: 'You have a stim. Use it from the Stims button on your turn. Most stims end your turn; Overclock doesn\'t.',
  },
  victory: {
    icon: '🧰',
    title: 'Strip them for parts',
    body: 'Strip the bodies: these are the implants they were wearing. Pick the one you want, the rest are scrapped for credits. Install it at the hideout before the next fight.',
  },
  base: {
    icon: '🏚️',
    title: 'The hideout',
    body: 'Between fights you see the room you\'re standing in and the ways on. Pick a way to explore; enemies block every way but the one you came in by until you beat them. The Next step card at the top always says what to do now, and the Get ready tiles open your fight bar, implants, upgrades and status.',
  },
  implants: {
    icon: '🔧',
    title: 'Active and passive implants',
    body: 'Active implants (arms, legs and eyes) give you a new combat action as well as stats. Each is cobbled from parts: its head decides the attack shape (the little picture on the move) and better parts add side effects like knockback or bleeding. Cheap commons only hit one enemy. Passive implants (brain, ears, nose, lungs and spine) only give stats and always-on effects. Every implant adds to your structure bar, and some cost you health.',
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
  look: {
    icon: '🔍',
    title: 'Look closer',
    body: 'Some places have something worth a closer look. What you see goes into your journal, and a few things matter more than they seem.',
  },
  ally: {
    icon: '🤝',
    title: 'Someone to link with',
    body: 'There is someone here your signal can link with. Linked allies fight beside you, and they stay linked through every host you wake in.',
  },
  cache: {
    icon: '📦',
    title: 'A cache',
    body: 'Someone hid supplies here. Search it for a stim or credits. Each host can search it once.',
  },
  sealed: {
    icon: '🔒',
    title: 'A sealed way',
    body: "Some ways are shut until you've found what this place is hiding. Keep looking closer at things.",
  },
  reborn: {
    icon: '🧟',
    title: 'Back at the dock',
    body: 'A new corpse, the same signal. Every fight is back, but you remember the way, what you looked at and who you linked with. Upgrade points only come from going deeper than this host has been.',
  },
  surge: {
    icon: '⚡',
    title: 'Signal Surge',
    body: 'Dealing and taking damage fills the overload meter. When it is full, Surge hits every enemy within 2 tiles hard and vents all your heat. It does not use up your turn.',
  },
  burning: {
    icon: '🔥',
    title: 'Burning',
    body: 'Ending a turn on burning fuel sets you alight: you lose health at the start of the next two turns. Enemies burn too, so fight near the fire, not in it.',
  },
  stunned: {
    icon: '💫',
    title: 'Stunned',
    body: 'Knock something into cover, a wall or another body and both take damage, and the one thrown is stunned: it loses its next turn.',
  },
  turns: {
    icon: '⏱️',
    title: 'Who goes next',
    body: 'The strip at the top right shows the order everyone acts in this round. The highlighted face is whoever is acting now.',
  },
  traits: {
    icon: '🧬',
    title: 'Enemy traits',
    body: "Enemies' implants give them traits: Fast, Sighted, Braced and more. Tap an enemy to see its traits. Strip a body and you might find the very implant that gave it one.",
  },
  shove: {
    icon: '🪝',
    title: 'Dragged and shoved',
    body: "Red tiles with a purple edge mean that hit also drags you toward the enemy or shoves you away. Watch what's behind you: fire, cables, or the sea.",
  },
  parting: {
    icon: '🦶',
    title: 'Parting blows',
    body: 'An enemy right beside you gets a free hit if you walk away from it. Move squares that would do that have orange dots. Kill it first, or step to a square still beside it.',
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
  const map = useMap();
  const room = roomById(map.room);
  const fightHere = hasFight(map, room);
  const inMenu = c.phase === 'menu';
  const enemyActed = useRef(false);

  useEffect(() => { if (c.phase === 'enemy_turn') enemyActed.current = true; }, [c.phase]);
  useEffect(() => { enemyActed.current = false; }, [c.fightId]);

  useEffect(() => {
    if (!t.enabled || t.active) return;
    const want = (id: HintId, cond: boolean) => cond && !t.seen[id];
    const myTurn = c.phase === 'player_turn' && !c.inputLocked;
    const candidates: [HintId, boolean][] = [
      ['enforcer', myTurn && c.boss.name.includes('Enforcer')],
      ['intro', (inMenu || myTurn) && c.progression.deathCount === 0 && map.cleared.length === 0],
      ['telegraph', myTurn && c.foes.some(f => !!f.pendingAction)],
      ['malfunction', myTurn && c.playerMalfunctioning],
      ['move', myTurn && !!t.seen.intro && !c.hasMoved],
      ['attack', myTurn && !!t.seen.move],
      ['enemy_reach', myTurn && enemyActed.current],
      ['shove', myTurn && !!t.seen.enemy_reach && c.foes.some(f => f.unit.currentHp > 0 && Fight.foeRoster(f).some(a => a.attackPattern === 'knockback' || !!a.effects?.knock || !!a.effects?.pull))],
      ['parting', myTurn && !!t.seen.enemy_reach && c.foes.some(f => f.unit.currentHp > 0 && !f.stunned && Math.max(Math.abs(f.pos.row - c.grid.playerPosition.row), Math.abs(f.pos.col - c.grid.playerPosition.col)) === 1)],
      ['heat', myTurn && c.playerHeat >= 35],
      ['structure', myTurn && c.player.maxStructuralHp > 0 && c.player.currentStructuralHp < c.player.maxStructuralHp],
      ['stims', myTurn && items.some(i => i.type === 'consumable')],
      ['surge', myTurn && Fight.canSurge(c)],
      ['burning', myTurn && (c.playerBurning > 0 || c.foes.some(f => f.burning > 0))],
      ['stunned', (c.phase === 'player_turn' || c.phase === 'enemy_turn') && (c.playerStunned || c.foes.some(f => f.stunned && f.unit.currentHp > 0))],
      ['turns', myTurn && !!t.seen.attack && c.foes.length + c.allies.length >= 2],
      ['traits', myTurn && !!t.seen.attack && c.foes.some(f => (f.unit.traits?.length ?? 0) > 0)],
      ['victory', c.phase === 'victory'],
      ['death', c.phase === 'defeat'],
      ['base', c.phase === 'menu' && !!t.seen.victory],
      ['reborn', inMenu && c.progression.deathCount > 0 && room.id === CHAPTER_MAP.entry && map.cleared.length === 0],
      ['look', inMenu && !!t.seen.base && !!room.look && !fightHere && !map.looked.includes(room.id)],
      ['ally', inMenu && !!room.ally && !fightHere && !useAllies.getState().met.includes(room.ally)],
      ['cache', inMenu && !!t.seen.base && cacheReady(map, room)],
      ['sealed', inMenu && room.exits.some(e => exitState(map, e) === 'sealed')],
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
