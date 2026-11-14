import { useEffect, useState } from "react";
import { useCombat } from "./lib/stores/useCombat";
import { useAudio } from "./lib/stores/useAudio";
import { GameUI } from "./components/game/GameUI";
import { TitleScreen } from "./components/game/screens/TitleScreen";
import { MockDeath, MockTree, MockZoom, MockFirmware } from "./components/game/screens/MemoryMockup";
import { dailyDay, dailySeed } from "./lib/daily";
import { Crashed } from "./components/game/Crashed";

function App() {
  const [onTitle, setOnTitle] = useState(true);
  const initAudio = useAudio(s => s.init);

  useEffect(() => { initAudio(); }, [initAudio]);

  const newGame = () => {
    const s = useCombat.getState();
    s.resetAll();
    // Today's run plays from the day's seed, so everyone gets the same one
    if (dailyDay) s.setRunSeed(dailySeed(dailyDay));
    s.completeIntro();
    setOnTitle(false);
    s.startCombat();
  };

  if (import.meta.env.DEV && location.hash === '#mock-death') return <MockDeath />;
  if (import.meta.env.DEV && location.hash === '#mock-tree') return <MockTree />;
  if (import.meta.env.DEV && location.hash === '#mock-zoom') return <MockZoom />;
  if (import.meta.env.DEV && location.hash === '#mock-firmware') return <MockFirmware />;
  return (
    <div className="relative h-full w-full overflow-hidden bg-hud-bg">
      <Crashed>{onTitle ? <TitleScreen onContinue={() => setOnTitle(false)} onNewGame={newGame} /> : <GameUI />}</Crashed>
    </div>
  );
}

export default App;
