import type { BonePose, Easing, TaoAnimation, TaoKey } from './types';

// Keyframe sampling for .tao animations. Pure, so it is tested without Pixi.

export function ease(e: Easing | undefined, f: number): number {
  switch (e) {
    case 'step':
      return 0;
    case 'ease-in':
      return f * f;
    case 'ease-out':
      return f * (2 - f);
    case 'ease-in-out':
      return f < 0.5 ? 2 * f * f : 1 - 2 * (1 - f) * (1 - f);
    default:
      return f;
  }
}

/** Value of one channel at time t; holds the first/last key outside the keyed range. */
export function sampleTrack(keys: TaoKey[], t: number, out: number[]): void {
  const last = keys.length - 1;
  if (t <= keys[0].t || last === 0) return copy(keys[0].v, out);
  if (t >= keys[last].t) return copy(keys[last].v, out);
  let i = 0;
  while (keys[i + 1].t <= t) i++;
  const a = keys[i];
  const b = keys[i + 1];
  const f = ease(a.e, (t - a.t) / (b.t - a.t));
  for (let c = 0; c < a.v.length; c++) out[c] = a.v[c] + (b.v[c] - a.v[c]) * f;
}

function copy(v: number[], out: number[]): void {
  for (let c = 0; c < v.length; c++) out[c] = v[c];
}

/** Clip time for an elapsed time: wraps when looping, otherwise clamps to the end. */
export function clipTime(anim: TaoAnimation, elapsed: number): number {
  if (anim.loop) return ((elapsed % anim.duration) + anim.duration) % anim.duration;
  return Math.min(Math.max(elapsed, 0), anim.duration);
}

const tmp = [0, 0];

/** Writes the animation's pose at clip time t into `poses`; unkeyed bones rest. */
export function samplePose(anim: TaoAnimation, t: number, poses: Map<string, BonePose>): void {
  for (const [id, p] of poses) {
    const tracks = anim.bones[id];
    p.rotate = 0;
    p.x = p.y = 0;
    p.sx = p.sy = 1;
    if (!tracks) continue;
    if (tracks.rotate) {
      sampleTrack(tracks.rotate, t, tmp);
      p.rotate = tmp[0];
    }
    if (tracks.translate) {
      sampleTrack(tracks.translate, t, tmp);
      p.x = tmp[0];
      p.y = tmp[1];
    }
    if (tracks.scale) {
      sampleTrack(tracks.scale, t, tmp);
      p.sx = tmp[0];
      p.sy = tmp[1];
    }
  }
}

/** Blends `from` towards `to` by w (0..1) into `to`, for cross-fading between clips. */
export function blendPoses(from: Map<string, BonePose>, to: Map<string, BonePose>, w: number): void {
  for (const [id, b] of to) {
    const a = from.get(id);
    if (!a) continue;
    b.rotate = a.rotate + (b.rotate - a.rotate) * w;
    b.x = a.x + (b.x - a.x) * w;
    b.y = a.y + (b.y - a.y) * w;
    b.sx = a.sx + (b.sx - a.sx) * w;
    b.sy = a.sy + (b.sy - a.sy) * w;
  }
}

/**
 * Adds an additive clip's pose onto `to`, scaled by w: its keys are offsets from the rest pose
 * (rotate and translate add, scale multiplies). Bones the clip does not key are left alone.
 */
export function addPoses(anim: TaoAnimation, delta: Map<string, BonePose>, to: Map<string, BonePose>, w: number): void {
  for (const id of Object.keys(anim.bones)) {
    const d = delta.get(id);
    const b = to.get(id);
    if (!d || !b) continue;
    b.rotate += d.rotate * w;
    b.x += d.x * w;
    b.y += d.y * w;
    b.sx *= 1 + (d.sx - 1) * w;
    b.sy *= 1 + (d.sy - 1) * w;
  }
}

/** Like blendPoses, for the listed bones only: an override layer that owns part of the body. */
export function blendMasked(from: Map<string, BonePose>, to: Map<string, BonePose>, bones: readonly string[], w: number): void {
  for (const id of bones) {
    const a = from.get(id);
    const b = to.get(id);
    if (!a || !b) continue;
    b.rotate += (a.rotate - b.rotate) * w;
    b.x += (a.x - b.x) * w;
    b.y += (a.y - b.y) * w;
    b.sx += (a.sx - b.sx) * w;
    b.sy += (a.sy - b.sy) * w;
  }
}
