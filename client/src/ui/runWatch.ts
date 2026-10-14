import { isBossWave, isEliteWave, xpToNext, type Card } from '@hk/engine';
import { t } from '../i18n';
import type { Game } from '../game/Game';
import type { Backend } from '../net/backend';
import type { Ads, Portal } from '../platform/types';
import { buildSlots, spellCharges } from './buildSlots';
import { cardText } from './cardText';
import type { RunHud } from './RunHud';
import { CLEAR_LINE_TIME, clearLine, waveLine } from './story';
import { newTutorial, stepTutorial, type Tutorial } from './tutorial';

// One run as the shell sees it, frame by frame: it watches the engine's state for a new wave (a
// banner), experience and level-up offers (the card panel), the hero going down (the death panel,
// revive with an ad), the tutorial's steps and the outcome, and tells the portal when gameplay
// stops and starts again. The first run holds still until the player's first touch or key, so a
// portal's consent popup or a tab opened in the background does not eat its opening seconds.

export interface RunWatchDeps {
  chapter: number;
  portal: Portal;
  ads: Ads;
  net: Backend;
  /** Free revives (training) left in the run; they come before the rewarded-ad one. */
  freeRevives(): number;
  /** The player is touching the screen or holding a move key. */
  input(): boolean;
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
  /** The first run waits for the player's first input. */
  holding: boolean;

  constructor(
    private readonly game: Game,
    private readonly hud: RunHud,
    private readonly d: RunWatchDeps,
    /** The run teaches moving (the first run, not a replay or a resumed one). */
    teach: boolean,
  ) {
    this.tutorial = teach ? newTutorial() : null;
    this.holding = teach;
    if (teach) {
      game.paused = true;
      hud.setTutorial('move');
    }
  }

  update(dt: number): void {
    const { game, hud, d } = this;
    const s = game.engine.state;
    hud.update(dt);
    if (this.holding && d.input()) {
      this.holding = false;
      game.paused = false;
    }
    if (s.wave !== this.shownWave) {
      this.shownWave = s.wave;
      hud.setWave(s.wave);
      const last = s.config.waves;
      const warning = isBossWave(s.wave, last) ? t('run.boss') : isEliteWave(s.wave, last) ? t('run.elite') : null;
      if (s.wave > 0) {
        hud.announce(s.wave, warning, waveLine(d.chapter, s.wave, last));
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
    } else if (s.outcome === 'lost' && !this.downShown) {
      this.downShown = true;
      d.portal.gameplayStop();
      // the offer appears once the host says an ad can play
      const revives = p.revives;
      const free = d.freeRevives();
      hud.showDown(revives > 0 && free > 0 ? 'free' : 'none');
      if (revives > 0 && free === 0) {
        void d.ads.rewardedAvailable().then((ok) => {
          if (ok && this.downShown && !hud.view.destroyed) hud.showDown('ad');
        });
      }
    }
  }
}
