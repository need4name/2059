import { useState } from 'react';
import { useCombat } from '@/lib/stores/useCombat';
import { CLASS_DEFINITIONS, createPlayer } from '@/lib/combat/actions';
import { useFirmware } from '@/lib/stores/useFirmware';
import { firmwareAttack, identityOf, levelOptions } from '@/lib/engine/firmware';
import type { PlayerClass } from '@/lib/combat/types';
import { Screen, Label, Btn, Chip, Glyph, Footprint, cx } from '../hud';
import { usePlayi } from '@/lib/stores/usePlayi';
import { playiNode, FALLBACK_ID, FALLBACK_NODE, perksFor } from '@/lib/engine/playi';
import { useAllies } from '@/lib/stores/useAllies';
import { availableFirmware } from '@/lib/stores/useCombat';
import { allyDef } from '@/lib/combat/allies';
import { dailyDay, dailyRecords, endDaily } from '@/lib/daily';
import { useMap } from '@/lib/stores/useMap';
import { wakePlaces, roomById } from '@/lib/engine/map';

const CLASS_BLURB: Partial<Record<PlayerClass, string>> = {
  none: 'No firmware: Strike and a clean slate. Upgrade trees cost a point less.',
  melee: 'Up close. Takes a beating.',
  ranged: 'Fragile. Hits down a line.',
  swift: 'Quick and light. Acts more often; in time, twice a turn.',
  crowd: 'Heavy. Hits everyone around it at once.',
};

export function DefeatScreen() {
  const { boss, playerClass, justOpened, rebirth } = useCombat();
  const { forks, setFork } = useFirmware();
  // Every firmware taken from a boss so far
  const choices = availableFirmware();
  const anyFirmware = choices.length > 0;
  // The firmware this host ran, else the first one opened: once one is open, a host always wakes with firmware
  const [choice, setChoice] = useState<PlayerClass | null>(choices.includes(playerClass) ? playerClass : choices[0] ?? null);
  const { offer, owned, pick } = usePlayi();
  const [learned, setLearned] = useState<string | null>(null);
  const [setPoint, setSetPoint] = useState<0 | 50>(0);
  // Where the next host wakes: the chapter's entry, or a server some host reached
  const places = wakePlaces(useMap());
  const [wakeAt, setWakeAt] = useState(places[0]);
  const canReboot = (!anyFirmware || choice !== null) && (!offer || learned !== null);
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
    if (learned === 'heat_2a') usePlayi.getState().chooseSetPoint(setPoint);
    allies.setParty(team.slice(0, slots), slots);
    rebirth(choice ?? undefined, wakeAt);
  };

  return (
    <Screen footer={
      <Btn variant="primary" size="lg" className="w-full" disabled={!canReboot} onClick={jump}>
        {offer && !learned ? 'Choose what stays' : anyFirmware && !choice ? 'Choose firmware' : 'Wake'}
      </Btn>
    }>
      <div className="relative space-y-6 px-4 pb-6 pt-12">
        <header className={cx('rise-in flex flex-col items-center gap-3 text-center', offer || unlocked.length || anyFirmware || places.length > 1 ? 'pt-8' : 'pt-[28vh]')}>
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

        {anyFirmware ? (
          <div className="space-y-2.5">
            <div className="flex items-center justify-between">
              <Label>Firmware</Label>
            </div>
            {choices.map(c => {
              const def = CLASS_DEFINITIONS[c];
              const selected = choice === c;
              const accent = c === 'melee' || c === 'crowd' ? 'cred' : 'sys';
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
                    <Glyph name={c === 'melee' ? 'arm' : c === 'ranged' ? 'eye' : c === 'swift' ? 'leg' : c === 'splice' ? 'implant' : c === 'wretch' ? 'spine' : c === 'none' ? 'signal' : 'allies'} size={22} />
                  </span>
                  <span className="min-w-0 flex-1 space-y-1.5">
                    <span className="flex items-center gap-2"><span className="font-display text-lg font-semibold text-white">{def.name}</span>{justOpened.includes(c) && <Chip tone="cred">New</Chip>}</span>
                    <span className="block text-sm text-hud-dim">{identityOf(c)?.rule ?? CLASS_BLURB[c]}</span>
                    {identityOf(c) && <span className="block text-xs text-orange-300/90">{identityOf(c)!.heat}</span>}
                    <span className="flex flex-wrap gap-1.5 text-xs font-semibold">
                      {(() => { const p = createPlayer(undefined, c); return [[p.maxHp, 'Health'], [p.maxStructuralHp, 'Structure'], [p.physicalAttack, 'Atk'], [p.physicalDefense, 'Def'], [p.structuralAttack, 'Sp. Atk'], [p.structuralDefense, 'Sp. Def'], [def.baseSpeed, 'Speed']] as const; })().map(([v, l]) => (
                        <span key={l} className="rounded-full bg-white/[0.06] px-2 py-0.5 text-hud-text">{v} {l}</span>
                      ))}
                    </span>
                    {(() => { const lv = useFirmware.getState().level(c); const att = firmwareAttack(c, lv); return att && att.name !== 'Strike' && (
                      <span className="flex items-center gap-2 text-xs text-aug"><Footprint action={att} className="shrink-0" /><span>Level {lv}. Strike becomes {att.name}: {att.description}</span></span>
                    ); })()}
                  </span>
                </button>
              );
            })}
          </div>
        ) : null}

        {learned === 'heat_2a' && (
          // Set point: the heat every fight starts at, chosen now
          <div className="flex gap-2">
            {([[0, 'Cold: start at 0'], [50, 'Warm: start at 50']] as const).map(([v, label]) => (
              <button key={v} onClick={() => setSetPoint(v)} aria-pressed={setPoint === v}
                className={cx('key flex-1 rounded-2xl px-3 py-2.5 text-[13px] font-semibold', setPoint === v ? 'key-selected text-white' : 'text-hud-text')}>{label}</button>
            ))}
          </div>
        )}

        {choice && choice !== 'none' && [4, 7, 10].some(lv => levelOptions(choice, lv)) && (
          // The chosen firmware's forks: set now, and they hold for the whole of the next host's life
          <div className="space-y-2.5">
            <Label>{CLASS_DEFINITIONS[choice].name}: forks</Label>
            {[4, 7, 10].map(lv => {
              const opts = levelOptions(choice, lv);
              if (!opts) return null;
              const taken = forks[choice]?.[lv] ?? 0;
              return (
                <div key={lv} className="flex items-start gap-2">
                  <span className="w-12 shrink-0 pt-2 text-xs font-semibold text-aug">Lv {lv}</span>
                  <div className="grid min-w-0 flex-1 grid-cols-2 gap-2">
                    {opts.map((o, side) => (
                      <button key={side} onClick={() => setFork(choice, lv, side as 0 | 1)} aria-pressed={taken === side}
                        className={cx('key rounded-2xl px-3 py-2 text-left text-[12.5px] leading-snug', taken === side ? 'key-selected text-white' : 'text-hud-dim')}>
                        {o.text}
                      </button>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {places.length > 1 && (
          <div className="space-y-2.5">
            <Label>Wake in</Label>
            <div className="flex flex-wrap gap-2">
              {places.map(id => (
                <button key={id} onClick={() => setWakeAt(id)} aria-pressed={wakeAt === id}
                  className={cx('key rounded-full px-4 py-2 text-[13px] font-semibold', wakeAt === id ? 'key-selected text-white' : 'text-hud-text')}>
                  {roomById(id).name}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </Screen>
  );
}

/** The end of today's run: one life, so the host's deepest level is the score. */
export function DailyEndScreen() {
  const { boss, hostBestThreat } = useCombat();
  const before = dailyDay ? dailyRecords()[dailyDay] : undefined;
  const newBest = !before || hostBestThreat > before.best;
  return (
    <Screen footer={<Btn variant="primary" size="lg" className="w-full" onClick={() => endDaily(hostBestThreat)}>Back to your own game</Btn>}>
      <div className="relative flex flex-col items-center gap-3 px-4 pt-[24vh] text-center">
        <Glyph name="signal" size={30} className="signal-pulse text-sys" />
        <h1 className="font-display text-[44px] font-bold leading-none tracking-tight text-white">Host lost</h1>
        <p className="text-[15px] text-hud-dim"><span style={{ color: boss.spriteColor }}>{boss.name}</span></p>
        <div className="slab mt-6 w-full max-w-xs rounded-[24px] p-5">
          <div className="text-sm text-hud-dim">Today's run, {dailyDay}</div>
          <div className="mt-1 font-display text-[34px] font-semibold text-white">Level {hostBestThreat}</div>
          <div className="mt-1 text-sm text-hud-faint">{newBest ? (before ? 'Your best today.' : 'Your first run today.') : `Your best today: level ${before!.best}`}</div>
        </div>
      </div>
    </Screen>
  );
}
