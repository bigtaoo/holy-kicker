import { Container, Sprite, Texture, type Text } from 'pixi.js';
import { t } from '../i18n';
import { BuildBar, type IconSheet } from './buildBar';
import { buildKey, type BuildSlot } from './buildSlots';
import { cardPanel } from './cardPanel';
import type { CardText } from './cardText';
import type { Screen, UiFrame } from './uiLayout';
import { COLORS, backdrop, button, fit, label, panel } from './widgets';

// The in-run overlay: the experience bar and level, the build strip, the wave counter, a pause button and the
// pause panel, a banner when a wave starts, the level-up cards, and the death panel (revive
// free from training or with an ad, or give up).

export interface RunActions {
  pause(): void;
  resume(): void;
  giveUp(): void;
  /** Revives, free or after the rewarded ad; resolves whether it did. */
  revive(): Promise<boolean>;
  /** Takes card `index` of the level-up offer. */
  pick(index: number): void;
}

/** Death panel: no revive to offer, a free one (training), the ad offered, or the ad playing. */
type Down = 'none' | 'free' | 'offered' | 'playing';
export type ReviveOffer = 'none' | 'free' | 'ad';

/** Seconds a wave banner stays, the last of them fading. */
const BANNER_TIME = 2;
const BANNER_FADE = 0.5;
const XP_H = 30;
const XP_Y = 52;
const BUILD_Y = 150;

export class RunHud implements Screen {
  readonly view = new Container();
  private frame: UiFrame | null = null;
  private waveText: Text | null = null;
  private bannerView: Container | null = null;
  private wave = 0;
  private paused = false;
  private down: Down | null = null;
  private banner: { lines: [string, number][]; t: number } | null = null;
  /** Rebuilt with every layout, like the rest of the HUD. */
  private xpView: Container | null = null;
  private xpFill: Sprite | null = null;
  private xpWidth = 0;
  private levelText: Text | null = null;
  private xp = { level: 1, share: 0 };
  /** The open level-up cards, and whether one was tapped (waiting for the engine). */
  private offer: CardText[] | null = null;
  private offerTitle = '';
  private picked = false;
  private build: BuildBar | null = null;
  private slots: readonly BuildSlot[] = [];
  private slotsKey = '';

  constructor(
    private readonly total: number,
    private readonly actions: RunActions,
    private readonly icons: IconSheet,
  ) {}

  layout(f: UiFrame): void {
    this.frame = f;
    this.view.removeChildren().forEach((c) => c.destroy({ children: true }));
    this.view.position.set(f.x, f.y);
    this.view.scale.set(f.scale);
    // below the boss health bar, which spans the top
    const wave = label('', 52, COLORS.text, { stroke: { color: COLORS.outline, width: 8 } });
    wave.anchor.set(0, 0.5);
    wave.position.set(40, 300);
    this.waveText = wave;
    this.view.addChild(wave);
    this.xpBar(f);
    const build = (this.build = new BuildBar(this.icons));
    build.view.position.set(f.w / 2, BUILD_Y);
    build.draw(this.slots);
    this.view.addChild(build.view);
    this.setWave(this.wave);
    if (!this.down && !this.offer) {
      const pause = button('II', 120, 120, () => this.setPaused(true), { fill: COLORS.panel, size: 52 });
      pause.position.set(f.w - 90, 300);
      this.view.addChild(pause);
    }
    this.bannerView = null;
    // a panel covers the middle, so a banner then waits out its time unseen
    if (this.banner && !this.paused && !this.down && !this.offer) this.drawBanner(f);
    if (this.offer) this.view.addChild(cardPanel(f, this.offerTitle, this.offer, this.icons, (i) => this.pickCard(i)));
    if (this.paused) this.pausePanel(f);
    if (this.down) this.downPanel(f, this.down);
  }

  /** Wave 0 is the sandbox, which has no counter and no levels. */
  setWave(wave: number): void {
    this.wave = wave;
    if (!this.waveText) return;
    this.waveText.visible = wave > 0;
    this.waveText.text = t('run.wave', { wave, total: this.total });
    if (this.xpView) this.xpView.visible = wave > 0;
    if (this.build) this.build.view.visible = wave > 0;
  }

  /** The hero's build; the strip is redrawn only when it looks different. */
  setBuild(slots: readonly BuildSlot[]): void {
    const key = buildKey(slots);
    if (key === this.slotsKey) return;
    this.slotsKey = key;
    this.slots = slots;
    this.build?.draw(slots);
  }

  /** The level and how far the experience is toward the next one, 0..1. */
  setXp(level: number, share: number): void {
    this.xp = { level, share: Math.max(0, Math.min(1, share)) };
    if (this.xpFill) this.xpFill.width = this.xpWidth * this.xp.share;
    if (this.levelText && this.levelText.text !== t('run.level', { level })) this.levelText.text = t('run.level', { level });
  }

  /** The level-up or shrine cards under `title`; they stay until hideOffer. */
  showOffer(title: string, cards: CardText[]): void {
    this.offer = cards;
    this.offerTitle = title;
    this.picked = false;
    this.paused = false;
    this.relayout();
  }

  hideOffer(): void {
    this.offer = null;
    this.relayout();
  }

  /** A banner across the middle: the wave number and, for elite and boss waves, a warning. */
  announce(wave: number, warning: string | null): void {
    const lines: [string, number][] = [[t('run.waveStart', { wave }), 96]];
    if (warning) lines.push([warning, 64]);
    this.banner = { lines, t: BANNER_TIME };
    this.relayout();
  }

  /** The hero went down: offers a free revive, the rewarded ad or nothing. */
  showDown(offer: ReviveOffer): void {
    this.down = offer === 'free' ? 'free' : offer === 'ad' ? 'offered' : 'none';
    this.paused = false;
    this.relayout();
  }

  hideDown(): void {
    this.down = null;
    this.relayout();
  }

  update(dt: number): void {
    this.build?.update(dt);
    // a banner waits out the card choice
    if (!this.banner || this.offer) return;
    this.banner.t -= dt;
    if (this.banner.t <= 0) {
      this.banner = null;
      this.bannerView?.destroy({ children: true });
      this.bannerView = null;
    } else if (this.bannerView) {
      this.bannerView.alpha = Math.min(1, this.banner.t / BANNER_FADE);
    }
  }

  destroy(): void {
    this.view.destroy({ children: true });
  }

  private relayout(): void {
    if (this.frame && !this.view.destroyed) this.layout(this.frame);
  }

  private setPaused(paused: boolean): void {
    this.paused = paused;
    if (paused) this.actions.pause();
    else this.actions.resume();
    this.relayout();
  }

  private xpBar(f: UiFrame): void {
    const bar = (this.xpView = new Container());
    const fill = (this.xpFill = new Sprite(Texture.WHITE));
    const x = 40;
    const w = (this.xpWidth = f.w - 260);
    const back = new Sprite(Texture.WHITE);
    back.tint = COLORS.outline;
    back.width = w + 12;
    back.height = XP_H + 12;
    back.position.set(x - 6, XP_Y - XP_H / 2 - 6);
    fill.tint = 0x7fd8ff;
    fill.height = XP_H;
    fill.position.set(x, XP_Y - XP_H / 2);
    const level = label('', 52, COLORS.text, { stroke: { color: COLORS.outline, width: 8 } });
    level.anchor.set(1, 0.5);
    level.position.set(f.w - 40, XP_Y);
    this.levelText = level;
    bar.addChild(back, fill, level);
    this.view.addChild(bar);
    this.setXp(this.xp.level, this.xp.share);
  }

  private pickCard(index: number): void {
    if (this.picked) return;
    this.picked = true;
    this.actions.pick(index);
  }

  private drawBanner(f: UiFrame): void {
    const box = new Container();
    box.position.set(f.w / 2, f.h * 0.36);
    let y = 0;
    for (const [text, size] of this.banner!.lines) {
      const l = fit(label(text, size, size > 80 ? COLORS.text : COLORS.saffron, { stroke: { color: COLORS.outline, width: 10 } }), f.w - 80);
      l.y = y;
      box.addChild(l);
      y += size + 24;
    }
    box.eventMode = 'none';
    this.bannerView = box;
    this.view.addChild(box);
  }

  private pausePanel(f: UiFrame): void {
    this.view.addChild(backdrop(f.w, f.h));
    const box = new Container();
    box.position.set(f.w / 2, f.h / 2);
    const title = label(t('run.paused'), 72);
    title.y = -200;
    const resume = button(t('run.resume'), 560, 150, () => this.setPaused(false));
    const giveUp = button(t('run.giveUp'), 560, 130, () => this.actions.giveUp(), { fill: COLORS.panelLocked });
    giveUp.y = 190;
    box.addChild(panel(760, 640), title, resume, giveUp);
    this.view.addChild(box);
  }

  private downPanel(f: UiFrame, down: Down): void {
    this.view.addChild(backdrop(f.w, f.h));
    const box = new Container();
    box.position.set(f.w / 2, f.h / 2);
    const title = label(t('run.down'), 80, COLORS.text);
    title.y = down === 'none' ? -110 : -200;
    box.addChild(panel(800, down === 'none' ? 440 : 640), title);
    const giveUp = button(t('run.giveUp'), 560, 130, () => this.actions.giveUp(), { fill: COLORS.panelLocked });
    giveUp.y = down === 'none' ? 70 : 190;
    if (down !== 'none') {
      const playing = down === 'playing';
      const free = down === 'free';
      const revive = button(playing ? '…' : free ? t('run.reviveFree') : t('run.revive'), 640, 160, () => void this.playRevive(), {
        fill: playing ? COLORS.panelLocked : free ? COLORS.saffron : COLORS.jade,
        textFill: COLORS.outline,
      });
      if (playing) revive.eventMode = giveUp.eventMode = 'none';
      box.addChild(revive);
    }
    box.addChild(giveUp);
    this.view.addChild(box);
  }

  private async playRevive(): Promise<void> {
    if (this.down !== 'offered' && this.down !== 'free') return;
    const was = this.down;
    this.down = 'playing';
    this.relayout();
    const paid = await this.actions.revive();
    if (this.view.destroyed) return;
    // a skipped or unfilled ad keeps the offer; a paid one closes the panel
    if (paid) this.down = null;
    else this.down = was;
    this.relayout();
  }
}
