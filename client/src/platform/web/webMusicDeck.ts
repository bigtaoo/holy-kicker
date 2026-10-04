import type { MusicDeck } from '../../audio/music';

// A web music deck (adapted from daydayup platform/web/webMusicDeck.ts): an Audio element
// streamed into the effects' AudioContext through its own gain node. The level lives in the
// graph because HTMLMediaElement.volume does nothing on iOS Safari. createMediaElementSource
// may be called once per element, so the deck is long-lived and re-pointed, not rebuilt.
export class WebMusicDeck implements MusicDeck {
  private readonly el = new Audio();
  private readonly gain: GainNode;
  private playing = false;

  constructor(ctx: AudioContext) {
    // the player crossfades the wrap; a native loop would click at the MP3 padding
    this.el.loop = false;
    this.el.preload = 'auto';
    this.gain = ctx.createGain();
    this.gain.gain.value = 0;
    ctx.createMediaElementSource(this.el).connect(this.gain);
    this.gain.connect(ctx.destination);
  }

  play(path: string): void {
    // el.src reads back absolute; re-assigning the same file restarts the download on some browsers
    if (!this.el.src.endsWith(path)) this.el.src = path;
    else this.rewind();
    this.playing = true;
    this.el.play().catch(() => {
      this.playing = false;
    });
  }

  setLevel(level: number): void {
    this.gain.gain.value = level;
  }

  stop(): void {
    if (!this.playing) return;
    this.playing = false;
    this.el.pause();
    this.rewind();
  }

  position(): number | null {
    return this.playing && Number.isFinite(this.el.currentTime) ? this.el.currentTime : null;
  }

  setPaused(paused: boolean): void {
    if (!this.playing) return;
    if (paused) this.el.pause();
    else this.el.play().catch(() => {});
  }

  private rewind(): void {
    try {
      this.el.currentTime = 0;
    } catch {
      /* not seekable yet; it starts at 0 anyway */
    }
  }
}
