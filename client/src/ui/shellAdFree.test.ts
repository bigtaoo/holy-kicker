import { describe, expect, it } from 'vitest';
import { t } from '../i18n';
import { MemoryStore } from '../meta/saveStore';
import type { PacedAds } from '../platform/adPacing';
import { AD_FREE_ID, AD_FREE_KEY } from '../platform/ios/storeKit';
import type { StoreState } from '../platform/ios/bridge';
import { fakeIosShell, fakeOta, forSale, iosHost, type FakeIosShell } from '../testkit/iosHost';
import { buttonNear, openTab, tapAt } from '../testkit/lobbyRig';
import { clearedChapterOne, deviceWith, endRun, findTap, rigShell, tapLabel, tapNamed, tapWhenUp, type ShellRig } from '../testkit/testShell';

// The iOS app's ad-free card as the player meets it on the Shop tab (docs/ios.md "The ad-free
// card"): the real Shell, StoreKit and AdMob under adFree over a faked shell bridge, with the
// store's redraw wired the way main.ios.ts wires it. Buy and Restore wait on Apple's sheet; the
// toast tells how it went; once owned, no interstitial plays and every rewarded offer pays at once,
// on this launch and the next, even before StoreKit has answered.

const PRICE = 'US$3.99';

/** A player past chapter 1 on the iOS app, on the Shop tab. */
async function shop(store: StoreState | null = forSale(AD_FREE_ID, PRICE), storage: MemoryStore = deviceWith(clearedChapterOne())) {
  const shell = fakeIosShell({ notify: 'on', store });
  const host = iosHost(shell, fakeOta({ manifest: null }), storage);
  const rig = await rigShell({ storage, ...host });
  // main.ios.ts: a price or ownership change redraws the lobby where it stands
  host.storeKit.onChange = () => rig.shell.redrawLobby();
  await rig.shell.start();
  await rig.until(() => rig.shell.place() === 'lobby');
  await rig.tick(2);
  await openTab(rig, 'shop');
  return { rig, shell, storage };
}

/** The ad-free card's button reading `text`. */
const onCard = (rig: ShellRig, text: string) => buttonNear(rig, text, t('shop.adFree'));

async function tapCard(rig: ShellRig, text: string): Promise<void> {
  tapAt(rig.app.stage, onCard(rig, text));
  await rig.tick(2);
}

/** Apple's sheet answers, and the lobby redraws. */
async function answer(rig: ShellRig, shell: FakeIosShell, r: Parameters<FakeIosShell['storeResult']>[0]): Promise<void> {
  shell.storeResult(r);
  await rig.tick(3);
}

const owned = (rig: ShellRig) => rig.texts().includes(t('shop.adFreeOwned'));

/** A purchase gone through: StoreKit pushes the entitlement, then the sheet says owned. */
async function bought(rig: ShellRig, shell: FakeIosShell): Promise<void> {
  await tapCard(rig, PRICE);
  shell.pushStore({ ...forSale(AD_FREE_ID, PRICE), owned: [AD_FREE_ID] });
  await answer(rig, shell, { op: 'buy', outcome: 'owned' });
}

/** A lost run, past the revive offer and the results; `interstitial` plays the break's ad when it comes. */
async function aRun(rig: ShellRig, shell: FakeIosShell): Promise<void> {
  // the break's ad is due: minutes of play behind
  (rig.shell as unknown as { ads: PacedAds }).ads.played(1e9);
  await openTab(rig, 'play');
  await tapNamed(rig, 'play');
  await rig.until(() => rig.shell.place() === 'run');
  endRun(rig, 'lost');
  await rig.until(() => rig.shell.place() === 'results' || rig.texts().includes(t('run.giveUp')));
  if (rig.shell.place() !== 'results') await tapWhenUp(rig, 'run.giveUp');
  await rig.until(() => rig.shell.place() === 'results');
  await rig.tick(30);
  const collect = rig.texts().find((x) => x.startsWith(t('results.collect', { n: 0 }).split('0')[0]));
  if (collect) tapLabel(rig.app.stage, 'results.collect', { n: Number(/\d+/.exec(collect)![0]) });
  else tapLabel(rig.app.stage, 'results.lobby');
  await rig.tick(3);
  if (shell.shown.at(-1) === 'interstitial') {
    shell.started('interstitial');
    shell.done('interstitial', true);
  }
  await rig.until(() => rig.shell.place() === 'lobby');
  await rig.tick(2);
}

describe('the ad-free card', { timeout: 30_000 }, () => {
  it('shows the App Store price; Buy waits on the sheet, and a purchase turns the card to owned', async () => {
    const { rig, shell, storage } = await shop();
    expect(rig.texts()).toContain(t('shop.adFree'));
    expect(rig.texts()).toContain(t('shop.adFreeCaps'));
    await tapCard(rig, PRICE);
    expect(shell.calls).toEqual([`buy ${AD_FREE_ID}`]);
    // busy: the price gives way to dots, and neither button takes another tap
    expect(rig.texts()).toContain('…');
    expect(findTap(rig.app.stage, '…')).toBeNull();
    expect(findTap(rig.app.stage, t('shop.restore'))).toBeNull();

    shell.pushStore({ ...forSale(AD_FREE_ID, PRICE), owned: [AD_FREE_ID] });
    await answer(rig, shell, { op: 'buy', outcome: 'owned' });
    // still on the Shop tab, told it went through
    expect(rig.texts()).toContain(t('shop.bought'));
    expect(owned(rig)).toBe(true);
    expect(rig.texts()).toContain(t('shop.owned'));
    expect(rig.texts()).not.toContain(PRICE);
    expect(storage.getItem(AD_FREE_KEY)).toBe('1');
    expect(rig.faults).toEqual([]);
  });

  it('a cancelled sheet says nothing; a failed or pending one says so; the price is back each time', async () => {
    const { rig, shell } = await shop();
    const toasts = [t('shop.bought'), t('shop.waiting'), t('shop.buyFailed')];
    await tapCard(rig, PRICE);
    await answer(rig, shell, { op: 'buy', outcome: 'cancelled' });
    expect(rig.texts().filter((x) => toasts.includes(x))).toEqual([]);
    expect(rig.texts()).toContain(PRICE);

    await tapCard(rig, PRICE);
    await answer(rig, shell, { op: 'buy', outcome: 'failed' });
    expect(rig.texts()).toContain(t('shop.buyFailed'));
    expect(rig.texts()).toContain(PRICE);

    // Ask to Buy: a parent approves later, and StoreKit pushes it then
    await tapCard(rig, PRICE);
    await answer(rig, shell, { op: 'buy', outcome: 'pending' });
    expect(rig.texts()).toContain(t('shop.waiting'));
    expect(owned(rig)).toBe(false);
    shell.pushStore({ ...forSale(AD_FREE_ID, PRICE), owned: [AD_FREE_ID] });
    await rig.tick(3);
    expect(owned(rig)).toBe(true);
    expect(shell.calls).toEqual([`buy ${AD_FREE_ID}`, `buy ${AD_FREE_ID}`, `buy ${AD_FREE_ID}`]);
    expect(rig.faults).toEqual([]);
  });

  it('Restore: nothing to restore, the store out of reach, or the card back', async () => {
    const { rig, shell } = await shop();
    await tapCard(rig, t('shop.restore'));
    expect(shell.calls).toEqual(['restore']);
    await answer(rig, shell, { op: 'restore', outcome: 'none' });
    expect(rig.texts()).toContain(t('shop.nothingToRestore'));

    await tapCard(rig, t('shop.restore'));
    await answer(rig, shell, { op: 'restore', outcome: 'failed' });
    expect(rig.texts()).toContain(t('shop.storeOffline'));

    // an answer to another sheet than the one up is not this one's
    await tapCard(rig, t('shop.restore'));
    await answer(rig, shell, { op: 'buy', outcome: 'owned' });
    expect(rig.texts()).toContain('…');
    shell.pushStore({ ...forSale(AD_FREE_ID, PRICE), owned: [AD_FREE_ID] });
    await answer(rig, shell, { op: 'restore', outcome: 'owned' });
    expect(rig.texts()).toContain(t('shop.restored'));
    expect(owned(rig)).toBe(true);
    expect(rig.faults).toEqual([]);
  });

  it('with no price (offline, or payments barred) Buy says the store is out of reach', async () => {
    const offline = await shop(null);
    expect(offline.rig.texts()).toContain(t('shop.adFree'));
    await tapCard(offline.rig, '…');
    expect(offline.rig.texts()).toContain(t('shop.storeOffline'));
    expect(offline.shell.calls).toEqual([]);

    const barred = await shop({ ...forSale(AD_FREE_ID, PRICE), canPay: false });
    expect(barred.rig.texts()).not.toContain(PRICE);
    await tapCard(barred.rig, '…');
    expect(barred.rig.texts()).toContain(t('shop.storeOffline'));
    expect(barred.shell.calls).toEqual([]);
    expect(offline.rig.faults).toEqual([]);
    expect(barred.rig.faults).toEqual([]);
  });

  it('once bought: no interstitial on the break, the ad chest pays at once, and the next launch knows it offline', async () => {
    const { rig, shell, storage } = await shop();
    // before: the break's ad plays, and the ad chest plays a rewarded ad
    await aRun(rig, shell);
    expect(shell.shown).toEqual(['interstitial']);
    await openTab(rig, 'shop');
    tapAt(rig.app.stage, buttonNear(rig, t('shop.open'), t('shop.ad')));
    await rig.tick(3);
    expect(shell.shown).toEqual(['interstitial', 'rewarded']);
    shell.started('rewarded');
    shell.done('rewarded', false);
    await rig.tick(3);

    await bought(rig, shell);
    shell.shown.length = 0;
    await aRun(rig, shell);
    expect(shell.shown).toEqual([]);
    await openTab(rig, 'shop');
    tapAt(rig.app.stage, buttonNear(rig, t('shop.open'), t('shop.ad')));
    await rig.until(() => rig.texts().includes(t('haul.ok')));
    expect(shell.shown).toEqual([]);
    expect(rig.faults).toEqual([]);

    // the next launch, before StoreKit has answered: the kept answer holds
    const again = await shop(null, storage);
    expect(owned(again.rig)).toBe(true);
    expect(again.rig.texts()).toContain(t('shop.owned'));
    await aRun(again.rig, again.shell);
    expect(again.shell.shown).toEqual([]);
    expect(again.rig.faults).toEqual([]);
  });

  it('a refund StoreKit pushes takes it back', async () => {
    const { rig, shell, storage } = await shop({ ...forSale(AD_FREE_ID, PRICE), owned: [AD_FREE_ID] });
    expect(owned(rig)).toBe(true);
    shell.pushStore(forSale(AD_FREE_ID, PRICE));
    await rig.tick(3);
    expect(owned(rig)).toBe(false);
    expect(rig.texts()).toContain(PRICE);
    expect(storage.getItem(AD_FREE_KEY)).toBe('0');
    expect(rig.faults).toEqual([]);
  });
});
