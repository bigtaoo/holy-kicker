import { Container } from 'pixi.js';
import { t } from '../i18n';
import { BALANCE } from '../meta/balance';
import type { ChapterCardDeps } from './chapterCard';
import { iconSprite } from './buildBar';
import { clockTenths } from './clearTime';
import { CARD, CARD_STROKE } from './playCard';
import { COLORS, fit, label, panel } from './widgets';

// The Play tab's card while the switch over it shows the arena (meta/arena.ts): its name, its best
// (wave and time) or that it is new, its Ranks, what it is in a line or two, and the copper a minute
// survived pays. No chests or stars: the arena pays only copper.

const INNER_W = 840;
const CARD_H = 420;

/** The arena's card, top at 0. */
export function arenaCard(d: ChapterCardDeps): Container {
  const { save } = d;
  const card = new Container();
  const back = panel(900, CARD_H, CARD.fill);
  back.y = CARD_H / 2;
  card.addChild(back);
  const title = fit(label(t('arena.title'), 64, COLORS.jade, CARD_STROKE), 640, 100);
  title.y = 70;
  const best = save.arenaBest;
  const status = label(best.waves > 0 ? t('arena.best', { wave: best.waves, time: clockTenths(best.tenths) }) : t('lobby.notPlayed'), 48, CARD.quiet);
  status.y = 155;
  card.addChild(title, status);
  const ranks = d.boards.arenaButton();
  if (ranks) {
    // where the chapter card has its Ranks, so the switch does not move it
    ranks.position.set(340, 160);
    // the best's line keeps clear of it
    fit(status, 560);
    card.addChild(ranks);
  }
  const about = label(t('arena.about'), 48, CARD.accent, { wordWrap: true, wordWrapWidth: INNER_W, breakWords: true, align: 'center' });
  about.y = 265;
  fit(about, INNER_W, 130);
  card.addChild(about);
  // the pay, after the copper icon
  const pay = new Container();
  const coin = iconSprite(d.icons, 'copper', 64);
  const text = fit(label(t('arena.perMinute', { n: BALANCE.arena.copperPerMinute }), 48, COLORS.copper, CARD_STROKE), INNER_W - 100);
  text.anchor.set(0, 0.5);
  text.x = 44;
  if (coin) pay.addChild(coin);
  pay.addChild(text);
  pay.pivot.x = (44 + text.width) / 2 - 32;
  pay.y = 368;
  card.addChild(pay);
  return card;
}

export { showsArena } from '../meta/arena';
