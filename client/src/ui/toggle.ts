import { Container, Graphics } from 'pixi.js';
import { COLORS, playTap } from './widgets';

/** An on/off switch, `w` wide: a pill with its knob at the right and saffron when on. */
export function toggle(on: boolean, w: number, set: (on: boolean) => void): Container {
  const c = new Container();
  const pw = 200;
  const ph = 96;
  const knob = ph / 2 - 12;
  c.addChild(new Graphics()
    .roundRect(-pw / 2, -ph / 2, pw, ph, ph / 2)
    .fill(on ? COLORS.saffron : COLORS.panelLocked)
    .stroke({ color: COLORS.outline, width: 6 })
    .circle(on ? pw / 2 - ph / 2 : -pw / 2 + ph / 2, 0, knob)
    .fill(on ? COLORS.text : COLORS.dim)
    .stroke({ color: COLORS.outline, width: 6 }));
  // the whole half row is the hit area
  c.hitArea = { contains: (px: number, py: number) => Math.abs(px) <= w / 2 && Math.abs(py) <= 60 };
  c.eventMode = 'static';
  c.cursor = 'pointer';
  c.on('pointertap', () => {
    playTap();
    set(!on);
  });
  return c;
}
