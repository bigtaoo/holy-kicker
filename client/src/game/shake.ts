// A light screen shake when a blow fells several mobs at once, so a big hit lands with some
// weight; one kill at a time never shakes (the horde dies all the time). Pure: the game feeds
// it each tick's kills and the frame time and adds the offset to the camera, in screen px.

export const SHAKE = {
  /** Kills in one tick that start a shake, and px of amplitude per kill, up to max. */
  kills: 3,
  perKill: 2.5,
  max: 10,
  /** Seconds for the amplitude to fall to ~37 %. */
  decay: 0.1,
  /** Wobbles per second. */
  rate: 24,
};

export class Shake {
  private amp = 0;
  private t = 0;

  /** One tick's kills: a burst of them shakes, never weaker than a shake still running. */
  kills(n: number): void {
    if (n >= SHAKE.kills) this.amp = Math.max(this.amp, Math.min(SHAKE.max, SHAKE.perKill * n));
  }

  /** Advances by `dt` seconds; the camera offset now. */
  step(dt: number): { x: number; y: number } {
    this.t += dt;
    this.amp = this.amp < 0.25 ? 0 : this.amp * Math.exp(-dt / SHAKE.decay);
    if (this.amp === 0) return { x: 0, y: 0 };
    const w = this.t * SHAKE.rate * Math.PI * 2;
    return { x: Math.sin(w) * this.amp, y: Math.cos(w * 1.3) * this.amp * 0.6 };
  }
}
