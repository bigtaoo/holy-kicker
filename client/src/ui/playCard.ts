import { Container, Graphics } from 'pixi.js';
import type { RelicId } from '@hk/engine';
import { t } from '../i18n';
import { unlockedRelics } from '../meta/progress';
import type { SaveData } from '../meta/save';
import { THEME } from '../theme';
import { iconSprite, type IconSheet } from './buildBar';
import { COLORS, label, shade } from './widgets';

// The Play tab's pieces around the chapter card (LobbyScreen.playTab, chapterCard.ts): its
// colours and the relic row at the monk's feet.

const RELIC_R = 60;

/**
 * The chapter card's colours: warm parchment for the monk on the bright courtyard; for the corgi
 * the lobby's dark slate with saffron, like its top bar and buttons, as a light grey card looked
 * cold on the sand. Its title is outlined white, the other words plain: `quiet` the status, `accent`
 * the lines under it; `starOff` fills a star not won yet.
 */
export const CARD = THEME === 'corgi'
  ? { fill: COLORS.panel, quiet: COLORS.dim, accent: COLORS.saffron, starOff: shade(COLORS.panel, -0.45) }
  : { fill: 0xf2e2bf, quiet: 0x7a6248, accent: 0xb4501c, starOff: undefined };
/** The round badges on the courtyard (relics, the side rails): light, greyer when out of reach. */
export const BADGE = THEME === 'corgi' ? { fill: 0xe6edf1, off: 0xb4bec6 } : { fill: CARD.fill, off: 0xc4b496 };
/** The outline that keeps a light word readable on the light card. */
export const CARD_STROKE = { stroke: { color: COLORS.outline, width: 10 } };
/** The relic row's height: its name over the badges. */
export const RELIC_ROW_H = 250;

/**
 * The relic for the next run, top at 0: its name, then one badge per relic the player has.
 */
export function relicRow(save: SaveData, icons: IconSheet, select: (id: RelicId) => void): Container {
  const row = new Container();
  const chosen = save.relic;
  // straight on the courtyard, outlined like the HUD's words, so the picture shows between the badges
  const head = label(`${t('lobby.relic')}: ${t(`relic.${chosen}.name`)}`, 48, COLORS.text, { stroke: { color: COLORS.outline, width: 10 } });
  head.y = 48;
  const open = unlockedRelics(save);
  row.addChild(head);
  // only the relics the player has: the locked ones wait for the results screen that opens them
  open.forEach((id, i) => {
    const c = new Container();
    c.position.set((i - (open.length - 1) / 2) * (RELIC_R * 2 + 40), 160);
    c.addChild(new Graphics().circle(0, 0, RELIC_R).fill(BADGE.fill)
      .stroke({ color: id === chosen ? COLORS.saffron : COLORS.outline, width: id === chosen ? 10 : 6 }));
    const icon = iconSprite(icons, id, RELIC_R * 1.5);
    if (icon) c.addChild(icon);
    c.eventMode = 'static';
    c.cursor = 'pointer';
    c.on('pointertap', () => {
      if (id !== chosen) select(id);
    });
    row.addChild(c);
  });
  return row;
}
