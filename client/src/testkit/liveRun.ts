/**
 * A run in play on the live engine, headless: the real Shell starts it the way a player does,
 * and the test steps the sim tick by tick, steering with the balance bot or a scripted stick and
 * reading back the commands the view sent. The cards stay the test's to pick: the bot only moves.
 */
import { Bot, suggestCard } from '@hk/engine/bot/bot';
import type { LocalInputSource, PlayerCommand, SimState } from '@hk/engine';
import type { Vec2 } from '../game/dragStick';
import type { Container } from 'pixi.js';
import type { Game } from '../game/Game';
import { CARD_LOCK } from '../ui/cardGate';
import { cardText } from '../ui/cardText';
import type { SaveData } from '../meta/save';
import { clearedChapterOne, deviceWith, findTap, rigShell, settle, tapNamed, type RigOptions, type ShellRig } from './testShell';

/** One sim tick of real time (30 Hz): a frame this long steps the engine once. */
export const TICK_MS = 1000 / 30;

export interface LiveRun extends ShellRig {
  game(): Game;
  sim(): SimState;
  /** Every command the view has sent the engine this run, in order. */
  commands(): readonly PlayerCommand[];
  /** The stick from here on: the bot's, held still, a fixed push, or one worked out from the state each tick. */
  steer(how: 'bot' | 'still' | Vec2 | ((s: SimState) => Vec2)): void;
  /** Runs frames until the sim has stepped `n` more ticks; throws if it stops (a card open, paused, over). */
  ticks(n: number): Promise<void>;
  /** Runs tick-long frames until `done` holds; throws, with what is on screen, after `max` frames. */
  untilSim(done: (s: SimState) => boolean, max?: number): Promise<void>;
}

export interface LiveOptions extends RigOptions {
  /** The save the device holds; a player past chapter 1 by default, so the run starts from the lobby. */
  save?: Partial<SaveData>;
}

/** Starts a run through the shell (the lobby's PLAY, or the first run on a fresh save) and holds the stick still. */
export async function liveRun(o: LiveOptions = {}): Promise<LiveRun> {
  const rig = await rigShell({ ...o, storage: o.storage ?? deviceWith(o.save ?? clearedChapterOne()) });
  // ?direct skips the lobby, as main.ts reads it, and lets ?chapter pick the run's chapter
  await rig.shell.start(new URLSearchParams(o.query ?? '').has('direct'));
  await rig.until(() => rig.shell.place() === 'run' || rig.shell.place() === 'lobby');
  if (rig.shell.place() === 'lobby') {
    await tapNamed(rig, 'play');
    await rig.until(() => rig.shell.place() === 'run');
  }
  // the run's first frames: the HUD lays out, the views draw the sim once
  await rig.tick(2);
  const game = () => rig.shell.run!;
  const sim = () => game().engine.state;
  let stick: (s: SimState) => Vec2 = () => ({ x: 0, y: 0 });
  rig.platform.readKeys = () => stick(sim());
  const steer: LiveRun['steer'] = (how) => {
    if (how === 'bot') {
      const bot = new Bot(0, 'skilled', sim().config.seed);
      stick = (s) => {
        const c = bot.command(s);
        const a = (c.moveBrad / 65536) * 2 * Math.PI;
        return c.moveMag ? { x: Math.cos(a), y: Math.sin(a) } : { x: 0, y: 0 };
      };
    } else if (how === 'still') stick = () => ({ x: 0, y: 0 });
    else if (typeof how === 'function') stick = how;
    else stick = () => how;
  };
  // one tick-long frame; the rig's own tick() lets timers settle after each call, which costs more than the frame
  const frame = async () => {
    await new Promise<void>((r) => setImmediate(r));
    rig.app.ticker.update(rig.app.ticker.lastTime + TICK_MS);
  };
  const untilSim: LiveRun['untilSim'] = async (done, max = 3000) => {
    for (let i = 0; i < max && !done(sim()); i++) await frame();
    await settle();
    if (!done(sim())) throw new Error(`sim still waiting after ${max} frames at tick ${sim().tick}, wave ${sim().wave}: ${JSON.stringify(rig.texts())}`);
  };
  const ticks: LiveRun['ticks'] = async (n) => {
    const to = sim().tick + n;
    for (let i = 0; i < n * 3 && sim().tick < to; i++) await frame();
    await settle();
    if (sim().tick < to) throw new Error(`the sim stopped at tick ${sim().tick} of ${to} (offer ${sim().players[0].offer.length}, ${sim().outcome}, paused ${game().paused})`);
  };
  const commands = () => (game().engine.input as LocalInputSource).history;
  return Object.assign(rig, { game, sim, commands, steer, ticks, untilSim });
}

/** Waits (stepping the sim) for a level-up or shrine offer to open, then for its cards to take taps. */
export async function untilOffer(run: LiveRun, max?: number): Promise<void> {
  await run.untilSim((s) => s.players[0].offer.length > 0, max);
  // the cards rise locked until the gold line has run round them (cardGate.ts)
  await run.tick(Math.ceil(CARD_LOCK * 60) + 6);
}

/** The containers under `root` named `label` (a view with no words: the card hand, the affix badges). */
export function named(root: Container, label: string): Container[] {
  const out: Container[] = [];
  const walk = (c: Container) => {
    if (c.label === label) out.push(c);
    c.children.forEach(walk);
  };
  walk(root);
  return out;
}

/** Whether `c` and every parent of it are shown. */
export function shown(c: Container): boolean {
  for (let p: Container | null = c; p; p = p.parent) if (!p.visible || p.destroyed) return false;
  return true;
}

/** The card on screen for the offer's card `i`, by its name. */
export function cardOnScreen(run: LiveRun, i: number): Container {
  const p = run.sim().players[0];
  const name = cardText(p.offer[i], p).name;
  const c = findTap(run.app.stage, name);
  if (!c) throw new Error(`no card "${name}" on screen: ${JSON.stringify(run.texts())}`);
  return c;
}

/** A hero no blow can fell, for a test about the foes (a level-1 hero dropped on a late wave falls at once). */
export function undying(run: LiveRun): void {
  const p = run.sim().players[0];
  p.maxHp = p.hp = 1_000_000;
}

/**
 * Plays on until `done` holds, taking the bot's card at every offer on the way (the test is not
 * about them); throws after `max` frames.
 */
export async function playUntil(run: LiveRun, done: (s: SimState) => boolean, max = 6000): Promise<void> {
  for (let left = max; ; ) {
    const from = run.sim().tick;
    await run.untilSim((s) => done(s) || s.players[0].offer.length > 0, left);
    if (done(run.sim())) return;
    left -= Math.max(1, run.sim().tick - from);
    run.game().pick(suggestCard(run.sim().players[0]));
    await run.tick(1);
  }
}
