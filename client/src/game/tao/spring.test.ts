import { describe, expect, it } from 'vitest';
import { addPoses, blendMasked } from './sample';
import { boneChain, aimChain, computeWorld, restPoses, type Affine } from './pose';
import { BoneSpring, Motion, stepSpring, type SpringSpec } from './spring';
import type { TaoAnimation, TaoSkeleton } from './types';

const spec: SpringSpec = { stiffness: 100, damping: 8, gain: 1, limit: 30 };

describe('stepSpring', () => {
  it('a pivot speeding up to the right leaves a hanging tip behind (clockwise), then settles', () => {
    const s = { angle: 0, velocity: 0 };
    stepSpring(s, spec, 500, 0, 0, 1, 0.1);
    expect(s.angle).toBeGreaterThan(0);
    for (let i = 0; i < 300; i++) stepSpring(s, spec, 0, 0, 0, 1, 1 / 60);
    expect(Math.abs(s.angle)).toBeLessThan(0.01);
  });

  it('holds the clamp', () => {
    const s = { angle: 0, velocity: 0 };
    for (let i = 0; i < 60; i++) stepSpring(s, spec, 1e5, 0, 0, 1, 1 / 60);
    expect(s.angle).toBe(30);
  });
});

describe('Motion', () => {
  it('reports no acceleration until it has history, then the second difference', () => {
    const m = new Motion();
    m.push(0, 0, 0.1);
    m.push(1, 0, 0.1);
    expect(m.ax).toBe(0);
    m.push(3, 0, 0.1); // velocity 10 -> 20 in 0.1 s
    expect(m.ax).toBeCloseTo(100);
  });
});

describe('BoneSpring', () => {
  it('swings an ear (tip up) the other way to a hanging tail when the body jumps right', () => {
    const ear = new BoneSpring('ear', spec, { x: 0, y: -10 });
    const m: Affine = { a: 1, b: 0, c: 0, d: 1, tx: 0, ty: 0 };
    for (const x of [0, 0, 5]) ear.step({ ...m, tx: x }, 0, 0, 1 / 30);
    expect(ear.state.angle).toBeLessThan(0);
  });
});

const sk: TaoSkeleton = {
  version: 1,
  name: 'test',
  height: 20,
  bones: [
    { id: 'root', parent: null, x: 0, y: 0 },
    { id: 'arm', parent: 'root', x: 10, y: 0 },
    { id: 'gun', parent: 'arm', x: 10, y: 0 },
  ],
  slots: [],
  images: {},
  variants: {},
  animations: {},
};

describe('layers', () => {
  it('adds an additive clip onto the keyed bones only, scaling multiplies', () => {
    const anim: TaoAnimation = { duration: 1, loop: false, bones: { arm: { rotate: [{ t: 0, v: [10] }] } } };
    const delta = restPoses(sk);
    delta.get('arm')!.rotate = 10;
    delta.get('arm')!.sx = 1.2;
    delta.get('gun')!.rotate = 99; // not keyed by the clip
    const to = restPoses(sk);
    to.get('arm')!.rotate = 5;
    to.get('arm')!.sx = 2;
    addPoses(anim, delta, to, 0.5);
    expect(to.get('arm')!.rotate).toBeCloseTo(10);
    expect(to.get('arm')!.sx).toBeCloseTo(2.2);
    expect(to.get('gun')!.rotate).toBe(0);
  });

  it('a masked override owns only its bones', () => {
    const from = restPoses(sk);
    from.get('arm')!.rotate = 40;
    from.get('gun')!.rotate = 40;
    const to = restPoses(sk);
    blendMasked(from, to, ['arm'], 1);
    expect(to.get('arm')!.rotate).toBe(40);
    expect(to.get('gun')!.rotate).toBe(0);
  });
});

describe('boneChain', () => {
  it('turns one bone so a direction in its own space points along the aim', () => {
    const poses = restPoses(sk);
    poses.get('arm')!.rotate = 30;
    const world = new Map<string, Affine>();
    computeWorld(sk, poses, world);
    // the gun's barrel points left (pi) in its own space; aim it straight down
    aimChain(sk, poses, world, boneChain(sk, 'gun', Math.PI), Math.PI / 2);
    const g = world.get('gun')!;
    // the barrel direction (-1, 0) in gun space maps to (0, 1)
    expect(-g.a).toBeCloseTo(0);
    expect(-g.b).toBeCloseTo(1);
  });
});
