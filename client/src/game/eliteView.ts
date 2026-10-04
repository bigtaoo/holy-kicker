import { Graphics, type Container, type Renderer, type Sprite } from 'pixi.js';
import { DASH_TICKS, ELITE, FP, TOAD_KING, WOLF_LEADER, type Elite, type EliteKind } from '@hk/engine';
import type { BossBar } from './bossBar';
import type { FxPool } from './fx';
import { lerpX, lerpY } from './fixedStep';
import { MobView, type MobLook } from './mobView';
import { makeRing } from './stageArt';

// The elite, the big jiangshi that charges (engine systems/elite.ts): a large tinted jiangshi
// over a ring that marks it in the crowd. While it aims it crouches and trembles and its lane
// is marked on the ground in the enemy-attack violet, filling in as the dash nears; during
// the dash it hops at a run and the lane ahead of it fades out; resting, it barely moves.
// Chapter 2's toad king (engine systems/marsh.ts) marks no lane: it swells up as it winds up,
// and its bullets and pools are drawn by the threat layer. Chapter 3's wolf leader charges
// down the same lane and, every other time, swells up to howl (the ring is howlFx).

const VIOLET = 0xb04cff;
const OUTLINE = 0x140c18;
/** Closer to the hero than this (world units), it has stopped walking. */
const STOP: Record<EliteKind, number> = { charger: ELITE.stopDist / FP, toadKing: TOAD_KING.stopDist / FP, wolfLeader: ELITE.stopDist / FP };
/** How much the toad king swells at the end of its wind-up, and the wolf leader before it howls. */
const SWELL = 0.18;
const HOWL_SWELL = 0.14;

export class EliteView {
  readonly mob: MobView;
  private readonly lane = new Graphics();
  private time = 0;

  /** `onTop` draws it and its ring over the horde, just under `topZ` (the hero). */
  constructor(
    readonly kind: EliteKind, world: Container, look: MobLook, private readonly ring: Sprite, tint: number, onTop: boolean, topZ: number,
  ) {
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
    const charger = this.kind !== 'toadKing';
    this.lane.visible = !!e && charger && (e.phase === 'aim' || e.phase === 'dash');
    if (!e) return;
    this.time += dt;
    let x = lerpX(e, alpha);
    const y = lerpY(e, alpha);
    let speed = Math.hypot(x - hx, y - hy) > STOP[this.kind] + 5 ? 1 : 0.35;
    this.mob.swell = e.stun > 0 ? 0
      : !charger && e.phase === 'aim' ? SWELL * Math.min(1, (e.t + alpha) / TOAD_KING.windup)
      : e.phase === 'howl' ? HOWL_SWELL * Math.min(1, (e.t + alpha) / WOLF_LEADER.howl)
      : 0;
    if (e.stun > 0 || e.phase === 'howl') speed = 0;
    else if (!charger) {
      if (e.phase !== 'walk') speed = e.phase === 'aim' ? 0 : 0.25;
    } else if (e.phase === 'aim') {
      speed = 0;
      x += Math.sin(this.time * 70) * 4;
    } else if (e.phase === 'dash') speed = 2.6;
    else if (e.phase === 'rest') speed = 0.25;
    // it faces along its charge, else at the hero
    const face = charger && (e.phase === 'aim' || e.phase === 'dash') ? e.vx : hx - x;
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

/**
 * Every elite standing (one, or the mid-boss twins), each drawn by its own EliteView: a view
 * keeps the elite it took by id while that one stands, so a twin falling does not swap the
 * other's look or lane; a free view takes only an elite of its kind. `make(k, kind)` makes the
 * k-th view; the twins share one health bar.
 */
export class EliteCrowd {
  private readonly views: EliteView[] = [];
  private readonly ids: number[] = [];

  constructor(private readonly make: (k: number, kind: EliteKind) => EliteView, readonly bar: BossBar | null) {
    if (bar) bar.view.visible = false;
  }

  /** The view drawing elite `id`, if one is. */
  byId(id: number): EliteView | null {
    const k = this.ids.indexOf(id);
    return k >= 0 ? this.views[k] : null;
  }

  /** `twins` shows the shared bar over the elites' health out of `twinsHp`. */
  draw(elites: readonly Elite[], alpha: number, dt: number, hx: number, hy: number, twins: boolean, twinsHp: number): void {
    for (let k = 0; k < this.ids.length; k++) if (!elites.some((e) => e.id === this.ids[k])) this.ids[k] = -1;
    for (const e of elites) {
      if (this.ids.includes(e.id)) continue;
      let k = this.ids.findIndex((id, j) => id === -1 && this.views[j].kind === e.kind);
      if (k < 0) {
        k = this.views.length;
        this.views.push(this.make(k, e.kind));
        this.ids.push(-1);
      }
      this.ids[k] = e.id;
    }
    for (let k = 0; k < this.views.length; k++) {
      const e = elites.find((x) => x.id === this.ids[k]) ?? null;
      this.views[k].draw(e, alpha, dt, hx, hy);
    }
    if (!this.bar) return;
    this.bar.view.visible = twins && elites.length > 0;
    let hp = 0;
    for (const e of elites) hp += e.hp;
    this.bar.set(hp, twinsHp);
  }
}

/** The elite standing nearest (x, y) (FP), or null. */
export function nearestElite(elites: readonly Elite[], x: number, y: number): Elite | null {
  let best: Elite | null = null;
  let bestD = Infinity;
  for (const e of elites) {
    const d = Math.hypot(e.x - x, e.y - y);
    if (d < bestD) {
      bestD = d;
      best = e;
    }
  }
  return best;
}

/** A wolf leader howled at (x, y), world units: rings in the enemy-attack violet running out to `r`. */
export function howlFx(fx: FxPool, x: number, y: number, r: number): void {
  for (let k = 0; k < 3; k++) {
    fx.emit({
      shape: 'ring', x, y: y - 40, vx: 0, vy: 0, life: 0.4 + k * 0.12, size0: 60, size1: r * 2 * (0.5 + k * 0.25),
      rotation: 0, spin: 0, drag: 1, color: k === 1 ? 0xc8d4ec : VIOLET, alpha: 0.8 - k * 0.2, aspect: 0.6,
    });
  }
}
