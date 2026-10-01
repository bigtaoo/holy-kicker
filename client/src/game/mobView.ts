import { Container, Rectangle, Sprite, Texture } from 'pixi.js';
import { makeShadow, sizeShadow } from './shadow';
import { corpseAlpha, frameAt, knockDown, stepCorpse, type Corpse, type SheetMeta } from './mobAnim';

// Draws mobs from their baked sheets: a looping animated sprite over a ground shadow that
// stays on the ground while the sprite hops. Corpses are separate sprites, so a knocked-down
// mob can respawn at once while its body tumbles away; spent corpse sprites are reused.

export interface MobSheet {
  meta: SheetMeta;
  textures: Texture[];
}

export interface MobLook {
  sheet: MobSheet;
  /** In-world height of the drawing. */
  height: number;
  /** True if the drawing faces left. */
  facesLeft: boolean;
  /** Ground shadow half-width and half-height. */
  shadow: [number, number];
  shadowTex: Texture;
}

/** Cuts the frames out of a sheet, which may sit at (x0, y0) inside a larger atlas page. */
export function sliceSheet(meta: SheetMeta, sheet: Texture, x0 = 0, y0 = 0): MobSheet {
  const textures: Texture[] = [];
  for (let i = 0; i < meta.flash + meta.frames; i++) {
    const x = x0 + (i % meta.cols) * meta.frameW;
    const y = y0 + Math.floor(i / meta.cols) * meta.frameH;
    textures.push(new Texture({ source: sheet.source, frame: new Rectangle(x, y, meta.frameW, meta.frameH) }));
  }
  return { meta, textures };
}

const SQUASH_TIME = 0.15;
const FLASH_TIME = 0.09;
export class MobView {
  readonly sprite: Sprite;
  private readonly shadow: Sprite;
  private readonly scale: number;
  private readonly phase = Math.random();
  private time = 0;
  private squash = 0;
  private flash = 0;
  private flip = 1;
  private frame = 0;

  constructor(
    private readonly look: MobLook,
    layer: Container,
  ) {
    const { meta, textures } = look.sheet;
    this.scale = look.height / meta.height;
    this.sprite = new Sprite(textures[0]);
    this.sprite.anchor.set(meta.anchor[0] / meta.frameW, meta.anchor[1] / meta.frameH);
    this.shadow = makeShadow(look.shadowTex, ...look.shadow);
    layer.addChild(this.shadow, this.sprite);
  }

  /** A hit that does not kill: a white flash and a short squash. */
  flinch(): void {
    this.squash = SQUASH_TIME;
    this.flash = FLASH_TIME;
  }

  /** The current frame, plain or as its white flash copy. */
  frameTexture(white: boolean): Texture {
    const { meta, textures } = this.look.sheet;
    return textures[this.frame + (white ? meta.flash : 0)];
  }

  /** `speed` scales the cycle, e.g. slower while standing. `faceX` is the side to look at. */
  update(dt: number, x: number, y: number, faceX: number, speed = 1): void {
    const { meta, textures } = this.look.sheet;
    this.time += dt * speed;
    const f = (this.frame = frameAt(meta, this.time, this.phase));
    this.flash = Math.max(0, this.flash - dt);
    this.sprite.texture = textures[f + (this.flash > 0 ? meta.flash : 0)];
    if (faceX !== 0) this.flip = (faceX < 0) === this.look.facesLeft ? 1 : -1;
    let sx = this.scale;
    let sy = this.scale;
    if (this.squash > 0) {
      this.squash = Math.max(0, this.squash - dt);
      const k = Math.sin((this.squash / SQUASH_TIME) * Math.PI) * 0.25;
      sx *= 1 + k;
      sy *= 1 - k;
    }
    this.sprite.scale.set(sx * this.flip, sy);
    this.sprite.position.set(x, y);
    this.sprite.zIndex = y;
    // the shadow shrinks while the mob is in the air
    const air = (meta.lift[f] ?? 0) / meta.height;
    this.shadow.position.set(x, y);
    sizeShadow(this.shadow, ...this.look.shadow, 1 - air * 1.5);
  }
}

interface Body {
  c: Corpse;
  sprite: Sprite;
  plain: Texture;
}

/** Knocked-down bodies, each a copy of the mob's current frame. */
export class Corpses {
  private readonly live: Body[] = [];
  private readonly free: Body[] = [];

  constructor(private readonly layer: Container) {}

  spawn(from: MobView, dirX: number, dirY: number): void {
    let b = this.free.pop();
    if (!b) {
      b = { c: {} as Corpse, sprite: new Sprite(), plain: Texture.EMPTY };
      this.layer.addChild(b.sprite);
    }
    const { sprite } = b;
    sprite.visible = true;
    sprite.texture = from.frameTexture(true);
    sprite.anchor.copyFrom(from.sprite.anchor);
    sprite.scale.copyFrom(from.sprite.scale);
    const { x, y } = from.sprite.position;
    knockDown(x, y, dirX, dirY, 380, b.c);
    b.plain = from.frameTexture(false);
    this.live.push(b);
  }

  update(dt: number): void {
    const live = this.live;
    for (let i = live.length - 1; i >= 0; i--) {
      const { c, sprite, plain } = live[i];
      if (!stepCorpse(c, dt)) {
        sprite.visible = false;
        this.free.push(live[i]);
        live[i] = live[live.length - 1];
        live.pop();
        continue;
      }
      sprite.position.set(c.x, c.y - c.z);
      sprite.rotation = c.tilt;
      if (c.age > FLASH_TIME) sprite.texture = plain;
      sprite.alpha = corpseAlpha(c);
      sprite.zIndex = c.y;
    }
  }
}
