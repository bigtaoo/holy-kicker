/**
 * Walks the shell through its screens the way a player would and keeps the text each one
 * shows: the first run and its pause panel, the results, the lobby's tabs, the settings and the
 * account panel, both challenges and their results, and the unfinished-run question. The i18n
 * tests run it per locale and theme and look for keys left on screen.
 */
import { t } from '../i18n';
import { clearedChapterOne, deviceWith, endRun, findTap, rawKeys, rigShell, tap, tapNamed, tapWhenUp, type ShellRig } from './testShell';

export type Tour = Record<string, string[]>;

async function waitFor(rig: ShellRig, key: string): Promise<void> {
  const text = t(key as never);
  await rig.until(() => rig.texts().includes(text));
}

/** The first run, its pause panel, its won results and the lobby after it, tab by tab, with the settings. */
async function firstDay(tour: Tour): Promise<void> {
  const rig = await rigShell();
  await rig.shell.start();
  await rig.tick(60);
  tour.firstRun = rig.texts();
  tap(findTap(rig.app.stage, 'II')!);
  await rig.tick(3);
  tour.pause = rig.texts();
  await tapWhenUp(rig, 'run.resume');
  endRun(rig, 'won');
  await rig.until(() => rig.shell.place() === 'results');
  await rig.tick(30);
  tour.results = rig.texts();
  const back = rig.texts().find((s) => s !== t('results.nextChapter') && findTap(rig.app.stage, s) && s !== t('results.double'));
  tap(findTap(rig.app.stage, back!)!);
  await rig.until(() => rig.shell.place() === 'lobby');
  await waitFor(rig, 'tab.play');
  await rig.tick(10);
  tour.lobby = rig.texts();
  for (const tab of ['shop', 'gear', 'train'] as const) {
    await tapWhenUp(rig, `tab.${tab}`);
    await rig.tick(10);
    tour[`tab.${tab}`] = rig.texts();
  }
  await tapWhenUp(rig, 'tab.play');
  await tapNamed(rig, 'settings');
  await waitFor(rig, 'settings.title');
  tour.settings = rig.texts();
  await tapWhenUp(rig, 'settings.account');
  await waitFor(rig, 'settings.dataNotice');
  tour.account = rig.texts();
  if (rig.faults.length) throw rig.faults[0];
}

/** A player past chapter 1: the daily and weekly panels, the daily's results, and a run left and offered again. */
async function laterDay(tour: Tour): Promise<void> {
  const rig = await rigShell({ storage: deviceWith(clearedChapterOne()), query: '?challenge' });
  await rig.shell.start();
  await rig.until(() => rig.shell.place() === 'lobby');
  await tapWhenUp(rig, 'challenge.tile');
  await waitFor(rig, 'challenge.rule1');
  tour.daily = rig.texts();
  await tapWhenUp(rig, 'weekly.tab');
  await waitFor(rig, 'weekly.loadout');
  tour.weekly = rig.texts();
  await tapWhenUp(rig, 'challenge.tile');
  await waitFor(rig, 'challenge.rule1');
  await tapWhenUp(rig, 'lobby.play');
  await rig.until(() => rig.shell.place() === 'run');
  rig.shell.run!.engine.state.wave = 6;
  endRun(rig, 'lost');
  await rig.until(() => rig.shell.place() === 'results');
  await rig.tick(30);
  tour.dailyResults = rig.texts();
  await tapWhenUp(rig, 'common.continue');
  await rig.until(() => rig.shell.place() === 'lobby');
  await tapNamed(rig, 'play');
  await rig.until(() => rig.shell.place() === 'run');
  await rig.tick(3);
  tour.run = rig.texts();
  rig.shell.run!.engine.state.wave = 5;
  rig.platform.hide();
  await rig.tick(3);
  tour.hidden = rig.texts();
  const next = await rigShell({ storage: rig.platform.storage as never });
  await next.shell.start();
  await waitFor(next, 'run.unfinished');
  tour.resume = next.texts();
  if (rig.faults.length || next.faults.length) throw rig.faults[0] ?? next.faults[0];
}

export async function tourScreens(): Promise<Tour> {
  const tour: Tour = {};
  await firstDay(tour);
  await laterDay(tour);
  return tour;
}

/** The screens with keys left raw on them, and those keys; empty when every text is in words. */
export function rawOnTour(tour: Tour): Record<string, string[]> {
  return Object.fromEntries(Object.entries(tour).map(([k, v]) => [k, rawKeys(v)] as const).filter(([, v]) => v.length));
}
