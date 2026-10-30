import { useEffect, useRef } from 'react';
import { useTutorial, HintId } from '@/lib/stores/useTutorial';
import { useCombat } from '@/lib/stores/useCombat';
import * as Fight from '@/lib/engine/fight';

/**
 * Hints are one short line each, about controls only, never about the world or
 * the numbers behind it. Everything else the player finds out by playing.
 */
const HINTS: Partial<Record<HintId, string>> = {
  move: 'Tap a lit tile to move.',
  attack: 'Pick a move, tap where it lands, then Execute.',
  enemy_reach: 'Red is where they will strike.',
  telegraph: 'Orange is where it lands next.',
  heat: 'Brace to cool down.',
  surge: 'Something in you is ready to break loose.',
  victory: 'Take one. The rest is scrap.',
};

/** Watches the game and queues the next hint the player hasn't seen yet. */
export function useTutorialTriggers() {
  const t = useTutorial();
  const c = useCombat();
  const enemyActed = useRef(false);

  useEffect(() => { if (c.phase === 'enemy_turn') enemyActed.current = true; }, [c.phase]);
  useEffect(() => { enemyActed.current = false; }, [c.fightId]);

  useEffect(() => {
    if (!t.enabled || t.active || c.fightIntro) return;
    const want = (id: HintId, cond: boolean) => cond && !t.seen[id];
    const myTurn = c.phase === 'player_turn' && !c.inputLocked;
    const candidates: [HintId, boolean][] = [
      ['telegraph', myTurn && c.foes.some(f => !!f.pendingAction)],
      ['move', myTurn && !c.hasMoved],
      ['attack', myTurn && !!t.seen.move],
      ['enemy_reach', myTurn && enemyActed.current],
      ['heat', myTurn && c.playerHeat >= 35],
      ['surge', myTurn && Fight.canSurge(c)],
      ['victory', c.phase === 'victory'],
    ];
    const next = candidates.find(([id, cond]) => want(id, cond));
    if (next) t.show(next[0]);
  });
}

/** The current hint: one line that fades in over the game. Tap it, or wait, and it goes. */
export function TutorialHint() {
  const { active, dismiss } = useTutorial();
  useEffect(() => {
    if (!active) return;
    const t = setTimeout(dismiss, 6500);
    return () => clearTimeout(t);
  }, [active, dismiss]);
  const text = active ? HINTS[active] : undefined;
  if (!active || !text) return null;
  return (
    <div className="pointer-events-none fixed inset-x-0 z-[60] flex justify-center px-6" style={{ top: '46%' }}>
      <button key={active} onClick={dismiss} role="status"
        className="whisper pointer-events-auto max-w-[340px] rounded-full bg-black/60 px-5 py-2.5 text-center text-[14px] font-medium leading-snug text-hud-text shadow-[0_8px_30px_rgba(0,0,0,0.5)] ring-1 ring-sys/25 backdrop-blur-md">
        {text}
      </button>
    </div>
  );
}
