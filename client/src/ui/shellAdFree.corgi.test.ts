import { afterEach, describe, expect, it, vi } from 'vitest';
import { t } from '../i18n';
import { monk } from '../platform/ios/apps.json';
import { findOta } from '../platform/ios/ota';
import { AD_FREE_ID } from '../platform/ios/storeKit';
import { fakeIosShell, fakeOta, forSale, iosHost } from '../testkit/iosHost';
import { buttonNear, openTab, tapAt } from '../testkit/lobbyRig';
import { clearedChapterOne, deviceWith, rigShell } from '../testkit/testShell';

// Corgi Commando, the corgi's own iOS app (docs/ios.md "Second app"): the same card and hot
// updates under its own ids, from apps.json, as `npm run build:ios:new` folds them in. The
// monk's purchase is another app's and counts for nothing here.
vi.mock('../theme', async (original) => ({ ...(await original<typeof import('../theme')>()), THEME: 'corgi' }));
vi.mock('../platform/ios/app', async () => ({ IOS_APP: (await import('../platform/ios/apps.json')).corgi }));

afterEach(() => vi.unstubAllGlobals());

const CORGI_AD_FREE = 'com.gamestao.corgi.adfree';

describe('the corgi app', () => {
  it('sells its own ad-free card, and the monk app\'s purchase does not count', async () => {
    expect(AD_FREE_ID).toBe(CORGI_AD_FREE);
    const storage = deviceWith(clearedChapterOne());
    const shell = fakeIosShell({ notify: 'on', store: { products: [{ id: monk.adFree, price: 'US$2.99' }, { id: CORGI_AD_FREE, price: 'US$3.99' }], owned: [monk.adFree], canPay: true } });
    const host = iosHost(shell, fakeOta({ manifest: null }), storage);
    const rig = await rigShell({ storage, ...host });
    host.storeKit.onChange = () => rig.shell.redrawLobby();
    await rig.shell.start();
    await rig.until(() => rig.shell.place() === 'lobby');
    await rig.tick(2);
    await openTab(rig, 'shop');
    expect(rig.texts()).toContain('US$3.99');
    expect(rig.texts()).not.toContain(t('shop.adFreeOwned'));

    tapAt(rig.app.stage, buttonNear(rig, 'US$3.99', t('shop.adFree')));
    await rig.tick(2);
    expect(shell.calls).toEqual([`buy ${CORGI_AD_FREE}`]);
    shell.pushStore({ ...forSale(CORGI_AD_FREE), owned: [CORGI_AD_FREE] });
    shell.storeResult({ op: 'buy', outcome: 'owned' });
    await rig.tick(3);
    expect(rig.texts()).toContain(t('shop.adFreeOwned'));
    expect(rig.faults).toEqual([]);
  });

  it('reads its hot updates from its own host', async () => {
    const urls: string[] = [];
    vi.stubGlobal('fetch', async (url: string) => {
      urls.push(url);
      return new Response(JSON.stringify({ version: '1.0.4.4', url: 'https://corgi-ota.gamestao.com/b.zip', checksum: 'ab12' }));
    });
    const ota = fakeOta({ running: '1.0.4.3' });
    const found = await findOta('1.0.4.3', true, ota.updater, undefined, deviceWith(clearedChapterOne()), 6);
    expect(found?.version).toBe('1.0.4.4');
    expect(urls).toEqual(['https://corgi-ota.gamestao.com/manifest.json?v=1.0.4.3']);
  });
});
