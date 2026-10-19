import { useEffect, useRef, useState } from 'react';
import { useCombat } from '@/lib/stores/useCombat';
import { useInventory } from '@/lib/stores/useInventory';
import { useLoadout, getMechanicTag, LoadoutAction } from '@/lib/stores/useLoadout';
import { useAudio } from '@/lib/stores/useAudio';
import { estimateDamage, ENEMY_GRADES, ENEMY_TRAITS } from '@/lib/combat/actions';
import { chebyshev } from '@/lib/combat/grid';
import { getHeatMultipliers, getFlankBonus, getHeatPhase } from '@/lib/combat/types';
import { CombatScene } from '../CombatScene';
import { HeatBar } from '../HeatBar';
import { Btn, Chip, Meter, ConfirmDialog, Sheet, cx } from '../hud';
import { stimInfo } from '../itemText';
import * as Fight from '@/lib/engine/fight';
import type { AllyMove } from '@/lib/combat/allies';
import { drawFigure } from '@/lib/rendering/figures';

const CRIT_PCT = { cool: 0, warm: 8, hot: 18, critical: 30 } as const;

function CombatHud() {
  const s = useCombat();
  const { player, bossLevel, grid, combatLog, foes, target: targetIdx, setTarget } = s;
  const target = foes[targetIdx] ?? foes[0];
  const boss = target?.unit ?? s.boss;
  const bossHeat = target?.heat ?? 0;
  const charging = foes.filter(f => f.pendingAction && f.unit.currentHp > 0);
  const { isMuted, toggleMute } = useAudio();
  const recent = combatLog.slice(-1);

  const chips: { key: string; tone: Parameters<typeof Chip>[0]['tone']; text: string; pulse?: boolean }[] = [];
  // One warning however many enemies are winding up, so the arena keeps its space
  if (charging.length) chips.push({ key: 'heavy', tone: 'hostile', pulse: true,
    text: charging.length > 1 ? `⚠ ${charging.length} heavy attacks next turn · leave the orange tiles` : `⚠ ${charging[0].pendingAction!.name} next turn · leave the orange tiles` });
  if (s.playerMalfunctioning) chips.push({ key: 'mlf', tone: 'structure', text: 'Malfunction · Brace', pulse: true });
  if (s.playerHeat >= 100) chips.push({ key: 'oh', tone: 'hostile', text: 'Overheated · can\'t move' });
  if (s.playerBurning > 0) chips.push({ key: 'burn', tone: 'hostile', text: `Burning · ${s.playerBurning} turn${s.playerBurning === 1 ? '' : 's'}`, pulse: true });
  if (s.playerStunned) chips.push({ key: 'stun', tone: 'cred', text: 'Stunned · you lose your next turn' });
  if (target?.burning) chips.push({ key: 'tburn', tone: 'ok', text: 'Target burning' });
  if (target?.stunned) chips.push({ key: 'tstun', tone: 'ok', text: 'Target stunned' });
  if (s.doubleActionReady && s.phase === 'player_turn') chips.push({ key: 'dbl', tone: 'sys', text: 'Cold: attack twice' });
  if (s.overclockActive) chips.push({ key: 'oc', tone: 'cred', text: 'Overclock ready', pulse: true });
  if (s.kizunaJustFired) chips.push({ key: 'kz', tone: 'sys', text: 'Kizuna fired' });
  if (target?.malfunctioning) chips.push({ key: 'bmlf', tone: 'ok', text: 'Target malfunctioning' });
  if (bossHeat >= 100) chips.push({ key: 'block', tone: 'ok', text: 'Target overheated · can\'t move' });

  return (
    <div className="relative z-10 rounded-b-3xl bg-hud-panel/95 px-4 pb-2.5 pt-3 shadow-[0_10px_30px_rgba(0,0,0,0.35)] ring-1 ring-white/[0.05]" style={{ paddingTop: 'max(12px, env(safe-area-inset-top))' }}>
      <div className="flex items-start gap-3">
        {/* Player */}
        <div className="min-w-0 flex-1 space-y-1">
          <div className="flex items-baseline justify-between gap-2">
            <span className={`font-display text-[13px] font-semibold ${s.playerMalfunctioning ? 'text-orange-300' : 'text-sys'}`}>You</span>
            <span className="text-[13px] font-semibold text-hud-text">{player.currentHp}<span className="text-hud-faint">/{player.maxHp}</span></span>
          </div>
          <Meter value={player.currentHp} max={player.maxHp} tone="sys" className="h-2" />
          <div className="flex items-center gap-1.5">
            {player.maxStructuralHp > 0 ? (
              <>
                <Meter value={player.currentStructuralHp} max={player.maxStructuralHp} tone="structure" className="flex-1" />
                <span className="text-[10px] text-hud-dim">Structure {player.currentStructuralHp}</span>
              </>
            ) : (
              <span className="text-[10px] text-hud-faint">No implants: nothing to absorb structural hits</span>
            )}
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
          {boss.grade !== undefined && (
            <div className="truncate text-right text-[10px]" title={[...(boss.implants ?? []), ...(boss.traits ?? []).map(t => ENEMY_TRAITS[t]?.text ?? t)].join('\n')}>
              <span className="font-semibold" style={{ color: ENEMY_GRADES[boss.grade].color }}>{ENEMY_GRADES[boss.grade].name}</span>
              {boss.traits?.length ? <span className="text-hud-dim"> · {boss.traits.map(t => ENEMY_TRAITS[t]?.name ?? t).join(', ')}</span> : null}
            </div>
          )}
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

      {foes.length > 1 && (
        <div className="mt-2 flex gap-1.5" role="group" aria-label="Enemies">
          {foes.map((f, i) => {
            const down = f.unit.currentHp <= 0;
            return (
              <button key={i} disabled={down} onClick={() => setTarget(i)} aria-pressed={i === targetIdx}
                className={cx('min-w-0 flex-1 rounded-xl px-2 py-1 text-left transition', down ? 'opacity-35' : i === targetIdx ? 'bg-hostile/15 ring-1 ring-hostile/60' : 'bg-white/[0.05] hover:bg-white/[0.08]')}>
                <span className="block truncate text-[10px] font-semibold" style={{ color: f.unit.spriteColor }}>{down ? 'Down' : f.unit.name}</span>
                <Meter value={f.unit.currentHp} max={f.unit.maxHp} tone="hostile" className="mt-1 h-1" />
              </button>
            );
          })}
        </div>
      )}

      {chips.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {chips.map(c => <Chip key={c.key} tone={c.tone} pulse={c.pulse}>{c.text}</Chip>)}
        </div>
      )}

      <div className="mt-2 h-6 overflow-hidden rounded-xl bg-black/20 px-3 py-1 text-[11px] leading-[16px] text-hud-dim" aria-live="polite">
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
  const { player, grid, playerHeat, selectedAction, setSelectedAction, phase, inputLocked } = s;
  const selected = (selectedAction as LoadoutAction | null)?.key === action.key;
  const isAttack = action.type === 'attack' || action.type === 'special';
  // Estimates are against whoever this attack would hit (its current aim when picked, else its best aim)
  const aim = isAttack ? (selected && s.aim ? s.aim : Fight.bestAim(s, action, s.playerClass)) : null;
  const struck = aim ? Fight.struckAt(s, action, s.playerClass, aim) : [];
  const inRange = !isAttack || struck.length > 0;
  const target = s.foes[struck[0] ?? s.target];
  const boss = target?.unit ?? s.boss;
  const foePos = target?.pos ?? grid.bossPosition;
  const est = isAttack && action.damage ? estimateDamage(player, boss, action, {
    defenseBoost: target?.defenseBoost ?? 0,
    heatMultiplier: s.overclockActive ? 2 : getHeatMultipliers(playerHeat).dealt,
    flankBonus: getFlankBonus(grid.playerPosition, foePos),
    tileDistance: chebyshev(grid.playerPosition, foePos),
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
      className={cx('relative flex min-h-[64px] flex-col items-center justify-center gap-0.5 overflow-hidden rounded-2xl px-1 pb-1.5 pt-3 text-center transition disabled:opacity-50',
        selected ? 'bg-sys/15 ring-2 ring-sys/80 shadow-[0_0_20px_rgba(56,214,240,0.25)]' : 'bg-white/[0.06] hover:bg-white/[0.1]')}
    >
      <span className={`w-full truncate font-display text-[13px] font-semibold ${tone}`}>{action.name}</span>
      {(getMechanicTag(action) || action.side) && <span className="text-[10px] text-hud-faint">{action.side === 'left' ? '◀ left side' : action.side === 'right' ? 'right side ▶' : getMechanicTag(action)!.toLowerCase().replace(/^\w/, c => c.toUpperCase())}</span>}
      <span className="flex flex-wrap items-center justify-center gap-x-1.5 text-[11px] font-semibold">
        {est && <span className={inRange ? 'text-hud-text' : 'text-hud-faint line-through'}>{est.min === est.max ? est.min : `${est.min}–${est.max}`}{struck.length > 1 ? ` ×${struck.length}` : ''}</span>}
        {action.defenseBoost && action.type === 'brace' ? <span className="text-sys">+{action.defenseBoost} guard</span> : null}
        {heat !== 0 && <span className={heat > 0 ? 'text-orange-300' : 'text-sys'}>{heat > 0 ? '+' : ''}{heat}°</span>}
        {crit > 0 && inRange && <span className="text-cred">{crit}% crit</span>}
      </span>
      {isAttack && !inRange && <span className="absolute inset-x-0 top-0 bg-white/[0.07] text-[9px] font-semibold leading-[13px] text-hud-dim">Nobody in reach</span>}
    </button>
  );
}

function allyMoveDetail(m: AllyMove): string {
  switch (m.effect) {
    case 'attack': return `Hit ${m.damage ?? 0}`;
    case 'taunt': return `Draw fire · +${m.defenseBoost ?? 0} guard`;
    case 'heal': return `Heal you ${Math.round((m.amount ?? 0) * 100)}%`;
    case 'mark': return `Your hits +${Math.round((m.amount ?? 0) * 100)}%`;
    case 'guard': return `You +${m.defenseBoost ?? 0} guard`;
  }
}

/** Your allies: move them and use one of their fixed moves, any time in your turn. */
function AllyStrip() {
  const s = useCombat();
  const { allies, allyMoveMode, toggleAllyMove, allyAct, phase, inputLocked, reflexMoveOpen } = s;
  if (!allies.length) return null;
  const myTurn = phase === 'player_turn' && !inputLocked && !reflexMoveOpen;
  return (
    <div className="mb-2 space-y-1.5">
      {allies.map((a, k) => {
        const down = a.unit.currentHp <= 0;
        const color = a.unit.spriteColor;
        const canMove = myTurn && !down && !a.moved && !a.acted;
        return (
          <div key={a.id} className={cx('flex items-center gap-1.5 rounded-2xl bg-white/[0.04] p-1.5', down && 'opacity-45')}>
            <button onClick={() => toggleAllyMove(k)} disabled={!canMove} aria-pressed={allyMoveMode === k}
              className={cx('w-[84px] shrink-0 rounded-xl px-2 py-1 text-left transition disabled:cursor-default', allyMoveMode === k ? 'bg-white/[0.12] ring-1' : canMove ? 'hover:bg-white/[0.08]' : '')}
              style={allyMoveMode === k ? { boxShadow: `0 0 0 1px ${color}` } : undefined}>
              <span className="block truncate font-display text-[12px] font-semibold" style={{ color }}>{a.unit.name}</span>
              <span className="block text-[10px] text-hud-faint">{down ? 'Knocked out' : allyMoveMode === k ? 'Tap a tile' : canMove ? 'Tap to move' : a.acted ? 'Done' : 'Moved'}</span>
              <div className="mt-1 h-1 overflow-hidden rounded-full bg-white/10"><div className="h-full rounded-full" style={{ width: `${(a.unit.currentHp / a.unit.maxHp) * 100}%`, background: color }} /></div>
            </button>
            {a.moves.map((m, n) => {
              const cd = a.cooldowns[n] ?? 0;
              const usable = myTurn && Fight.canAllyUse(useCombat.getState(), k, n);
              const reason = down ? '' : a.acted ? 'Done this round' : cd > 0 ? `Ready in ${cd}` : m.effect === 'attack' && !usable ? 'Out of range' : allyMoveDetail(m);
              return (
                <button key={m.name} onClick={() => allyAct(k, n)} disabled={!myTurn || down || a.acted || cd > 0}
                  className={cx('min-w-0 flex-1 rounded-xl px-2 py-1.5 text-left transition disabled:opacity-50', usable ? 'bg-white/[0.07] hover:bg-white/[0.12]' : 'bg-white/[0.03]')}>
                  <span className="block truncate text-[12px] font-semibold text-hud-text">{m.name}</span>
                  <span className={cx('block truncate text-[10px]', usable ? 'text-hud-dim' : 'text-hud-faint')}>{reason}</span>
                </button>
              );
            })}
          </div>
        );
      })}
    </div>
  );
}

/** Overload: fills as blows are traded; when full, one Signal Surge. */
function OverloadBar() {
  const s = useCombat();
  const full = s.overload >= Fight.OVERLOAD.full;
  const ready = full && Fight.canSurge(useCombat.getState());
  const myTurn = s.phase === 'player_turn' && !s.inputLocked && !s.reflexMoveOpen;
  if (ready) {
    return (
      <button onClick={s.surge} disabled={!myTurn}
        className="mb-2 w-full animate-pulse rounded-2xl bg-gradient-to-r from-violet-500/80 to-sys/80 px-4 py-2.5 text-left shadow-[0_0_24px_rgba(167,139,250,0.35)] transition disabled:animate-none disabled:opacity-50">
        <span className="block font-display text-[15px] font-semibold text-white">Signal Surge</span>
        <span className="block text-[11px] text-white/80">Hits every enemy within 2 tiles hard and vents your heat. Uses your turn.</span>
      </button>
    );
  }
  return (
    <div className="mb-2 flex items-center gap-2 px-1">
      <span className="text-[11px] font-semibold text-hud-dim">Overload</span>
      <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-white/10">
        <div className="h-full rounded-full bg-gradient-to-r from-violet-500 to-sys transition-all" style={{ width: `${s.overload}%` }} />
      </div>
      <span className="w-[86px] text-right text-[10px] text-hud-faint">{full ? 'Get within 2 tiles' : `${s.overload}%`}</span>
    </div>
  );
}

/** A small pixel portrait of a character. */
function Portrait({ id, size = 26 }: { id: string; size?: number }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const c = ref.current; if (!c) return;
    const ctx = c.getContext('2d'); if (!ctx) return;
    ctx.clearRect(0, 0, c.width, c.height);
    // Head and shoulders: draw the figure large and let the canvas crop it
    drawFigure(ctx, id, -c.width * 0.45, -c.height * 0.05, c.width * 1.9, 'idle', 0, false);
  }, [id]);
  // Canvases fill their parent (index.css), so the box sets the size
  return <div className="overflow-hidden rounded-full bg-hud-panel" style={{ width: size, height: size }}><canvas ref={ref} width={size * 2} height={size * 2} style={{ imageRendering: 'pixelated' }} /></div>;
}

/** Who acts, in order, once a fight holds 3 or more units. */
function TurnStrip() {
  const { foes, allies, phase, actingFoe } = useCombat();
  const liveFoes = foes.map((f, i) => ({ f, i })).filter(x => x.f.unit.currentHp > 0);
  const liveAllies = allies.filter(a => a.unit.currentHp > 0);
  if (1 + liveAllies.length + liveFoes.length < 3) return null;
  const yourSide = phase === 'player_turn';
  return (
    <div className="pointer-events-none absolute right-2 top-2 z-10 flex items-center gap-1 rounded-full bg-black/45 px-1.5 py-1 ring-1 ring-white/10" aria-label="Turn order">
      <div className={cx('rounded-full p-0.5', yourSide ? 'bg-sys/40 ring-1 ring-sys' : '')}><Portrait id="host" /></div>
      {liveAllies.map(a => <div key={a.id} className={cx('rounded-full p-0.5', yourSide ? 'bg-sys/25' : '')}><Portrait id={a.id} /></div>)}
      <span className="px-0.5 text-[10px] text-hud-faint">›</span>
      {liveFoes.map(({ f, i }) => <div key={i} className={cx('rounded-full p-0.5', actingFoe === i ? 'bg-hostile/50 ring-1 ring-hostile' : '')}><Portrait id={f.unit.name} /></div>)}
    </div>
  );
}

function ActionBar() {
  const { phase, inputLocked, selectedAction, endTurn, hasMoved, undoMove, resetCombat, useConsumableItem, overclockActive, player, allies } = useCombat();
  const { items } = useInventory();
  const { slots } = useLoadout();
  const [bag, setBag] = useState(false);
  const [confirmExit, setConfirmExit] = useState(false);
  const stims = items.filter(i => i.type === 'consumable');
  const myTurn = phase === 'player_turn' && !inputLocked;

  return (
    <div className="relative z-10 rounded-t-3xl bg-hud-panel/95 px-3 pt-2.5 shadow-[0_-10px_30px_rgba(0,0,0,0.35)] ring-1 ring-white/[0.05]" style={{ paddingBottom: 'max(6px, env(safe-area-inset-bottom))' }}>
      <OverloadBar />
      <AllyStrip />
      <div className="grid gap-2" style={{ gridTemplateColumns: `repeat(${Math.max(4, slots.length)}, minmax(0, 1fr))` }}>
        {slots.map((a, i) => a ? <SlotButton key={a.key} action={a} /> : (
          <div key={`empty-${i}`} className="flex min-h-[64px] items-center justify-center rounded-2xl border border-dashed border-white/10 text-[11px] text-hud-faint">Empty</div>
        ))}
      </div>

      {/* One row: the small tools, then the turn button taking the rest */}
      <div className="mt-2 flex gap-2">
        <Btn className="shrink-0 px-3.5" disabled={!myTurn || stims.length === 0} onClick={() => setBag(true)}>
          Stims{stims.length ? ` ${stims.length}` : ''}
        </Btn>
        <Btn className="shrink-0 px-3.5" disabled={!myTurn || !hasMoved} onClick={undoMove}>Undo</Btn>
        <Btn
          variant={myTurn ? 'primary' : 'secondary'}
          className="min-w-0 flex-1 truncate"
          disabled={!myTurn}
          onClick={endTurn}
        >
          {!myTurn ? (phase === 'enemy_turn' ? 'Enemy acting…' : 'Resolving…') : selectedAction ? `Execute · ${selectedAction.name}` : 'Pass turn'}
        </Btn>
      </div>
      <div className="mt-1 flex items-center justify-between px-1 text-[11px] text-hud-faint">
        <span className="truncate">{myTurn && !selectedAction ? (allies.length ? 'Ally first, then your move and action.' : 'Move, pick an action, then execute.') : myTurn && (selectedAction?.type === 'attack' || selectedAction?.type === 'special') ? 'Tap a lit square to aim. Everyone in the bright squares is hit.' : ''}</span>
        <button className="shrink-0 py-1.5 pl-3 text-hud-dim hover:text-hud-text" onClick={() => setConfirmExit(true)}>Retreat</button>
      </div>

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

/** The enemy's first words on seeing a corpse get up, and the signal's own first impression. */
function FightIntro() {
  const { fightIntro, dismissIntro, fightId } = useCombat();
  useEffect(() => {
    if (!fightIntro) return;
    const t = setTimeout(dismissIntro, fightIntro.note ? 7000 : 4500);
    return () => clearTimeout(t);
  }, [fightIntro, fightId, dismissIntro]);
  if (!fightIntro) return null;
  return (
    <button onClick={dismissIntro} className="rise-in absolute inset-x-3 top-3 z-20 space-y-2 rounded-3xl bg-black/70 px-4 py-3 text-left shadow-[0_10px_30px_rgba(0,0,0,0.45)] ring-1 ring-white/10 backdrop-blur-sm" aria-label="Dismiss">
      {fightIntro.line && (
        <div>
          <div className="text-[11px] font-semibold" style={{ color: fightIntro.color }}>{fightIntro.speaker}</div>
          <div className="text-[15px] leading-snug text-white">“{fightIntro.line}”</div>
        </div>
      )}
      {fightIntro.note && (
        <div className={fightIntro.line ? 'border-t border-white/10 pt-2' : ''}>
          <div className="text-[11px] font-semibold text-sys">The signal notes</div>
          <div className="text-[13px] italic leading-snug text-hud-text/90">{fightIntro.note}</div>
        </div>
      )}
    </button>
  );
}

export function CombatView() {
  return (
    <div className="absolute inset-0 flex flex-col bg-hud-bg">
      <CombatHud />
      <div className="relative min-h-0 flex-1">
        <CombatScene />
        <HeatBar />
        <TurnStrip />
        <FightIntro />
      </div>
      <ActionBar />
    </div>
  );
}
