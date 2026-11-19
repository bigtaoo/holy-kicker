// Baked mob animation (tools/bake_mob.py writes <name>.png + <name>.json): one looping
// frame sequence per mob type. Pure frame and corpse maths, tested without Pixi.

export interface SheetMeta {
  frames: number;
  /** Index of the first white hit-flash copy of the frames; 0 for a sheet baked without them (a boss, which flashes through `whiteFlash`). */
  flash: number;
  cols: number;
  frameW: number;
  frameH: number;
  fps: number;
  /** The feet, in frame px. */
  anchor: [number, number];
  /** Height of the drawing in sheet px, the size it is scaled from. */
  height: number;
  /** How far each frame floats above the ground, in sheet px (a jiangshi hop). */
  lift: number[];
  /** Width of the sticker rim baked round every frame (bake_mob.py "outline"), if any. */
  outline?: number;
}

/** Frame shown `time` seconds into the loop, for a mob whose cycle starts at `phase` (0..1). */
export function frameAt(meta: SheetMeta, time: number, phase: number): number {
  const f = Math.floor(time * meta.fps + phase * meta.frames) % meta.frames;
  return f < 0 ? f + meta.frames : f;
}

/**
 * A knocked-down mob: stretched by the blow, it flies back along the hit and tips over, squashes
 * flat as it lands, then shrinks and drifts up as it fades, like a soul leaving the body.
 */
export interface Corpse {
  x: number;
  y: number;
  vx: number;
  vy: number;
  /** Height above the ground, up positive. */
  z: number;
  vz: number;
  /** Clockwise tilt in radians. */
  tilt: number;
  age: number;
  /** Age at which it landed, -1 while still in the air. */
  landed: number;
}

export const CORPSE_LIFE = 0.65;
const GRAVITY = 2600;
/** The blow's stretch (taller, thinner) eases back over this long. */
const STRETCH_TIME = 0.12;
const STRETCH = 0.16;
/** The landing squash: flatter by SQUASH for this long. */
const SQUASH_TIME = 0.16;
const SQUASH = 0.3;
/** The last part of its life: it fades, shrinks by SHRINK and drifts up RISE world units. */
const FADE_TIME = 0.22;
const SHRINK = 0.55;
const RISE = 30;

/** Starts a corpse, reusing `out` if given. */
export function knockDown(x: number, y: number, dirX: number, dirY: number, speed: number, out = {} as Corpse): Corpse {
  const d = Math.sqrt(dirX * dirX + dirY * dirY) || 1;
  return Object.assign(out, { x, y, vx: (dirX / d) * speed, vy: (dirY / d) * speed, z: 0, vz: 680, tilt: 0, age: 0, landed: -1 });
}

/** Advances a corpse; false once it has faded out. */
export function stepCorpse(c: Corpse, dt: number): boolean {
  c.age += dt;
  c.x += c.vx * dt;
  c.y += c.vy * dt;
  c.vz -= GRAVITY * dt;
  c.z = Math.max(0, c.z + c.vz * dt);
  if (c.z === 0) {
    if (c.landed < 0) c.landed = c.age;
    c.vx *= 0.8;
    c.vy *= 0.8;
  }
  // tip over away from the hit, a quarter turn by the time it lands
  const fall = Math.sign(c.vx || 1) * (Math.PI / 2);
  c.tilt = fall * Math.min(1, c.age / 0.35);
  return c.age < CORPSE_LIFE;
}

/** How far into its fade a corpse is, 0..1. */
function fading(c: Corpse): number {
  return Math.max(0, Math.min(1, (c.age - (CORPSE_LIFE - FADE_TIME)) / FADE_TIME));
}

/** Corpse opacity: solid, then fading over the last part of its life. */
export function corpseAlpha(c: Corpse): number {
  return 1 - fading(c);
}

/**
 * The corpse's scale in its own frame (x across the body, y head to feet), written into `out`:
 * the blow's stretch, the landing's squash (lying on its side, a thinner body is a flatter one)
 * and the shrink of the fade.
 */
export function corpseScale(c: Corpse, out: { x: number; y: number }): { x: number; y: number } {
  const blow = 1 - Math.min(1, c.age / STRETCH_TIME);
  let x = 1 - STRETCH * 0.9 * blow;
  let y = 1 + STRETCH * blow;
  if (c.landed >= 0 && c.age - c.landed < SQUASH_TIME) {
    const p = Math.sin((Math.PI * (c.age - c.landed)) / SQUASH_TIME);
    x *= 1 - SQUASH * p;
    y *= 1 + SQUASH * 0.5 * p;
  }
  const k = 1 - SHRINK * fading(c);
  out.x = x * k;
  out.y = y * k;
  return out;
}

/** How far the fading corpse has drifted up, world units. */
export function corpseRise(c: Corpse): number {
  const f = fading(c);
  return RISE * f * f;
}

/** A hit rocks the mob back this far (radians) about its feet, for this long. */
export const RECOIL = 0.24;
export const RECOIL_TIME = 0.22;

/**
 * The rock back of a hit, `left` of `len` seconds to go: a snap back from the hero, a small
 * overshoot forward, then still. Positive leans away from the side the mob faces.
 */
export function recoilTilt(left: number, len: number): number {
  if (left <= 0 || len <= 0) return 0;
  const u = 1 - Math.min(1, left / len);
  return RECOIL * Math.sin(u * Math.PI * 1.25) * (1 - u) * 1.6;
}

/** A mob standing in a jam sways on its feet: this far (radians), this many times a second. */
const SWAY = 0.05;
const SWAY_RATE = 0.45;

/** The sway's lean after `idle` seconds, `still` 0..1 of the way to standing. */
export function swayTilt(idle: number, phase: number, still: number): number {
  return Math.sin((idle * SWAY_RATE + phase) * Math.PI * 2) * SWAY * still;
}

/** A mob going slower than this share of its walking speed stops hopping once it lands. */
export const SETTLE = 0.35;
/** Seconds for the measured pace to follow the real one. */
const PACE_EASE = 0.15;

/** Eases the mob's pace (0..1, a share of `walk`) toward how far it really moved this frame. */
export function stepPace(pace: number, moved: number, walk: number, dt: number): number {
  const target = Math.min(1, moved / Math.max(1e-6, walk * dt));
  return pace + (target - pace) * (1 - Math.exp(-dt / PACE_EASE));
}

/** True when a jammed mob should stand still on this frame instead of hopping in place. */
export function holdsStill(meta: SheetMeta, frame: number, pace: number): boolean {
  return pace < SETTLE && (meta.lift[frame] ?? 0) <= 1;
}

/** Mobs fade toward this brightness with distance from the hero, between NEAR and FAR. */
export const DEPTH_SHADE = { near: 300, far: 850, min: 0.84 };

/**
 * Brightness (0..1) for a mob `d` away from the hero: the front ring stays bright and the
 * crowd behind it sinks back, so the pile reads as one mass instead of a busy lattice.
 */
export function depthShade(d: number, s = DEPTH_SHADE): number {
  const t = Math.min(1, Math.max(0, (d - s.near) / (s.far - s.near)));
  return 1 - t * (1 - s.min);
}

/** A grey multiply tint of brightness k (0..1). */
export function greyTint(k: number, base = 0xffffff): number {
  const f = Math.min(1, Math.max(0, k));
  // spelled out: a helper closure here was made anew for every mob every frame
  return (Math.round(((base >> 16) & 255) * f) << 16) | (Math.round(((base >> 8) & 255) * f) << 8) | Math.round((base & 255) * f);
}
