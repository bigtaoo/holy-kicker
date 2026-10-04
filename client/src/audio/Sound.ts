import type { Ads, AudioHost } from '../platform/types';
import { CueGate, coalesceBoost } from './cueGate';
import { CUES, type Cue } from './cues';
import { Kit, VOICES, noiseBuffer } from './synth';
import { VoiceBudget } from './voiceBudget';

// The game's sound effects. Cues are requested any time (sim events, UI taps) and released
// once a frame by `flush`, through the gate (merge repeats, respect each cue's gap) and the
// voice cap. Everything goes through one master gain, which is closed while anything holds
// the sound: the player's setting, a hidden tab or backgrounded mini-game, an ad, the
// portal's own mute. Render-side only: it reads events and never touches the sim.

/** Voices at once. A horde game asks for many; the gate merges most, the cap takes the rest. */
const VOICE_CAP = 14;
/** Seconds the master gain takes to open or close, so a mute never clicks. */
const FADE = 0.04;
/** The effects bus level at full settings volume. */
const MASTER = 0.8;

export type HoldReason = 'setting' | 'hidden' | 'ad' | 'host';

export class Sound {
  private readonly gate = new CueGate();
  private readonly budget = new VoiceBudget(VOICE_CAP);
  private readonly holds = new Set<HoldReason>();
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private noise: AudioBuffer | null = null;
  private failed = false;

  constructor(private readonly host: AudioHost | null, enabled: boolean) {
    if (!enabled) this.holds.add('setting');
    host?.onGesture(() => this.resume());
    host?.onFocus((focused) => this.hold('hidden', !focused));
    host?.onHostMute((muted) => this.hold('host', muted));
  }

  get enabled(): boolean {
    return !this.holds.has('setting');
  }

  setEnabled(on: boolean): void {
    this.hold('setting', !on);
  }

  /** Asks for a cue; it plays at the next flush if the gate lets it. */
  play(cue: Cue): void {
    if (this.holds.size === 0) this.gate.add(cue);
  }

  /** Plays this frame's cues. Call once a frame. */
  flush(): void {
    const ctx = this.ctx;
    if (!ctx || !this.master || !this.noise || ctx.state !== 'running' || this.holds.size > 0) {
      this.gate.clear();
      return;
    }
    const now = ctx.currentTime;
    for (const { cue, count } of this.gate.flush(now)) this.voice(ctx, this.master, this.noise, cue, count, now);
  }

  /** Wraps the host's ads so the game is silent while one plays. */
  muteDuring(ads: Ads): Ads {
    const around = async <T>(work: () => Promise<T>): Promise<T> => {
      this.hold('ad', true);
      try {
        return await work();
      } finally {
        this.hold('ad', false);
      }
    };
    return {
      rewardedAvailable: () => ads.rewardedAvailable(),
      rewarded: () => around(() => ads.rewarded()),
      midgame: () => around(() => ads.midgame()),
    };
  }

  private hold(reason: HoldReason, on: boolean): void {
    if (on) this.holds.add(reason);
    else this.holds.delete(reason);
    const ctx = this.ctx;
    if (!ctx || !this.master) return;
    const level = this.holds.size === 0 ? MASTER : 0;
    const t = ctx.currentTime;
    this.master.gain.cancelScheduledValues(t);
    this.master.gain.setValueAtTime(this.master.gain.value, t);
    this.master.gain.linearRampToValueAtTime(level, t + FADE);
    // a backgrounded game stops the audio thread too, for the battery
    if (this.holds.has('hidden')) ctx.suspend().catch(() => {});
    else if (this.holds.size === 0) this.resume();
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
        this.master.gain.value = this.holds.size === 0 ? MASTER : 0;
        this.master.connect(limiter(this.ctx));
        this.noise = noiseBuffer(this.ctx);
      } catch (err) {
        console.warn('sound: no audio context, the game runs silent', err);
        this.failed = true;
        this.ctx = null;
        return;
      }
    }
    if (this.ctx.state === 'suspended') this.ctx.resume().catch(() => {});
  }

  private voice(ctx: AudioContext, master: GainNode, noise: AudioBuffer, cue: Cue, count: number, now: number): void {
    const def = CUES[cue];
    const out = ctx.createGain();
    out.gain.value = def.gain * coalesceBoost(count);
    // the voice is built first so its length is known; a refused claim just never connects it
    const kit = new Kit(ctx, out, noise, now);
    VOICES[cue](kit);
    const granted = this.budget.claim(def.priority, now, now + kit.end, () => {
      const t = ctx.currentTime;
      out.gain.setValueAtTime(out.gain.value, t);
      out.gain.linearRampToValueAtTime(0, t + 0.015);
    });
    if (granted) out.connect(master);
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
