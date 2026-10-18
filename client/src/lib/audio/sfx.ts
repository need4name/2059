// Pixel-era sound, all synthesised with WebAudio: square and triangle blips,
// filtered noise for impacts and fire, and a slow sea wash underneath. No files.

export type Sfx =
  | 'hit' | 'collide' | 'burn' | 'telegraph' | 'surge' | 'step' | 'chain'
  | 'foeDown' | 'allyDown' | 'victory' | 'defeat' | 'tap' | 'cache' | 'door';

let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let noiseBuf: AudioBuffer | null = null;

function audio(): AudioContext | null {
  if (ctx) return ctx;
  const AC = typeof window !== 'undefined' ? (window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext) : undefined;
  if (!AC) return null;
  ctx = new AC();
  master = ctx.createGain();
  master.gain.value = 0.5;
  master.connect(ctx.destination);
  // Two seconds of white noise, shared by every noisy sound
  noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
  const d = noiseBuf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  return ctx;
}

/** Browsers start audio suspended until a tap; call this from one. */
export function wakeAudio() {
  const c = audio();
  if (c && c.state === 'suspended') c.resume().catch(() => {});
}

interface Blip { freq: number; to?: number; dur: number; type?: OscillatorType; vol?: number; at?: number }
function blip({ freq, to, dur, type = 'square', vol = 0.2, at = 0 }: Blip) {
  const c = audio(); if (!c || !master) return;
  const t = c.currentTime + at;
  const o = c.createOscillator(), g = c.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, t);
  if (to) o.frequency.exponentialRampToValueAtTime(to, t + dur);
  g.gain.setValueAtTime(vol, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  o.connect(g).connect(master);
  o.start(t); o.stop(t + dur + 0.02);
}

interface Hiss { dur: number; freq: number; to?: number; vol?: number; at?: number; kind?: BiquadFilterType }
function hiss({ dur, freq, to, vol = 0.25, at = 0, kind = 'lowpass' }: Hiss) {
  const c = audio(); if (!c || !master || !noiseBuf) return;
  const t = c.currentTime + at;
  const src = c.createBufferSource(), f = c.createBiquadFilter(), g = c.createGain();
  src.buffer = noiseBuf;
  f.type = kind;
  f.frequency.setValueAtTime(freq, t);
  if (to) f.frequency.exponentialRampToValueAtTime(to, t + dur);
  g.gain.setValueAtTime(vol, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  src.connect(f).connect(g).connect(master);
  src.start(t, Math.random()); src.stop(t + dur + 0.02);
}

const notes = (freqs: number[], step: number, type: OscillatorType = 'square', vol = 0.14) =>
  freqs.forEach((freq, k) => blip({ freq, dur: step * 1.6, type, vol, at: k * step }));

const SOUNDS: Record<Sfx, () => void> = {
  hit: () => { hiss({ dur: 0.12, freq: 2400, to: 300, vol: 0.3 }); blip({ freq: 180, to: 60, dur: 0.1, vol: 0.18 }); },
  collide: () => { hiss({ dur: 0.25, freq: 900, to: 80, vol: 0.4 }); blip({ freq: 90, to: 35, dur: 0.22, type: 'triangle', vol: 0.4 }); },
  burn: () => hiss({ dur: 0.35, freq: 3000, to: 900, vol: 0.12, kind: 'bandpass' }),
  telegraph: () => { blip({ freq: 220, to: 440, dur: 0.18, vol: 0.12 }); blip({ freq: 220, to: 440, dur: 0.18, vol: 0.12, at: 0.22 }); },
  surge: () => { blip({ freq: 80, to: 900, dur: 0.35, type: 'sawtooth', vol: 0.18 }); hiss({ dur: 0.6, freq: 6000, to: 200, vol: 0.3, at: 0.25 }); },
  step: () => blip({ freq: 140, to: 90, dur: 0.05, type: 'triangle', vol: 0.15 }),
  chain: () => notes([660, 990], 0.06),
  foeDown: () => { blip({ freq: 400, to: 50, dur: 0.4, vol: 0.16 }); hiss({ dur: 0.3, freq: 1200, to: 100, vol: 0.2 }); },
  allyDown: () => notes([392, 330, 262], 0.1, 'triangle', 0.18),
  victory: () => notes([523, 659, 784, 1047], 0.09),
  defeat: () => { notes([330, 277, 233, 175], 0.16, 'triangle', 0.2); hiss({ dur: 1.2, freq: 600, to: 60, vol: 0.12, at: 0.5 }); },
  tap: () => blip({ freq: 880, dur: 0.035, vol: 0.06 }),
  cache: () => notes([784, 988, 1175], 0.05, 'square', 0.1),
  door: () => { hiss({ dur: 0.18, freq: 500, to: 150, vol: 0.18 }); blip({ freq: 110, dur: 0.12, type: 'triangle', vol: 0.15, at: 0.05 }); },
};

export function playSfx(name: Sfx) {
  const c = audio();
  if (!c || c.state !== 'running') return;
  SOUNDS[name]();
}

// The sea: brown-ish noise through a low filter, its loudness rising and
// falling like waves, with a second slower swell on top.
let sea: { stop: () => void } | null = null;
export function startSea() {
  const c = audio(); if (!c || !master || sea) return;
  const len = c.sampleRate * 4, buf = c.createBuffer(1, len, c.sampleRate), d = buf.getChannelData(0);
  let last = 0;
  for (let i = 0; i < len; i++) { last = (last + 0.02 * (Math.random() * 2 - 1)) / 1.02; d[i] = last * 3.5; }
  const src = c.createBufferSource(); src.buffer = buf; src.loop = true;
  const f = c.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 520;
  const g = c.createGain(); g.gain.value = 0.16;
  const wave = c.createOscillator(); wave.frequency.value = 0.11;
  const waveDepth = c.createGain(); waveDepth.gain.value = 0.09;
  const swell = c.createOscillator(); swell.frequency.value = 0.037;
  const swellDepth = c.createGain(); swellDepth.gain.value = 160;
  wave.connect(waveDepth).connect(g.gain);
  swell.connect(swellDepth).connect(f.frequency);
  src.connect(f).connect(g).connect(master);
  src.start(); wave.start(); swell.start();
  sea = { stop: () => { [src, wave, swell].forEach(n => { try { n.stop(); } catch { /* already stopped */ } }); g.disconnect(); sea = null; } };
}
export const stopSea = () => sea?.stop();
