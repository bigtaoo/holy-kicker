import { describe, expect, it } from 'vitest';
import { apply, computeWorld, restPoses, type Affine } from './pose';
import { blendPoses, clipTime, ease, samplePose, sampleTrack } from './sample';
import type { TaoAnimation, TaoSkeleton } from './types';

// root -> arm (pivot 10 right of root) -> hand (pivot 10 further right)
const sk: TaoSkeleton = {
  version: 1,
  name: 'test',
  height: 20,
  bones: [
    { id: 'root', parent: null, x: 0, y: 0 },
    { id: 'arm', parent: 'root', x: 10, y: 0 },
    { id: 'hand', parent: 'arm', x: 10, y: 0 },
  ],
  slots: [],
  images: {},
  variants: {},
  animations: {},
};

const anim: TaoAnimation = {
  duration: 1,
  loop: true,
  bones: {
    arm: { rotate: [{ t: 0, v: [0] }, { t: 1, v: [90] }] },
    root: { translate: [{ t: 0, v: [0, 0], e: 'step' }, { t: 0.5, v: [0, -4] }] },
  },
};

describe('sampleTrack', () => {
  it('interpolates, holds the ends and honours step', () => {
    const out = [0, 0];
    sampleTrack(anim.bones.arm.rotate!, 0.25, out);
    expect(out[0]).toBeCloseTo(22.5);
    sampleTrack(anim.bones.arm.rotate!, 2, out);
    expect(out[0]).toBe(90);
    sampleTrack(anim.bones.root.translate!, 0.4, out);
    expect(out).toEqual([0, 0]);
    sampleTrack(anim.bones.root.translate!, 0.6, out);
    expect(out).toEqual([0, -4]);
  });

  it('eases symmetrically', () => {
    expect(ease('ease-in-out', 0.5)).toBeCloseTo(0.5);
    expect(ease('ease-in-out', 0.25)).toBeCloseTo(0.125);
    expect(ease('ease-out', 0.5)).toBeCloseTo(0.75);
  });
});

describe('clipTime', () => {
  it('wraps loops and clamps one-shots', () => {
    expect(clipTime(anim, 2.25)).toBeCloseTo(0.25);
    expect(clipTime({ ...anim, loop: false }, 2.25)).toBe(1);
  });
});

describe('computeWorld', () => {
  const world = new Map<string, Affine>();

  it('rebuilds the rest pose', () => {
    computeWorld(sk, restPoses(sk), world);
    expect(apply(world.get('hand')!, 0, 0)).toEqual({ x: 20, y: 0 });
  });

  it('rotates children about the parent pivot (clockwise, y down)', () => {
    const poses = restPoses(sk);
    samplePose(anim, 1, poses);
    computeWorld(sk, poses, world);
    const p = apply(world.get('hand')!, 0, 0);
    expect(p.x).toBeCloseTo(10);
    expect(p.y).toBeCloseTo(6); // the root bobbed up by 4
  });

  it('blends between poses', () => {
    const a = restPoses(sk);
    const b = restPoses(sk);
    b.get('arm')!.rotate = 40;
    blendPoses(a, b, 0.25);
    expect(b.get('arm')!.rotate).toBeCloseTo(10);
  });
});
