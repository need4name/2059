import { useState } from 'react';
import { useCombat } from '@/lib/stores/useCombat';
import { useInventory } from '@/lib/stores/useInventory';
import { useLoadout, getMechanicTag, LoadoutAction } from '@/lib/stores/useLoadout';
import { useAugmentTrees } from '@/lib/stores/useAugmentTrees';
import { useAudio } from '@/lib/stores/useAudio';
import { AUGMENT_TREES } from '@/lib/combat/augmentTrees';
import { CLASS_DEFINITIONS, createPlayer, getBossPreview, BOSS_DOSSIERS } from '@/lib/combat/actions';
import { AUGMENTATION_SLOTS, AUGMENTATION_SLOT_ICONS, augmentKind } from '@/lib/combat/types';
import { actionForItem, healthCostOf } from '@/lib/combat/augments';
import { useTutorial } from '@/lib/stores/useTutorial';
import { Screen, Panel, Card, Label, Btn, Chip, Meter, Stat, ConfirmDialog, Segmented, Sheet, cx } from '../hud';
import { Inventory } from '../Inventory';
import { useActionPool } from '../useActionPool';
import { rangeText } from '../itemText';
import { exportSave, importSave } from '@/lib/save';

type Tab = 'loadout' | 'implants' | 'upgrades' | 'status';

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
    </span>
  );
}

const SOURCE_GROUPS: { source: LoadoutAction['source']; label: string; empty: string }[] = [
  { source: 'base', label: 'Core', empty: '' },
  { source: 'augment', label: 'From your implants', empty: 'Install an arm, leg or eye implant to get its move.' },
  { source: 'weapon', label: 'Weapon', empty: 'Buy a weapon at the Grey Lane market.' },
  { source: 'class', label: 'Firmware', empty: '' },
];

function LoadoutTab() {
  const { slots, setSlot } = useLoadout();
  const pool = useActionPool();
  const [replacing, setReplacing] = useState<LoadoutAction | null>(null);
  const slotOf = (a: LoadoutAction) => slots.findIndex(s => s?.key === a.key);

  const add = (a: LoadoutAction) => {
    const free = slots.findIndex(s => s === null);
    if (free >= 0) setSlot(free, a);
    else setReplacing(a);
  };

  return (
    <div className="space-y-5">
      <div className="space-y-2">
        <div className="flex items-baseline justify-between">
          <Label>Your fight bar</Label>
          <span className="text-xs text-hud-faint">{slots.filter(Boolean).length} of {slots.length}</span>
        </div>
        <div className="grid grid-cols-2 gap-2">
          {slots.map((a, i) => a ? (
            <div key={i} className="relative flex min-h-[76px] flex-col justify-between rounded-2xl bg-white/[0.06] p-3">
              <span className={cx('pr-6 font-display text-[14px] font-semibold leading-tight', actionColor(a))}>{a.name}</span>
              <span className="text-[11px] text-hud-dim">
                {a.damage ? `${a.damage} dmg` : a.defenseBoost ? `+${a.defenseBoost} guard` : ''}
                {(a.heatGenerated ?? 0) !== 0 && <span className={(a.heatGenerated ?? 0) > 0 ? 'text-orange-300' : 'text-sys'}> · {(a.heatGenerated ?? 0) > 0 ? '+' : ''}{a.heatGenerated} heat</span>}
              </span>
              <button onClick={() => setSlot(i, null)} aria-label={`Remove ${a.name}`} className="absolute right-2 top-2 flex h-6 w-6 items-center justify-center rounded-full text-hud-faint hover:bg-white/10 hover:text-hud-text">×</button>
            </div>
          ) : (
            <div key={i} className="flex min-h-[76px] items-center justify-center rounded-2xl border border-dashed border-white/10 text-xs text-hud-faint">Empty</div>
          ))}
        </div>
      </div>

      <div className="space-y-4">
        <Label>Available moves</Label>
        {SOURCE_GROUPS.map(g => {
          const moves = pool.filter(a => a.source === g.source);
          if (!moves.length && !g.empty) return null;
          return (
            <div key={g.source} className="space-y-1.5">
              <div className="text-xs font-semibold text-hud-dim">{g.label}</div>
              {moves.length === 0 && <p className="text-xs text-hud-faint">{g.empty}</p>}
              {moves.map(a => {
                const at = slotOf(a);
                return (
                  <div key={a.key} className={cx('flex items-center gap-3 rounded-2xl px-3.5 py-3', at >= 0 ? 'bg-sys/[0.07] ring-1 ring-sys/30' : 'bg-white/[0.04]')}>
                    <div className="min-w-0 flex-1 space-y-0.5">
                      <div className={cx('font-display text-[14px] font-semibold leading-tight', actionColor(a))}>{a.name}</div>
                      <ActionDetail a={a} />
                    </div>
                    {at >= 0
                      ? <Btn size="sm" variant="ghost" onClick={() => setSlot(at, null)}>Remove</Btn>
                      : <Btn size="sm" variant="primary" onClick={() => add(a)}>Add</Btn>}
                  </div>
                );
              })}
            </div>
          );
        })}
      </div>

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

function UpgradesTab() {
  const { equippedAugmentations } = useInventory();
  const { progress, availablePoints, choosePath, upgradeTier } = useAugmentTrees();
  const equipped = AUGMENTATION_SLOTS.filter(s => equippedAugmentations[s] !== null);

  if (equipped.length === 0) {
    return <Card raised className="px-4 py-10 text-center text-sm text-hud-dim">Install an implant to open its upgrade tree.</Card>;
  }

  return (
    <div className="space-y-3">
      <p className="text-sm leading-relaxed text-hud-dim">
        Only installed implants can be upgraded. Picking a path is free; each tier after that costs 1 point. You earn points from wins and level-ups. Upgrades stay with the implant if you take it out.
      </p>
      {equipped.map(slot => {
        const tree = AUGMENT_TREES[slot];
        if (!tree) return null;
        const item = equippedAugmentations[slot]!;
        const prog = progress[item.id];
        const active = augmentKind(slot) === 'active';
        const moveAt = (p: 'A' | 'B' | null, t: number) => actionForItem(item, { path: p, tier: t });
        const tier = prog?.tier ?? 0;
        const path = prog?.chosenPath ?? null;
        return (
          <Panel
            key={slot}
            label={<span className="flex items-center gap-2"><span className="text-lg">{AUGMENTATION_SLOT_ICONS[slot]}</span>{item.name.replace(/^\[[A-Z]+\]\s*/, '')}</span>}
            right={path ? <Chip tone={tier === 3 ? 'cred' : 'sys'}>{tree.paths[path].name.toLowerCase()} · tier {tier}</Chip> : <Chip tone="cred">Pick a path</Chip>}
          >
            {!path ? (
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                {(['A', 'B'] as const).map(p => {
                  const first = tree.paths[p].tiers[0];
                  return (
                    <button key={p} onClick={() => choosePath(slot, p)} className="flex flex-col gap-1 rounded-2xl bg-white/[0.05] p-3.5 text-left transition hover:bg-sys/10 hover:ring-1 hover:ring-sys/40">
                      <span className="font-display text-[15px] font-semibold capitalize text-hud-text">{tree.paths[p].name.toLowerCase()}</span>
                      <span className="text-[13px] leading-snug text-hud-dim">{tree.paths[p].description}</span>
                      <span className="text-xs text-sys">Tier 1: {first.augmentLabel}{active ? ` · ${p === 'A' ? 'harder hitting, hotter' : 'cooler, more accurate'}` : ''}</span>
                    </button>
                  );
                })}
              </div>
            ) : (
              <div className="space-y-3">
                <div className="flex items-center gap-1.5">
                  {[1, 2, 3].map(t => (
                    <div key={t} className={cx('h-2 flex-1 rounded-full', t <= tier ? (t === 3 ? 'bg-cred' : 'bg-sys') : 'bg-white/[0.08]')} />
                  ))}
                  <span className="ml-1 text-xs text-hud-dim">{tier === 3 ? 'Max' : `${tier}/3`}</span>
                </div>
                {tier >= 1 && <div className="text-sm text-hud-text">{tree.paths[path].tiers[tier - 1].augmentLabel}</div>}
                {tier < 3 && (() => {
                  const next = tree.paths[path].tiers[tier as 0 | 1 | 2];
                  const stats = [
                    next.attackBonus > 0 && `+${next.attackBonus} ATK`,
                    next.defenseBonus > 0 && `+${next.defenseBonus} DEF`,
                    next.hpBonus > 0 && `+${next.hpBonus} HP`,
                    next.moveRange ? `+${next.moveRange} move` : '',
                  ].filter(Boolean).join(' · ');
                  const capstone = tier + 1 === 3;
                  return (
                    <div className={cx('space-y-1 rounded-2xl p-3', capstone ? 'bg-gradient-to-br from-cred/15 to-transparent' : 'bg-white/[0.04]')}>
                      <div className={cx('text-xs font-semibold', capstone ? 'text-cred' : 'text-hud-dim')}>{capstone ? '★ Capstone' : `Next: tier ${tier + 1}`}</div>
                      <div className="text-sm text-hud-text">{next.augmentLabel}</div>
                      {active && (() => { const m = moveAt(path, tier + 1); return m ? <div className="text-xs text-sys">{m.name}: {m.damage ? `${m.damage} damage` : `+${m.defenseBoost} guard`} · {m.heatGenerated! > 0 ? '+' : ''}{m.heatGenerated} heat</div> : null; })()}
                      {stats && <div className="text-xs text-ok">{stats}</div>}
                    </div>
                  );
                })()}
                {tier < 3 && (
                  <Btn className="w-full" size="sm" variant={availablePoints > 0 ? 'gold' : 'secondary'} disabled={availablePoints < 1} onClick={() => upgradeTier(slot)}>
                    {availablePoints > 0 ? `Upgrade to tier ${tier + 1} · 1 point` : 'Needs 1 point'}
                  </Btn>
                )}
              </div>
            )}
          </Panel>
        );
      })}
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
        <p className="text-sm leading-relaxed text-hud-dim">Your progress is saved on this device. Copy it somewhere safe to back it up or move it to another phone.</p>
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
  const restartTutorial = useTutorial(s => s.restart);
  const [confirmReset, setConfirmReset] = useState(false);
  const equipped = AUGMENTATION_SLOTS.filter(s => equippedAugmentations[s] !== null);
  const tree = getTreeStatBonuses(equipped);
  const stats = createPlayer({ ...getTotalAugmentationBonuses(), treeAttack: tree.attack, treeDefense: tree.defense, treeHp: tree.hp }, playerClass);
  const cls = CLASS_DEFINITIONS[playerClass];

  return (
    <div className="space-y-3">
      <Panel label="Your systems">
        <div className="grid grid-cols-3 gap-x-4 gap-y-5">
          <Stat label="Health" value={stats.maxHp} tone="text-ok" />
          <Stat label="Structure" value={stats.maxStructuralHp} />
          <Stat label="Move" value={`${2 + (tree.moveRange ?? 0)} tiles`} />
          <Stat label="Attack" value={stats.physicalAttack} tone="text-rose-300" />
          <Stat label="Disrupt" value={stats.structuralAttack} tone="text-rose-300" />
          <Stat label="Evasion" value={stats.evasion} />
          <Stat label="Armour" value={stats.physicalDefense} tone="text-sky-300" />
          <Stat label="Shielding" value={stats.structuralDefense} tone="text-sky-300" />
        </div>
        {equipped.length > 0 && (() => {
          const cost = equipped.reduce((n, sl) => n + healthCostOf(equippedAugmentations[sl]!), 0);
          return cost > 0 ? <p className="mt-4 text-xs text-hostile">Your implants cost you {cost} max health (rejection, infection and strain).</p> : null;
        })()}
        <p className="mt-4 text-xs leading-relaxed text-hud-faint">Structure is your implants' own health: each part adds to it, heavier makers more. Attack and Armour deal with health. Disrupt and Shielding deal with structure; at zero structure you malfunction and your attacks get shaky until you Brace or patch up.</p>
      </Panel>

      <Panel label="Combat profile">
        <div className="space-y-1">
          <div className="font-display text-lg font-semibold text-hud-text">{cls.name}</div>
          <p className="text-sm text-hud-dim">{cls.description}</p>
          {playerClass !== 'none' ? (
            <p className="text-sm text-aug">Special: {cls.specialAbility.name}. {cls.specialAbility.description}</p>
          ) : (
            <p className="text-sm text-hud-faint">Fall at threat level 11 or higher to unlock the Enforcer and Operative profiles.</p>
          )}
        </div>
      </Panel>

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
        <Btn onClick={restartTutorial}>Replay tutorial</Btn>
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

export function BaseScreen() {
  const { playerClass, progression, bossLevel, startCombat, openMarket } = useCombat();
  const { gold, items } = useInventory();
  const { availablePoints } = useAugmentTrees();
  const { isMuted, toggleMute } = useAudio();
  const [tab, setTab] = useState<Tab>('loadout');
  const target = getBossPreview(bossLevel, progression.deathCount === 0);
  const isKing = target.name === 'Patchwork King';
  const spare = items.filter(i => i.type === 'augmentation').length;

  return (
    <Screen footer={<Btn variant="primary" size="lg" className="w-full" onClick={startCombat}>Engage target</Btn>}>
      <div className="space-y-5 px-4 pb-6 pt-6">
        {/* Header */}
        <header className="flex items-start justify-between gap-3">
          <div className="min-w-0 space-y-1.5">
            <div className="text-xs font-medium text-hud-dim">Offshore Sector 7</div>
            <h1 className="font-display text-[26px] font-semibold leading-tight text-white">{CLASS_DEFINITIONS[playerClass].name}</h1>
            <div className="flex items-center gap-2.5">
              <span className="rounded-full bg-sys/10 px-2 py-0.5 text-xs font-bold text-sys">Lv {progression.level}</span>
              <Meter value={progression.currentXp} max={progression.xpToNextLevel} tone="sys" className="w-24" />
              <span className="text-[11px] text-hud-faint">{progression.currentXp}/{progression.xpToNextLevel} XP</span>
            </div>
          </div>
          <div className="flex flex-col items-end gap-1">
            <span className="rounded-full bg-cred/10 px-3 py-1 font-display text-base font-semibold text-cred">¤ {gold}</span>
            <span className="text-[11px] text-hud-faint">{progression.deathCount} host{progression.deathCount === 1 ? '' : 's'} lost</span>
            <button onClick={toggleMute} className="text-[11px] font-semibold text-hud-dim hover:text-hud-text" aria-label={isMuted ? 'Turn sound on' : 'Turn sound off'}>
              {isMuted ? '🔇 Sound off' : '🔊 Sound on'}
            </button>
          </div>
        </header>

        {/* Next target */}
        <div className="relative overflow-hidden rounded-3xl p-5 ring-1 ring-white/[0.06]" style={{ background: `linear-gradient(135deg, ${target.color}2e 0%, rgba(15,21,34,0.92) 55%)` }}>
          <div className="pointer-events-none absolute -right-10 -top-10 h-40 w-40 rounded-full blur-3xl" style={{ background: `${target.color}40` }} />
          <div className="relative flex items-center justify-between">
            <span className="text-xs font-medium text-hud-dim">Next target</span>
            <Chip tone={isKing ? 'cred' : 'hostile'}>{isKing ? 'Boss · ' : ''}Threat {bossLevel}</Chip>
          </div>
          <div className="relative mt-2 font-display text-[22px] font-semibold leading-tight" style={{ color: target.color }}>{target.name}</div>
          <p className="relative mt-1.5 text-sm leading-relaxed text-hud-text/80">{BOSS_DOSSIERS[target.name]}</p>
          <div className="relative mt-3 text-xs text-hud-dim">About {target.hp} HP</div>
        </div>

        <button onClick={openMarket} className="flex w-full items-center gap-3 rounded-3xl bg-cred/[0.07] p-4 text-left ring-1 ring-cred/20 transition hover:bg-cred/10">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-cred/10 text-xl">🛒</span>
          <span className="min-w-0 flex-1">
            <span className="block font-display text-[15px] font-semibold text-hud-text">Grey Lane market</span>
            <span className="block text-xs text-hud-dim">Buy and sell implants, stims and weapons</span>
          </span>
          <span className="text-hud-dim">›</span>
        </button>

        <Segmented
          value={tab}
          onChange={setTab}
          options={[
            { id: 'loadout', label: 'Loadout' },
            { id: 'implants', label: 'Implants', badge: spare || undefined },
            { id: 'upgrades', label: 'Upgrades', badge: availablePoints || undefined },
            { id: 'status', label: 'Status' },
          ]}
        />

        <div key={tab} className="rise-in">
          {tab === 'loadout' && <LoadoutTab />}
          {tab === 'implants' && <Inventory />}
          {tab === 'upgrades' && <UpgradesTab />}
          {tab === 'status' && <StatusTab />}
        </div>
      </div>
    </Screen>
  );
}
