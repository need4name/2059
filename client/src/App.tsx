import { useEffect, useState } from "react";
import { useCombat } from "./lib/stores/useCombat";
import { useAudio } from "./lib/stores/useAudio";
import { GameUI } from "./components/game/GameUI";
import { TitleScreen, DifficultyScreen } from "./components/game/screens/TitleScreen";
import { takeLaunch, type Difficulty } from "./lib/slots";
import type { ChallengeId } from "./lib/challenges";
import { createPlayer } from "./lib/combat/actions";
import { useFirmware } from "./lib/stores/useFirmware";
import { useRun } from "./lib/stores/useRun";
import { MockDeath, MockTree, MockZoom, MockFirmware } from "./components/game/screens/MemoryMockup";
import { dailyDay, dailySeed } from "./lib/daily";
import { Crashed } from "./components/game/Crashed";

function App() {
  // Reloaded into a save from the title: carry straight on, or go to the difficulty choice for a new run
  const [launch] = useState(() => takeLaunch());
  const [onTitle, setOnTitle] = useState(launch !== 'continue');
  const [choosing, setChoosing] = useState(launch === 'new');
  const initAudio = useAudio(s => s.init);

  useEffect(() => { initAudio(); }, [initAudio]);

  const newGame = (difficulty: Difficulty = 'normal', challenges: ChallengeId[] = []) => {
    const s = useCombat.getState();
    s.resetAll();
    useRun.getState().begin(difficulty, challenges);
    // Enforcer only (a challenge): the first host wakes with it too
    if (challenges.includes('enforcer')) {
      useFirmware.getState().open('melee'); useFirmware.getState().woke();
      useCombat.setState({ playerClass: 'melee', player: createPlayer(undefined, 'melee') });
    }
    setChoosing(false);
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
      <Crashed>{choosing ? <DifficultyScreen onBack={() => setChoosing(false)} onBegin={newGame} />
        : onTitle ? <TitleScreen onContinue={() => setOnTitle(false)} onNewGame={() => (dailyDay ? newGame() : setChoosing(true))} /> : <GameUI />}</Crashed>
    </div>
  );
}

export default App;
