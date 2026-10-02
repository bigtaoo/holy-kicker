import { Container, Graphics, Sprite, type Texture } from 'pixi.js';
import { swingAngle, swingArc, type SwingArc } from './swing';

// The staff relic's swing (engine systems/staff.ts): on a sweep the staff appears in the
// hero's hand and turns through its arc, a half circle toward the target (all the way round
// for the Ruyi Staff), leaving a gold crescent over the ground that fades. It follows the
// hero while it plays. One swing at a time: a new sweep restarts it.

const TRAIL = 0xffd860;
/** The staff is held this far up the sprite (from the top), near its bottom end. */
const GRIP = 0.88;
/** Pivot height above the hero's feet, around his hands. */
const HAND_Y = 45;
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
    this.staff.scale.set((reach * 0.95) / this.staff.texture.height);
  }

  update(dt: number, hx: number, hy: number, heroZ: number): void {
    const a = this.arc;
    if (!a) return;
    this.t += dt;
    const k = Math.min(1, this.t / a.swing);
    const fade = Math.max(0, 1 - (this.t - a.swing) / a.fade);
    if (fade <= 0) {
      this.arc = null;
      this.staff.visible = this.trail.visible = false;
      return;
    }
    const py = hy - HAND_Y;
    const angle = swingAngle(a, k);
    this.staff.visible = k < 1;
    this.staff.position.set(hx, py);
    // the sprite points up: rotate its up axis onto the angle
    this.staff.rotation = angle + Math.PI / 2;
    this.staff.zIndex = heroZ + 0.5;

    // the crescent from where the swing began to where the staff is now
    const r = a.reach * 0.72;
    const from = Math.min(a.from, angle);
    const to = Math.max(a.from, angle);
    this.trail.visible = true;
    this.trail.zIndex = this.trailZ;
    this.trail.clear().arc(hx, hy - HAND_Y * 0.4, r, from, to).stroke({ color: TRAIL, width: a.reach * 0.4, alpha: TRAIL_ALPHA * fade, cap: 'butt' });
  }
}
