import { describe, expect, it } from 'vitest';
import { suggestCard } from '@hk/engine/bot/bot';
import { t } from '../i18n';
import { tap } from '../testkit/testShell';
import { cardOnScreen, liveRun, named, shown, untilOffer, type LiveRun } from '../testkit/liveRun';
import { CARD_NUDGE } from './cardNudge';

/** The offer's first card that adds to the build (a spell or a passive, new or a level up). */
function buildCard(run: LiveRun): number {
  return run.sim().players[0].offer.findIndex((c) => c.kind === 'spell' || c.kind === 'passive');
}

/** The level of the spell or passive `id` in the hero's build, 0 without it. */
function levelOf(run: LiveRun, kind: string, id: string): number {
  const p = run.sim().players[0];
  const slots: { id: string; level: number }[] = kind === 'spell' ? p.spells : p.passives;
  return slots.find((s) => s.id === id)?.level ?? 0;
}

describe('level-up cards on a live run', { timeout: 30_000 }, () => {
  it('open when the sim asks; a tap sends exactly that pick and the build takes it', async () => {
    const run = await liveRun();
    run.steer('bot');
    await untilOffer(run);
    expect(run.texts()).toContain(t('card.levelUp'));
    expect(run.texts()).toContain(t('card.pickOne'));
    const at = run.sim().tick;
    // the sim stands still while the cards are up
    await run.tick(20);
    expect(run.sim().tick).toBe(at);
    const i = buildCard(run);
    const card = run.sim().players[0].offer[i];
    const before = levelOf(run, card.kind, card.id);
    tap(cardOnScreen(run, i));
    await run.ticks(2);
    const picks = run.commands().filter((c) => c.pick !== undefined);
    expect(picks.map((c) => c.pick)).toEqual([i]);
    expect(levelOf(run, card.kind, card.id)).toBe(before + 1);
    expect(run.sim().players[0].offer).toEqual([]);
    expect(run.texts()).not.toContain(t('card.levelUp'));
    expect(run.faults).toEqual([]);
  });

  it('ignore a tap that lands before the cards have risen', async () => {
    const run = await liveRun();
    run.steer('bot');
    await run.untilSim((s) => s.players[0].offer.length > 0);
    await run.tick(1);
    tap(cardOnScreen(run, 0));
    await run.tick(2);
    expect(run.commands().some((c) => c.pick !== undefined)).toBe(false);
    expect(run.sim().players[0].offer.length).toBeGreaterThan(0);
  });

  it('take the keys on a desktop: a number picks, arrows move the ring, Enter takes it, a held key does not repeat', async () => {
    const run = await liveRun({ device: 'desktop' });
    run.steer('bot');
    await untilOffer(run);
    // the number chips on the cards
    expect(run.texts()).toEqual(expect.arrayContaining(['1', '2', '3']));
    run.platform.press('Digit2');
    await run.ticks(2);
    expect(run.commands().filter((c) => c.pick !== undefined).map((c) => c.pick)).toEqual([1]);

    await untilOffer(run);
    run.platform.press('ArrowDown');
    run.platform.press('ArrowDown', true);
    run.platform.press('Enter', true);
    await run.tick(2);
    expect(run.sim().players[0].offer.length).toBeGreaterThan(0);
    run.platform.press('Enter');
    await run.ticks(2);
    expect(run.commands().filter((c) => c.pick !== undefined).map((c) => c.pick)).toEqual([1, 1]);
    expect(run.faults).toEqual([]);
  });

  it(`point a hand at the bot's card after ${CARD_NUDGE.after} s without a pick, and drop it at a touch`, async () => {
    const run = await liveRun();
    run.steer('bot');
    await untilOffer(run);
    const [hand] = named(run.app.stage, 'cardHand');
    expect(hand).toBeDefined();
    expect(shown(hand)).toBe(false);
    await run.tick(Math.ceil(CARD_NUDGE.after * 60) + 10);
    expect(shown(hand)).toBe(true);
    // level with the suggested card, over its left side where the icon is
    const suggest = suggestCard(run.sim().players[0]);
    const card = cardOnScreen(run, suggest);
    expect(hand.y).toBeCloseTo(card.parent!.y, 0);
    expect(hand.x).toBeLessThan(card.parent!.x);
    for (let i = 0; i < run.sim().players[0].offer.length; i++) {
      if (i !== suggest) expect(Math.abs(cardOnScreen(run, i).parent!.y - hand.y)).toBeGreaterThan(100);
    }
    hand.parent!.emit('pointermove', {} as never);
    await run.tick(2);
    expect(shown(hand)).toBe(false);
  });

  it('tag the suggested card for a new player', async () => {
    const run = await liveRun({ save: { firstRunDone: true, cleared: 1, chapter: 2, runs: 1 } });
    run.steer('bot');
    await untilOffer(run);
    expect(run.texts()).toContain(t('card.suggested'));
  });
});

describe('a sutra shrine on a live run', { timeout: 30_000 }, () => {
  it('opens on wave 5 with its three cards; insight deals level-up cards in their place', async () => {
    const run = await liveRun({ query: '?wave=5' });
    run.steer('bot');
    // level-ups on the way are taken as they come
    for (;;) {
      await untilOffer(run, 6000);
      if (run.sim().players[0].offer[0].kind === 'shrine') break;
      tap(cardOnScreen(run, 0));
      await run.tick(2);
    }
    expect(run.sim().wave).toBe(5);
    expect(run.texts()).toContain(t('card.shrine'));
    const offer = run.sim().players[0].offer;
    expect(offer.map((c) => c.id)).toEqual(['heal', 'insight', 'offering']);
    tap(cardOnScreen(run, 1));
    await run.tick(4);
    await run.tick(30);
    expect(run.sim().players[0].offer.length).toBeGreaterThan(0);
    expect(run.sim().players[0].offer.every((c) => c.kind !== 'shrine')).toBe(true);
    expect(run.texts()).toContain(t('card.levelUp'));
    expect(run.texts()).not.toContain(t('card.shrine'));
    expect(run.faults).toEqual([]);
  });
});
