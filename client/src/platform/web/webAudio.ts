import type { AudioHost } from '../types';

// The browser's sound output: a Web Audio context (the webkit one on old Safari), resumed on
// the first gesture (autoplay rules), and silenced while the tab is hidden.

type AudioCtor = typeof AudioContext;

export function webAudioHost(): AudioHost | null {
  const g = globalThis as { AudioContext?: AudioCtor; webkitAudioContext?: AudioCtor };
  const Ctor = g.AudioContext ?? g.webkitAudioContext;
  if (!Ctor || typeof window === 'undefined') return null;
  return {
    context: () => new Ctor(),
    onGesture(cb) {
      // pointerup/touchend rather than only the down events: iOS Safari unlocks audio on the end
      for (const ev of ['pointerdown', 'pointerup', 'touchend', 'keydown'] as const) {
        window.addEventListener(ev, cb, { passive: true });
      }
    },
    onFocus(cb) {
      document.addEventListener('visibilitychange', () => cb(!document.hidden));
    },
    onHostMute() {},
  };
}
