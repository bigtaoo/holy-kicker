import { Container, type Application } from 'pixi.js';
import { isBossWave, type MonkId } from '@hk/engine';
import { Game, STICK_RADIUS, type Art } from '../game/Game';
import { DragStick } from '../game/dragStick';
import type { LevelSettings, QualityMode } from '../game/quality';
import type { SceneOptions } from '../game/scene';
import { computeViewport, wantsUpright } from '../game/viewport';
import { setupOf } from '../game/runSetup';
import { BALANCE } from '../meta/balance';
import { EXPERIMENTS, enroll, experimentTag, forcedArms } from '../meta/experiments';
import { rollDay } from '../meta/daily';
import { fixPatrolClock, startPatrol } from '../meta/patrol';
import { chooseTrack, selectChapter, type Tab } from '../meta/progress';
import { dropRun, loadRun, type SavedRun } from '../meta/resume';
import type { SaveData } from '../meta/save';
import type { SaveStore } from '../meta/saveStore';
import { loadSettings } from '../meta/settings';
import { pacedAds, type PacedAds } from '../platform/adPacing';
import { bracketed } from '../platform/brackets';
import type { Platform, Portal } from '../platform/types';
import { Sound } from '../audio/Sound';
import { languageProps, type Backend } from '../net/backend';
import { runLeave } from '../net/leaveProps';
import type { PerfReport } from '../net/perfReport';
import { RunReplays } from '../net/runReplays';
import type { Challenge, Device, OfferPlace, PropValue } from '@hk/protocol';
import { eventCue } from '../game/soundCues';
import { loadMonkArt } from '../art';
import { loadRunArt, lateArt, loadChapterArt } from '../chapterArt';
import { monkRig } from '../game/artTypes';
import { menuBackdrop } from './lobbyBars';
import { LobbyScreen } from './LobbyScreen';
import { LobbyArtLoad } from './lobbyArtLoad';
import { ChallengeFlow } from './challengeFlow';
import { ChallengeResultsScreen } from './ChallengeResultsScreen';
import { ResultsScreen } from './ResultsScreen';
import { ResumeScreen } from './ResumeScreen';
import { FaultGuard } from './faultGuard';
import { ReminderBook } from './reminders';
import { RunFlow } from './runFlow';
import { storedSettings, type SettingsActions } from './settingsPanel';
import { PlayerName } from './playerName';
import { ReplayScreen, type ReplayView } from './replayWatch';
import { uiFrame, type Screen } from './uiLayout';
import { uprightCover } from './uprightCover';
import { touchOnly } from './media';
import { onButtonTap } from './widgets';

// The game's flow (docs/design.md "Flow"): the first launch goes straight into chapter 1, afterwards lobby -> run ->
// results -> lobby. Owns the save, the current screen, the lobby and its routes (a chapter, a challenge, a replay, the
// resume offer), and the host's ads and portal hooks. The run itself, from its start to its results, is RunFlow's
// (runFlow.ts); the engine runs the chapter's waves and RunWatch follows each run frame by frame.

const RESUME_FROM_WAVE = 3; // the first wave a run left unfinished must have reached to be offered again on the next launch

export class Shell {
  private save: SaveData;
  private readonly stick = new DragStick(STICK_RADIUS);
  /** Screens draw over the run. */
  private readonly ui = new Container();
  private screen: Screen | null = null;
  private shownMs = 0; // milliseconds on screen since the last `leave` event
  private screenKey = '';
  /** The "turn upright" cover while a touch-only device is held sideways, and the size it was drawn for. */
  private upright: { view: Container; key: string } | null = null;
  private readonly touchOnly = touchOnly();
  private bannerUp = false; // the lobby's banner is up: its band is kept clear like a safe-area inset
  private quality: LevelSettings | null = null;
  /** Switches the render quality mode (boot.ts wires it to the quality runtime). */
  onQualityMode: (mode: QualityMode) => void = () => {};
  /** The `perf` sender (boot.ts feeds it the battle frames); a meter per real run. */
  perf: PerfReport | null = null;
  cloud: SettingsActions['cloud'] = null; // the cloud save's settings rows (boot.ts), unset where the host has its own
  private loading = false; // a chapter's art pack is being fetched; taps on play wait for it
  private readonly lobbyArt: LobbyArtLoad;
  private readonly challenge: ChallengeFlow; // the challenges: their records, the run in play and its replay, the weeks to pay
  private readonly replays: RunReplays; // each real run's replay, while the server collects them
  readonly sound: Sound;
  /** The host's ads, with the game silent while one plays and the interstitials paced (platform/adPacing.ts). */
  private readonly ads: PacedAds;
  /** The host's session hooks, each gameplay start or stop sent once. */
  private readonly portal: Portal;
  private readonly names: PlayerName;
  /** The run in play, from its start to its results (runFlow.ts). */
  private readonly runs: RunFlow;
  /** The iOS app's reminders, booked on the way to the lobby and to the background; null on hosts without them. */
  private readonly reminders: ReminderBook | null;
  private readonly faults = new FaultGuard();
  /** The run on screen was resumed after a fault: one more fault settles it rather than offering it again. */
  private faultedRun = false;
  /** Reports a frame that threw (boot.ts wires it to the `anomaly` event). */
  onFault: (err: unknown) => void = () => {};

  constructor(
    private readonly app: Application,
    private readonly platform: Platform,
    private readonly art: Art,
    private readonly scene: SceneOptions,
    private readonly store: SaveStore,
    /** Analytics and the leaderboard (net/backend.ts). */
    private readonly net: Backend,
    /** The kind of device (analytics); on a desktop the first run's move hint also names the keyboard. */
    private readonly device: Device = 'mobile',
    private readonly privacy: SettingsActions['privacy'] = null, // the player's privacy answer (net/privacyChoice.ts); null offline
    /** The device's memory, cores and GPU class for `session` (net/perfReport.ts sessionDevice). */
    deviceProps: Record<string, PropValue> = {},
  ) {
    this.names = new PlayerName(net, platform.storage, platform.portal);
    this.lobbyArt = new LobbyArtLoad(platform, art, this.app.renderer);
    this.replays = new RunReplays(net);
    this.challenge = new ChallengeFlow(net, () => (this.screenKey = ''), scene.challenge, scene.settleWeeks); // the lobby is drawn again when the record comes
    this.save = this.enrolled(this.names.withDice(store.load()));
    store.save(this.save);
    const settings = loadSettings(platform.storage);
    this.sound = new Sound(platform, settings.volume, settings.music);
    this.ads = pacedAds(this.sound.muteDuring(platform.ads), BALANCE.ads.interstitialMinutes * 60_000);
    this.portal = bracketed(platform.portal);
    this.reminders = platform.notify ? new ReminderBook(platform.notify, platform.storage, () => this.save) : null;
    onButtonTap(() => this.sound.play('tap'));
    platform.bindStick(app, this.stick);
    platform.onKey?.((code, repeat) => this.screen?.key?.(code, repeat));
    // coming back to a run mid-fight is unfair; it waits on the pause panel instead, and is kept in case the game is closed for good
    platform.onHide(() => {
      this.runs.hidden();
      this.reminders?.sync();
    });
    this.runs = new RunFlow({
      app, platform, art, scene, stick: this.stick, net, device, sound: this.sound, ads: this.ads, portal: this.portal, names: this.names,
      challenge: this.challenge, replays: this.replays,
      save: () => this.save, commit: (save) => this.commit(save), setScreen: (screen) => this.setScreen(screen),
      showLobby: (tab) => this.showLobby(tab ?? null), play: (chapter, left, from) => void this.play(chapter, left, from),
      rewarded: (at) => this.rewarded(at), quality: () => this.quality, perf: () => this.perf,
      freeLobbyArt: () => this.lobbyArt.free(), raiseUi: () => this.app.stage.addChild(this.ui),
    });
    app.stage.addChild(this.ui);
    app.ticker.add(() => this.tick());
    net.track('session', { runs: this.save.runs, level: this.save.level, device: this.device, ...deviceProps, ...languageProps(platform, globalThis.navigator?.languages), ...platform.sessionProps?.() });
    net.onLeave(() => this.leaving());
  }

  /** Where the player is as the game goes to the background, and for how long it was on screen. */
  private leaving(): Record<string, PropValue> {
    const secs = Math.round(this.shownMs / 1000);
    this.shownMs = 0;
    const place = this.place();
    const r = this.runs;
    if (place === 'run' && r.game) return { place, secs, ...runLeave(r.game.engine.state, r.chapter, r.kills, r.watch?.tutorial?.step ?? null, this.platform.attention?.()) };
    return { place, secs };
  }

  /** Where the player is, as `leave` and `anomaly` name it. */
  place(): 'lobby' | 'results' | 'run' | 'other' {
    if (this.screen instanceof LobbyScreen) return 'lobby';
    if (this.screen instanceof ResultsScreen || this.screen instanceof ChallengeResultsScreen) return 'results';
    return this.runs.game ? 'run' : 'other';
  }

  // The first screen, settled once it is up (`direct`, ?direct: no lobby); then the late art, the lobby's, chapter 2's.
  async start(direct = false): Promise<void> {
    await this.firstScreen(direct);
    void lateArt().then(() => this.lobbyArt.ready()).then(() => loadChapterArt(this.platform, this.scene, this.art, 2)).catch(() => undefined);
  }

  private async firstScreen(direct: boolean): Promise<void> {
    this.portal.loaded(); // before the first run's gameplayStart: CrazyGames ignores one sent while loading
    let left = direct ? null : loadRun(this.platform.storage);
    // a run left in its first waves is not worth a question: it starts over
    if (left && left.state.wave < RESUME_FROM_WAVE) {
      dropRun(this.platform.storage);
      left = null;
    }
    if (left) this.offerResume(left);
    else if (direct || !this.save.firstRunDone) await this.play(this.scene.chapter || this.save.chapter);
    else {
      await this.lobbyArt.ready();
      this.showLobby();
    }
  }

  get run(): Game | null { // the current run, for dev console hooks
    return this.runs.game;
  }

  /** The first run's opening hint (drag to move) is on screen; the privacy toast waits for it. */
  get teachingMove(): boolean {
    return this.runs.watch?.tutorial?.step === 'move';
  }

  /** Records a share from the host's menu, with the screen it was made from. */
  shared(to: 'chat' | 'moments'): void {
    const from = this.screen instanceof LobbyScreen ? 'lobby' : this.place() === 'results' ? 'results' : 'run';
    this.net.track('share', { to, from });
  }

  applyQuality(s: LevelSettings): void {
    this.quality = s;
    this.runs.game?.applyQuality(s);
  }

  /** Re-reads the save after the portal account changed (a guest signed in). */
  reloadSave(): void {
    const loaded = this.names.withDice(this.store.load());
    this.save = this.enrolled(loaded);
    if (this.save.arms !== loaded.arms) this.store.save(this.save);
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

  /** `save` put in the experiments running here (meta/experiments.ts), and the events tagged with its arms. */
  private enrolled(save: SaveData): SaveData {
    const s = enroll(save, this.platform.host, Math.random, EXPERIMENTS, forcedArms(this.scene.arm));
    this.net.tag(experimentTag(s), s.tester);
    return s;
  }

  private commit(save: SaveData): void {
    if (save.tester !== this.save.tester) this.net.tag(experimentTag(save), save.tester);
    this.save = save;
    this.store.save(save);
    // a rolled name reaches the boards from here
    this.names.sync(save);
  }

  /** `open` opens the lobby on its settings panel (after a language change) or on a tab (the results' next step). */
  private showLobby(open: 'settings' | Tab | null = null): void {
    if (!this.lobbyArt.in) {
      void this.lobbyArt.ready().then(() => this.showLobby(open));
      return;
    }
    // a new day's counters, and the patrol once it opens
    const now = Date.now();
    const save = startPatrol(fixPatrolClock(rollDay(this.save, now), now), now);
    if (save !== this.save) this.commit(save);
    // a renamed or newly signed-in portal account reaches the boards from here
    this.names.sync(this.save);
    loadMonkArt(this.platform, this.art, this.save.monk).catch(() => undefined); // the patrol panel shows the chosen monk
    this.challenge.refresh();
    this.reminders?.sync(now);
    const lobby = new LobbyScreen(this.save, this.names, {
      play: (chapter) => this.play(chapter),
      selectChapter: (chapter) => this.relobby(selectChapter(this.save, chapter)),
      chooseTrack: (hard) => this.relobby(chooseTrack(this.save, hard)),
      selectRelic: (relic) => this.relobby({ ...this.save, relic }),
      settings: storedSettings(this.platform.storage, this.sound, {
        setLanguage: () => this.showLobby('settings'),
        setQuality: (quality) => this.onQualityMode(quality),
        privacy: this.privacy, copyId: this.platform.copyText?.bind(this.platform), cloud: this.cloud,
        account: this.platform.portal, adPrivacy: this.platform.adPrivacy, reminders: this.reminders ?? undefined,
        canVibrate: !!this.platform.vibrate,
        version: __HK_BUILD__, tester: () => this.save.tester, markTester: () => this.commit({ ...this.save, tester: true }),
      }),
      commit: (save) => this.commit(save),
      adAvailable: () => this.ads.rewardedAvailable(),
      rewarded: (at) => this.rewarded(at),
      board: this.net.online && this.names.ranked() ? (id) => this.net.board(id) : null, // no guests on account hosts
      challenge: () => this.challenge.lobby(this.save, this.names.ranked(), (c, chapter) => void this.play(chapter, undefined, null, c), (v) => this.watchReplay(v), (save) => this.relobby(save)),
      track: (e, p) => this.net.track(e, p), store: this.platform.store,
    }, this.art.icons, this.app.renderer, this.art.lobby, () => ({ rig: monkRig(this.art, this.save.monk), art: this.art.patrol, icons: this.art.icons }));
    if (open === 'settings') lobby.openSettings();
    else if (open) lobby.openTab(open);
    this.setScreen(lobby);
  }

  /** Keeps `save` and draws the lobby again with it. */
  private relobby(save: SaveData): void {
    this.commit(save);
    this.showLobby();
  }

  /** The last run was left unfinished: go on with it, or give it up (settled like a give-up in the run). */
  private offerResume(left: SavedRun): void {
    const { config: c, outcome, players } = left.state;
    const giveUp = () => this.runs.giveUp(left);
    // fallen with no revive left, there is nothing to go on with
    if (outcome === 'lost' && players[0].revives === 0) return giveUp();
    this.setScreen(new ResumeScreen({ chapter: c.chapter, hard: c.hard, wave: left.state.wave, waves: c.waves }, { resume: () => { this.net.track('run_resume', { chapter: c.chapter, hard: c.hard, wave: Math.max(1, left.state.wave) }); void this.play(c.chapter, left); }, giveUp }, this.lobbyArt.ready().then(() => menuBackdrop(this.app.renderer, this.art.lobby)), this.device === 'desktop'));
  }

  /** Starts a run of `chapter` (or goes on with `left`; `from` the results' Play again or Next chapter) once its art is in (a later chapter's pack or a monk's rig may need fetching). */
  private play(chapter: number, left?: SavedRun, from: 'again' | 'next' | null = null, c: Challenge | null = null): Promise<void> {
    // the tap starts the perf event's ready time
    this.perf?.tapped();
    return this.withArt(chapter, left?.state.config.monk ?? (c?.loadout?.monk as MonkId | undefined) ?? this.scene.monk ?? this.save.monk, () => {
      // a run other than the one resumed after a fault starts with a clean slate
      if (!left) this.faultedRun = false;
      this.runs.start(chapter, left, from, c);
    });
  }

  /** Runs `then` once `chapter`'s art and `monk`'s rig are in; on a failure, the lobby (the next tap tries again). */
  private withArt(chapter: number, monk: MonkId, then: () => void): Promise<void> {
    if (this.loading) return Promise.resolve();
    this.loading = true;
    return loadRunArt(this.app.renderer, this.platform, this.scene, this.art, chapter, monk).then(() => {
      this.loading = false;
      then();
    }, (err: unknown) => {
      this.loading = false;
      console.error(err);
      this.showLobby();
    });
  }

  /** Watches a weekly's top run in the run view (ui/replayWatch.ts), with its sounds; Back goes to the lobby. */
  private watchReplay(v: ReplayView): void {
    void this.withArt(v.replay.config.chapter, v.replay.config.monk, () => {
      this.setScreen(new ReplayScreen(v, { back: () => this.showLobby(), game: (engine) => {
        const g = new Game(this.app, this.platform, this.art, { ...this.scene, autoplay: false, record: 0 }, this.stick, setupOf(engine.state.config), engine);
        if (this.quality) g.applyQuality(this.quality);
        g.onEvents = (events) => events.map((e) => eventCue(e, 0)).forEach((cue) => cue && this.sound.play(cue));
        this.app.stage.addChild(this.ui);
        return g;
      } }, this.art.icons));
      this.lobbyArt.free();
    });
  }

  /** A rewarded ad, counted when it paid (`at` says where it was offered), and the offer as taken or failed. */
  private async rewarded(at: OfferPlace): Promise<boolean> {
    const paid = await this.ads.rewarded();
    if (paid) this.net.track('ad', this.ads.adFree() ? { at, free: true } : { at });
    this.net.track('offer', { at, outcome: paid ? 'taken' : 'failed' });
    return paid;
  }

  /** A frame threw (here or anywhere in the ticker, qualityRuntime.ts): reported, then the run or the screen is put up afresh (ui/faultGuard.ts). Never throws. */
  fault(err: unknown): void {
    const { report, act } = this.faults.fault();
    if (report) {
      console.error(err);
      try {
        this.onFault(err);
      } catch {
        /* the report is best effort */
      }
    }
    if (act === 'wait') return;
    const reload = globalThis.location?.reload?.bind(globalThis.location);
    if (act === 'restart' && reload) return reload();
    try {
      this.recover();
    } catch (again) {
      // the next fault tries again, and restarts the page once recoveries stop helping
      console.error(again);
    }
  }

  /** A run goes to the resume offer (settled like a give-up when it faulted once already, or is never kept); anything else to a fresh lobby. */
  private recover(): void {
    if (this.runs.game) {
      const left = this.faultedRun ? null : this.runs.shelve();
      this.faultedRun = !!left;
      if (left) return this.offerResume(left);
      try {
        this.runs.end();
        return;
      } catch {
        this.runs.drop();
      }
    }
    this.faultedRun = false;
    this.showLobby();
  }

  private tick(): void {
    try {
      this.frame();
    } catch (err) {
      this.fault(err);
    }
  }

  private frame(): void {
    // frames only come while the game is on screen; a long stall (a breakpoint, a suspended tab) counts as one second
    this.shownMs += Math.min(this.app.ticker.deltaMS, 1000);
    const { width, height } = this.app.screen;
    const key = `${width}x${height}`;
    if (this.screen && key !== this.screenKey) {
      this.screenKey = key;
      const insets = this.platform.safeInsets();
      if (this.bannerUp) insets.bottom += this.platform.banner.height;
      this.screen.layout(uiFrame(computeViewport(width, height, this.scene.record > 0), insets));
    }
    this.coverSideways(width, height, key);
    // only a run ticking on screen counts towards the next interstitial
    if (this.runs.playing) this.ads.played(this.app.ticker.deltaMS);
    if (this.runs.watch) this.runs.watch.update(this.app.ticker.deltaMS / 1000);
    else this.screen?.update?.(this.app.ticker.deltaMS / 1000);
    // the run has the battle music (the boss's on the mid-boss and boss waves, through to the results), every screen around it the lobby's
    const s = this.runs.game?.engine.state;
    this.sound.flush(s ? (s.config.waves > 0 && isBossWave(s.wave, s.config.waves) ? 'boss' : 'battle') : 'lobby', this.app.ticker.deltaMS, this.runs.game?.downCamBusy() ? 0.25 : 1);
  }

  /** Covers the game while the phone is on its side; a fight behind it waits on the pause panel. */
  private coverSideways(width: number, height: number, key: string): void {
    if (!wantsUpright(width, height, this.touchOnly)) {
      this.upright?.view.destroy({ children: true });
      this.upright = null;
      return;
    }
    if (!this.upright) this.runs.hidden();
    if (this.upright?.key !== key) {
      this.upright?.view.destroy({ children: true });
      this.upright = { view: uprightCover(uiFrame(computeViewport(width, height), this.platform.safeInsets())), key };
    }
    // over the run, the HUD and any toast added after it
    if (this.app.stage.children[this.app.stage.children.length - 1] !== this.upright.view) this.app.stage.addChild(this.upright.view);
  }
}
