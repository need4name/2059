import { useEffect } from "react";
import { useCombat } from "./lib/stores/useCombat";
import { CombatScene } from "./components/game/CombatScene";
import { GameUI } from "./components/game/GameUI";
import "@fontsource/inter";

function App() {
  const { phase } = useCombat();

  // Log phase changes for debugging
  useEffect(() => {
    console.log('Combat phase:', phase);
  }, [phase]);

  return (
    <div className="w-screen h-screen relative overflow-hidden bg-gray-950">
      {/* Combat Scene (Canvas) */}
      {(phase === 'player_turn' || phase === 'enemy_turn') && <CombatScene />}
      
      {/* Game UI Overlay */}
      <GameUI />
    </div>
  );
}

export default App;
