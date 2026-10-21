import { Container, Graphics } from 'pixi.js';
import { FP, type HurtSource, type SimState } from '@hk/engine';
import type { BossStage } from './bossStage';
import { nearestElite, type EliteCrowd } from './eliteView';
import type { HordeView } from './hordeView';
import type { Vec } from './camera';
import { IDLE_SHOT, KillCam, focusPoint, mixColor, mulColor, type KillCamShot } from './killCam';
import { SHADOW_Z } from './shadow';
import type { Shake } from './shake';
import { t } from '../i18n';
import { deathCause } from '../ui/deathInfo';
import { COLORS, label } from '../ui/widgets';

// Draws the kill cam (killCam.ts): remembers the last blow on the hero; when he goes down it
// freezes the view with a white flash, then slows it, eases the camera in toward the blow, darkens
// everything but the hero and the blow, closes black bars in at the top and bottom, tips the hero
// over, and marks what struck: the mob, elite or boss that did gets a pulsing red tint and a red
// ring at its feet, a blow from a point (a zone, a slam, a bullet, an emerger) a red ring there,
// and a tag over it names the cause as the results will. A few Graphics and a tint: no filters.

const RED = 0xff3030;
/** The struck foe's tint at the top of the pulse. */
const FOE_TINT = 0xff5a5a;
/** World units within which a foe counts as the one at the blow's point. */
const NEAR = 60;
/** The ring's radius around each kind of source, world units (flattened to the ground). */
const RING = { mob: 55, elite: 85, boss: 140, point: 75 };
const ASPECT = 0.45;
/** The cause tag's height, world units. */
const TAG_H = 84;
/** How dark the field outside the spotlight gets, and the black bars' height (share of the view). */
const VEIL = 0.55;
const BARS = 0.09;
/** World units the dark and the bars reach past the view (the shake moves it about). */
const BLEED = 300;
/** How far the hero tips over (radians) and hops as he does (world units). */
const TIP = 1.35;
const HOP = 40;

export interface KillCamTargets {
  hero: Container;
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
  /** The dark around the spotlight; the bars and the flash over everything; the cause tag. */
  private readonly veil = new Graphics();
  private readonly bars = new Graphics();
  private readonly tag = new Container();
  /** The hero's position when he fell and the way he tips (+1 right, -1 left, 0 standing). */
  private readonly hero = { x: 0, y: 0, dir: 0 };
  private presses = -1;
  private shot: KillCamShot = IDLE_SHOT;
  /** The last blow on the hero: its source and where it stood, world units. */
  private blow: { src: HurtSource; x: number; y: number } | null = null;
  private readonly focus = { x: 0, y: 0 };
  /** Where the ring goes, and its size. */
  private readonly mark = { x: 0, y: 0, r: RING.point };
  private foe: Tinted | null = null;
  private foeTint = 0xffffff;

  constructor(world: Container, private readonly targets: KillCamTargets, private readonly shake: Shake) {
    this.veil.zIndex = 1e7 - 2;
    // over the hit effects (fxView), the damage numbers and the bars, so nothing round covers it
    this.tag.zIndex = 1e7 + 2;
    this.bars.zIndex = 1e7 + 1;
    for (const g of [this.ring, this.veil, this.tag, this.bars]) {
      g.visible = false;
      g.eventMode = 'none';
      world.addChild(g);
    }
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
    // he tips away from the blow (to the right when it came straight down on him)
    this.hero.x = hx;
    this.hero.y = hy;
    this.hero.dir = this.mark.x > hx ? -1 : 1;
    this.tag.removeChildren().forEach((c) => c.destroy());
    const words = label(t(`run.fall.${deathCause(b.src, p.level, s.wave)}.cause`, { wave: s.wave }), 48, COLORS.text, {
      stroke: { color: COLORS.outline, width: 8 },
    });
    words.anchor.set(0.5);
    const w = words.width + 48;
    this.tag.addChild(
      new Graphics().roundRect(-w / 2, -TAG_H / 2, w, TAG_H, TAG_H / 2).fill({ color: 0x1a1020, alpha: 0.85 }).stroke({ color: RED, width: 6 }),
      words,
    );
    this.cam.start();
    this.shake.blow();
  }

  /**
   * Advances the cam by `real` seconds; the view time for this frame (0 when the cam is idle).
   * `presses` counts the fingers put down so far: a new one skips the rest, after the first second.
   */
  step(real: number, presses = 0): number {
    if (presses !== this.presses) {
      if (this.presses >= 0) this.cam.skip();
      this.presses = presses;
    }
    this.shot = this.cam.step(real);
    if (this.shot.phase !== 'idle') return real * this.shot.scale;
    this.restore();
    return 0;
  }

  /**
   * The camera this frame: the usual point `cam`, eased toward the focus, and the zoom. Called
   * after the figures are drawn, so the highlight goes on over their own tints.
   */
  frame(cam: Vec, viewW: number, viewH: number): { x: number; y: number; zoom: number } {
    const m = this.shot.mix;
    const out = { x: cam.x + (this.focus.x - cam.x) * m, y: cam.y + (this.focus.y - cam.y) * m, zoom: this.shot.zoom };
    if (this.hero.dir) this.tip(this.shot.phase === 'idle' ? 1 : this.shot.fall);
    if (this.shot.phase !== 'idle') {
      this.paint();
      this.dim(out.x, out.y, viewW / 2 / out.zoom, viewH / 2 / out.zoom);
    }
    return out;
  }

  /** The hero tipped over `f` of the way, with a little hop in the middle of it. */
  private tip(f: number): void {
    const v = this.targets.hero;
    v.rotation = this.hero.dir * TIP * f;
    v.y -= HOP * Math.sin(Math.PI * f);
  }

  /** The dark with the spotlight cut out, the bars and the flash, around the camera at (cx, cy). */
  private dim(cx: number, cy: number, hw: number, hh: number): void {
    const { mix, flash } = this.shot;
    const { x, y } = this.hero;
    // one soft-edged oval takes in the hero and the blow, raised a little to hold the figures
    const rx = Math.max(230, Math.abs(this.mark.x - x) / 2 + 170);
    const ry = Math.max(210, Math.abs(this.mark.y - y) / 2 + 190);
    const ox = (this.mark.x + x) / 2;
    const oy = (this.mark.y + y) / 2 - 50;
    const l = cx - hw - BLEED;
    const top = cy - hh - BLEED;
    const w = 2 * (hw + BLEED);
    const h = 2 * (hh + BLEED);
    this.veil.visible = mix > 0;
    this.veil.clear().rect(l, top, w, h).fill({ color: 0x000000, alpha: VEIL * mix }).ellipse(ox, oy, rx, ry).cut();
    this.veil.ellipse(ox, oy, rx, ry).stroke({ color: 0x000000, width: 60, alpha: 0.5 * VEIL * mix });
    const bar = BARS * 2 * hh * mix + BLEED;
    this.bars.visible = mix > 0 || flash > 0;
    this.bars.clear();
    if (mix > 0) this.bars.rect(l, top, w, bar).rect(l, top + h - bar, w, bar).fill(0x000000);
    if (flash > 0) this.bars.rect(l, top, w, h).fill({ color: 0xffffff, alpha: 0.75 * flash });
    this.tag.visible = mix > 0;
    this.tag.alpha = mix;
    // over the struck point, and never lower than just above the spotlight, so the rings and
    // effects around the figures inside it stay clear of the words
    const over = this.mark.y - this.mark.r * ASPECT - (this.foe ? 190 : 110);
    this.tag.position.set(this.mark.x, Math.min(over, oy - ry - TAG_H / 2 - 10));
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
    this.hero.dir = 0;
    this.targets.hero.rotation = 0;
  }

  private restore(): void {
    if (this.foe) this.foe.tint = this.foeTint;
    this.foe = null;
    this.ring.visible = false;
    this.veil.visible = false;
    this.bars.visible = false;
    this.tag.visible = false;
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
