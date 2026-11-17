// Mockups only (dev routes): Old debts at the Grey Lane. Nothing here is wired to the game.
import { Screen, Btn, SlotIcon, RARITY_TEXT, cx } from '../hud';
import type { AugmentationSlot, ItemRarity } from '@/lib/combat/types';

type Row = { name: string; slot: AugmentationSlot; rarity: ItemRarity; stats: string; price?: number };
const SPARES: Row[] = [
  { name: 'Weld-Shade Lens', slot: 'eyes', rarity: 'common', stats: '+3 Def · +1 Sp. Def' },
  { name: 'Squad Bead', slot: 'ears', rarity: 'uncommon', stats: '+5 Atk' },
  { name: 'Float Shin', slot: 'left_leg', rarity: 'common', stats: '+4 Def' },
];
const STOCK: Row[] = [
  { name: 'Recoil Brace', slot: 'misc', rarity: 'uncommon', stats: '+6 Atk · +2 Def', price: 140 },
  { name: 'Volkov Grip-Sleeve (R)', slot: 'right_arm', rarity: 'uncommon', stats: 'VK-4 Drive · 13–18', price: 165 },
  { name: 'Clinic Bellows (Refurbished)', slot: 'lungs', rarity: 'uncommon', stats: '+14 Health', price: 120 },
  { name: 'Shift-Count Chip', slot: 'brain', rarity: 'common', stats: '+8 Health', price: 45 },
  { name: 'Pupil Graft', slot: 'eyes', rarity: 'common', stats: '+4 Atk · -3 Health', price: 50 },
];

const ItemRow = ({ r, right, dim, picked }: { r: Row; right?: React.ReactNode; dim?: boolean; picked?: boolean }) => (
  <div className={cx('flex items-center gap-3 rounded-2xl bg-hud-panel/80 p-3 ring-1', picked ? 'ring-2 ring-cred' : 'ring-white/[0.05]', dim && 'opacity-35')}>
    <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-black/25"><SlotIcon slot={r.slot} /></span>
    <span className="min-w-0 flex-1">
      <span className={cx('block truncate text-sm font-semibold', RARITY_TEXT[r.rarity])}>{r.name}</span>
      <span className="block truncate text-xs text-hud-dim">{r.stats}</span>
    </span>
    {right}
  </div>
);

function Lane({ children }: { children?: React.ReactNode }) {
  return (
    <Screen footer={<Btn variant="primary" size="lg" className="w-full">Leave</Btn>}>
      <div className="relative space-y-4 px-4 pb-6 pt-7">
        <header className="flex items-start justify-between gap-3">
          <h1 className="font-display text-3xl font-bold text-white">Grey Lane</h1>
          <span className="slab shrink-0 rounded-full px-3.5 py-1.5 font-display text-[15px] font-semibold text-cred">¤ 62</span>
        </header>
        {/* Old debts: one line under the header while it's unused this host */}
        <div className="slab flex items-center gap-3 rounded-[20px] p-4">
          <div className="min-w-0 flex-1">
            <div className="font-display text-[15px] font-semibold text-hud-text">Old debts</div>
            <div className="text-[13px] text-hud-dim">Give a spare implant, take anything here of the same grade. Once a host.</div>
          </div>
          <Btn size="sm" variant="secondary">Trade</Btn>
        </div>
        {children ?? <div className="space-y-2">{STOCK.map(r => <ItemRow key={r.name} r={r} right={<span className="font-display text-[15px] font-semibold text-cred">¤{r.price}</span>} />)}</div>}
      </div>
    </Screen>
  );
}

/** The Grey Lane with Old debts waiting. */
export function MockOldDebts() { return <Lane />; }

/** Mid-trade: the spare given (Squad Bead, uncommon), and what it can become: every uncommon here, free. */
export function MockOldDebtsTrade() {
  return (
    <Lane>
      <div className="slab space-y-3 rounded-[24px] p-4">
        <div className="text-[13px] font-semibold text-hud-text">1. Give a spare</div>
        <div className="space-y-2">{SPARES.map(r => <ItemRow key={r.name} r={r} picked={r.name === 'Squad Bead'} right={r.name === 'Squad Bead' ? <span className="text-[12px] font-semibold text-cred">Giving</span> : undefined} />)}</div>
        <div className="pt-1 text-[13px] font-semibold text-hud-text">2. Take one of its grade</div>
        <div className="space-y-2">{STOCK.map(r => <ItemRow key={r.name} r={r} dim={r.rarity !== 'uncommon'} right={r.rarity === 'uncommon' ? <Btn size="sm" variant="gold">Take</Btn> : undefined} />)}</div>
      </div>
    </Lane>
  );
}
