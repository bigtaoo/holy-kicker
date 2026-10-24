import { describe, expect, it } from 'vitest';
import { t } from '../i18n';
import { BALANCE } from '../meta/balance';
import { TABS } from '../meta/progress';
import { lobbyRig, press, words } from '../testkit/lobbyRig';
import { clearedChapterOne, deviceWith, endRun, rigShell, tapNamed, type ShellRig } from '../testkit/testShell';

/** The part of `key`'s text before its `{name}`-style blank: what every line of that kind starts with. */
function head(key: string, blank: string): string {
  return t(key as never, { [blank]: '\u0000' } as never).split('\u0000')[0];
}

/** The texts on screen that start like `key`'s. */
function linesLike(rig: ShellRig, key: string, blank: string): string[] {
  return words(rig).filter((s) => s.startsWith(head(key, blank)));
}

describe('a newcomer\'s results, tapped through', { timeout: 30_000 }, () => {
  it('keeps the first clear to the essentials: stars, rewards, one unlock, the way on', async () => {
    const rig = await rigShell();
    await rig.shell.start();
    await rig.tick(3);
    endRun(rig, 'won');
    await rig.until(() => rig.shell.place() === 'results');
    await rig.tick(30);
    const texts = words(rig);
    expect(texts).toContain(t('results.cleared'));
    expect(texts).toContain(String(BALANCE.waves));
    expect(texts).toContain(t('results.nextChapter'));
    // the first clear unlocks a relic and a sutra; only the relic gets its strip
    expect(linesLike(rig, 'results.newRelic', 'name')).toHaveLength(1);
    expect(linesLike(rig, 'results.newSutra', 'name')).toEqual([]);
    expect(texts).not.toContain(t('results.starNext2'));
    expect(texts).not.toContain(t('results.newBest'));
    expect(linesLike(rig, 'results.chests', 'n')).toEqual([]);
    expect(linesLike(rig, 'results.starNext3', 'n')).toEqual([]);
    expect(linesLike(rig, 'results.time', 'time')).toEqual([]);
    expect(linesLike(rig, 'results.newCodex', 'name')).toEqual([]);
    expect(linesLike(rig, 'results.giftWorn', 'gift')).toEqual([]);
    expect(linesLike(rig, 'results.gift', 'gift')).toEqual([]);
    expect(linesLike(rig, 'gift.tomorrow', 'gift')).toEqual([]);
    // the gift was still paid, and the calendar names tomorrow's in the lobby
    expect(rig.store.load().gifts).toBe(1);
    expect(rig.faults).toEqual([]);
  });

  it('tells everything again once a chapter is cleared', async () => {
    const rig = await rigShell({ storage: deviceWith(clearedChapterOne()) });
    await rig.shell.start();
    await rig.until(() => rig.shell.place() === 'lobby');
    await tapNamed(rig, 'play');
    await rig.until(() => rig.shell.place() === 'run');
    endRun(rig, 'won');
    await rig.until(() => rig.shell.place() === 'results');
    await rig.tick(30);
    expect(linesLike(rig, 'results.time', 'time')).toHaveLength(1);
    expect(words(rig)).toContain(t('results.newBest'));
    expect(rig.faults).toEqual([]);
  });
});

describe('the tab bar, tapped through', { timeout: 30_000 }, () => {
  it('shows all five tabs to a new player, the locked Codex saying when it opens', async () => {
    const rig = await lobbyRig({ firstRunDone: true, runs: 1 });
    for (const tab of TABS) expect(words(rig)).toContain(t(`tab.${tab}` as never));
    await press(rig, 'tab.codex');
    expect(words(rig)).toContain(t('tab.unlockChapter', { n: BALANCE.unlocks.codexChapter }));
    expect(words(rig)).not.toContain(t('codex.pick'));
    expect(rig.faults).toEqual([]);
  });
});
