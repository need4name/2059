import { create } from "zustand";
import { playSfx, startSea, stopSea, wakeAudio, type Sfx } from "../audio/sfx";

interface AudioState {
  backgroundMusic: HTMLAudioElement | null;
  isMuted: boolean;

  init: () => void;
  toggleMute: () => void;
  /** A synthesised effect (see lib/audio/sfx.ts). Silent while muted. */
  play: (name: Sfx) => void;
  playHit: () => void;
  playSuccess: () => void;
}

// Sound starts muted: browsers only allow audio after the player taps something,
// and the mute toggle is that tap.
export const useAudio = create<AudioState>()((set, get) => ({
  backgroundMusic: null,
  isMuted: true,

  init: () => {
    if (get().backgroundMusic || typeof Audio === "undefined") return;
    const music = new Audio(`${import.meta.env.BASE_URL}sounds/background.mp3`);
    music.loop = true;
    music.volume = 0.18;
    set({ backgroundMusic: music });
  },

  toggleMute: () => {
    const isMuted = !get().isMuted;
    set({ isMuted });
    const music = get().backgroundMusic;
    if (isMuted) { music?.pause(); stopSea(); return; }
    wakeAudio();
    startSea();
    music?.play().catch(() => {});
    playSfx("tap");
  },

  play: (name) => { if (!get().isMuted) playSfx(name); },
  playHit: () => get().play("hit"),
  playSuccess: () => get().play("victory"),
}));
