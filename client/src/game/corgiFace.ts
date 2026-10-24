// Which head the corgi theme's hero wears (docs/reskin.md "Animation › Hero"). Strong faces are
// kept for moments: a wince when hit, a happy grin on a card pick or a big gem, a proud tongue-out
// when a wave or a boss falls. Between them it holds a calm one: worried while health is low,
// focused while the guns keep firing, else the smile, with a blink now and then. Every face holds
// a moment before the next takes over, so it never flickers. Pure, so it is tested without Pixi;
// corgiHero.ts swaps the images.

/** The head variants a rig may carry (tools/split_parts.py "faces"); a rig without them keeps one face. */
export type CorgiFaceId = 'head_hurt' | 'head_focus' | 'head_blink' | 'head_happy' | 'head_proud' | 'head_worried';

/** The moments that bring a face of their own. */
export type CorgiMoment = 'happy' | 'proud';

/** Seconds each face holds. */
export const HURT_FACE = 0.45;
export const MOMENT_FACE: Readonly<Record<CorgiMoment, number>> = { happy: 0.9, proud: 1.3 };
/** Seconds the focused face outlasts the last shot, so steady fire holds it. */
export const FOCUS = 1.2;
export const BLINK = 0.12;
/** Seconds a face shows at least before another takes over (a wince and a blink do not wait). */
export const HOLD = 0.3;
/** The share of health under which the hero looks worried, and over which he stops. */
export const WORRIED = [0.3, 0.36] as const;
/** Seconds between blinks: at least the first, up to both together. */
const BLINK_GAP = [2.2, 3.5] as const;
/** The share of blinks that come as a double. */
const DOUBLE = 0.2;

export class CorgiFace {
  private hurtT = 0;
  private focusT = 0;
  private momentT = 0;
  private moment: CorgiMoment = 'happy';
  private worried = false;
  private blinkT = 0;
  private nextBlink: number;
  /** A second blink queued just after this one. */
  private again = false;
  private shown: CorgiFaceId | null = null;
  /** Seconds the shown face has been up. */
  private shownT = HOLD;

  constructor(private readonly rand: () => number = Math.random) {
    this.nextBlink = this.gap();
  }

  hurt(): void {
    this.hurtT = HURT_FACE;
  }

  /** A shot: the focused face, held while shots keep coming. */
  fire(): void {
    this.focusT = FOCUS;
  }

  /** A moment worth a face; a proud one is not cut short by a happy one. */
  cheer(moment: CorgiMoment): void {
    if (this.momentT > 0 && this.moment === 'proud' && moment === 'happy') return;
    this.moment = moment;
    this.momentT = MOMENT_FACE[moment];
  }

  /** The hero's share of health (0..1). */
  health(share: number): void {
    this.worried = share < WORRIED[this.worried ? 1 : 0];
  }

  /** Advances the clocks; the face to show, or null for the rest face. */
  step(dt: number): CorgiFaceId | null {
    this.hurtT = Math.max(0, this.hurtT - dt);
    this.focusT = Math.max(0, this.focusT - dt);
    this.momentT = Math.max(0, this.momentT - dt);
    this.blinkT = Math.max(0, this.blinkT - dt);
    this.shownT += dt;
    this.nextBlink -= dt;
    if (this.nextBlink <= 0) {
      this.blinkT = BLINK;
      this.again = !this.again && this.rand() < DOUBLE;
      this.nextBlink = this.again ? BLINK * 2.5 : this.gap();
    }
    const want = this.wanted();
    const quick = want === 'head_hurt' || want === 'head_blink' || this.shown === 'head_blink';
    if (want !== this.shown && (quick || this.shownT >= HOLD)) {
      this.shown = want;
      this.shownT = 0;
    }
    return this.shown;
  }

  private wanted(): CorgiFaceId | null {
    if (this.hurtT > 0) return 'head_hurt';
    if (this.momentT > 0) return this.moment === 'proud' ? 'head_proud' : 'head_happy';
    if (this.worried) return 'head_worried';
    // a blink closes the eyes of the calm faces only
    if (this.blinkT > 0) return 'head_blink';
    return this.focusT > 0 ? 'head_focus' : null;
  }

  private gap(): number {
    return BLINK_GAP[0] + this.rand() * (BLINK_GAP[1] - BLINK_GAP[0]);
  }
}
