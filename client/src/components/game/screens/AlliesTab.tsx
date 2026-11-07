import { useState } from 'react';
import { useAllies } from '@/lib/stores/useAllies';
import { useInventory } from '@/lib/stores/useInventory';
import { usePlayi } from '@/lib/stores/usePlayi';
import { ALLIES, AFFINITY, allyMoves, allySlotFor, fitsAlly, kitItems, storySoFar, type AllyDef, type AllySlot } from '@/lib/combat/allies';
import { AUGMENTATION_SLOTS, type Item } from '@/lib/combat/types';
import { nameOf } from '../itemText';
import { Card, Btn, Label, Sheet, Footprint, RARITY_TEXT, cx } from '../hud';

const SLOT_TEXT: Record<AllySlot, { title: string; empty: string }> = {
  limb: { title: 'Active', empty: 'Empty' },
  other: { title: 'Passive', empty: 'Empty' },
};

function statLine(item: Item, mult = 1) {
  const bits: string[] = [];
  const add = (v: number | undefined, word: string) => { if (v) bits.push(`+${Math.round(v * mult)} ${word}`); };
  add(item.attackBonus, 'attack'); add(item.structuralAttackBonus, 'Sp. Atk');
  add(item.defenseBonus, 'defence'); add(item.structuralDefenseBonus, 'Sp. Def'); add(item.hpBonus, 'health');
  return bits.join(' · ') || 'No stats';
}

function AllyCard({ def }: { def: AllyDef }) {
  const allies = useAllies();
  const { level } = allies.progress(def.id);
  const gear = allies.gear[def.id] ?? {};
  const along = allies.party.includes(def.id);
  const [picking, setPicking] = useState<AllySlot | null>(null);
  const moves = allyMoves(def, level, gear);
  const kit = kitItems(def, level);

  return (
    <Card className="space-y-3 p-4">
      <header className="flex items-center gap-3">
        <span className="h-10 w-10 shrink-0 rounded-2xl" style={{ background: `${def.color}33`, boxShadow: `inset 0 0 0 2px ${def.color}66` }} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="font-display text-[16px] font-semibold text-white">{def.name}</span>
            <span className="text-xs text-hud-dim">Lv {level}</span>
          </div>
        </div>
        {along && <span className="rounded-full bg-ok/15 px-2.5 py-1 text-[11px] font-semibold text-ok">With you</span>}
      </header>

      <p className={cx('rounded-xl px-3 py-2 text-[13px] leading-snug', along ? 'bg-sys/10 text-hud-text' : 'bg-white/[0.03] text-hud-dim')}>
        {def.link}
      </p>

      {storySoFar(def, level).length > 0 && (
        <div className="space-y-1.5 border-l-2 pl-3" style={{ borderColor: `${def.color}66` }}>
          {storySoFar(def, level).map((line, k) => <p key={k} className="text-[13px] italic leading-snug text-hud-text/75">{line}</p>)}
        </div>
      )}

      {/* Its own preset implants, then the two you give it */}
      <div className="space-y-1.5">
        <div className="text-[11px] font-semibold text-hud-dim">Its own</div>
        {kit.map(it => (
          <div key={it.id} className="flex items-baseline justify-between gap-3">
            <span className={cx('min-w-0 break-words text-[13px] font-semibold leading-tight', RARITY_TEXT[it.rarity])}>{nameOf(it)}</span>
            <span className="shrink-0 text-[11px] text-hud-dim">{statLine(it)}</span>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-2 gap-2">
        {(['limb', 'other'] as AllySlot[]).map(slot => {
          const it = gear[slot];
          return (
            <button key={slot} onClick={() => setPicking(slot)} className="rounded-2xl bg-white/[0.04] p-3 text-left ring-1 ring-white/[0.05] hover:bg-white/[0.07]">
              <div className="text-[11px] font-semibold text-hud-dim">{SLOT_TEXT[slot].title}</div>
              {it ? (
                <>
                  <div className={cx('break-words text-[13px] font-semibold leading-tight', RARITY_TEXT[it.rarity])}>{nameOf(it)}</div>
                  <div className="text-[11px] text-hud-dim">{statLine(it, fitsAlly(def, it) ? AFFINITY.stats : 1)}</div>
                </>
              ) : <div className="text-[12px] leading-snug text-hud-dim">{SLOT_TEXT[slot].empty}</div>}
            </button>
          );
        })}
      </div>

      <div className="space-y-1.5">
        {moves.map((m, n) => (
          <div key={`${m.name}-${n}`} className="flex items-center gap-3 text-xs text-hud-dim">
            {m.effect === 'attack' ? <Footprint action={m} className="shrink-0" /> : <span className="h-[34px] w-[34px] shrink-0" />}
            <span className="text-hud-text">{m.name}</span>
          </div>
        ))}
      </div>

      <Sheet open={picking !== null} title={`${def.name}: ${picking ? SLOT_TEXT[picking].title.toLowerCase() : ''}`} onClose={() => setPicking(null)}>
        {picking && <Picker def={def} slot={picking} done={() => setPicking(null)} />}
      </Sheet>
    </Card>
  );
}

function Picker({ def, slot, done }: { def: AllyDef; slot: AllySlot; done: () => void }) {
  const allies = useAllies();
  const { items, equippedAugmentations } = useInventory();
  const worn = allies.gear[def.id]?.[slot];
  const onBody = AUGMENTATION_SLOTS.map(s => equippedAugmentations[s]).filter((i): i is Item => !!i);
  const choices = [...items, ...onBody].filter(i => allySlotFor(i) === slot)
    .sort((a, b) => Number(fitsAlly(def, b)) - Number(fitsAlly(def, a)));

  return (
    <div className="max-h-[60vh] space-y-2 overflow-y-auto px-5 pb-2">
      {worn && <Btn size="sm" className="w-full" onClick={() => { allies.takeImplant(def.id, slot); done(); }}>Take back {nameOf(worn)}</Btn>}
      {choices.length === 0 && <div className="rounded-2xl bg-white/[0.03] p-4 text-center text-[13px] text-hud-dim">Nothing fits.</div>}
      {choices.map(it => {
        const fit = fitsAlly(def, it);
        const installed = onBody.includes(it);
        return (
          <button key={it.id} onClick={() => { allies.giveImplant(def.id, it); done(); }} className="flex w-full items-center gap-3 rounded-2xl bg-white/[0.04] p-3 text-left hover:bg-white/[0.08]">
            <div className="min-w-0 flex-1">
              <div className={cx('break-words text-[13px] font-semibold leading-tight', RARITY_TEXT[it.rarity])}>{nameOf(it)}</div>
              <div className="text-[11px] text-hud-dim">{statLine(it, fit ? AFFINITY.stats : 1)}{installed ? ' · worn' : ''}</div>
            </div>
            {fit && <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-ok shadow-[0_0_8px_rgba(74,210,149,0.9)]" aria-label="suits them" />}
          </button>
        );
      })}
    </div>
  );
}

/** Allies the signal has met: what they do for you, and the implants they wear. */
export function AlliesTab() {
  const met = useAllies(s => s.met);
  const slots = usePlayi(s => s.perks)().allySlots;
  const roster = ALLIES.filter(a => met.includes(a.id));
  return (
    <div className="space-y-3 px-4 pb-6">
      <Label>With you: up to {slots}</Label>
      {roster.map(def => <AllyCard key={def.id} def={def} />)}
    </div>
  );
}
