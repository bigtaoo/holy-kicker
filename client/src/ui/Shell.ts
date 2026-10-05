import { Container, type Application } from 'pixi.js';
import { isBossWave, isEliteWave, SUTRA_IDS, xpToNext, type Card } from '@hk/engine';
import { setLocale, t, type Locale } from '../i18n';
import { Game, STICK_RADIUS, type Art } from '../game/Game';
import { DragStick } from '../game/dragStick';
import type { LevelSettings, QualityMode } from '../game/quality';
import type { SceneOptions } from '../game/scene';
import { computeViewport } from '../game/viewport';
import { BALANCE } from '../meta/balance';
import { evolvedIn } from '../meta/codex';
import { loadout } from '../meta/loadout';
import { bump, rollDay } from '../meta/daily';
import { fixPatrolClock, startPatrol } from '../meta/patrol';
import { chooseTrack, doubleCopper, earnedSutras, settleRun, type Reward } from '../meta/progress';
import type { SaveData } from '../meta/save';
import type { SaveStore } from '../meta/saveStore';
import { loadSettings, updateSettings } from '../meta/settings';
import { bracketed } from '../platform/brackets';
import type { Ads, Platform, Portal } from '../platform/types';
import { Sound } from '../audio/Sound';
import { eventCue } from '../game/soundCues';
import { loadChapterArt, loadMonkArt } from '../art';
import { cardText } from './cardText';
import { LobbyScreen } from './LobbyScreen';
import { ResultsScreen } from './ResultsScreen';
import { RunHud } from './RunHud';
import { newTutorial, stepTutorial, type Tutorial } from './tutorial';
import { buildSlots } from './buildSlots';
import { uiFrame, type Screen } from './uiLayout';
import { onButtonTap } from './widgets';

// The game's flow (docs/design.md "Flow"): the first launch goes straight into chapter 1,
// afterwards lobby -> run -> results -> lobby. Owns the save, the current screen and the
// current run, and tells the portal when gameplay starts and stops.
//
// The engine runs the chapter's waves; the shell watches its state for a new wave (a
// banner), experience and level-up offers (the card panel), the hero going down (the death
// panel, revive with an ad) and the outcome. A run ends won, lost, or when the player gives up.

export class Shell {
  private save: SaveData;
  private readonly stick = new DragStick(STICK_RADIUS);
  /** Screens draw over the run. */
  private readonly ui = new Container();
  private screen: Screen | null = null;
  private game: Game | null = null;
  private hud: RunHud | null = null;
  private chapter = 1;
  /** The run in play is hard mode. */
  private hard = false;
  private screenKey = '';
  private quality: LevelSettings | null = null;
  /** Switches the render quality mode (boot.ts wires it to the quality runtime). */
  onQualityMode: (mode: QualityMode) => void = () => {};
  /** The wave the HUD last showed, and whether the death panel is up. */
  private shownWave = -1;
  private downShown = false;
  /** The offer whose cards the HUD shows; null when none are up. */
  private shownOffer: readonly Card[] | null = null;
  /** Free revives (training) left in this run; they come before the rewarded-ad one. */
  private freeRevives = 0;
  /** Enemies defeated in this run, for the daily tasks. */
  private kills = 0;
  private tutorial: Tutorial | null = null;
  /** A chapter's art pack is being fetched; taps on play wait for it. */
  private loading = false;
  readonly sound: Sound;
  /** The host's ads, with the game silent while one plays. */
  private readonly ads: Ads;
  /** The host's session hooks, each gameplay start or stop sent once. */
  private readonly portal: Portal;

  constructor(
    private readonly app: Application,
    private readonly platform: Platform,
    private readonly art: Art,
    private readonly scene: SceneOptions,
    private readonly store: SaveStore,
    /** A desktop: the first run's move hint also names the keyboard. */
    private readonly keys = false,
  ) {
    this.save = store.load();
    const settings = loadSettings(platform.storage);
    this.sound = new Sound(platform, settings.volume, settings.music);
    this.ads = this.sound.muteDuring(platform.ads);
    this.portal = bracketed(platform.portal);
    onButtonTap(() => this.sound.play('tap'));
    platform.bindStick(app, this.stick);
    // coming back to a run mid-fight is unfair; it waits on the pause panel instead
    platform.onHide(() => this.hud?.pauseForHost());
    app.stage.addChild(this.ui);
    app.ticker.add(() => this.tick());
  }

  /** `direct` skips the lobby, for stress tests and screenshots (?direct). */
  start(direct = false): void {
    if (direct || !this.save.firstRunDone) this.play(this.scene.chapter || this.save.chapter);
    else this.showLobby();
    this.portal.loaded();
  }

  /** The current run, for dev console hooks. */
  get run(): Game | null {
    return this.game;
  }

  applyQuality(s: LevelSettings): void {
    this.quality = s;
    this.game?.applyQuality(s);
  }

  /** Re-reads the save after the portal account changed (a guest signed in). */
  reloadSave(): void {
    this.save = this.store.load();
    if (this.screen instanceof LobbyScreen) this.showLobby();
  }

  private setScreen(screen: Screen | null): void {
    this.screen?.destroy();
    this.screen = screen;
    if (screen) {
      this.ui.addChild(screen.view);
      this.screenKey = '';
    }
  }

  private commit(save: SaveData): void {
    this.save = save;
    this.store.save(save);
  }

  /** `settings` opens the lobby on its settings panel (after a language change). */
  private showLobby(settings = false): void {
    // a new day's counters, and the patrol once it opens
    const now = Date.now();
    const save = startPatrol(fixPatrolClock(rollDay(this.save, now), now), now);
    if (save !== this.save) this.commit(save);
    const lobby = new LobbyScreen(this.save, this.portal.userName(), {
      play: (chapter) => this.play(chapter),
      selectChapter: (chapter) => {
        this.commit({ ...this.save, chapter });
        this.showLobby();
      },
      chooseTrack: (hard) => {
        this.commit(chooseTrack(this.save, hard));
        this.showLobby();
      },
      selectRelic: (relic) => {
        this.commit({ ...this.save, relic });
        this.showLobby();
      },
      settings: {
        setLanguage: (locale) => this.setLanguage(locale),
        volume: () => this.sound.level,
        setVolume: (volume) => {
          this.sound.setVolume(volume);
          updateSettings(this.platform.storage, { volume });
        },
        music: () => this.sound.musicLevel,
        setMusic: (music) => {
          this.sound.setMusicVolume(music);
          updateSettings(this.platform.storage, { music });
        },
        quality: () => loadSettings(this.platform.storage).quality,
        setQuality: (quality) => {
          updateSettings(this.platform.storage, { quality });
          this.onQualityMode(quality);
        },
      },
      commit: (save) => this.commit(save),
      adAvailable: () => this.ads.rewardedAvailable(),
      rewarded: () => this.ads.rewarded(),
    }, this.art.icons, this.app.renderer);
    if (settings) lobby.openSettings();
    this.setScreen(lobby);
  }

  private setLanguage(locale: Locale): void {
    setLocale(locale);
    updateSettings(this.platform.storage, { locale });
    this.showLobby(true);
  }

  /** Starts a run of `chapter` once its art is in (a later chapter's pack or a monk's rig may need fetching). */
  private play(chapter: number): void {
    if (this.loading) return;
    this.loading = true;
    const monk = this.scene.monk ?? this.save.monk;
    Promise.all([loadChapterArt(this.platform, this.scene, this.art, chapter), loadMonkArt(this.platform, this.art, monk)]).then(
      () => {
        this.loading = false;
        this.startRun(chapter);
      },
      (err: unknown) => {
        // stay in (or go back to) the lobby; the next tap tries again
        this.loading = false;
        console.error(err);
        this.showLobby();
      },
    );
  }

  private startRun(chapter: number): void {
    this.chapter = chapter;
    this.hard = this.scene.hard || this.save.hard;
    this.setScreen(null);
    const { bonus, freeRevives } = loadout(this.save, chapter, this.hard);
    this.freeRevives = freeRevives;
    this.game = new Game(this.app, this.platform, this.art, this.scene, this.stick, {
      chapter,
      waves: this.scene.waves ? BALANCE.waves : 0,
      revives: BALANCE.revives + freeRevives,
      relic: this.scene.relic ?? this.save.relic,
      sutras: this.scene.sutras ? SUTRA_IDS : earnedSutras(this.save),
      bonus: this.scene.bare ? {} : bonus,
      hard: this.hard,
      monk: this.scene.monk ?? this.save.monk,
    });
    this.shownWave = -1;
    this.downShown = false;
    this.shownOffer = null;
    this.kills = 0;
    // the first run teaches moving; a replayed first chapter does not
    this.tutorial = this.save.firstRunDone || !this.scene.waves ? null : newTutorial();
    if (this.quality) this.game.applyQuality(this.quality);
    this.game.onEvents = (events) => {
      for (const e of events) {
        if (e.type === 'mobDown') this.kills++;
        const cue = eventCue(e, 0);
        if (cue) this.sound.play(cue);
      }
    };
    // the run adds itself to the stage; keep the UI above it
    this.app.stage.addChild(this.ui);
    this.hud = new RunHud(BALANCE.waves, this.hard, {
      pause: () => this.setPaused(true),
      resume: () => this.setPaused(false),
      giveUp: () => this.endRun(),
      revive: () => this.revive(),
      pick: (index) => this.game?.pick(index),
    }, this.art.icons, this.keys);
    this.setScreen(this.hud);
    this.portal.gameplayStart();
  }

  private setPaused(paused: boolean): void {
    if (!this.game) return;
    this.game.paused = paused;
    if (paused) this.portal.gameplayStop();
    else this.portal.gameplayStart();
  }

  private async revive(): Promise<boolean> {
    if (this.freeRevives > 0 && this.game) {
      this.freeRevives--;
      this.game.revive();
      return true;
    }
    const paid = await this.ads.rewarded();
    if (!paid || !this.game) return false;
    // the engine stands the hero up on its next tick; watchRun then resumes the portal
    this.game.revive();
    return true;
  }

  /** Waves fully cleared: all of them for a won run, else the ones before the current wave. */
  private wavesCleared(): number {
    if (!this.game) return 0;
    const s = this.game.engine.state;
    return s.outcome === 'won' ? s.config.waves : Math.max(0, s.wave - 1);
  }

  private endRun(): void {
    if (!this.game) return;
    const waves = this.wavesCleared();
    const p = this.game.engine.state.players[0];
    const { offerings } = p;
    const evolved = evolvedIn(p);
    this.game.destroy();
    this.game = null;
    this.hud = null;
    // the death panel already told the portal
    if (!this.downShown) this.portal.gameplayStop();
    const settled = settleRun(this.save, { chapter: this.chapter, hard: this.hard, waves, offerings, evolved });
    const { reward } = settled;
    const now = Date.now();
    const save = bump(bump(bump(settled.save, now, 'runs', 1), now, 'waves', waves), now, 'kills', this.kills);
    // paid before the results show, so closing the tab now keeps the reward
    this.commit(save);
    if (reward.firstClear) this.portal.celebrate();
    this.showResults(reward, waves);
  }

  private showResults(reward: Reward, waves: number): void {
    let leaving = false;
    this.setScreen(new ResultsScreen(reward, waves, {
      double: async () => {
        const paid = await this.ads.rewarded();
        if (paid) this.commit(doubleCopper(this.save, reward));
        return paid;
      },
      next: () => {
        if (leaving) return;
        leaving = true;
        // the interstitial sits on the results -> lobby break, never inside a run, and never
        // after the first run (the tutorial), so a new player reaches the lobby before any ad
        const ad = this.save.runs > 1 ? this.ads.midgame() : Promise.resolve();
        void ad.then(() => this.showLobby());
      },
    }, this.ads.rewardedAvailable()));
  }

  private tick(): void {
    const { width, height } = this.app.screen;
    const key = `${width}x${height}`;
    if (this.screen && key !== this.screenKey) {
      this.screenKey = key;
      this.screen.layout(uiFrame(computeViewport(width, height), this.platform.safeInsets()));
    }
    if (this.game && this.hud) this.watchRun(this.game, this.hud);
    else this.screen?.update?.(this.app.ticker.deltaMS / 1000);
    // the run has the battle music, every screen around it the lobby's
    this.sound.flush(this.game ? 'battle' : 'lobby', this.app.ticker.deltaMS);
  }

  private watchRun(game: Game, hud: RunHud): void {
    const s = game.engine.state;
    hud.update(this.app.ticker.deltaMS / 1000);
    if (s.wave !== this.shownWave) {
      this.shownWave = s.wave;
      hud.setWave(s.wave);
      const last = s.config.waves;
      const warning = isBossWave(s.wave, last) ? t('run.boss') : isEliteWave(s.wave, last) ? t('run.elite') : null;
      if (s.wave > 0) hud.announce(s.wave, warning);
    }
    const p = s.players[0];
    if (this.tutorial && !game.paused && p.offer.length === 0) {
      this.tutorial = stepTutorial(this.tutorial, this.app.ticker.deltaMS / 1000, p.moving);
      hud.setTutorial(this.tutorial.step);
    }
    hud.setXp(p.level, p.xp / xpToNext(p.level));
    hud.setBuild(buildSlots(p));
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
      this.portal.gameplayStart();
    }
    if (s.outcome === 'won') this.endRun();
    else if (s.outcome === 'lost' && !this.downShown) {
      this.downShown = true;
      this.portal.gameplayStop();
      // the offer appears once the host says an ad can play
      const revives = s.players[0].revives;
      hud.showDown(revives > 0 && this.freeRevives > 0 ? 'free' : 'none');
      if (revives > 0 && this.freeRevives === 0) {
        void this.ads.rewardedAvailable().then((ok) => {
          if (ok && this.hud === hud && this.downShown) hud.showDown('ad');
        });
      }
    }
  }
}
