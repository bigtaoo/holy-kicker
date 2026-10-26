import type { AudioHost } from '../types';
import type { HKNative } from './bridge';

// The player's own music on iOS (docs/audio.md): the shell passes on AVAudioSession's
// secondaryAudioShouldBeSilencedHint, true while another app (Spotify, Apple Music) plays audio
// that does not mix, and the game's music makes way for it. An older shell without the call (v7)
// says nothing, and the game plays its music alongside as on the web.

/** The browser's audio host, told by the shell when other music plays. */
export function otherAudioFrom(web: AudioHost | null, native: Partial<HKNative> | null): AudioHost | null {
  const n = native;
  if (!web || !n?.onOtherAudio) return web;
  return {
    ...web,
    onOtherAudio(cb) {
      const tell = (state: unknown) => cb(!!(state as { playing?: unknown } | null)?.playing);
      n.onOtherAudio!.call(n, tell);
      // what the shell said before the game asked
      const now = n.otherAudio?.call(n);
      if (now) tell(now);
    },
  };
}
