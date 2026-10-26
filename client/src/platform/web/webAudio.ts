import type { AudioDecoder } from '../../audio/samples';
import type { AudioHost } from '../types';
import { MUSIC_RATE, MusicBuffers } from './musicBuffers';
import { WebMusicDeck } from './webMusicDeck';

// The browser's sound output: a Web Audio context (the webkit one on old Safari), resumed on
// the first gesture (autoplay rules), and silenced while the tab is hidden. Everything, music
// included, plays through Web Audio and the page asks Safari for the 'ambient' audio session, so
// the game mixes with the player's own music instead of pausing it
// (docs/audio.md). A browser cannot tell that other music is playing, so nothing ducks here.

type AudioCtor = typeof AudioContext;
type OfflineCtor = new (channels: number, length: number, rate: number) => OfflineAudioContext;

export function webAudioHost(read: (path: string) => Promise<ArrayBuffer> = fetchBytes): AudioHost | null {
  const g = globalThis as { AudioContext?: AudioCtor; webkitAudioContext?: AudioCtor };
  const Ctor = g.AudioContext ?? g.webkitAudioContext;
  if (!Ctor || typeof window === 'undefined') return null;
  shareSpeaker();
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
    musicDecks(ctx) {
      const buffers = new MusicBuffers([...resampler(), ctx], read);
      return [new WebMusicDeck(ctx, buffers), new WebMusicDeck(ctx, buffers)];
    },
  };
}

/** Safari 16.4+ (and WKWebView, iOS 17): mix with other apps' audio and obey the silent switch,
 *  as the iOS shell's AVAudioSession does. Other browsers have no such switch and need none. */
export function shareSpeaker(nav: unknown = globalThis.navigator): void {
  const session = (nav as { audioSession?: { type: string } } | undefined)?.audioSession;
  if (!session) return;
  try {
    session.type = 'ambient';
  } catch {
    /* a session that refuses the type keeps the browser's own */
  }
}

/** An offline context that decodes at MUSIC_RATE, or nothing where there is none. */
function resampler(): AudioDecoder[] {
  const g = globalThis as { OfflineAudioContext?: OfflineCtor; webkitOfflineAudioContext?: OfflineCtor };
  const Ctor = g.OfflineAudioContext ?? g.webkitOfflineAudioContext;
  try {
    return Ctor ? [new Ctor(2, 1, MUSIC_RATE)] : [];
  } catch {
    return [];
  }
}

async function fetchBytes(path: string): Promise<ArrayBuffer> {
  const res = await fetch(path);
  if (!res.ok) throw new Error(`${path}: HTTP ${res.status}`);
  return res.arrayBuffer();
}
