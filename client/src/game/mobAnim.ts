// Baked mob animation (tools/bake_mob.py writes <name>.png + <name>.json): one looping
// frame sequence per mob type. Pure frame and corpse maths, tested without Pixi.

export interface SheetMeta {
  frames: number;
  /** Index of the first white hit-flash copy of the frames. */
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
}

/** Frame shown `time` seconds into the loop, for a mob whose cycle starts at `phase` (0..1). */
export function frameAt(meta: SheetMeta, time: number, phase: number): number {
  const f = Math.floor(time * meta.fps + phase * meta.frames) % meta.frames;
  return f < 0 ? f + meta.frames : f;
}

/** A knocked-down mob: flies back along the hit, tips over and fades. */
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
}

export const CORPSE_LIFE = 0.5;
const GRAVITY = 2600;

/** Starts a corpse, reusing `out` if given. */
export function knockDown(x: number, y: number, dirX: number, dirY: number, speed: number, out = {} as Corpse): Corpse {
  const d = Math.hypot(dirX, dirY) || 1;
  return Object.assign(out, { x, y, vx: (dirX / d) * speed, vy: (dirY / d) * speed, z: 0, vz: 520, tilt: 0, age: 0 });
}

/** Advances a corpse; false once it has faded out. */
export function stepCorpse(c: Corpse, dt: number): boolean {
  c.age += dt;
  c.x += c.vx * dt;
  c.y += c.vy * dt;
  c.vz -= GRAVITY * dt;
  c.z = Math.max(0, c.z + c.vz * dt);
  if (c.z === 0) {
    c.vx *= 0.8;
    c.vy *= 0.8;
  }
  // tip over away from the hit, a quarter turn by the time it lands
  const fall = Math.sign(c.vx || 1) * (Math.PI / 2);
  c.tilt = fall * Math.min(1, c.age / 0.35);
  return c.age < CORPSE_LIFE;
}

/** Corpse opacity: solid, then fading over the last part of its life. */
export function corpseAlpha(c: Corpse): number {
  return Math.max(0, Math.min(1, (CORPSE_LIFE - c.age) / 0.2));
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
export const DEPTH_SHADE = { near: 300, far: 850, min: 0.72 };

/**
 * Brightness (0..1) for a mob `d` away from the hero: the front ring stays bright and the
 * crowd behind it sinks back, so the pile reads as one mass instead of a busy lattice.
 */
export function depthShade(d: number, s = DEPTH_SHADE): number {
  const t = Math.min(1, Math.max(0, (d - s.near) / (s.far - s.near)));
  return 1 - t * (1 - s.min);
}

/** A grey multiply tint of brightness k (0..1). */
export function greyTint(k: number): number {
  const c = Math.round(255 * Math.min(1, Math.max(0, k)));
  return (c << 16) | (c << 8) | c;
}
