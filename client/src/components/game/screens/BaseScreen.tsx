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
import { Screen, Panel, Card, Label, Btn, Chip, Meter, Stat, ConfirmDialog, Segmented, cx } from '../hud';
import { Inventory } from '../Inventory';
import { useActionPool } from '../useActionPool';
import { rangeText } from '../itemText';

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

function LoadoutTab() {
  const { slots, editingSlot, setSlot, setEditingSlot } = useLoadout();
  const pool = useActionPool();
  return (
    <div className="space-y-4">
      <p className="text-sm leading-relaxed text-hud-dim">You take four actions into every fight. Tap a slot to change it.</p>
      <div className="grid grid-cols-4 gap-2">
        {slots.map((a, i) => (
          <button
            key={i}
            onClick={() => setEditingSlot(editingSlot === i ? null : i)}
            className={cx(
              'flex h-20 flex-col items-center justify-center gap-1 rounded-2xl px-1 text-center transition',
              editingSlot === i ? 'bg-sys/15 ring-2 ring-sys/70' : a ? 'bg-white/[0.06] hover:bg-white/[0.09]' : 'border border-dashed border-white/10 text-hud-faint hover:bg-white/[0.04]',
            )}
            aria-pressed={editingSlot === i}
          >
            {a ? (
              <>
                <span className={cx('w-full truncate font-display text-[13px] font-semibold', actionColor(a))}>{a.name}</span>
                {getMechanicTag(a) && <span className="text-[10px] capitalize text-hud-dim">{getMechanicTag(a)!.toLowerCase()}</span>}
              </>
            ) : (
              <span className="text-xs">+ Slot {i + 1}</span>
            )}
          </button>
        ))}
      </div>

      {editingSlot !== null && (
        <div className="rise-in space-y-2">
          <div className="flex items-center justify-between">
            <Label>Choose an action for slot {editingSlot + 1}</Label>
            {slots[editingSlot] && (
              <button className="text-xs font-semibold text-rose-300" onClick={() => setSlot(editingSlot, null)}>Empty slot</button>
            )}
          </div>
          {pool.map(a => {
            const here = slots[editingSlot]?.key === a.key;
            const elsewhere = here ? -1 : slots.findIndex(s => s?.key === a.key);
            return (
              <button
                key={a.key}
                onClick={() => setSlot(editingSlot, a)}
                className={cx('flex w-full items-start gap-3 rounded-2xl px-4 py-3 text-left transition', here ? 'bg-sys/10 ring-2 ring-sys/60' : 'bg-white/[0.04] hover:bg-white/[0.07]')}
              >
                <span className="min-w-0 flex-1 space-y-1">
                  <span className="flex items-center gap-2">
                    <span className={cx('font-display text-[15px] font-semibold', actionColor(a))}>{a.name}</span>
                    <Chip>{a.source === 'base' ? 'Core' : a.source === 'augment' ? 'Implant' : a.source === 'class' ? 'Class' : 'Weapon'}</Chip>
                  </span>
                  {a.description && <span className="block text-[13px] text-hud-dim">{a.description}</span>}
                  <ActionDetail a={a} />
                </span>
                {here ? <Chip tone="sys">Equipped</Chip> : elsewhere >= 0 ? <Chip>In slot {elsewhere + 1}</Chip> : null}
              </button>
            );
          })}
          <p className="pt-1 text-xs text-hud-faint">More actions come from active implants (arms, legs and eyes), your class, and weapons from the Grey Lane market.</p>
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
          <Stat label="Reboots" value={progression.deathCount} />
        </div>
      </Panel>

      <div className="grid grid-cols-2 gap-2 pt-1">
        <Btn onClick={toggleMute}>{isMuted ? 'Sound off' : 'Sound on'}</Btn>
        <Btn onClick={restartTutorial}>Replay tutorial</Btn>
        <Btn className="col-span-2" variant="danger" onClick={() => setConfirmReset(true)}>Wipe save</Btn>
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
            <span className="text-[11px] text-hud-faint">{progression.deathCount} reboot{progression.deathCount === 1 ? '' : 's'}</span>
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
