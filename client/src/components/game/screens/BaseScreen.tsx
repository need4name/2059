import { useState } from 'react';
import { useCombat } from '@/lib/stores/useCombat';
import { useInventory } from '@/lib/stores/useInventory';
import { useLoadout, LoadoutAction } from '@/lib/stores/useLoadout';
import { useAugmentTrees, nodesOf } from '@/lib/stores/useAugmentTrees';
import { blockedIn, closedIn, costIn, depthIn, effectIn, effectText, nodeIn, WINS_PER_POINT, type UpgradeNode } from '@/lib/engine/upgrades';
import { useAudio } from '@/lib/stores/useAudio';
import { CLASS_DEFINITIONS, FIRMWARE_ATTACKS, createPlayer, getBossPreview } from '@/lib/combat/actions';
import { AUGMENTATION_SLOTS, AUGMENTATION_SLOT_NAMES, augmentKind, type AugmentationSlot, type Item } from '@/lib/combat/types';
import { actionForItem, healthCostOf } from '@/lib/combat/augments';
import { useTutorial } from '@/lib/stores/useTutorial';
import { Screen, Panel, Card, Label, Btn, Meter, Stat, ConfirmDialog, Sheet, Page, Footprint, Glyph, SlotIcon, RARITY_TEXT, cx, type GlyphName } from '../hud';
import { Inventory } from '../Inventory';
import { useActionPool } from '../useActionPool';
import { rangeText, effectsText, nameOf } from '../itemText';
import { exportSave, importSave } from '@/lib/save';
import { useJournal } from '@/lib/stores/useJournal';
import { useMap } from '@/lib/stores/useMap';
import { roomById, hasFight } from '@/lib/engine/map';
import { RoomPanel } from './RoomPanel';
import { nextChapter } from '@/lib/combat/chapters';
import { AlliesTab } from './AlliesTab';
import { useAllies } from '@/lib/stores/useAllies';
import { usePlayi } from '@/lib/stores/usePlayi';
import { useStrain } from '@/lib/stores/useStrain';
import { firstLifeAt } from '@/lib/daily';
import { STRAIN, STRAIN_NUMBERS, strainPicks } from '@/lib/engine/strain';
import { PLAYER_BASE_MOVE, attackPatternOf, SPEED, implantDrive } from '@/lib/engine/fight';

type Tab = 'loadout' | 'implants' | 'upgrades' | 'status' | 'allies' | 'strain';

export function actionColor(a: LoadoutAction) {
  if (a.type === 'brace') return 'text-sys';
  if (a.type === 'special' || a.source === 'class') return 'text-aug';
  if (a.source === 'weapon') return 'text-cred';
  if (a.source === 'augment') return 'text-ok';
  return 'text-hud-text';
}

function ActionDetail({ a }: { a: LoadoutAction }) {
  const heat = a.heatGenerated ?? 0;
  return (
    <span className="flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-hud-dim">
      {a.damage ? <span>{a.damage} base damage</span> : null}
      {a.defenseBoost ? <span>+{a.defenseBoost} guard</span> : null}
      {a.healing ? <span>+{a.healing} HP</span> : null}
      <span>{rangeText(a)}</span>
      {heat !== 0 && <span className={heat > 0 ? 'text-orange-300' : 'text-sys'}>{heat > 0 ? '+' : ''}{heat} heat</span>}
      {effectsText(a) && <span className="text-ok/90">{effectsText(a)}</span>}
    </span>
  );
}

const SOURCE_GROUPS: { source: LoadoutAction['source']; label: string; empty: string }[] = [
  { source: 'class', label: 'Firmware', empty: '' },
  { source: 'base', label: 'Core', empty: '' },
  { source: 'augment', label: 'From your implants', empty: '' },
  { source: 'weapon', label: 'Weapon', empty: '' },
];

function LoadoutTab() {
  const { slots, setSlot } = useLoadout();
  const playerClass = useCombat(s => s.playerClass);
  const pool = useActionPool();
  const [replacing, setReplacing] = useState<LoadoutAction | null>(null);
  const slotOf = (a: LoadoutAction) => slots.findIndex(s => s?.key === a.key);

  const toggle = (a: LoadoutAction) => {
    const at = slotOf(a);
    if (at >= 0) { setSlot(at, null); return; }
    const free = slots.findIndex(s => s === null);
    if (free >= 0) setSlot(free, a);
    else setReplacing(a);
  };

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-2">
        {slots.map((a, i) => a ? (
          <button key={i} onClick={() => setSlot(i, null)} aria-label={`Take ${a.name} off the bar`}
            className="flex min-h-[72px] flex-col justify-between rounded-2xl bg-white/[0.07] p-3 text-left ring-1 ring-white/[0.06] transition hover:bg-white/[0.1]">
            <span className={cx('font-display text-[14px] font-semibold leading-tight', actionColor(a))}>{a.name}</span>
            <span className="text-[11px] text-hud-dim">
              {a.damage ? `${a.damage} dmg` : a.defenseBoost ? `+${a.defenseBoost} guard` : ''}
              {(a.heatGenerated ?? 0) !== 0 && <span className={(a.heatGenerated ?? 0) > 0 ? 'text-orange-300' : 'text-sys'}> · {(a.heatGenerated ?? 0) > 0 ? '+' : ''}{a.heatGenerated} heat</span>}
            </span>
          </button>
        ) : (
          <div key={i} className="flex min-h-[72px] items-center justify-center rounded-2xl bg-white/[0.02] text-xs text-hud-faint ring-1 ring-inset ring-white/[0.06]">Empty</div>
        ))}
      </div>

      {/* How to read the little attack pictures */}
      <div className="flex items-center gap-3 rounded-2xl bg-white/[0.03] px-3.5 py-2.5 text-[12px] leading-snug text-hud-dim">
        <Footprint pattern="melee" cell={6} className="shrink-0" />
        <span>You're the blue square. Orange is where the move can hit; brighter hits harder: from the side +15%, from behind +30%.</span>
      </div>

      {SOURCE_GROUPS.map(g => {
        const moves = pool.filter(a => a.source === g.source);
        if (!moves.length && !g.empty) return null;
        return (
          <section key={g.source} className="space-y-2">
            <Label>{g.label}</Label>
            {moves.length === 0
              ? <p className="rounded-2xl bg-white/[0.03] px-4 py-3 text-sm text-hud-faint">{g.empty}</p>
              : (
                <div className="grid grid-cols-2 gap-2">
                  {moves.map(a => {
                    const on = slotOf(a) >= 0;
                    return (
                      <button key={a.key} onClick={() => toggle(a)} aria-pressed={on}
                        className={cx('relative flex flex-col gap-1 rounded-2xl p-3 text-left transition', on ? 'bg-sys/[0.09] ring-1 ring-sys/40' : 'bg-white/[0.04] hover:bg-white/[0.07]')}>
                        <span className={cx('pr-5 font-display text-[14px] font-semibold leading-tight', actionColor(a))}>{a.name}</span>
                        {(a.type === 'attack' || a.type === 'special') && <Footprint action={a} playerClass={playerClass} cell={6} className="my-1" />}
                        <ActionDetail a={a} />
                        <span className={cx('absolute right-2.5 top-2.5 flex h-5 w-5 items-center justify-center rounded-full text-[11px] font-bold', on ? 'bg-sys text-hud-bg' : 'bg-white/[0.08] text-hud-dim')}>{on ? '✓' : '+'}</span>
                      </button>
                    );
                  })}
                </div>
              )}
          </section>
        );
      })}

      <Sheet open={!!replacing} title="Your bar is full" onClose={() => setReplacing(null)}>
        <p className="mb-3 text-sm text-hud-dim">Swap out a move to make room for <span className="font-semibold text-hud-text">{replacing?.name}</span>.</p>
        <div className="space-y-2">
          {slots.map((a, i) => a && (
            <button key={i} onClick={() => { setSlot(i, replacing); setReplacing(null); }} className="flex w-full items-center justify-between rounded-2xl bg-white/[0.05] px-4 py-3 text-left transition hover:bg-sys/10">
              <span className={cx('font-display text-[14px] font-semibold', actionColor(a))}>{a.name}</span>
              <span className="text-xs text-hud-dim">Swap out</span>
            </button>
          ))}
        </div>
      </Sheet>
    </div>
  );
}


/** Does this installed implant have a node the player can take right now? */
function upgradeWaiting(item: Item, owned: Record<string, string[]>, points: number) {
  const tree = nodesOf(item);
  return !!tree && tree.some(n => !blockedIn(tree, owned[item.id] ?? [], n.id, points));
}

/** Where each node sits: leaves spread evenly, a parent centred over its children. */
function treeLayout(nodes: UpgradeNode[]) {
  const kids = (id?: string) => nodes.filter(n => n.parent === id);
  const leaves: string[] = [];
  const walk = (id: string) => { const k = kids(id); if (!k.length) leaves.push(id); k.forEach(c => walk(c.id)); };
  const root = nodes.find(n => !n.parent)!;
  walk(root.id);
  const x: Record<string, number> = {};
  const place = (id: string): number => {
    const k = kids(id);
    x[id] = k.length ? k.map(c => place(c.id)).reduce((a, b) => a + b, 0) / k.length : ((leaves.indexOf(id) + 0.5) / leaves.length) * 100;
    return x[id];
  };
  place(root.id);
  return { x, depth: Object.fromEntries(nodes.map(n => [n.id, depthIn(nodes, n.id)])), rows: Math.max(...nodes.map(n => depthIn(nodes, n.id))) + 1 };
}

const ROW = 84; // px between rows of the tree

/** One implant's tree (its own, grown from the part): tap a node to see it; a fork takes one side only. */
function UpgradeTree({ slot, item }: { slot: AugmentationSlot; item: Item }) {
  const { owned: all, availablePoints, take } = useAugmentTrees();
  const nodes = nodesOf(item)!;
  const owned = all[item.id] ?? [];
  const { x, depth, rows } = treeLayout(nodes);
  const next = nodes.find(n => blockedIn(nodes, owned, n.id, Infinity) === null);
  const [focus, setFocus] = useState<string>(next?.id ?? nodes[0].id);
  const node = nodeIn(nodes, focus)!;
  const why = blockedIn(nodes, owned, focus, availablePoints);
  const cost = costIn(nodes, focus);
  const state = (id: string) => owned.includes(id) ? 'owned' : closedIn(nodes, owned, id) ? 'closed' : blockedIn(nodes, owned, id, Infinity) === null ? 'open' : 'locked';
  const taken = (id: string) => nodes.find(n => n.parent === nodeIn(nodes, id)?.parent && owned.includes(n.id));
  // Five branch ends need narrower nodes to fit a phone
  const wide = nodes.filter(n => !nodes.some(c => c.parent === n.id)).length > 4;

  return (
    <div className="space-y-4">
      <div className="slab rounded-[28px] px-2 pb-3 pt-4">
        <div className="mx-auto mb-2 flex w-fit items-center gap-2 px-3">
          <SlotIcon slot={slot} size={18} className="text-sys/80" />
          <span className={cx('font-display text-[15px] font-semibold', RARITY_TEXT[item.rarity])}>{nameOf(item)}</span>
        </div>
        {(() => {
          // What the attack does now, with what's been taken: its shape, and its numbers
          const move = actionForItem(item, effectIn(nodes, owned));
          if (!move || move.type !== 'attack') return null;
          return (
            <div className="mx-auto mb-1 flex w-fit items-center gap-2.5 rounded-2xl bg-black/20 px-3 py-1.5">
              <Footprint action={move} cell={4} />
              <span className="text-[12px] text-hud-dim"><span className="font-semibold text-hud-text">{move.name}</span><br />{move.damage} damage · {(move.heatGenerated ?? 0) > 0 ? '+' : ''}{move.heatGenerated} heat</span>
            </div>
          );
        })()}
        <div className="relative" style={{ height: rows * ROW }}>
          {/* The branches */}
          <svg className="absolute inset-0 h-full w-full" viewBox={`0 0 100 ${rows * ROW}`} preserveAspectRatio="none" aria-hidden>
            {nodes.filter(n => n.parent).map(n => {
              const on = owned.includes(n.id), shut = closedIn(nodes, owned, n.id);
              return <line key={n.id} x1={x[n.parent!]} y1={depth[n.parent!] * ROW + ROW / 2} x2={x[n.id]} y2={depth[n.id] * ROW + ROW / 2}
                stroke={on ? '#38d6f0' : shut ? 'rgba(255,255,255,0.04)' : 'rgba(255,255,255,0.14)'} strokeWidth={on ? 3 : 2} vectorEffect="non-scaling-stroke" />;
            })}
          </svg>
          {nodes.map(n => {
            const st = state(n.id), on = focus === n.id, legend = n.cap === 'legendary';
            return (
              <button key={n.id} onClick={() => setFocus(n.id)} aria-pressed={on} aria-label={n.name}
                className={cx('absolute flex -translate-x-1/2 flex-col items-center gap-1', wide ? 'w-[68px]' : 'w-[84px]')}
                style={{ left: `${x[n.id]}%`, top: depth[n.id] * ROW + ROW / 2 - 20 }}>
                <span className={cx('flex h-10 w-10 items-center justify-center rounded-full font-display text-[13px] font-bold transition',
                  st === 'owned' && (n.cap ? 'bg-cred text-hud-bg' : 'bg-sys text-hud-bg'),
                  st === 'open' && 'bg-hud-raised text-sys ring-2 ring-sys/70',
                  st === 'locked' && 'bg-hud-raised text-hud-faint ring-1 ring-white/10',
                  st === 'closed' && 'bg-hud-panel text-hud-faint/30 ring-1 ring-white/[0.04]',
                  legend && st !== 'closed' && st !== 'owned' && 'text-cred ring-2 ring-cred/70',
                  on && 'scale-110 shadow-[0_0_0_4px_rgba(255,255,255,0.14)]')}>
                  {n.cap ? <Glyph name={legend ? 'strain' : 'upgrade'} size={14} /> : costIn(nodes, n.id)}
                </span>
                <span className={cx('text-center text-[10.5px] font-semibold leading-tight', st === 'closed' ? 'text-hud-faint/50' : legend ? 'text-cred' : st === 'owned' ? 'text-hud-text' : 'text-hud-dim')}>{n.name}</span>
              </button>
            );
          })}
        </div>
      </div>

      <div className="slab space-y-2 rounded-[24px] p-4">
        <div className="flex items-baseline justify-between gap-2">
          <span className={cx('font-display text-base font-semibold', node.cap === 'legendary' ? 'text-cred' : 'text-white')}>{node.name}</span>
          {node.cap && <span className="text-xs font-semibold text-cred">{node.cap === 'legendary' ? 'Legendary capstone' : 'Capstone'}</span>}
        </div>
        <p className="text-sm text-hud-text/85">{effectText(node.effect)}</p>
        {why === null && <Btn className="w-full" variant="gold" onClick={() => { take(slot, focus); const nx = nodes.find(c => c.parent === focus); if (nx) setFocus(nx.id); }}>Take · {cost} point{cost > 1 ? 's' : ''}</Btn>}
        {why === 'points' && <Btn className="w-full" variant="secondary" disabled>Needs {cost} point{cost > 1 ? 's' : ''}</Btn>}
        {why === 'owned' && <p className="text-sm font-semibold text-sys">You have this.</p>}
        {why === 'fork' && <p className="text-sm text-hud-faint">You took {taken(focus)?.name} instead.</p>}
        {why === 'parent' && <p className="text-sm text-hud-faint">{closedIn(nodes, owned, focus) ? 'Closed off by an earlier choice.' : `Take ${nodeIn(nodes, node.parent!)?.name} first.`}</p>}
      </div>
    </div>
  );
}

function UpgradesTab() {
  const { equippedAugmentations } = useInventory();
  const { owned, availablePoints, wins } = useAugmentTrees();
  const equipped = AUGMENTATION_SLOTS.filter(s => equippedAugmentations[s] && nodesOf(equippedAugmentations[s]!));
  const firstWaiting = equipped.find(s => upgradeWaiting(equippedAugmentations[s]!, owned, availablePoints));
  const [picked, setPicked] = useState<AugmentationSlot | null>(null);
  const slot = picked && equipped.includes(picked) ? picked : (firstWaiting ?? equipped[0]);

  if (!slot) {
    return <Card raised className="px-4 py-10 text-center text-sm text-hud-dim">Nothing to grow yet.</Card>;
  }
  const toGo = WINS_PER_POINT - wins;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between rounded-2xl bg-cred/[0.08] px-4 py-3">
        <span className="text-sm text-hud-dim">Points <span className="text-hud-faint">· next in {toGo} win{toGo > 1 ? 's' : ''}</span></span>
        <span className="font-display text-2xl font-semibold text-cred">{availablePoints}</span>
      </div>
      <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 no-scrollbar">
        {equipped.map(s => {
          const item = equippedAugmentations[s]!;
          const n = (owned[item.id] ?? []).length;
          const waiting = upgradeWaiting(item, owned, availablePoints);
          return (
            <button key={s} onClick={() => setPicked(s)} aria-pressed={s === slot}
              className={cx('key relative flex shrink-0 flex-col items-center gap-1.5 rounded-2xl px-3.5 py-2.5', s === slot && 'key-selected')}>
              {(() => { const mv = actionForItem(item); return mv?.type === 'attack' ? <Footprint action={mv} cell={3} /> : <SlotIcon slot={s} size={20} className="text-sys/80" />; })()}
              <span className="text-[11px] font-semibold text-hud-text">{AUGMENTATION_SLOT_NAMES[s]}</span>
              <span className="flex gap-1">{Array.from({ length: Math.max(...nodesOf(item)!.map(x => depthIn(nodesOf(item)!, x.id))) + 1 }, (_, t) => <span key={t} className={cx('h-1.5 w-2.5 rounded-full', t < n ? 'bg-sys' : 'bg-white/10')} />)}</span>
              {waiting && <span className="absolute right-1.5 top-1.5 h-2 w-2 rounded-full bg-cred" />}
            </button>
          );
        })}
      </div>
      <UpgradeTree key={equippedAugmentations[slot]!.id} slot={slot} item={equippedAugmentations[slot]!} />
      <p className="px-1 text-xs text-hud-faint">Selling an implant or giving it away gives its points back.</p>
    </div>
  );
}

/** Copy the save out as text, or paste one in (another device, or a backup). */
function SavePanel() {
  const [copied, setCopied] = useState<'idle' | 'copied' | 'shown'>('idle');
  const [shown, setShown] = useState('');
  const [restoring, setRestoring] = useState(false);
  const [pasted, setPasted] = useState('');
  const [error, setError] = useState('');

  const copy = async () => {
    const text = exportSave();
    try { await navigator.clipboard.writeText(text); setCopied('copied'); }
    catch { setShown(text); setCopied('shown'); }
  };
  const restore = () => {
    const r = importSave(pasted);
    if (!r.ok) { setError(r.reason); return; }
    window.location.reload();
  };

  return (
    <Panel label="Your save">
      <div className="space-y-3">
        <p className="text-sm leading-relaxed text-hud-dim">Kept on this device. Copy it to move to another phone.</p>
        <div className="grid grid-cols-2 gap-2">
          <Btn onClick={copy}>{copied === 'copied' ? 'Copied' : 'Copy save'}</Btn>
          <Btn onClick={() => { setRestoring(r => !r); setError(''); }}>{restoring ? 'Cancel' : 'Restore a save'}</Btn>
        </div>
        {copied === 'shown' && (
          <div className="space-y-1.5">
            <p className="text-xs text-hud-dim">Couldn't copy automatically. Select this text and copy it:</p>
            <textarea id="save-export" readOnly value={shown} onFocus={e => e.currentTarget.select()} className="h-20 w-full resize-none rounded-2xl bg-black/30 p-3 text-xs text-hud-text outline-none ring-1 ring-white/10 focus:ring-sys/60" />
          </div>
        )}
        {restoring && (
          <div className="space-y-2">
            <label htmlFor="save-import" className="block text-xs text-hud-dim">Paste a save. It replaces your current progress.</label>
            <textarea id="save-import" value={pasted} onChange={e => { setPasted(e.target.value); setError(''); }} placeholder="2059SAVE:..." className="h-20 w-full resize-none rounded-2xl bg-black/30 p-3 text-xs text-hud-text outline-none ring-1 ring-white/10 focus:ring-sys/60" />
            {error && <p className="text-xs text-hostile">{error}</p>}
            <Btn className="w-full" variant="primary" disabled={!pasted.trim()} onClick={restore}>Load this save</Btn>
          </div>
        )}
      </div>
    </Panel>
  );
}

/** Strain: harder fights for better pay, switched on for the next host (unlocked by finishing a chapter). */
function StrainTab() {
  const { chosen, active, toggle } = useStrain();
  const same = chosen.length === active.length && chosen.every(id => active.includes(id));
  const credits = Math.round(STRAIN_NUMBERS.credits * 100 * chosen.length);
  return (
    <div className="space-y-3">
      <p className="px-1 text-sm leading-relaxed text-hud-dim">Takes hold when your next host wakes.</p>
      {STRAIN.map(st => {
        const on = chosen.includes(st.id);
        return (
          <button key={st.id} onClick={() => toggle(st.id)} className={cx('key flex w-full items-center gap-3 rounded-[20px] p-4 text-left', on && 'key-selected')}>
            <Glyph name="strain" size={18} className={on ? 'text-hostile' : 'text-hud-faint'} />
            <span className="min-w-0 flex-1">
              <span className="block font-display text-[15px] font-semibold text-hud-text">{st.name}</span>
              <span className="block text-[13px] text-hud-dim">{st.text}</span>
            </span>
            <span className={cx('text-xs font-semibold', on ? 'text-hostile' : 'text-hud-faint')}>{on ? 'On' : 'Off'}</span>
          </button>
        );
      })}
      <div className="slab rounded-[20px] p-4 text-sm leading-relaxed text-hud-text/85">
        {chosen.length ? <>+{credits}% credits from every win{strainPicks(chosen) ? ', and one more part off the bodies' : ''}.</> : 'Nothing on.'}
        {!same && <div className="mt-1 text-xs text-hud-faint">This host still lives under {active.length ? `${active.length} switch${active.length > 1 ? 'es' : ''}` : 'none'}.</div>}
      </div>
    </div>
  );
}

function StatusTab() {
  const { playerClass, resetAll, progression, bossLevel } = useCombat();
  const { getTotalAugmentationBonuses, equippedAugmentations } = useInventory();
  const { getTreeStatBonuses } = useAugmentTrees();
  const { isMuted, toggleMute } = useAudio();
  const hints = useTutorial();
  const [confirmReset, setConfirmReset] = useState(false);
  const equipped = AUGMENTATION_SLOTS.filter(s => equippedAugmentations[s] !== null);
  const tree = getTreeStatBonuses(equipped);
  const stats = createPlayer({ ...getTotalAugmentationBonuses(), treeAttack: tree.attack, treeDefense: tree.defense, treeHp: tree.hp }, playerClass);
  const cls = CLASS_DEFINITIONS[playerClass];
  const perks = usePlayi(s => s.perks)();
  const notes = useJournal(s => s.notes);

  return (
    <div className="space-y-3">
      <Panel label="This body">
        <div className="grid grid-cols-3 gap-x-4 gap-y-5">
          <Stat label="Health" value={stats.maxHp} tone="text-ok" />
          <Stat label="Structure" value={stats.maxStructuralHp} />
          <Stat label="Move" value={(() => { const n = PLAYER_BASE_MOVE + perks.moveBonus + (tree.moveRange ?? 0); return `${n} tile${n === 1 ? '' : 's'}`; })()} />
          <Stat label="Attack" value={stats.physicalAttack} tone="text-rose-300" />
          <Stat label="Disrupt" value={stats.structuralAttack} tone="text-rose-300" />
          <Stat label="Evasion" value={stats.evasion} />
          <Stat label="Armour" value={stats.physicalDefense} tone="text-sky-300" />
          <Stat label="Shielding" value={stats.structuralDefense} tone="text-sky-300" />
          <Stat label="Speed" value={Math.round((SPEED.base + implantDrive(equipped.map(sl => equippedAugmentations[sl]!))) * 10) / 10} tone="text-amber-200" />
        </div>
        {equipped.length > 0 && (() => {
          const cost = equipped.reduce((n, sl) => n + healthCostOf(equippedAugmentations[sl]!), 0);
          return cost > 0 ? <p className="mt-4 text-xs text-hostile">−{cost} health to your implants</p> : null;
        })()}
      </Panel>

      {notes.length > 0 && (
        <Panel label="Noticed">
          <ul className="space-y-2.5">
            {notes.slice().reverse().map(n => (
              <li key={n.id} className="text-sm italic leading-snug text-hud-text/90">{n.text}<span className="ml-1.5 not-italic text-[11px] text-hud-faint">host {n.host}</span></li>
            ))}
          </ul>
        </Panel>
      )}

{playerClass !== 'none' && (
        <Panel label="Firmware">
          <div className="space-y-1">
            <div className="font-display text-lg font-semibold text-hud-text">{cls.name}</div>
            <p className="text-sm text-aug">Your basic attack is {FIRMWARE_ATTACKS[playerClass]?.name ?? 'Strike'}. {FIRMWARE_ATTACKS[playerClass]?.description}</p>
          </div>
        </Panel>
      )}

      <Panel label="This run">
        <div className="grid grid-cols-3 gap-4">
          <Stat label="Threat" value={bossLevel} />
          <Stat label="Level" value={progression.level} />
          <Stat label="Hosts lost" value={progression.deathCount} />
        </div>
      </Panel>

      <SavePanel />

      <div className="grid grid-cols-2 gap-2 pt-1">
        <Btn onClick={toggleMute}>{isMuted ? 'Sound off' : 'Sound on'}</Btn>
        <Btn onClick={hints.enabled ? hints.skipAll : hints.restart}>{hints.enabled ? 'Hints on' : 'Hints off'}</Btn>
        <Btn className="col-span-2" variant="danger" onClick={() => setConfirmReset(true)}>Wipe save</Btn>
      </div>

      <ConfirmDialog
        open={confirmReset}
        title="Wipe all progress?"
        body="This deletes your save: level, implants, credits, host count and unlocked classes. It can't be undone. Copy your save first if you might want it back."
        confirmLabel="Wipe save"
        danger
        onCancel={() => setConfirmReset(false)}
        onConfirm={() => { setConfirmReset(false); resetAll(); }}
      />
    </div>
  );
}

const PAGE_TITLE: Record<Tab, string> = { loadout: 'Moves', implants: 'Implants', upgrades: 'Upgrades', status: 'Self', allies: 'Allies', strain: 'Strain' };

function Dock({ icon, title, alert, onClick }: { icon: GlyphName; title: string; alert?: boolean; onClick: () => void }) {
  return (
    <button onClick={onClick} className="key relative flex flex-1 flex-col items-center gap-1.5 rounded-[18px] px-1 pb-2.5 pt-3 text-hud-dim hover:text-hud-text">
      <Glyph name={icon} size={22} className={alert ? 'text-cred' : 'text-sys/80'} />
      <span className="text-[11px] font-semibold">{title}</span>
      {alert && <span className="absolute right-2.5 top-2.5 h-1.5 w-1.5 rounded-full bg-cred shadow-[0_0_8px_rgba(242,179,61,0.9)]" />}
    </button>
  );
}

export function BaseScreen() {
  const { progression, startRoomFight, goToNextChapter } = useCombat();
  const map = useMap();
  const roomNow = roomById(map.room);
  const fightHere = hasFight(map, roomNow);
  const foe = roomNow.threat !== undefined ? getBossPreview(roomNow.threat, firstLifeAt(progression.deathCount, roomNow.threat), roomNow.enemy) : null;
  const onward = map.done ? nextChapter(map.chapter) : null;
  const { gold, items, equippedAugmentations } = useInventory();
  const { owned: treeOwned, availablePoints } = useAugmentTrees();
  const { slots } = useLoadout();
  const { isMuted, toggleMute } = useAudio();
  const [page, setPage] = useState<Tab | null>(null);
  const pool = useActionPool();
  const met = useAllies(s => s.met);
  const strainOpen = useStrain(s => s.unlocked);
  const strainOn = useStrain(s => s.active.length > 0);

  const installed = AUGMENTATION_SLOTS.filter(s => equippedAugmentations[s] !== null);
  const fitsNow = items.some(i => i.type === 'augmentation' && i.slot && equippedAugmentations[i.slot] === null);
  const upgradeWaits = installed.some(s => upgradeWaiting(equippedAugmentations[s]!, treeOwned, availablePoints));
  const barGap = slots.some(s => s === null) && pool.some(a => !slots.some(s => s?.key === a.key));

  const footer = fightHere && foe
    ? <Btn variant="primary" size="lg" className="w-full" onClick={startRoomFight}>Fight</Btn>
    : onward ? <Btn variant="primary" size="lg" className="w-full" onClick={goToNextChapter}>Go on</Btn> : undefined;

  return (
    <Screen footer={footer}>
      <div className="space-y-4 px-4 pb-6" style={{ paddingTop: 'max(20px, env(safe-area-inset-top))' }}>
        <header className="flex items-center gap-3">
          <div className="min-w-0 flex-1">
            <div className="flex items-baseline gap-2">
              <span className="font-display text-[15px] font-semibold text-white">Host {progression.deathCount + 1}</span>
              <span className="text-xs font-semibold text-sys/90">Lv {progression.level}</span>
            </div>
            <Meter value={progression.currentXp} max={progression.xpToNextLevel} tone="sys" className="mt-1.5 h-1 w-full max-w-[150px]" />
          </div>
          <span className="slab rounded-full px-3.5 py-1.5 font-display text-[15px] font-semibold text-cred">¤ {gold}</span>
          <button onClick={toggleMute} aria-label={isMuted ? 'Turn sound on' : 'Turn sound off'} className="key flex h-9 w-9 items-center justify-center rounded-full text-hud-dim hover:text-hud-text">
            <Glyph name={isMuted ? 'mute' : 'sound'} size={16} />
          </button>
        </header>

        <nav className="flex gap-2" aria-label="Get ready">
          <Dock icon="bar" title="Moves" alert={barGap} onClick={() => setPage('loadout')} />
          <Dock icon="implant" title="Implants" alert={fitsNow} onClick={() => setPage('implants')} />
          <Dock icon="upgrade" title="Upgrades" alert={upgradeWaits} onClick={() => setPage('upgrades')} />
          {met.length > 0 && <Dock icon="allies" title="Allies" onClick={() => setPage('allies')} />}
          {strainOpen && <Dock icon="strain" title="Strain" alert={strainOn} onClick={() => setPage('strain')} />}
          <Dock icon="status" title="Self" onClick={() => setPage('status')} />
        </nav>

        <RoomPanel />
      </div>

      <Page open={page !== null} title={page ? PAGE_TITLE[page] : ''} back={roomNow.name} onClose={() => setPage(null)}>
        {page === 'loadout' && <LoadoutTab />}
        {page === 'implants' && <Inventory />}
        {page === 'upgrades' && <UpgradesTab />}
        {page === 'status' && <StatusTab />}
        {page === 'allies' && <AlliesTab />}
        {page === 'strain' && <StrainTab />}
      </Page>
    </Screen>
  );
}
