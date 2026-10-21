import { Container, Graphics } from 'pixi.js';
import { RELIC_IDS, type RelicId } from '@hk/engine';
import { t } from '../i18n';
import { unlockedRelics } from '../meta/progress';
import type { SaveData } from '../meta/save';
import { THEME } from '../theme';
import { iconSprite, lockIcon, type IconSheet } from './buildBar';
import { COLORS, button, label } from './widgets';

// The Play tab's pieces around the chapter card (LobbyScreen.playTab): the normal / hard
// switch over it and the relic row at the monk's feet.

const RELIC_R = 60;

/**
 * The chapter card's colours: a light card on the bright courtyard, warm parchment for the monk
 * and spacesuit white for the corgi, its words outlined white (`title`) or plain and dark (`quiet`).
 */
export const CARD = THEME === 'corgi'
  ? { fill: 0xe6edf1, quiet: 0x55636e }
  : { fill: 0xf2e2bf, quiet: 0x7a6248 };
/** The outline that keeps a light word readable on the light card. */
export const CARD_STROKE = { stroke: { color: COLORS.outline, width: 10 } };
/** The relic row's height: its name over the badges. */
export const RELIC_ROW_H = 250;

/** Normal and hard side by side, the shown one lit. */
export function trackSwitch(save: SaveData, choose: (hard: boolean) => void): Container {
  const row = new Container();
  ([[false, 'lobby.normal'], [true, 'lobby.hard']] as const).forEach(([hard, key], i) => {
    const on = save.hard === hard;
    const b = button(t(key), 300, 90, () => {
      if (!on) choose(hard);
    }, { fill: on ? (hard ? COLORS.danger : COLORS.saffron) : COLORS.panelLocked, size: 52, textFill: on ? COLORS.text : COLORS.dim });
    b.x = (i - 0.5) * 320;
    row.addChild(b);
  });
  return row;
}

/**
 * The relic for the next run, top at 0: its name, then one badge per relic (locked ones dimmed).
 */
export function relicRow(save: SaveData, icons: IconSheet, select: (id: RelicId) => void, toast: (text: string) => void): Container {
  const row = new Container();
  const chosen = save.relic;
  // straight on the courtyard, outlined like the HUD's words, so the picture shows between the badges
  const head = label(`${t('lobby.relic')}: ${t(`relic.${chosen}.name`)}`, 48, COLORS.text, { stroke: { color: COLORS.outline, width: 10 } });
  head.y = 48;
  const open = unlockedRelics(save);
  row.addChild(head);
  RELIC_IDS.forEach((id, i) => {
    const unlocked = open.includes(id);
    const c = new Container();
    c.position.set((i - (RELIC_IDS.length - 1) / 2) * (RELIC_R * 2 + 40), 160);
    c.addChild(new Graphics().circle(0, 0, RELIC_R).fill(unlocked ? COLORS.panel : COLORS.panelLocked)
      .stroke({ color: id === chosen ? COLORS.saffron : COLORS.outline, width: id === chosen ? 10 : 6 }));
    const icon = iconSprite(icons, id, RELIC_R * 1.5);
    if (icon) {
      if (!unlocked) icon.alpha = 0.35;
      c.addChild(icon);
    }
    if (!unlocked) {
      const l = lockIcon(icons, 48);
      l.position.set(RELIC_R * 0.6, RELIC_R * 0.6);
      c.addChild(l);
    }
    c.eventMode = 'static';
    c.cursor = 'pointer';
    c.on('pointertap', () => {
      if (!unlocked) return toast(t('tab.unlockChapter', { n: RELIC_IDS.indexOf(id) }));
      if (id !== chosen) select(id);
    });
    row.addChild(c);
  });
  return row;
}
