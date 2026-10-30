import { useState } from 'react';
import { useCombat } from '@/lib/stores/useCombat';
import { CLASS_DEFINITIONS } from '@/lib/combat/actions';
import type { PlayerClass } from '@/lib/combat/types';
import { Screen, Label, Btn, Chip, Glyph, cx } from '../hud';
import { usePlayi } from '@/lib/stores/usePlayi';
import { playiNode, FALLBACK_ID, FALLBACK_NODE, perksFor } from '@/lib/engine/playi';
import { useAllies } from '@/lib/stores/useAllies';
import { allyDef } from '@/lib/combat/allies';

const CLASS_BLURB: Record<'melee' | 'ranged', string> = {
  melee: 'Up close. Takes a beating.',
  ranged: 'Fragile. Locks on from any range.',
};

export function DefeatScreen() {
  const { boss, playerClass, classesUnlocked, rebirth } = useCombat();
  const [choice, setChoice] = useState<PlayerClass | null>(playerClass !== 'none' ? playerClass : null);
  const justUnlocked = classesUnlocked && playerClass === 'none';
  const { offer, owned, pick } = usePlayi();
  const [learned, setLearned] = useState<string | null>(null);
  const canReboot = (!classesUnlocked || choice !== null) && (!offer || learned !== null);
  // Allies: who links with the next host (Second link allows two)
  const allies = useAllies();
  const unlocked = allies.unlocked();
  const slots = perksFor(learned ? [...owned, learned] : owned).allySlots;
  const [team, setTeam] = useState<string[]>(() => {
    const kept = allies.party.filter(id => unlocked.includes(id));
    if (kept.length || !unlocked.length) return kept;
    return [unlocked.slice().sort((a, b) => allies.progress(b).level - allies.progress(a).level)[0]];
  });
  const toggleAlly = (id: string) => setTeam(t => t.includes(id) ? t.filter(x => x !== id) : [...(t.length >= slots ? t.slice(1) : t), id]);
  const jump = () => {
    if (offer && learned) pick(learned);
    allies.setParty(team.slice(0, slots), slots);
    rebirth(choice ?? undefined);
  };

  return (
    <Screen footer={
      <Btn variant="primary" size="lg" className="w-full" disabled={!canReboot} onClick={jump}>
        {offer && !learned ? 'Choose what stays' : classesUnlocked && !choice ? 'Choose firmware' : 'Wake'}
      </Btn>
    }>
      <div className="pointer-events-none absolute left-1/2 top-0 h-64 w-80 -translate-x-1/2 rounded-full bg-hostile/15 blur-3xl" />
      <div className="relative space-y-6 px-4 pb-6 pt-12">
        <header className={cx('rise-in flex flex-col items-center gap-3 text-center', offer || unlocked.length || classesUnlocked ? 'pt-8' : 'pt-[28vh]')}>
          <Glyph name="signal" size={30} className="signal-pulse text-sys" />
          <h1 className="font-display text-[44px] font-bold leading-none tracking-tight text-white drop-shadow-[0_0_24px_rgba(240,82,79,0.35)]">Host lost</h1>
          <p className="text-[15px] text-hud-dim"><span style={{ color: boss.spriteColor }}>{boss.name}</span></p>
        </header>

        {offer && (
          <div className="space-y-2.5">
            <Label>Something stays</Label>
            <div className="grid grid-cols-1 gap-2">
              {offer.map((id, k) => {
                const node = id === FALLBACK_ID ? FALLBACK_NODE : playiNode(id)!;
                const selected = learned === id && (offer.indexOf(id) === k);
                return (
                  <button key={`${id}-${k}`} onClick={() => setLearned(id)} aria-pressed={selected}
                    className={cx('flex w-full items-start gap-3.5 rounded-3xl p-4 text-left transition', selected ? 'bg-sys/10 ring-2 ring-sys/70' : 'bg-hud-panel/80 ring-1 ring-white/[0.05] hover:bg-white/[0.06]')}>
                    <span className={cx('flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl', selected ? 'bg-sys/20 text-sys' : 'bg-white/[0.06] text-hud-dim')}><Glyph name="signal" size={20} /></span>
                    <span className="min-w-0 flex-1 space-y-1">
                      <span className="flex flex-wrap items-center gap-2">
                        <span className="font-display text-[16px] font-semibold text-white">{node.name}</span>
                        {node.capstone && <Chip tone="cred">Capstone</Chip>}
                      </span>
                      <span className="block text-sm text-hud-text">{node.effect}</span>
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {unlocked.length > 0 && (
          <div className="space-y-2.5">
            <Label>Who comes</Label>
            <div className="grid grid-cols-1 gap-2">
              {unlocked.map(id => {
                const def = allyDef(id)!;
                const { level } = allies.progress(id);
                const selected = team.includes(id);
                return (
                  <button key={id} onClick={() => toggleAlly(id)} aria-pressed={selected}
                    className={cx('flex w-full items-start gap-3.5 rounded-3xl p-4 text-left transition', selected ? 'bg-white/[0.08] ring-2' : 'bg-hud-panel/80 ring-1 ring-white/[0.05] hover:bg-white/[0.06]')}
                    style={selected ? { boxShadow: `0 0 0 2px ${def.color}` } : undefined}>
                    <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl font-display text-lg font-bold" style={{ background: `${def.color}22`, color: def.color }}>{def.name[0]}</span>
                    <span className="min-w-0 flex-1 space-y-1">
                      <span className="flex flex-wrap items-center gap-2">
                        <span className="font-display text-[16px] font-semibold text-white">{def.name}</span>
                        <span className="text-xs text-hud-faint">Lv {level}</span>
                      </span>
                      <span className="block text-sm text-hud-dim">{def.blurb}</span>
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {classesUnlocked ? (
          <div className="space-y-2.5">
            <div className="flex items-center justify-between">
              <Label>Firmware</Label>
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
        ) : null}
      </div>
    </Screen>
  );
}
