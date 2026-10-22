import type { Application } from 'pixi.js';
import { SUTRA_IDS, TICK_RATE, type SimState } from '@hk/engine';
import { Game, type Art } from '../game/Game';
import type { DragStick } from '../game/dragStick';
import type { LevelSettings } from '../game/quality';
import { rankedRun, type SceneOptions } from '../game/scene';
import { setupOf } from '../game/runSetup';
import { eventCue } from '../game/soundCues';
import { chapterLook } from '../chapterArt';
import { BALANCE } from '../meta/balance';
import { challengeSetup } from '../meta/challenge';
import { evolvedIn } from '../meta/codex';
import { noteFall, runPast } from '../meta/falls';
import { loadout } from '../meta/loadout';
import { doubleCopper, earnedSutras, settleRun, type Reward, type Tab } from '../meta/progress';
import { dropRun, keepRun, type SavedRun } from '../meta/resume';
import type { SaveData } from '../meta/save';
import { lobbyWaiting, lossStep, waitingCount } from '../meta/waiting';
import { afterRun } from '../meta/welcome';
import { loadSettings, updateSettings } from '../meta/settings';
import type { Platform, Portal } from '../platform/types';
import type { PacedAds } from '../platform/adPacing';
import type { Sound } from '../audio/Sound';
import type { Backend, RunRank, RunResult } from '../net/backend';
import { runBuild } from '../net/leaveProps';
import type { PerfReport } from '../net/perfReport';
import type { RunReplays } from '../net/runReplays';
import type { Challenge, Device, ReplayWire } from '@hk/protocol';
import { menuBackdrop } from './lobbyBars';
import type { ChallengeFlow } from './challengeFlow';
import { ChallengeResultsScreen } from './ChallengeResultsScreen';
import { ResultsScreen } from './ResultsScreen';
import { RunHud } from './RunHud';
import { keepLanguage } from './settingsPanel';
import { canReport, reportProblem } from './problemReport';
import type { PlayerName } from './playerName';
import type { DownInfo } from './deathInfo';
import { RunWatch } from './runWatch';
import type { Screen } from './uiLayout';

// A run's life (docs/design.md "Flow"), the shell's other half: the run started from the lobby, a
// resumed one or a challenge's, its HUD and RunWatch, the pause, the revives, its end, the payout
// and the results, whose way out is the lobby, the same chapter again or the next one. The shell
// (Shell.ts) owns the screens and the lobby; it hands this what a run needs through RunHost.

/** What a run needs from the shell. */
export interface RunHost {
  readonly app: Application;
  readonly platform: Platform;
  readonly art: Art;
  readonly scene: SceneOptions;
  readonly stick: DragStick;
  readonly net: Backend;
  readonly device: Device;
  readonly sound: Sound;
  readonly ads: PacedAds;
  readonly portal: Portal;
  readonly names: PlayerName;
  readonly challenge: ChallengeFlow;
  readonly replays: RunReplays;
  save(): SaveData;
  commit(save: SaveData): void;
  setScreen(screen: Screen | null): void;
  /** The lobby, opened on `tab` (the results' next step). */
  showLobby(tab?: Tab | null): void;
  /** A run of `chapter`, once its art is in. */
  play(chapter: number, left?: SavedRun, from?: 'again' | 'next' | null): void;
  rewarded(at: string): Promise<boolean>;
  quality(): LevelSettings | null;
  perf(): PerfReport | null;
  /** The lobby's art goes until the next lobby asks for it again. */
  freeLobbyArt(): void;
  /** Puts the screens back above a run just added to the stage. */
  raiseUi(): void;
}

export class RunFlow {
  game: Game | null = null;
  private hud: RunHud | null = null;
  watch: RunWatch | null = null;
  chapter = 1;
  private hard = false; // the run in play is hard mode
  /** Free revives (training) left in this run; they come before the rewarded-ad one. */
  private freeRevives = 0;
  kills = 0; // enemies defeated in this run, for the daily tasks

  constructor(private readonly host: RunHost) {}

  /** The host went to the background: a fight waits on the pause panel, and is kept in case the game is closed for good. */
  hidden(): void {
    this.hud?.pauseForHost();
    this.keep();
  }

  /** `c`: a run of that daily challenge (its own setup, no revives, never kept for the next launch). */
  start(chapter: number, left?: SavedRun, from: 'again' | 'next' | null = null, c: Challenge | null = null): void {
    const h = this.host;
    const save = h.save();
    c = h.challenge.begin(left ? null : c);
    this.chapter = chapter;
    this.hard = left ? left.state.config.hard : !c && (h.scene.hard || save.hard);
    h.setScreen(null);
    // no run draws the lobby
    h.freeLobbyArt();
    const { bonus, freeRevives } = loadout(save, chapter, this.hard);
    this.freeRevives = left ? left.freeRevives : c ? 0 : freeRevives;
    const game = (this.game = new Game(h.app, h.platform, h.art, h.scene, h.stick, left ? setupOf(left.state.config) : c ? challengeSetup(save, c) : {
      chapter,
      waves: h.scene.waves ? BALANCE.waves : 0,
      revives: BALANCE.revives + freeRevives,
      relic: h.scene.relic ?? save.relic,
      sutras: h.scene.sutras ? SUTRA_IDS : earnedSutras(save),
      bonus: h.scene.bare ? {} : bonus,
      hard: this.hard,
      monk: h.scene.monk ?? save.monk, firstRun: !save.firstRunDone && h.scene.waves,
    }, left?.state));
    h.replays.begin(game, rankedRun(h.scene) && !h.scene.record);
    this.kills = left?.kills ?? 0;
    h.perf()?.start(rankedRun(h.scene) && !h.scene.record);
    const quality = h.quality();
    if (quality) game.applyQuality(quality);
    game.shake.on = loadSettings(h.platform.storage).shake;
    game.onEvents = (events) => {
      this.watch?.see(events);
      for (const e of events) {
        if (e.type === 'mobDown') this.kills++;
        const cue = eventCue(e, 0);
        if (cue) h.sound.play(cue);
      }
    };
    game.onHeartbeat = () => h.sound.play('heartbeat');
    const hud = (this.hud = new RunHud(game.engine.state.config.waves || BALANCE.waves, this.hard, {
      pause: () => this.setPaused(true),
      resume: () => this.setPaused(false),
      setFast: (fast) => {
        if (this.game) this.game.speed = fast ? 2 : 1;
        updateSettings(h.platform.storage, { fast });
      },
      giveUp: () => this.end(),
      revive: () => this.revive(),
      pick: (index) => this.game?.pick(index),
      setLanguage: (locale) => keepLanguage(h.platform.storage, locale),
      report: canReport(h.net, import.meta.env.DEV) ? () => reportProblem(h.platform, h.net, () => this.game, h.scene) : null,
    }, h.art.icons, h.device === 'desktop', () => h.platform.keysReach?.() ?? true));
    // the run adds itself to the stage; keep the UI above it
    h.raiseUi();
    h.setScreen(hud);
    // the first run teaches moving; a replayed first chapter, a resumed run or a dev bot's does not
    const teach = !save.firstRunDone && h.scene.waves && !left && !h.scene.autoplay && !h.scene.record;
    this.watch = new RunWatch(game, hud, {
      chapter, novice: save.runs < BALANCE.novice.runs, portal: h.portal, ads: h.ads, net: h.net, past: runPast(save, chapter, this.hard),
      freeRevives: () => this.freeRevives,
      kills: () => this.kills, keepRun: () => this.keep(), end: () => this.end(), cheer: () => h.sound.play('cleared'),
    }, !!teach);
    // the fast-forward choice carries over from the last run
    hud.setFast(loadSettings(h.platform.storage).fast);
    h.portal.gameplayStart();
    // a resumed fight waits on the pause panel until the player looks (a card choice or the death panel holds it anyway)
    const s = game.engine.state;
    if (!left) h.net.track('run_start', { chapter, hard: this.hard, monk: c?.loadout?.monk ?? h.scene.monk ?? save.monk, relic: c?.loadout?.relic ?? h.scene.relic ?? save.relic, ...(from && { [from]: true }), ...(c && { challenge: c.id }) });
    else if (s.outcome === 'playing' && s.players[0].offer.length === 0) hud.pauseForHost();
  }

  /** Keeps the run in play for the next launch (meta/resume.ts); not the sandbox or a dev bot's run. */
  private keep(): void {
    const s = this.game?.engine.state;
    const { scene, platform, challenge } = this.host;
    if (!s || s.config.waves === 0 || scene.autoplay || scene.record || challenge.run) return;
    keepRun(platform.storage, { state: s, freeRevives: this.freeRevives, kills: this.kills });
  }

  /** The run is ticking: not paused (by the player or a held panel's pause). */
  get playing(): boolean {
    return !!this.game && !this.game.paused;
  }

  private setPaused(paused: boolean): void {
    if (!this.game) return;
    this.game.paused = paused;
    this.host.portal[paused ? 'gameplayStop' : 'gameplayStart']();
  }

  private async revive(): Promise<boolean> {
    if (this.freeRevives > 0 && this.game) {
      this.freeRevives--;
      this.game.revive();
      return true;
    }
    const paid = await this.host.rewarded('revive');
    if (!paid || !this.game) return false;
    // the engine stands the hero up on its next tick; watchRun then resumes the portal
    this.game.revive();
    return true;
  }

  private end(): void {
    if (!this.game) return;
    const s = this.game.engine.state;
    const replay = this.host.challenge.capture(this.game);
    void this.host.replays.end();
    this.game.destroy();
    this.game = null;
    this.hud = null;
    // the death panel already told the portal
    if (!this.watch?.downShown) this.host.portal.gameplayStop();
    const fall = this.watch?.fall ?? null;
    this.watch = null;
    this.settle(s, fall, replay);
  }

  /** The last run, left unfinished, given up from the resume screen: settled like a give-up in the run. */
  giveUp(left: SavedRun): void {
    const c = left.state.config;
    [this.chapter, this.hard, this.kills] = [c.chapter, c.hard, left.kills];
    this.settle(left.state);
  }

  // Pays out the run that ended in `s` (`waves` fully cleared), tells the backend, enters it on its board when no dev switch
  // bent the rules, with its replay for the server to check (the results show the rank once it comes), and shows the results, with what felled the hero (`fall`).
  private settle(s: SimState, fall: DownInfo | null = null, replay: ReplayWire | null = null): void {
    const h = this.host;
    const cause = fall?.cause;
    dropRun(h.platform.storage);
    const waves = s.outcome === 'won' ? s.config.waves : Math.max(0, s.wave - 1);
    const p = s.players[0];
    const run = {
      chapter: this.chapter, hard: this.hard, won: s.outcome === 'won', wave: Math.max(1, s.wave), tenths: Math.round((s.tick * 10) / TICK_RATE),
      level: p.level, kills: this.kills, monk: p.monk, relic: p.relicId,
    };
    h.perf()?.end();
    h.net.track('run_end', { ...run, ...runBuild(s, this.kills), gaveUp: s.outcome === 'playing', ...(s.outcome === 'lost' && cause ? { cause } : {}), ...(h.challenge.run && { challenge: h.challenge.run.id }) });
    const name = rankedRun(h.scene) ? h.names.board(h.save()) : null;
    const rank = name && !h.challenge.run ? h.net.submitRun({ ...run, ...name }, replay) : Promise.resolve(null);
    void h.net.flush();
    if (h.challenge.run) return this.settleChallenge(s, { ...run, ...name }, waves, !!name);
    const { reward, save: played } = settleRun(noteFall(h.save(), this.chapter, this.hard, s), { chapter: this.chapter, hard: this.hard, waves, offerings: p.offerings, evolved: evolvedIn(p), kills: this.kills, revived: p.revives < s.config.revives, lowest: p.lowest });
    const { save, gift } = afterRun(played, Date.now(), waves, this.kills);
    // paid before the results show, so closing the tab now keeps the reward
    h.commit(save);
    if (gift) h.net.track('claim', { what: 'gift', n: 0, copper: gift.copper, jade: gift.jade, drops: gift.drops.length });
    if (reward.firstClear) h.portal.celebrate();
    this.showResults({ ...reward, gift }, waves, rank, s.outcome === 'lost' ? fall : null);
  }

  /** A challenge run's end: its milestones paid (the day's first run only), sent with its replay, and its own results. */
  private settleChallenge(s: SimState, run: RunResult, waves: number, ranked: boolean): void {
    const h = this.host;
    const done = h.challenge.settle(h.save(), s, run, waves, this.kills, ranked);
    h.commit(afterRun(done.save, Date.now(), waves, this.kills).save);
    if (done.reward.streak) h.net.track('claim', { what: 'streak', n: done.reward.streak, jade: done.reward.streakJade });
    h.setScreen(new ChallengeResultsScreen(done, {
      double: async () => {
        const paid = await h.rewarded('double');
        if (paid) h.commit({ ...h.save(), copper: h.save().copper + done.reward.copper });
        return paid;
      },
      next: () => void h.ads.midgame().then(() => h.showLobby()),
    }, h.ads.rewardedAvailable(), h.art.icons, h.device === 'desktop', menuBackdrop(h.app.renderer, h.art.lobby)));
  }

  private showResults(reward: Reward, waves: number, rank: Promise<RunRank | null>, fall: DownInfo | null): void {
    const h = this.host;
    let leaving = false;
    // the interstitial sits on the break after the results (adPacing.ts: at most one every few minutes of play), never
    // inside a run, never after the first run (the tutorial) and never on Play again, which keeps the player playing
    const leave = (then: () => void, ad = true) => {
      if (leaving) return;
      leaving = true;
      void (ad && h.save().runs > 1 ? h.ads.midgame() : Promise.resolve()).then(then);
    };
    // a lost run's way back is the same chapter again (not the tutorial: firstRunDone is set), a first clear's the chapter it opened
    const save = h.save();
    const opened = reward.firstClear && (save.chapter !== this.chapter || save.hard !== this.hard);
    h.setScreen(new ResultsScreen(reward, waves, {
      double: async () => {
        const paid = await h.rewarded('double');
        if (paid) h.commit(doubleCopper(h.save(), reward));
        return paid;
      },
      next: (tab) => leave(() => h.showLobby(tab)),
      again: !reward.firstClear ? () => leave(() => h.play(this.chapter, undefined, 'again'), false) : opened ? () => leave(() => h.play(h.save().chapter, undefined, 'next')) : null,
      waiting: () => waitingCount(lobbyWaiting(h.save(), Date.now())), step: () => (fall ? lossStep(h.save()) : null),
      // the opened chapter's art, loaded now for its preview and the run Next chapter starts
      preview: opened ? chapterLook(h.platform, h.scene, h.art, save.chapter).catch(() => null) : undefined,
    }, h.ads.rewardedAvailable(), rank, fall, h.art.icons, h.device === 'desktop', menuBackdrop(h.app.renderer, h.art.lobby)));
  }
}
