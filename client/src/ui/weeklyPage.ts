import { Container, type Text } from 'pixi.js';
import { mutatorOf } from '@hk/engine';
import { BALANCE } from '../meta/balance';
import type { WeekClaim } from '../meta/weekly';
import { t } from '../i18n';
import { iconSprite, type IconSheet } from './buildBar';
import type { WeeklyView } from './challengeFlow';
import { markMedal } from './weeklyBoard';
import { COLORS, backdrop, button, fit, label, panel } from './widgets';

// The weekly challenge's page in the challenge panel (docs/design.md "Challenges"): the week's
// fixed loadout (relic, monk and sutras, owned or not), its mutator if any, its rules, what each tier pays when the
// week ends, the player's best this week and the time left, then Play and Ranks. And the card
// that pays a closed week at the next launch: its rank, its medal and the jade.

/** Each reward tier with the jade it pays in all: taking part, then the top 50 %, 10 % and three. */
export function weeklyTiers(): { key: string; jade: number }[] {
  const b = BALANCE.challenge.weekly;
  const keys = ['weekly.part', 'weekly.half', 'weekly.tenth', 'weekly.three'];
  return keys.map((key, i) => ({ key, jade: b.participation + b.tiers.slice(0, i).reduce((n, j) => n + j, 0) }));
}

/** A challenge's mutator as one line ("Swift horde: the horde moves faster"), or null without one (or one this build does not know). */
export function mutatorLine(id: string | null | undefined): string | null {
  const m = mutatorOf(id);
  return m && t('mutator.line', { name: t(`mutator.${m}`), info: t(`mutator.${m}Info`) });
}

/** A page's rules block and how much more room it takes than the rules had on one shrunk line each. */
export interface Rules {
  view: Container;
  grow: number;
}

/** Rule lines at size 48 in dim, each wrapped at `width` into even lines, stacked down from y 0. */
export function ruleLines(keys: readonly string[], width: number): Container {
  const size = 48;
  const lineH = size + 10;
  const c = new Container();
  let y = 0;
  keys.forEach((key, i) => {
    const text = t(key as never);
    const l = label(text, size, COLORS.dim, { lineHeight: lineH });
    const one = l.width;
    if (one > width && !breakAtPause(l, text, width)) {
      Object.assign(l.style, { wordWrap: true, breakWords: true, wordWrapWidth: width });
      const h = l.height;
      // the lines evened out, so no word (or character) is left alone on the last, as long as that adds no line
      for (let w = one / Math.round(h / lineH) + size; ; w += size) {
        l.style.wordWrapWidth = Math.min(w, width);
        if (w >= width || l.height <= h) break;
      }
    }
    l.anchor.set(0.5, 0);
    l.y = y;
    c.addChild(l);
    y += l.height + (i < keys.length - 1 ? 6 : 0);
  });
  return c;
}

/** Breaks `l` (showing `text`) into two lines after the colon or comma nearest its middle, if both then fit `width`
 *  (also the monk panel's stats). */
export function breakAtPause(l: Text, text: string, width: number): boolean {
  const cuts = [...text.matchAll(/[:：,，]/g)].map((m) => m.index + 1).sort((a, b) => Math.abs(a - text.length / 2) - Math.abs(b - text.length / 2));
  for (const at of cuts) {
    l.text = `${text.slice(0, at).trimEnd()}
${text.slice(at).trimStart()}`;
    if (l.width <= width) return true;
  }
  l.text = text;
  return false;
}

/** The weekly's rules: (with a mutator) they once had 46 a line, else 54; 24 more keeps them off the rewards title. */
export function weeklyRules(w: WeeklyView, width: number): Rules {
  const view = ruleLines(['weekly.rule1', 'weekly.rule2', 'weekly.rule3'], width - 100);
  return { view, grow: Math.max(0, view.height + 24 - 3 * (w.challenge.mutator ? 46 : 54)) };
}

export interface WeeklyPageActions {
  play(): void;
  /** Opens the week's board; null without a name on the boards. */
  ranks: (() => void) | null;
}

/**
 * The weekly page's parts, drawn into the panel `box` (`width` wide, its top edge at `top`), from y 165 on;
 * everything under `rules` (weeklyRules) moves down by their grow.
 */
export function weeklyPage(box: Container, top: number, width: number, w: WeeklyView, icons: IconSheet, rules: Rules, actions: WeeklyPageActions): void {
  const add = (text: string, size: number, fill: number, y: number) => {
    const l = fit(label(text, size, fill), width - 100);
    l.y = top + (y > 600 ? y + rules.grow : y); // what lies under the rules moves down
    box.addChild(l);
  };
  const l = w.challenge.loadout!;
  add(t('weekly.loadout'), 48, COLORS.text, 165);
  // the loadout's icons on one row, and their names under it
  const ids = [l.relic, `monk_${l.monk}`, ...l.sutras];
  ids.forEach((id, i) => {
    const s = iconSprite(icons, id, 110);
    if (!s) return;
    s.position.set((i - (ids.length - 1) / 2) * 150, top + 265);
    box.addChild(s);
  });
  add(`${t(`relic.${l.relic}.name` as never)} · ${t(`monk.${l.monk}.name` as never)}`, 44, COLORS.saffron, 360);
  add(l.sutras.map((s) => t(`spell.${s}.name` as never)).join(' · '), 40, COLORS.dim, 412);
  const mutator = mutatorLine(w.challenge.mutator);
  if (mutator) add(mutator, 38, COLORS.saffron, 462);
  rules.view.y = top + (mutator ? 492 : 455);
  box.addChild(rules.view);
  add(t('weekly.rewards'), 48, COLORS.text, 665);
  weeklyTiers().forEach((tier, i) => box.addChild(tierRow(t(tier.key as never), tier.jade, i, top + rules.grow + 740 + i * 68, icons)));
  if (w.state === 'update') add(t('weekly.update'), 44, COLORS.danger, 1025);
  else add(w.best > 0 ? t('weekly.best', { wave: w.best }) : t('weekly.noBest'), 46, w.best > 0 ? COLORS.saffron : COLORS.dim, 1025);
  let y = 1080;
  if (w.reply && w.state === 'open') {
    add(t('weekly.rank', { rank: w.reply.rank, total: w.reply.total }), 42, COLORS.text, y);
    y += 52;
  }
  add(w.days > 0 ? t('weekly.ends', { d: w.days, h: w.hours }) : t('challenge.ends', { h: w.hours }), 40, COLORS.dim, y); // no "0d" on the last day
  const buttons: Container[] = [];
  if (w.state === 'open') buttons.push(button(t('lobby.play'), 420, 125, actions.play, { fill: COLORS.saffron, size: 60 }));
  if (actions.ranks) buttons.push(button(t('board.button'), 360, 125, actions.ranks, { fill: COLORS.panelLocked, size: 52 }));
  buttons.forEach((b, i) => {
    b.position.set(buttons.length === 1 ? 0 : i === 0 ? -200 : 220, top + rules.grow + 1235);
    box.addChild(b);
  });
}

/** A reward tier's row: its name at the left, its jade at the right; the medal it earns beside the name. */
function tierRow(name: string, jade: number, tier: number, y: number, icons: IconSheet): Container {
  const row = new Container();
  row.y = y;
  const medal = markMedal(tier, 22);
  if (medal) {
    medal.x = -380;
    row.addChild(medal);
  }
  const text = label(name, 42, COLORS.text, { align: 'left' });
  text.anchor.set(0, 0.5);
  text.x = -340;
  row.addChild(text);
  const s = iconSprite(icons, 'jade', 52);
  if (s) {
    s.x = 230;
    row.addChild(s);
  }
  const n = label(`+${jade}`, 42, COLORS.jade);
  n.anchor.set(0, 0.5);
  n.x = 270;
  row.addChild(n);
  return row;
}

const CLAIM_W = 880;
const CLAIM_H = 760;

/** The card paying closed week `c` over the lobby (`w` by `h`): its rank and medal, the jade, and Claim. */
export function claimCard(w: number, h: number, c: WeekClaim, icons: IconSheet, take: () => void): Container {
  const root = new Container();
  root.addChild(backdrop(w, h));
  const box = new Container();
  box.position.set(w / 2, h / 2);
  const top = -CLAIM_H / 2;
  box.addChild(panel(CLAIM_W, CLAIM_H));
  const title = fit(label(t('weekly.claimTitle'), 64, COLORS.saffron), CLAIM_W - 80);
  title.y = top + 85;
  box.addChild(title);
  const medal = markMedal(c.tier, 70);
  if (medal) {
    medal.y = top + 230;
    box.addChild(medal);
  }
  const line = fit(label(c.rank > 0 ? t('weekly.claimRank', { rank: c.rank, total: c.total }) : t('weekly.claimNoRank'), 46, COLORS.text), CLAIM_W - 80);
  line.y = top + (medal ? 360 : 260);
  box.addChild(line);
  const gain = new Container();
  gain.y = top + (medal ? 470 : 400);
  const s = iconSprite(icons, 'jade', 80);
  const n = label(`+${c.jade}`, 72, COLORS.jade);
  n.anchor.set(0, 0.5);
  if (s) {
    s.x = -n.width / 2 - 20;
    gain.addChild(s);
  }
  n.x = s ? -n.width / 2 + 40 : -n.width / 2;
  gain.addChild(n);
  box.addChild(gain);
  const claim = button(t('weekly.claim'), 420, 140, take, { fill: COLORS.saffron, size: 60 });
  claim.y = top + CLAIM_H - 120;
  box.addChild(claim);
  root.addChild(box);
  return root;
}
