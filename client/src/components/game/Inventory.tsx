import { useState } from 'react';
import { useInventory } from '@/lib/stores/useInventory';
import { useAugmentTrees } from '@/lib/stores/useAugmentTrees';
import { AUGMENTATION_SLOTS, AUGMENTATION_SLOT_NAMES, AugmentationSlot, Item } from '@/lib/combat/types';
import { Btn, Card, Label, RARITY_TEXT, RARITY_GLOW, RARITY_DOT, Footprint, SlotIcon, cx } from './hud';
import { implantStats, passiveText, conditionText, stimInfo, rangeText, effectsText, nameOf } from './itemText';
import { augmentKind } from '@/lib/combat/types';
import { actionForItem, structureOf, healthCostOf, makerOf, MAKER_INFO, partsText } from '@/lib/combat/augments';
import { DRIVE } from '@/lib/engine/fight';
import { getRarityColor } from '@/lib/combat/loot';

// ── Body map ─────────────────────────────────────────────────────────────────
// A ripperdoc view: the host's body in the middle, each implant slot marked where
// it sits, and a card per slot down each side joined to it by a thin line.
// Coordinates are in a 360 x 430 box; the cards are placed by percentage.

const VB = { w: 360, h: 430 };
const CARD_W = 106;
type Spot = { slot: AugmentationSlot; at: [number, number]; side: 'left' | 'right'; cardY: number };
const SPOTS: Spot[] = [
  { slot: 'brain', at: [180, 38], side: 'left', cardY: 34 },
  { slot: 'eyes', at: [170, 56], side: 'left', cardY: 112 },
  { slot: 'lungs', at: [166, 134], side: 'left', cardY: 190 },
  { slot: 'left_arm', at: [124, 182], side: 'left', cardY: 268 },
  { slot: 'left_leg', at: [160, 326], side: 'left', cardY: 380 },
  { slot: 'ears', at: [204, 56], side: 'right', cardY: 34 },
  { slot: 'nose', at: [184, 66], side: 'right', cardY: 112 },
  { slot: 'misc', at: [194, 166], side: 'right', cardY: 190 },
  { slot: 'right_arm', at: [236, 182], side: 'right', cardY: 268 },
  { slot: 'right_leg', at: [200, 326], side: 'right', cardY: 380 },
];

const SHORT_NAME: Record<AugmentationSlot, string> = {
  brain: 'Brain', ears: 'Ears', eyes: 'Eyes', nose: 'Nose', lungs: 'Lungs', misc: 'Spine',
  left_arm: 'L arm', right_arm: 'R arm', left_leg: 'L leg', right_leg: 'R leg',
};

// The body outline, in the 360 x 430 box. It's never drawn as vectors: PixelBody
// rasterises it onto a coarse grid so the figure is pixel art like the board.
const BODY_PATHS = [
  'M180 25 a24 29 0 1 0 0.1 0 Z', // head
  'M170 80 Q180 88 190 80 L192 96 L168 96 Z',
  'M140 102 Q180 90 220 102 Q230 106 232 120 L226 170 Q222 196 214 218 L146 218 Q138 196 134 170 L128 120 Q130 106 140 102 Z',
  'M134 108 Q120 112 118 130 L110 196 Q108 214 112 232 Q118 238 124 232 L130 200 L138 140 Z',
  'M226 108 Q240 112 242 130 L250 196 Q252 214 248 232 Q242 238 236 232 L230 200 L222 140 Z',
  'M146 216 L178 216 L176 300 L172 380 Q170 400 164 410 L150 410 Q148 396 150 380 L148 300 Z',
  'M182 216 L214 216 L212 300 L210 380 Q212 396 210 410 L196 410 Q190 400 188 380 L184 300 Z',
];

/** The host's body as pixel art: a dark frame, a lit rim, faint seams across it. */
function PixelBody() {
  const draw = (canvas: HTMLCanvasElement | null) => {
    if (!canvas || canvas.dataset.drawn) return;
    canvas.dataset.drawn = '1';
    const P = 5, w = Math.ceil(VB.w / P), h = Math.ceil(VB.h / P);
    canvas.width = w; canvas.height = h;
    const g = canvas.getContext('2d')!;
    g.scale(1 / P, 1 / P);
    g.fillStyle = '#fff';
    BODY_PATHS.forEach(d => g.fill(new Path2D(d)));
    g.setTransform(1, 0, 0, 1, 0, 0);
    const src = g.getImageData(0, 0, w, h);
    const on = (x: number, y: number) => x >= 0 && y >= 0 && x < w && y < h && src.data[(y * w + x) * 4 + 3] > 110;
    const outImg = g.createImageData(w, h);
    const put = (x: number, y: number, [r, gg, b, a]: number[]) => { const i = (y * w + x) * 4; outImg.data.set([r, gg, b, a], i); };
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      if (!on(x, y)) continue;
      const edge = !on(x - 1, y) || !on(x + 1, y) || !on(x, y - 1) || !on(x, y + 1);
      const litSide = !on(x - 1, y) || !on(x, y - 1);
      if (edge) put(x, y, litSide ? [110, 232, 250, 255] : [40, 150, 175, 255]);
      else if (y % 9 === 0 || x === Math.round(180 / P)) put(x, y, [24, 70, 84, 255]);   // seams
      else put(x, y, (x + y) % 2 ? [16, 48, 60, 255] : [18, 53, 66, 255]);
    }
    g.putImageData(outImg, 0, 0);
  };
  return <canvas ref={draw} className="absolute inset-0 h-full w-full" style={{ imageRendering: 'pixelated' }} aria-hidden />;
}

function BodyMap({ selected, onSelect, spareFor }: { selected: AugmentationSlot | null; onSelect: (s: AugmentationSlot | null) => void; spareFor: (s: AugmentationSlot) => boolean }) {
  const { equippedAugmentations } = useInventory();
  return (
    <div className="relative w-full" style={{ aspectRatio: `${VB.w} / ${VB.h}` }}>
      <PixelBody />
      <svg viewBox={`0 0 ${VB.w} ${VB.h}`} className="absolute inset-0 h-full w-full" aria-hidden="true">
        {SPOTS.map(sp => {
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
            <span className={cx('mt-0.5 block truncate text-[11px] font-semibold leading-tight', eq ? RARITY_TEXT[eq.rarity] : 'text-hud-faint')}>
              {eq ? nameOf(eq) : 'Empty'}
            </span>
            {spareFor(sp.slot) && <span className="absolute -right-1 -top-1 h-2.5 w-2.5 rounded-full bg-cred shadow-[0_0_8px_rgba(242,179,61,0.8)]" title="Spare implant for this slot" />}
          </button>
        );
      })}
    </div>
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
            <span className={cx('block truncate text-sm font-semibold', RARITY_TEXT[item.rarity])}>{nameOf(item)}</span>
            <span className="flex items-center gap-1.5 text-xs text-hud-dim">
              <span className={cx('shrink-0 rounded-full px-1.5 py-px text-[10px] font-semibold', kind === 'active' ? 'bg-ok/10 text-ok' : 'bg-white/[0.06] text-hud-dim')}>{kind === 'active' ? 'Active' : 'Passive'}</span>
              {DRIVE[makerOf(item)] !== 0 && <span className={cx('shrink-0 rounded-full px-1.5 py-px text-[10px] font-semibold', DRIVE[makerOf(item)] > 0 ? 'bg-amber-300/10 text-amber-200' : 'bg-white/[0.06] text-hud-dim')}>{DRIVE[makerOf(item)] > 0 ? '+' : ''}{DRIVE[makerOf(item)]} speed</span>}
              <span className="truncate">{implantStats(item)}{cost > 0 && <span className="text-hostile"> · −{cost} HP</span>}</span>
            </span>
            {parts && <span className="block truncate text-[11px] text-ok/90">{parts}</span>}
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
              {move.type === 'attack' && <Footprint pattern={move.attackPattern} className="mt-0.5 shrink-0" />}
              <div>
                Combat move: <span className="font-semibold">{move.name}</span>
                {move.damage ? ` · ${move.damage} damage` : ` · +${move.defenseBoost} guard`} · {(move.heatGenerated ?? 0) > 0 ? '+' : ''}{move.heatGenerated} heat
                {move.type === 'attack' && <div className="text-xs text-hud-dim">{rangeText(move)}{effectsText(move) ? ` · ${effectsText(move)}` : ''}</div>}
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
  const { items, equippedAugmentations, equipAugmentation, unequipAugmentation, getTotalAugmentationBonuses } = useInventory();
  const { unlockSlot, getTreeStatBonuses } = useAugmentTrees();
  const [filter, setFilter] = useState<AugmentationSlot | null>(null);

  const equippedSlots = AUGMENTATION_SLOTS.filter(s => equippedAugmentations[s] !== null);
  const totals = getTotalAugmentationBonuses();
  const tree = getTreeStatBonuses(equippedSlots);
  const augmentations = items.filter(i => i.type === 'augmentation');
  const consumables = items.filter(i => i.type === 'consumable');
  const shown = filter ? augmentations.filter(i => i.slot === filter) : augmentations;

  const install = (item: Item) => {
    equipAugmentation(item);
    if (item.slot) unlockSlot(item.slot);
    setFilter(null);
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-2 text-xs font-semibold">
        <span className="rounded-full bg-hostile/10 px-2.5 py-1 text-rose-300">+{totals.physicalAttack + totals.structuralAttack + tree.attack} attack</span>
        <span className="rounded-full bg-sky-400/10 px-2.5 py-1 text-sky-300">+{totals.physicalDefense + totals.structuralDefense + tree.defense} defence</span>
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
        </div>
      )}

      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <Label>{filter ? `Spare for ${AUGMENTATION_SLOT_NAMES[filter].toLowerCase()}` : `Spare implants (${augmentations.length})`}</Label>
          {filter && <button className="text-xs font-semibold text-sys" onClick={() => setFilter(null)}>Show all</button>}
        </div>
        {shown.length === 0 ? (
          <Card raised className="px-4 py-7 text-center text-sm text-hud-faint">
            None.
          </Card>
        ) : (
          <div className="space-y-2">
            {shown.map(item => (
              <ImplantRow
                key={item.id}
                item={item}
                action={<Btn size="sm" variant="primary" onClick={() => install(item)}>{item.slot && equippedAugmentations[item.slot] ? 'Swap' : 'Install'}</Btn>}
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
