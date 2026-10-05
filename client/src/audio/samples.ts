import type { Cue } from './cues';

// The recorded sounds (tools/audio_build.py writes audio/sounds.json and the files next to it).
// A cue with samples plays one of them; a cue without any, or whose files failed to load, keeps
// its synth voice (synth.ts), so a missing file costs a nicer sound, never a silent one.

export const SOUNDS_MANIFEST = 'audio/sounds.json';

export type Track = 'lobby' | 'battle' | 'boss';

export interface MusicDef {
  path: string;
  /** Seconds; the player starts the next pass this long minus the crossfade before the end. */
  length: number;
}

export interface SoundManifest {
  sfx: Partial<Record<Cue, string[]>>;
  music: Partial<Record<Track, MusicDef>>;
}

export function parseManifest(text: string): SoundManifest {
  const raw = JSON.parse(text) as Partial<SoundManifest> | null;
  return { sfx: raw?.sfx ?? {}, music: raw?.music ?? {} };
}

/** The one method decoding needs, typed loosely: WeChat's context takes the callbacks and may
 *  return nothing, a browser's returns a promise (and also takes the callbacks). */
export interface AudioDecoder {
  decodeAudioData(data: ArrayBuffer, ok?: (b: AudioBuffer) => void, fail?: (e: unknown) => void): Promise<AudioBuffer> | void;
}

/** decodeAudioData in whichever shape the runtime has (adapted from daydayup decodeAudio.ts). */
export function decodeAudio(ctx: AudioDecoder, data: ArrayBuffer): Promise<AudioBuffer> {
  return new Promise((resolve, reject) => {
    const fail = (e: unknown) => reject(e instanceof Error ? e : new Error(String(e ?? 'decodeAudioData failed')));
    try {
      const p = ctx.decodeAudioData(data, resolve, fail);
      if (p && typeof p.then === 'function') p.then(resolve, fail);
    } catch (e) {
      fail(e);
    }
  });
}

/** Decoded samples per cue. Loads best-effort, file by file. */
export class SampleBank {
  private readonly buffers = new Map<Cue, AudioBuffer[]>();

  async load(manifest: SoundManifest, ctx: AudioDecoder, read: (path: string) => Promise<ArrayBuffer>): Promise<void> {
    const jobs = Object.entries(manifest.sfx).map(async ([cue, paths]) => {
      const got: AudioBuffer[] = [];
      for (const path of paths ?? []) {
        try {
          got.push(await decodeAudio(ctx, await read(path)));
        } catch (err) {
          console.warn(`sound: ${path} did not load, the cue keeps its synth voice`, err);
        }
      }
      if (got.length > 0) this.buffers.set(cue as Cue, got);
    });
    await Promise.all(jobs);
  }

  /** One of the cue's samples (a random one when there are several), or null for the synth. */
  pick(cue: Cue, rand: number): AudioBuffer | null {
    const list = this.buffers.get(cue);
    return list ? list[Math.min(list.length - 1, Math.floor(rand * list.length))] : null;
  }

  get size(): number {
    return this.buffers.size;
  }
}
