import { Graphics, type Container, type Renderer, type Sprite } from 'pixi.js';
import { DASH_TICKS, ELITE, FP, type Elite } from '@hk/engine';
import { lerpX, lerpY } from './fixedStep';
import { MobView, type MobLook } from './mobView';
import { makeRing } from './stageArt';

// The elite, the big jiangshi that charges (engine systems/elite.ts): a large tinted jiangshi
// over a ring that marks it in the crowd. While it aims it crouches and trembles and its lane
// is marked on the ground in the enemy-attack violet, filling in as the dash nears; during
// the dash it hops at a run and the lane ahead of it fades out; resting, it barely moves.

const VIOLET = 0xb04cff;
const OUTLINE = 0x140c18;
/** Closer to the hero than this (world units), it has stopped walking. */
const STOP = ELITE.stopDist / FP;

export class EliteView {
  readonly mob: MobView;
  private readonly lane = new Graphics();
  private time = 0;

  /** `onTop` draws it and its ring over the horde, just under `topZ` (the hero). */
  constructor(world: Container, look: MobLook, private readonly ring: Sprite, tint: number, onTop: boolean, topZ: number) {
    this.mob = new MobView(look, world);
    this.mob.tint(tint);
    if (onTop) {
      world.addChild(ring);
      this.mob.pinZ(topZ - 1);
      ring.zIndex = topZ - 2;
    }
    // over the horde, under the elite itself
    this.lane.zIndex = topZ - 3;
    world.addChild(this.lane);
  }

  static ring(renderer: Renderer, color: number, outline: boolean): Sprite {
    return makeRing(renderer, color, 1.8, outline);
  }

  draw(e: Elite | null, alpha: number, dt: number, hx: number, hy: number): void {
    this.mob.setVisible(!!e);
    this.ring.visible = !!e;
    this.lane.visible = !!e && (e.phase === 'aim' || e.phase === 'dash');
    if (!e) return;
    this.time += dt;
    let x = lerpX(e, alpha);
    const y = lerpY(e, alpha);
    let speed = Math.hypot(x - hx, y - hy) > STOP + 5 ? 1 : 0.35;
    if (e.stun > 0) speed = 0;
    else if (e.phase === 'aim') {
      speed = 0;
      x += Math.sin(this.time * 70) * 4;
    } else if (e.phase === 'dash') speed = 2.6;
    else if (e.phase === 'rest') speed = 0.25;
    // it faces along its charge, else at the hero
    const face = e.phase === 'aim' || e.phase === 'dash' ? e.vx : hx - x;
    this.mob.update(dt, x, y, face, speed);
    this.ring.position.set(x, y);
    if (this.lane.visible) this.drawLane(e, alpha);
  }

  private drawLane(e: Elite, alpha: number): void {
    const g = this.lane.clear();
    const len = ELITE.dashLength / FP;
    const half = ELITE.laneHalf / FP;
    // the lane starts where it aimed from: during the dash that is behind the elite
    const gone = e.phase === 'dash' ? Math.min(len, ((e.t + alpha) * ELITE.dashSpeed) / FP) : 0;
    const k = e.phase === 'aim' ? Math.min(1, (e.t + alpha) / ELITE.aim) : 1 - (e.t + alpha) / DASH_TICKS;
    const a = Math.atan2(e.vy, e.vx);
    const ox = lerpX(e, alpha) - Math.cos(a) * gone;
    const oy = lerpY(e, alpha) - Math.sin(a) * gone;
    g.position.set(ox, oy);
    g.rotation = a;
    const from = gone;
    const fill = Math.max(0, k);
    g.rect(from, -half, len - from, half * 2).fill({ color: VIOLET, alpha: 0.06 + 0.1 * fill });
    // the part already filled in grows from the elite to the end while it aims
    if (e.phase === 'aim') g.rect(0, -half * 0.3, len * fill, half * 0.6).fill({ color: VIOLET, alpha: 0.22 });
    for (const side of [-half, half]) {
      g.moveTo(from, side).lineTo(len, side).stroke({ color: OUTLINE, width: 9, alpha: 0.5 * Math.max(0.3, fill) });
      g.moveTo(from, side).lineTo(len, side).stroke({ color: VIOLET, width: 5, alpha: Math.max(0.3, fill) });
    }
    // an arrow head at the far end
    g.moveTo(len - half, -half).lineTo(len + half * 0.6, 0).lineTo(len - half, half)
      .stroke({ color: VIOLET, width: 6, alpha: Math.max(0.3, fill), join: 'round' });
  }
}
