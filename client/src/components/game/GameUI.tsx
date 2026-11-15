import { lazy, Suspense, useEffect, useRef, useState } from 'react';
import { useCombat } from '@/lib/stores/useCombat';
import { BaseScreen } from './screens/BaseScreen';
import { VictoryScreen } from './screens/VictoryScreen';
import { DefeatScreen, DailyEndScreen } from './screens/DefeatScreen';
import { dailyDay } from '@/lib/daily';
import { ShopScreen } from './screens/ShopScreen';
import { CombatView } from './screens/CombatView';
import { useLoadoutSync } from './useActionPool';
import { WakeBeat } from './WakeBeat';
import { useMap } from '@/lib/stores/useMap';
import { wakeNow, type Wake } from '@/lib/engine/clock';

// Test tools load only in development builds, so players never download them
const DebugPanel = import.meta.env.DEV ? lazy(() => import('./DebugPanel').then(m => ({ default: m.DebugPanel }))) : () => null;

/** Routes to the screen for the current game phase. */
export function GameUI() {
  const phase = useCombat(s => s.phase);
  const [showDebug, setShowDebug] = useState(false);
  useLoadoutSync();
  // A new host wakes (the clock moves on): a few wordless seconds of the sky it woke to (WakeBeat)
  const lost = useMap(s => s.clock?.lost ?? 0);
  const seen = useRef(lost);
  const [beat, setBeat] = useState<Wake | null>(null);
  useEffect(() => {
    if (lost > seen.current && !(typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches)) setBeat(wakeNow(useMap.getState().clock));
    seen.current = lost;
  }, [lost]);

  let screen;
  switch (phase) {
    case 'player_turn':
    case 'enemy_turn': screen = <CombatView />; break;
    case 'victory': screen = <VictoryScreen />; break;
    case 'defeat': screen = dailyDay ? <DailyEndScreen /> : <DefeatScreen />; break;
    case 'shop': screen = <ShopScreen />; break;
    default: screen = <BaseScreen />;
  }

  return (
    <>
      {screen}
      {beat && <WakeBeat key={beat.hours} dayPart={beat.dayPart} weather={beat.weather} onDone={() => setBeat(null)} />}
      {/* Test tools, only in development builds */}
      {import.meta.env.DEV && phase === 'menu' && (
        <>
          <button
            onClick={() => setShowDebug(true)}
            className="fixed bottom-28 left-3 z-40 rounded-full bg-hostile/15 px-2.5 py-1 text-[11px] font-semibold text-rose-300"
          >
            Dev
          </button>
          {showDebug && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4" onClick={() => setShowDebug(false)}>
              <div onClick={e => e.stopPropagation()} className="w-full max-w-md">
                <Suspense fallback={null}><DebugPanel onClose={() => setShowDebug(false)} /></Suspense>
              </div>
            </div>
          )}
        </>
      )}
    </>
  );
}
