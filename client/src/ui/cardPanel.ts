import { Container, Graphics } from 'pixi.js';
import type { CardKind } from '@hk/engine';
import { t } from '../i18n';
import { iconSprite, type IconSheet } from './buildBar';
import { cardHand } from './cardHand';
import { CARD_NUDGE, nudgeOn } from './cardNudge';
import { cardPose, cardsSettled, rimPoints } from './cardGate';
import { cardKey } from './cardKeys';
import type { CardText } from './cardText';
import type { UiFrame } from './uiLayout';
import { COLORS, backdrop, fit, label, panel } from './widgets';

// The level-up or shrine choice: three large cards stacked down the middle of the portrait screen, one
// thumb tap each. Each card shows the item's icon on a disc in its kind's colour (with what it
// evolves with small on the corner), the name, "New!" or the level step, and its effect lines.
// Shrine blessings have no item and keep a drawn shape. The cards rise in grey and only take taps
// once a gold line has run round their rims (cardGate.ts). On a desktop the keys pick too
// (cardKeys.ts): each card wears its number, and a gold ring shows the one Enter takes. A player
// who does nothing for a while is shown a hand tapping the suggested card (cardNudge.ts); in a new
// player's first runs that card also wears a "Top pick" tag from the start.

const CARD_W = 960;
const CARD_H = 330;
const GAP = 44;
const ICON_R = 92;
const PAIR_R = 36;
const CARD_RADIUS = 28;
/** A locked card is drawn this grey. */
const LOCKED_TINT = 0x8a8a8a;

/** A shrine's disc: temple lacquer, deeper than the danger red. */
const SHRINE_RED = 0xb04a42;

export const KIND_COLOR: Record<CardKind, number> = {
  relic: COLORS.saffron, spell: COLORS.slate, passive: COLORS.jade, shrine: SHRINE_RED, evolve: COLORS.gold,
};
/** An evolution is a gold card: a warm panel with a bright rim. */
const GOLD_PANEL = 0x5a4216;
const GOLD_RIM = COLORS.gold;

function shape(kind: CardKind): Graphics {
  const g = new Graphics().circle(0, 0, ICON_R).fill(KIND_COLOR[kind]).stroke({ color: COLORS.outline, width: 8 });
  if (kind === 'relic') {
    // the cuju: a ball with two seams
    g.circle(0, 0, ICON_R * 0.55).fill(0xfff2d8).stroke({ color: COLORS.outline, width: 6 });
    g.moveTo(-ICON_R * 0.55, 0).lineTo(ICON_R * 0.55, 0).moveTo(0, -ICON_R * 0.55).lineTo(0, ICON_R * 0.55)
      .stroke({ color: COLORS.outline, width: 5 });
  } else if (kind === 'spell') {
    g.star(0, 0, 5, ICON_R * 0.62, ICON_R * 0.28).fill(0xffffff).stroke({ color: COLORS.outline, width: 6 });
  } else if (kind === 'evolve') {
    // a rising arrow over a burst
    const r = ICON_R * 0.62;
    g.star(0, 0, 8, r, r * 0.62).fill(0xfff2d8).stroke({ color: COLORS.outline, width: 6 });
    g.poly([0, -r * 0.7, r * 0.42, -r * 0.1, r * 0.16, -r * 0.1, r * 0.16, r * 0.55, -r * 0.16, r * 0.55, -r * 0.16, -r * 0.1, -r * 0.42, -r * 0.1])
      .fill(COLORS.saffron).stroke({ color: COLORS.outline, width: 5 });
  } else if (kind === 'shrine') {
    // an incense flame
    const r = ICON_R * 0.6;
    g.poly([0, -r, r * 0.55, r * 0.15, 0, r * 0.7, -r * 0.55, r * 0.15]).fill(0xfff2d8).stroke({ color: COLORS.outline, width: 6 });
  } else {
    const r = ICON_R * 0.55;
    g.poly([0, -r, r, 0, 0, r, -r, 0]).fill(0xffffff).stroke({ color: COLORS.outline, width: 6 });
  }
  return g;
}

function icon(text: CardText, icons: IconSheet): Container {
  const art = text.icon && iconSprite(icons, text.icon, ICON_R * 1.5);
  if (!art) return shape(text.kind);
  const c = new Container();
  c.addChild(new Graphics().circle(0, 0, ICON_R).fill(KIND_COLOR[text.kind]).stroke({ color: COLORS.outline, width: 8 }), art);
  if (text.kind === 'evolve') {
    // the rising arrow of the evolution, on the upper right
    const r = PAIR_R;
    const arrow = new Graphics().circle(0, 0, r).fill(GOLD_RIM).stroke({ color: COLORS.outline, width: 6 })
      .poly([0, -r * 0.6, r * 0.5, 0, r * 0.18, 0, r * 0.18, r * 0.55, -r * 0.18, r * 0.55, -r * 0.18, 0, -r * 0.5, 0])
      .fill(COLORS.saffron).stroke({ color: COLORS.outline, width: 4 });
    arrow.position.set(ICON_R * 0.72, -ICON_R * 0.72);
    c.addChild(arrow);
  }
  // what it evolves with, along the lower right of the disc
  text.pairs.slice(0, 2).forEach((id, i) => {
    const pair = new Container();
    pair.position.set(ICON_R * 0.78 - i * PAIR_R * 1.7, ICON_R * 0.78);
    pair.addChild(new Graphics().circle(0, 0, PAIR_R).fill(COLORS.panelLocked).stroke({ color: COLORS.outline, width: 6 })
      .circle(0, 0, PAIR_R - 4).stroke({ color: GOLD_RIM, width: 3 }));
    const small = iconSprite(icons, id, PAIR_R * 1.5);
    if (small) pair.addChild(small);
    c.addChild(pair);
  });
  return c;
}

/** Where the name and the effect lines start, right of the icon disc. */
const TEXT_X = -CARD_W / 2 + 80 + ICON_R * 2;
const TEXT_W = CARD_W / 2 - TEXT_X - 36;
/** The effect lines' top, under the name, and the room kept below them. */
const LINES_TOP = 122;
const LINES_BOTTOM = 40;
const LINE_GAP = 8;
/** The first card's top edge at the highest; the heading and the hint sit above it. */
const CARDS_TOP = 600;

/**
 * Up to three effect lines, at 48 and wrapped to the card's text column rather than squeezed: a new
 * item's one-sentence description runs to two rows in some languages. A stack too tall for any
 * card height the screen allows still shrinks, never below 40.
 */
function effectLines(text: CardText): { block: Container; h: number } {
  const block = new Container();
  let y = 0;
  for (const line of text.lines.slice(0, 3)) {
    const l = label(line, 48, COLORS.text, { align: 'left', wordWrap: true, wordWrapWidth: TEXT_W, breakWords: true, lineHeight: 58 });
    l.anchor.set(0, 0);
    l.y = y;
    block.addChild(l);
    y += l.height + LINE_GAP;
  }
  return { block, h: Math.max(0, y - LINE_GAP) };
}

function card(text: CardText, lines: Container, h: number, icons: IconSheet, onTap: () => void, locked: () => boolean): Container {
  const c = new Container();
  const left = -CARD_W / 2;
  const gold = text.kind === 'evolve';
  const back = panel(CARD_W, h, gold ? GOLD_PANEL : COLORS.panel);
  if (gold) back.roundRect(-CARD_W / 2 + 14, -h / 2 + 14, CARD_W - 28, h - 28, 20).stroke({ color: GOLD_RIM, width: 6 });
  c.addChild(back, icon(text, icons));
  c.children[1].position.set(left + 40 + ICON_R, 0);
  const x = TEXT_X;
  const room = TEXT_W;
  // the tag ("New!", "Lv.2 → 3") keeps its size; the name takes the rest of the row
  const tag = fit(label(text.tag, 48, text.fresh ? COLORS.saffron : COLORS.dim), room * 0.45);
  const name = fit(label(text.name, 60), room - tag.width - 28);
  name.anchor.set(0, 0.5);
  name.position.set(x, -h / 2 + 70);
  tag.anchor.set(1, 0.5);
  tag.position.set(CARD_W / 2 - 36, -h / 2 + 70);
  lines.position.set(x, -h / 2 + LINES_TOP);
  c.addChild(name, tag, lines);
  c.eventMode = 'static';
  c.cursor = 'pointer';
  let down = false;
  c.on('pointerdown', () => {
    // a touch that starts while the card is locked never counts, even if it lifts later
    if (locked()) return;
    down = true;
    c.scale.set(0.97);
  });
  const reset = () => {
    down = false;
    c.scale.set(1);
  };
  c.on('pointerupoutside', reset);
  c.on('pointerleave', reset);
  c.on('pointerup', () => {
    const fire = down;
    reset();
    if (fire) onTap();
  });
  return c;
}

export interface CardPanel {
  view: Container;
  /** Poses the cards `age` seconds after the choice opened. */
  update(age: number): void;
  /** A key went down (cardKeys.ts); ignored on touch screens and while the cards are locked. */
  key(code: string, repeat: boolean): void;
}

/** Where the hand's fingertip taps, from the card's middle: low on the icon, so the hand hangs over
 *  the icons below rather than the level line or the next card's name. */
const HAND_X = -CARD_W / 2 + 40 + ICON_R * 0.6;
const HAND_DOWN = 0;

/** The ring round the highlighted card. */
const FOCUS_PAD = 14;

/**
 * The card nudge's state, kept by the caller across layouts: the card to suggest, whether the
 * player did anything yet, and whether the card wears the tag (a new player's first runs).
 */
export interface CardNudgeState {
  suggest: number;
  touched: boolean;
  tagged: boolean;
}

/** The suggested card's tag, a pill on its top edge over the start of the name. */
function suggestTag(cardH: number): Container {
  const c = new Container();
  const text = label(t('card.suggested'), 48, COLORS.outline);
  const w = Math.ceil(text.width) + 48;
  c.addChild(new Graphics().roundRect(-w / 2, -34, w, 68, 34).fill(COLORS.saffron).stroke({ color: COLORS.outline, width: 6 }), text);
  c.position.set(TEXT_X + w / 2, -cardH / 2);
  return c;
}

/**
 * The modal choice over the run under `title`; `onPick` gets the card's index. `keys` holds the
 * highlighted card on a desktop (kept by the caller across layouts), null on a touch screen;
 * `nudge` the hand's state (cardNudge.ts), null for no hand.
 */
export function cardPanel(
  f: UiFrame, title: string, texts: readonly CardText[], icons: IconSheet, onPick: (index: number) => void,
  keys: { focus: number } | null = null, nudge: CardNudgeState | null = null,
): CardPanel {
  const view = new Container();
  view.addChild(backdrop(f.w, f.h, 0.7));
  // one height for all the cards: the tallest effect lines, within what the screen leaves
  const blocks = texts.map(effectLines);
  const roomH = Math.floor((f.h - CARDS_TOP - 60 - (texts.length - 1) * GAP) / Math.max(1, texts.length));
  const want = Math.max(CARD_H, ...blocks.map((b) => LINES_TOP + b.h + LINES_BOTTOM));
  const cardH = Math.max(CARD_H, Math.min(want, roomH));
  for (const b of blocks) {
    const fitsIn = cardH - LINES_TOP - LINES_BOTTOM;
    if (b.h > fitsIn) b.block.scale.set(Math.max(40 / 48, fitsIn / b.h));
  }
  const total = texts.length * cardH + (texts.length - 1) * GAP;
  // the heading stays below the wave counter (RunHud, y 300) however tall the cards grow
  const top = Math.max(CARDS_TOP, f.h / 2 - total / 2 + 60);
  const heading = label(title, 96, COLORS.saffron, { stroke: { color: COLORS.outline, width: 10 } });
  fit(heading, f.w - 80);
  heading.position.set(f.w / 2, top - 190);
  const hint = label(t('card.pickOne'), 52, COLORS.text);
  hint.position.set(f.w / 2, top - 90);
  view.addChild(heading, hint);
  let locked = true;
  if (keys && keys.focus >= texts.length) keys.focus = 0;
  const cards = texts.map((text, i) => {
    const body = card(text, blocks[i].block, cardH, icons, () => onPick(i), () => locked);
    const rim = new Graphics();
    const ring = new Graphics()
      .roundRect(-CARD_W / 2 - FOCUS_PAD, -cardH / 2 - FOCUS_PAD, CARD_W + 2 * FOCUS_PAD, cardH + 2 * FOCUS_PAD, CARD_RADIUS + FOCUS_PAD)
      .stroke({ color: GOLD_RIM, width: 10 });
    ring.visible = false;
    const c = new Container();
    c.addChild(ring, body, rim);
    if (keys) {
      // the card's number key, on its upper left corner
      const chip = new Container();
      const n = label(String(i + 1), 48, COLORS.outline);
      chip.addChild(new Graphics().roundRect(-34, -34, 68, 68, 16).fill(GOLD_RIM).stroke({ color: COLORS.outline, width: 6 }), n);
      chip.position.set(-CARD_W / 2 + 8, -cardH / 2 + 8);
      body.addChild(chip);
      // the mouse moves the highlight too, so keys and mouse never disagree
      body.on('pointerover', () => {
        keys.focus = i;
        showFocus();
      });
    }
    if (nudge?.tagged && nudge.suggest === i) body.addChild(suggestTag(cardH));
    view.addChild(c);
    return { c, body, rim, ring, y: top + cardH / 2 + i * (cardH + GAP) };
  });
  const showFocus = () => cards.forEach(({ ring }, i) => (ring.visible = !!keys && !locked && keys.focus === i));
  const hand = nudge && cards[nudge.suggest] ? cardHand() : null;
  if (hand && nudge) {
    // the fingertip rests on the card's lower left, by the icon, clear of the name and the level step
    hand.view.position.set(f.w / 2 + HAND_X, cards[nudge.suggest].y + HAND_DOWN);
    hand.view.visible = false;
    view.addChild(hand.view);
    const touch = () => (nudge.touched = true);
    view.on('pointerdown', touch);
    view.on('pointermove', touch);
  }
  let settled = false;
  const update = (age: number) => {
    if (hand && nudge) {
      const on = nudgeOn(age, nudge.touched);
      if (on && !hand.view.visible && keys) {
        keys.focus = nudge.suggest;
        showFocus();
      }
      hand.view.visible = on;
      if (on) hand.update(age - CARD_NUDGE.after);
    }
    if (settled) return;
    settled = cardsSettled(age);
    cards.forEach(({ c, body, rim, y }, i) => {
      const pose = cardPose(age, i);
      locked = pose.locked;
      c.position.set(f.w / 2, y + pose.y);
      c.alpha = pose.alpha;
      c.scale.set(pose.scale);
      body.tint = pose.locked ? LOCKED_TINT : 0xffffff;
      rim.clear();
      if (pose.rimAlpha > 0 && pose.rim > 0) {
        rim.poly(rimPoints(CARD_W, cardH, CARD_RADIUS, pose.rim), false)
          .stroke({ color: GOLD_RIM, width: 10, alpha: pose.rimAlpha, cap: 'round', join: 'round' });
      }
    });
    showFocus();
  };
  const key = (code: string, repeat: boolean) => {
    if (nudge) nudge.touched = true;
    if (!keys || locked) return;
    const k = cardKey(code, repeat, keys.focus, cards.length);
    if (k && 'focus' in k) {
      keys.focus = k.focus;
      showFocus();
    } else if (k) onPick(k.pick);
  };
  update(0);
  return { view, update, key };
}
