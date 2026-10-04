import { Bot } from '@hk/engine/bot/bot';
import type { PlayerCommand, SimState } from '@hk/engine';

// Dev: the balance bot plays the run (?autoplay), for the store video and hands-free soak
// tests. It sends ordinary commands, so nothing in the rules changes. A level-up offer stays
// on screen for a moment before the bot picks, so a recording shows the cards.

/** How long the cards stay up before the bot picks, in ms. */
const OFFER_MS = 1300;

export class Autoplay {
  private readonly bot: Bot;
  private offerMs = 0;

  constructor(owner: number, seed: number) {
    this.bot = new Bot(owner, 'skilled', seed);
  }

  /** The bot's stick for the next tick. */
  move(s: SimState): Pick<PlayerCommand, 'moveBrad' | 'moveMag'> {
    const c = this.bot.command(s);
    return { moveBrad: c.moveBrad, moveMag: c.moveMag };
  }

  /** While an offer is open: the card to take once it has been shown long enough, else undefined. */
  pick(s: SimState, frameMs: number): number | undefined {
    this.offerMs += frameMs;
    if (this.offerMs < OFFER_MS) return undefined;
    this.offerMs = 0;
    return this.bot.command(s).pick;
  }
}
