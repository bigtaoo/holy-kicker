import { Application, Assets, Container, Graphics, type Texture } from 'pixi.js';
import { sliceAtlas, TaoActor } from '../game/tao/TaoActor';
import type { TaoSkeleton } from '../game/tao/types';
import skeletonUrl from '../../../art/reskin/corgi/runtime/skeleton.json?url';
import atlasUrl from '../../../art/reskin/corgi/runtime/atlas.png?url';

// Dev-only page (client/proto.html): the reskin's corgi rig with layered run and fire, two
// aimed guns, recoil, lean and spring ears and tail. Not part of any build.

const HEIGHT = 340; // on-screen px from feet to ear tips
// G zooms out to the game's size: 120 units at the desktop's 1.3x zoom on a ~860 px window is
// about 70 px (a phone shows less in CSS px, but at 2-3 device px each)
const GAME_ZOOM = 70 / HEIGHT;
const PACK = 0.7; // corgi_tao.json's scale: the atlas holds the close-up at up to ~1.5 device px per px
const SPEED = 420; // px/s
const ACCEL = 2600; // px/s², so starts and stops have a ramp the springs can feel
const RUN_RATE_SPEED = 380; // speed at which the run clip plays at rate 1
const FIRE_GAP = 0.16;
const SWAP = 0.16; // seconds to lower one gun and raise the other
const SWAP_DEAD_ZONE = 40; // px the aim must cross past the body before the other gun takes over
/** The muzzles in their gun bones' space: (muzzle - grip) on the gun drawing × 0.24 (split) × the pack scale. */
const MUZZLE_L = { x: (100 - 790) * 0.24 * PACK, y: (205 - 455) * 0.24 * PACK };
const MUZZLE_R = { x: -MUZZLE_L.x, y: MUZZLE_L.y }; // gun_n is gun mirrored
// either side of straight out: past vertical, so each paw reaches straight up and down
const MAX_AIM = (100 * Math.PI) / 180;
// the arm stops short of that and the wrist turns the rest, so a gun aimed up stays beside the
// head instead of in front of the face
const MAX_ARM = (55 * Math.PI) / 180;

interface Shot {
  g: Graphics;
  vx: number;
  vy: number;
  life: number;
}

function wrapAngle(a: number): number {
  return Math.atan2(Math.sin(a), Math.cos(a));
}

function approach(v: number, target: number, step: number): number {
  return v < target ? Math.min(target, v + step) : Math.max(target, v - step);
}

/** One paw and its gun: the far paw shoots left, the near paw right. */
interface Hand {
  arm: string;
  gun: string;
  out: number; // the barrel's way in the gun's own space, and the aim's centre
  dir: number; // -1 left, 1 right
  muzzle: { x: number; y: number };
  fire: string;
  recoil: number;
}

class Corgi {
  readonly view = new Container();
  private readonly shadow = new Graphics().ellipse(0, 0, 95, 24).fill({ color: 0x1d3440, alpha: 0.22 });
  readonly actor: TaoActor;
  private readonly k: number;
  private readonly hands: Hand[] = [
    { arm: 'arm_f', gun: 'gun', out: Math.PI, dir: -1, muzzle: MUZZLE_L, fire: 'fire_l', recoil: 0 },
    { arm: 'arm_n', gun: 'gun_n', out: 0, dir: 1, muzzle: MUZZLE_R, fire: 'fire_r', recoil: 0 },
  ];
  x = 0;
  y = 0;
  vx = 0;
  vy = 0;
  side = -1; // the aim's side: -1 left, 1 right
  private swap = 0; // 0 the left gun is up, 1 the right one
  private lean = 0;
  private look = 0; // the head's smoothed turn toward the aim
  private cooldown = 0;

  constructor(asset: ReturnType<typeof sliceAtlas>) {
    this.actor = new TaoActor(asset);
    this.k = HEIGHT / this.actor.height;
    this.actor.view.scale.set(this.k);
    this.actor.play('idle');
    // stiff upright ears that give a little on starts and stops and settle without ringing
    // (critical damping is 2·sqrt(stiffness) ≈ 30); a looser, heavier tail
    this.actor.spring('ear_l', { stiffness: 230, damping: 24, gain: 0.5, limit: 7 });
    this.actor.spring('ear_r', { stiffness: 210, damping: 23, gain: 0.5, limit: 7 });
    this.actor.spring('tail', { stiffness: 70, damping: 4.5, gain: 1.6, limit: 38 });
    this.view.addChild(this.shadow, this.actor.view);
  }

  /** Moves toward the input direction (unit or zero) and aims at (ax, ay), in its parent's space. */
  update(dt: number, mx: number, my: number, ax: number, ay: number, firing: boolean, fire: (x: number, y: number, a: number) => void): void {
    this.vx = approach(this.vx, mx * SPEED, ACCEL * dt);
    this.vy = approach(this.vy, my * SPEED, ACCEL * dt);
    this.x += this.vx * dt;
    this.y += this.vy * dt;
    this.view.position.set(this.x, this.y);
    this.view.zIndex = this.y;

    // the body never mirrors (a horde keeps the aim swapping sides); the gun on the aim's side
    // comes up and the other drops, with a dead zone so a cursor near the body does not flicker
    if ((ax - this.x) * this.side < -SWAP_DEAD_ZONE) this.side = -this.side;
    this.swap = approach(this.swap, this.side > 0 ? 1 : 0, dt / SWAP);
    const up = this.swap * this.swap * (3 - 2 * this.swap);

    const s = 1 / this.k;
    this.actor.move(this.vx * dt * s, this.vy * dt * s);
    const speed = Math.hypot(this.vx, this.vy);
    if (speed > 40) {
      this.actor.play('run');
      // the cycle follows the ground speed so feet do not slide; the clip runs left (the art's
      // way), so it plays backwards going right
      this.actor.rate = (this.vx > 40 ? -1 : 1) * Math.max(0.6, speed / RUN_RATE_SPEED);
    } else {
      this.actor.play('idle');
      this.actor.rate = 1;
    }

    // lean into the run (a clockwise turn tips the top right) and away from stops
    this.lean += ((this.vx / SPEED) * 3 - this.lean) * Math.min(1, dt * 10);
    this.actor.offset('torso', this.lean);

    // each paw aims from its own shoulder, clamped to its side; the muzzle climbs on a kick
    // and the arm is shoved back
    let head = 0;
    for (const h of this.hands) {
      const w = h.dir < 0 ? 1 - up : up;
      const sh = this.view.parent!.toLocal(this.actor.point(h.arm), this.actor.view);
      const dev = Math.max(-MAX_AIM, Math.min(MAX_AIM, wrapAngle(Math.atan2(ay - sh.y, ax - sh.x) - h.out)));
      const a = h.out + dev;
      const arm = h.out + Math.max(-MAX_ARM, Math.min(MAX_ARM, dev));
      h.recoil = Math.max(0, h.recoil - dt * 7);
      const kick = h.recoil * h.recoil;
      this.actor.aim(h.arm, h.gun, arm + h.dir * -kick * 0.08, w);
      this.actor.aim(h.gun, h.out, a + h.dir * -kick * 0.2, w);
      this.actor.offset(h.arm, 0, Math.cos(a) * -kick * 34 * PACK, Math.sin(a) * -kick * 34 * PACK);
      // the head looks up and down with the gun a little, chin toward the aim; shots leave it be
      head += w * Math.max(-6, Math.min(6, ((dev * 180) / Math.PI) * 0.12));
    }
    // and turns slowly, so a sweeping aim does not wag it
    this.look += (head - this.look) * Math.min(1, dt * 4);
    this.actor.offset('head', this.look);

    this.actor.update(dt);

    // the raised gun shoots from its drawn muzzle along its drawn barrel; none mid-swap
    this.cooldown -= dt;
    const h = this.hands[up > 0.5 ? 1 : 0];
    if (firing && this.cooldown <= 0 && Math.abs(up - 0.5) > 0.4) {
      this.cooldown = FIRE_GAP;
      h.recoil = 1;
      this.actor.layer(h.fire, { additive: true });
      const world = this.view.parent!;
      const m = world.toLocal(this.actor.local(h.gun, h.muzzle.x, h.muzzle.y), this.actor.view);
      const n = world.toLocal(this.actor.local(h.gun, h.muzzle.x + 10 * h.dir, h.muzzle.y), this.actor.view);
      fire(m.x, m.y, Math.atan2(n.y - m.y, n.x - m.x));
    }
  }
}

async function main(): Promise<void> {
  const app = new Application();
  // at the screen's own density, so the close-up is not upscaled
  await app.init({ resizeTo: window, background: 0xcfe3ea, antialias: true, resolution: window.devicePixelRatio, autoDensity: true });
  document.body.appendChild(app.canvas);
  const skeleton = (await (await fetch(skeletonUrl)).json()) as TaoSkeleton;
  // mipmaps, or the game size (the atlas at ~1/8) samples single texels and sparkles
  const atlas = await Assets.load<Texture>({ src: atlasUrl, data: { autoGenerateMipmaps: true } });
  const corgi = new Corgi(sliceAtlas(skeleton, atlas));

  const ground = new Graphics();
  const world = new Container();
  world.sortableChildren = true;
  const fx = new Container();
  fx.zIndex = 1e6;
  world.addChild(corgi.view, fx);
  const bones = new Graphics();
  app.stage.addChild(ground, world, bones);
  // Pixi resizes on the next frame after the window does, so the ground follows app.screen
  let groundSize = '';
  const drawGround = (): void => {
    const size = `${app.screen.width}x${app.screen.height}`;
    if (size === groundSize) return;
    groundSize = size;
    ground.clear();
    for (let y = 40; y < app.screen.height; y += 80) {
      for (let x = ((y / 80) % 2) * 40 + 20; x < app.screen.width; x += 80) ground.circle(x, y, 5).fill({ color: 0xa9c7d2 });
    }
  };
  corgi.x = app.screen.width / 2;
  corgi.y = app.screen.height * 0.62;

  const keys = new Set<string>();
  let mouse = { x: corgi.x - 300, y: corgi.y - 120 };
  let down = false;
  let autoFire = false;
  let slow = false;
  let showBones = false;
  let zoom = 1;
  let idle = 0;
  window.addEventListener('keydown', (e) => {
    keys.add(e.code);
    idle = 0;
    if (e.code === 'KeyF') autoFire = !autoFire;
    if (e.code === 'Space') slow = !slow;
    if (e.code === 'KeyB') showBones = !showBones;
    if (e.code === 'KeyG') zoom = zoom === 1 ? GAME_ZOOM : 1;
  });
  window.addEventListener('keyup', (e) => keys.delete(e.code));
  app.canvas.addEventListener('pointermove', (e) => {
    mouse = { x: e.clientX, y: e.clientY };
    idle = 0;
  });
  app.canvas.addEventListener('pointerdown', () => (down = true));
  window.addEventListener('pointerup', () => (down = false));

  const shots: Shot[] = [];
  const fire = (x: number, y: number, a: number): void => {
    const flash = new Graphics().star(0, 0, 7, 34, 14).fill({ color: 0xfff27a }).circle(0, 0, 12).fill({ color: 0xffffff });
    flash.position.set(x, y);
    flash.rotation = a;
    fx.addChild(flash);
    shots.push({ g: flash, vx: 0, vy: 0, life: 0.05 });
    const bolt = new Graphics().roundRect(-22, -6, 44, 12, 6).fill({ color: 0xc6ff4a }).stroke({ color: 0x1d3440, width: 3 });
    bolt.position.set(x, y);
    bolt.rotation = a;
    fx.addChild(bolt);
    shots.push({ g: bolt, vx: Math.cos(a) * 1500, vy: Math.sin(a) * 1500, life: 0.7 });
  };

  // the demo: wander between points while circling the aim around the hero
  let demoT = 0;
  let wander = { x: corgi.x, y: corgi.y };
  app.ticker.add((t) => {
    const dt = Math.min(0.05, t.deltaMS / 1000) * (slow ? 0.25 : 1);
    idle += dt;
    let mx = (keys.has('KeyD') ? 1 : 0) - (keys.has('KeyA') ? 1 : 0);
    let my = (keys.has('KeyS') ? 1 : 0) - (keys.has('KeyW') ? 1 : 0);
    // the world zooms about the screen's centre; the corgi keeps to the visible part of it
    world.scale.set(zoom);
    world.position.set((app.screen.width / 2) * (1 - zoom), (app.screen.height / 2) * (1 - zoom));
    const tl = world.toLocal({ x: 0, y: 0 });
    const br = world.toLocal({ x: app.screen.width, y: app.screen.height });
    let aim: { x: number; y: number } = world.toLocal(mouse);
    let firing = down || autoFire;
    if (idle > 3 && !down) {
      demoT += dt;
      if (Math.hypot(wander.x - corgi.x, wander.y - corgi.y) < 30 || demoT > 2.6) {
        demoT = 0;
        const stop = Math.random() < 0.3;
        wander = stop ? { x: corgi.x, y: corgi.y } : { x: tl.x + (br.x - tl.x) * (0.2 + Math.random() * 0.6), y: tl.y + (br.y - tl.y) * (0.35 + Math.random() * 0.5) };
      }
      mx = wander.x - corgi.x;
      my = wander.y - corgi.y;
      const r = idle * 0.7;
      aim = { x: corgi.x + Math.cos(r) * 400, y: corgi.y - 150 + Math.sin(r * 1.3) * 220 };
      firing = Math.sin(idle * 1.7) > -0.2;
    }
    // unit input; the demo slows over its last 60 px so it eases into each stop
    const len = Math.hypot(mx, my);
    const gain = idle > 3 ? Math.min(1, len / 60) : 1;
    if (len > 1e-3) {
      mx = (mx / len) * gain;
      my = (my / len) * gain;
    }
    drawGround();
    corgi.update(dt, mx, my, aim.x, aim.y, firing, fire);
    corgi.x = Math.max(tl.x + 120, Math.min(br.x - 120, corgi.x));
    corgi.y = Math.max(tl.y + HEIGHT, Math.min(br.y - 30, corgi.y));

    for (let i = shots.length - 1; i >= 0; i--) {
      const s = shots[i];
      s.life -= dt;
      s.g.x += s.vx * dt;
      s.g.y += s.vy * dt;
      if (s.life <= 0) {
        s.g.destroy();
        shots.splice(i, 1);
      }
    }

    bones.clear();
    if (showBones) {
      for (const b of skeleton.bones) {
        const p = corgi.actor.view.toGlobal(corgi.actor.point(b.id));
        bones.circle(p.x, p.y, 5).fill({ color: 0xff3050 });
      }
    }
  });
}

void main();
