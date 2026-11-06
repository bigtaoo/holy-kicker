import { Container, type Text } from 'pixi.js';
import { formatAmount, t } from '../i18n';
import { BALANCE } from '../meta/balance';
import type { SaveData } from '../meta/save';
import { chestBlock, chestContents, chestsLeft, copperChestPrice, type ChestKind } from '../meta/shop';
import { iconSprite, type IconSheet } from './buildBar';
import { COLORS, button, dot, label, panel } from './widgets';

// The Shop tab's chest cards (lobbyEconomy.ts holds the tab and what a tap does). Portrait stacks
// them down the middle, a wide card each, chest left, lines in the middle, button right; a
// landscape frame stands them side by side as tall cards, chest on top and button at the foot,
// so the row fills the width instead of a narrow column over an empty room.

export const CARD_W = 1000;
/**
 * A card's height with room to spare; fewer cards grow towards CARD_TALL, and iOS's five on a
 * short phone close the gaps and shrink to CARD_MIN, the least the ad-free card's two buttons need.
 */
const CARD_H = 290;
const CARD_MIN = 260;
const CARD_TALL = 420;
/** The width of a card's lines, from the chest to its button. */
const TEXT_W = 420;
const CARD_GAP = 40;
const CARD_GAP_MIN = 20;
/** The refill countdown's line under the cards. */
export const FOOT_H = 110;
/** A landscape card: its width, the gap between two, and its height at most. */
const TALL_W = 600;
const TALL_GAP = 60;
const TALL_H = 820;
const TALL_MIN = 500;

export interface ShopSpots {
  /** Side by side (landscape) or stacked. */
  row: boolean;
  /** A card's size. */
  w: number;
  h: number;
  /** Every card's centre, from the tab's top centre. */
  at: { x: number; y: number }[];
  /** The refill line's y, or null where it has no room. */
  foot: number | null;
}

/** Where `n` cards go in a room `room` tall on a frame `frameW` wide; `row` asks for the landscape row. */
export function shopSpots(n: number, room: number, frameW: number, row: boolean): ShopSpots {
  // four cards (the ad chest too) narrow a little to share the width
  const w = Math.min(TALL_W, Math.floor((frameW - 200 - (n - 1) * TALL_GAP) / n));
  if (row && w >= TALL_MIN) {
    const h = Math.min(TALL_H, room - FOOT_H - 20);
    const top = Math.max(0, Math.round((room - h - FOOT_H) / 3));
    const step = w + TALL_GAP;
    const at = Array.from({ length: n }, (_, i) => ({ x: (i - (n - 1) / 2) * step, y: top + h / 2 }));
    return { row: true, w, h, at, foot: top + h + 50 };
  }
  // where even the closed-up cards leave no line for it, the refill countdown goes (each card counts its own)
  const footed = (room - FOOT_H) / n >= CARD_MIN + CARD_GAP_MIN;
  const each = (footed ? room - FOOT_H : room) / n;
  const gap = each >= CARD_H + CARD_GAP ? CARD_GAP : Math.max(CARD_GAP_MIN, Math.round(each - CARD_H));
  const h = Math.round(Math.max(CARD_MIN, Math.min(CARD_TALL, each - gap)));
  // a short list (no ads, no store) sits in the middle of the room rather than leaving it empty below
  const top = Math.max(0, Math.round((room - n * (h + gap) - (footed ? FOOT_H : 0)) / 3));
  const at = Array.from({ length: n }, (_, i) => ({ x: 0, y: top + i * (h + gap) + h / 2 }));
  return { row: false, w: CARD_W, h, at, foot: footed ? top + n * (h + gap) + 30 : null };
}

export interface ChestCardDeps {
  save: SaveData;
  now: number;
  icons: IconSheet;
  /** An ad is playing: every button waits. */
  playing: boolean;
  open(kind: ChestKind): void;
}

/** A chest's card, `w` x `h`, wide (portrait) or tall (landscape's row). */
export function chestCard(d: ChestCardDeps, kind: ChestKind, w: number, h: number, tall: boolean): Container {
  const { save, now } = d;
  const card = new Container();
  card.addChild(panel(w, h));
  // a taller card shows a bigger chest and spreads its lines; the text keeps its size
  const icon = iconSprite(d.icons, kind === 'copper' ? 'chest' : `chest_${kind}`, tall ? 240 : Math.min(230, 200 + (h - CARD_H) / 2));
  if (icon) {
    if (tall) icon.y = -h / 2 + 170;
    else icon.x = -385;
    card.addChild(icon);
  }
  const c = chestContents(save, kind);
  const left = chestsLeft(save, now, kind);
  const info = kind === 'free' ? t('shop.freeInfo', { copper: formatAmount(c.copper), n: c.drops })
    : kind === 'ad' ? t('shop.adInfo', { jade: c.jade, n: c.drops })
    // the copper chest's gear too; a newcomer on planet 1 reads "the next planet", not a number he has not met
    : c.chapter === save.cleared + 2 ? t('shop.jadeAhead', { n: c.drops }) : t('shop.jadeInfo', { n: c.drops, chapter: c.chapter });
  // a wrapped line keeps a number with its word ("1 gear", "chapter 20")
  const keep = (text: string) => text.replace(/(\d) /g, '$1 ').replace(/ (\d)/g, ' $1');
  const status = left === null ? '' : left > 0 ? t('shop.left', { n: left }) : t('shop.tomorrow');
  // "come back tomorrow" in red, outlined like the other red words on a dark card
  const out = left === 0;
  // the name, what is inside (up to two lines) and today's count, stacked down the middle of the card
  const lines: [string, number, number, boolean][] = [[t(`shop.${kind}`), 56, COLORS.text, false], [info, 48, COLORS.dim, false], [status, 48, out ? COLORS.danger : COLORS.dim, out]];
  const textW = tall ? w - 80 : TEXT_W;
  const views: Text[] = lines.filter(([text]) => text).map(([text, size, fill, stroke]) => {
    const l = label(keep(text), size, fill, {
      align: tall ? 'center' : 'left', wordWrap: true, wordWrapWidth: textW, breakWords: true, lineHeight: size + 6,
      ...(stroke ? { stroke: { color: COLORS.outline, width: 6 } } : {}),
    });
    if (l.height > 2 * (size + 6)) l.scale.set(2 * (size + 6) / l.height);
    l.anchor.set(tall ? 0.5 : 0, 0);
    return l;
  });
  const gap = tall ? 20 : Math.min(24, 8 + (h - CARD_H) / 8);
  const stack = views.reduce((sum, l) => sum + l.height, 0) + gap * (views.length - 1);
  // tall: the lines between the chest and the button; wide: down the middle
  let y = tall ? (-h / 2 + 300 + h / 2 - 190 - stack) / 2 : -stack / 2;
  for (const l of views) {
    l.position.set(tall ? 0 : -260, y);
    y += l.height + gap;
    card.addChild(l);
  }
  const block = chestBlock(save, now, kind);
  const playing = kind === 'ad' && d.playing;
  const text = playing ? '…' : kind === 'jade' ? t('shop.price', { jade: BALANCE.shop.jadeChest.jade })
    : kind === 'copper' ? t('shop.copperPrice', { copper: formatAmount(copperChestPrice(save)) }) : t('shop.open');
  const ok = !block && !d.playing;
  const fill = !ok ? COLORS.panelLocked : kind === 'jade' ? COLORS.jade : kind === 'copper' ? COLORS.copper : COLORS.saffron;
  const b = button(text, tall ? w - 120 : 300, 130, () => d.open(kind), {
    fill, textFill: !ok ? COLORS.dim : kind === 'jade' || kind === 'copper' ? COLORS.outline : COLORS.text, video: kind === 'ad' && !playing, size: 48,
  });
  if (tall) b.y = h / 2 - 110;
  else b.x = 320;
  if (d.playing) b.eventMode = 'none';
  card.addChild(b);
  if (kind === 'free' && !block) card.addChild(dot(w / 2 - 20, -h / 2 + 20));
  return card;
}
