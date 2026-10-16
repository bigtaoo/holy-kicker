import { isBossWave, isEliteWave, xpToNext, type Card, type HurtSource, type SimEvent } from '@hk/engine';
import { t } from '../i18n';
import type { Game } from '../game/Game';
import type { RunPast } from '../meta/falls';
import type { Backend } from '../net/backend';
import type { Ads, Portal } from '../platform/types';
import { buildSlots, spellCharges } from './buildSlots';
import { cardText } from './cardText';
import { deathCause, nearestGoal, type DownInfo } from './deathInfo';
import type { RunHud } from './RunHud';
import { CLEAR_LINE_TIME, clearLine, waveLine } from './story';
import { newTutorial, stepTutorial, type Tutorial } from './tutorial';

// One run as the shell sees it, frame by frame: it watches the engine's state for a new wave (a
// banner), experience and level-up offers (the card panel), the hero going down (the death panel,
// revive with an ad, what killed the hero and how close he came), the last run's fall and passing
// it, the tutorial's steps and the outcome, and tells the portal when gameplay
// stops and starts again. The first run plays from its first frame, input or not: the kicks are
// automatic and the opening horde starts in kick range, so the first kills come within a second
// (a frozen screen waiting for a key lost desktop players who never pressed one).

export interface RunWatchDeps {
  chapter: number;
  portal: Portal;
  ads: Ads;
  net: Backend;
  /** The chapter's past runs on this track (meta/falls.ts); none for a run that keeps no record. */
  past?: RunPast;
  /** Free revives (training) left in the run; they come before the rewarded-ad one. */
  freeRevives(): number;
  /** Keeps the run for the next launch (meta/resume.ts). */
  keepRun(): void;
  /** The run is over (won, after the monk's line). */
  end(): void;
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
  /** What the last blow that hurt the local hero came from. */
  private lastBlow: HurtSource | null = null;
  /** What felled the hero last and the nearest goal he fell short of (null while he never fell). */
  fall: DownInfo | null = null;

  constructor(
    private readonly game: Game,
    private readonly hud: RunHud,
    private readonly d: RunWatchDeps,
    /** The run teaches moving (the first run, not a replay or a resumed one). */
    teach: boolean,
  ) {
    this.tutorial = teach ? newTutorial() : null;
    if (teach) hud.setTutorial('move');
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
      // the last run's fall stays marked until this run gets past it, which the banner cheers
      const fell = d.past?.fell ?? 0;
      const broke = this.shownWave > 0 && this.shownWave <= fell && s.wave > fell;
      this.shownWave = s.wave;
      hud.setWave(s.wave);
      hud.setLastFall(s.wave <= fell ? fell : 0);
      const last = s.config.waves;
      const warning = isBossWave(s.wave, last) ? t('run.boss') : isEliteWave(s.wave, last) ? t('run.elite') : null;
      if (s.wave > 0) {
        hud.announce(s.wave, warning, waveLine(d.chapter, s.wave, last), broke ? t('run.brokeThrough') : null);
        // kept at each wave too, in case the game dies without going to the background first
        d.keepRun();
      }
    }
    const p = s.players[0];
    if (this.tutorial && !game.paused && p.offer.length === 0) {
      const step = this.tutorial.step;
      this.tutorial = stepTutorial(this.tutorial, dt, p.moving);
      hud.setTutorial(this.tutorial.step);
      if (step !== 'done' && this.tutorial.step === 'done') d.net.track('tutorial');
    }
    hud.setXp(p.level, p.xp / xpToNext(p.level));
    hud.setBuild(buildSlots(p));
    hud.setCharges(spellCharges(p));
    // offers come one after another (several levels at once, a shrine's insight), each a new list
    if (p.offer.length > 0 && this.shownOffer !== p.offer) {
      this.shownOffer = p.offer;
      const title = p.offer[0].kind === 'shrine' ? t('card.shrine') : t('card.levelUp');
      hud.showOffer(title, p.offer.map((c) => cardText(c, p)));
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
        hud.speak(clearLine(d.chapter));
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
    this.fall = { cause, goal: this.d.past ? nearestGoal(s.wave, s.config.waves, this.d.past) : null };
    return this.fall;
  }
}
