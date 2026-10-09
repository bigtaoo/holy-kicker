import { Container, Graphics } from 'pixi.js';
import { t } from '../i18n';
import type { Store } from '../platform/types';
import { COLORS, button, fit, label, panel, videoBadge } from './widgets';

// The Shop tab's ad-free card (docs/ios.md "The ad-free card"), iOS only: the price as the App
// Store writes it and Buy, with Restore under it; once owned, a thank-you instead. The purchase
// itself and its toasts are EconomyUi's (lobbyEconomy.ts).

export interface AdFreeActions {
  buy(): void;
  restore(): void;
  toast(text: string): void;
}

/** A video badge struck through: no more ads. */
function noAdsIcon(h: number): Container {
  const c = new Container();
  c.addChild(videoBadge(h, COLORS.text));
  const r = h * 0.8;
  c.addChild(new Graphics().moveTo(-r, r * 0.7).lineTo(r, -r * 0.7).stroke({ width: h * 0.16, color: COLORS.danger, cap: 'round' }));
  return c;
}

/** The card, `w` by `h`, centred on (0, 0). `busy`: a buy or a restore is under way. */
export function adFreeCard(store: Store, busy: boolean, w: number, h: number, a: AdFreeActions): Container {
  const card = new Container();
  card.addChild(panel(w, h));
  const icon = noAdsIcon(90);
  icon.x = -380;
  card.addChild(icon);
  const owned = store.owned();
  const lines: [string, number, number][] = [
    [t('shop.adFree'), 56, COLORS.text],
    [t('shop.adFreeInfo'), 40, COLORS.dim],
    owned ? [t('shop.adFreeOwned'), 38, COLORS.saffron] : [t('shop.adFreeCaps'), 38, COLORS.dim],
  ];
  lines.forEach(([text, size, fill], i) => {
    const l = fit(label(text, size, fill, { align: 'left' }), 420);
    l.anchor.set(0, 0.5);
    l.position.set(-270, -80 + i * 75);
    card.addChild(l);
  });
  if (owned) {
    const b = button(t('shop.owned'), 300, 130, () => {}, { fill: COLORS.panelLocked, textFill: COLORS.dim, size: 48 });
    b.x = 320;
    b.eventMode = 'none';
    card.addChild(b);
    return card;
  }
  const price = store.price();
  const ok = price !== null && !busy;
  const buy = button(busy ? '…' : price ?? '…', 300, 130, () => (price === null ? a.toast(t('shop.storeOffline')) : a.buy()), {
    fill: ok ? COLORS.saffron : COLORS.panelLocked, textFill: ok ? COLORS.text : COLORS.dim, size: 48,
  });
  buy.position.set(320, -50);
  const restore = button(t('shop.restore'), 300, 90, () => a.restore(), { fill: COLORS.panelLocked, textFill: busy ? COLORS.dim : COLORS.text, size: 40 });
  restore.position.set(320, 85);
  if (busy) buy.eventMode = restore.eventMode = 'none';
  card.addChild(buy, restore);
  return card;
}
