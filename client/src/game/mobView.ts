import { Container, Rectangle, Sprite, Texture } from 'pixi.js';
import { faceSide } from './camera';
import { makeShadow, sizeShadow, type ShadowBatch } from './shadow';
import { THREAT_TIME, threatAlpha } from './threat';
import { SETTLE, corpseAlpha, frameAt, greyTint, holdsStill, knockDown, stepCorpse, stepPace, type Corpse, type SheetMeta } from './mobAnim';

// Draws mobs from their baked sheets: a looping animated sprite over a ground shadow that
// stays on the ground while the sprite hops. Corpses are separate sprites, so a knocked-down
// mob can respawn at once while its body tumbles away; spent corpse sprites are reused.

/** A mob turns only once the hero is this far to its other side, so it does not flicker. */
const FACE_DEAD = 30;
/** Draw order follows y only once it moves this far, so jostling neighbours do not swap. */
const Z_DEAD = 6;
/** Seconds the drawn position takes to follow the simulated one, filtering crowd jostle. */
const DRAW_EASE = 0.08;
/** Farther than this and the drawn position jumps (a respawn). */
const DRAW_SNAP = 120;
/** Brightness steps of the crowd shading (shade), too fine to see on a moving mob. */
const SHADE_STEPS = 48;
/** A mob standing in a jam breathes: this much stretch, this many breaths per second. */
const BREATH = 0.025;
const BREATH_RATE = 0.45;

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
  /** A multiply tint, e.g. chapter 3's frosted jiangshi. */
  tint?: number;
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

/** How fast a knocked-down body flies off along the blow, world units per second. */
const KNOCK_SPEED = 640;
const SQUASH_TIME = 0.15;
const FLASH_TIME = 0.09;
/** Seconds a struck mob's drawing holds still (hit-stop); the sim keeps moving it meanwhile. */
export const HOLD_TIME = 0.05;
export class MobView {
  readonly sprite: Sprite;
  private readonly shadow: Sprite | null;
  private readonly scale: number;
  private readonly phase = Math.random();
  private time = 0;
  /** Share of the walking speed the mob really moves at, eased. */
  private pace = 1;
  private lastX = NaN;
  private lastY = 0;
  private squash = 0;
  private squashLen = SQUASH_TIME;
  private flash = 0;
  /** Seconds left as a threat (threat.ts): no white flash, and the horde rims it red. */
  private threat = 0;
  private hold = 0;
  /** 1 while looking right, -1 left. */
  private side = 1;
  private frame = 0;
  private drawX = NaN;
  private idle = 0;
  private drawY = 0;
  /** Own brightness, so a crowd of one type is not a uniform stamp. */
  private readonly tone: number;
  private base = 0xffffff;
  /** The tint last given the sprite: Pixi converts the colour (and allocates) on every set. */
  private shown = 0xffffff;
  /** A fixed draw order (over the horde), instead of following y. */
  private z = NaN;
  /** Extra size, e.g. a toad swelling before it spits (0 for none). */
  swell = 0;

  /**
   * `calm` gives each mob a slightly different size and brightness, and draws it easing after
   * its simulated position so crowd jostle does not show. The shadow is drawn into `shadows` when
   * given (the horde's one batch of them), else as a sprite in `layer` under the mob's.
   */
  constructor(
    private readonly look: MobLook,
    layer: Container,
    private readonly calm = false,
    private readonly shadows?: ShadowBatch,
  ) {
    const vary = calm;
    const { meta, textures } = look.sheet;
    this.scale = (look.height / meta.height) * (vary ? 0.94 + Math.random() * 0.12 : 1);
    this.tone = vary ? 0.9 + Math.random() * 0.1 : 1;
    this.sprite = new Sprite(textures[0]);
    this.sprite.anchor.set(meta.anchor[0] / meta.frameW, meta.anchor[1] / meta.frameH);
    this.shadow = shadows ? null : layer.addChild(makeShadow(look.shadowTex, ...look.shadow));
    layer.addChild(this.sprite);
  }

  /** Hides a mob that is not in the sim right now (an elite that has not come yet, or fell). */
  setVisible(v: boolean): void {
    this.sprite.visible = v;
    if (this.shadow) this.shadow.visible = v;
  }

  /** Draws the mob at a fixed order instead of by its y (the elite, over the horde). */
  pinZ(z: number): void {
    this.z = this.sprite.zIndex = z;
  }

  /** A colour the mob is multiplied by, under any shading. */
  tint(color: number): void {
    this.base = this.shown = this.sprite.tint = color;
  }

  /** Brightness from the mob's place in the crowd (see depthShade), times its own tone. */
  shade(k: number): void {
    // in SHADE_STEPS steps, so a mob walking in does not need a new tint every frame
    const tint = greyTint(Math.round(k * this.tone * SHADE_STEPS) / SHADE_STEPS, this.base);
    if (tint !== this.shown) this.sprite.tint = this.shown = tint;
  }

  /**
   * A hit that does not kill: a white flash, a short squash, and for `hold` seconds the drawing
   * freezes its walk frame and place (0 for none, e.g. late in a run), then catches up; the flash
   * and squash last `slow` times as long (the corgi's bomb, spells.ts BOOM_SLOW).
   */
  flinch(hold = HOLD_TIME, slow = 1): void {
    this.squash = this.squashLen = SQUASH_TIME * slow;
    this.flash = FLASH_TIME * slow;
    this.hold = Math.max(this.hold, hold);
  }

  /** The mob just hurt the hero, or rose beside him: it stands out for a while. */
  threaten(): void {
    this.threat = THREAT_TIME;
  }

  /** The red rim's alpha, 0 for none. */
  get rim(): number {
    return threatAlpha(this.threat);
  }

  /** True while the drawing holds still after a flinch, so things drawn with it can hold too. */
  get held(): boolean {
    return this.hold > 0;
  }

  /** The current frame, plain or as its white flash copy. */
  frameTexture(white: boolean): Texture {
    const { meta, textures } = this.look.sheet;
    return textures[this.frame + (white ? meta.flash : 0)];
  }

  /**
   * `speed` scales the cycle, e.g. slower while standing. `faceX` is the side to look at. With
   * a `walk` speed, a mob jammed in the crowd lands and stands instead of hopping in place,
   * and with `sway` it breathes gently while it stands.
   */
  update(dt: number, x: number, y: number, faceX: number, speed = 1, walk = 0, sway = false): void {
    const { meta, textures } = this.look.sheet;
    if (walk > 0 && dt > 0) {
      const moved = Number.isNaN(this.lastX) ? walk * dt : Math.sqrt((x - this.lastX) ** 2 + (y - this.lastY) ** 2);
      this.pace = stepPace(this.pace, moved, walk, dt);
      this.lastX = x;
      this.lastY = y;
    }
    const held = this.hold > 0 && !Number.isNaN(this.drawX);
    this.hold = Math.max(0, this.hold - dt);
    if (!held && !(walk > 0 && holdsStill(meta, this.frame, this.pace))) this.time += dt * speed;
    const f = (this.frame = frameAt(meta, this.time, this.phase));
    this.flash = Math.max(0, this.flash - dt);
    this.threat = Math.max(0, this.threat - dt);
    // a threat keeps its colours under the spells' hits, so it does not melt into the white crowd
    this.sprite.texture = textures[f + (this.flash > 0 && this.threat <= 0 ? meta.flash : 0)];
    if (!held) this.side = faceSide(this.side, faceX, FACE_DEAD);
    const flip = (this.side < 0) === this.look.facesLeft ? 1 : -1;
    let sx = this.scale * (1 + this.swell);
    let sy = this.scale * (1 + this.swell);
    if (this.squash > 0) {
      this.squash = Math.max(0, this.squash - dt);
      const k = Math.sin((this.squash / this.squashLen) * Math.PI) * 0.25;
      sx *= 1 + k;
      sy *= 1 - k;
    }
    if (sway && walk > 0) {
      this.idle += dt;
      const still = Math.max(0, 1 - this.pace / SETTLE);
      const b = Math.sin((this.idle * BREATH_RATE + this.phase) * Math.PI * 2) * BREATH * still;
      sx *= 1 - b * 0.5;
      sy *= 1 + b;
    }
    this.sprite.scale.set(sx * flip, sy);
    if (held) {
      x = this.drawX;
      y = this.drawY;
    } else if (this.calm && !Number.isNaN(this.drawX) && (x - this.drawX) ** 2 + (y - this.drawY) ** 2 < DRAW_SNAP ** 2) {
      const k = 1 - Math.exp(-dt / DRAW_EASE);
      x = this.drawX += (x - this.drawX) * k;
      y = this.drawY += (y - this.drawY) * k;
    } else {
      this.drawX = x;
      this.drawY = y;
    }
    this.sprite.position.set(x, y);
    if (Number.isNaN(this.z) && Math.abs(y - this.sprite.zIndex) > Z_DEAD) this.sprite.zIndex = y;
    // the shadow shrinks while the mob is in the air
    const air = (meta.lift[f] ?? 0) / meta.height;
    const [rx, ry] = this.look.shadow;
    const k = 1 - air * 1.5;
    if (this.shadows) {
      if (this.sprite.visible) this.shadows.add(x, y, rx * k, ry * k);
    }
    else if (this.shadow) {
      this.shadow.position.set(x, y);
      sizeShadow(this.shadow, rx, ry, k);
    }
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
    knockDown(x, y, dirX, dirY, KNOCK_SPEED, b.c);
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
