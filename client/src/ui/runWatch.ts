import { FP, isBossWave, isEliteWave, xpToNext, type Card, type HurtSource, type Player, type SimEvent, type SimState } from '@hk/engine';
import { suggestCard } from '@hk/engine/bot/bot';
import { t } from '../i18n';
import { BALANCE } from '../meta/balance';
import type { Game } from '../game/Game';
import type { RunPast } from '../meta/falls';
import type { Backend } from '../net/backend';
import { runLeave } from '../net/leaveProps';
import type { Ads, Portal } from '../platform/types';
import { buildChanged, buildSlots, spellCharges, type Charge } from './buildSlots';
import { cardText } from './cardText';
import { deathCause, nearestGoal, type DownInfo } from './deathInfo';
import type { RunHud } from './RunHud';
import { GATHER, GatherNudge, gatherDir } from './gatherNudge';
import { CLEAR_LINE_TIME, clearLine, waveLine } from './story';
import type { HintStep } from './tutorialHint';
import { newTutorial, stepTutorial, type Tutorial, type TutorialStep } from './tutorial';

// One run as the shell sees it, frame by frame: it watches the engine's state for a new wave (a
// banner), experience and level-up offers (the card panel), the hero going down (the death panel,
// revive with an ad, what killed the hero and how close he came), the last run's fall and passing
// it, the tutorial's steps and the outcome, and tells the portal when gameplay
// stops and starts again. The first run plays from its first frame, input or not: the kicks are
// automatic and the opening horde starts in kick range, so the first kills come within a second
// (a frozen screen waiting for a key lost desktop players who never pressed one).

/** Seconds of play between two `alive` beats: a run whose page dies with no `leave` still says how far it got. */
export const ALIVE_EVERY = 60;

/** The experience in the gems resting within GATHER.reach of `p`, as a share of the next level's. */
export function lyingShare(s: SimState, p: Player): number {
  const r2 = (GATHER.reach * FP) ** 2;
  let xp = 0;
  for (const g of s.gems) if (!g.flying && (g.x - p.x) ** 2 + (g.y - p.y) ** 2 <= r2) xp += g.value;
  return xp / Math.max(1, xpToNext(p.level) - p.xp);
}

export interface RunWatchDeps {
  chapter: number;
  /** One of a new player's first runs (BALANCE.novice.runs): the suggested card wears a tag. */
  novice?: boolean;
  portal: Portal;
  ads: Ads;
  net: Backend;
  /** The chapter's past runs on this track (meta/falls.ts); none for a run that keeps no record. */
  past?: RunPast;
  /** Free revives (training) left in the run; they come before the rewarded-ad one. */
  freeRevives(): number;
  /** The run's kills so far. */
  kills(): number;
  /** Keeps the run for the next launch (meta/resume.ts). */
  keepRun(): void;
  /** The run is over (won, after the monk's line). */
  end(): void;
  /** Plays the new-record fanfare. */
  cheer?(): void;
}

/** The card an opening level-up takes: the first spell (new or stronger), else the first card. */
export function autoPick(offer: readonly Card[]): number {
  return Math.max(0, offer.findIndex((c) => c.kind === 'spell'));
}

export class RunWatch {
  /** The wave the HUD last showed, and whether the death panel is up. */
  private shownWave = -1;
  downShown = false;
  /** Seconds left on the monk's line after a won run's boss, before the results. */
  private clearWait: number | null = null;
  /** The offer whose cards the HUD shows; null when none are up. */
  private shownOffer: readonly Card[] | null = null;
  tutorial: Tutorial | null;
  /** Level-ups left that take a card by themselves (the first run's opening, BALANCE.firstRun). */
  private autoPicks: number;
  /** What the last blow that hurt the local hero came from. */
  private lastBlow: HurtSource | null = null;
  /** What felled the hero last and the nearest goal he fell short of (null while he never fell). */
  fall: DownInfo | null = null;
  /** Seconds of play since the last `alive` beat. */
  private sinceAlive = 0;
  /** Seconds on screen since the run began, the pause panel left out (each frame capped at a second). */
  private runSecs = 0;
  /** The tutorial step last reported (null until the first one goes out). */
  private toldStep: TutorialStep | null = null;
  /** The nudge to walk over the gems piling up around a hero who stands still. */
  private readonly gather = new GatherNudge();
  /** The line low on the screen the HUD was last told to show. */
  private hint: HintStep = 'done';
  /** What the build strip was last drawn from (buildChanged), and the recharges filled in place every frame. */
  private readonly buildSeen: unknown[] = [];
  private readonly charges: (Charge | null)[] = [];

  constructor(
    private readonly game: Game,
    private readonly hud: RunHud,
    private readonly d: RunWatchDeps,
    /** The run teaches moving (the first run, not a replay or a resumed one). */
    teach: boolean,
  ) {
    this.tutorial = teach ? newTutorial() : null;
    this.autoPicks = teach ? BALANCE.firstRun.autoPicks : 0;
    if (teach) hud.setTutorial((this.hint = 'move'));
  }

  /** The run's events (Shell feeds them in from Game.onEvents): remembers the last blow that hurt. */
  see(events: readonly SimEvent[]): void {
    for (const e of events) if (e.type === 'hurt' && e.owner === 0 && e.value > 0) this.lastBlow = e.src;
  }

  update(dt: number): void {
    const { game, hud, d } = this;
    const s = game.engine.state;
    hud.update(dt);
    if (s.wave !== this.shownWave) {
      // the last run's fall stays marked until this run gets past it, which the banner cheers;
      // clearing more waves than the chapter's best ever did is cheered louder (a new record)
      const fell = d.past?.fell ?? 0;
      const best = d.past?.best ?? 0;
      const broke = this.shownWave > 0 && this.shownWave <= fell && s.wave > fell;
      const record = best > 0 && this.shownWave > 0 && this.shownWave - 1 <= best && s.wave - 1 > best;
      this.shownWave = s.wave;
      hud.setWave(s.wave);
      hud.setLastFall(s.wave <= fell ? fell : 0);
      const last = s.config.waves;
      const warning = isBossWave(s.wave, last) ? t('run.boss') : isEliteWave(s.wave, last) ? t('run.elite') : null;
      if (s.wave > 0) {
        const cheer = record ? t('run.newRecord') : broke ? t('run.brokeThrough') : null;
        hud.announce(s.wave, warning, waveLine(d.chapter, s.wave, last), cheer, record);
        if (record) d.cheer?.();
        // kept at each wave too, in case the game dies without going to the background first
        d.keepRun();
      }
    }
    const p = s.players[0];
    // a beat each minute of play (a frame's step capped, so a stalled tab does not count as play)
    if (s.outcome === 'playing' && !game.paused && (this.sinceAlive += Math.min(dt, 1)) >= ALIVE_EVERY) {
      this.sinceAlive = 0;
      d.net.track('alive', runLeave(s, d.chapter, d.kills(), this.tutorial?.step ?? null));
    }
    if (!game.paused) this.runSecs += Math.min(dt, 1);
    if (this.tutorial && !game.paused && p.offer.length === 0) {
      this.tutorial = stepTutorial(this.tutorial, dt, p.moving);
    }
    const teaching = this.tutorial !== null && this.tutorial.step !== 'done';
    const nudge = !teaching && !game.paused && p.offer.length === 0 && s.outcome === 'playing' && this.gather.step(dt, p.moving, p.moving ? 1 : lyingShare(s, p));
    const hint = teaching ? this.tutorial!.step : nudge ? 'gather' : 'done';
    if (hint !== this.hint) hud.setTutorial((this.hint = hint), hint === 'gather' ? gatherDir(s.gems.filter((g) => !g.flying), p.x, p.y, GATHER.reach * FP) : 2);
    // each step as it is reached, so a funnel shows which one first runs end on, and how long in
    if (this.tutorial && this.tutorial.step !== this.toldStep) {
      this.toldStep = this.tutorial.step;
      d.net.track('tutorial', { step: this.toldStep, secs: Math.round(this.runSecs) });
    }
    hud.setXp(p.level, p.xp / xpToNext(p.level));
    if (buildChanged(this.buildSeen, p)) hud.setBuild(buildSlots(p));
    hud.setCharges(spellCharges(p, this.charges));
    // offers come one after another (several levels at once, a shrine's insight), each a new list
    if (p.offer.length > 0 && this.shownOffer !== p.offer) {
      this.shownOffer = p.offer;
      // the first run's opening level-ups, and any before the player ever moved, take a card by
      // themselves: a modal over a fight the player has not touched yet lost desktop players (most
      // of those who left at the move hint had the cards up), and so did one every few seconds
      // in the first half minute; a shrine's choice is always the player's
      if ((this.autoPicks > 0 || this.tutorial?.step === 'move') && p.offer[0].kind !== 'shrine') {
        this.autoPicks = Math.max(0, this.autoPicks - 1);
        const i = autoPick(p.offer);
        game.pick(i);
        hud.gained(cardText(p.offer[i], p).name);
      } else {
        const title = p.offer[0].kind === 'shrine' ? t('card.shrine') : t('card.levelUp');
        hud.showOffer(title, p.offer.map((c) => cardText(c, p)), suggestCard(p), !!this.d.novice);
      }
    } else if (p.offer.length === 0 && this.shownOffer) {
      this.shownOffer = null;
      hud.hideOffer();
    }
    if (s.outcome === 'playing' && this.downShown) {
      this.downShown = false;
      d.portal.gameplayStart();
    }
    if (s.outcome === 'won') {
      // the run stands still on the monk's line after the boss, then the results
      if (this.clearWait === null) {
        this.clearWait = CLEAR_LINE_TIME;
        d.portal.gameplayStop();
        hud.speak(clearLine(d.chapter, s.wave, s.config.waves));
      }
      this.clearWait -= dt;
      if (this.clearWait <= 0) d.end();
    } else if (s.outcome === 'lost' && !this.downShown && !game.downCamBusy()) {
      this.downShown = true;
      d.portal.gameplayStop();
      // the death panel only asks about a revive; with none to offer the results come at once
      // (they say what felled the hero too), and the ad's offer waits for the host to say it can play
      const info = this.fallInfo();
      if (p.revives === 0) d.end();
      else if (d.freeRevives() > 0) hud.showDown('free', info);
      else {
        void d.ads.rewardedAvailable().then((ok) => {
          if (!this.downShown || hud.view.destroyed) return;
          if (ok) hud.showDown('ad', info);
          else d.end();
        });
      }
    }
  }

  /** What felled the hero just now, and the nearest goal the run fell short of. */
  private fallInfo(): DownInfo {
    const s = this.game.engine.state;
    const cause = deathCause(this.lastBlow, s.players[0].level, s.wave);
    this.fall = { cause, monk: s.players[0].monk, goal: this.d.past ? nearestGoal(s.wave, s.config.waves, this.d.past) : null };
    return this.fall;
  }
}
