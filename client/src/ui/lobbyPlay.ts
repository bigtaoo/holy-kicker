import { Container, Graphics } from 'pixi.js';
import { THEME } from '../theme';
import { sheenAt } from './playSheen';
import { LIP, button, buttonLabel, shade } from './widgets';

// The Play tab's PLAY button (docs/design.md "Lobby layout"): the one loud thing on the lobby.
// The hero wears flat saffron, so PLAY is glossy instead: gold at the top running to deep orange,
// a white gloss line, its word outlined, and a band of light sweeping across it now and then.

/** Top and bottom of the face's gradient. */
const GOLD = THEME === 'corgi' ? [0xffd64a, 0xf06a14] : [0xffd84a, 0xec6c12];
const STRIPS = 24;

export interface PlayButton {
  view: Container;
  update(dt: number): void;
}

export function playButton(text: string, w: number, h: number, onTap: () => void): PlayButton {
  const view = button(text, w, h, onTap, { size: 96, fill: GOLD[1] });
  const top = view.children[1] as Container;
  // the face's shape, as buttonFace draws it
  const fx = -w / 2 + 4;
  const fy = -h / 2 + 4 + LIP / 2;
  const fw = w - 8;
  const fh = h - 8 - LIP;
  const r = Math.max(4, Math.min(28, h / 3) - 4);
  const gloss = new Container();
  const shape = new Graphics().roundRect(fx, fy, fw, fh, r).fill(0xffffff);
  const paint = new Graphics();
  for (let i = 0; i < STRIPS; i++) {
    paint.rect(fx, fy + (fh * i) / STRIPS, fw, fh / STRIPS + 1).fill(mix(GOLD[0], GOLD[1], i / (STRIPS - 1)));
  }
  paint.roundRect(fx + 18, fy + 10, fw - 36, 14, 7).fill({ color: 0xffffff, alpha: 0.55 });
  const band = new Graphics().poly([0, 0, 70, 0, 20, fh, -50, fh]).fill({ color: 0xffffff, alpha: 0.35 });
  band.y = fy;
  band.visible = false;
  gloss.addChild(paint, band, shape);
  gloss.mask = shape;
  top.addChildAt(gloss, 1);
  const word = buttonLabel(view);
  word.style.stroke = { color: shade(GOLD[1], -0.55), width: 12, join: 'round' };
  let clock = 0;
  return {
    view,
    update(dt) {
      clock += dt;
      const at = sheenAt(clock);
      band.visible = at !== null;
      if (at !== null) band.x = fx + at * fw;
    },
  };
}

/** a..b by k in 0..1, channel by channel. */
function mix(a: number, b: number, k: number): number {
  const ch = (s: number) => Math.round(((a >> s) & 0xff) + (((b >> s) & 0xff) - ((a >> s) & 0xff)) * k) << s;
  return ch(16) | ch(8) | ch(0);
}
