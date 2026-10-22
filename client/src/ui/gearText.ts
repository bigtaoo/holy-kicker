import { formatAmount, t } from '../i18n';
import { canMerge, isRelic, TIERS, type Drop, type ItemId, type Tier } from '../meta/gear';
import type { Haul } from '../meta/haul';
import type { SaveData } from '../meta/save';

// Names and colours for gear in the UI (docs/design.md "Merge screen and effect": tier
// colours are UI only, never drawn in the world).

/** Common grey, Fine green, Refined blue, Treasured purple, Sacred gold. */
export const TIER_COLORS: readonly number[] = [0xa0a8a4, 0x5ccf6a, 0x4f9df0, 0xb06cf0, 0xffd040, 0xff7a3a, 0xff4f8a, 0x6ff2ff];

/** Whether some tier of the item can merge now (the slot's dot, "Merge all"). */
export function mergeReady(save: SaveData, item: ItemId): boolean {
  for (let k = 0; k < TIERS - 1; k++) if (canMerge(save, item, k as Tier)) return true;
  return false;
}

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

/** A welcome gift's name for one line: its monk, else its gear, else its coins. */
export function haulName(h: Haul): string {
  if (h.monk) return t(`monk.${h.monk}.name`);
  const d = h.drops[0];
  if (d) return dropName(d);
  return h.jade > 0 ? t('haul.jade', { n: formatAmount(h.jade) }) : t('haul.copper', { n: formatAmount(h.copper) });
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
