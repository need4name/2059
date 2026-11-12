import { useEffect, useRef, useState } from 'react';
import { useInventory } from '@/lib/stores/useInventory';
import { useAugmentTrees, nodesOf } from '@/lib/stores/useAugmentTrees';
import { depthIn } from '@/lib/engine/upgrades';
import { AUGMENTATION_SLOTS, AUGMENTATION_SLOT_NAMES, AugmentationSlot, Item } from '@/lib/combat/types';
import { Btn, Card, Label, RARITY_TEXT, RARITY_GLOW, RARITY_DOT, Footprint, SlotIcon, cx } from './hud';
import { implantStats, passiveText, conditionText, stimInfo, rangeText, effectsText, defendText, nameOf } from './itemText';
import { augmentKind } from '@/lib/combat/types';
import { actionForItem, structureOf, healthCostOf, makerOf, MAKER_INFO, partsText, quirkOf, canSplice, type Maker } from '@/lib/combat/augments';
import { useCombat } from '@/lib/stores/useCombat';
import { useFirmware } from '@/lib/stores/useFirmware';
import { withClass } from '@/lib/engine/firmware';
import { NO_PERKS } from '@/lib/engine/playi';
import { DRIVE } from '@/lib/engine/fight';
import { getRarityColor } from '@/lib/combat/loot';
import { hologram, slotAnchors, FRAMES, type DollSpec } from '@/lib/rendering/dolls';
import { hostDoll } from '@/lib/rendering/dollSpecs';

// ── Body map ─────────────────────────────────────────────────────────────────
// A ripperdoc view: the host's own body in the middle (its firmware's shape, as a
// scanner hologram, with what it has fitted in its own plastic), each implant slot
// marked where it sits on that body, and a card per slot down each side joined to it.
// Coordinates are in a 360 x 430 box; the cards are placed by percentage.

const VB = { w: 360, h: 430 };
const CARD_W = 106;
type Spot = { slot: AugmentationSlot; side: 'left' | 'right'; cardY: number };
const SPOTS: Spot[] = [
  { slot: 'brain', side: 'left', cardY: 34 },
  { slot: 'eyes', side: 'left', cardY: 112 },
  { slot: 'lungs', side: 'left', cardY: 190 },
  { slot: 'left_arm', side: 'left', cardY: 268 },
  { slot: 'left_leg', side: 'left', cardY: 380 },
  { slot: 'ears', side: 'right', cardY: 34 },
  { slot: 'nose', side: 'right', cardY: 112 },
  { slot: 'misc', side: 'right', cardY: 190 },
  { slot: 'right_arm', side: 'right', cardY: 268 },
  { slot: 'right_leg', side: 'right', cardY: 380 },
];

const SHORT_NAME: Record<AugmentationSlot, string> = {
  brain: 'Brain', ears: 'Ears', eyes: 'Eyes', nose: 'Nose', lungs: 'Lungs', misc: 'Spine',
  left_arm: 'L arm', right_arm: 'R arm', left_leg: 'L leg', right_leg: 'R leg',
};

/** This host's body as a scanner hologram: its firmware's shape, with what it has fitted in its own plastic (dolls.ts). */
function PixelBody({ spec }: { spec: DollSpec }) {
  const key = JSON.stringify(spec);
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = ref.current; if (!canvas) return;
    const { S, c } = hologram(spec);
    canvas.width = S; canvas.height = S;
    const g = canvas.getContext('2d')!;
    g.clearRect(0, 0, S, S);
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) { const col = c[y][x]; if (col) { g.fillStyle = col; g.fillRect(x, y, 1, 1); } }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  // A square the width of the box, centred top to bottom (the same placement BodyMap uses for its markers)
  return <canvas ref={ref} className="absolute" style={{ left: `${(BODY.x / VB.w) * 100}%`, top: `${(BODY.y / VB.h) * 100}%`, width: `${(BODY.size / VB.w) * 100}%`, aspectRatio: '1 / 1', imageRendering: 'pixelated' }} aria-hidden />;
}
/** Where the hologram sits in the 360 x 430 box: between the two columns of cards, feet clear of the bottom. */
const BODY = { x: 45, y: 42, size: 270 };
const toBox = (S: number, p: { x: number; y: number }): [number, number] => [BODY.x + (p.x + 0.5) * (BODY.size / S), BODY.y + (p.y + 0.5) * (BODY.size / S)];

function BodyMap({ selected, onSelect, spareFor }: { selected: AugmentationSlot | null; onSelect: (s: AugmentationSlot | null) => void; spareFor: (s: AugmentationSlot) => boolean }) {
  const { equippedAugmentations } = useInventory();
  const playerClass = useCombat(st => st.playerClass);
  const owned = useAugmentTrees(st => st.owned);
  // The body this host wakes in (its firmware's), wearing what it has fitted; markers land on its parts
  const spec = hostDoll(playerClass, equippedAugmentations as Record<string, Item | null>, it => owned[it.id]?.length ?? 0);
  const anchors = slotAnchors(spec), S = FRAMES[spec.frame].S;
  const spots = SPOTS.map(sp => ({ ...sp, at: toBox(S, anchors[sp.slot]) }));
  return (
    <div className="relative w-full" style={{ aspectRatio: `${VB.w} / ${VB.h}` }}>
      <PixelBody spec={spec} />
      <svg viewBox={`0 0 ${VB.w} ${VB.h}`} className="absolute inset-0 h-full w-full" aria-hidden="true">
        {spots.map(sp => {
          const eq = equippedAugmentations[sp.slot];
          const color = eq ? getRarityColor(eq.rarity) : 'rgba(255,255,255,0.28)';
          const on = selected === sp.slot;
          const x = sp.side === 'left' ? CARD_W : VB.w - CARD_W;
          return (
            <g key={sp.slot}>
              <path d={`M${x} ${sp.cardY} L${(x + sp.at[0]) / 2} ${sp.cardY} L${sp.at[0]} ${sp.at[1]}`} fill="none"
                stroke={on ? '#38d6f0' : eq ? color : 'rgba(255,255,255,0.14)'} strokeWidth={on ? 1.6 : 1} strokeOpacity={on ? 1 : 0.7} />
              {on && <circle cx={sp.at[0]} cy={sp.at[1]} r="10" fill="rgba(56,214,240,0.18)" />}
              <circle cx={sp.at[0]} cy={sp.at[1]} r={eq ? 4.5 : 3.5} fill={eq ? color : '#0b1220'} stroke={on ? '#38d6f0' : color} strokeWidth="1.5" />
            </g>
          );
        })}
      </svg>
      {SPOTS.map(sp => {
        const eq = equippedAugmentations[sp.slot];
        const on = selected === sp.slot;
        const kind = augmentKind(sp.slot);
        return (
          <button key={sp.slot} onClick={() => onSelect(on ? null : sp.slot)} aria-pressed={on}
            className={cx('absolute flex -translate-y-1/2 flex-col rounded-2xl px-2.5 py-2 text-left',
              on ? 'key key-selected' : 'key')}
            style={{ width: `${(CARD_W / VB.w) * 100}%`, top: `${(sp.cardY / VB.h) * 100}%`, ...(sp.side === 'left' ? { left: 0 } : { right: 0 }) }}>
            <span className="flex items-center gap-1 text-[11px] font-semibold text-hud-dim">
              <SlotIcon slot={sp.slot} size={13} />
              <span className="truncate">{SHORT_NAME[sp.slot]}</span>
              <span className={cx('ml-auto h-1.5 w-1.5 shrink-0 rounded-full', kind === 'active' ? 'bg-ok' : 'bg-white/25')} title={kind === 'active' ? 'Active: gives a combat move' : 'Passive: always-on stats'} />
            </span>
            <span className={cx('mt-0.5 line-clamp-2 break-words text-[11px] font-semibold leading-tight', eq ? RARITY_TEXT[eq.rarity] : 'text-hud-faint')}>
              {eq ? nameOf(eq) : 'Empty'}
            </span>
            {eq && <UpgradeDots item={eq} className="mt-1" />}
            {spareFor(sp.slot) && <span className="absolute -right-1 -top-1 h-2.5 w-2.5 rounded-full bg-cred shadow-[0_0_8px_rgba(242,179,61,0.8)]" title="Spare implant for this slot" />}
          </button>
        );
      })}
    </div>
  );
}

/** How far an implant has been upgraded: one dot per level of its tree, gold where taken. */
function UpgradeDots({ item, className }: { item: Item; className?: string }) {
  const owned = useAugmentTrees(st => st.owned[item.id]);
  const tree = nodesOf(item);
  if (!tree) return null;
  const levels = Math.max(...tree.map(n => depthIn(tree, n.id))) + 1;
  const n = owned?.length ?? 0;
  return (
    <span className={cx('flex items-center gap-0.5', className)} aria-label={`Upgraded ${n} of ${levels}`} title={`Upgraded ${n} of ${levels}`}>
      {Array.from({ length: levels }, (_, k) => <span key={k} className={cx('h-1 w-2.5 rounded-full', k < n ? 'bg-cred' : 'bg-white/10')} />)}
    </span>
  );
}

function ImplantRow({ item, action, startOpen = false }: { item: Item; action: React.ReactNode; startOpen?: boolean }) {
  const [open, setOpen] = useState(startOpen);
  const passive = passiveText(item);
  const condition = conditionText(item);
  const kind = item.slot ? augmentKind(item.slot) : 'passive';
  const move = actionForItem(item);
  const cost = healthCostOf(item);
  const maker = MAKER_INFO[makerOf(item)];
  const parts = partsText(item);
  return (
    <div className={cx('overflow-hidden rounded-2xl bg-gradient-to-r to-transparent ring-1 ring-white/[0.05]', RARITY_GLOW[item.rarity])}>
      <div className="flex items-center gap-3 px-3 py-3">
        <button className="flex min-w-0 flex-1 items-center gap-3 text-left" onClick={() => setOpen(o => !o)} aria-expanded={open}>
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-black/25 text-xl">
            <SlotIcon slot={item.slot} />
          </span>
          <span className="min-w-0 flex-1">
            <span className="flex items-center gap-2"><span className={cx('min-w-0 break-words text-sm font-semibold leading-tight', RARITY_TEXT[item.rarity])}>{nameOf(item)}</span><UpgradeDots item={item} className="shrink-0" /></span>
            <span className="flex items-center gap-1.5 text-xs text-hud-dim">
              <span className={cx('shrink-0 rounded-full px-1.5 py-px text-[10px] font-semibold', kind === 'active' ? 'bg-ok/10 text-ok' : 'bg-white/[0.06] text-hud-dim')}>{kind === 'active' ? 'Active' : 'Passive'}</span>
              {DRIVE[makerOf(item)] !== 0 && <span className={cx('shrink-0 rounded-full px-1.5 py-px text-[10px] font-semibold', DRIVE[makerOf(item)] > 0 ? 'bg-amber-300/10 text-amber-200' : 'bg-white/[0.06] text-hud-dim')}>{DRIVE[makerOf(item)] > 0 ? '+' : ''}{DRIVE[makerOf(item)]} speed</span>}
              <span className="truncate">{implantStats(item)}{cost > 0 && <span className="text-hostile"> · −{cost} HP</span>}</span>
            </span>
            {parts && <span className="block truncate text-[11px] text-ok/90">{parts}</span>}
            {quirkOf(item) && <span className="block truncate text-[11px] font-semibold text-cred">{quirkOf(item)}</span>}
          </span>
        </button>
        {action}
      </div>
      {open && (
        <div className="space-y-1 px-4 pb-3.5 text-[13px] leading-relaxed">
          <div className="flex items-center gap-1.5 text-xs capitalize text-hud-dim">
            <span className={cx('h-1.5 w-1.5 rounded-full', RARITY_DOT[item.rarity])} />
            {item.rarity} · {item.slot ? AUGMENTATION_SLOT_NAMES[item.slot] : ''}
          </div>
          {move && (
            <div className="flex items-start gap-3 text-ok">
              {move.type === 'attack' && <Footprint action={move} cell={5} className="mt-0.5 shrink-0" />}
              <div>
                Combat move: <span className="font-semibold">{move.name}</span>
                {move.damage ? ` · ${move.damage} damage` : ` · +${move.defenseBoost} guard`} · {(move.heatGenerated ?? 0) > 0 ? '+' : ''}{move.heatGenerated} heat
                {move.type === 'attack' && <div className="text-xs text-hud-dim">{rangeText(move)}{effectsText(move) ? ` · ${effectsText(move)}` : ''}</div>}
                {move.defend && <div className="text-xs text-hud-dim">{defendText(move)}</div>}
              </div>
            </div>
          )}
          {kind === 'passive' && <div className="text-hud-dim">Passive: always-on stats, no combat move.</div>}
          <div className="text-hud-dim">Adds {structureOf(item)} structure{cost > 0 ? <span className="text-hostile"> · costs {cost} max health</span> : null}</div>
          <div className={cx('text-xs', maker.tone)}>{maker.label}: <span className="text-hud-dim">{maker.blurb}</span></div>
          {passive && <div className="text-sys">{passive}</div>}
          {condition && <div className="text-orange-300">{condition}</div>}
          {item.description && <p className="italic text-hud-dim">{item.description}</p>}
        </div>
      )}
    </div>
  );
}

export function Inventory() {
  const { items, equippedAugmentations, equipAugmentation, unequipAugmentation, getTotalAugmentationBonuses, spliced, spliceIn, unsplice, seen, markSeen } = useInventory();
  // Splice firmware: passive slots can hold a second, compatible implant
  const splicing = useCombat(st => st.playerClass === 'splice');
  const spliceLevel = useFirmware(st => st.level('splice'));
  useFirmware(st => st.forks); // the limit follows the forks taken
  const pairLimit = withClass(NO_PERKS, 'splice', spliceLevel).splicePairs;
  const pairsNow = Object.values(spliced ?? {}).filter(Boolean).length;
  const canSpliceIn = (item: Item) => splicing && !!item.slot && !!equippedAugmentations[item.slot] && canSplice(equippedAugmentations[item.slot]!, item)
    && (pairsNow < pairLimit || !!spliced?.[item.slot]);
  const { getTreeStatBonuses } = useAugmentTrees();
  const [filter, setFilter] = useState<AugmentationSlot | null>(null);

  const equippedSlots = AUGMENTATION_SLOTS.filter(s => equippedAugmentations[s] !== null);
  const totals = getTotalAugmentationBonuses();
  const tree = getTreeStatBonuses(equippedSlots);
  const augmentations = items.filter(i => i.type === 'augmentation');
  const consumables = items.filter(i => i.type === 'consumable');
  // New implants (not yet seen here) have their own tab; once seen they join the spares, which can be filtered
  const fresh = augmentations.filter(i => !seen.includes(i.id));
  const spares = augmentations.filter(i => seen.includes(i.id));
  const [tab, setTab] = useState<'new' | 'spare'>(fresh.length ? 'new' : 'spare');
  const [kind, setKind] = useState<'all' | 'active' | 'passive'>('all');
  const [maker, setMaker] = useState<Maker | null>(null);
  const [rarity, setRarity] = useState<Item['rarity'] | null>(null);
  const [sort, setSort] = useState<'newest' | 'rarest'>('newest');
  // What was new counts as seen once you leave the page, or go to the spares
  const freshIds = useRef<string[]>([]);
  freshIds.current = fresh.map(i => i.id);
  useEffect(() => () => useInventory.getState().markSeen(freshIds.current), []);
  const showSpares = () => { markSeen(freshIds.current); setTab('spare'); };
  const RANK = ['legendary', 'epic', 'rare', 'uncommon', 'common'];
  const bySlot = (list: Item[]) => (filter ? list.filter(i => i.slot === filter) : list);
  const shown = tab === 'new' ? bySlot(fresh).slice().reverse() : (() => {
    const list = bySlot(spares).filter(i => (kind === 'all' || (i.slot && augmentKind(i.slot) === kind)) && (!maker || makerOf(i) === maker) && (!rarity || i.rarity === rarity));
    return sort === 'rarest' ? [...list].sort((a, b) => RANK.indexOf(a.rarity) - RANK.indexOf(b.rarity)) : [...list].reverse();
  })();
  const makersHere = Array.from(new Set(spares.map(makerOf)));
  const raritiesHere = RANK.filter(r => spares.some(i => i.rarity === r)) as Item['rarity'][];
  const chip = (on: boolean) => cx('key shrink-0 rounded-full px-3 py-1.5 text-xs font-semibold', on ? 'key-selected text-white' : 'text-hud-dim');

  const install = (item: Item) => {
    equipAugmentation(item);
    setFilter(null);
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-2 text-xs font-semibold">
        <span className="rounded-full bg-amber-300/10 px-2.5 py-1 text-amber-200">+{totals.physicalAttack + tree.attack} Atk</span>
        <span className="rounded-full bg-violet-400/10 px-2.5 py-1 text-violet-300">+{totals.structuralAttack + tree.spAttack} Sp. Atk</span>
        <span className="rounded-full bg-amber-300/10 px-2.5 py-1 text-amber-200">+{totals.physicalDefense + tree.defense} Def</span>
        <span className="rounded-full bg-violet-400/10 px-2.5 py-1 text-violet-300">+{totals.structuralDefense + tree.spDefense} Sp. Def</span>
        <span className="rounded-full bg-ok/10 px-2.5 py-1 text-ok">+{totals.hp + tree.hp} HP</span>
        <span className="ml-auto text-hud-dim">{equippedSlots.length} of 10 installed</span>
      </div>

      <BodyMap selected={filter} onSelect={setFilter} spareFor={slot => augmentations.some(i => i.slot === slot)} />

      {filter && !equippedAugmentations[filter] && (
        <p className="text-sm text-hud-dim">{AUGMENTATION_SLOT_NAMES[filter]}: empty.</p>
      )}
      {filter && equippedAugmentations[filter] && (
        <div className="space-y-2">
          <Label>Installed in {AUGMENTATION_SLOT_NAMES[filter].toLowerCase()}</Label>
          <ImplantRow startOpen item={equippedAugmentations[filter]!} action={<Btn size="sm" variant="danger" onClick={() => unequipAugmentation(filter)}>Remove</Btn>} />
          {spliced?.[filter] && (
            <>
              <Label>Spliced beside it</Label>
              <ImplantRow item={spliced[filter]!} action={<Btn size="sm" variant="danger" onClick={() => unsplice(filter)}>Take out</Btn>} />
            </>
          )}
        </div>
      )}
      {splicing && <p className="px-1 text-xs text-hud-dim">Spliced pairs: {pairsNow} of {pairLimit}</p>}

      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <button onClick={() => setTab('new')} aria-pressed={tab === 'new'} className={cx('key relative rounded-full px-4 py-2 text-[13px] font-semibold', tab === 'new' ? 'key-selected text-white' : 'text-hud-dim')}>
            New ({bySlot(fresh).length}){fresh.length > 0 && <span className="absolute -right-0.5 -top-0.5 h-2.5 w-2.5 rounded-full bg-cred" />}
          </button>
          <button onClick={showSpares} aria-pressed={tab === 'spare'} className={cx('key rounded-full px-4 py-2 text-[13px] font-semibold', tab === 'spare' ? 'key-selected text-white' : 'text-hud-dim')}>
            Spare ({bySlot(spares).length})
          </button>
          {filter && <button className="ml-auto text-xs font-semibold text-sys" onClick={() => setFilter(null)}>{AUGMENTATION_SLOT_NAMES[filter]} only · show all</button>}
        </div>
        {tab === 'spare' && spares.length > 0 && (
          // Narrow the spares down: active or passive, a maker, a rarity; newest or rarest first
          <div className="space-y-2">
            <div className="flex gap-1.5 overflow-x-auto pb-0.5">
              {(['all', 'active', 'passive'] as const).map(k => <button key={k} onClick={() => setKind(k)} className={chip(kind === k)}>{k === 'all' ? 'All' : k === 'active' ? 'Active' : 'Passive'}</button>)}
              <span className="mx-1 w-px shrink-0 bg-white/10" />
              {(['newest', 'rarest'] as const).map(k => <button key={k} onClick={() => setSort(k)} className={chip(sort === k)}>{k === 'newest' ? 'Newest' : 'Rarest'}</button>)}
            </div>
            {makersHere.length > 1 && (
              <div className="flex gap-1.5 overflow-x-auto pb-0.5">
                {makersHere.map(m => <button key={m} onClick={() => setMaker(maker === m ? null : m)} className={cx(chip(maker === m), maker !== m && MAKER_INFO[m].tone)}>{MAKER_INFO[m].label}</button>)}
              </div>
            )}
            {raritiesHere.length > 1 && (
              <div className="flex gap-1.5 overflow-x-auto pb-0.5">
                {raritiesHere.map(r => <button key={r} onClick={() => setRarity(rarity === r ? null : r)} className={cx(chip(rarity === r), rarity !== r && RARITY_TEXT[r])}>{r[0].toUpperCase() + r.slice(1)}</button>)}
              </div>
            )}
          </div>
        )}
        {shown.length === 0 ? (
          <Card raised className="px-4 py-7 text-center text-sm text-hud-faint">
            {tab === 'new' ? 'Nothing new.' : 'None.'}
          </Card>
        ) : (
          <div className="space-y-2">
            {shown.map(item => (
              <ImplantRow
                key={item.id}
                item={item}
                action={
                  <span className="flex flex-col gap-1.5">
                    <Btn size="sm" variant="primary" onClick={() => install(item)}>{item.slot && equippedAugmentations[item.slot] ? 'Swap' : 'Install'}</Btn>
                    {canSpliceIn(item) && <Btn size="sm" variant="gold" onClick={() => spliceIn(item)}>Splice</Btn>}
                  </span>
                }
              />
            ))}
          </div>
        )}
      </div>

      {!filter && (
        <div className="space-y-2">
          <Label>Stims ({consumables.length})</Label>
          {consumables.length === 0 ? (
            <p className="text-sm text-hud-faint">None.</p>
          ) : (
            <div className="grid grid-cols-2 gap-2">
              {consumables.map(item => {
                const info = stimInfo(item);
                return (
                  <div key={item.id} className="flex items-center gap-2.5 rounded-2xl bg-white/[0.04] px-3 py-2.5">
                    <span className="text-xl">{info.icon}</span>
                    <span className="min-w-0">
                      <span className="block truncate text-[13px] font-semibold text-hud-text">{info.label}</span>
                      <span className="block text-[11px] text-ok">{info.effect}</span>
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
