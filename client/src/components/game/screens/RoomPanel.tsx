import { useState } from 'react';
import { useCombat } from '@/lib/stores/useCombat';
import { useMap } from '@/lib/stores/useMap';
import { useAudio } from '@/lib/stores/useAudio';
import { useJournal } from '@/lib/stores/useJournal';
import { roomById, roomText, hasFight, exitState, allGoals, cacheReady, DIR_LABEL } from '@/lib/engine/map';
import { useAllies } from '@/lib/stores/useAllies';
import { usePlayi } from '@/lib/stores/usePlayi';
import { allyDef } from '@/lib/combat/allies';
import { getBossPreview, BOSS_DOSSIERS } from '@/lib/combat/actions';
import { Glyph, Label, cx } from '../hud';

/** The room the signal is standing in: what's here, and the ways on. The map itself is never shown. */
export function RoomPanel() {
  const map = useMap();
  const { progression, openMarket, openRoomCache } = useCombat();
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
      <section className="slab relative overflow-hidden rounded-[28px] px-5 pb-5 pt-6"
        style={fight && enemy ? { backgroundImage: `radial-gradient(120% 80% at 100% 0%, ${enemy.color}2e, transparent 60%)` } : undefined}>
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
        {news && <p className="mt-3 text-sm text-sys">{news}</p>}
      </section>

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

      {room.market && (
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
