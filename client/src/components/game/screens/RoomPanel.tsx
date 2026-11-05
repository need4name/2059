import { useState } from 'react';
import { useCombat } from '@/lib/stores/useCombat';
import { useMap } from '@/lib/stores/useMap';
import { useAudio } from '@/lib/stores/useAudio';
import { useJournal } from '@/lib/stores/useJournal';
import { roomById, roomText, hasFight, exitState, allGoals, cacheReady, corpseHere, DIR_LABEL } from '@/lib/engine/map';
import { useInventory } from '@/lib/stores/useInventory';
import { useStrain } from '@/lib/stores/useStrain';
import { eventHere, cantChoose, partToGive } from '@/lib/engine/events';
import { powerOf } from '@/lib/combat/augments';
import { AUGMENTATION_SLOTS, type Item } from '@/lib/combat/types';
import { useAllies } from '@/lib/stores/useAllies';
import { usePlayi } from '@/lib/stores/usePlayi';
import { allyDef } from '@/lib/combat/allies';
import { getBossPreview, BOSS_DOSSIERS } from '@/lib/combat/actions';
import { Glyph, Label, cx } from '../hud';
import { SignalMap } from './SignalMap';

/** The room the signal is standing in: what's here, and the ways on (SignalMap, at the top, draws where it is). */
export function RoomPanel() {
  const map = useMap();
  const { progression, openMarket, openRoomCache, chooseEvent } = useCombat();
  const inv = useInventory();
  const shut = useStrain(s => s.active.includes('shut'));
  const allies = useAllies();
  const slots = usePlayi(s => s.perks)().allySlots;
  const room = roomById(map.room);
  const fight = hasFight(map, room);
  const enemy = room.threat !== undefined ? getBossPreview(room.threat, progression.deathCount === 0, room.enemy) : null;
  const [news, setNews] = useState<string | null>(null);
  const looked = map.looked.includes(room.id);
  const wakingHere = room.id === 'dock' && map.cleared.length === 0 && map.cameFrom === null;

  const doLook = () => {
    const found = map.look();
    if (room.look) useJournal.getState().addNote(`look:${room.id}`, room.look.text, room.name, progression.deathCount + 1);
    if (found) setNews(allGoals(useMap.getState()) ? 'Far off, something heavy shifts and opens.' : 'Something about this stays with you.');
  };

  const pill = 'key inline-flex items-center gap-2 rounded-full px-4 py-2 text-[13px] font-semibold text-hud-text';

  return (
    <div className="space-y-4">
      <section className="slab relative overflow-hidden rounded-[28px] px-5 pb-5 pt-0">
        <div className="-mx-5 mb-5 border-b border-black/60">
          <SignalMap />
        </div>
        <h1 className="font-display text-[26px] font-semibold leading-tight tracking-tight text-white">{room.name}</h1>
        {wakingHere && progression.deathCount > 0 && <p className="mt-2 text-sm text-sys">Another body. Another pair of eyes.</p>}
        <p className="mt-2.5 text-[15px] leading-relaxed text-hud-text/80">{roomText(map, room)}</p>

        {fight && enemy && (
          <div className="mt-5 border-l-2 pl-3.5" style={{ borderColor: `${enemy.color}aa` }}>
            <div className="font-display text-[17px] font-semibold" style={{ color: enemy.color }}>{enemy.name}</div>
            <p className="mt-1 text-sm leading-relaxed text-hud-text/70">{BOSS_DOSSIERS[enemy.name]}</p>
          </div>
        )}
        {!fight && room.threat !== undefined && <p className="mt-3 text-sm text-hud-faint">It's quiet here now.</p>}

        {room.look && !fight && looked && <p className="mt-4 border-l-2 border-sys/40 pl-3.5 text-sm italic leading-relaxed text-hud-text/75">{room.look.text}</p>}
        {((room.look && !fight && !looked) || cacheReady(map, room)) && (
          <div className="mt-4 flex flex-wrap gap-2">
            {room.look && !fight && !looked && <button onClick={doLook} className={pill}><Glyph name="eye" size={14} className="text-sys" />Look closer</button>}
            {cacheReady(map, room) && <button onClick={() => setNews(openRoomCache())} className={pill}>Search the cache</button>}
          </div>
        )}
        {corpseHere(map, room) && map.corpse && (
          <div className="mt-4 border-l-2 border-[#b4383f]/60 pl-3.5">
            <p className="text-sm leading-relaxed text-hud-text/75">A body lies here. You remember wearing it. Something is still fitted to it.</p>
            <button onClick={() => { const it = useMap.getState().takeCorpse(); if (it) { useInventory.getState().addItems([it]); useAudio.getState().play('cache'); setNews(`You take back ${it.name}.`); } }} className={cx(pill, 'mt-2.5')}>Take it back</button>
          </div>
        )}
        {news && <p className="mt-3 text-sm text-sys">{news}</p>}
      </section>

      {(() => {
        // A room event: once its fight is won, once per host
        const ev = eventHere(map, room);
        if (!ev) return null;
        const worn = AUGMENTATION_SLOTS.map(sl => inv.equippedAugmentations[sl]).filter((i): i is Item => !!i && !i.id.startsWith('frame_'));
        const hasPart = !!partToGive(inv.items, worn, powerOf);
        const costOf = (c: (typeof ev.choices)[number]) => [c.cost?.credits && `¤${c.cost.credits}`, c.cost?.health && `${c.cost.health} max health`, c.cost?.part && 'your weakest part', c.odds !== undefined && 'a risk'].filter(Boolean).join(' · ');
        return (
          <section className="slab space-y-3 rounded-[24px] p-4">
            <p className="text-[15px] leading-relaxed text-hud-text/85">{ev.text}</p>
            <div className="flex flex-wrap gap-2">
              {ev.choices.map((c, k) => {
                const why = cantChoose(c, inv.gold, hasPart);
                return (
                  <button key={k} disabled={!!why} onClick={() => setNews(chooseEvent(k))} className={cx(pill, 'flex-col items-start gap-0.5 rounded-[18px] text-left', why && 'opacity-50')}>
                    <span>{c.label}</span>
                    <span className="text-[11px] font-medium text-hud-faint">{why ?? (costOf(c) || 'free')}</span>
                  </button>
                );
              })}
            </div>
          </section>
        );
      })()}

      {room.ally && !fight && (() => {
        const def = allyDef(room.ally)!;
        const met = allies.met.includes(def.id);
        const along = allies.party.includes(def.id);
        const room4 = allies.party.length < slots;
        const join = () => { allies.meet(def.id); if (room4 && !along) allies.setParty([...allies.party, def.id], slots); };
        return (
          <section className="slab space-y-2 rounded-[24px] p-4" style={{ backgroundImage: `linear-gradient(135deg, ${def.color}1c, transparent 70%)` }}>
            <div className="font-display text-[15px] font-semibold" style={{ color: def.color }}>{met ? `${def.name} waits here` : def.name}</div>
            <p className="text-sm leading-relaxed text-hud-dim">{def.blurb}</p>
            {along ? <p className="text-sm text-hud-text">With you.</p>
              : !met ? <button onClick={join} className={pill}>Link</button>
              : room4 ? <button onClick={join} className={pill}>Bring {def.name} along</button>
              : <p className="text-xs text-hud-faint">No room in the link.</p>}
          </section>
        );
      })()}

      {room.market && shut && (
        <div className="slab flex w-full items-center gap-3.5 rounded-[20px] p-4 opacity-60">
          <Glyph name="market" size={22} className="shrink-0 text-hud-faint" />
          <span className="min-w-0 flex-1 font-display text-[15px] font-semibold text-hud-dim">Grey Lane</span>
          <span className="text-xs text-hud-faint">Shuttered</span>
        </div>
      )}
      {room.market && !shut && (
        <button onClick={openMarket} className="key flex w-full items-center gap-3.5 rounded-[20px] p-4 text-left"
          style={{ backgroundImage: 'linear-gradient(135deg, rgba(242,179,61,0.12), transparent 70%)' }}>
          <Glyph name="market" size={22} className="shrink-0 text-cred" />
          <span className="min-w-0 flex-1 font-display text-[15px] font-semibold text-hud-text">Grey Lane</span>
          <span className="text-lg text-hud-dim">›</span>
        </button>
      )}

      <section className="space-y-2">
        <Label className="px-1">Ways on</Label>
        <div className="space-y-2">
          {room.exits.map((e, i) => {
            const st = exitState(map, e);
            const familiar = map.visited.includes(e.to);
            return (
              <button key={`${e.dir}-${e.to}`} disabled={st !== 'open'} onClick={() => { setNews(null); map.go(i); useAudio.getState().play('door'); }}
                className={cx('flex w-full items-center gap-3 rounded-[18px] px-4 py-3 text-left',
                  st === 'open' ? 'key' : 'bg-white/[0.02] opacity-50')}>
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-2">
                    <span className="font-display text-[15px] font-semibold text-hud-text">{e.label ?? DIR_LABEL[e.dir] ?? e.dir}</span>
                    {familiar && st === 'open' && <span className="h-1 w-1 rounded-full bg-hud-faint" aria-label="been here" />}
                  </span>
                  <span className="block text-[13px] leading-snug text-hud-dim">
                    {st === 'blocked' ? `${enemy?.name ?? 'Something'} is in the way` : st === 'sealed' ? 'It won’t open. Not yet.' : e.hint}
                  </span>
                </span>
                {st === 'open' && <span className="text-lg text-hud-faint">›</span>}
              </button>
            );
          })}
        </div>
      </section>
    </div>
  );
}
