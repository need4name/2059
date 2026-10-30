import { useState } from 'react';
import { useCombat } from '@/lib/stores/useCombat';
import { useInventory } from '@/lib/stores/useInventory';
import { useLoadout, LoadoutAction } from '@/lib/stores/useLoadout';
import { useAugmentTrees } from '@/lib/stores/useAugmentTrees';
import { useAudio } from '@/lib/stores/useAudio';
import { AUGMENT_TREES } from '@/lib/combat/augmentTrees';
import { CLASS_DEFINITIONS, createPlayer, getBossPreview } from '@/lib/combat/actions';
import { AUGMENTATION_SLOTS, AUGMENTATION_SLOT_NAMES, augmentKind, type AugmentationSlot, type Item } from '@/lib/combat/types';
import { actionForItem, healthCostOf } from '@/lib/combat/augments';
import { useTutorial } from '@/lib/stores/useTutorial';
import { Screen, Panel, Card, Label, Btn, Meter, Stat, ConfirmDialog, Sheet, Page, Footprint, Glyph, SlotIcon, RARITY_TEXT, cx, type GlyphName } from '../hud';
import { Inventory } from '../Inventory';
import { useActionPool } from '../useActionPool';
import { rangeText, effectsText, nameOf } from '../itemText';
import { pathSummary, statText, moveText } from '../upgradeText';
import { exportSave, importSave } from '@/lib/save';
import { useJournal } from '@/lib/stores/useJournal';
import { useMap } from '@/lib/stores/useMap';
import { roomById, hasFight } from '@/lib/engine/map';
import { RoomPanel } from './RoomPanel';
import { nextChapter } from '@/lib/combat/chapters';
import { AlliesTab } from './AlliesTab';
import { useAllies } from '@/lib/stores/useAllies';
import { usePlayi } from '@/lib/stores/usePlayi';
import { PLAYER_BASE_MOVE, attackPatternOf, SPEED, implantDrive } from '@/lib/engine/fight';

type Tab = 'loadout' | 'implants' | 'upgrades' | 'status' | 'allies';

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
  { source: 'base', label: 'Core', empty: '' },
  { source: 'augment', label: 'From your implants', empty: '' },
  { source: 'weapon', label: 'Weapon', empty: '' },
  { source: 'class', label: 'Firmware', empty: '' },
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
                        {(a.type === 'attack' || a.type === 'special') && <Footprint pattern={attackPatternOf(a, playerClass)} className="my-0.5" />}
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


/** Does this installed implant want the player's attention? (a free path to pick, or a point to spend) */
function upgradeWaiting(slot: AugmentationSlot, item: Item, progress: Record<string, { chosenPath: 'A' | 'B' | null; tier: number }>, points: number) {
  if (!AUGMENT_TREES[slot]) return false;
  const p = progress[item.id];
  if (!p?.chosenPath) return true;
  return p.tier < 3 && points > 0;
}

type Node = { p: 'A' | 'B'; t: 1 | 2 | 3 };

/** One implant's upgrade tree: the implant at the top, two branches of three tiers. */
function UpgradeTree({ slot, item }: { slot: AugmentationSlot; item: Item }) {
  const { progress, availablePoints, choosePath, upgradeTier } = useAugmentTrees();
  const tree = AUGMENT_TREES[slot];
  const prog = progress[item.id];
  const tier = prog?.tier ?? 0;
  const path = prog?.chosenPath ?? null;
  const active = augmentKind(slot) === 'active';
  const next: Node | null = path ? (tier < 3 ? { p: path, t: (tier + 1) as 1 | 2 | 3 } : { p: path, t: 3 }) : null;
  const [focus, setFocus] = useState<Node>(next ?? { p: 'A', t: 1 });
  const f = path && focus.p !== path && tier > 0 ? { p: path, t: focus.t } : focus;

  const state = (n: Node) => {
    if (path && n.p !== path) return 'closed';
    if (path && n.t <= tier) return 'owned';
    if ((path && n.t === tier + 1) || (!path && n.t === 1)) return 'open';
    return 'locked';
  };

  const data = tree.paths[f.p].tiers[f.t - 1];
  const st = state(f);
  const stats = statText(data);
  const move = active ? moveText(item, f.p, f.t) : null;
  const moveName = active ? actionForItem(item, { path: f.p, tier: f.t })?.name : null;
  const sum = pathSummary(item, slot, f.p);

  return (
    <div className="space-y-4">
      <div className="relative rounded-3xl bg-hud-panel/80 px-4 pb-5 pt-4 ring-1 ring-white/[0.06]">
        <div className="mx-auto flex w-fit items-center gap-2 rounded-2xl bg-white/[0.06] px-3.5 py-2">
          <SlotIcon slot={slot} size={20} className="text-sys/80" />
          <span className={cx('font-display text-[15px] font-semibold', RARITY_TEXT[item.rarity])}>{nameOf(item)}</span>
        </div>
        <div className="mt-1 grid grid-cols-2 gap-3">
          {(['A', 'B'] as const).map(p => {
            const closed = !!path && p !== path;
            return (
              <div key={p} className={cx('flex flex-col items-center', closed && 'opacity-35')}>
                <div className="h-4 w-px bg-white/15" />
                <div className="mb-2 font-display text-sm font-semibold capitalize text-hud-text">{tree.paths[p].name.toLowerCase()}</div>
                {([1, 2, 3] as const).map(t => {
                  const n = { p, t }, s = state(n), on = f.p === p && f.t === t;
                  return (
                    <div key={t} className="flex flex-col items-center">
                      {t > 1 && <div className={cx('h-4 w-0.5 rounded-full', s === 'owned' ? 'bg-sys' : 'bg-white/10')} />}
                      <button onClick={() => setFocus(n)} aria-label={`${tree.paths[p].name} tier ${t}`} aria-pressed={on}
                        className={cx('flex h-12 w-12 items-center justify-center rounded-full font-display text-base font-bold transition',
                          s === 'owned' && (t === 3 ? 'bg-cred text-hud-bg' : 'bg-sys text-hud-bg'),
                          s === 'open' && 'bg-sys/10 text-sys ring-2 ring-sys/70',
                          (s === 'locked' || s === 'closed') && 'bg-white/[0.05] text-hud-faint',
                          on && 'scale-110 shadow-[0_0_0_4px_rgba(255,255,255,0.12)]')}>
                        {t === 3 ? '★' : t}
                      </button>
                    </div>
                  );
                })}
              </div>
            );
          })}
        </div>
      </div>

      <div className="space-y-2 rounded-3xl bg-white/[0.04] p-4">
        <div className="flex items-baseline justify-between gap-2">
          <span className="font-display text-base font-semibold capitalize text-white">{tree.paths[f.p].name.toLowerCase()} · {f.t === 3 ? 'capstone' : `tier ${f.t}`}</span>
          <span className="text-xs text-hud-faint">{data.augmentLabel}</span>
        </div>
        {!path && f.t === 1 && <p className="text-sm text-hud-text/85">{sum.headline}. {sum.detail.join(' ')}</p>}
        {stats && <div className="text-sm text-ok">{stats}</div>}
        {move && <div className="text-sm text-sys">{moveName} becomes {move}</div>}
        {st === 'open' && !path && <Btn className="w-full" variant="primary" onClick={() => { choosePath(slot, f.p); setFocus({ p: f.p, t: 2 }); }}>Take this path · free</Btn>}
        {st === 'open' && path && (
          <Btn className="w-full" variant={availablePoints > 0 ? 'gold' : 'secondary'} disabled={availablePoints < 1} onClick={() => { upgradeTier(slot); if (f.t < 3) setFocus({ p: f.p, t: (f.t + 1) as 2 | 3 }); }}>
            {availablePoints > 0 ? 'Upgrade · 1 point' : 'Needs 1 point'}
          </Btn>
        )}
        {st === 'owned' && <p className="text-sm font-semibold text-sys">You have this.</p>}
        {st === 'locked' && <p className="text-sm text-hud-faint">{path ? 'Upgrade the tier above first.' : 'Take this path first.'}</p>}
        {!path && <p className="text-xs text-hud-faint">One path only.</p>}
      </div>
    </div>
  );
}

function UpgradesTab() {
  const { equippedAugmentations } = useInventory();
  const { progress, availablePoints } = useAugmentTrees();
  const equipped = AUGMENTATION_SLOTS.filter(s => equippedAugmentations[s] !== null && AUGMENT_TREES[s]);
  const firstWaiting = equipped.find(s => upgradeWaiting(s, equippedAugmentations[s]!, progress, availablePoints));
  const [picked, setPicked] = useState<AugmentationSlot | null>(null);
  const slot = picked && equipped.includes(picked) ? picked : (firstWaiting ?? equipped[0]);

  if (!slot) {
    return <Card raised className="px-4 py-10 text-center text-sm text-hud-dim">Nothing to grow yet.</Card>;
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between rounded-2xl bg-cred/[0.08] px-4 py-3">
        <span className="text-sm text-hud-dim">Points to spend</span>
        <span className="font-display text-2xl font-semibold text-cred">{availablePoints}</span>
      </div>
      <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 no-scrollbar">
        {equipped.map(s => {
          const item = equippedAugmentations[s]!;
          const p = progress[item.id];
          const waiting = upgradeWaiting(s, item, progress, availablePoints);
          return (
            <button key={s} onClick={() => setPicked(s)} aria-pressed={s === slot}
              className={cx('relative flex shrink-0 flex-col items-center gap-1.5 rounded-2xl px-3.5 py-2.5 transition', s === slot ? 'bg-sys/[0.12] ring-1 ring-sys/50' : 'bg-white/[0.04] hover:bg-white/[0.07]')}>
              <SlotIcon slot={s} size={20} className="text-sys/80" />
              <span className="text-[11px] font-semibold text-hud-text">{AUGMENTATION_SLOT_NAMES[s]}</span>
              <span className="flex gap-1">{[1, 2, 3].map(t => <span key={t} className={cx('h-1.5 w-3 rounded-full', t <= (p?.tier ?? 0) ? 'bg-sys' : 'bg-white/10')} />)}</span>
              {waiting && <span className="absolute right-1.5 top-1.5 h-2 w-2 rounded-full bg-cred" />}
            </button>
          );
        })}
      </div>
      <UpgradeTree key={equippedAugmentations[slot]!.id} slot={slot} item={equippedAugmentations[slot]!} />
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
            <p className="text-sm text-aug">{cls.specialAbility.name}. {cls.specialAbility.description}</p>
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

const PAGE_TITLE: Record<Tab, string> = { loadout: 'Moves', implants: 'Implants', upgrades: 'Upgrades', status: 'Self', allies: 'Allies' };

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
  const foe = roomNow.threat !== undefined ? getBossPreview(roomNow.threat, progression.deathCount === 0, roomNow.enemy) : null;
  const onward = map.done ? nextChapter(map.chapter) : null;
  const { gold, items, equippedAugmentations } = useInventory();
  const { progress, availablePoints } = useAugmentTrees();
  const { slots } = useLoadout();
  const { isMuted, toggleMute } = useAudio();
  const [page, setPage] = useState<Tab | null>(null);
  const pool = useActionPool();
  const met = useAllies(s => s.met);

  const installed = AUGMENTATION_SLOTS.filter(s => equippedAugmentations[s] !== null);
  const fitsNow = items.some(i => i.type === 'augmentation' && i.slot && equippedAugmentations[i.slot] === null);
  const upgradeWaits = installed.some(s => upgradeWaiting(s, equippedAugmentations[s]!, progress, availablePoints));
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
      </Page>
    </Screen>
  );
}
