// A light screen shake when a blow fells far more mobs at once than the run has been felling, so a
// big hit lands with some weight. The bar follows the kill rate: late in a chapter area spells fell
// several mobs every tick, and a fixed bar had the screen shaking half the time. A shake also waits
// a moment after the last one, and runs in real time, so fast-forward neither doubles how often it
// fires nor how fast it wobbles. Pure: the game feeds it each tick's kills and the real frame time
// and adds the offset to the camera, in screen px.

export const SHAKE = {
  /** A tick's kills shake only at this many or more, and at this many times the recent mean. */
  kills: 8,
  ratio: 3,
  /** Ticks the recent mean of kills per tick looks back over (about 3 s at 30 Hz). */
  window: 90,
  /** Px of amplitude per kill, up to max. */
  perKill: 1,
  max: 10,
  /** Real seconds after a shake starts before another may. */
  rest: 1.2,
  /** Real seconds for the amplitude to fall to ~37 %. */
  decay: 0.1,
  /** Wobbles per real second. */
  rate: 24,
};

export class Shake {
  /** The player's setting; off, nothing shakes. */
  on = true;
  private amp = 0;
  private t = 0;
  private mean = 0;
  private wait = 0;

  /** One tick's kills: a burst well above the recent rate shakes, unless a shake was just had. */
  kills(n: number): void {
    const bar = Math.max(SHAKE.kills, SHAKE.ratio * this.mean);
    this.mean += (n - this.mean) / SHAKE.window;
    if (!this.on || n < bar || this.wait > 0) return;
    this.amp = Math.min(SHAKE.max, SHAKE.perKill * n);
    this.wait = SHAKE.rest;
  }

  /** Advances by `dt` real seconds; the camera offset now. */
  step(dt: number): { x: number; y: number } {
    this.t += dt;
    this.wait = Math.max(0, this.wait - dt);
    this.amp = this.amp < 0.25 || !this.on ? 0 : this.amp * Math.exp(-dt / SHAKE.decay);
    if (this.amp === 0) return { x: 0, y: 0 };
    const w = this.t * SHAKE.rate * Math.PI * 2;
    return { x: Math.sin(w) * this.amp, y: Math.cos(w * 1.3) * this.amp * 0.6 };
  }
}
