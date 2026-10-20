import { Container, Graphics } from 'pixi.js';
import { FP, HERO, TICK_RATE, kickTarget, targetAt, type RelicId, type SimState } from '@hk/engine';
import { lerpX, lerpY } from './fixedStep';
import { CorgiMotion, RUN_SPEED, follow, headTurn, pawAim, runRate } from './corgiMotion';
import { TaoActor, type TaoAsset } from './tao/TaoActor';

// The corgi theme's hero (docs/reskin.md "Animation › Hero"), ported from the prototype
// (src/dev/corgiProto.ts): twin pistols and no mirror flip, carried at the sides until an attack
// raises the one on the aim's side, a slow head, springy ears and tail, a trot that follows the
// ground speed, a light recoil and a hurt flinch. The sim decides when it attacks and gets hurt;
// the view picks what to aim at the way the relic picks its target, and every relic's attack
// but the beads' goes off as a shot of the raised gun.

/** The atlas's pack scale (tools/pack_tao.py ... 0.35); the rig's offsets below are in its units. */
const PACK = 0.35;
/** The muzzles in their gun bones' space: (muzzle - grip) on the gun drawing × 0.24 (split) × PACK. */
const MUZZLE_L = { x: (100 - 790) * 0.24 * PACK, y: (205 - 455) * 0.24 * PACK };
const MUZZLE_R = { x: -MUZZLE_L.x, y: MUZZLE_L.y }; // gun_n is gun mirrored
/** Seconds between picks of what to aim at; the aim eases from one to the next. */
const RETARGET = 0.25;
const AIM_FOLLOW = 12;
/** World units above a target's feet the guns aim at. */
const AIM_LIFT = 35;
/** With nothing in reach the guns point this far out, a little up. */
const IDLE_AIM = { x: 300, y: -60 };
/** The swap's dead zone, as a share of the hero's height. */
const DEAD_ZONE = 0.12;
/** Seconds the muzzle flash shows, and its size in world units. */
const FLASH = 0.06;
const FLASH_SIZE = 12;
/** Share of the body's travel the springs feel: the game moves the hero faster than the prototype, so the ears would flap. */
const TRAVEL = 0.5;
/** Seconds the guns take to drop when the hero goes down, and to come back up. */
const DOWN = 0.3;

interface Paw {
  arm: string;
  gun: string;
  /** The barrel's way in the gun's own space, and the aim's centre. */
  out: number;
  dir: -1 | 1;
  muzzle: { x: number; y: number };
  fire: string;
}

const PAWS: readonly Paw[] = [
  { arm: 'arm_f', gun: 'gun', out: Math.PI, dir: -1, muzzle: MUZZLE_L, fire: 'fire_l' },
  { arm: 'arm_n', gun: 'gun_n', out: 0, dir: 1, muzzle: MUZZLE_R, fire: 'fire_r' },
];

export class CorgiHero {
  /** Whether `rig` is the corgi's (twin guns), not a monk's. */
  static fits(rig: TaoAsset): boolean {
    return rig.skeleton.bones.some((b) => b.id === 'gun_n');
  }

  readonly view = new Container();
  /** What the hero holds out (the monks' wooden fish): behind the body. */
  readonly held = new Container();
  private readonly actor: TaoActor;
  private readonly k: number;
  private readonly motion = new CorgiMotion();
  private readonly flash = new Graphics().star(0, 0, 7, FLASH_SIZE, FLASH_SIZE * 0.4).fill({ color: 0xfff27a }).circle(0, 0, FLASH_SIZE * 0.35).fill({ color: 0xffffff });
  private aimX = -IDLE_AIM.x;
  private aimY = IDLE_AIM.y;
  private target = -1;
  private retarget = 0;
  private staffAngle: number | null = null;
  /** Seconds until a started attack's shot, or -1. */
  private pending = -1;
  private flashT = 0;
  /** 1 with the guns up, 0 while down. */
  private ready = 1;

  constructor(asset: TaoAsset, private readonly height: number) {
    this.actor = new TaoActor(asset);
    this.k = height / this.actor.height;
    this.actor.view.scale.set(this.k);
    this.actor.play('idle');
    // stiff upright ears that give a little on starts and stops and settle without ringing; a
    // looser, heavier tail (the prototype's tuning)
    this.actor.spring('ear_l', { stiffness: 230, damping: 24, gain: 0.5, limit: 7 });
    this.actor.spring('ear_r', { stiffness: 210, damping: 23, gain: 0.5, limit: 7 });
    this.actor.spring('tail', { stiffness: 70, damping: 4.5, gain: 1.6, limit: 38 });
    this.flash.visible = false;
    this.view.addChild(this.held, this.actor.view, this.flash);
  }

  /**
   * An attack starts: the guns come up, aimed at the relic's target, and shoot as the relic goes
   * off (the staff's sweep shoots on swing()). The beads' orbit is no shot, so they stay down.
   */
  attack(relic: RelicId): void {
    if (relic === 'beads') return;
    this.retarget = 0;
    this.motion.alert();
    if (relic !== 'staff') this.pending = HERO.strikeAt / TICK_RATE;
  }

  /** The staff's sweep lands: a shot along it. */
  swing(): void {
    this.shoot();
  }

  /** The staff's screen angle while it is out (the guns follow it), null once it is put away. */
  holdStaff(angle: number | null): void {
    this.staffAngle = angle;
  }

  /** The raised gun's muzzle, in the view's space, as of the last update (the monks' hands). */
  hand(): { x: number; y: number } {
    const paw = PAWS[this.motion.raised];
    const p = this.actor.local(paw.gun, paw.muzzle.x, paw.muzzle.y);
    return { x: p.x * this.k, y: p.y * this.k };
  }

  /** A hit: the body squashes and the head tips, on top of whatever it is doing. */
  hurt(): void {
    this.actor.layer('hurt', { additive: true });
  }

  update(dt: number, facing: number, _moving: boolean, s: SimState, alpha: number): void {
    const p = s.players[0];
    this.track(s, alpha, dt, facing);
    const vx = (p.vx / FP) * TICK_RATE;
    const vy = (p.vy / FP) * TICK_RATE;
    const full = (HERO.speed / FP) * TICK_RATE;
    this.motion.step(dt, this.aimX, DEAD_ZONE * this.height, vx, full);
    this.ready = Math.max(0, Math.min(1, this.ready + (p.dead ? -dt : dt) / DOWN));

    const s1 = TRAVEL / this.k;
    this.actor.move(vx * dt * s1, vy * dt * s1);
    const speed = Math.hypot(vx, vy);
    if (speed > RUN_SPEED && !p.dead) {
      this.actor.play('run');
      this.actor.rate = runRate(speed, full);
    } else {
      this.actor.play('idle');
      this.actor.rate = 1;
    }

    if (this.staffAngle !== null) this.motion.alert(); // the guns follow the staff while it is out
    this.actor.offset('torso', this.motion.lean);

    // each paw aims from its own shoulder, clamped to its side, blended over the clip's carry by
    // how far it is up; a shot climbs the muzzle and shoves the arm back
    let head = 0;
    PAWS.forEach((paw, i) => {
      const w = this.motion.weight(i as 0 | 1) * this.ready;
      const sh = this.actor.point(paw.arm);
      const a = pawAim(paw.out, Math.atan2(this.aimY - sh.y * this.k, this.aimX - sh.x * this.k));
      const kick = this.motion.recoil[i] ** 2;
      this.actor.aim(paw.arm, paw.gun, a.arm + paw.dir * -kick * 0.08, w);
      this.actor.aim(paw.gun, paw.out, a.gun + paw.dir * -kick * 0.2, w);
      this.actor.offset(paw.arm, 0, Math.cos(a.gun) * -kick * 34 * PACK, Math.sin(a.gun) * -kick * 34 * PACK);
      head += w * headTurn(a.dev);
    });
    this.motion.lookAt(head, dt);
    this.actor.offset('head', this.motion.look);
    this.actor.update(dt);

    if (this.pending >= 0) {
      this.pending -= dt;
      if (this.pending < 0) this.shoot();
    }
    this.flashT = Math.max(0, this.flashT - dt);
    this.flash.visible = this.flashT > 0;
  }

  /** Follows what the relic would go for (the boss or an elite in reach first), eased; along the staff while it is out. */
  private track(s: SimState, alpha: number, dt: number, facing: number): void {
    const p = s.players[0];
    let tx: number;
    let ty: number;
    if (this.staffAngle !== null) {
      tx = Math.cos(this.staffAngle) * IDLE_AIM.x;
      ty = Math.sin(this.staffAngle) * IDLE_AIM.x;
    } else {
      this.retarget -= dt;
      if (this.retarget <= 0) {
        this.retarget = RETARGET;
        this.target = kickTarget(s, p, HERO.strikeRange);
      }
      const t = this.target >= 0 ? targetAt(s, this.target) : null;
      if (t) {
        tx = lerpX(t, alpha) - lerpX(p, alpha);
        ty = lerpY(t, alpha) - lerpY(p, alpha) - AIM_LIFT;
      } else {
        tx = facing * IDLE_AIM.x;
        ty = IDLE_AIM.y;
      }
    }
    this.aimX = follow(this.aimX, tx, AIM_FOLLOW, dt);
    this.aimY = follow(this.aimY, ty, AIM_FOLLOW, dt);
  }

  /** The raised gun goes off: recoil, the fire clip on top and a flash at its muzzle. */
  private shoot(): void {
    if (this.ready < 1) return;
    this.motion.alert();
    const paw = PAWS[this.motion.fire()];
    this.actor.layer(paw.fire, { additive: true });
    const m = this.actor.local(paw.gun, paw.muzzle.x, paw.muzzle.y);
    const n = this.actor.local(paw.gun, paw.muzzle.x + 10 * paw.dir, paw.muzzle.y);
    this.flash.position.set(m.x * this.k, m.y * this.k);
    this.flash.rotation = Math.atan2(n.y - m.y, n.x - m.x);
    this.flashT = FLASH;
  }
}
