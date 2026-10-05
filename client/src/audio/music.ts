import type { MusicDef, Track } from './samples';

// Background music (adapted from daydayup audio/MusicPlayer.ts). Two long-lived streaming decks
// and one move: an equal-power crossfade between them. Changing track is a crossfade to the
// other file; looping is a crossfade to the same file, started XFADE seconds before the end,
// because an MP3 stream is padded at both ends and no native loop wraps it without a click.
// Streams rather than decoded buffers: a minute of stereo is about 25 MB once decoded.
// The loop point is read back from the deck's own position, never counted, so a stalled
// frame or a backgrounded tab cannot move it. Render-side only; wall-clock time is fine here.

/** Seconds each crossfade takes. */
export const XFADE = 2;

/** One stream: a web Audio element through a gain node, or a WeChat InnerAudioContext. */
export interface MusicDeck {
  /** Points the deck at a file and plays it from the start. */
  play(path: string): void;
  /** 0..1, written every frame of a fade. */
  setLevel(level: number): void;
  stop(): void;
  /** Seconds into the file, or null when not playing (or not started yet). */
  position(): number | null;
  /** Holds or releases playback without losing the place (hidden tab, phone call). */
  setPaused(paused: boolean): void;
}

interface Fade {
  inDeck: 0 | 1 | null;
  outDeck: 0 | 1 | null;
  t: number;
}

export class MusicPlayer {
  private live: 0 | 1 | null = null;
  private track: Track | null = null;
  private fade: Fade | null = null;
  private readonly levels = [0, 0];
  private paused = false;
  private volume = 1;

  constructor(
    private readonly decks: readonly [MusicDeck, MusicDeck],
    private readonly tracks: Partial<Record<Track, MusicDef>>,
  ) {}

  get current(): Track | null {
    return this.track;
  }

  /** The music bus level (settings volume and holds), applied on top of the fades. */
  setVolume(v: number): void {
    if (v === this.volume) return;
    this.volume = v;
    for (const d of [0, 1] as const) this.apply(d);
  }

  /**
   * One frame: `want` is what should be playing; asking for the same track again does nothing.
   * A boss track that did not ship keeps the battle music.
   */
  update(want: Track | null, dtMs: number): void {
    if (this.paused) return;
    const asked = want === 'boss' && !this.tracks.boss ? 'battle' : want;
    const next = asked && this.tracks[asked] ? asked : null;
    if (this.fade) this.advance(dtMs / 1000);
    if (next !== this.track) this.change(next);
    else if (!this.fade) this.checkWrap();
  }

  setPaused(paused: boolean): void {
    if (paused === this.paused) return;
    this.paused = paused;
    for (const deck of this.decks) guard(() => deck.setPaused(paused));
  }

  private change(next: Track | null): void {
    const out = this.live;
    this.track = next;
    if (next === null) {
      this.live = null;
      this.begin({ inDeck: null, outDeck: out, t: 0 });
      return;
    }
    const inDeck = this.free(out);
    this.live = inDeck;
    this.begin({ inDeck, outDeck: out, t: 0 }, this.tracks[next]!.path);
  }

  private checkWrap(): void {
    if (this.track === null || this.live === null) return;
    const def = this.tracks[this.track]!;
    const pos = this.decks[this.live].position();
    if (pos === null || pos < def.length - XFADE) return;
    const out = this.live;
    this.live = this.free(out);
    this.begin({ inDeck: this.live, outDeck: out, t: 0 }, def.path);
  }

  /** The deck not carrying the outgoing stream (or not draining a fade to silence). */
  private free(out: 0 | 1 | null): 0 | 1 {
    const busy = out ?? this.fade?.outDeck ?? null;
    return busy === 0 ? 1 : 0;
  }

  private begin(next: Fade, path?: string): void {
    // a fade arriving mid-fade: whatever the old one still held and the new one does not is cut
    const old = this.fade;
    if (old) {
      for (const d of [old.inDeck, old.outDeck]) {
        if (d !== null && (d !== next.outDeck || d === next.inDeck)) this.silence(d);
      }
    }
    this.fade = next;
    if (next.inDeck !== null && path) {
      const deck = this.decks[next.inDeck];
      guard(() => deck.play(path));
    }
    this.applyFade(next);
  }

  private advance(dt: number): void {
    const f = this.fade!;
    f.t += dt / XFADE;
    if (f.t < 1) {
      this.applyFade(f);
      return;
    }
    this.fade = null;
    if (f.inDeck !== null) this.set(f.inDeck, 1);
    // stopped, not left at zero: a silent stream still decodes, which is battery for nothing
    if (f.outDeck !== null && f.outDeck !== f.inDeck) this.silence(f.outDeck);
  }

  private applyFade(f: Fade): void {
    // equal power: the two levels sum to one in power, so a fade has no dip in the middle
    const a = Math.min(1, Math.max(0, f.t)) * (Math.PI / 2);
    if (f.inDeck !== null) this.set(f.inDeck, Math.sin(a));
    if (f.outDeck !== null && f.outDeck !== f.inDeck) this.set(f.outDeck, Math.cos(a));
  }

  private silence(d: 0 | 1): void {
    this.set(d, 0);
    const deck = this.decks[d];
    guard(() => deck.stop());
  }

  private set(d: 0 | 1, level: number): void {
    this.levels[d] = level;
    this.apply(d);
  }

  private apply(d: 0 | 1): void {
    const deck = this.decks[d];
    const level = Math.max(0, Math.min(1, this.levels[d] * this.volume));
    guard(() => deck.setLevel(level));
  }
}

/** A deck that throws (a stream the host refused) must not take the frame down with it. */
function guard(work: () => void): void {
  try {
    work();
  } catch (err) {
    console.warn('music: deck failed', err);
  }
}
