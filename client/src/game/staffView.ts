import { Container, Graphics, Sprite, type Texture } from 'pixi.js';
import { swingAngle, swingArc, type SwingArc } from './swing';

// The staff relic's swing (engine systems/staff.ts): on a sweep the staff appears in the
// hero's hand and turns through its arc, a half circle toward the target (all the way round
// for the Ruyi Staff), leaving a gold crescent over the ground that fades. advance() gives the
// staff's angle, which the hero's front arm follows (hero.ts), and draw() puts the staff in
// that hand. One swing at a time: a new sweep restarts it.

const TRAIL = 0xffd860;
/** The staff is held this far up the sprite (from the top), near its bottom end. */
const GRIP = 0.88;
/** Height of the trail's centre above the hero's feet. */
const TRAIL_Y = 18;
/** The staff's length as a share of the sweep's reach (the hand is already out from his body). */
const LENGTH = 0.82;
const TRAIL_ALPHA = 0.45;

export class StaffSwing {
  private readonly staff: Sprite;
  private readonly trail = new Graphics();
  private arc: SwingArc | null = null;
  private t = 0;

  constructor(world: Container, tex: Texture, private readonly trailZ: number) {
    this.staff = new Sprite(tex);
    this.staff.anchor.set(0.5, GRIP);
    this.staff.visible = false;
    this.trail.visible = false;
    this.trail.zIndex = trailZ;
    world.addChild(this.trail, this.staff);
  }

  /** A sweep landed: `brad` the aim (65536 per turn), `reach` in world units. */
  swing(brad: number, reach: number, full: boolean, facing: number): void {
    this.arc = swingArc(brad, reach, full, facing);
    this.t = 0;
    this.staff.scale.set((reach * LENGTH) / this.staff.texture.height);
  }

  /** Advances the swing; the staff's screen angle while it is out, else null. */
  advance(dt: number): number | null {
    const a = this.arc;
    if (!a) return null;
    this.t += dt;
    if (this.t >= a.swing + a.fade) {
      this.arc = null;
      this.staff.visible = this.trail.visible = false;
      return null;
    }
    return this.t < a.swing ? swingAngle(a, this.t / a.swing) : null;
  }

  /** Draws the staff from the hero's hand (`handX`, `handY`) and the trail round his feet. */
  draw(hx: number, hy: number, handX: number, handY: number, heroZ: number): void {
    const a = this.arc;
    if (!a) return;
    const k = Math.min(1, this.t / a.swing);
    const fade = Math.max(0, 1 - (this.t - a.swing) / a.fade);
    const angle = swingAngle(a, k);
    this.staff.visible = k < 1;
    this.staff.position.set(handX, handY);
    // the sprite points up: rotate its up axis onto the angle
    this.staff.rotation = angle + Math.PI / 2;
    this.staff.zIndex = heroZ + 0.5;

    // the crescent from where the swing began to where the staff is now
    const r = a.reach * 0.72;
    const from = Math.min(a.from, angle);
    const to = Math.max(a.from, angle);
    this.trail.visible = true;
    this.trail.zIndex = this.trailZ;
    this.trail.clear().arc(hx, hy - TRAIL_Y, r, from, to).stroke({ color: TRAIL, width: a.reach * 0.4, alpha: TRAIL_ALPHA * fade, cap: 'butt' });
  }
}
