import { Graphics, type Container } from 'pixi.js';
import { FP, type HurtSource, type SimState } from '@hk/engine';
import type { BossStage } from './bossStage';
import { nearestElite, type EliteCrowd } from './eliteView';
import type { HordeView } from './hordeView';
import type { Vec } from './camera';
import { IDLE_SHOT, KillCam, focusPoint, mixColor, mulColor, type KillCamShot } from './killCam';
import { SHADOW_Z } from './shadow';
import type { Shake } from './shake';

// Draws the kill cam (killCam.ts): remembers the last blow on the hero; when he goes down it
// slows the view, eases the camera in toward the blow, and marks what struck: the mob, elite or
// boss that did gets a pulsing red tint and a red ring at its feet, a blow from a point (a zone,
// a slam, a bullet, an emerger) a red ring there. One small Graphics and a tint: no filters.

const RED = 0xff3030;
/** The struck foe's tint at the top of the pulse. */
const FOE_TINT = 0xff5a5a;
/** World units within which a foe counts as the one at the blow's point. */
const NEAR = 60;
/** The ring's radius around each kind of source, world units (flattened to the ground). */
const RING = { mob: 55, elite: 85, boss: 140, point: 75 };
const ASPECT = 0.45;

export interface KillCamTargets {
  horde: HordeView;
  elites: EliteCrowd | null;
  boss: BossStage | null;
}

/** Something drawn that a tint can be multiplied onto. */
interface Tinted {
  tint: number;
}

export class KillCamView {
  private readonly cam = new KillCam();
  private readonly ring = new Graphics();
  private shot: KillCamShot = IDLE_SHOT;
  /** The last blow on the hero: its source and where it stood, world units. */
  private blow: { src: HurtSource; x: number; y: number } | null = null;
  private readonly focus = { x: 0, y: 0 };
  /** Where the ring goes, and its size. */
  private readonly mark = { x: 0, y: 0, r: RING.point };
  private foe: Tinted | null = null;
  private foeTint = 0xffffff;

  constructor(world: Container, private readonly targets: KillCamTargets, private readonly shake: Shake) {
    this.ring.visible = false;
    world.addChild(this.ring);
  }

  /** Whether the cam is still playing (the death panel waits for it). */
  get busy(): boolean {
    return this.cam.busy;
  }

  /** A blow on the local hero from `src` at (x, y) (FP); the last one before he goes down is the killer. */
  struck(src: HurtSource, x: number, y: number): void {
    this.blow = { src, x: x / FP, y: y / FP };
  }

  /** The local hero went down: start the cam on the last blow. */
  down(s: SimState): void {
    const p = s.players[0];
    const hx = p.x / FP;
    const hy = p.y / FP;
    const b = this.blow ?? { src: 'mob' as const, x: hx, y: hy };
    this.restore();
    this.mark.x = b.x;
    this.mark.y = b.y;
    this.mark.r = RING.point;
    this.foe = this.find(s, b.src, b.x * FP, b.y * FP);
    if (this.foe) this.foeTint = this.foe.tint;
    const f = focusPoint(hx, hy, this.mark.x, this.mark.y);
    this.focus.x = f.x;
    this.focus.y = f.y;
    // a point blow's ring stands over the crowd so it shows; a foe's sits at its feet
    this.ring.zIndex = this.foe ? SHADOW_Z + 0.75 : 1e7 - 1;
    this.cam.start();
    this.shake.blow();
  }

  /** Advances the cam by `real` seconds; the view time for this frame (0 when the cam is idle). */
  step(real: number): number {
    this.shot = this.cam.step(real);
    if (this.shot.phase !== 'idle') return real * this.shot.scale;
    this.restore();
    return 0;
  }

  /**
   * The camera this frame: the usual point `cam`, eased toward the focus, and the zoom. Called
   * after the figures are drawn, so the highlight goes on over their own tints.
   */
  frame(cam: Vec): { x: number; y: number; zoom: number } {
    const m = this.shot.mix;
    if (this.shot.phase !== 'idle') this.paint();
    return { x: cam.x + (this.focus.x - cam.x) * m, y: cam.y + (this.focus.y - cam.y) * m, zoom: this.shot.zoom };
  }

  private paint(): void {
    const k = this.shot.mix * (0.4 + 0.6 * this.shot.pulse);
    if (this.foe) this.foe.tint = mulColor(this.foeTint, mixColor(0xffffff, FOE_TINT, k));
    const { x, y, r } = this.mark;
    const rr = r * (1 + 0.15 * this.shot.pulse);
    this.ring.visible = true;
    this.ring.clear()
      .ellipse(x, y, rr, rr * ASPECT).stroke({ color: RED, width: 9, alpha: 0.9 * this.shot.mix })
      .ellipse(x, y, rr * 0.55, rr * 0.55 * ASPECT).fill({ color: RED, alpha: 0.25 * k });
  }

  /** Back to normal at once (a revive): no cam, no highlight, no remembered blow. */
  reset(): void {
    this.cam.stop();
    this.shot = IDLE_SHOT;
    this.blow = null;
    this.restore();
  }

  private restore(): void {
    if (this.foe) this.foe.tint = this.foeTint;
    this.foe = null;
    this.ring.visible = false;
  }

  /** The view of the foe standing at (x, y) (FP) that dealt a blow of `src`, if one does; moves the ring onto it. */
  private find(s: SimState, src: HurtSource, x: number, y: number): Tinted | null {
    const near = NEAR * FP;
    if (src === 'mob' || src === 'crowd') {
      let best = -1;
      let bestD = near;
      s.mobs.forEach((m, i) => {
        const d = Math.hypot(m.x - x, m.y - y);
        if (d <= bestD) {
          bestD = d;
          best = i;
        }
      });
      const v = best >= 0 ? this.targets.horde.at(best) : undefined;
      if (!v) return null;
      return this.onto(s.mobs[best].x, s.mobs[best].y, RING.mob, v.sprite);
    }
    if (src === 'elite' || src === 'charge') {
      const e = nearestElite(s.elites, x, y);
      const v = e && Math.hypot(e.x - x, e.y - y) <= near ? this.targets.elites?.byId(e.id) : null;
      return e && v ? this.onto(e.x, e.y, RING.elite, v.mob.sprite) : null;
    }
    if (src === 'boss' && s.boss) {
      const v = this.targets.boss?.viewOf(s.boss);
      return v ? this.onto(s.boss.x, s.boss.y, RING.boss, v) : null;
    }
    return null;
  }

  private onto(x: number, y: number, r: number, foe: Tinted): Tinted {
    this.mark.x = x / FP;
    this.mark.y = y / FP;
    this.mark.r = r;
    return foe;
  }
}
