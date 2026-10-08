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
import { Btn, Chip, Meter, ConfirmDialog, Sheet } from '../hud';
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
    <div className="relative z-10 border-b border-hud-line bg-hud-bg/95 px-3 pb-2 pt-2" style={{ paddingTop: 'max(8px, env(safe-area-inset-top))' }}>
      <div className="flex items-start gap-3">
        {/* Player */}
        <div className="min-w-0 flex-1 space-y-1">
          <div className="flex items-baseline justify-between gap-2">
            <span className={`font-display text-[11px] font-semibold uppercase tracking-[0.16em] ${s.playerMalfunctioning ? 'text-orange-300' : 'text-sys'}`}>You</span>
            <span className="font-mono text-xs tabular-nums text-hud-text">{player.currentHp}<span className="text-hud-faint">/{player.maxHp}</span></span>
          </div>
          <Meter value={player.currentHp} max={player.maxHp} tone="sys" className="h-2" />
          <div className="flex items-center gap-1.5">
            <Meter value={player.currentStructuralHp} max={player.maxStructuralHp} tone="structure" className="flex-1" />
            <span className="font-mono text-[9px] tabular-nums text-hud-dim">STR {player.currentStructuralHp}</span>
          </div>
        </div>

        {/* Centre */}
        <div className="flex shrink-0 flex-col items-center pt-0.5">
          <span className="font-display text-sm font-semibold text-hud-text">LV {bossLevel}</span>
          {grid.arenaShape && grid.arenaShape !== 'open' && (
            <span className="font-mono text-[9px] uppercase tracking-wider text-hud-faint">{grid.arenaShape.replace('_', '-')}</span>
          )}
          <button onClick={toggleMute} className="mt-0.5 font-mono text-[10px] text-hud-faint hover:text-hud-text" aria-label={isMuted ? 'Turn sound on' : 'Turn sound off'}>
            {isMuted ? '♪ off' : '♪ on'}
          </button>
        </div>

        {/* Boss */}
        <div className="min-w-0 flex-1 space-y-1">
          <div className="flex items-baseline justify-between gap-2">
            <span className="font-mono text-xs tabular-nums text-hud-text">{boss.currentHp}<span className="text-hud-faint">/{boss.maxHp}</span></span>
            <span className="truncate font-display text-[11px] font-semibold uppercase tracking-[0.12em]" style={{ color: boss.spriteColor }} title={boss.name}>{boss.name}</span>
          </div>
          <Meter value={boss.currentHp} max={boss.maxHp} tone="hostile" className="h-2" align="right" />
          <div className="flex items-center gap-1.5">
            <span className="font-mono text-[9px] tabular-nums text-hud-dim">STR {boss.currentStructuralHp}</span>
            <Meter value={boss.currentStructuralHp} max={boss.maxStructuralHp} tone="structure" className="flex-1" align="right" />
          </div>
          <div className="flex items-center gap-1.5">
            <span className="font-mono text-[9px] tabular-nums text-hud-dim">HEAT {bossHeat}</span>
            <Meter value={bossHeat} max={100} tone={bossHeat >= 70 ? 'hostile' : 'cred'} className="h-1 flex-1" align="right" />
          </div>
        </div>
      </div>

      {chips.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1">
          {chips.map(c => <Chip key={c.key} tone={c.tone} pulse={c.pulse}>{c.text}</Chip>)}
        </div>
      )}

      <div className="mt-1.5 h-8 overflow-hidden font-mono text-[10px] leading-4 text-hud-dim" aria-live="polite">
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
      className={`relative flex min-h-[72px] flex-col items-center justify-center gap-0.5 border px-1 pb-1.5 pt-3 text-center transition-colors disabled:opacity-50 ${
        selected ? 'border-sys bg-sys/15' : 'border-hud-line bg-hud-raised hover:border-hud-dim'
      }`}
    >
      <span className={`w-full truncate font-display text-[12px] font-semibold uppercase tracking-wide ${tone}`}>{action.name}</span>
      {getMechanicTag(action) && <span className="font-mono text-[9px] uppercase tracking-wider text-hud-faint">{getMechanicTag(action)}</span>}
      <span className="flex flex-wrap items-center justify-center gap-x-1.5 font-mono text-[10px] tabular-nums">
        {est && <span className={inRange ? 'text-hud-text' : 'text-hud-faint line-through'}>{est.min === est.max ? est.min : `${est.min}–${est.max}`}</span>}
        {action.defenseBoost && action.type === 'brace' ? <span className="text-sys">+{action.defenseBoost} grd</span> : null}
        {heat !== 0 && <span className={heat > 0 ? 'text-orange-300' : 'text-sys'}>{heat > 0 ? '+' : ''}{heat}°</span>}
        {crit > 0 && inRange && <span className="text-cred">{crit}%c</span>}
      </span>
      {isAttack && !inRange && <span className="absolute inset-x-0 top-0 bg-hud-line font-mono text-[8px] uppercase leading-3 tracking-wider text-hud-dim">out of range</span>}
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
    <div className="relative z-10 border-t border-hud-line bg-hud-bg/95 px-3 pt-2.5" style={{ paddingBottom: 'max(12px, env(safe-area-inset-bottom))' }}>
      <div className="grid grid-cols-4 gap-1.5">
        {slots.map((a, i) => a ? <SlotButton key={a.key} action={a} /> : (
          <div key={`empty-${i}`} className="flex min-h-[72px] items-center justify-center border border-dashed border-hud-line font-mono text-[10px] uppercase tracking-wider text-hud-faint">Empty</div>
        ))}
      </div>

      <div className="mt-1.5 grid grid-cols-3 gap-1.5">
        <Btn size="sm" disabled={!myTurn || stims.length === 0} onClick={() => setBag(true)}>
          Stims{stims.length ? ` · ${stims.length}` : ''}
        </Btn>
        <Btn size="sm" disabled={!myTurn || !hasMoved} onClick={undoMove}>Undo move</Btn>
        <Btn size="sm" variant="ghost" onClick={() => setConfirmExit(true)}>Retreat</Btn>
      </div>

      <Btn
        variant={myTurn ? 'primary' : 'secondary'}
        size="lg"
        className="mt-1.5 w-full"
        disabled={!myTurn}
        onClick={endTurn}
      >
        {!myTurn ? (phase === 'enemy_turn' ? 'Enemy acting…' : 'Resolving…') : selectedAction ? `Execute · ${selectedAction.name}` : 'Pass turn'}
      </Btn>
      {myTurn && !selectedAction && (
        <p className="mt-1.5 text-center font-mono text-[10px] text-hud-faint">Tap a lit tile to move, pick an action, then execute.</p>
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
                className="flex flex-col items-center gap-1 border border-hud-line bg-hud-raised p-3 transition-colors hover:border-sys disabled:opacity-40"
              >
                <span className="text-2xl">{info.icon}</span>
                <span className="text-xs text-hud-text">{info.label}</span>
                <span className="font-mono text-[10px] text-ok">{info.effect}</span>
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
