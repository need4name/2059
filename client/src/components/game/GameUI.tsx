import { useState } from 'react';
import { useCombat } from '@/lib/stores/useCombat';
import { BaseScreen } from './screens/BaseScreen';
import { VictoryScreen } from './screens/VictoryScreen';
import { DefeatScreen } from './screens/DefeatScreen';
import { ShopScreen } from './screens/ShopScreen';
import { CombatView } from './screens/CombatView';
import { DebugPanel } from './DebugPanel';
import { useLoadoutSync } from './useActionPool';

/** Routes to the screen for the current game phase. */
export function GameUI() {
  const phase = useCombat(s => s.phase);
  const [showDebug, setShowDebug] = useState(false);
  useLoadoutSync();

  let screen;
  switch (phase) {
    case 'player_turn':
    case 'enemy_turn': screen = <CombatView />; break;
    case 'victory': screen = <VictoryScreen />; break;
    case 'defeat': screen = <DefeatScreen />; break;
    case 'shop': screen = <ShopScreen />; break;
    default: screen = <BaseScreen />;
  }

  return (
    <>
      {screen}
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
                <DebugPanel onClose={() => setShowDebug(false)} />
              </div>
            </div>
          )}
        </>
      )}
    </>
  );
}
