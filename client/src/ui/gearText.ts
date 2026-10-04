import { t } from '../i18n';
import { isRelic, type ItemId, type Tier } from '../meta/gear';

// Names and colours for gear in the UI (docs/design.md "Merge screen and effect": tier
// colours are UI only, never drawn in the world).

/** Common grey, Fine green, Refined blue, Treasured purple, Sacred gold. */
export const TIER_COLORS: readonly number[] = [0xa0a8a4, 0x5ccf6a, 0x4f9df0, 0xb06cf0, 0xffd040];

export function itemName(item: ItemId): string {
  return isRelic(item) ? t(`relic.${item}.name`) : t(`gear.item.${item}`);
}

export function tierName(tier: Tier): string {
  return t(`tier.${tier}`);
}
