import { type Container } from 'pixi.js';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { formatAmount, t } from '../i18n';
import { monkPrice } from '../meta/monks';
import { nextNode, trainNode } from '../meta/training';
import { monkChapter } from '../meta/unlocks';
import { buttonNear, doubleTap, lobbyRig, openTab, reload, tapAt, wallet, words } from '../testkit/lobbyRig';
import type { ShellRig } from '../testkit/testShell';

/** The Train button of the node on show, priced as it reads. */
function trainButton(rig: ShellRig): Container {
  const label = `${t('train.buy')}  ${formatAmount(nextNode(rig.store.load())!.cost)}`;
  return buttonNear(rig, label, label);
}

describe('training, tapped through', { timeout: 30_000 }, () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(2026, 9, 24, 12));
  });
  afterEach(() => vi.useRealTimers());

  it('buys one node per double tap, the next one only on a later tap', async () => {
    const rig = await lobbyRig({ copper: 1000 });
    await openTab(rig, 'train');
    const [one, two] = [trainNode(1).cost, trainNode(2).cost];
    // the second tap lands on the next node's button, whose price the thumb never saw
    await doubleTap(rig, trainButton(rig));
    expect(rig.store.load().trained).toBe(1);
    expect(rig.store.load().copper).toBe(1000 - one);
    expect(words(rig)).toContain(t('train.progress', { n: 1, total: 100 }));
    expect(wallet(rig).copper).toBe(formatAmount(1000 - one));
    vi.advanceTimersByTime(1000);
    tapAt(rig.app.stage, trainButton(rig));
    await rig.tick(2);
    expect(rig.store.load().trained).toBe(2);
    expect(rig.store.load().copper).toBe(1000 - one - two);
    const again = await reload(rig);
    await openTab(again, 'train');
    expect(again.store.load().trained).toBe(2);
    expect(words(again)).toContain(t('train.progress', { n: 2, total: 100 }));
    expect([...rig.faults, ...again.faults]).toEqual([]);
  });

  it('refuses a node the copper does not cover, with a toast and nothing spent', async () => {
    const short = trainNode(1).cost - 1;
    const rig = await lobbyRig({ copper: short });
    await openTab(rig, 'train');
    tapAt(rig.app.stage, trainButton(rig));
    await rig.tick(2);
    expect(words(rig)).toContain(t('gear.noCopper'));
    expect(rig.store.load().copper).toBe(short);
    expect(rig.store.load().trained).toBe(0);
    expect(rig.faults).toEqual([]);
  });
});

/** Opens the monk panel from the portrait in the top bar's corner. */
async function openMonks(rig: ShellRig): Promise<void> {
  const top = rig.app.screen.height * 0.08;
  const portrait = tappablesIn(rig.app.stage).find((c) => {
    const b = c.getBounds();
    return b.y < top && b.x < 200 && b.width < 200;
  });
  if (!portrait) throw new Error('no portrait in the top bar');
  tapAt(rig.app.stage, portrait);
  await rig.tick(2);
  expect(words(rig)).toContain(t('monk.title'));
}

function tappablesIn(c: Container, out: Container[] = []): Container[] {
  if (!c.visible || c.destroyed) return out;
  if (c.eventMode === 'static') out.push(c);
  for (const child of c.children) tappablesIn(child, out);
  return out;
}

const price = (id: 'fat' | 'novice') => t('shop.price', { jade: monkPrice(id) });
const name = (id: string) => t(`monk.${id}.name` as never);

describe('monks, tapped through', { timeout: 30_000 }, () => {
  it('keeps each monk locked until his chapter is cleared', async () => {
    const rig = await lobbyRig({ jade: 5000 });
    await openMonks(rig);
    expect(words(rig)).toContain(t('tab.unlockChapter', { n: monkChapter('novice') }));
    expect(words(rig)).toContain(t('tab.unlockChapter', { n: monkChapter('fat') }));
    expect(words(rig)).not.toContain(price('novice'));
    expect(rig.faults).toEqual([]);
  });

  it('buys an unlocked monk once per double tap and plays him at once', async () => {
    const jade = monkPrice('novice') + 20;
    const rig = await lobbyRig({ jade, cleared: monkChapter('novice'), chapter: monkChapter('novice') + 1 });
    await openMonks(rig);
    expect(words(rig)).toContain(t('tab.unlockChapter', { n: monkChapter('fat') }));
    await doubleTap(rig, buttonNear(rig, price('novice'), name('novice')));
    const save = rig.store.load();
    expect(save.jade).toBe(20);
    expect(save.monk).toBe('novice');
    expect(words(rig)).toContain(t('monk.joined', { name: name('novice') }));
    expect(words(rig)).not.toContain(price('novice'));
    expect(wallet(rig).jade).toBe('20');
    const again = await reload(rig);
    expect(again.store.load().monk).toBe('novice');
    expect(again.store.load().jade).toBe(20);
    await openMonks(again);
    expect(words(again)).not.toContain(price('novice'));
    expect([...rig.faults, ...again.faults]).toEqual([]);
  });

  it('refuses a monk the jade does not cover', async () => {
    const jade = monkPrice('fat') - 1;
    const rig = await lobbyRig({ jade, cleared: monkChapter('fat'), chapter: monkChapter('fat') + 1 });
    await openMonks(rig);
    tapAt(rig.app.stage, buttonNear(rig, price('fat'), name('fat')));
    await rig.tick(2);
    expect(words(rig)).toContain(t('shop.noJade'));
    expect(rig.store.load().jade).toBe(jade);
    expect(rig.store.load().monk).toBe('kicker');
    expect(rig.faults).toEqual([]);
  });

  it('switches between owned monks, kept after a reload', async () => {
    const rig = await lobbyRig({ monks: 0b111, monk: 'fat', cleared: 10, chapter: 11 });
    await openMonks(rig);
    tapAt(rig.app.stage, buttonNear(rig, t('monk.play'), name('kicker')));
    await rig.tick(2);
    expect(rig.store.load().monk).toBe('kicker');
    expect(rig.store.load().jade).toBe(0);
    const again = await reload(rig);
    expect(again.store.load().monk).toBe('kicker');
    expect([...rig.faults, ...again.faults]).toEqual([]);
  });
});
