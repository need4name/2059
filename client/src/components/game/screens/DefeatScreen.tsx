import { useState } from 'react';
import { useCombat, CLASS_UNLOCK_LEVEL } from '@/lib/stores/useCombat';
import { CLASS_DEFINITIONS } from '@/lib/combat/actions';
import type { PlayerClass } from '@/lib/combat/types';
import { Screen, Label, Btn, Chip } from '../hud';

const CLASS_BLURB: Record<'melee' | 'ranged', string> = {
  melee: 'Hydraulic limbs from decommissioned security units. Tough, and devastating up close.',
  ranged: 'Targeting optics from orbital maintenance rigs. Fragile, but hits from any range.',
};

export function DefeatScreen() {
  const { boss, bossLevel, progression, playerClass, classesUnlocked, rebirth } = useCombat();
  const [choice, setChoice] = useState<PlayerClass | null>(playerClass !== 'none' ? playerClass : null);
  // Classes became available on this death if the player is still unclassified
  const justUnlocked = classesUnlocked && playerClass === 'none';
  const canReboot = !classesUnlocked || choice !== null;

  return (
    <Screen footer={
      <Btn variant="primary" size="lg" className="w-full" disabled={!canReboot} onClick={() => rebirth(choice ?? undefined)}>
        {classesUnlocked ? (choice ? `Reboot as ${CLASS_DEFINITIONS[choice].name}` : 'Choose a profile') : 'Reboot'}
      </Btn>
    }>
      <div className="pointer-events-none absolute left-1/2 top-0 h-56 w-96 -translate-x-1/2 rounded-full bg-hostile/10 blur-3xl" />
      <div className="relative space-y-6 px-4 pb-6 pt-10">
        <header className="rise-in space-y-2 text-center">
          <Label className="animate-pulse text-hostile">Critical system failure</Label>
          <h1 className="font-display text-5xl font-semibold uppercase tracking-[0.14em] text-hostile">Terminated</h1>
          <p className="text-sm text-hud-dim">Neutralized by <span className="text-hostile">{boss.name}</span> at threat LV {bossLevel}.</p>
          <p className="font-mono text-[11px] uppercase tracking-wider text-hud-faint">Termination #{progression.deathCount + 1}</p>
        </header>

        <div className="border border-hud-line bg-hud-panel p-4 text-sm leading-relaxed text-hud-dim">
          <Label className="mb-1 text-sys">Neural backup restored</Label>
          Your mind carries over. The body does not: implants, credits, weapons and upgrades are lost, and you start again at threat level 1.
        </div>

        {classesUnlocked ? (
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label>Choose a combat profile</Label>
              {justUnlocked && <Chip tone="cred">Unlocked</Chip>}
            </div>
            {(['melee', 'ranged'] as const).map(c => {
              const def = CLASS_DEFINITIONS[c];
              const selected = choice === c;
              return (
                <button
                  key={c}
                  onClick={() => setChoice(c)}
                  aria-pressed={selected}
                  className={`flex w-full items-start gap-4 border p-4 text-left transition-colors ${selected ? (c === 'melee' ? 'border-cred bg-cred/5' : 'border-sys bg-sys/5') : 'border-hud-line bg-hud-panel hover:border-hud-dim'}`}
                >
                  <span className={`flex h-11 w-11 shrink-0 items-center justify-center border font-display text-lg font-bold ${selected ? (c === 'melee' ? 'border-cred text-cred' : 'border-sys text-sys') : 'border-hud-line text-hud-dim'}`}>
                    {c === 'melee' ? '⚔' : '⌖'}
                  </span>
                  <span className="min-w-0 flex-1 space-y-1">
                    <span className="block font-display text-base font-semibold uppercase tracking-wide text-hud-text">{def.name}</span>
                    <span className="block text-xs text-hud-dim">{CLASS_BLURB[c]}</span>
                    <span className="flex gap-4 font-mono text-[11px] text-hud-dim">
                      <span>HP <span className="text-hud-text">{def.baseHp}</span></span>
                      <span>ATK <span className="text-hud-text">{def.baseAttack}</span></span>
                      <span>DEF <span className="text-hud-text">{def.baseDefense}</span></span>
                    </span>
                    <span className="block font-mono text-[11px] text-aug">{def.specialAbility.name}: {def.specialAbility.description}</span>
                  </span>
                </button>
              );
            })}
          </div>
        ) : (
          <p className="text-center text-xs text-hud-faint">
            Reach threat level {CLASS_UNLOCK_LEVEL} before you fall to unlock combat profiles.
          </p>
        )}
      </div>
    </Screen>
  );
}
