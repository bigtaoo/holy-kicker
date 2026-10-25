import { Container, Graphics } from 'pixi.js';
import { TaoActor, type TaoAsset } from '../game/tao/TaoActor';
import { THEME } from '../theme';
import { actDrift, breath, hop, speckAt, type DriftStyle } from './lobbyAmbient';
import { COLORS } from './widgets';

// What moves in the lobby's courtyard (docs/design.md "Lobby layout"): the chosen monk standing
// in the middle of it, breathing in his idle clip and kicking (the corgi: firing) when tapped,
// and specks drifting over the picture: maple leaves for the monk, motes of light for the corgi.

/** The clips a tap plays, in turn; each theme's rig has its own. */
/** The spotlight's colour: warm sun for the monk, a cooler white for the corgi. */
const LIGHT = THEME === 'corgi' ? 0xf4fbff : 0xfff3d0;

const TAP_CLIPS = THEME === 'corgi' ? ['fire_r', 'fire_l'] : ['kick'];

export class LobbyFigure {
  readonly view = new Container();
  private readonly actor: TaoActor;
  private readonly body = new Container();
  private clock = 0;
  private hopAt = -1;
  private taps = 0;

  /** `height` UI units tall, feet at the view's origin. */
  constructor(rig: TaoAsset, height: number) {
    this.view.label = 'lobbyFigure';
    this.actor = new TaoActor(rig);
    const s = height / this.actor.height;
    // the rig is drawn facing left; he faces the player's right, towards PLAY's side of the card
    this.actor.view.scale.set(-s, s);
    this.actor.play('idle');
    this.body.addChild(this.actor.view);
    this.view.addChild(spotlight(height));
    const shadow = new Graphics().ellipse(0, 0, height * 0.32, height * 0.07).fill({ color: COLORS.outline, alpha: 0.3 });
    this.view.addChild(shadow, this.body);
    // the tap area: his whole figure, a little wider than the drawing
    const hit = new Graphics().rect(-height * 0.35, -height, height * 0.7, height).fill({ color: 0xffffff, alpha: 0.001 });
    this.view.addChild(hit);
    this.view.eventMode = 'static';
    this.view.cursor = 'pointer';
    this.view.on('pointertap', () => this.tap());
  }

  private tap(): void {
    const clip = TAP_CLIPS[this.taps++ % TAP_CLIPS.length];
    this.actor.play(clip, true);
    this.hopAt = this.clock;
  }

  update(dt: number): void {
    this.clock += dt;
    if (this.actor.finished) this.actor.play('idle');
    this.actor.update(dt);
    const [sx, sy] = breath(this.clock);
    this.body.scale.set(sx, sy);
    this.body.y = -hop(this.hopAt < 0 ? -1 : this.clock - this.hopAt);
  }
}

/** A soft pool of light behind a figure `height` tall, feet at 0: the eye's resting place. */
function spotlight(height: number): Graphics {
  const g = new Graphics();
  const rings = 28;
  for (let i = 0; i < rings; i++) {
    const k = 1 - i / rings;
    g.ellipse(0, -height * 0.42, height * 0.7 * k, height * 0.62 * k).fill({ color: LIGHT, alpha: 0.03 });
  }
  return g;
}

/** The drifting specks over a w x h box. */
export class LobbyDrift {
  readonly view = new Container();
  private readonly style: DriftStyle;
  private readonly specks: Graphics[] = [];
  private clock = 0;

  /** `cleared`: the chapters cleared, whose act picks the specks. */
  constructor(private readonly w: number, private readonly h: number, cleared: number) {
    this.style = actDrift(THEME === 'corgi', cleared);
    for (let i = 0; i < this.style.count; i++) {
      const s = speckAt(this.style, i, 0, w, h);
      const g = SHAPES[this.style.shape](s.color);
      g.scale.set(s.size / 20);
      this.specks.push(g);
      this.view.addChild(g);
    }
    this.place();
  }

  update(dt: number): void {
    this.clock += dt;
    this.place();
  }

  private place(): void {
    this.specks.forEach((g, i) => {
      const s = speckAt(this.style, i, this.clock, this.w, this.h);
      g.position.set(s.x, s.y);
      g.rotation = s.rotation;
      g.alpha = s.alpha;
    });
  }
}

/** A maple-ish leaf 20 units long, sticker-outlined. */
function leaf(color: number): Graphics {
  return new Graphics()
    .moveTo(0, -12).quadraticCurveTo(10, -4, 0, 12).quadraticCurveTo(-10, -4, 0, -12).closePath()
    .fill(color).stroke({ color: COLORS.outline, width: 2.5 })
    .moveTo(0, -8).lineTo(0, 9).stroke({ color: COLORS.outline, width: 1.5 });
}

/** A soft dot of light, 20 units across. */
function mote(color: number): Graphics {
  return new Graphics().circle(0, 0, 10).fill({ color, alpha: 0.35 }).circle(0, 0, 5.5).fill(color).stroke({ color: COLORS.outline, width: 1.5, alpha: 0.6 });
}

/** A six-armed snowflake 20 units across: a soft outline under each arm, then the arm. */
function flake(color: number): Graphics {
  const g = new Graphics();
  const arms = (style: { color: number; width: number; alpha?: number }) => {
    for (let i = 0; i < 3; i++) {
      const a = (i * Math.PI) / 3;
      g.moveTo(Math.cos(a) * 10, Math.sin(a) * 10).lineTo(-Math.cos(a) * 10, -Math.sin(a) * 10);
    }
    g.stroke({ ...style, cap: 'round' });
  };
  arms({ color: COLORS.outline, width: 6, alpha: 0.35 });
  arms({ color, width: 3.5 });
  return g;
}

const SHAPES: Record<DriftStyle['shape'], (color: number) => Graphics> = { leaf, mote, flake };
