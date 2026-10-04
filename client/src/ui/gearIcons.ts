import { Container, Graphics } from 'pixi.js';
import { isRelic, type ItemId } from '../meta/gear';
import { iconSprite, type IconSheet } from './buildBar';
import { COLORS } from './widgets';

// Gear icons. Relics use the icon sheet; the five slot items are drawn here in the sticker
// style (flat fills, thick dark outline) as placeholders until they get painted icons. Drawn
// in a 100-unit box around the origin, then scaled to `size`.

const OUT = { color: COLORS.outline, width: 7, join: 'round' as const };

function pendant(g: Graphics): void {
  g.moveTo(-30, -48).lineTo(0, -12).lineTo(30, -48).stroke({ color: 0x6b3a1e, width: 7, cap: 'round' });
  g.circle(0, 12, 34).fill(0x4fd1a0).stroke(OUT);
  g.circle(0, 12, 11).fill(COLORS.panelLocked).stroke({ ...OUT, width: 5 });
  g.circle(-12, 0, 5).fill(0xa8f0d4);
}

function bracers(g: Graphics): void {
  for (const x of [-22, 22]) {
    g.roundRect(x - 18, -40, 36, 80, 10).fill(0x8a949c).stroke(OUT);
    g.rect(x - 18, -18, 36, 9).fill(0x5d666e);
    g.rect(x - 18, 10, 36, 9).fill(0x5d666e);
    g.circle(x, -30, 4).fill(0xd8dde0);
  }
}

function robe(g: Graphics): void {
  g.poly([-22, -44, 22, -44, 48, -20, 40, -6, 28, -14, 34, 46, -34, 46, -28, -14, -40, -6, -48, -20]).fill(COLORS.saffron).stroke(OUT);
  g.poly([-14, -44, 0, -20, 14, -44]).fill(0x8f9a94).stroke({ ...OUT, width: 5 });
  g.moveTo(-26, 4).lineTo(26, 24).stroke({ color: 0xb06a10, width: 8 });
}

function sash(g: Graphics): void {
  g.roundRect(-46, -12, 92, 24, 10).fill(0xc0392b).stroke(OUT);
  g.poly([-4, 0, -30, -30, -34, 2]).fill(0xd8483a).stroke(OUT);
  g.poly([4, 0, 30, -30, 34, 2]).fill(0xd8483a).stroke(OUT);
  g.poly([-6, 6, -20, 46, -6, 42]).fill(0xc0392b).stroke(OUT);
  g.poly([6, 6, 20, 46, 6, 42]).fill(0xc0392b).stroke(OUT);
  g.circle(0, 0, 11).fill(COLORS.saffron).stroke({ ...OUT, width: 5 });
}

function sandals(g: Graphics, c: Container): void {
  for (const [x, r] of [[-20, -0.15], [20, 0.15]] as const) {
    const s = new Graphics();
    s.ellipse(0, 4, 17, 42).fill(0xd9b46a).stroke(OUT);
    s.moveTo(-15, -14).lineTo(15, -14).stroke({ color: 0x6b3a1e, width: 7 });
    s.moveTo(-15, 12).lineTo(0, 0).lineTo(15, 12).stroke({ color: 0x6b3a1e, width: 6 });
    s.position.set(x, 0);
    s.rotation = r;
    c.addChild(s);
  }
  g.visible = false;
}

const DRAW: Record<Exclude<ItemId, 'ball' | 'staff' | 'fish' | 'beads' | 'bowl'>, (g: Graphics, c: Container) => void> = {
  pendant, bracers, robe, sash, sandals,
};

export function gearIcon(icons: IconSheet, item: ItemId, size: number): Container | null {
  if (isRelic(item)) return iconSprite(icons, item, size);
  const c = new Container();
  const g = new Graphics();
  c.addChild(g);
  DRAW[item](g, c);
  c.scale.set(size / 110);
  return c;
}
