import { useState } from 'react';
import { useCombat } from '@/lib/stores/useCombat';
import { useInventory } from '@/lib/stores/useInventory';
import { useLoadout, getMechanicTag, LoadoutAction } from '@/lib/stores/useLoadout';
import { useAudio } from '@/lib/stores/useAudio';
import { estimateDamage } from '@/lib/combat/actions';
import { canHitTarget } from '@/lib/combat/patterns';
import { chebyshev } from '@/lib/combat/grid';
import { getHeatMultipliers, getFlankBonus, getHeatPhase } from '@/lib/combat/types';
import { CombatScene } from '../CombatScene';
import { HeatBar } from '../HeatBar';
import { Btn, Chip, Meter, ConfirmDialog, Sheet, cx } from '../hud';
import { stimInfo } from '../itemText';

const CRIT_PCT = { cool: 0, warm: 8, hot: 18, critical: 30 } as const;

function CombatHud() {
  const s = useCombat();
  const { player, boss, bossLevel, grid, bossHeat, combatLog } = s;
  const { isMuted, toggleMute } = useAudio();
  const recent = combatLog.slice(-2);

  const chips: { key: string; tone: Parameters<typeof Chip>[0]['tone']; text: string; pulse?: boolean }[] = [];
  if (s.pendingBossAction) chips.push({ key: 'heavy', tone: 'hostile', text: `⚠ ${s.pendingBossAction.name} next turn · leave the orange tiles`, pulse: true });
  if (s.playerMalfunctioning) chips.push({ key: 'mlf', tone: 'structure', text: 'Malfunction · Brace or patch', pulse: true });
  if (s.playerHeat >= 100) chips.push({ key: 'oh', tone: 'hostile', text: 'Overheated · can\'t move' });
  if (s.doubleActionReady && s.phase === 'player_turn') chips.push({ key: 'dbl', tone: 'sys', text: 'Cold: attack twice' });
  if (s.overclockActive) chips.push({ key: 'oc', tone: 'cred', text: 'Overclock ready', pulse: true });
  if (s.kizunaJustFired) chips.push({ key: 'kz', tone: 'sys', text: 'Kizuna fired' });
  if (s.bossMalfunctioning) chips.push({ key: 'bmlf', tone: 'ok', text: 'Target malfunctioning' });
  if (bossHeat >= 100) chips.push({ key: 'block', tone: 'ok', text: 'Target overheated · can\'t move' });

  return (
    <div className="relative z-10 rounded-b-3xl bg-hud-panel/95 px-4 pb-3 pt-3 shadow-[0_10px_30px_rgba(0,0,0,0.35)] ring-1 ring-white/[0.05]" style={{ paddingTop: 'max(12px, env(safe-area-inset-top))' }}>
      <div className="flex items-start gap-3">
        {/* Player */}
        <div className="min-w-0 flex-1 space-y-1">
          <div className="flex items-baseline justify-between gap-2">
            <span className={`font-display text-[13px] font-semibold ${s.playerMalfunctioning ? 'text-orange-300' : 'text-sys'}`}>You</span>
            <span className="text-[13px] font-semibold text-hud-text">{player.currentHp}<span className="text-hud-faint">/{player.maxHp}</span></span>
          </div>
          <Meter value={player.currentHp} max={player.maxHp} tone="sys" className="h-2" />
          <div className="flex items-center gap-1.5">
            <Meter value={player.currentStructuralHp} max={player.maxStructuralHp} tone="structure" className="flex-1" />
            <span className="text-[10px] text-hud-dim">Structure {player.currentStructuralHp}</span>
          </div>
        </div>

        {/* Centre */}
        <div className="flex shrink-0 flex-col items-center pt-0.5">
          <span className="rounded-full bg-white/[0.07] px-2.5 py-0.5 font-display text-xs font-semibold text-hud-text">Threat {bossLevel}</span>
          {grid.arenaShape && grid.arenaShape !== 'open' && (
            <span className="mt-0.5 text-[10px] capitalize text-hud-faint">{grid.arenaShape.replace('_', '-')}</span>
          )}
          <button onClick={toggleMute} className="mt-1 text-sm text-hud-faint hover:text-hud-text" aria-label={isMuted ? 'Turn sound on' : 'Turn sound off'}>
            {isMuted ? '🔇' : '🔊'}
          </button>
        </div>

        {/* Boss */}
        <div className="min-w-0 flex-1 space-y-1">
          <div className="flex items-baseline justify-between gap-2">
            <span className="text-[13px] font-semibold text-hud-text">{boss.currentHp}<span className="text-hud-faint">/{boss.maxHp}</span></span>
            <span className="truncate font-display text-[13px] font-semibold" style={{ color: boss.spriteColor }} title={boss.name}>{boss.name}</span>
          </div>
          <Meter value={boss.currentHp} max={boss.maxHp} tone="hostile" className="h-2" align="right" />
          <div className="flex items-center gap-1.5">
            <span className="text-[10px] text-hud-dim">Structure {boss.currentStructuralHp}</span>
            <Meter value={boss.currentStructuralHp} max={boss.maxStructuralHp} tone="structure" className="flex-1" align="right" />
          </div>
          <div className="flex items-center gap-1.5">
            <span className="text-[10px] text-hud-dim">Heat {bossHeat}</span>
            <Meter value={bossHeat} max={100} tone={bossHeat >= 70 ? 'hostile' : 'cred'} className="h-1 flex-1" align="right" />
          </div>
        </div>
      </div>

      {chips.length > 0 && (
        <div className="mt-2.5 flex flex-wrap gap-1.5">
          {chips.map(c => <Chip key={c.key} tone={c.tone} pulse={c.pulse}>{c.text}</Chip>)}
        </div>
      )}

      <div className="mt-2 h-9 overflow-hidden rounded-xl bg-black/20 px-3 py-1 text-[11px] leading-[14px] text-hud-dim" aria-live="polite">
        {recent.length === 0 && <div className="text-hud-faint">› Engagement started. Close in or hold position.</div>}
        {recent.map((l, i) => (
          <div key={l.id} className={`truncate ${i === recent.length - 1 ? 'text-hud-text' : ''} ${l.type === 'critical' ? 'text-cred' : l.type === 'malfunction' ? 'text-orange-300' : ''}`}>
            › {l.message}
          </div>
        ))}
      </div>
    </div>
  );
}

function SlotButton({ action }: { action: LoadoutAction }) {
  const s = useCombat();
  const { player, boss, grid, playerHeat, selectedAction, setSelectedAction, phase, inputLocked } = s;
  const selected = (selectedAction as LoadoutAction | null)?.key === action.key;
  const isAttack = action.type === 'attack' || action.type === 'special';
  const inRange = !isAttack || action.ignoreRange || canHitTarget(grid.playerPosition, grid.bossPosition, action.attackPattern ?? 'melee_long', grid);
  const est = isAttack && action.damage ? estimateDamage(player, boss, action, {
    defenseBoost: s.bossDefenseBoost,
    heatMultiplier: s.overclockActive ? 2 : getHeatMultipliers(playerHeat).dealt,
    flankBonus: getFlankBonus(grid.playerPosition, grid.bossPosition),
    tileDistance: chebyshev(grid.playerPosition, grid.bossPosition),
    isMalfunctioning: s.playerMalfunctioning,
    bypassStructuralDefense: player.bypassStructuralDefense,
  }) : null;
  const crit = action.type === 'attack' ? CRIT_PCT[getHeatPhase(playerHeat)] : 0;
  const heat = action.heatGenerated ?? 0;
  const tone = action.type === 'brace' ? 'text-sys' : action.type === 'special' ? 'text-aug' : action.source === 'weapon' ? 'text-cred' : action.source === 'augment' ? 'text-ok' : 'text-hud-text';

  return (
    <button
      onClick={() => setSelectedAction(selected ? null : action)}
      disabled={phase !== 'player_turn' || inputLocked}
      aria-pressed={selected}
      className={cx('relative flex min-h-[76px] flex-col items-center justify-center gap-0.5 overflow-hidden rounded-2xl px-1 pb-2 pt-3.5 text-center transition disabled:opacity-50',
        selected ? 'bg-sys/15 ring-2 ring-sys/80 shadow-[0_0_20px_rgba(56,214,240,0.25)]' : 'bg-white/[0.06] hover:bg-white/[0.1]')}
    >
      <span className={`w-full truncate font-display text-[13px] font-semibold ${tone}`}>{action.name}</span>
      {getMechanicTag(action) && <span className="text-[10px] capitalize text-hud-faint">{getMechanicTag(action)!.toLowerCase()}</span>}
      <span className="flex flex-wrap items-center justify-center gap-x-1.5 text-[11px] font-semibold">
        {est && <span className={inRange ? 'text-hud-text' : 'text-hud-faint line-through'}>{est.min === est.max ? est.min : `${est.min}–${est.max}`}</span>}
        {action.defenseBoost && action.type === 'brace' ? <span className="text-sys">+{action.defenseBoost} guard</span> : null}
        {heat !== 0 && <span className={heat > 0 ? 'text-orange-300' : 'text-sys'}>{heat > 0 ? '+' : ''}{heat}°</span>}
        {crit > 0 && inRange && <span className="text-cred">{crit}% crit</span>}
      </span>
      {isAttack && !inRange && <span className="absolute inset-x-0 top-0 bg-white/[0.07] text-[9px] font-semibold leading-[13px] text-hud-dim">Out of range</span>}
    </button>
  );
}

function ActionBar() {
  const { phase, inputLocked, selectedAction, endTurn, hasMoved, undoMove, resetCombat, useConsumableItem, overclockActive, player } = useCombat();
  const { items } = useInventory();
  const { slots } = useLoadout();
  const [bag, setBag] = useState(false);
  const [confirmExit, setConfirmExit] = useState(false);
  const stims = items.filter(i => i.type === 'consumable');
  const myTurn = phase === 'player_turn' && !inputLocked;

  return (
    <div className="relative z-10 rounded-t-3xl bg-hud-panel/95 px-3 pt-3 shadow-[0_-10px_30px_rgba(0,0,0,0.35)] ring-1 ring-white/[0.05]" style={{ paddingBottom: 'max(14px, env(safe-area-inset-bottom))' }}>
      <div className="grid grid-cols-4 gap-2">
        {slots.map((a, i) => a ? <SlotButton key={a.key} action={a} /> : (
          <div key={`empty-${i}`} className="flex min-h-[76px] items-center justify-center rounded-2xl border border-dashed border-white/10 text-[11px] text-hud-faint">Empty</div>
        ))}
      </div>

      <div className="mt-2 grid grid-cols-3 gap-2">
        <Btn size="sm" disabled={!myTurn || stims.length === 0} onClick={() => setBag(true)}>
          Stims{stims.length ? ` · ${stims.length}` : ''}
        </Btn>
        <Btn size="sm" disabled={!myTurn || !hasMoved} onClick={undoMove}>Undo move</Btn>
        <Btn size="sm" variant="ghost" onClick={() => setConfirmExit(true)}>Retreat</Btn>
      </div>

      <Btn
        variant={myTurn ? 'primary' : 'secondary'}
        size="lg"
        className="mt-2 w-full"
        disabled={!myTurn}
        onClick={endTurn}
      >
        {!myTurn ? (phase === 'enemy_turn' ? 'Enemy acting…' : 'Resolving…') : selectedAction ? `Execute · ${selectedAction.name}` : 'Pass turn'}
      </Btn>
      {myTurn && !selectedAction && (
        <p className="mt-2 text-center text-[11px] text-hud-faint">Tap a lit tile to move, pick an action, then execute.</p>
      )}

      <Sheet open={bag} title="Stims" onClose={() => setBag(false)}>
        <div className="grid grid-cols-2 gap-2">
          {stims.map(item => {
            const info = stimInfo(item);
            const disabled = (item.consumableEffect === 'bio_stim' && player.currentHp >= player.maxHp)
              || (item.consumableEffect === 'structural_patch' && player.currentStructuralHp >= player.maxStructuralHp)
              || (item.consumableEffect === 'overclock' && overclockActive);
            return (
              <button
                key={item.id}
                disabled={disabled}
                onClick={() => { useConsumableItem(item.id); setBag(false); }}
                className="flex flex-col items-center gap-1 rounded-2xl bg-white/[0.05] p-3.5 transition hover:bg-sys/10 disabled:opacity-40"
              >
                <span className="text-2xl">{info.icon}</span>
                <span className="text-[13px] font-semibold text-hud-text">{info.label}</span>
                <span className="text-[11px] text-ok">{info.effect}</span>
              </button>
            );
          })}
        </div>
        <p className="mt-3 text-[11px] text-hud-faint">Using a stim ends your turn, except Overclock.</p>
      </Sheet>

      <ConfirmDialog
        open={confirmExit}
        title="Retreat to base?"
        body="You keep everything you have, but this target stays alive and you'll fight it again."
        confirmLabel="Retreat"
        onCancel={() => setConfirmExit(false)}
        onConfirm={() => { setConfirmExit(false); resetCombat(); }}
      />
    </div>
  );
}

export function CombatView() {
  return (
    <div className="absolute inset-0 flex flex-col bg-hud-bg">
      <CombatHud />
      <div className="relative min-h-0 flex-1">
        <CombatScene />
        <HeatBar />
      </div>
      <ActionBar />
    </div>
  );
}
