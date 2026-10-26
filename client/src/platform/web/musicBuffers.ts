import { decodeAudio, type AudioDecoder } from '../../audio/samples';

// The web music, decoded rather than streamed (docs/audio.md): an <audio>
// element claims the phone's media focus, so Android Chrome and Safari pause the player's Spotify
// or YouTube for it, while Web Audio alone plays alongside. A decoded minute of stereo is about
// 25 MB at 48 kHz, so the tracks decode at MUSIC_RATE (the music sits under the effects; nothing
// above 16 kHz is missed) and only while a deck holds them. The compressed files, about 1 MB each,
// are kept, so a track the player returns to comes back without another download.

/** Samples per second the music decodes at. */
export const MUSIC_RATE = 32000;

export class MusicBuffers {
  private readonly held = new Map<string, { users: number; buffer: Promise<AudioBuffer> }>();
  private readonly files = new Map<string, Promise<ArrayBuffer>>();

  /** `decoders` are tried in turn: the resampling one first, the playing context as the fallback. */
  constructor(
    private readonly decoders: readonly AudioDecoder[],
    private readonly read: (path: string) => Promise<ArrayBuffer>,
  ) {}

  /** The decoded file, shared by every deck holding it; each hold is paired with a release. */
  hold(path: string): Promise<AudioBuffer> {
    let entry = this.held.get(path);
    if (!entry) {
      entry = { users: 0, buffer: this.decode(path) };
      this.held.set(path, entry);
    }
    entry.users++;
    return entry.buffer;
  }

  /** Once no deck holds a file its samples are let go (a failed decode is tried again next time). */
  release(path: string): void {
    const entry = this.held.get(path);
    if (entry && --entry.users <= 0) this.held.delete(path);
  }

  /** Files decoded or decoding now. */
  get decoded(): number {
    return this.held.size;
  }

  private async decode(path: string): Promise<AudioBuffer> {
    let file = this.files.get(path);
    if (!file) {
      file = this.read(path);
      this.files.set(path, file);
      file.catch(() => this.files.delete(path));
    }
    const bytes = await file;
    let last: unknown = new Error('no decoder');
    for (const decoder of this.decoders) {
      try {
        // decoding detaches the bytes it is given, so each attempt gets a copy
        return await decodeAudio(decoder, bytes.slice(0));
      } catch (err) {
        last = err;
      }
    }
    throw last;
  }
}
