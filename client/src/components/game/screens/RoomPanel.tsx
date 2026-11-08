import { nameOf } from '../itemText';
import { useEffect, useState } from 'react';
import { useCombat } from '@/lib/stores/useCombat';
import { useMap } from '@/lib/stores/useMap';
import { useAudio } from '@/lib/stores/useAudio';
import { useJournal } from '@/lib/stores/useJournal';
import { roomById, roomText, hasFight, exitState, cacheReady, corpseHere, canRest, DIR_LABEL } from '@/lib/engine/map';
import { useInventory } from '@/lib/stores/useInventory';
import { useStrain } from '@/lib/stores/useStrain';
import { firstLifeAt } from '@/lib/daily';
import { eventHere, cantChoose, partToGive } from '@/lib/engine/events';
import { powerOf } from '@/lib/combat/augments';
import { recallCost } from '@/lib/combat/economy';
import { AUGMENTATION_SLOTS, type Item } from '@/lib/combat/types';
import { useAllies } from '@/lib/stores/useAllies';
import { usePlayi } from '@/lib/stores/usePlayi';
import { allyDef } from '@/lib/combat/allies';
import { getBossPreview, BOSS_DOSSIERS } from '@/lib/combat/actions';
import { Glyph, Label, cx } from '../hud';
import { SignalMap, wayArrow } from './SignalMap';

/** The room the signal is standing in: what's here, and the ways on (SignalMap, at the top, draws where it is). */
export function RoomPanel() {
  const map = useMap();
  const { progression, openMarket, openRoomCache, chooseEvent, fightsStarted } = useCombat();
  const inv = useInventory();
  const shut = useStrain(s => s.active.includes('shut'));
  const allies = useAllies();
  const slots = usePlayi(s => s.perks)().allySlots;
  const room = roomById(map.room);
  const fight = hasFight(map, room);
  const enemy = room.threat !== undefined ? getBossPreview(room.threat, firstLifeAt(progression.deathCount, room.threat), room.enemy) : null;
  const [news, setNews] = useState<string | null>(null);
  const wakingHere = map.cameFrom === null && fightsStarted === 0 && map.cleared.length === 0;
  const [resting, setResting] = useState(false);

  // A goal is found once its room is clear: its line shows here, and the journal keeps it
  const goalHere = room.goal && !fight && map.goals.includes(room.goal.id) ? room.goal : null;
  useEffect(() => { if (goalHere) useJournal.getState().addNote(`look:${room.id}`, goalHere.text, room.name, progression.deathCount + 1); }, [goalHere, room.id, room.name, progression.deathCount]);

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

        {goalHere && <p className="mt-4 border-l-2 border-sys/40 pl-3.5 text-sm italic leading-relaxed text-hud-text/75">{goalHere.text}</p>}
        {cacheReady(map, room) && (
          <div className="mt-4 flex flex-wrap gap-2">
            <button onClick={() => setNews(openRoomCache())} className={pill}>Search the cache</button>
          </div>
        )}
        {corpseHere(map, room) && map.corpse && (
          <div className="mt-4 border-l-2 border-[#b4383f]/60 pl-3.5">
            <p className="text-sm leading-relaxed text-hud-text/75">A body lies here. You remember wearing it. Something is still fitted to it.</p>
            <button onClick={() => { const it = useMap.getState().takeCorpse(); if (it) { useInventory.getState().addItems([it]); useAudio.getState().play('cache'); setNews(`You take back ${nameOf(it)}.`); } }} className={cx(pill, 'mt-2.5')}>Take it back</button>
          </div>
        )}
        {news && <p className="mt-3 text-sm text-sys">{news}</p>}
      </section>

      {room.server && canRest(map, room) && (
        // A server: later hosts can wake here; resting heals, and brings this host's won fights back
        <section className="slab space-y-3 rounded-[24px] p-4" style={{ backgroundImage: 'linear-gradient(135deg, rgba(92,242,176,0.10), transparent 70%)' }}>
          <p className="text-[15px] leading-relaxed text-hud-text/85">{room.server}</p>
          {allies.met.length > 0 && (
            // Who rides with this host: change the link here, without waiting for a death
            <div className="space-y-1.5">
              <div className="text-xs text-hud-dim">With you: up to {slots}</div>
              <div className="flex flex-wrap gap-2">
                {allies.met.map(id => {
                  const def = allyDef(id); if (!def) return null;
                  const along = allies.party.includes(id);
                  const toggle = () => allies.setParty(along ? allies.party.filter(x => x !== id) : [...(allies.party.length >= slots ? allies.party.slice(1) : allies.party), id], slots);
                  return (
                    <button key={id} onClick={toggle} aria-pressed={along} className={cx(pill, along && 'key-selected text-white')}>
                      <span className="h-2.5 w-2.5 rounded-full" style={{ background: def.color }} />{def.name}
                    </button>
                  );
                })}
              </div>
            </div>
          )}
          {room.threat !== undefined && (() => {
            // The beaten boss can be called back, for a price, to fight again for its drop
            const cost = recallCost(room.threat);
            const who = getBossPreview(room.threat, false, room.enemy).name;
            return (
              <button disabled={inv.gold < cost} onClick={() => { if (useInventory.getState().spendGold(cost)) { useMap.getState().recall(); setNews(null); useAudio.getState().play('door'); } }}
                className={cx(pill, 'key-danger text-rose-300', inv.gold < cost && 'opacity-50')}>
                Call {who} back · ¤{cost}
              </button>
            );
          })()}
          {!resting ? <button onClick={() => setResting(true)} className={pill}><Glyph name="signal" size={14} className="text-[#5cf2b0]" />Rest</button>
            : (
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-sm text-hud-dim">You'll mend, and everything you've beaten will be back.</span>
                <button onClick={() => { useMap.getState().rest(); setResting(false); useAudio.getState().play('door'); setNews('You rest. The body mends. Out there, the rooms fill up again.'); }} className={pill}>Rest</button>
                <button onClick={() => setResting(false)} className={pill}>Not yet</button>
              </div>
            )}
        </section>
      )}

      {(() => {
        // A room event: once its fight is won, once per host
        const ev = eventHere(map, room);
        if (!ev) return null;
        const worn = AUGMENTATION_SLOTS.map(sl => inv.equippedAugmentations[sl]).filter((i): i is Item => !!i && !i.id.startsWith('frame_'));
        const hasPart = !!partToGive(inv.items, worn, powerOf);
        const costOf = (c: (typeof ev.choices)[number]) => [c.cost?.credits && `¤${c.cost.credits}`, c.cost?.health && `${c.cost.health} max health`, c.cost?.part && 'your weakest part', c.odds !== undefined && 'a risk'].filter(Boolean).join(' · ');
        return (
          // Someone here with an offer: a warm card of its own, so it never reads as more room text
          <section className="slab space-y-3 rounded-[24px] p-4 ring-1 ring-[#f2b33d]/40" style={{ backgroundColor: 'rgba(242,179,61,0.08)' }}>
            <div className="flex items-start gap-3">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-[#f2b33d]/20 text-[#f2b33d]"><Glyph name="allies" size={20} /></span>
              <p className="text-[15px] leading-relaxed text-hud-text">{ev.text}</p>
            </div>
            <div className="flex flex-wrap gap-2">
              {ev.choices.map((c, k) => {
                const why = cantChoose(c, inv.gold, hasPart);
                return (
                  <button key={k} disabled={!!why} onClick={() => setNews(chooseEvent(k))} className={cx('key inline-flex flex-col items-start gap-0.5 rounded-[18px] px-4 py-2 text-left text-[13px] font-semibold', why ? 'text-hud-dim' : 'key-gold text-[#2a1a02]')}>
                    <span>{c.label}</span>
                    <span className={cx('text-[11px] font-medium', why ? 'text-hud-faint' : 'text-[#2a1a02]/70')}>{why ?? (costOf(c) || 'free')}</span>
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
            const way = wayArrow(map.chapter, room.id, e.to);
            return (
              <button key={`${e.dir}-${e.to}`} disabled={st !== 'open'} onClick={() => { setNews(null); map.go(i); useAudio.getState().play('door'); }}
                className={cx('flex w-full items-center gap-3 rounded-[18px] px-4 py-3 text-left',
                  st === 'open' ? 'key' : 'bg-white/[0.02] opacity-50')}>
                {way && <Glyph name={way.glyph} flip={way.flip} size={16} className={cx('shrink-0', st === 'open' ? 'text-sys' : 'text-hud-faint')} />}
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-2">
                    {/* What the way is (its own name, else what lies along it); the arrow shows which way it runs */}
                    <span className="font-display text-[15px] font-semibold text-hud-text">{e.label ?? e.hint.replace(/^\w/, c => c.toUpperCase())}</span>
                    {!e.label && (e.dir === 'up' || e.dir === 'down') && <span className="rounded-full bg-white/[0.06] px-2 py-0.5 text-[11px] font-semibold text-hud-dim">{DIR_LABEL[e.dir]}</span>}
                    {familiar && st === 'open' && <span className="h-1 w-1 rounded-full bg-hud-faint" aria-label="been here" />}
                  </span>
                  <span className="block text-[13px] leading-snug text-hud-dim">
                    {st === 'blocked' ? `${enemy?.name ?? 'Something'} is in the way` : st === 'sealed' ? 'It won’t open. Not yet.' : e.label ? e.hint : null}
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
