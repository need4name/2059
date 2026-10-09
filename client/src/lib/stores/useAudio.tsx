import { create } from "zustand";

interface AudioState {
  backgroundMusic: HTMLAudioElement | null;
  hitSound: HTMLAudioElement | null;
  successSound: HTMLAudioElement | null;
  isMuted: boolean;

  init: () => void;
  toggleMute: () => void;
  playHit: () => void;
  playSuccess: () => void;
}

// Sound starts muted: browsers only allow audio after the player taps something,
// and the mute toggle is that tap.
export const useAudio = create<AudioState>()((set, get) => ({
  backgroundMusic: null,
  hitSound: null,
  successSound: null,
  isMuted: true,

  init: () => {
    if (get().backgroundMusic || typeof Audio === "undefined") return;
    const music = new Audio(`${import.meta.env.BASE_URL}sounds/background.mp3`);
    music.loop = true;
    music.volume = 0.25;
    set({
      backgroundMusic: music,
      hitSound: new Audio(`${import.meta.env.BASE_URL}sounds/hit.mp3`),
      successSound: new Audio(`${import.meta.env.BASE_URL}sounds/success.mp3`),
    });
  },

  toggleMute: () => {
    const isMuted = !get().isMuted;
    set({ isMuted });
    const music = get().backgroundMusic;
    if (!music) return;
    if (isMuted) music.pause();
    else music.play().catch(() => {});
  },

  playHit: () => {
    const { hitSound, isMuted } = get();
    if (!hitSound || isMuted) return;
    const clone = hitSound.cloneNode() as HTMLAudioElement;
    clone.volume = 0.3;
    clone.play().catch(() => {});
  },

  playSuccess: () => {
    const { successSound, isMuted } = get();
    if (!successSound || isMuted) return;
    successSound.currentTime = 0;
    successSound.play().catch(() => {});
  },
}));
