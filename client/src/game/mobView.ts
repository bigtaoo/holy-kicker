import { Container, Graphics, GraphicsContext, Rectangle, Sprite, Texture } from 'pixi.js';
import { corpseAlpha, frameAt, knockDown, stepCorpse, type Corpse, type SheetMeta } from './mobAnim';

// Draws mobs from their baked sheets: a looping animated sprite over a ground shadow that
// stays on the ground while the sprite hops. Corpses are separate sprites, so a knocked-down
// mob can respawn at once while its body tumbles away.

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
}

export function sliceSheet(meta: SheetMeta, sheet: Texture): MobSheet {
  const textures: Texture[] = [];
  for (let i = 0; i < meta.frames; i++) {
    const x = (i % meta.cols) * meta.frameW;
    const y = Math.floor(i / meta.cols) * meta.frameH;
    textures.push(new Texture({ source: sheet.source, frame: new Rectangle(x, y, meta.frameW, meta.frameH) }));
  }
  return { meta, textures };
}

const SHADOW_ALPHA = 0.3;
const SQUASH_TIME = 0.15;
/** Shadow drawn under every standing figure; zIndex keeps them below all sprites. */
const SHADOW_Z = -1e6;

const shadowContexts = new Map<string, GraphicsContext>();
function shadowContext(rx: number, ry: number): GraphicsContext {
  const key = `${rx}x${ry}`;
  let ctx = shadowContexts.get(key);
  if (!ctx) {
    ctx = new GraphicsContext().ellipse(0, 0, rx, ry).fill({ color: 0x000000, alpha: SHADOW_ALPHA });
    shadowContexts.set(key, ctx);
  }
  return ctx;
}

export class MobView {
  readonly sprite: Sprite;
  private readonly shadow: Graphics;
  private readonly scale: number;
  private readonly phase = Math.random();
  private time = 0;
  private squash = 0;
  private flip = 1;

  constructor(
    private readonly look: MobLook,
    layer: Container,
  ) {
    const { meta, textures } = look.sheet;
    this.scale = look.height / meta.height;
    this.sprite = new Sprite(textures[0]);
    this.sprite.anchor.set(meta.anchor[0] / meta.frameW, meta.anchor[1] / meta.frameH);
    this.shadow = new Graphics(shadowContext(...look.shadow));
    this.shadow.zIndex = SHADOW_Z;
    layer.addChild(this.shadow, this.sprite);
  }

  /** A hit that does not kill: a short squash. */
  flinch(): void {
    this.squash = SQUASH_TIME;
  }

  /** `speed` scales the cycle, e.g. slower while standing. `faceX` is the side to look at. */
  update(dt: number, x: number, y: number, faceX: number, speed = 1): void {
    const { meta, textures } = this.look.sheet;
    this.time += dt * speed;
    const f = frameAt(meta, this.time, this.phase);
    this.sprite.texture = textures[f];
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
    this.shadow.scale.set(1 - air * 1.5);
  }
}

/** Knocked-down bodies, each a copy of the mob's current frame. */
export class Corpses {
  private readonly live: { c: Corpse; sprite: Sprite }[] = [];

  constructor(private readonly layer: Container) {}

  spawn(from: MobView, dirX: number, dirY: number): void {
    const sprite = new Sprite(from.sprite.texture);
    sprite.anchor.copyFrom(from.sprite.anchor);
    sprite.scale.copyFrom(from.sprite.scale);
    this.layer.addChild(sprite);
    const { x, y } = from.sprite.position;
    this.live.push({ c: knockDown(x, y, dirX, dirY, 380), sprite });
  }

  update(dt: number): void {
    for (let i = this.live.length - 1; i >= 0; i--) {
      const { c, sprite } = this.live[i];
      if (!stepCorpse(c, dt)) {
        sprite.destroy();
        this.live.splice(i, 1);
        continue;
      }
      sprite.position.set(c.x, c.y - c.z);
      sprite.rotation = c.tilt;
      sprite.alpha = corpseAlpha(c);
      sprite.zIndex = c.y;
    }
  }
}
