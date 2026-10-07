import { Bot } from '@hk/engine/bot/bot';
import type { PlayerCommand, SimState } from '@hk/engine';

// Dev: the balance bot plays the run (?autoplay), for the store video and hands-free soak
// tests. It sends ordinary commands, so nothing in the rules changes. A level-up offer stays
// on screen for a moment before the bot picks, so a recording shows the cards. With ?from=N the
// bot rushes to wave N first (fast forward, cards taken at once), so a recording starts mid-run
// with a hero who has grown a real build.

/** How long the cards stay up before the bot picks, in ms. */
const OFFER_MS = 1300;
/** The sim speed while rushing to the ?from wave. */
export const RUSH_SPEED = 6;

export class Autoplay {
  private readonly bot: Bot;
  private offerMs = 0;

  constructor(owner: number, seed: number, private readonly from = 0) {
    this.bot = new Bot(owner, 'skilled', seed);
  }

  /** Still on the way to the ?from wave (a bot that falls on the way stays there, unrecorded). */
  rushing(s: SimState): boolean {
    return s.wave < this.from;
  }

  /** The bot's stick for the next tick. */
  move(s: SimState): Pick<PlayerCommand, 'moveBrad' | 'moveMag'> {
    const c = this.bot.command(s);
    return { moveBrad: c.moveBrad, moveMag: c.moveMag };
  }

  /** While an offer is open: the card to take once it has been shown long enough, else undefined. */
  pick(s: SimState, frameMs: number): number | undefined {
    this.offerMs += frameMs;
    if (this.offerMs < (this.rushing(s) ? 0 : OFFER_MS)) return undefined;
    this.offerMs = 0;
    return this.bot.command(s).pick;
  }
}
