import { describe, expect, it } from 'vitest';
import { formatAmount, t } from '../i18n';
import { BALANCE } from '../meta/balance';
import { chestContents, copperChestPrice } from '../meta/shop';
import { buttonNear, doubleTap, fakeAds, lobbyRig, openTab, reload, tapAt, wallet, words } from '../testkit/lobbyRig';
import type { ShellRig } from '../testkit/testShell';

const JADE = BALANCE.shop.jadeChest.jade;

/** The Open button of the chest card named `t('shop.<kind>')`. */
function chest(rig: ShellRig, kind: 'free' | 'ad' | 'jade' | 'copper') {
  const text = kind === 'jade' ? t('shop.price', { jade: JADE })
    : kind === 'copper' ? t('shop.copperPrice', { copper: formatAmount(copperChestPrice(rig.store.load())) }) : t('shop.open');
  return buttonNear(rig, text, t(`shop.${kind}`));
}

/** Gear pieces in the bag, counting every tier. */
function pieces(rig: ShellRig): number {
  return Object.values(rig.store.load().gear).flat().reduce((sum: number, n) => sum + (n as number), 0);
}

/** Closes the haul panel a chest opened. */
async function takeHaul(rig: ShellRig): Promise<void> {
  await rig.until(() => rig.texts().includes(t('haul.ok')));
  tapAt(rig.app.stage, buttonNear(rig, t('haul.ok'), t('haul.ok')));
  await rig.tick(2);
}

describe('the shop, tapped through', { timeout: 30_000 }, () => {
  it('opens the free chest once a day: copper and a piece, a double tap pays once, the card says tomorrow', async () => {
    const rig = await lobbyRig({ jade: 0, copper: 50 });
    await openTab(rig, 'shop');
    const { copper } = chestContents(rig.store.load(), 'free');
    const before = pieces(rig);
    await doubleTap(rig, chest(rig, 'free'));
    await takeHaul(rig);
    const save = rig.store.load();
    expect(save.copper).toBe(50 + copper);
    expect(pieces(rig)).toBe(before + BALANCE.shop.freeChest.drops);
    expect(save.daily.free).toBe(1);
    expect(wallet(rig).copper).toBe(formatAmount(50 + copper));
    expect(words(rig)).toContain(t('shop.tomorrow'));
    // the used card still answers a tap, with a toast and no second chest
    tapAt(rig.app.stage, chest(rig, 'free'));
    await rig.tick(2);
    expect(rig.store.load().copper).toBe(50 + copper);
    expect(words(rig).filter((s) => s === t('shop.tomorrow')).length).toBeGreaterThan(1);
    const again = await reload(rig);
    await openTab(again, 'shop');
    expect(again.store.load().daily.free).toBe(1);
    expect(words(again)).toContain(t('shop.tomorrow'));
    expect(wallet(again).copper).toBe(formatAmount(50 + copper));
    expect([...rig.faults, ...again.faults]).toEqual([]);
  });

  it('spends the jade chest\'s price once per tap, never below zero', async () => {
    const rig = await lobbyRig({ jade: JADE + 30, copper: 0 });
    await openTab(rig, 'shop');
    const before = pieces(rig);
    // the haul panel covers the shop: the second tap of a double tap lands on it, not on the card
    await doubleTap(rig, chest(rig, 'jade'));
    expect(rig.store.load().jade).toBe(30);
    expect(pieces(rig)).toBe(before + BALANCE.shop.jadeChest.drops);
    await takeHaul(rig);
    expect(wallet(rig).jade).toBe('30');
    // short of the price: a toast, and the jade stays put
    tapAt(rig.app.stage, chest(rig, 'jade'));
    await rig.tick(2);
    expect(words(rig)).toContain(t('shop.noJade'));
    expect(rig.store.load().jade).toBe(30);
    expect(pieces(rig)).toBe(before + BALANCE.shop.jadeChest.drops);
    const again = await reload(rig);
    expect(again.store.load().jade).toBe(30);
    expect(wallet(again).jade).toBe('30');
    expect([...rig.faults, ...again.faults]).toEqual([]);
  });

  it('sells copper chests for copper up to the day\'s limit, a toast when the copper is short', async () => {
    const per = BALANCE.shop.copperChest.perDay;
    const rig = await lobbyRig({ copper: 0 });
    const price = copperChestPrice(rig.store.load());
    rig.store.save({ ...rig.store.load(), copper: price * per + price - 1 });
    const fresh = await reload(rig);
    await openTab(fresh, 'shop');
    expect(words(fresh)).toContain(t('shop.left', { n: per }));
    const before = pieces(fresh);
    for (let i = 0; i < per - 1; i++) {
      await doubleTap(fresh, chest(fresh, 'copper'));
      await takeHaul(fresh);
    }
    expect(fresh.store.load().copper).toBe(price * 2 - 1);
    expect(words(fresh)).toContain(t('shop.left', { n: 1 }));
    // one more than the copper buys: the last chest of the day waits, the copper stays put
    rig.store.save({ ...fresh.store.load(), copper: price - 1 });
    const short = await reload(fresh);
    await openTab(short, 'shop');
    tapAt(short.app.stage, chest(short, 'copper'));
    await short.tick(2);
    expect(words(short)).toContain(t('gear.noCopper'));
    expect(short.store.load().copper).toBe(price - 1);
    short.store.save({ ...short.store.load(), copper: price });
    const last = await reload(short);
    await openTab(last, 'shop');
    tapAt(last.app.stage, chest(last, 'copper'));
    await takeHaul(last);
    expect(last.store.load()).toMatchObject({ copper: 0, daily: { copperChests: per } });
    expect(pieces(last)).toBe(before + per * BALANCE.shop.copperChest.drops);
    expect(words(last)).toContain(t('shop.tomorrow'));
    expect([...rig.faults, ...fresh.faults, ...short.faults, ...last.faults]).toEqual([]);
  });

  it('pays the ad chest only for an ad watched to the end, one ad per double tap', async () => {
    const ads = fakeAds();
    const rig = await lobbyRig({ jade: 5 }, { ads });
    await openTab(rig, 'shop');
    await rig.until(() => rig.texts().includes(t('shop.ad')));
    const per = BALANCE.shop.adChest.perDay;
    expect(words(rig)).toContain(t('shop.left', { n: per }));
    // closed early: nothing paid, nothing counted, the card offers it again
    await doubleTap(rig, chest(rig, 'ad'));
    expect(ads.plays).toBe(1);
    expect(words(rig)).toContain('…');
    ads.finish(false);
    await rig.tick(2);
    expect(rig.store.load().jade).toBe(5);
    expect(rig.store.load().daily.adChests).toBe(0);
    expect(words(rig)).toContain(t('shop.left', { n: per }));
    // watched: the chest's jade, one fewer left
    await doubleTap(rig, chest(rig, 'ad'));
    expect(ads.plays).toBe(2);
    ads.finish(true);
    await takeHaul(rig);
    const jade = 5 + BALANCE.shop.adChest.jade;
    expect(rig.store.load().jade).toBe(jade);
    expect(rig.store.load().daily.adChests).toBe(1);
    expect(words(rig)).toContain(t('shop.left', { n: per - 1 }));
    expect(wallet(rig).jade).toBe(String(jade));
    const again = await reload(rig, { ads: fakeAds() });
    await openTab(again, 'shop');
    await again.until(() => words(again).includes(t('shop.left', { n: per - 1 })));
    expect(again.store.load().jade).toBe(jade);
    expect([...rig.faults, ...again.faults]).toEqual([]);
  });

  it('stops the ad chest at the day\'s limit', async () => {
    const ads = fakeAds();
    const per = BALANCE.shop.adChest.perDay;
    const rig = await lobbyRig({}, { ads });
    const day = rig.store.load().daily;
    rig.store.save({ ...rig.store.load(), daily: { ...day, adChests: per - 1 } });
    const fresh = await reload(rig, { ads });
    await openTab(fresh, 'shop');
    await fresh.until(() => words(fresh).includes(t('shop.left', { n: 1 })));
    tapAt(fresh.app.stage, chest(fresh, 'ad'));
    await fresh.tick(2);
    ads.finish(true);
    await takeHaul(fresh);
    expect(fresh.store.load().daily.adChests).toBe(per);
    tapAt(fresh.app.stage, chest(fresh, 'ad'));
    await fresh.tick(2);
    expect(ads.plays).toBe(1);
    expect(fresh.store.load().daily.adChests).toBe(per);
    expect(fresh.faults).toEqual([]);
  });
});
