import type { Ads, AudioHost, Platform } from '../platform/types';
import { CueGate, coalesceBoost } from './cueGate';
import { CUES, type Cue } from './cues';
import { MusicPlayer } from './music';
import { SOUNDS_MANIFEST, SampleBank, parseManifest, type SoundManifest, type Track } from './samples';
import { Kit, VOICES, noiseBuffer } from './synth';
import { VoiceBudget } from './voiceBudget';

// The game's sound effects and music. Cues are requested any time (sim events, UI taps) and
// released once a frame by `flush`, through the gate (merge repeats, respect each cue's gap)
// and the voice cap; each plays its recorded sample (samples.ts) or, without one, its synth
// voice. Effects go through one master gain and music through its own decks; both are silent
// while anything holds the sound: a hidden tab or backgrounded mini-game, an ad, the portal's
// own mute (and each its own settings volume). Render-side only: it reads events and never
// touches the sim.

/** Voices at once. A horde game asks for many; the gate merges most, the cap takes the rest. */
const VOICE_CAP = 14;
/** Seconds the master gain takes to open or close, so a mute never clicks. */
const FADE = 0.04;
/** The effects bus level at full settings volume. */
const MASTER = 0.8;
/** The music level at full settings volume; music sits under the effects. */
const MUSIC = 0.45;
/** Settings volume steps (meta/settings.ts VOLUME_STEPS); the level grows as a square, as ears hear. */
const STEPS = 5;
/** Samples play a little higher or lower each time, so a repeated cue does not drone. */
const DETUNE = 0.06;

export type HoldReason = 'setting' | 'hidden' | 'ad' | 'host';

/** What Sound needs from the platform: the audio host and the files. */
export type SoundHost = Pick<Platform, 'audio' | 'readText' | 'readBinary' | 'loadPack'>;

export class Sound {
  private readonly gate = new CueGate();
  private readonly budget = new VoiceBudget(VOICE_CAP);
  private readonly holds = new Set<HoldReason>();
  private readonly bank = new SampleBank();
  private readonly host: AudioHost | null;
  private readonly manifest: Promise<SoundManifest | null>;
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private noise: AudioBuffer | null = null;
  private music: MusicPlayer | null = null;
  private failed = false;
  private volume: number;
  private musicVolume: number;

  constructor(private readonly files: SoundHost, volume: number, music: number) {
    this.host = files.audio;
    this.volume = volume;
    this.musicVolume = music;
    if (volume <= 0) this.holds.add('setting');
    // the recordings are a WeChat subpackage of their own; without them every cue stays synth
    this.manifest = this.host
      ? files.loadPack('audio').then(() => files.readText(SOUNDS_MANIFEST)).then(parseManifest).catch(() => null)
      : Promise.resolve(null);
    this.host?.onGesture(() => this.resume());
    this.host?.onFocus((focused) => this.hold('hidden', !focused));
    this.host?.onHostMute((muted) => this.hold('host', muted));
  }

  /** The settings effects volume, 0 (off) to 5. */
  get level(): number {
    return this.volume;
  }

  setVolume(volume: number): void {
    this.volume = volume;
    // the button's own tap plays at the next flush, at the new level
    this.hold('setting', volume <= 0);
  }

  /** The settings music volume, 0 (off) to 5. */
  get musicLevel(): number {
    return this.musicVolume;
  }

  setMusicVolume(volume: number): void {
    this.musicVolume = volume;
  }

  /** The master gain while nothing holds the sound. */
  private get open(): number {
    return MASTER * (this.volume / STEPS) ** 2;
  }

  /** Asks for a cue; it plays at the next flush if the gate lets it. */
  play(cue: Cue): void {
    if (this.holds.size === 0) this.gate.add(cue);
  }

  /** Plays this frame's cues and moves the music toward `track`. Call once a frame. */
  flush(track: Track | null, dtMs: number): void {
    if (this.music) {
      // the effects' own setting does not silence the music
      const held = this.holds.has('hidden') || this.holds.has('ad') || this.holds.has('host');
      const level = held ? 0 : MUSIC * (this.musicVolume / STEPS) ** 2;
      this.music.setVolume(level);
      this.music.update(level > 0 ? track : null, dtMs);
    }
    const ctx = this.ctx;
    if (!ctx || !this.master || !this.noise || ctx.state !== 'running' || this.holds.size > 0) {
      this.gate.clear();
      return;
    }
    const now = ctx.currentTime;
    for (const { cue, count } of this.gate.flush(now)) this.voice(ctx, this.master, this.noise, cue, count, now);
  }

  /** Wraps the host's ads so the game is silent while one plays: from the moment it is on
   *  screen, not from the request, until it is over or failed. */
  muteDuring(ads: Ads): Ads {
    const around = async <T>(work: (started: () => void) => Promise<T>, started?: () => void): Promise<T> => {
      try {
        return await work(() => {
          this.hold('ad', true);
          started?.();
        });
      } finally {
        this.hold('ad', false);
      }
    };
    return {
      rewardedAvailable: () => ads.rewardedAvailable(),
      rewarded: (started) => around((s) => ads.rewarded(s), started),
      midgame: (started) => around((s) => ads.midgame(s), started),
    };
  }

  private hold(reason: HoldReason, on: boolean): void {
    if (on) this.holds.add(reason);
    else this.holds.delete(reason);
    // a backgrounded game holds the music where it is, to pick it up mid-bar
    this.music?.setPaused(this.holds.has('hidden'));
    const ctx = this.ctx;
    if (!ctx || !this.master) return;
    const level = this.holds.size === 0 ? this.open : 0;
    const t = ctx.currentTime;
    this.master.gain.cancelScheduledValues(t);
    this.master.gain.setValueAtTime(this.master.gain.value, t);
    this.master.gain.linearRampToValueAtTime(level, t + FADE);
    // a backgrounded game stops the audio thread too, for the battery
    if (this.holds.has('hidden')) ctx.suspend().catch(() => {});
    else this.resume();
  }

  /** Creates the context on the first gesture (autoplay rules) and wakes it after a pause. */
  private resume(): void {
    if (this.failed || !this.host) return;
    if (!this.ctx) {
      try {
        this.ctx = this.host.context();
        if (!this.ctx) {
          this.failed = true;
          return;
        }
        this.master = this.ctx.createGain();
        this.master.gain.value = this.holds.size === 0 ? this.open : 0;
        this.master.connect(limiter(this.ctx));
        this.noise = noiseBuffer(this.ctx);
        this.loadFiles(this.ctx);
      } catch (err) {
        console.warn('sound: no audio context, the game runs silent', err);
        this.failed = true;
        this.ctx = null;
        return;
      }
    }
    // iOS leaves a context 'interrupted' after a call or Siri; only a gesture's resume() wakes it
    const state = this.ctx.state as string;
    if (state === 'suspended' || state === 'interrupted') this.ctx.resume().catch(() => {});
  }

  /** The music decks and the samples, once there is a context to decode into. */
  private loadFiles(ctx: AudioContext): void {
    void this.manifest.then(async (m) => {
      if (!m || !this.host) return;
      const decks = this.host.musicDecks(ctx);
      if (decks) {
        this.music = new MusicPlayer(decks, m.music);
        this.music.setPaused(this.holds.has('hidden'));
      }
      await this.bank.load(m, ctx, (path) => this.files.readBinary(path));
    }).catch((err) => console.warn('sound: the recordings did not load', err));
  }

  private voice(ctx: AudioContext, master: GainNode, noise: AudioBuffer, cue: Cue, count: number, now: number): void {
    const def = CUES[cue];
    const out = ctx.createGain();
    out.gain.value = def.gain * coalesceBoost(count);
    // the voice is built first so its length is known; a refused claim just never connects it
    const end = this.sample(ctx, out, cue, now) ?? this.synth(ctx, out, noise, cue, now);
    const granted = this.budget.claim(def.priority, now, now + end, () => {
      const t = ctx.currentTime;
      out.gain.setValueAtTime(out.gain.value, t);
      out.gain.linearRampToValueAtTime(0, t + 0.015);
    });
    if (granted) out.connect(master);
  }

  /** Starts the cue's recorded sample and returns its length, or null without one. */
  private sample(ctx: AudioContext, out: GainNode, cue: Cue, now: number): number | null {
    const buf = this.bank.pick(cue, Math.random());
    if (!buf) return null;
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.playbackRate.value = 1 + (Math.random() * 2 - 1) * DETUNE;
    src.connect(out);
    src.start(now);
    return buf.duration / src.playbackRate.value;
  }

  private synth(ctx: AudioContext, out: GainNode, noise: AudioBuffer, cue: Cue, now: number): number {
    const kit = new Kit(ctx, out, noise, now);
    VOICES[cue](kit);
    return kit.end;
  }
}

/** A compressor in front of the speakers, so a frame of stacked hits does not clip; straight
 *  to the output where the context has none (feature-detected for WeChat). */
function limiter(ctx: AudioContext): AudioNode {
  if (typeof ctx.createDynamicsCompressor !== 'function') return ctx.destination;
  const c = ctx.createDynamicsCompressor();
  c.threshold.value = -10;
  c.knee.value = 6;
  c.ratio.value = 12;
  c.attack.value = 0.003;
  c.release.value = 0.15;
  c.connect(ctx.destination);
  return c;
}
