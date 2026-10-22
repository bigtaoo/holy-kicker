import { Container, Graphics, type Text } from 'pixi.js';
import { t } from '../i18n';
import { BALANCE } from '../meta/balance';
import type { Drop } from '../meta/gear';
import type { Reward } from '../meta/progress';
import type { RunRank } from '../net/backend';
import { iconSprite, type IconSheet } from './buildBar';
import type { DownInfo } from './deathInfo';
import { goalText } from './downPanel';
import { fallFigures, fallIcon } from './fallIcons';
import { dropName, haulName, TIER_COLORS } from './gearText';
import { goalShare } from './resultsReveal';
import { statLines } from './statText';
import { CARD_STROKE } from './playCard';
import { starRow } from './stars';
import { COLORS, fit, label, shade } from './widgets';

// The parts of the results screen (ResultsScreen.ts), each a view centred on x 0 with its top at
// y 0 and the height it takes: the header (the title, the waves cleared as one big number and a
// badge for the best and the leaderboard), the strip saying what felled the hero and how near the
// next goal was, the rewards as a row of icons, and the rarer news as short lines.

export type Part = [Container, number];

/** A rounded pill with `text` in it, `fill` coloured. */
function pill(text: string, color: number, size = 48): Container {
  const c = new Container();
  const l = label(text, size, color);
  l.anchor.set(0.5);
  const w = l.width + 48;
  const h = size + 28;
  c.addChild(new Graphics().roundRect(-w / 2, -h / 2, w, h, h / 2).fill(shade(COLORS.outline, 0.1)).stroke({ color, width: 4 }), l);
  return c;
}

export function headerPart(r: Reward, waves: number, rank: RunRank | null, width: number): Part {
  const c = new Container();
  // a won run (a replay too: it may bring a star) is a clear, gold on the first one
  const won = r.stars > 0;
  const title = fit(label(won ? t(r.hard ? 'results.hardCleared' : 'results.cleared') : t('results.fallen'), 72, r.firstClear ? COLORS.saffron : COLORS.text), width);
  title.y = 40;
  const big = label(String(waves), 180, r.newBest ? COLORS.gold : COLORS.text, { stroke: { color: COLORS.outline, width: 12 } });
  big.y = 180;
  const caption = label(t('results.waves'), 48, COLORS.dim);
  caption.y = 294;
  c.addChild(title, big, caption);
  // a won run's stars, and what the next one asks while the chapter lacks it
  let top = 350;
  if (r.stars > 0) {
    const stars = starRow(r.stars, 90);
    stars.y = 390;
    c.addChild(stars);
    top = 450;
    const next = Math.max(r.stars, r.bestStars) + 1;
    if (next <= 3) {
      const hint = fit(label(next === 2 ? t('results.starNext2') : t('results.starNext3', { n: BALANCE.stars.lowest }), 48, COLORS.dim), width);
      hint.y = 484;
      c.addChild(hint);
      top = 530;
    }
  }
  // the best (or a new one) and the leaderboard place, side by side under the number
  const badges: Container[] = [];
  if (r.newBest) badges.push(pill(t('results.newBest'), COLORS.gold, 48));
  else if (!won && r.best > 0) badges.push(pill(t('results.best', { wave: r.best }), COLORS.dim));
  if (rank) badges.push(pill(t(rank.best ? 'results.rankNew' : 'results.rankShort', { rank: rank.rank }), rank.best ? COLORS.gold : COLORS.dim));
  if (badges.length === 0) return [c, top];
  const row = new Container();
  let x = 0;
  for (const b of badges) {
    b.x = x + b.width / 2;
    x += b.width + 24;
    row.addChild(b);
  }
  row.pivot.x = (x - 24) / 2;
  if (row.width > width) row.scale.set(width / row.width);
  row.y = top + 52;
  c.addChild(row);
  return [c, top + 100];
}

/** What felled the hero (its picture beside it), the nearest goal across the strip with a bar for how near it came, and one short tip. */
export function fallPart(fall: DownInfo, waves: number, width: number, icons: IconSheet): Part {
  const c = new Container();
  const icon = fallIcon(fall.cause, fallFigures(icons, fall.monk));
  icon.scale.set(0.62);
  icon.position.set(-width / 2 + 95, 74);
  const textX = -width / 2 + 190;
  const cause = fit(label(t(`run.fall.${fall.cause}.cause`, { wave: waves + 1 }), 52, COLORS.saffron), width / 2 - textX - 30);
  cause.anchor.set(0, 0.5);
  cause.position.set(textX, 74);
  c.addChild(icon, cause);
  let y = 140;
  if (fall.goal) {
    // the goal has the strip's whole width, so it reads at full size
    const left = -width / 2 + 30;
    const goal = fit(label(goalText(fall.goal), 48, fall.goal.kind === 'record' ? COLORS.jade : COLORS.trim), width - 60);
    goal.anchor.set(0, 0.5);
    goal.position.set(left, y + 26);
    const share = goalShare(waves, fall.goal);
    const barW = width - 60;
    const bar = new Graphics()
      .roundRect(left, y + 62, barW, 26, 13).fill(shade(COLORS.outline, 0.12))
      .roundRect(left, y + 62, Math.max(26, barW * share), 26, 13).fill(fall.goal.kind === 'record' ? COLORS.jade : COLORS.saffron)
      .roundRect(left, y + 62, barW, 26, 13).stroke({ color: COLORS.outline, width: 4 });
    c.addChild(goal, bar);
    y += 100;
  }
  const tip = label(t(`run.fall.${fall.cause}.tip`), 48, COLORS.dim, { wordWrap: true, wordWrapWidth: width - 60, breakWords: true, lineHeight: 58 });
  tip.anchor.set(0.5, 0);
  tip.y = y + 6;
  c.addChild(tip);
  y += tip.height + 36;
  c.addChildAt(new Graphics().roundRect(-width / 2, 0, width, y - 10, 28).fill({ color: COLORS.outline, alpha: 0.35 }), 0);
  return [c, y + 10];
}

/** The gear found, one framed icon per item and tier with a count, the best first. */
function gearTiles(drops: readonly Drop[], icons: IconSheet): Container[] {
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
    c.addChild(new Graphics().roundRect(-62, -62, 124, 124, 22).fill(shade(color, -0.55)).stroke({ color, width: 7 }));
    c.addChild(iconSprite(icons, d.item, 100) ?? fit(label(dropName(d), 24, color), 110));
    if (n > 1) {
      const k = label(t('gear.count', { n }), 40, COLORS.text, { stroke: { color: COLORS.outline, width: 7 } });
      k.anchor.set(1, 1);
      k.position.set(58, 62);
      c.addChild(k);
    }
    return c;
  });
}

/** The copper paid, `total` (its number counted up through `copper`), and the gear found, in rows. */
export function rewardsPart(r: Reward, total: number, icons: IconSheet, width: number): Part & { copper: Text } {
  const c = new Container();
  const coin = iconSprite(icons, 'copper', 96) ?? new Graphics().circle(0, 0, 32).fill(COLORS.copper).stroke({ color: COLORS.outline, width: 5 });
  const copper = label(`+${total}`, 64, COLORS.copper, { stroke: { color: COLORS.outline, width: 8 } });
  copper.anchor.set(0, 0.5);
  const chip = new Container();
  coin.position.set(0, 0);
  copper.position.set(60, 0);
  chip.addChild(coin, copper);
  // centred on the full amount, so the count fills in to the right
  chip.position.set(-(12 + copper.width) / 2, 60);
  c.addChild(chip);
  let y = 130;
  const tiles = gearTiles(r.drops, icons);
  // as many rows as the width needs, the tiles shared out evenly between them (7 as 4 + 3, not 6 + 1)
  const fits = Math.max(1, Math.floor((width + 16) / 140));
  const per = Math.ceil(tiles.length / Math.max(1, Math.ceil(tiles.length / fits)));
  tiles.forEach((tile, i) => {
    const row = Math.floor(i / per);
    const inRow = Math.min(per, tiles.length - row * per);
    tile.position.set(((i % per) - (inRow - 1) / 2) * 140, y + 70 + row * 140);
    c.addChild(tile);
  });
  if (tiles.length > 0) y += Math.ceil(tiles.length / per) * 140 + 10;
  return Object.assign([c, y] as Part, { copper });
}

/** A news line: its text, font size, colour and, for red on the dark card, the outline the chapter card's red wears. */
export type NewsLine = [string, number, number, { stroke: { color: number; width: number } }?];

/**
 * The rarer news, one short line each: Codex entries, the chests waiting in the lobby, the welcome gift
 * and tomorrow's. One colour per meaning, as in the lobby: copper for copper, white for what the
 * run unlocked, jade for what waits to be claimed, the tier's colour for gear, red (outlined) for
 * hard mode.
 */
export function newsLines(r: Reward, doubled: boolean): NewsLine[] {
  const lines: NewsLine[] = [];
  if (doubled) lines.push([t('results.doubled'), 48, COLORS.copper]);
  if (r.hardUnlocked) lines.push([t('results.hardUnlocked'), 48, COLORS.danger, CARD_STROKE]);
  for (const id of r.newCodex) lines.push([t('results.newCodex', { name: t(`evolve.${id}.name`) }), 48, COLORS.text]);
  if (r.grit > 0) lines.push([t('results.grit', { n: r.grit }), 48, COLORS.text]);
  // the chests reached wait in the lobby (progressChests.ts): one line, however many
  if (r.chests.length > 0) lines.push([t('results.chests', { n: r.chests.length }), 48, COLORS.jade]);
  // the first run's welcome gift, worn in the next run when it is better (so the next try is
  // visibly stronger), and the one waiting tomorrow (welcome.ts)
  const gift = r.gift?.drops[0];
  const gain = r.gift?.gain;
  if (gift && gain) {
    lines.push([t('results.giftWorn', { gift: dropName(gift) }), 48, TIER_COLORS[gift.tier]]);
    const stats = statLines(gain);
    if (stats.length > 0) lines.push([stats.join('  ·  '), 48, COLORS.text]);
  } else if (gift) lines.push([t('results.gift', { gift: dropName(gift) }), 48, TIER_COLORS[gift.tier]]);
  const tomorrow = r.gift?.next;
  if (tomorrow) lines.push([t('gift.tomorrow', { gift: haulName(tomorrow) }), 48, COLORS.jade]);
  return lines;
}
