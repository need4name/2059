import { useState } from 'react';
import { useCombat } from '@/lib/stores/useCombat';
import { useInventory } from '@/lib/stores/useInventory';
import { useLoadout, getMechanicTag, LoadoutAction } from '@/lib/stores/useLoadout';
import { useAugmentTrees } from '@/lib/stores/useAugmentTrees';
import { useAudio } from '@/lib/stores/useAudio';
import { AUGMENT_TREES } from '@/lib/combat/augmentTrees';
import { CLASS_DEFINITIONS, createPlayer, getBossPreview, BOSS_DOSSIERS } from '@/lib/combat/actions';
import { AUGMENTATION_SLOTS, AUGMENTATION_SLOT_ICONS } from '@/lib/combat/types';
import { Screen, Panel, Label, Btn, Chip, Meter, Stat, ConfirmDialog } from '../hud';
import { Inventory } from '../Inventory';
import { useActionPool } from '../useActionPool';
import { rangeText } from '../itemText';

type Tab = 'loadout' | 'implants' | 'upgrades' | 'status';

function actionTone(a: LoadoutAction) {
  if (a.type === 'brace') return 'text-sys border-sys/40';
  if (a.type === 'special' || a.source === 'class') return 'text-aug border-aug/40';
  if (a.source === 'weapon') return 'text-cred border-cred/40';
  if (a.source === 'augment') return 'text-ok border-ok/40';
  return 'text-hud-text border-hud-line';
}

function ActionDetail({ a }: { a: LoadoutAction }) {
  const heat = a.heatGenerated ?? 0;
  return (
    <span className="flex flex-wrap gap-x-3 gap-y-0.5 font-mono text-[10px] text-hud-dim">
      {a.damage ? <span>{a.damage} base dmg</span> : null}
      {a.defenseBoost ? <span>+{a.defenseBoost} guard</span> : null}
      {a.healing ? <span>+{a.healing} HP</span> : null}
      <span>{rangeText(a)}</span>
      {heat !== 0 && <span className={heat > 0 ? 'text-orange-300' : 'text-sys'}>{heat > 0 ? '+' : ''}{heat} heat</span>}
    </span>
  );
}

function LoadoutTab() {
  const { slots, editingSlot, setSlot, setEditingSlot } = useLoadout();
  const pool = useActionPool();
  return (
    <div className="space-y-4">
      <p className="text-xs leading-relaxed text-hud-dim">Four action slots go into every fight. Tap a slot to change it.</p>
      <div className="grid grid-cols-4 gap-1.5">
        {slots.map((a, i) => (
          <button
            key={i}
            onClick={() => setEditingSlot(editingSlot === i ? null : i)}
            className={`flex h-20 flex-col items-center justify-center gap-1 border px-1 text-center transition-colors ${
              editingSlot === i ? 'border-sys bg-sys/10' : a ? `bg-hud-raised ${actionTone(a)}` : 'border-dashed border-hud-line text-hud-faint hover:border-hud-dim'
            }`}
            aria-pressed={editingSlot === i}
          >
            {a ? (
              <>
                <span className="w-full truncate font-display text-[12px] font-semibold uppercase tracking-wide">{a.name}</span>
                {getMechanicTag(a) && <span className="font-mono text-[9px] uppercase tracking-wider opacity-60">{getMechanicTag(a)}</span>}
              </>
            ) : (
              <span className="font-mono text-[11px]">+ Slot {i + 1}</span>
            )}
          </button>
        ))}
      </div>

      {editingSlot !== null && (
        <div className="rise-in space-y-1.5">
          <div className="flex items-center justify-between">
            <Label>Choose for slot {editingSlot + 1}</Label>
            {slots[editingSlot] && (
              <button className="font-mono text-[11px] uppercase tracking-wider text-hostile" onClick={() => setSlot(editingSlot, null)}>Empty slot</button>
            )}
          </div>
          {pool.map(a => {
            const here = slots[editingSlot]?.key === a.key;
            const elsewhere = !here && slots.findIndex(s => s?.key === a.key);
            return (
              <button
                key={a.key}
                onClick={() => setSlot(editingSlot, a)}
                className={`flex w-full items-start gap-3 border px-3 py-2.5 text-left transition-colors ${here ? 'border-sys bg-sys/10' : 'border-hud-line bg-hud-raised/60 hover:border-hud-dim'}`}
              >
                <span className="min-w-0 flex-1 space-y-1">
                  <span className="flex items-center gap-2">
                    <span className={`font-display text-sm font-semibold uppercase tracking-wide ${actionTone(a).split(' ')[0]}`}>{a.name}</span>
                    <Chip>{a.source === 'base' ? 'Core' : a.source}</Chip>
                  </span>
                  {a.description && <span className="block text-xs text-hud-dim">{a.description}</span>}
                  <ActionDetail a={a} />
                </span>
                {here ? <Chip tone="sys">Equipped</Chip> : typeof elsewhere === 'number' && elsewhere >= 0 ? <Chip>Slot {elsewhere + 1}</Chip> : null}
              </button>
            );
          })}
          <p className="pt-1 text-[11px] text-hud-faint">More actions unlock from your class, upgrade trees and weapons bought at the Arms Market.</p>
        </div>
      )}
    </div>
  );
}

function UpgradesTab() {
  const { equippedAugmentations } = useInventory();
  const { progress, availablePoints, choosePath, upgradeTier } = useAugmentTrees();
  const equipped = AUGMENTATION_SLOTS.filter(s => equippedAugmentations[s] !== null);

  if (equipped.length === 0) {
    return <p className="border border-dashed border-hud-line px-3 py-8 text-center text-xs text-hud-faint">Install an implant to open its upgrade tree.</p>;
  }

  return (
    <div className="space-y-3">
      <p className="text-xs leading-relaxed text-hud-dim">
        Each installed implant has two paths. Choosing a path is free; each tier after costs 1 point. You earn 1 point per level. Swapping an implant keeps its tree.
      </p>
      {equipped.map(slot => {
        const tree = AUGMENT_TREES[slot];
        if (!tree) return null;
        const prog = progress[slot];
        const tier = prog?.tier ?? 0;
        const path = prog?.chosenPath ?? null;
        return (
          <Panel
            key={slot}
            label={<span className="flex items-center gap-2"><span className="text-base normal-case">{AUGMENTATION_SLOT_ICONS[slot]}</span>{tree.displayName}</span>}
            right={path ? <Chip tone={tier === 3 ? 'cred' : 'sys'}>{tree.paths[path].name} · T{tier}</Chip> : <Chip tone="cred">Choose path</Chip>}
          >
            {!path ? (
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                {(['A', 'B'] as const).map(p => {
                  const first = tree.paths[p].tiers[0];
                  return (
                    <button key={p} onClick={() => choosePath(slot, p)} className="flex flex-col gap-1 border border-hud-line bg-hud-raised/60 p-3 text-left transition-colors hover:border-sys">
                      <span className="font-display text-sm font-semibold uppercase tracking-wider text-hud-text">{tree.paths[p].name}</span>
                      <span className="text-xs leading-snug text-hud-dim">{tree.paths[p].description}</span>
                      <span className="font-mono text-[10px] text-sys">T1: {first.augmentLabel}{first.combatAction ? ` · unlocks ${first.combatAction.name}` : ''}</span>
                    </button>
                  );
                })}
              </div>
            ) : (
              <div className="space-y-3">
                <div className="flex items-center gap-1.5">
                  {[1, 2, 3].map(t => (
                    <div key={t} className={`h-1.5 flex-1 ${t <= tier ? (t === 3 ? 'bg-cred' : 'bg-sys') : 'bg-hud-line'}`} />
                  ))}
                  <span className="ml-1 font-mono text-[10px] text-hud-dim">{tier === 3 ? 'MAX' : `${tier}/3`}</span>
                </div>
                {tier >= 1 && <div className="text-xs text-hud-text">▸ {tree.paths[path].tiers[tier - 1].augmentLabel}</div>}
                {tier < 3 && (() => {
                  const next = tree.paths[path].tiers[tier as 0 | 1 | 2];
                  const stats = [
                    next.attackBonus > 0 && `+${next.attackBonus} ATK`,
                    next.defenseBonus > 0 && `+${next.defenseBonus} DEF`,
                    next.hpBonus > 0 && `+${next.hpBonus} HP`,
                    next.moveRange ? `+${next.moveRange} move` : '',
                  ].filter(Boolean).join(' · ');
                  return (
                    <div className={`space-y-1 border p-2.5 ${tier + 1 === 3 ? 'border-cred/40 bg-cred/5' : 'border-hud-line bg-hud-raised/40'}`}>
                      <Label className={tier + 1 === 3 ? 'text-cred' : ''}>{tier + 1 === 3 ? 'Capstone' : `Tier ${tier + 1}`}</Label>
                      <div className="text-xs text-hud-text">{next.augmentLabel}</div>
                      {next.combatAction && <div className="font-mono text-[11px] text-sys">Action: {next.combatAction.name}{next.combatAction.damage ? ` · ${next.combatAction.damage} dmg` : ''}</div>}
                      {stats && <div className="font-mono text-[11px] text-ok">{stats}</div>}
                    </div>
                  );
                })()}
                {tier < 3 && (
                  <Btn className="w-full" size="sm" variant={availablePoints > 0 ? 'gold' : 'secondary'} disabled={availablePoints < 1} onClick={() => upgradeTier(slot)}>
                    {availablePoints > 0 ? `Upgrade to tier ${tier + 1} · 1 pt` : 'Need 1 point'}
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

function StatusTab() {
  const { playerClass, resetAll, progression, bossLevel } = useCombat();
  const { getTotalAugmentationBonuses, equippedAugmentations } = useInventory();
  const { getTreeStatBonuses } = useAugmentTrees();
  const { isMuted, toggleMute } = useAudio();
  const [confirmReset, setConfirmReset] = useState(false);
  const equipped = AUGMENTATION_SLOTS.filter(s => equippedAugmentations[s] !== null);
  const tree = getTreeStatBonuses(equipped);
  const stats = createPlayer({ ...getTotalAugmentationBonuses(), treeAttack: tree.attack, treeDefense: tree.defense, treeHp: tree.hp }, playerClass);
  const cls = CLASS_DEFINITIONS[playerClass];

  return (
    <div className="space-y-4">
      <Panel label="System status">
        <div className="grid grid-cols-3 gap-4">
          <Stat label="HP" value={stats.maxHp} tone="text-ok" />
          <Stat label="Structure" value={stats.maxStructuralHp} />
          <Stat label="Move" value={`${1 + (tree.moveRange ?? 0)} tile${tree.moveRange ? 's' : ''}`} />
          <Stat label="P-ATK" value={stats.physicalAttack} tone="text-hostile" />
          <Stat label="S-ATK" value={stats.structuralAttack} tone="text-hostile" />
          <Stat label="Evasion" value={stats.evasion} />
          <Stat label="P-DEF" value={stats.physicalDefense} tone="text-sky-400" />
          <Stat label="S-DEF" value={stats.structuralDefense} tone="text-sky-400" />
        </div>
        <p className="mt-3 text-[11px] leading-relaxed text-hud-faint">Bio damage (P) hits HP. Structural damage (S) hits structure; at zero you malfunction and your attacks become unreliable until you Brace or patch.</p>
      </Panel>

      <Panel label="Combat profile">
        <div className="space-y-1">
          <div className="font-display text-base font-semibold uppercase tracking-wide text-hud-text">{cls.name}</div>
          <p className="text-xs text-hud-dim">{cls.description}</p>
          {playerClass !== 'none' ? (
            <p className="text-xs text-aug">Special: {cls.specialAbility.name} · {cls.specialAbility.description}</p>
          ) : (
            <p className="text-xs text-hud-faint">Die at threat level 11 or higher to unlock the Enforcer and Operative profiles.</p>
          )}
        </div>
      </Panel>

      <Panel label="Run">
        <div className="grid grid-cols-3 gap-4">
          <Stat label="Threat" value={`LV ${bossLevel}`} />
          <Stat label="Level" value={progression.level} />
          <Stat label="Reboots" value={progression.deathCount} />
        </div>
      </Panel>

      <div className="grid grid-cols-2 gap-2">
        <Btn onClick={toggleMute}>{isMuted ? 'Sound off' : 'Sound on'}</Btn>
        <Btn variant="danger" onClick={() => setConfirmReset(true)}>Wipe save</Btn>
      </div>

      <ConfirmDialog
        open={confirmReset}
        title="Wipe all progress?"
        body="This deletes your save: level, implants, credits, reboots and unlocked classes. It can't be undone."
        confirmLabel="Wipe save"
        danger
        onCancel={() => setConfirmReset(false)}
        onConfirm={() => { setConfirmReset(false); resetAll(); }}
      />
    </div>
  );
}

export function BaseScreen() {
  const { playerClass, progression, bossLevel, startCombat } = useCombat();
  const { gold, items } = useInventory();
  const { availablePoints } = useAugmentTrees();
  const { isMuted, toggleMute } = useAudio();
  const [tab, setTab] = useState<Tab>('loadout');
  const target = getBossPreview(bossLevel);
  const isKing = target.name === 'Patchwork King';
  const spare = items.filter(i => i.type === 'augmentation').length;

  const tabs: { id: Tab; label: string; badge?: number }[] = [
    { id: 'loadout', label: 'Loadout' },
    { id: 'implants', label: 'Implants', badge: spare || undefined },
    { id: 'upgrades', label: 'Upgrades', badge: availablePoints || undefined },
    { id: 'status', label: 'Status' },
  ];

  return (
    <Screen footer={<Btn variant="primary" size="lg" className="w-full" onClick={startCombat}>Engage target</Btn>}>
      <div className="space-y-5 px-4 pb-6 pt-5">
        {/* Header */}
        <header className="flex items-start justify-between gap-3">
          <div className="min-w-0 space-y-1">
            <Label>Offshore Sector 7</Label>
            <h1 className="font-display text-2xl font-semibold uppercase tracking-wide text-hud-text">{CLASS_DEFINITIONS[playerClass].name}</h1>
            <div className="flex items-center gap-2">
              <span className="font-mono text-xs text-hud-dim">LV {progression.level}</span>
              <Meter value={progression.currentXp} max={progression.xpToNextLevel} tone="sys" className="w-28" />
              <span className="font-mono text-[10px] text-hud-faint">{progression.currentXp}/{progression.xpToNextLevel} XP</span>
            </div>
          </div>
          <div className="flex flex-col items-end gap-1.5">
            <button onClick={toggleMute} className="font-mono text-[11px] uppercase tracking-wider text-hud-dim hover:text-hud-text" aria-label={isMuted ? 'Turn sound on' : 'Turn sound off'}>
              {isMuted ? '♪ off' : '♪ on'}
            </button>
            <span className="font-display text-lg font-semibold tabular-nums text-cred">¤ {gold}</span>
            <span className="font-mono text-[10px] uppercase tracking-wider text-hud-faint">Reboots {progression.deathCount}</span>
          </div>
        </header>

        {/* Next target */}
        <section className={`relative overflow-hidden border bg-hud-panel p-4 ${isKing ? 'border-cred/50' : 'border-hud-line'}`}>
          <div className="absolute inset-y-0 left-0 w-1" style={{ background: target.color }} />
          <div className="flex items-center justify-between">
            <Label>Next target</Label>
            <Chip tone={isKing ? 'cred' : 'hostile'}>{isKing ? 'Boss · ' : ''}Threat LV {bossLevel}</Chip>
          </div>
          <div className="mt-2 font-display text-xl font-semibold uppercase tracking-wide" style={{ color: target.color }}>{target.name}</div>
          <p className="mt-1 text-xs leading-relaxed text-hud-dim">{BOSS_DOSSIERS[target.name]}</p>
          <div className="mt-2 font-mono text-[11px] text-hud-faint">~{target.hp} HP</div>
        </section>

        {/* Tabs */}
        <nav className="grid grid-cols-4 border border-hud-line" role="tablist">
          {tabs.map(t => (
            <button
              key={t.id}
              role="tab"
              aria-selected={tab === t.id}
              onClick={() => setTab(t.id)}
              className={`relative h-10 font-display text-[11px] font-semibold uppercase tracking-[0.14em] transition-colors ${tab === t.id ? 'bg-hud-raised text-sys' : 'text-hud-dim hover:text-hud-text'}`}
            >
              <span className="inline-flex items-center gap-1">
                {t.label}
                {t.badge ? <span className="min-w-[15px] bg-cred px-1 font-mono text-[9px] leading-[15px] text-hud-bg">{t.badge}</span> : null}
              </span>
              {tab === t.id && <span className="absolute inset-x-0 bottom-0 h-0.5 bg-sys" />}
            </button>
          ))}
        </nav>

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
