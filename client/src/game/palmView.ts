import { Container, Graphics, Sprite, type Texture } from 'pixi.js';
import { palmHold, palmPose } from './palmPose';
import { SHADOW_Z } from './shadow';

// The Rulai Palm falling (timing in palmPose.ts): a golden hand dropping from the sky onto its
// target, over the horde, with a dark shadow growing on the ground under it as a warning. The
// blast itself is the sim's 'meteor' cast when it lands (spellView.ts). The evolved Mountain
// Palm drops a stone hand instead, Buddha's hand become the Five Finger Mountain: it stands on
// its print, a little see-through so the crowd behind it stays readable, for as long as the
// print pins the mobs under it, then sinks away.

/** The hand is this many blast radii tall. */
const HAND = 2;
/** The hand's point that lands on the target, from its top: the middle of the palm. */
const PALM_Y = 0.62;
/** The stone hand is a little smaller and stands on the front edge of its print. */
const MOUNTAIN = 1.8;
const MOUNTAIN_Y = 0.8;
/** How opaque the stone hand stands once it has landed. */
const MOUNTAIN_ALPHA = 0.85;

interface Falling {
  hand: Sprite;
  shadow: Graphics;
  /** Height in world units. */
  tall: number;
  hold: number;
  mountain: boolean;
  x: number;
  y: number;
  t: number;
  fall: number;
}

export class PalmFalls {
  private readonly palms: Falling[] = [];

  constructor(
    private readonly layer: Container,
    private readonly tex: Texture,
    private readonly mountainTex: Texture,
    private readonly overZ: number,
  ) {}

  /**
   * A palm cast at (x, y) with blast radius r, world units, landing after `fall` seconds; a
   * Mountain Palm leaves a print that pins for `print` seconds (0 for the plain palm).
   */
  drop(x: number, y: number, r: number, fall: number, print = 0): void {
    const mountain = print > 0;
    const hand = new Sprite({
      texture: mountain ? this.mountainTex : this.tex, anchor: { x: 0.5, y: mountain ? MOUNTAIN_Y : PALM_Y },
    });
    hand.zIndex = this.overZ;
    const shadow = new Graphics().ellipse(0, 0, r, r * 0.45).fill({ color: 0x1a1020, alpha: 1 });
    shadow.position.set(x, y);
    shadow.zIndex = SHADOW_Z + 2;
    this.layer.addChild(shadow, hand);
    const tall = r * (mountain ? MOUNTAIN : HAND);
    this.palms.push({ hand, shadow, tall, hold: palmHold(print), mountain, x, y, t: 0, fall });
    this.pose(this.palms[this.palms.length - 1]);
  }

  update(dt: number): void {
    for (let i = this.palms.length - 1; i >= 0; i--) {
      const p = this.palms[i];
      p.t += dt;
      if (this.pose(p)) continue;
      p.hand.destroy();
      p.shadow.destroy();
      this.palms.splice(i, 1);
    }
  }

  /** Places p for its time; false once it is gone. */
  private pose(p: Falling): boolean {
    const o = palmPose(p.t, p.fall, p.hold);
    if (o.done) return false;
    const size = p.tall / p.hand.texture.height;
    p.hand.scale.set(size * o.scaleX, size * o.scaleY);
    p.hand.position.set(p.x, p.y - o.lift);
    p.hand.alpha = o.alpha * (p.mountain && p.t >= p.fall ? MOUNTAIN_ALPHA : 1);
    p.shadow.scale.set(o.shadow);
    p.shadow.alpha = o.shadowAlpha;
    return true;
  }
}
