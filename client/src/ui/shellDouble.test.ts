import { describe, expect, it } from 'vitest';
import { t } from '../i18n';
import { fakeAds, lobbyRig, type FakeAds } from '../testkit/lobbyRig';
import { clearedChapterOne, deviceWith, endRun, findTap, rigShell, tap, tapNamed, tapWhenUp, type ShellRig } from '../testkit/testShell';

// The results' rewarded "double copper" offer on the real Shell: the button waits on the ad while
// it plays, a paid ad adds the run's copper once more to the save and the count shows twice the
// pay, a skipped or unfilled one keeps the offer for another try, and a second tap pays nothing
// more. The same for a challenge's results, and the desktop's keys on both.

/** The hero of the run in play falls at `wave`; with the ad's revive on offer, the player gives up. */
async function fallAt(rig: ShellRig, wave: number): Promise<void> {
  await rig.until(() => rig.shell.place() === 'run');
  rig.shell.run!.engine.state.wave = wave;
  endRun(rig, 'lost');
  await rig.until(() => rig.shell.place() === 'results' || findTap(rig.app.stage, t('run.giveUp')) !== null);
  if (rig.shell.place() === 'run') tap(findTap(rig.app.stage, t('run.giveUp'))!);
  await rig.until(() => rig.shell.place() === 'results');
}

/** A lost run of the lobby's chapter at `wave`, up to its results with the ad offered and the parts all in. */
async function lostRun(rig: ShellRig, wave = 6): Promise<void> {
  await tapNamed(rig, 'play');
  await fallAt(rig, wave);
  await rig.until(() => findTap(rig.app.stage, t('results.double')) !== null);
  await rig.tick(240);
}

/** The ad offer, which must be on screen. */
function offer(rig: ShellRig) {
  const b = findTap(rig.app.stage, t('results.double'));
  if (!b) throw new Error(`no double offer: ${JSON.stringify(rig.texts())}`);
  return b;
}

/** Pays the ad playing now and lets the results lay out again. */
async function finish(rig: ShellRig, ads: FakeAds, paid: boolean): Promise<void> {
  ads.finish(paid);
  await rig.tick(2);
}

describe('the results double', { timeout: 30000 }, () => {
  it('waits on the ad, pays one more copper reward once, and counts up to twice the pay', async () => {
    const ads = fakeAds();
    const rig = await lobbyRig({}, { ads });
    await lostRun(rig);
    const before = rig.store.load().copper;
    const shown = rig.texts().filter((s) => /^\+\d+$/.test(s));

    // a double tap: the second lands on a button already waiting on the ad
    const b = offer(rig);
    tap(b);
    tap(b);
    await rig.tick(1);
    expect(ads.plays).toBe(1);
    expect(rig.texts()).toContain('…');
    expect(findTap(rig.app.stage, t('results.double'))).toBeNull();
    // nothing else takes a tap while it plays
    expect(findTap(rig.app.stage, '…')).toBeNull();

    await finish(rig, ads, true);
    const paid = rig.store.load().copper - before;
    expect(paid).toBeGreaterThan(0);
    // the count that showed before was the run's pay, now shown twice over
    expect(shown).toContain(`+${paid}`);
    await rig.tick(240);
    expect(rig.texts()).toContain(`+${2 * paid}`);
    expect(rig.texts()).toContain(t('results.doubled'));
    // the offer is spent
    expect(findTap(rig.app.stage, t('results.double'))).toBeNull();
    expect(ads.plays).toBe(1);
    expect(rig.store.load().copper).toBe(before + paid);
    expect(rig.faults).toEqual([]);
  });

  it('keeps the offer after a skipped or unfilled ad, for one more try', async () => {
    const ads = fakeAds();
    const rig = await lobbyRig({}, { ads });
    await lostRun(rig);
    const before = rig.store.load().copper;
    tap(offer(rig));
    await finish(rig, ads, false);
    expect(rig.store.load().copper).toBe(before);
    expect(rig.texts()).not.toContain(t('results.doubled'));
    tap(offer(rig));
    expect(ads.plays).toBe(2);
    await finish(rig, ads, true);
    expect(rig.store.load().copper).toBeGreaterThan(before);
    expect(rig.texts()).toContain(t('results.doubled'));
  });

  it('a host that throws mid-ad pays nothing and keeps the offer', async () => {
    const ads = fakeAds();
    let throws = true;
    const rewarded = ads.rewarded.bind(ads);
    ads.rewarded = (started) => (throws ? Promise.reject(new Error('host')) : rewarded(started));
    const rig = await lobbyRig({}, { ads });
    await lostRun(rig);
    const before = rig.store.load().copper;
    tap(offer(rig));
    await rig.tick(2);
    expect(rig.store.load().copper).toBe(before);
    throws = false;
    tap(offer(rig));
    await finish(rig, ads, true);
    expect(rig.store.load().copper).toBeGreaterThan(before);
    expect(rig.faults).toEqual([]);
  });

  it('offers nothing to double for a run that paid no copper', async () => {
    const ads = fakeAds();
    const rig = await lobbyRig({}, { ads });
    await tapNamed(rig, 'play');
    // a fall before the first wave is cleared pays nothing
    await fallAt(rig, 1);
    await rig.tick(60);
    expect(rig.texts()).toContain('+0');
    expect(findTap(rig.app.stage, t('results.double'))).toBeNull();
  });
});

describe('the results keys on a desktop', { timeout: 30000 }, () => {
  /** A desktop shell in the lobby, its rewarded ad the test's. */
  async function desktop(ads: FakeAds): Promise<ShellRig> {
    const rig = await rigShell({ storage: deviceWith(clearedChapterOne()), ads, device: 'desktop' });
    await rig.shell.start();
    await rig.until(() => rig.shell.place() === 'lobby');
    return rig;
  }

  it('wait out the ad, then Escape goes to the lobby', async () => {
    const ads = fakeAds();
    const rig = await desktop(ads);
    await lostRun(rig);
    tap(offer(rig));
    rig.platform.press('Escape');
    rig.platform.press('Enter');
    await rig.tick(2);
    expect(rig.shell.place()).toBe('results');
    await finish(rig, ads, false);
    // the rewarded ad has no key
    rig.platform.press('Enter');
    rig.platform.press('Escape');
    expect(ads.plays).toBe(1);
    await rig.until(() => rig.shell.place() === 'lobby');
    expect(rig.faults).toEqual([]);
  });

  it('Enter shows every part first, then takes the leading button', async () => {
    const ads = fakeAds();
    const rig = await desktop(ads);
    await tapNamed(rig, 'play');
    await fallAt(rig, 6);
    await rig.tick(2);
    // while the parts come in, the first press only shows them
    rig.platform.press('Enter');
    await rig.tick(2);
    expect(rig.shell.place()).toBe('results');
    // with something to collect the lobby leads, else Play again
    const collect = t('results.collect', { n: 0 }).split('0')[0];
    const toLobby = rig.texts().some((s) => s.startsWith(collect));
    rig.platform.press('Enter');
    await rig.until(() => rig.shell.place() !== 'results');
    expect(rig.shell.place()).toBe(toLobby ? 'lobby' : 'run');
    expect(rig.faults).toEqual([]);
  });
});

describe('the challenge results double', { timeout: 30000 }, () => {
  /** The day's challenge (made up on the device) played to a fall at wave 6, up to its results with the ad offered. */
  async function challengeFall(ads: FakeAds, device: 'mobile' | 'desktop' = 'mobile'): Promise<ShellRig> {
    const rig = await rigShell({ storage: deviceWith(clearedChapterOne()), query: '?challenge', ads, device });
    await rig.shell.start();
    await rig.until(() => rig.shell.place() === 'lobby');
    await tapWhenUp(rig, 'challenge.tile');
    await tapWhenUp(rig, 'lobby.play');
    await fallAt(rig, 6);
    await rig.until(() => findTap(rig.app.stage, t('results.double')) !== null);
    return rig;
  }

  it('pays the milestones once more, once, after a skipped try', async () => {
    const ads = fakeAds();
    const rig = await challengeFall(ads);
    const before = rig.store.load().copper;
    const b = offer(rig);
    tap(b);
    tap(b);
    await rig.tick(1);
    expect(ads.plays).toBe(1);
    expect(rig.texts()).toContain('…');
    expect(findTap(rig.app.stage, t('common.continue'))).toBeNull();
    await finish(rig, ads, false);
    expect(rig.store.load().copper).toBe(before);

    tap(offer(rig));
    await finish(rig, ads, true);
    const paid = rig.store.load().copper - before;
    expect(paid).toBeGreaterThan(0);
    expect(rig.texts()).toContain(t('results.doubled'));
    expect(rig.texts()).toContain(`+${2 * paid}`);
    expect(findTap(rig.app.stage, t('results.double'))).toBeNull();
    expect(ads.plays).toBe(2);
    await tapWhenUp(rig, 'common.continue');
    await rig.until(() => rig.shell.place() === 'lobby');
    expect(rig.store.load().copper).toBe(before + paid);
    expect(rig.faults).toEqual([]);
  });

  it('a host that throws mid-ad pays nothing and leaves Continue open', async () => {
    const ads = fakeAds();
    const rewarded = ads.rewarded.bind(ads);
    let throws = true;
    ads.rewarded = (started) => (throws ? Promise.reject(new Error('host')) : rewarded(started));
    const rig = await challengeFall(ads);
    const before = rig.store.load().copper;
    tap(offer(rig));
    await rig.tick(2);
    expect(rig.store.load().copper).toBe(before);
    expect(findTap(rig.app.stage, t('common.continue'))).not.toBeNull();
    throws = false;
    tap(offer(rig));
    await finish(rig, ads, true);
    expect(rig.store.load().copper).toBeGreaterThan(before);
    expect(rig.faults).toEqual([]);
  });

  it('on a desktop the keys wait out the ad, then continue', async () => {
    const ads = fakeAds();
    const rig = await challengeFall(ads, 'desktop');
    tap(offer(rig));
    rig.platform.press('Enter');
    await rig.tick(2);
    expect(rig.shell.place()).toBe('results');
    await finish(rig, ads, true);
    rig.platform.press('Escape');
    await rig.until(() => rig.shell.place() === 'lobby');
    expect(rig.faults).toEqual([]);
  });
});
