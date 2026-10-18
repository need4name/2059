import { useState } from 'react';
import { useCombat } from '@/lib/stores/useCombat';
import { useMap } from '@/lib/stores/useMap';
import { useAudio } from '@/lib/stores/useAudio';
import { useJournal } from '@/lib/stores/useJournal';
import { roomById, roomText, hasFight, exitState, allGoals, cacheReady, DIR_LABEL } from '@/lib/engine/map';
import { useAllies } from '@/lib/stores/useAllies';
import { usePlayi } from '@/lib/stores/usePlayi';
import { allyDef } from '@/lib/combat/allies';
import { getBossPreview, BOSS_DOSSIERS, ENEMY_GRADES, enemyGradeAt, enemyImplantCount } from '@/lib/combat/actions';
import { Chip, cx } from '../hud';

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

  return (
    <div className="space-y-3">
      <div className="relative overflow-hidden rounded-3xl bg-hud-panel/90 p-5 ring-1 ring-white/[0.06]"
        style={fight && enemy ? { background: `linear-gradient(135deg, ${enemy.color}26 0%, rgba(15,21,34,0.94) 60%)` } : undefined}>
        <div className="font-display text-[22px] font-semibold leading-tight text-white">{room.name}</div>
        {wakingHere && progression.deathCount > 0 && <p className="mt-1.5 text-sm text-sys">Another body. Another pair of eyes.</p>}
        <p className="mt-1.5 text-[15px] leading-relaxed text-hud-text/85">{roomText(map, room)}</p>

        {fight && enemy && (() => { const g = ENEMY_GRADES[enemyGradeAt(room.threat!)]; const n = enemyImplantCount(room.threat!); return (
          <div className="mt-4 space-y-1.5 rounded-2xl bg-black/25 p-3.5">
            <div className="flex items-center justify-between gap-2">
              <span className="font-display text-[17px] font-semibold" style={{ color: enemy.color }}>{enemy.name}</span>
              <Chip tone="hostile">Threat {room.threat}</Chip>
            </div>
            <p className="text-sm leading-relaxed text-hud-text/75">{BOSS_DOSSIERS[enemy.name]}</p>
            <div className="flex flex-wrap items-center gap-2 text-xs text-hud-dim">
              <span className="rounded-full px-2 py-0.5 font-semibold" style={{ background: `${g.color}22`, color: g.color }}>{g.name}</span>
              <span>Carries {n} implant{n === 1 ? '' : 's'}</span>
              <span>· About {enemy.hp} HP</span>
            </div>
          </div>
        ); })()}
        {!fight && room.threat !== undefined && <p className="mt-3 text-sm text-hud-faint">It's quiet here now.</p>}

        {room.look && !fight && (looked
          ? <p className="mt-3 text-sm italic leading-relaxed text-hud-text/80">{room.look.text}</p>
          : <button onClick={doLook} className="mt-3 rounded-2xl bg-white/[0.07] px-4 py-2.5 text-sm font-semibold text-hud-text transition hover:bg-white/[0.11]">Look closer</button>)}
        {cacheReady(map, room) && (
          <button onClick={() => setNews(openRoomCache())} className="mt-3 ml-2 rounded-2xl bg-white/[0.07] px-4 py-2.5 text-sm font-semibold text-hud-text transition hover:bg-white/[0.11]">Search the cache</button>
        )}
        {news && <p className="mt-2 text-sm text-sys">{news}</p>}
      </div>

      {room.ally && !fight && (() => {
        const def = allyDef(room.ally)!;
        const met = allies.met.includes(def.id);
        const along = allies.party.includes(def.id);
        const room4 = allies.party.length < slots;
        const join = () => { allies.meet(def.id); if (room4 && !along) allies.setParty([...allies.party, def.id], slots); };
        return (
          <div className="space-y-2 rounded-3xl p-4" style={{ background: `${def.color}14`, boxShadow: `inset 0 0 0 1px ${def.color}55` }}>
            <div className="text-sm font-semibold" style={{ color: def.color }}>{met ? `${def.name} waits here` : `Someone is here: ${def.name}`}</div>
            <p className="text-sm leading-relaxed text-hud-dim">{def.blurb}</p>
            <p className="text-xs text-hud-faint">{def.role} · {def.moves.map(m => m.name).join(' · ')}</p>
            {along ? <p className="text-sm text-hud-text">{def.name} is with this host.</p>
              : !met ? <button onClick={join} className="rounded-2xl bg-white/[0.08] px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-white/[0.14]">Link with {def.name}</button>
              : room4 ? <button onClick={join} className="rounded-2xl bg-white/[0.08] px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-white/[0.14]">Bring {def.name} along</button>
              : <p className="text-xs text-hud-faint">Your link is full. Choose {def.name} when a new host wakes.</p>}
          </div>
        );
      })()}

      {room.market && (
        <button onClick={openMarket} className="flex w-full items-center gap-3 rounded-3xl bg-cred/[0.07] p-4 text-left ring-1 ring-cred/20 transition hover:bg-cred/10">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-cred/10 text-xl">🛒</span>
          <span className="min-w-0 flex-1">
            <span className="block font-display text-[15px] font-semibold text-hud-text">Grey Lane market</span>
            <span className="block text-xs text-hud-dim">Buy and sell implants, stims and weapons</span>
          </span>
          <span className="text-hud-dim">›</span>
        </button>
      )}

      <div className="space-y-2">
        <div className="px-1 text-sm font-semibold text-hud-dim">Ways on</div>
        <div className="grid grid-cols-2 gap-2">
          {room.exits.map((e, i) => {
            const st = exitState(map, e);
            const familiar = map.visited.includes(e.to);
            return (
              <button key={`${e.dir}-${e.to}`} disabled={st !== 'open'} onClick={() => { setNews(null); map.go(i); useAudio.getState().play('door'); }}
                className={cx('flex min-h-[72px] flex-col justify-center rounded-2xl px-3.5 py-2.5 text-left transition',
                  st === 'open' ? 'bg-white/[0.06] ring-1 ring-white/[0.06] hover:bg-sys/10 hover:ring-sys/40' : 'bg-white/[0.02] opacity-55')}>
                <span className="flex items-center gap-2">
                  <span className="font-display text-[15px] font-semibold text-hud-text">{e.label ?? DIR_LABEL[e.dir] ?? e.dir}</span>
                  {familiar && st === 'open' && <span className="text-[10px] text-hud-faint">familiar</span>}
                </span>
                <span className="text-[12px] leading-snug text-hud-dim">
                  {st === 'blocked' ? `${enemy?.name ?? 'Something'} is in the way` : st === 'sealed' ? 'It won’t open. Not yet.' : e.hint}
                </span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
