// Where the lobby's pieces stand on a portrait frame and on a landscape one (a desktop's wide
// frame, hudLayout.ts isWideFrame). Portrait stacks the Play tab down the middle: the chapter card
// at the top, the monk, his relics and PLAY over the tab bar, the round side buttons on the two
// edges. Landscape spreads it out: the card on the left, the monk on stage in the middle, the side
// buttons in two columns on the right, and the tabs a centred row along the bottom.
// Pure, so it is tested without Pixi.

export const TOP_H = 150;
export const TAB_H = 190;
/** PLAY's size. */
export const PLAY_W = 820;
export const PLAY_H = 210;
/** The relic row's height under the monk's feet (playCard.ts relicRow). */
export const RELIC_ROW_H = 250;
/** The rail buttons' distance from a portrait screen's sides, and their radius and step (lobbyRail.ts). */
const RAIL_X = 130;
export const RAIL_R = 72;
/** From a rail button's centre to the next one's. */
export const RAIL_STEP = 300;
/** The monk's height when the chapter card leaves room for him: portrait, and on a landscape stage. */
const FIGURE_H = 440;
const FIGURE_H_WIDE = 720;
/** A landscape tab's width; portrait tabs share the frame's width. */
const TAB_W_WIDE = 270;
/** In landscape: the chapter card's centre left of the middle, the two rail columns right of it. */
const CARD_DX = 1000;
const RAIL_DX = [760, 1100];
/** The track switch's height over the chapter card. */
const SWITCH_H = 110;

export interface Spot {
  x: number;
  y: number;
}

export interface PlaySpots {
  /** The track switch's centre, when there is one. */
  trackSwitch: Spot;
  /** The chapter card's top centre. */
  card: Spot;
  /** The monk's feet (the relic row hangs from them), and PLAY's centre. */
  feet: Spot;
  play: Spot;
  figureH: number;
  /** Where the rail buttons go: the left list (Patrol, Tasks) and the right one (the challenge, the gift), top down. */
  rails: [Spot[], Spot[]];
}

export const isWide = (w: number, h: number) => w > h;

/** PLAY's centre on a frame `h` tall, over the tab bar; the monk's feet over the relic row above it (on Gear too). */
export const playY = (h: number) => h - TAB_H - 50 - PLAY_H / 2;
export const figureFeet = (h: number) => playY(h) - PLAY_H / 2 - 20 - RELIC_ROW_H - 5;

/** The Play tab on a `w` x `h` frame, for a chapter card `cardH` tall with the hard-mode switch over it or not. */
export function playSpots(w: number, h: number, cardH: number, switched: boolean): PlaySpots {
  const feetY = figureFeet(h);
  const play = { x: w / 2, y: playY(h) };
  if (!isWide(w, h)) {
    const cardTop = TOP_H + 30 + (switched ? SWITCH_H : 0);
    const cardBottom = cardTop + cardH;
    const railY = cardBottom + 50 + RAIL_R;
    const column = (x: number) => [0, 1].map((i) => ({ x, y: railY + i * RAIL_STEP }));
    return {
      trackSwitch: { x: w / 2, y: TOP_H + 75 },
      card: { x: w / 2, y: cardTop },
      feet: { x: w / 2, y: feetY },
      play,
      figureH: Math.max(160, Math.min(FIGURE_H, feetY - cardBottom - 60)),
      rails: [column(RAIL_X), column(w - RAIL_X)],
    };
  }
  // the card and its switch centred down the room between the bars, the rails likewise
  const room = h - TOP_H - TAB_H;
  const stack = cardH + (switched ? SWITCH_H : 0);
  const cardTop = TOP_H + Math.max(30, (room - stack) / 2) + (switched ? SWITCH_H : 0);
  const railTop = TOP_H + (room - RAIL_STEP) / 2 - 40;
  const column = (x: number) => [0, 1].map((i) => ({ x, y: railTop + i * RAIL_STEP }));
  return {
    trackSwitch: { x: w / 2 - CARD_DX, y: cardTop - SWITCH_H + 45 },
    card: { x: w / 2 - CARD_DX, y: cardTop },
    feet: { x: w / 2, y: feetY },
    play,
    figureH: Math.max(160, Math.min(FIGURE_H_WIDE, feetY - TOP_H - 60)),
    rails: [column(w / 2 + RAIL_DX[0]), column(w / 2 + RAIL_DX[1])],
  };
}

/** The tab cells along the bottom: the first one's centre and the step between them. */
export function tabCells(w: number, h: number, count: number): { x0: number; tw: number } {
  const tw = isWide(w, h) ? TAB_W_WIDE : w / count;
  return { x0: (w - tw * count) / 2 + tw / 2, tw };
}
