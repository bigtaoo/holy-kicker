// Which head the corgi theme's hero wears (docs/reskin.md "Animation › Hero"): a wince when hit,
// a battle cry as a gun goes off, a blink now and then, else the drawn smile. Pure, so it is
// tested without Pixi; corgiHero.ts swaps the images.

/** The head variants a rig may carry (tools/split_parts.py "faces"); a rig without them keeps one face. */
export type CorgiFaceId = 'head_hurt' | 'head_fire' | 'head_blink';

/** Seconds each face holds. */
export const HURT_FACE = 0.45;
export const FIRE_FACE = 0.35;
export const BLINK = 0.12;
/** Seconds between blinks: at least the first, up to both together. */
const BLINK_GAP = [2.2, 3.5] as const;
/** The share of blinks that come as a double. */
const DOUBLE = 0.2;

export class CorgiFace {
  private hurtT = 0;
  private fireT = 0;
  private blinkT = 0;
  private nextBlink: number;
  /** A second blink queued just after this one. */
  private again = false;

  constructor(private readonly rand: () => number = Math.random) {
    this.nextBlink = this.gap();
  }

  hurt(): void {
    this.hurtT = HURT_FACE;
  }

  fire(): void {
    this.fireT = FIRE_FACE;
  }

  /** Advances the clocks; the face to show, or null for the rest face. */
  step(dt: number): CorgiFaceId | null {
    this.hurtT = Math.max(0, this.hurtT - dt);
    this.fireT = Math.max(0, this.fireT - dt);
    this.blinkT = Math.max(0, this.blinkT - dt);
    this.nextBlink -= dt;
    if (this.nextBlink <= 0) {
      this.blinkT = BLINK;
      this.again = !this.again && this.rand() < DOUBLE;
      this.nextBlink = this.again ? BLINK * 2.5 : this.gap();
    }
    if (this.hurtT > 0) return 'head_hurt';
    if (this.fireT > 0) return 'head_fire';
    return this.blinkT > 0 ? 'head_blink' : null;
  }

  private gap(): number {
    return BLINK_GAP[0] + this.rand() * (BLINK_GAP[1] - BLINK_GAP[0]);
  }
}
