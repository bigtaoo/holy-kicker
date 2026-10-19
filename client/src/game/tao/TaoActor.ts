import { Container, Matrix, Rectangle, Sprite, Texture } from 'pixi.js';
import { aimChain, apply, boneChain, chainOf, computeWorld, restPoses, type Affine, type Chain } from './pose';
import { addPoses, blendMasked, blendPoses, clipTime, samplePose } from './sample';
import { BoneSpring, type SpringSpec } from './spring';
import type { BonePose, TaoSkeleton } from './types';

// Plays a .tao skeleton. The view's origin is the skeleton origin (between the feet).
// Sprites sit flat in one container in slot order, because draw order does not follow the
// bone hierarchy (a hand is drawn behind its own forearm).

const FADE = 0.12; // seconds of cross-fade when switching clips

export interface TaoAsset {
  skeleton: TaoSkeleton;
  textures: Map<string, Texture>;
}

/** Cuts the atlas into one texture per image. */
export function sliceAtlas(skeleton: TaoSkeleton, atlas: Texture): TaoAsset {
  const textures = new Map<string, Texture>();
  for (const [name, f] of Object.entries(skeleton.images)) {
    textures.set(name, new Texture({ source: atlas.source, frame: new Rectangle(f.x, f.y, f.w, f.h) }));
  }
  return { skeleton, textures };
}

/** A clip played over the base clip: additive (its keys are offsets) or owning `bones`. */
export interface LayerOptions {
  additive?: boolean;
  bones?: readonly string[];
  weight?: number;
}

interface Layer extends LayerOptions {
  name: string;
  time: number;
}

export class TaoActor {
  /** Playback speed of the base clip; negative plays it backwards (a backpedal). */
  rate = 1;
  readonly view = new Container();
  private readonly sk: TaoSkeleton;
  private readonly textures: Map<string, Texture>;
  private readonly sprites: { sprite: Sprite; bone: string; x: number; y: number }[] = [];
  private readonly bySlot = new Map<string, Sprite>();
  private readonly poses: Map<string, BonePose>;
  private readonly fromPoses: Map<string, BonePose>;
  private readonly world = new Map<string, Affine>();
  private readonly m = new Matrix();
  private clip = '';
  private time = 0;
  private prevClip = '';
  private prevTime = 0;
  private fade = 0;
  private readonly aims = new Map<string, { chain: Chain; angle: number; weight: number }>();
  private readonly layers: Layer[] = [];
  private readonly layerPoses: Map<string, BonePose>;
  private readonly offsets = new Map<string, { rotate: number; x: number; y: number }>();
  private readonly springs: BoneSpring[] = [];
  private travelX = 0;
  private travelY = 0;

  constructor(asset: TaoAsset) {
    this.sk = asset.skeleton;
    this.textures = asset.textures;
    this.poses = restPoses(this.sk);
    this.fromPoses = restPoses(this.sk);
    this.layerPoses = restPoses(this.sk);
    for (const slot of this.sk.slots) {
      const sprite = new Sprite(this.texture(slot.image));
      this.view.addChild(sprite);
      this.sprites.push({ sprite, bone: slot.bone, x: slot.x, y: slot.y });
      this.bySlot.set(slot.id, sprite);
    }
    this.update(0);
  }

  get height(): number {
    return this.sk.height;
  }

  get current(): string {
    return this.clip;
  }

  /** Seconds since the current clip started. */
  get elapsed(): number {
    return this.time;
  }

  /** True once a one-shot clip has reached its end; loops never finish. */
  get finished(): boolean {
    const anim = this.sk.animations[this.clip];
    return !!anim && !anim.loop && this.time >= anim.duration;
  }

  /** Switches clip (cross-fading from the current one); a no-op if it is already playing. */
  play(name: string, restart = false): void {
    if (!this.sk.animations[name]) throw new Error(`${this.sk.name} has no animation ${name}`);
    if (name === this.clip && !restart) return;
    if (this.clip) {
      this.prevClip = this.clip;
      this.prevTime = this.time;
      this.fade = FADE;
    }
    this.clip = name;
    this.time = 0;
  }

  /** Swaps a slot's image, e.g. the face to "face_hurt"; null restores the default. */
  setImage(slot: string, image: string | null): void {
    const sprite = this.bySlot.get(slot);
    const def = this.sk.slots.find((s) => s.id === slot);
    if (!sprite || !def) throw new Error(`${this.sk.name} has no slot ${slot}`);
    sprite.texture = this.texture(image ?? def.image);
  }

  /**
   * Plays a clip on top of the base clip, from its start (again if it is already on), e.g. a
   * shot's flinch over the run. Loops stay until stopLayer(); one-shots drop off at their end.
   */
  layer(name: string, opts: LayerOptions = {}): void {
    if (!this.sk.animations[name]) throw new Error(`${this.sk.name} has no animation ${name}`);
    this.stopLayer(name);
    this.layers.push({ ...opts, name, time: 0 });
  }

  stopLayer(name: string): void {
    const i = this.layers.findIndex((l) => l.name === name);
    if (i >= 0) this.layers.splice(i, 1);
  }

  /** A procedural offset on a bone, added after the clips until changed (zeros clear it). */
  offset(bone: string, rotate: number, x = 0, y = 0): void {
    if (rotate === 0 && x === 0 && y === 0) this.offsets.delete(bone);
    else this.offsets.set(bone, { rotate, x, y });
  }

  /**
   * Holds the limb from `bone` to `tip` pointed along `angle` (radians, skeleton space) over
   * whatever the clip does, e.g. an arm swinging a staff; a `weight` under 1 mixes toward the
   * clip's pose, and null hands the limb back to the clip. `tip` may instead be a direction in
   * the bone's own space (radians), to aim a single bone such as a gun. Aims apply in the order
   * they were first set, so a gun aimed after its arm stays on target; a weight of 0 rests the
   * aim but keeps its place in that order.
   */
  aim(bone: string, tip: string | number, angle: number | null, weight = 1): void {
    if (angle === null) {
      this.aims.delete(bone);
      return;
    }
    const chain = this.aims.get(bone)?.chain ?? (typeof tip === 'number' ? boneChain(this.sk, bone, tip) : chainOf(this.sk, bone, tip));
    this.aims.set(bone, { chain, angle, weight: Math.max(0, Math.min(1, weight)) });
  }

  /**
   * Lets a bone swing on a damped spring, pushed by its pivot's acceleration (ears, a tail).
   * The swing adds to whatever the clips do.
   */
  spring(bone: string, spec: SpringSpec): void {
    const slot = this.sk.slots.find((s) => s.bone === bone);
    const f = slot && this.sk.images[slot.image];
    const tip = slot && f ? { x: slot.x + f.w / 2, y: slot.y + f.h / 2 } : { x: 0, y: -1 };
    this.springs.push(new BoneSpring(bone, spec, tip));
  }

  /**
   * Tells the springs how far the actor itself moved since the last update, in skeleton
   * units (mirror x when the view is flipped), so running and stopping swing the ears.
   */
  move(dx: number, dy: number): void {
    this.travelX += dx;
    this.travelY += dy;
  }

  /** A point given in a bone's own space, in the view's space as of the last update. */
  local(bone: string, x: number, y: number): { x: number; y: number } {
    const w = this.world.get(bone);
    if (!w) throw new Error(`${this.sk.name} has no bone ${bone}`);
    return apply(w, x, y);
  }

  /** A bone's pivot in the view's space, as of the last update. */
  point(bone: string): { x: number; y: number } {
    const w = this.world.get(bone);
    if (!w) throw new Error(`${this.sk.name} has no bone ${bone}`);
    return { x: w.tx, y: w.ty };
  }

  update(dt: number): void {
    const anim = this.sk.animations[this.clip];
    if (anim) {
      this.time += dt * this.rate;
      samplePose(anim, clipTime(anim, this.time), this.poses);
      if (this.fade > 0) {
        const prev = this.sk.animations[this.prevClip];
        this.prevTime += dt * this.rate;
        this.fade = Math.max(0, this.fade - dt);
        samplePose(prev, clipTime(prev, this.prevTime), this.fromPoses);
        blendPoses(this.fromPoses, this.poses, 1 - this.fade / FADE);
      }
    }
    this.applyLayers(dt);
    for (const [bone, o] of this.offsets) {
      const p = this.poses.get(bone);
      if (!p) continue;
      p.rotate += o.rotate;
      p.x += o.x;
      p.y += o.y;
    }
    computeWorld(this.sk, this.poses, this.world);
    for (const a of this.aims.values()) if (a.weight > 0) aimChain(this.sk, this.poses, this.world, a.chain, a.angle, a.weight);
    if (this.springs.length) {
      for (const s of this.springs) this.poses.get(s.bone)!.rotate += s.step(this.world.get(s.bone)!, this.travelX, this.travelY, dt);
      computeWorld(this.sk, this.poses, this.world);
    }
    for (const s of this.sprites) {
      const w = this.world.get(s.bone)!;
      // the sprite's top-left sits at (x, y) in bone space
      this.m.set(w.a, w.b, w.c, w.d, w.a * s.x + w.c * s.y + w.tx, w.b * s.x + w.d * s.y + w.ty);
      s.sprite.setFromMatrix(this.m);
    }
  }

  private applyLayers(dt: number): void {
    for (let i = this.layers.length - 1; i >= 0; i--) {
      const l = this.layers[i];
      const anim = this.sk.animations[l.name];
      l.time += dt;
      if (!anim.loop && l.time > anim.duration) {
        this.layers.splice(i, 1);
        continue;
      }
      samplePose(anim, clipTime(anim, l.time), this.layerPoses);
      const w = l.weight ?? 1;
      if (l.additive) addPoses(anim, this.layerPoses, this.poses, w);
      else blendMasked(this.layerPoses, this.poses, l.bones ?? Object.keys(anim.bones), w);
    }
  }

  private texture(image: string): Texture {
    const t = this.textures.get(image);
    if (!t) throw new Error(`${this.sk.name} has no image ${image}`);
    return t;
  }
}
