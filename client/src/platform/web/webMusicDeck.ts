import type { MusicDeck } from '../../audio/music';
import type { MusicBuffers } from './musicBuffers';

// A web music deck: the decoded file (musicBuffers.ts) played by a buffer source through the
// deck's own gain node in the effects' AudioContext. No <audio> element, on purpose: one takes the
// phone's media focus and stops the player's own music (docs/audio.md).
// A buffer source plays once, so play, a pause and a resume each start a new one at the place
// the deck keeps; the place is read off the context's clock, which stops while it is suspended.
export class WebMusicDeck implements MusicDeck {
  private readonly gain: GainNode;
  private path: string | null = null;
  private buffer: AudioBuffer | null = null;
  private source: AudioBufferSourceNode | null = null;
  /** The context time the file's start played (or would have) at, while a source runs. */
  private startedAt = 0;
  /** Seconds into the file to start the next source at. */
  private at = 0;
  private playing = false;
  /** Whether the file has started since play(): until it is decoded there is no place to report. */
  private begun = false;
  private paused = false;

  constructor(private readonly ctx: AudioContext, private readonly buffers: MusicBuffers) {
    this.gain = ctx.createGain();
    this.gain.gain.value = 0;
    this.gain.connect(ctx.destination);
  }

  play(path: string): void {
    this.halt();
    this.playing = true;
    this.begun = false;
    this.at = 0;
    if (path === this.path) {
      this.start();
      return;
    }
    this.drop();
    this.path = path;
    this.buffers.hold(path).then(
      (buffer) => {
        if (this.path !== path) return;
        this.buffer = buffer;
        this.start();
      },
      (err) => {
        if (this.path === path) this.playing = false;
        console.warn(`music: ${path} failed`, err);
      },
    );
  }

  setLevel(level: number): void {
    this.gain.gain.value = level;
  }

  stop(): void {
    this.halt();
    this.playing = false;
    this.begun = false;
    // the samples are let go once neither deck plays the file
    this.drop();
  }

  position(): number | null {
    if (!this.playing) return null;
    if (this.source) return this.ctx.currentTime - this.startedAt;
    return this.begun ? this.at : null;
  }

  setPaused(paused: boolean): void {
    if (paused === this.paused) return;
    this.paused = paused;
    if (!this.playing) return;
    if (!paused) {
      this.start();
    } else if (this.source) {
      this.at = this.ctx.currentTime - this.startedAt;
      this.halt();
    }
  }

  private start(): void {
    if (!this.playing || this.paused || !this.buffer || this.source) return;
    const src = this.ctx.createBufferSource();
    src.buffer = this.buffer;
    src.connect(this.gain);
    src.start(0, this.at);
    this.source = src;
    this.startedAt = this.ctx.currentTime - this.at;
    this.begun = true;
  }

  private halt(): void {
    const src = this.source;
    if (!src) return;
    this.source = null;
    try {
      src.stop();
    } catch {
      /* already over */
    }
    src.disconnect();
  }

  private drop(): void {
    if (this.path !== null) this.buffers.release(this.path);
    this.path = null;
    this.buffer = null;
  }
}
