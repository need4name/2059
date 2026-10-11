import { useState } from 'react';
import { useCombat, CLASS_UNLOCK_LEVEL } from '@/lib/stores/useCombat';
import { CLASS_DEFINITIONS } from '@/lib/combat/actions';
import type { PlayerClass } from '@/lib/combat/types';
import { Screen, Card, Label, Btn, Chip, cx } from '../hud';

const CLASS_BLURB: Record<'melee' | 'ranged', string> = {
  melee: 'Enforcer firmware lifted from a Volkov operator chip. The new host fights up close and takes a beating.',
  ranged: 'Operative firmware cracked from a Kizuna targeting kernel. Fragile, but locks on from any range.',
};

export function DefeatScreen() {
  const { boss, bossLevel, progression, playerClass, classesUnlocked, rebirth } = useCombat();
  const [choice, setChoice] = useState<PlayerClass | null>(playerClass !== 'none' ? playerClass : null);
  const justUnlocked = classesUnlocked && playerClass === 'none';
  const canReboot = !classesUnlocked || choice !== null;

  return (
    <Screen footer={
      <Btn variant="primary" size="lg" className="w-full" disabled={!canReboot} onClick={() => rebirth(choice ?? undefined)}>
        {classesUnlocked ? (choice ? `Jump as ${CLASS_DEFINITIONS[choice].name}` : 'Pick firmware first') : 'Jump to a new host'}
      </Btn>
    }>
      <div className="pointer-events-none absolute left-1/2 top-0 h-64 w-80 -translate-x-1/2 rounded-full bg-hostile/15 blur-3xl" />
      <div className="relative space-y-6 px-4 pb-6 pt-12">
        <header className="rise-in space-y-2 text-center">
          <div className="text-sm font-semibold text-rose-300">Host lost</div>
          <h1 className="font-display text-5xl font-bold text-white">Flatline</h1>
          <p className="text-[15px] text-hud-dim">Taken down by <span className="text-rose-300">{boss.name}</span> at threat {bossLevel}.</p>
          <p className="text-xs text-hud-faint">Host #{progression.deathCount + 1} lost</p>
        </header>

        <Card className="space-y-1.5 p-4">
          <div className="text-sm font-semibold text-sys">The signal survives</div>
          <p className="text-sm leading-relaxed text-hud-dim">
            You were never really this body. Your signal slips out through its brain chip and into another grey-market chip on the rafts, back at threat 1. The implants, credits, weapons and upgrades stay with the corpse.
          </p>
        </Card>

        {classesUnlocked ? (
          <div className="space-y-2.5">
            <div className="flex items-center justify-between">
              <Label>Load operator firmware</Label>
              {justUnlocked && <Chip tone="cred">New!</Chip>}
            </div>
            {(['melee', 'ranged'] as const).map(c => {
              const def = CLASS_DEFINITIONS[c];
              const selected = choice === c;
              const accent = c === 'melee' ? 'cred' : 'sys';
              return (
                <button
                  key={c}
                  onClick={() => setChoice(c)}
                  aria-pressed={selected}
                  className={cx(
                    'flex w-full items-start gap-4 rounded-3xl p-4 text-left transition',
                    selected ? (accent === 'cred' ? 'bg-cred/10 ring-2 ring-cred/70' : 'bg-sys/10 ring-2 ring-sys/70') : 'bg-hud-panel/80 ring-1 ring-white/[0.05] hover:bg-white/[0.06]',
                  )}
                >
                  <span className={cx('flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl text-xl', selected ? (accent === 'cred' ? 'bg-cred/20 text-cred' : 'bg-sys/20 text-sys') : 'bg-white/[0.06] text-hud-dim')}>
                    {c === 'melee' ? '⚔' : '⌖'}
                  </span>
                  <span className="min-w-0 flex-1 space-y-1.5">
                    <span className="block font-display text-lg font-semibold text-white">{def.name}</span>
                    <span className="block text-sm text-hud-dim">{CLASS_BLURB[c]}</span>
                    <span className="flex gap-2 text-xs font-semibold">
                      <span className="rounded-full bg-white/[0.06] px-2 py-0.5 text-hud-text">{def.baseHp} HP</span>
                      <span className="rounded-full bg-white/[0.06] px-2 py-0.5 text-hud-text">{def.baseAttack} ATK</span>
                      <span className="rounded-full bg-white/[0.06] px-2 py-0.5 text-hud-text">{def.baseDefense} DEF</span>
                    </span>
                    <span className="block text-xs text-aug">{def.specialAbility.name}: {def.specialAbility.description}</span>
                  </span>
                </button>
              );
            })}
          </div>
        ) : (
          <p className="text-center text-sm text-hud-faint">
            Make it to threat {CLASS_UNLOCK_LEVEL} before you fall to unlock combat profiles.
          </p>
        )}
      </div>
    </Screen>
  );
}
