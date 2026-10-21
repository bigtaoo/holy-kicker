import { Container, Graphics } from 'pixi.js';
import { t } from '../i18n';
import type { Drop } from '../meta/gear';
import { iconSprite, type IconSheet } from './buildBar';
import { dropName, TIER_COLORS } from './gearText';
import { COLORS, fit, label, shade } from './widgets';

/** A tile's width and height, and the step between tiles in a row. */
export const GEAR_TILE = 124;
export const GEAR_TILE_STEP = 140;

/** The gear found, one framed icon per item and tier with a count, the best first. */
export function gearTiles(drops: readonly Drop[], icons: IconSheet): Container[] {
  const seen = new Map<string, { d: Drop; n: number }>();
  for (const d of [...drops].sort((a, b) => b.tier - a.tier)) {
    const key = `${d.tier}|${d.item}`;
    const e = seen.get(key);
    if (e) e.n++;
    else seen.set(key, { d, n: 1 });
  }
  return [...seen.values()].map(({ d, n }) => {
    const c = new Container();
    const color = TIER_COLORS[d.tier];
    const half = GEAR_TILE / 2;
    c.addChild(new Graphics().roundRect(-half, -half, GEAR_TILE, GEAR_TILE, 22).fill(shade(color, -0.55)).stroke({ color, width: 7 }));
    c.addChild(iconSprite(icons, d.item, 100) ?? fit(label(dropName(d), 24, color), 110));
    if (n > 1) {
      const k = label(t('gear.count', { n }), 34, COLORS.text, { stroke: { color: COLORS.outline, width: 6 } });
      k.anchor.set(1, 1);
      k.position.set(half - 4, half);
      c.addChild(k);
    }
    return c;
  });
}

/** `tiles` laid out centred in rows of at most `per`, the first row's centre at y 0; returns the rows' height. */
export function placeTiles(tiles: readonly Container[], per: number): number {
  tiles.forEach((tile, i) => {
    const row = Math.floor(i / per);
    const inRow = Math.min(per, tiles.length - row * per);
    tile.position.set(((i % per) - (inRow - 1) / 2) * GEAR_TILE_STEP, row * GEAR_TILE_STEP);
  });
  return tiles.length === 0 ? 0 : (Math.ceil(tiles.length / per) - 1) * GEAR_TILE_STEP + GEAR_TILE;
}
