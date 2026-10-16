import { Container, Graphics, Sprite, type Texture } from 'pixi.js';
import { MOUNTAIN_EXIT, PALM_EXIT, palmPose, palmSinks, type PalmExit } from './palmPose';
import { SHADOW_Z } from './shadow';
import { ViewPool } from './viewPool';

// The Rulai Palm falling (timing in palmPose.ts): a golden hand dropping from the sky onto its
// target, over the horde, with a dark shadow growing on the ground under it as a warning. The
// blast itself is the sim's 'meteor' cast when it lands (spellView.ts). The evolved Mountain
// Palm drops a stone hand instead, Buddha's hand become the Five Finger Mountain: it slams onto
// its print, stands a moment, a little see-through, then sinks into the ground in a puff of dust
// and leaves the print to pin the mobs under it.

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
  /** Blast radius, world units. */
  r: number;
  exit: PalmExit;
  mountain: boolean;
  /** The stone hand has started to sink (its dust puffed). */
  sunk: boolean;
  x: number;
  y: number;
  t: number;
  fall: number;
}

export class PalmFalls {
  private readonly palms: Falling[] = [];
  private readonly hands = new ViewPool(() => new Sprite(), (s) => this.layer.addChild(s));
  private readonly shadows = new ViewPool(() => new Graphics(), (g) => this.layer.addChild(g));

  constructor(
    private readonly layer: Container,
    private readonly tex: Texture,
    private readonly mountainTex: Texture,
    private readonly overZ: number,
    /** The stone hand starts sinking into its print at (x, y), blast radius r. */
    private readonly onSink: (x: number, y: number, r: number) => void = () => {},
  ) {}

  /**
   * A palm cast at (x, y) with blast radius r, world units, landing after `fall` seconds; a
   * Mountain Palm leaves a print that pins for `print` seconds (0 for the plain palm).
   */
  drop(x: number, y: number, r: number, fall: number, print = 0): void {
    const mountain = print > 0;
    const hand = this.hands.take();
    hand.texture = mountain ? this.mountainTex : this.tex;
    hand.anchor.set(0.5, mountain ? MOUNTAIN_Y : PALM_Y);
    hand.zIndex = this.overZ;
    const shadow = this.shadows.take().clear().ellipse(0, 0, r, r * 0.45).fill({ color: 0x1a1020, alpha: 1 });
    shadow.position.set(x, y);
    shadow.zIndex = SHADOW_Z + 2;
    const tall = r * (mountain ? MOUNTAIN : HAND);
    this.palms.push({ hand, shadow, tall, r, exit: mountain ? MOUNTAIN_EXIT : PALM_EXIT, mountain, sunk: false, x, y, t: 0, fall });
    this.pose(this.palms[this.palms.length - 1]);
  }

  update(dt: number): void {
    for (let i = this.palms.length - 1; i >= 0; i--) {
      const p = this.palms[i];
      p.t += dt;
      if (p.mountain && !p.sunk && p.t >= p.fall + palmSinks(p.exit)) {
        p.sunk = true;
        this.onSink(p.x, p.y, p.r);
      }
      if (this.pose(p)) continue;
      this.hands.give(p.hand);
      this.shadows.give(p.shadow);
      this.palms.splice(i, 1);
    }
  }

  /** Places p for its time; false once it is gone. */
  private pose(p: Falling): boolean {
    const o = palmPose(p.t, p.fall, p.exit);
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
