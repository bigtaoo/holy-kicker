// A light screen shake when a blow fells far more mobs at once than the run has been felling, so a
// big hit lands with some weight. The bar follows the kill rate: late in a chapter area spells fell
// several mobs every tick, and a fixed bar had the screen shaking half the time. A shake also waits
// a moment after the last one, and runs in real time, so fast-forward neither doubles how often it
// fires nor how fast it wobbles. Pure: the game feeds it each tick's kills and the real frame time
// and adds the offset to the camera, in screen px. Apart from the shake, a punch nudges the camera
// once along a blow, out and back, so a single hit in the opening lands with some weight.

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
  /** Px of amplitude when the hero goes down (the kill cam plays it in slow motion). */
  down: 8,
  /** Real seconds a punch takes out and back. */
  punchTime: 0.08,
  /** Px a punch, or punches landing on top of each other, may push the camera at most. */
  punchMax: 3,
};

export class Shake {
  /** The player's setting; off, nothing shakes. */
  on = true;
  private amp = 0;
  private t = 0;
  private mean = 0;
  private wait = 0;
  /** The current punch's peak offset in px, and the real seconds left of it. */
  private px = 0;
  private py = 0;
  private pt = 0;

  /** One tick's kills: a burst well above the recent rate shakes, unless a shake was just had. */
  kills(n: number): void {
    const bar = Math.max(SHAKE.kills, SHAKE.ratio * this.mean);
    this.mean += (n - this.mean) / SHAKE.window;
    if (!this.on || n < bar || this.wait > 0) return;
    this.amp = Math.min(SHAKE.max, SHAKE.perKill * n);
    this.wait = SHAKE.rest;
  }

  /** One heavy blow (the hero going down) shakes whatever the kill rate, unless shake is off. */
  blow(amp = SHAKE.down): void {
    if (!this.on) return;
    this.amp = Math.max(this.amp, Math.min(SHAKE.max, amp));
    this.wait = SHAKE.rest;
  }

  /**
   * One quick nudge of `amp` px along the direction (dx, dy), out and back. A punch landing on a
   * running one adds to where the camera is now and goes on from there without a jump, but
   * together they never reach past `SHAKE.punchMax`.
   */
  punch(dx: number, dy: number, amp: number): void {
    const len = Math.hypot(dx, dy);
    if (!this.on || len === 0 || !(amp > 0)) return;
    const e = this.envelope();
    const cx = this.px * e;
    const cy = this.py * e;
    const x = (dx / len) * amp + cx;
    const y = (dy / len) * amp + cy;
    const peak = Math.hypot(x, y);
    if (peak === 0) return;
    const k = Math.min(1, SHAKE.punchMax / peak);
    this.px = x * k;
    this.py = y * k;
    // start the new punch on its way out, as far along as the camera already is
    const along = Math.min(1, Math.hypot(cx, cy) / (peak * k));
    this.pt = SHAKE.punchTime * (1 - Math.asin(along) / Math.PI);
  }

  /** How far out the punch is now, 0..1 of its peak. */
  private envelope(): number {
    return this.pt > 0 ? Math.sin((1 - this.pt / SHAKE.punchTime) * Math.PI) : 0;
  }

  /** Advances by `dt` real seconds; the camera offset now. */
  step(dt: number): { x: number; y: number } {
    this.t += dt;
    this.wait = Math.max(0, this.wait - dt);
    this.amp = this.amp < 0.25 || !this.on ? 0 : this.amp * Math.exp(-dt / SHAKE.decay);
    this.pt = this.on ? Math.max(0, this.pt - dt) : 0;
    // out and back: a half sine over the punch's time
    const p = this.envelope();
    const x = p > 0 ? this.px * p : 0;
    const y = p > 0 ? this.py * p : 0;
    if (this.amp === 0) return { x, y };
    const w = this.t * SHAKE.rate * Math.PI * 2;
    return { x: Math.sin(w) * this.amp + x, y: Math.cos(w * 1.3) * this.amp * 0.6 + y };
  }
}
