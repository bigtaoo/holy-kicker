import { Container, Graphics, Sprite, TilingSprite, type Texture } from 'pixi.js';
import { mapOf } from '@hk/engine';
import type { ChapterLook } from '../chapterArt';
import { t } from '../i18n';
import { chapterName } from '../i18n/chapterName';
import type { NextStep } from '../meta/waiting';
import type { Part } from './resultsParts';
import { statLines } from './statText';
import { COLORS, button, fit, label, shade } from './widgets';

// The results' pointers onward (ResultsScreen.ts): after a loss, the one thing in the lobby that
// makes the next run go further, with a button that opens its tab; after a first clear, the
// chapter it opened as a strip of its ground with its signature enemy's head.

const STEP_BTN_W = 260;

/** The next step after a loss: one line and a button that goes to the lobby on its tab. */
export function nextStepPart(step: NextStep, width: number, go: () => void): Part {
  const c = new Container();
  // the first stat keeps it short; the tab shows the rest
  const stats = step.tab === 'train' ? statLines(step.stats) : [];
  const text = step.tab === 'train'
    ? t('results.trainStep', { n: step.n, stats: stats[0] })
    : t('results.mergeStep', { n: step.n });
  const textW = width - STEP_BTN_W - 50;
  const line = label(text, 48, COLORS.jade, { wordWrap: true, wordWrapWidth: textW, breakWords: true, lineHeight: 58 });
  const h = Math.max(110, line.height + 30);
  line.anchor.set(0, 0.5);
  line.position.set(-width / 2 + 20, h / 2);
  const b = button(t(step.tab === 'train' ? 'results.goTrain' : 'results.goMerge'), STEP_BTN_W, 100, go, { fill: shade(COLORS.jade, 0.45), size: 48 });
  b.position.set(width / 2 - STEP_BTN_W / 2 - 10, h / 2);
  c.addChild(line, b);
  return [c, h];
}

const STRIP_H = 220;
const HEAD_R = 82;

/** "Up next" over a strip of the next chapter's ground, its enemy's head in a disc and its name. */
export function previewPart(look: ChapterLook, width: number): Part {
  const c = new Container();
  const caption = label(t('results.upNext'), 48, COLORS.dim);
  caption.anchor.set(0.5, 0);
  c.addChild(caption);
  const top = 66;
  const strip = new Container();
  strip.y = top;
  const shape = () => new Graphics().roundRect(-width / 2, 0, width, STRIP_H, 28);
  if (look.ground) {
    const ground = new TilingSprite({ texture: look.ground, width, height: STRIP_H });
    ground.position.set(-width / 2, 0);
    ground.tileScale.set(0.5);
    const mask = shape().fill(0xffffff);
    ground.mask = mask;
    strip.addChild(ground, mask);
  } else strip.addChild(shape().fill(COLORS.panelLocked));
  // a dark veil on the left keeps the name readable on any ground
  strip.addChild(shape().fill({ color: COLORS.outline, alpha: 0.35 }), shape().stroke({ color: COLORS.outline, width: 6 }));
  const disc = new Container();
  disc.position.set(-width / 2 + 30 + HEAD_R, STRIP_H / 2);
  disc.addChild(new Graphics().circle(0, 0, HEAD_R).fill(COLORS.panelLocked));
  if (look.foe) disc.addChild(head(look.foe, look.chapter));
  disc.addChild(new Graphics().circle(0, 0, HEAD_R).stroke({ color: COLORS.outline, width: 8 }).circle(0, 0, HEAD_R - 5).stroke({ color: COLORS.trim, width: 4 }));
  const nameX = -width / 2 + 60 + 2 * HEAD_R;
  const name = fit(label(t('lobby.chapterTitle', { n: look.chapter, name: chapterName(look.chapter) }), 56, COLORS.text), width / 2 - nameX - 24);
  name.anchor.set(0, 0.5);
  name.position.set(nameX, STRIP_H / 2);
  strip.addChild(disc, name);
  c.addChild(strip);
  return [c, top + STRIP_H];
}

/** Where each map's enemy has its head in its frame (fractions of the frame) and how much of the frame the disc spans. */
const HEADS: [number, number, number][] = [
  [0.62, 0.45, 0.62],
  [0.45, 0.31, 0.62],
  [0.54, 0.33, 0.62],
  [0.5, 0.55, 0.78],
  [0.5, 0.25, 0.58],
];

function head(texture: Texture, chapter: number): Container {
  const [fx, fy, span] = HEADS[mapOf(chapter) - 1];
  const c = new Container();
  const s = new Sprite(texture);
  const k = (2 * HEAD_R) / (span * texture.height);
  s.scale.set(k);
  s.position.set(-fx * texture.width * k, -fy * texture.height * k);
  const mask = new Graphics().circle(0, 0, HEAD_R - 4).fill(0xffffff);
  s.mask = mask;
  c.addChild(s, mask);
  return c;
}
