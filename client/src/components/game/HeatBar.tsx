import { useCombat } from '@/lib/stores/useCombat';
import { getHeatPhase } from '@/lib/combat/types';
import { useEffect, useRef } from 'react';

export function HeatBar() {
const { playerHeat, phase, bossChargingHeavy } = useCombat();
const heatPhase = getHeatPhase(playerHeat);
const prevHeat  = useRef(playerHeat);

useEffect(() => { prevHeat.current = playerHeat; }, [playerHeat]);

if (phase === 'menu' || phase === 'victory' || phase === 'defeat' || phase === 'shop') return null;

// Colour per phase
const colours: Record<typeof heatPhase, { bar: string; glow: string; label: string }> = {
cool:     { bar: 'bg-cyan-500',    glow: 'shadow-cyan-500/40',   label: 'text-cyan-400'  },
warm:     { bar: 'bg-amber-400',   glow: 'shadow-amber-400/50',  label: 'text-amber-300' },
hot:      { bar: 'bg-orange-500',  glow: 'shadow-orange-500/60', label: 'text-orange-400' },
critical: { bar: 'bg-red-500',     glow: 'shadow-red-500/80',    label: 'text-red-400'   },
};
const c = colours[heatPhase];

// Fill percentage
const fill = `${playerHeat}%`;

const isCritical = heatPhase === 'critical';
const isHot      = heatPhase === 'hot' || isCritical;

return (

<div className="fixed left-2 top-1/2 -translate-y-1/2 z-30 flex flex-col items-center gap-1 pointer-events-none select-none">

{/* Charging warning - appears above bar when boss telegraphs heavy */}
{bossChargingHeavy && (
<div className="mb-1 animate-pulse">
<span className="text-red-400 text-lg">⚠️</span>
</div>
)}

{/* Bar container */}

  <div
    className={`relative w-4 rounded-full overflow-hidden border border-slate-700 bg-slate-900/80 ${isCritical ? 'animate-pulse' : ''}`}
    style={{ height: '140px' }}
  >
    {/* Phase zone markers - subtle dividers at 40% and 70% */}
    <div className="absolute left-0 right-0 border-t border-slate-600/40" style={{ bottom: '60%' }} />
    <div className="absolute left-0 right-0 border-t border-slate-600/40" style={{ bottom: '30%' }} />

{/* Fill - grows from bottom */}
<div
  className={`absolute bottom-0 left-0 right-0 rounded-full transition-all duration-300 ${c.bar} ${isHot ? `shadow-lg ${c.glow}` : ''}`}
  style={{ height: fill }}
/>

  </div>

{/* Heat number */}
<span className={`text-xs font-mono font-bold ${c.label} tabular-nums`}>
{playerHeat}
</span>

{/* Phase label */}
<span className={`text-xs font-mono uppercase tracking-wider ${c.label} opacity-70`}>
{heatPhase === 'critical' ? 'CRIT' : heatPhase.toUpperCase()}
</span>

</div>

);
}