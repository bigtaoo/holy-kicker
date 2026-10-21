import { Container, Graphics } from 'pixi.js';
import { COLORS } from './widgets';

// A chapter's stars (progress.ts runStars), drawn as three sticker stars: the won ones in the
// highlight gold, the rest dark hollows, so the row always shows how many there are to get.

/** Three stars centred on 0, `won` of them lit; `size` is one star's width. */
export function starRow(won: number, size: number): Container {
  const row = new Container();
  for (let i = 0; i < 3; i++) {
    const lit = i < won;
    const r = size / 2;
    const g = new Graphics()
      .star(0, 0, 5, r, r * 0.48, 0)
      .fill(lit ? COLORS.gold : { color: 0x000000, alpha: 0.2 })
      .stroke({ color: COLORS.outline, width: Math.max(4, size / 12), join: 'round' });
    g.x = (i - 1) * size * 1.1;
    row.addChild(g);
  }
  return row;
}
