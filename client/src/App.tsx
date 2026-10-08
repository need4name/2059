import { useEffect, useState } from "react";
import { useCombat } from "./lib/stores/useCombat";
import { useAudio } from "./lib/stores/useAudio";
import { GameUI } from "./components/game/GameUI";
import { TitleScreen } from "./components/game/screens/TitleScreen";

function App() {
  const [onTitle, setOnTitle] = useState(true);
  const initAudio = useAudio(s => s.init);

  useEffect(() => { initAudio(); }, [initAudio]);

  const newGame = () => {
    const s = useCombat.getState();
    s.resetAll();
    s.completeIntro();
    setOnTitle(false);
    s.startCombat();
  };

  return (
    <div className="relative h-full w-full overflow-hidden bg-hud-bg">
      {onTitle ? <TitleScreen onContinue={() => setOnTitle(false)} onNewGame={newGame} /> : <GameUI />}
    </div>
  );
}

export default App;
