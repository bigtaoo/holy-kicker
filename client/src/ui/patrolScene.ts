import { Container, Graphics, Sprite, TilingSprite, type Texture } from 'pixi.js';
import { t } from '../i18n';
import { TaoActor, type TaoAsset } from '../game/tao/TaoActor';
import type { IconSheet } from './buildBar';
import { FAR_SHARE, FLY_TIME, WALK_SPEED, arc, coinStep, dropFlies, patrolPose, propX, roadProps, sackScale, settle, stepPace, wrap, type PatrolPose } from './patrolMotion';
import { COLORS, fit, label } from './widgets';

// The patrol panel's window on the road (art in art/monk/ui/patrol): the chosen monk walks
// a mountain road while the patrol piles up, finds coins on the way and drops what he finds
// into a sack that fills with the hours; once the patrol is full he stops and waits.

/** The far hills (patrol_far.jpg) and the roadside props (patrol_props.{png,json}). */
export interface PatrolArt {
  far: Texture;
  props: IconSheet;
}

const ROAD_H = 78;
/** The grass between the hills and the road, where the props stand. */
const VERGE_H = 30;
const HERO_H = 180;
const PROP_H = 150;
/** One loop of road, with a prop every PROP_GAP on average. */
const ROAD_LEN = 3600;
const PROP_GAP = 330;
const SACK = 96;
const BUBBLE_Y = 70;
/** The gear icons that fly into the sack, in turn. */
const DROPS = ['robe', 'sash', 'sandals', 'bracers', 'pendant'];
const GRASS = 0x6f9a55;
const ROAD = 0xc9a66b;
const ROAD_SHADE = 0xa9864f;

interface Flyer {
  sprite: Sprite;
  from: { x: number; y: number };
  time: number;
}

export class PatrolScene {
  readonly view = new Container();
  private readonly far: TilingSprite;
  private readonly road = new Container();
  private readonly back = new Container();
  private readonly marks = new Graphics();
  private readonly actor: TaoActor;
  private readonly sack: Container;
  private readonly bubble: Container;
  private readonly flyers: Flyer[] = [];
  private readonly props: { sprite: Sprite; x: number }[] = [];
  private pose: PatrolPose = 'walk';
  private pace = 1;
  private travel = 0;
  private coinClock = 0;
  private drops = -1;
  /** The sack's resting size; a coin landing in it makes it bounce up from there. */
  private sackSize = 1;
  private bob = 0;

  constructor(private readonly w: number, private readonly h: number, rig: TaoAsset, art: PatrolArt | null, private readonly icons: IconSheet) {
    const top = h - ROAD_H;
    this.far = new TilingSprite({ texture: art?.far, width: w, height: h });
    if (art) this.far.tileScale.set(h / art.far.height);
    else this.far.tint = 0x9ccfd6;
    this.road.addChild(new Graphics()
      .rect(0, top - VERGE_H, w, VERGE_H).fill(GRASS)
      .rect(0, top - VERGE_H - 3, w, 6).fill(COLORS.outline)
      .rect(0, top, w, ROAD_H).fill(ROAD)
      .rect(0, top + ROAD_H * 0.62, w, ROAD_H * 0.38).fill(ROAD_SHADE)
      .rect(0, top - 3, w, 6).fill(COLORS.outline), this.marks);
    if (art) {
      for (const p of roadProps([...art.props.keys()], ROAD_LEN, PROP_GAP)) {
        const tex = art.props.get(p.kind)!;
        const sprite = new Sprite(tex);
        sprite.anchor.set(0.5, 1);
        const s = (PROP_H * p.scale) / tex.height;
        sprite.scale.set(p.flip ? -s : s, s);
        sprite.y = top - 4;
        this.back.addChild(sprite);
        this.props.push({ sprite, x: p.x });
      }
    }
    this.actor = new TaoActor(rig);
    const s = HERO_H / this.actor.height;
    // the rig is drawn facing left; he walks right
    this.actor.view.scale.set(-s, s);
    this.actor.view.position.set(w * 0.4, top + ROAD_H * 0.55);
    this.actor.play('run');

    this.sack = new Container();
    this.sack.position.set(SACK * 0.75, SACK * 0.7);
    const pouch = new Sprite(icons.get('shop'));
    pouch.anchor.set(0.5);
    if (pouch.texture.width > 1) pouch.scale.set(SACK / Math.max(pouch.texture.width, pouch.texture.height));
    this.sack.addChild(pouch);

    this.bubble = new Container();
    const text = fit(label(t('patrol.full'), 40, COLORS.outline), 220);
    const bw = text.width + 50;
    this.bubble.addChild(new Graphics()
      .poly([-bw / 2 + 16, 10, -bw / 2 + 40, 30, -bw / 2 - 24, 52]).fill(COLORS.text).stroke({ width: 6, color: COLORS.outline })
      .roundRect(-bw / 2, -36, bw, 72, 30).fill(COLORS.text).stroke({ width: 6, color: COLORS.outline }), text);
    // beside his head, pointing at it
    this.bubble.position.set(this.actor.view.x + bw / 2 + 70, BUBBLE_Y);
    this.bubble.visible = false;

    const mask = new Graphics().roundRect(0, 0, w, h, 24).fill(0xffffff);
    const frame = new Graphics().roundRect(0, 0, w, h, 24).stroke({ width: 8, color: COLORS.outline });
    this.view.addChild(this.far, this.road, this.back, this.actor.view, this.sack, this.bubble, mask, frame);
    this.view.mask = mask;
    this.view.pivot.set(w / 2, 0);
    this.place();
  }

  /** The patrol's hours and drops so far (called every second while the panel is up). */
  set(hours: number, capHours: number, drops: number): void {
    this.pose = patrolPose(hours, capHours);
    this.bubble.visible = this.pose === 'rest';
    this.sackSize = sackScale(hours, capHours);
    // a drop found since the last look flies in from the monk
    if (dropFlies(this.drops, drops)) this.fly(DROPS[drops % DROPS.length], this.head(), 64);
    this.drops = drops;
  }

  update(dt: number): void {
    this.pace = stepPace(this.pace, this.pose, dt);
    this.actor.play(this.pace > 0.3 ? 'run' : 'idle');
    this.actor.update(dt);
    this.travel += WALK_SPEED * this.pace * dt;
    this.far.tilePosition.x = -this.travel * FAR_SHARE;
    this.place();
    const coin = coinStep(this.coinClock, dt, this.pace);
    this.coinClock = coin.clock;
    if (coin.coin) this.fly('copper', { x: this.actor.view.x + 40, y: this.h - ROAD_H * 0.5 }, 44);
    this.bob += dt;
    this.bubble.y = BUBBLE_Y + Math.sin(this.bob * 3) * 4;
    for (let i = this.flyers.length - 1; i >= 0; i--) {
      const f = this.flyers[i];
      f.time += dt;
      const k = Math.min(1, f.time / FLY_TIME);
      const p = arc(f.from, this.sack.position, k, 120);
      f.sprite.position.set(p.x, p.y);
      if (k >= 1) {
        f.sprite.destroy();
        this.flyers.splice(i, 1);
        this.sack.scale.set(this.sack.scale.x * 1.12);
      }
    }
    // the sack settles back to its size after a landing makes it bounce
    this.sack.scale.set(settle(this.sack.scale.x, this.sackSize, dt));
  }

  /** Props, road marks and the far hills where the walk has taken them. */
  private place(): void {
    for (const p of this.props) p.sprite.x = propX(p.x, this.travel, ROAD_LEN, PROP_H);
    // pebbles and ruts every 120 units
    const top = this.h - ROAD_H;
    this.marks.clear();
    const shift = wrap(this.travel, 120);
    for (let x = -shift; x < this.w + 120; x += 120) {
      this.marks.ellipse(x + 20, top + 22, 12, 5).fill(ROAD_SHADE);
      this.marks.ellipse(x + 80, top + 40, 7, 4).fill(ROAD_SHADE);
    }
  }

  private head(): { x: number; y: number } {
    return { x: this.actor.view.x, y: this.actor.view.y - HERO_H };
  }

  private fly(icon: string, from: { x: number; y: number }, size: number): void {
    const tex = this.icons.get(icon);
    if (!tex) return;
    const sprite = new Sprite(tex);
    sprite.anchor.set(0.5);
    sprite.scale.set(size / Math.max(tex.width, tex.height));
    sprite.position.set(from.x, from.y);
    this.view.addChildAt(sprite, this.view.getChildIndex(this.sack) + 1);
    this.flyers.push({ sprite, from, time: 0 });
  }
}
