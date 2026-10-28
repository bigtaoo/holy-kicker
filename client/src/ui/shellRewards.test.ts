import { Text, type Container } from 'pixi.js';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { formatAmount, t } from '../i18n';
import { achievementsReady, readyJade } from '../meta/achievements';
import { BALANCE } from '../meta/balance';
import { dayKey, newDaily } from '../meta/daily';
import { EVOLVE_IDS } from '../meta/codex';
import { monkPrice, ownsMonk } from '../meta/monks';
import { patrolHaul } from '../meta/patrol';
import { chestPay, TABS } from '../meta/progress';
import { newSave } from '../meta/save';
import { buttonNear, doubleTap, fakeAds, lobbyRig, openTab, reload, tapAt, wallet, words } from '../testkit/lobbyRig';
import type { ShellRig } from '../testkit/testShell';

const NOW = new Date(2026, 9, 24, 12).getTime();
const HOUR = 3_600_000;
const P = BALANCE.patrol;
const D = BALANCE.daily;

/** Taps the rail button named `name` on the Play tab. */
async function openRail(rig: ShellRig, name: string): Promise<void> {
  tapAt(rig.app.stage, buttonNear(rig, name, name));
  await rig.tick(2);
}

/** Closes the haul panel a payout opened. */
async function takeHaul(rig: ShellRig): Promise<void> {
  await rig.until(() => rig.texts().includes(t('haul.ok')));
  tapAt(rig.app.stage, buttonNear(rig, t('haul.ok'), t('haul.ok')));
  await rig.tick(2);
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(NOW);
});
afterEach(() => vi.useRealTimers());

describe('patrol, tapped through', { timeout: 30_000 }, () => {
  it('doubles a collection only for an ad watched to the end, once, then says it is too soon', async () => {
    const ads = fakeAds();
    const rig = await lobbyRig({ copper: 0, patrol: NOW - 3 * HOUR }, { ads });
    await rig.until(() => words(rig).includes(t('patrol.title')));
    await openRail(rig, t('patrol.title'));
    await rig.until(() => words(rig).includes(t('patrol.double')));
    // closed early: nothing paid, the hours keep piling up
    await doubleTap(rig, buttonNear(rig, t('patrol.double'), t('patrol.title')));
    expect(ads.plays).toBe(1);
    ads.finish(false);
    await rig.tick(2);
    expect(rig.store.load().patrol).toBe(NOW - 3 * HOUR);
    expect(rig.store.load().copper).toBe(0);
    // watched: twice the copper of three hours
    const copper = patrolHaul(rig.store.load(), 3, 2).copper;
    await doubleTap(rig, buttonNear(rig, t('patrol.double'), t('patrol.title')));
    expect(ads.plays).toBe(2);
    ads.finish(true);
    await takeHaul(rig);
    const save = rig.store.load();
    expect(save.copper).toBe(copper);
    expect(save.patrol).toBe(NOW);
    expect(wallet(rig).copper).toBe(formatAmount(copper));
    expect(words(rig)).not.toContain(t('patrol.double'));
    // nothing piled up since: Collect only explains
    tapAt(rig.app.stage, buttonNear(rig, t('patrol.collect'), t('patrol.title')));
    await rig.tick(2);
    expect(words(rig)).toContain(t('patrol.tooSoon'));
    expect(rig.store.load().copper).toBe(copper);
    expect(ads.plays).toBe(2);
    const again = await reload(rig, { ads: fakeAds() });
    expect(again.store.load().patrol).toBe(NOW);
    expect(again.store.load().copper).toBe(copper);
    expect([...rig.faults, ...again.faults]).toEqual([]);
  });

  it('collects once per double tap without an ad', async () => {
    const rig = await lobbyRig({ copper: 0, patrol: NOW - 6 * HOUR });
    await openRail(rig, t('patrol.title'));
    const haul = patrolHaul(rig.store.load(), 6, 1);
    await doubleTap(rig, buttonNear(rig, t('patrol.collect'), t('patrol.title')));
    await takeHaul(rig);
    expect(rig.store.load().copper).toBe(haul.copper);
    expect(rig.store.load().patrol).toBe(NOW);
    expect(rig.faults).toEqual([]);
  });

  it('sells quick patrols for jade once per tap, up to the day\'s limit and never below zero', async () => {
    const jade = 2 * P.quickJade + 5;
    const rig = await lobbyRig({ jade, patrol: NOW });
    await openRail(rig, t('patrol.title'));
    const quick = () => buttonNear(rig, t('patrol.quickJade', { jade: P.quickJade, n: P.quickJadePerDay - rig.store.load().daily.quickJade }), t('patrol.quick'));
    // the haul panel covers the patrol: the second tap lands on it
    await doubleTap(rig, quick());
    expect(rig.store.load().jade).toBe(jade - P.quickJade);
    expect(rig.store.load().daily.quickJade).toBe(1);
    await takeHaul(rig);
    expect(wallet(rig).jade).toBe(String(jade - P.quickJade));
    expect(words(rig)).toContain(t('patrol.quickJade', { jade: P.quickJade, n: P.quickJadePerDay - 1 }));
    tapAt(rig.app.stage, quick());
    await rig.tick(2);
    await takeHaul(rig);
    expect(rig.store.load().jade).toBe(5);
    // short of the price: a toast, the jade stays put
    tapAt(rig.app.stage, quick());
    await rig.tick(2);
    expect(words(rig)).toContain(t('shop.noJade'));
    expect(rig.store.load().jade).toBe(5);
    expect(rig.store.load().daily.quickJade).toBe(2);
    const again = await reload(rig);
    expect(again.store.load().daily.quickJade).toBe(2);
    expect(again.store.load().jade).toBe(5);
    expect([...rig.faults, ...again.faults]).toEqual([]);
  });

  it('stops quick patrols at the day\'s limit, whatever the jade', async () => {
    const day = { ...newDaily(dayKey(NOW)), quickJade: P.quickJadePerDay, quickAds: P.quickAdsPerDay };
    const ads = fakeAds();
    const rig = await lobbyRig({ jade: 500, patrol: NOW, daily: day }, { ads });
    await openRail(rig, t('patrol.title'));
    await rig.until(() => words(rig).includes(t('patrol.quickAd', { n: 0 })));
    tapAt(rig.app.stage, buttonNear(rig, t('patrol.quickJade', { jade: P.quickJade, n: 0 }), t('patrol.quick')));
    await rig.tick(2);
    expect(words(rig)).toContain(t('patrol.noneLeft'));
    tapAt(rig.app.stage, buttonNear(rig, t('patrol.quickAd', { n: 0 }), t('patrol.quick')));
    await rig.tick(2);
    expect(ads.plays).toBe(0);
    expect(rig.store.load().jade).toBe(500);
    expect(rig.faults).toEqual([]);
  });

  it('pays a quick patrol for an ad only once it is watched', async () => {
    const ads = fakeAds();
    const rig = await lobbyRig({ copper: 0, patrol: NOW }, { ads });
    await openRail(rig, t('patrol.title'));
    const quickAd = (n: number) => buttonNear(rig, t('patrol.quickAd', { n }), t('patrol.quick'));
    await rig.until(() => words(rig).includes(t('patrol.quickAd', { n: P.quickAdsPerDay })));
    await doubleTap(rig, quickAd(P.quickAdsPerDay));
    expect(ads.plays).toBe(1);
    ads.finish(false);
    await rig.tick(2);
    expect(rig.store.load().daily.quickAds).toBe(0);
    expect(rig.store.load().copper).toBe(0);
    await doubleTap(rig, quickAd(P.quickAdsPerDay));
    ads.finish(true);
    await takeHaul(rig);
    expect(ads.plays).toBe(2);
    expect(rig.store.load().daily.quickAds).toBe(1);
    expect(rig.store.load().copper).toBe(patrolHaul(rig.store.load(), P.quickHours).copper);
    expect(words(rig)).toContain(t('patrol.quickAd', { n: P.quickAdsPerDay - 1 }));
    expect(rig.faults).toEqual([]);
  });
});

/** Today's counters with every task done and the ones in `claimed` (bits) already claimed. */
function doneDay(claimed: number) {
  return { ...newDaily(dayKey(NOW)), progress: D.tasks.map((g) => g.n), claimed };
}

describe('daily tasks and achievements, tapped through', { timeout: 30_000 }, () => {
  it('pays a task once per double tap and the bonus once, kept after a reload', async () => {
    const all = (1 << D.tasks.length) - 1;
    const rig = await lobbyRig({ copper: 0, jade: 0, firstDay: 0, daily: doneDay(all & ~1) });
    await openRail(rig, t('tasks.button'));
    expect(words(rig)).toContain(t('tasks.title'));
    const name = t('tasks.runs', { n: D.tasks[0].n });
    await doubleTap(rig, buttonNear(rig, t('tasks.claim'), name));
    let save = rig.store.load();
    expect(save.copper).toBe(D.copper);
    expect(save.jade).toBe(D.jade);
    expect(save.daily.claimed).toBe(all);
    expect(words(rig)).not.toContain(t('tasks.claim'));
    await doubleTap(rig, buttonNear(rig, t('tasks.bonus', { jade: D.bonusJade }), t('tasks.title')));
    save = rig.store.load();
    expect(save.jade).toBe(D.jade + D.bonusJade);
    expect(save.daily.bonus).toBe(true);
    // a third tap on the spent bonus pays nothing
    tapAt(rig.app.stage, buttonNear(rig, t('tasks.bonus', { jade: D.bonusJade }), t('tasks.title')));
    await rig.tick(2);
    expect(rig.store.load().jade).toBe(D.jade + D.bonusJade);
    const again = await reload(rig);
    expect(again.store.load().daily.bonus).toBe(true);
    expect(again.store.load().jade).toBe(D.jade + D.bonusJade);
    await openRail(again, t('tasks.button'));
    expect(words(again)).not.toContain(t('tasks.claim'));
    expect([...rig.faults, ...again.faults]).toEqual([]);
  });

  it('pays an achievement once per double tap, then the rest with Claim all', async () => {
    const rig = await lobbyRig({ jade: 0, runs: 25 });
    const ready = achievementsReady(rig.store.load());
    expect(ready.length).toBeGreaterThan(2);
    const total = readyJade(rig.store.load());
    const runs5 = BALANCE.achievements.findIndex((g) => g.kind === 'runs' && g.n === 5);
    expect(ready).toContain(runs5);
    // only achievements wait, so the panel opens on them
    await openRail(rig, t('tasks.button'));
    await rig.until(() => words(rig).includes(t('achieve.runs', { n: 5 })));
    const jade = BALANCE.achievements[runs5].jade;
    await doubleTap(rig, buttonNear(rig, t('achieve.claim', { jade }), t('achieve.runs', { n: 5 })));
    // ready ones come first, so the next one's Claim moves under the thumb and the second tap takes
    // it: each still pays once, and only what was reached
    const left = achievementsReady(rig.store.load());
    expect(left).not.toContain(runs5);
    expect(left.length).toBeGreaterThanOrEqual(ready.length - 2);
    const paid = total - readyJade(rig.store.load());
    expect(rig.store.load().jade).toBe(paid);
    expect(words(rig)).toContain(t('achieve.claimAll', { jade: total - paid }));
    await doubleTap(rig, buttonNear(rig, t('achieve.claimAll', { jade: total - paid }), t('achieve.title')));
    const save = rig.store.load();
    expect(save.jade).toBe(total);
    expect(achievementsReady(save)).toEqual([]);
    expect(words(rig)).toContain(t('achieve.claimed', { n: ready.length, total: BALANCE.achievements.length }));
    expect(wallet(rig).jade).toBe(String(total));
    const again = await reload(rig);
    expect(again.store.load().jade).toBe(total);
    expect(achievementsReady(again.store.load())).toEqual([]);
    expect([...rig.faults, ...again.faults]).toEqual([]);
  });
});

describe('the welcome gift, tapped through', { timeout: 30_000 }, () => {
  it('gives one gift a day once per double tap, the next only tomorrow', async () => {
    const rig = await lobbyRig({ jade: 0, gifts: 0, giftDay: 0 });
    await openRail(rig, t('gift.button'));
    expect(words(rig)).toContain(t('gift.title'));
    const robe = rig.store.load().gear.robe[1];
    await doubleTap(rig, buttonNear(rig, t('gift.claimNow'), t('gift.title')));
    await takeHaul(rig);
    let save = rig.store.load();
    expect(save.gifts).toBe(1);
    expect(save.giftDay).toBe(dayKey(NOW));
    expect(save.gear.robe[1]).toBe(robe + 1);
    expect(words(rig)).not.toContain(t('gift.claimNow'));
    // the same day: the rail reads tomorrow and nothing more is paid
    const same = await reload(rig);
    expect(words(same)).toContain(t('gift.later'));
    await openRail(same, t('gift.button'));
    expect(words(same)).not.toContain(t('gift.claimNow'));
    expect(same.store.load().gifts).toBe(1);
    // the next day: day 2's jade
    vi.setSystemTime(NOW + 24 * HOUR);
    const next = await reload(same);
    await openRail(next, t('gift.button'));
    await doubleTap(next, buttonNear(next, t('gift.claimNow'), t('gift.title')));
    await takeHaul(next);
    save = next.store.load();
    expect(save.gifts).toBe(2);
    expect(save.jade).toBe(BALANCE.welcome[1].jade);
    expect(wallet(next).jade).toBe(String(BALANCE.welcome[1].jade));
    expect([...rig.faults, ...same.faults, ...next.faults]).toEqual([]);
  });

  it('ends the week with the novice monk, and the rail goes away', async () => {
    const last = BALANCE.welcome.length - 1;
    const rig = await lobbyRig({ gifts: last, giftDay: 0 });
    expect(ownsMonk(rig.store.load(), 'novice')).toBe(false);
    await openRail(rig, t('gift.button'));
    await doubleTap(rig, buttonNear(rig, t('gift.claimNow'), t('gift.title')));
    await takeHaul(rig);
    const save = rig.store.load();
    expect(save.gifts).toBe(last + 1);
    expect(ownsMonk(save, 'novice')).toBe(true);
    const again = await reload(rig);
    expect(ownsMonk(again.store.load(), 'novice')).toBe(true);
    expect(words(again)).not.toContain(t('gift.button'));
    expect([...rig.faults, ...again.faults]).toEqual([]);
  });

  it('shows the novice owned on the last day when he is already yours, and pays his price in jade', async () => {
    const last = BALANCE.welcome.length - 1;
    const rig = await lobbyRig({ gifts: last, giftDay: 0, monks: 0b111, jade: 0 });
    await openRail(rig, t('gift.button'));
    expect(words(rig)).toContain(t('shop.owned'));
    expect(words(rig)).toContain(`+${monkPrice('novice')}`);
    await doubleTap(rig, buttonNear(rig, t('gift.claimNow'), t('gift.title')));
    await takeHaul(rig);
    expect(rig.store.load().jade).toBe(monkPrice('novice'));
    expect(rig.faults).toEqual([]);
  });
});

/** The tappable chests of the chapter card's progress row (only the ones waiting answer a tap). */
function waitingChests(rig: ShellRig): Container[] {
  const wave = findText(rig.app.stage, String(BALANCE.chests[0].wave));
  if (!wave) throw new Error(`no chest row: ${JSON.stringify(rig.texts())}`);
  return wave.parent!.children.filter((c) => c.eventMode === 'static');
}

describe('progress chests, tapped through', { timeout: 30_000 }, () => {
  it('opens a reached chest once per double tap, kept opened after a reload', async () => {
    const chests = newSave().chests;
    chests[1] = 0b11;
    const rig = await lobbyRig({ copper: 0, jade: 0, chests });
    expect(rig.store.load().chapter).toBe(2);
    expect(waitingChests(rig)).toHaveLength(2);
    const pay = chestPay(2, 0);
    await doubleTap(rig, waitingChests(rig)[0]);
    let save = rig.store.load();
    expect(save.copper).toBe(pay.copper);
    expect(save.jade).toBe(pay.jade);
    expect(save.opened[1]).toBe(0b1);
    await takeHaul(rig);
    expect(waitingChests(rig)).toHaveLength(1);
    expect(wallet(rig).copper).toBe(formatAmount(pay.copper));
    const again = await reload(rig);
    save = again.store.load();
    expect(save.opened[1]).toBe(0b1);
    expect(save.copper).toBe(pay.copper);
    expect(waitingChests(again)).toHaveLength(1);
    expect([...rig.faults, ...again.faults]).toEqual([]);
  });
});

describe('the codex, tapped through', { timeout: 30_000 }, () => {
  it('shows the entries recorded, the one tapped in detail, and remembers the tab was seen', async () => {
    const id = EVOLVE_IDS[0];
    const rig = await lobbyRig({ codex: [id], seen: 0, cleared: BALANCE.unlocks.codexChapter, chapter: BALANCE.unlocks.codexChapter + 1 });
    await openTab(rig, 'codex');
    const head = words(rig).find((s) => s.startsWith(t('codex.title', { n: 1, total: 0 }).split('/')[0] + '/'));
    expect(head).toBeDefined();
    expect(words(rig)).toContain(t('codex.pick'));
    const name = t(`evolve.${id}.name` as never);
    tapAt(rig.app.stage, buttonNear(rig, name, name));
    await rig.tick(2);
    expect(words(rig)).not.toContain(t('codex.pick'));
    expect(words(rig).filter((s) => s === name).length).toBe(2);
    const save = rig.store.load();
    expect(save.seen & (1 << TABS.indexOf('codex'))).not.toBe(0);
    expect(save.jade).toBe(0);
    const again = await reload(rig);
    expect(again.store.load().codex).toEqual([id]);
    expect(again.store.load().seen & (1 << TABS.indexOf('codex'))).not.toBe(0);
    expect([...rig.faults, ...again.faults]).toEqual([]);
  });
});

function findText(root: Container, text: string): Text | null {
  if (!root.visible) return null;
  if (root instanceof Text && root.text === text) return root;
  for (const c of root.children) {
    const hit = findText(c, text);
    if (hit) return hit;
  }
  return null;
}
