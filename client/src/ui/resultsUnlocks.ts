import { Container, Graphics, type Text } from 'pixi.js';
import { t } from '../i18n';
import type { Tier } from '../meta/gear';
import type { Unlock } from '../meta/unlocks';
import { iconSprite, type IconSheet } from './buildBar';
import { sutraName } from './cardText';
import { tierName, TIER_COLORS } from './gearText';
import { statArgs } from './monkPanel';
import type { Part } from './resultsParts';
import { starRow } from './stars';
import { statLines } from './statText';
import { COLORS, fit, label, shade } from './widgets';

// The results screen's unlock moment (docs/unlocks.md): one strip per thing the run unlocked,
// its picture on the left, what it is in gold and one line on what it means under it.

const STRIP_H = 150;
/** Where the line under the title starts in its strip. */
const SUB_TOP = 78;
const GAP = 16;

/** The picture, the title and the line under it for one unlock. */
function content(u: Unlock, icons: IconSheet): { icon: Container; title: string; color: number; line: string } {
  switch (u.kind) {
    case 'relic':
      return { icon: iconOr(icons, u.id), title: t('results.newRelic', { name: t(`relic.${u.id}.name`) }), color: COLORS.gold, line: t(`relic.${u.id}.desc`) };
    case 'sutra':
      return { icon: iconOr(icons, u.id), title: t('results.newSutra', { name: sutraName(u.id) }), color: COLORS.gold, line: t('results.sutraCards') };
    case 'monk':
      return { icon: iconOr(icons, `monk_${u.id}`, 1.2), title: t('results.newMonk', { name: t(`monk.${u.id}.name`) }), color: COLORS.gold, line: t(`monk.${u.id}.role`, statArgs(u.id)) };
    case 'tier': {
      const color = TIER_COLORS[u.tier];
      const gem = new Graphics()
        .roundRect(-52, -52, 104, 104, 20).fill(shade(color, -0.55)).stroke({ color, width: 7 })
        .poly([0, -32, 28, 0, 0, 32, -28, 0]).fill(color).stroke({ color: COLORS.outline, width: 5, join: 'round' });
      return { icon: gem, title: t('results.newTier', { tier: tierName(u.tier as Tier) }), color, line: t('results.tierMore') };
    }
    case 'blessing': {
      const star = starRow(1, 96).getChildAt(0) as Container;
      star.x = 0;
      const holder = new Container();
      holder.addChild(star);
      return { icon: holder, title: t('results.blessing'), color: COLORS.gold, line: t('results.blessingStat', { stats: statLines({ [u.stat]: u.n }).join('  ·  ') }) };
    }
  }
}

/** The icon `id` from the sheet at about 110 units (times `k`), or an empty spot while the sheet lacks it. */
function iconOr(icons: IconSheet, id: string, k = 1): Container {
  return iconSprite(icons, id, 110 * k) ?? new Container();
}

/** The unlocks as strips down the card, or null when the run unlocked nothing. */
export function unlocksPart(unlocks: readonly Unlock[], icons: IconSheet, width: number): Part | null {
  if (unlocks.length === 0) return null;
  const c = new Container();
  let y = 0;
  for (const u of unlocks) {
    const { icon, title, color, line } = content(u, icons);
    const textX = -width / 2 + 170;
    const textW = width / 2 - 30 - textX;
    const head: Text = fit(label(title, 52, color, { stroke: { color: COLORS.outline, width: 6 } }), textW);
    head.anchor.set(0, 0.5);
    head.position.set(textX, y + 50);
    // a line that wraps grows its strip rather than running into the title
    const sub: Text = fit(label(line, 48, COLORS.dim, { align: 'left' }), textW);
    sub.anchor.set(0, 0);
    sub.position.set(textX, y + SUB_TOP);
    const h = Math.max(STRIP_H, SUB_TOP + sub.height + 18);
    icon.position.set(-width / 2 + 85, y + h / 2);
    const strip = new Graphics().roundRect(-width / 2, y, width, h, 28).fill({ color: COLORS.outline, alpha: 0.35 }).stroke({ color, width: 4 });
    c.addChild(strip, icon, head, sub);
    y += h + GAP;
  }
  return [c, y - GAP];
}
