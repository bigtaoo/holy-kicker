import { Container, type Application } from 'pixi.js';
import { isBossWave, isEliteWave, SUTRA_IDS, TICK_RATE, xpToNext, type Card, type SimState } from '@hk/engine';
import { setLocale, t, type Locale } from '../i18n';
import { Game, STICK_RADIUS, type Art } from '../game/Game';
import { DragStick } from '../game/dragStick';
import type { LevelSettings, QualityMode } from '../game/quality';
import { rankedRun, type SceneOptions } from '../game/scene';
import { computeViewport } from '../game/viewport';
import { setupOf } from '../game/runSetup';
import { BALANCE } from '../meta/balance';
import { evolvedIn } from '../meta/codex';
import { loadout } from '../meta/loadout';
import { bump, rollDay } from '../meta/daily';
import { fixPatrolClock, startPatrol } from '../meta/patrol';
import { chooseTrack, doubleCopper, earnedSutras, settleRun, type Reward } from '../meta/progress';
import { dropRun, keepRun, loadRun, type SavedRun } from '../meta/resume';
import type { SaveData } from '../meta/save';
import type { SaveStore } from '../meta/saveStore';
import { loadSettings, updateSettings } from '../meta/settings';
import { bracketed } from '../platform/brackets';
import type { Ads, Platform, Portal } from '../platform/types';
import { Sound } from '../audio/Sound';
import type { Backend, RunRank } from '../net/backend';
import type { PropValue } from '@hk/protocol';
import { eventCue } from '../game/soundCues';
import { loadChapterArt, loadMonkArt } from '../art';
import { cardText } from './cardText';
import { LobbyScreen } from './LobbyScreen';
import { ResultsScreen } from './ResultsScreen';
import { ResumeScreen } from './ResumeScreen';
import { RunHud } from './RunHud';
import { storedSettings } from './settingsPanel';
import { canReport, reportProblem } from './problemReport';
import { PlayerName } from './playerName';
import { CLEAR_LINE_TIME, clearLine, waveLine } from './story';
import { newTutorial, stepTutorial, type Tutorial } from './tutorial';
import { buildSlots, spellCharges } from './buildSlots';
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
  /** Milliseconds on screen since the last `leave` event. */
  private shownMs = 0;
  private game: Game | null = null;
  private hud: RunHud | null = null;
  private chapter = 1;
  /** The run in play is hard mode. */
  private hard = false;
  private screenKey = '';
  /** The lobby's banner is up: its band is kept clear like a safe-area inset. */
  private bannerUp = false;
  private quality: LevelSettings | null = null;
  /** Switches the render quality mode (boot.ts wires it to the quality runtime). */
  onQualityMode: (mode: QualityMode) => void = () => {};
  /** The wave the HUD last showed, and whether the death panel is up. */
  private shownWave = -1;
  private downShown = false;
  /** Seconds left on the monk's line after a won run's boss, before the results. */
  private clearWait: number | null = null;
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
  private readonly names: PlayerName;

  constructor(
    private readonly app: Application,
    private readonly platform: Platform,
    private readonly art: Art,
    private readonly scene: SceneOptions,
    private readonly store: SaveStore,
    /** Analytics and the leaderboard (net/backend.ts). */
    private readonly net: Backend,
    /** A desktop: the first run's move hint also names the keyboard. */
    private readonly keys = false,
  ) {
    this.names = new PlayerName(net, platform.storage, () => this.portal.userName());
    this.save = this.names.withDice(store.load());
    store.save(this.save);
    const settings = loadSettings(platform.storage);
    this.sound = new Sound(platform, settings.volume, settings.music);
    this.ads = this.sound.muteDuring(platform.ads);
    this.portal = bracketed(platform.portal);
    onButtonTap(() => this.sound.play('tap'));
    platform.bindStick(app, this.stick);
    // coming back to a run mid-fight is unfair; it waits on the pause panel instead, and is kept
    // in case the game is closed for good
    platform.onHide(() => {
      this.hud?.pauseForHost();
      this.keepRun();
    });
    app.stage.addChild(this.ui);
    app.ticker.add(() => this.tick());
    net.track('session', { runs: this.save.runs, level: this.save.level });
    net.onLeave(() => this.leaving());
  }

  /** Where the player is as the game goes to the background, and for how long it was on screen. */
  private leaving(): Record<string, PropValue> {
    const secs = Math.round(this.shownMs / 1000);
    this.shownMs = 0;
    const s = this.screen;
    if (s instanceof LobbyScreen) return { place: 'lobby', secs };
    if (s instanceof ResultsScreen) return { place: 'results', secs };
    if (this.game) return { place: 'run', secs, chapter: this.chapter, wave: Math.max(1, this.game.engine.state.wave) };
    return { place: 'other', secs };
  }

  /** `direct` skips the lobby, for stress tests and screenshots (?direct). */
  start(direct = false): void {
    const left = direct ? null : loadRun(this.platform.storage);
    if (left) this.offerResume(left);
    else if (direct || !this.save.firstRunDone) this.play(this.scene.chapter || this.save.chapter);
    else this.showLobby();
    this.portal.loaded();
  }

  /** The current run, for dev console hooks. */
  get run(): Game | null {
    return this.game;
  }

  /** Records a share from the host's menu, with the screen it was made from. */
  shared(to: 'chat' | 'moments'): void {
    const from = this.screen instanceof LobbyScreen ? 'lobby' : this.screen instanceof ResultsScreen ? 'results' : 'run';
    this.net.track('share', { to, from });
  }

  applyQuality(s: LevelSettings): void {
    this.quality = s;
    this.game?.applyQuality(s);
  }

  /** Re-reads the save after the portal account changed (a guest signed in). */
  reloadSave(): void {
    this.save = this.names.withDice(this.store.load());
    if (this.screen instanceof LobbyScreen) this.showLobby();
  }

  private setScreen(screen: Screen | null): void {
    // the banner goes up on the way into the lobby (not on each rebuild of it) and down on the way out
    const lobby = screen instanceof LobbyScreen;
    if (!lobby) {
      this.platform.banner.hide();
      this.bannerUp = false;
    } else if (!(this.screen instanceof LobbyScreen)) {
      void this.platform.banner.show().then((up) => {
        this.bannerUp = up && this.screen instanceof LobbyScreen;
        this.screenKey = '';
      });
    }
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
    // a rolled name reaches the boards from here
    this.names.sync(save);
  }

  /** `settings` opens the lobby on its settings panel (after a language change). */
  private showLobby(settings = false): void {
    // a new day's counters, and the patrol once it opens
    const now = Date.now();
    const save = startPatrol(fixPatrolClock(rollDay(this.save, now), now), now);
    if (save !== this.save) this.commit(save);
    // a renamed or newly signed-in portal account reaches the boards from here
    this.names.sync(this.save);
    const lobby = new LobbyScreen(this.save, this.names, {
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
      settings: storedSettings(this.platform.storage, this.sound, {
        setLanguage: (locale) => this.setLanguage(locale),
        setQuality: (quality) => this.onQualityMode(quality),
        online: this.net.online,
      }),
      commit: (save) => this.commit(save),
      adAvailable: () => this.ads.rewardedAvailable(),
      rewarded: () => this.rewarded('lobby'),
      board: this.net.online ? (id) => this.net.board(id) : null,
      track: (e, p) => this.net.track(e, p),
    }, this.art.icons, this.app.renderer, this.art.lobby);
    if (settings) lobby.openSettings();
    this.setScreen(lobby);
  }

  private setLanguage(locale: Locale): void {
    this.keepLanguage(locale);
    this.showLobby(true);
  }

  private keepLanguage(locale: Locale): void {
    setLocale(locale);
    updateSettings(this.platform.storage, { locale });
  }

  /** The last run was left unfinished: go on with it, or give it up (settled like a give-up in the run). */
  private offerResume(left: SavedRun): void {
    const { config: c, outcome, players } = left.state;
    const giveUp = () => {
      [this.chapter, this.hard, this.kills] = [c.chapter, c.hard, left.kills];
      this.settle(left.state);
    };
    // fallen with no revive left, there is nothing to go on with
    if (outcome === 'lost' && players[0].revives === 0) return giveUp();
    this.setScreen(new ResumeScreen({ chapter: c.chapter, hard: c.hard, wave: left.state.wave, waves: c.waves }, { resume: () => this.play(c.chapter, left), giveUp }));
  }

  /** Starts a run of `chapter` (or goes on with `left`) once its art is in (a later chapter's pack or a monk's rig may need fetching). */
  private play(chapter: number, left?: SavedRun): void {
    if (this.loading) return;
    this.loading = true;
    const monk = left?.state.config.monk ?? this.scene.monk ?? this.save.monk;
    Promise.all([loadChapterArt(this.platform, this.scene, this.art, chapter), loadMonkArt(this.platform, this.art, monk)]).then(
      () => {
        this.loading = false;
        this.startRun(chapter, left);
      },
      (err: unknown) => {
        // stay in (or go back to) the lobby; the next tap tries again
        this.loading = false;
        console.error(err);
        this.showLobby();
      },
    );
  }

  private startRun(chapter: number, left?: SavedRun): void {
    this.chapter = chapter;
    this.hard = left ? left.state.config.hard : this.scene.hard || this.save.hard;
    this.setScreen(null);
    const { bonus, freeRevives } = loadout(this.save, chapter, this.hard);
    this.freeRevives = left ? left.freeRevives : freeRevives;
    this.game = new Game(this.app, this.platform, this.art, this.scene, this.stick, left ? setupOf(left.state.config) : {
      chapter,
      waves: this.scene.waves ? BALANCE.waves : 0,
      revives: BALANCE.revives + freeRevives,
      relic: this.scene.relic ?? this.save.relic,
      sutras: this.scene.sutras ? SUTRA_IDS : earnedSutras(this.save),
      bonus: this.scene.bare ? {} : bonus,
      hard: this.hard,
      monk: this.scene.monk ?? this.save.monk,
    }, left?.state);
    this.shownWave = -1;
    this.downShown = false;
    this.clearWait = null;
    this.shownOffer = null;
    this.kills = left?.kills ?? 0;
    // the first run teaches moving; a replayed first chapter (or a resumed run) does not
    this.tutorial = this.save.firstRunDone || !this.scene.waves || left ? null : newTutorial();
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
      setFast: (fast) => {
        if (this.game) this.game.speed = fast ? 2 : 1;
        updateSettings(this.platform.storage, { fast });
      },
      giveUp: () => this.endRun(),
      revive: () => this.revive(),
      pick: (index) => this.game?.pick(index),
      setLanguage: (locale) => this.keepLanguage(locale),
      report: canReport(this.net, import.meta.env.DEV) ? () => reportProblem(this.platform, this.net, () => this.game, this.scene) : null,
    }, this.art.icons, this.keys);
    this.setScreen(this.hud);
    // the fast-forward choice carries over from the last run
    this.hud.setFast(loadSettings(this.platform.storage).fast);
    this.portal.gameplayStart();
    // a resumed fight waits on the pause panel until the player looks (a card choice or the death panel holds it anyway)
    const s = this.game.engine.state;
    if (!left) this.net.track('run_start', { chapter, hard: this.hard, monk: this.scene.monk ?? this.save.monk, relic: this.scene.relic ?? this.save.relic });
    else if (s.outcome === 'playing' && s.players[0].offer.length === 0) this.hud.pauseForHost();
  }

  /** Keeps the run in play for the next launch (meta/resume.ts); not the sandbox or a dev bot's run. */
  private keepRun(): void {
    const s = this.game?.engine.state;
    if (!s || s.config.waves === 0 || this.scene.autoplay || this.scene.record) return;
    keepRun(this.platform.storage, { state: s, freeRevives: this.freeRevives, kills: this.kills });
  }

  /** A rewarded ad, counted when it paid (`at` says where it was offered). */
  private async rewarded(at: string): Promise<boolean> {
    const paid = await this.ads.rewarded();
    if (paid) this.net.track('ad', { at });
    return paid;
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
    const paid = await this.rewarded('revive');
    if (!paid || !this.game) return false;
    // the engine stands the hero up on its next tick; watchRun then resumes the portal
    this.game.revive();
    return true;
  }

  private endRun(): void {
    if (!this.game) return;
    const s = this.game.engine.state;
    this.game.destroy();
    this.game = null;
    this.hud = null;
    // the death panel already told the portal
    if (!this.downShown) this.portal.gameplayStop();
    this.settle(s);
  }

  /**
   * Pays out the run that ended in `s` (won, lost or given up) and shows the results. Tells the
   * backend how it went, and enters it on its board when no dev switch bent the rules; the
   * results show the install's rank there once it comes (none offline, unranked or failed).
   */
  private settle(s: SimState): void {
    dropRun(this.platform.storage);
    // waves fully cleared: all of them for a won run, else the ones before the current wave
    const waves = s.outcome === 'won' ? s.config.waves : Math.max(0, s.wave - 1);
    const p = s.players[0];
    const run = {
      chapter: this.chapter, hard: this.hard, won: s.outcome === 'won', wave: Math.max(1, s.wave), tenths: Math.round((s.tick * 10) / TICK_RATE),
      level: p.level, kills: this.kills, monk: p.monk, relic: p.relicId,
    };
    this.net.track('run_end', { ...run, gaveUp: s.outcome === 'playing' });
    const rank = rankedRun(this.scene) ? this.net.submitRun({ ...run, ...this.names.board(this.save) }) : Promise.resolve(null);
    void this.net.flush();
    const settled = settleRun(this.save, { chapter: this.chapter, hard: this.hard, waves, offerings: p.offerings, evolved: evolvedIn(p), kills: this.kills });
    const { reward } = settled;
    const now = Date.now();
    const save = bump(bump(bump(settled.save, now, 'runs', 1), now, 'waves', waves), now, 'kills', this.kills);
    // paid before the results show, so closing the tab now keeps the reward
    this.commit(save);
    if (reward.firstClear) this.portal.celebrate();
    this.showResults(reward, waves, rank);
  }

  private showResults(reward: Reward, waves: number, rank: Promise<RunRank | null>): void {
    let leaving = false;
    this.setScreen(new ResultsScreen(reward, waves, {
      double: async () => {
        const paid = await this.rewarded('double');
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
    }, this.ads.rewardedAvailable(), rank));
  }

  private tick(): void {
    // frames only come while the game is on screen; a long stall (a breakpoint, a suspended tab) counts as one second
    this.shownMs += Math.min(this.app.ticker.deltaMS, 1000);
    const { width, height } = this.app.screen;
    const key = `${width}x${height}`;
    if (this.screen && key !== this.screenKey) {
      this.screenKey = key;
      const insets = this.platform.safeInsets();
      if (this.bannerUp) insets.bottom += this.platform.banner.height;
      this.screen.layout(uiFrame(computeViewport(width, height), insets));
    }
    if (this.game && this.hud) this.watchRun(this.game, this.hud);
    else this.screen?.update?.(this.app.ticker.deltaMS / 1000);
    // the run has the battle music (the boss's on the mid-boss and boss waves), every screen
    // around it the lobby's
    this.sound.flush(this.game ? (this.bossFight(this.game) ? 'boss' : 'battle') : 'lobby', this.app.ticker.deltaMS);
  }

  /** The run is on a mid-boss or boss wave (the boss music plays through to the results). */
  private bossFight(game: Game): boolean {
    const s = game.engine.state;
    return s.config.waves > 0 && isBossWave(s.wave, s.config.waves);
  }

  private watchRun(game: Game, hud: RunHud): void {
    const s = game.engine.state;
    hud.update(this.app.ticker.deltaMS / 1000);
    if (s.wave !== this.shownWave) {
      this.shownWave = s.wave;
      hud.setWave(s.wave);
      const last = s.config.waves;
      const warning = isBossWave(s.wave, last) ? t('run.boss') : isEliteWave(s.wave, last) ? t('run.elite') : null;
      if (s.wave > 0) {
        hud.announce(s.wave, warning, waveLine(this.chapter, s.wave, last));
        // kept at each wave too, in case the game dies without going to the background first
        this.keepRun();
      }
    }
    const p = s.players[0];
    if (this.tutorial && !game.paused && p.offer.length === 0) {
      const step = this.tutorial.step;
      this.tutorial = stepTutorial(this.tutorial, this.app.ticker.deltaMS / 1000, p.moving);
      hud.setTutorial(this.tutorial.step);
      if (step !== 'done' && this.tutorial.step === 'done') this.net.track('tutorial');
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
      this.portal.gameplayStart();
    }
    if (s.outcome === 'won') {
      // the run stands still on the monk's line after the boss, then the results
      if (this.clearWait === null) {
        this.clearWait = CLEAR_LINE_TIME;
        this.portal.gameplayStop();
        hud.speak(clearLine(this.chapter));
      }
      this.clearWait -= this.app.ticker.deltaMS / 1000;
      if (this.clearWait <= 0) this.endRun();
    }
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
