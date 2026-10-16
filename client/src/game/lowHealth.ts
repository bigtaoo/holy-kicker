// The low-health warning: at or below a share of his health the hero's heart beats, as a soft
// heartbeat cue and a red edge on the screen that pulses with it, faster the lower he is. It
// stops once he is healed a little above the bar (hysteresis, so a hero hovering on the line does
// not flicker it on and off), and whenever it does not apply (the sandbox, a downed hero, a run
// that is over). Pure: the game feeds it the real frame time and the hero's health.

export interface LowHealthBalance {
  /** On at or below this percent of the hero's max health. */
  percent: number;
  /** Off only above percent + hysteresis. */
  hysteresis: number;
  /** Heartbeats per minute at the bar and at the last sliver of health. */
  bpm: [number, number];
}

/** Real seconds for the vignette to fade fully in or out. */
const FADE = 0.3;
/** The second beat of a heartbeat ("dub"), as a share of the beat, and its strength. */
const DUB_AT = 0.2;
const DUB = 0.7;
/** How fast each beat's flush dies away, per beat. */
const DECAY = 10;

export class LowHealth {
  on = false;
  /** 0..1 through the current beat. */
  private phase = 0;
  /** 0 at the bar, 1 at no health left. */
  private danger = 0;
  /** The fade in and out, 0..1. */
  private level = 0;

  constructor(private readonly cfg: LowHealthBalance) {}

  /**
   * Advances by `dt` real seconds with the hero at `hp` of `maxHp`; `live` says the warning
   * applies at all. True when a heartbeat starts this frame (to play its cue).
   */
  step(dt: number, hp: number, maxHp: number, live: boolean): boolean {
    const { percent, hysteresis } = this.cfg;
    const pct = maxHp > 0 ? (hp * 100) / maxHp : 100;
    const was = this.on;
    this.on = live && hp > 0 && (was ? pct <= percent + hysteresis : pct <= percent);
    this.level = Math.min(1, Math.max(0, this.level + (this.on ? dt : -dt) / FADE));
    if (!this.on) return false;
    this.danger = Math.min(1, Math.max(0, 1 - pct / percent));
    if (!was) {
      this.phase = 0;
      return true;
    }
    this.phase += (dt * this.rate()) / 60;
    if (this.phase < 1) return false;
    this.phase %= 1;
    return true;
  }

  /** Heartbeats per minute now. */
  rate(): number {
    const [slow, fast] = this.cfg.bpm;
    return slow + (fast - slow) * this.danger;
  }

  /** The vignette's strength now, 0..1: a flush on each beat, stronger the lower he is. */
  get pulse(): number {
    if (this.level === 0) return 0;
    const lub = Math.exp(-this.phase * DECAY);
    const dub = this.phase >= DUB_AT ? DUB * Math.exp(-(this.phase - DUB_AT) * DECAY) : 0;
    const beat = Math.max(lub, dub);
    return this.level * (0.35 + 0.65 * beat) * (0.6 + 0.4 * this.danger);
  }

  /** Off at once (a revive, a new life). */
  reset(): void {
    this.on = false;
    this.level = 0;
    this.phase = 0;
  }
}
