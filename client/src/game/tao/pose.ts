import type { BonePose, TaoSkeleton } from './types';

// Forward kinematics for .tao skeletons. Pure, so it is tested without Pixi.

/** A 2D affine matrix laid out like Pixi's Matrix: x' = a*x + c*y + tx, y' = b*x + d*y + ty. */
export interface Affine {
  a: number;
  b: number;
  c: number;
  d: number;
  tx: number;
  ty: number;
}

export function identity(): Affine {
  return { a: 1, b: 0, c: 0, d: 1, tx: 0, ty: 0 };
}

export function restPoses(sk: TaoSkeleton): Map<string, BonePose> {
  return new Map(sk.bones.map((b) => [b.id, { rotate: 0, x: 0, y: 0, sx: 1, sy: 1 }]));
}

/**
 * World matrices of every bone. A bone sits at its rest offset from the parent's pivot plus
 * its animated translation, then rotates and scales about its own pivot; children inherit
 * all of it. Bones are processed in file order, which lists parents first.
 */
export function computeWorld(sk: TaoSkeleton, poses: Map<string, BonePose>, out: Map<string, Affine>): void {
  for (const bone of sk.bones) {
    const p = poses.get(bone.id);
    const r = ((p?.rotate ?? 0) * Math.PI) / 180;
    const cos = Math.cos(r);
    const sin = Math.sin(r);
    const sx = p?.sx ?? 1;
    const sy = p?.sy ?? 1;
    // local = translate(x, y) * rotate(r) * scale(sx, sy)
    const la = cos * sx;
    const lb = sin * sx;
    const lc = -sin * sy;
    const ld = cos * sy;
    const lx = bone.x + (p?.x ?? 0);
    const ly = bone.y + (p?.y ?? 0);
    let m = out.get(bone.id);
    if (!m) out.set(bone.id, (m = identity()));
    const par = bone.parent ? out.get(bone.parent) : undefined;
    if (!par) {
      m.a = la;
      m.b = lb;
      m.c = lc;
      m.d = ld;
      m.tx = lx;
      m.ty = ly;
      continue;
    }
    m.a = par.a * la + par.c * lb;
    m.b = par.b * la + par.d * lb;
    m.c = par.a * lc + par.c * ld;
    m.d = par.b * lc + par.d * ld;
    m.tx = par.a * lx + par.c * ly + par.tx;
    m.ty = par.b * lx + par.d * ly + par.ty;
  }
}

/** A point given in a bone's space (relative to its pivot) mapped to skeleton space. */
export function apply(m: Affine, x: number, y: number): { x: number; y: number } {
  return { x: m.a * x + m.c * y + m.tx, y: m.b * x + m.d * y + m.ty };
}
