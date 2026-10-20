import { t } from '../i18n';
import { isRelic, type Drop, type ItemId, type Tier } from '../meta/gear';

// Names and colours for gear in the UI (docs/design.md "Merge screen and effect": tier
// colours are UI only, never drawn in the world).

/** Common grey, Fine green, Refined blue, Treasured purple, Sacred gold. */
export const TIER_COLORS: readonly number[] = [0xa0a8a4, 0x5ccf6a, 0x4f9df0, 0xb06cf0, 0xffd040];

export function itemName(item: ItemId): string {
  return isRelic(item) ? t(`relic.${item}.name`) : t(`gear.item.${item}`);
}

/** A tier's name standing alone, as in the gear tab's columns (the first of its '|' forms). */
export function tierName(tier: Tier): string {
  return t(`tier.${tier}`).split('|')[0]!;
}

/** One item, as "Refined Jade Pendant": in each language's word order, the tier agreeing with the item. */
export function dropName(d: Drop): string {
  const forms = t(`tier.${d.tier}`).split('|');
  const tier = forms[Number(t(`gear.form.${d.item}`))] ?? forms[0]!;
  return t('gear.drop', { tier, item: itemName(d.item) });
}

/** One line per item and tier found, the best first, with its colour. */
export function dropLines(drops: readonly Drop[]): [string, number][] {
  const seen = new Map<string, { d: Drop; n: number }>();
  for (const d of [...drops].sort((a, b) => b.tier - a.tier)) {
    const key = `${d.tier}|${d.item}`;
    const e = seen.get(key);
    if (e) e.n++;
    else seen.set(key, { d, n: 1 });
  }
  return [...seen.values()].map(({ d, n }) => [`${dropName(d)}${n > 1 ? ` ${t('gear.count', { n })}` : ''}`, TIER_COLORS[d.tier]]);
}
