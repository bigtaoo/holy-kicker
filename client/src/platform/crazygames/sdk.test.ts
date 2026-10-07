import { describe, expect, it } from 'vitest';
import { CrazyGamesSdk, SDK_WAIT_MS, type CgSdkShape } from './sdk';

/** A clock that only moves when the code under test sleeps. */
function fakeTime() {
  let t = 0;
  return { now: () => t, sleep: async (ms: number) => void (t += ms) };
}

function make(sdk?: CgSdkShape) {
  const time = fakeTime();
  return { time, cg: new CrazyGamesSdk(sdk ? { CrazyGames: { SDK: sdk } } : {}, time.now, time.sleep) };
}

describe('CrazyGamesSdk', () => {
  it('gives up after the wait budget when the script never loads', async () => {
    const { cg, time } = make();
    expect(await cg.init()).toBe('disabled');
    expect(time.now()).toBeGreaterThanOrEqual(SDK_WAIT_MS);
    expect(cg.dataStore()).toBeNull();
    expect(await cg.requestAd('rewarded')).toBe(false);
  });

  it('does not hang on an init that never settles', async () => {
    const { cg } = make({ init: () => new Promise(() => {}), environment: 'crazygames' });
    expect(await cg.init()).toBe('crazygames');
  });

  it('reads an environment that only appears after init', async () => {
    const sdk: CgSdkShape = {};
    sdk.init = async () => {
      sdk.environment = 'local';
    };
    const { cg } = make(sdk);
    expect(await cg.init()).toBe('local');
  });

  it('pays a rewarded ad only when it finished', async () => {
    let mode: 'finish' | 'error' | 'throw' = 'finish';
    const { cg } = make({
      environment: 'crazygames',
      ad: {
        requestAd: (_type, cb) => {
          if (mode === 'throw') throw new Error('boom');
          cb.adStarted?.();
          if (mode === 'finish') cb.adFinished?.();
          else cb.adError?.('no fill');
        },
      },
    });
    await cg.init();
    let started = 0;
    expect(await cg.requestAd('rewarded', { adStarted: () => started++ })).toBe(true);
    // the game mutes on adStarted, so an unfilled ad never silences it
    expect(started).toBe(1);
    mode = 'error';
    expect(await cg.requestAd('rewarded')).toBe(false);
    mode = 'throw';
    expect(await cg.requestAd('rewarded')).toBe(false);
  });

  it('knows Basic Launch serves no ads, asking only once', async () => {
    let asked = 0;
    const prefetchAd = () => {
      asked++;
      throw Object.assign(new Error('ads disabled'), { code: 'adsDisabledBasicLaunch' });
    };
    const basic = make({ environment: 'crazygames', ad: { prefetchAd } }).cg;
    await basic.init();
    expect(basic.adsAllowed()).toBe(false);
    expect(basic.adsAllowed()).toBe(false);
    expect(asked).toBe(1);
    // any other failure, or an SDK without prefetchAd, still offers ads and lets them fail
    const odd = make({ environment: 'crazygames', ad: { prefetchAd: () => { throw new Error('x'); } } }).cg;
    await odd.init();
    expect(odd.adsAllowed()).toBe(true);
    const full = make({ environment: 'crazygames', ad: {} }).cg;
    await full.init();
    expect(full.adsAllowed()).toBe(true);
  });

  it('exposes the data module and the username', async () => {
    const map = new Map<string, string>();
    const { cg } = make({
      environment: 'crazygames',
      data: { getItem: (k) => map.get(k) ?? null, setItem: (k, v) => void map.set(k, v) },
      user: { getUser: async () => ({ username: 'kicker42' }) },
    });
    await cg.init();
    const store = cg.dataStore();
    store?.setItem('hk.save', '{}');
    expect(store?.getItem('hk.save')).toBe('{}');
    expect(await cg.userName()).toBe('kicker42');
  });

  it('treats a guest and a broken user module alike', async () => {
    const { cg } = make({ environment: 'crazygames', user: { getUser: async () => { throw new Error('x'); } } });
    await cg.init();
    expect(await cg.userName()).toBeNull();
  });

  it('says whether the page offers accounts, and no without the SDK', async () => {
    const on = make({ environment: 'crazygames', user: { isUserAccountAvailable: true } }).cg;
    await on.init();
    expect(on.accountsAvailable()).toBe(true);
    const partner = make({ environment: 'crazygames', user: { isUserAccountAvailable: false } }).cg;
    await partner.init();
    expect(partner.accountsAvailable()).toBe(false);
    const off = make({ environment: 'disabled', user: { isUserAccountAvailable: true } }).cg;
    await off.init();
    expect(off.accountsAvailable()).toBe(false);
  });

  it('reads the portal locale and device, and nothing without the SDK', async () => {
    const { cg } = make({ environment: 'crazygames', user: { systemInfo: { locale: 'de-DE', device: { type: 'tablet' } } } });
    await cg.init();
    expect(cg.locale()).toBe('de-DE');
    expect(cg.deviceType()).toBe('tablet');
    const bare = make();
    await bare.cg.init();
    expect(bare.cg.locale()).toBeNull();
    expect(bare.cg.deviceType()).toBeNull();
  });
});
