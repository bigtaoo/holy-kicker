import { Container, Graphics } from 'pixi.js';
import { t } from '../i18n';
import type { Reward } from '../meta/progress';
import { sutraName } from './cardText';
import { dropLines } from './gearText';
import type { Screen, UiFrame } from './uiLayout';
import { COLORS, button, fit, label, panel } from './widgets';

// Results after a run: what it paid and dropped (already in the save), the rewarded "double copper"
// offer when an ad can be shown, and Continue back to the lobby.

export interface ResultsActions {
  /** Plays the rewarded ad and pays the bonus; resolves whether it was paid. */
  double(): Promise<boolean>;
  next(): void;
}

type Offer = 'hidden' | 'offered' | 'playing' | 'paid';

export class ResultsScreen implements Screen {
  readonly view = new Container();
  private frame: UiFrame | null = null;
  private offer: Offer = 'hidden';

  constructor(
    private readonly reward: Reward,
    private readonly waves: number,
    private readonly actions: ResultsActions,
    adAvailable: Promise<boolean>,
  ) {
    // copper 0 has nothing to double
    void adAvailable.then((ok) => {
      if (ok && reward.copper > 0 && this.offer === 'hidden' && !this.view.destroyed) {
        this.offer = 'offered';
        this.relayout();
      }
    });
  }

  layout(f: UiFrame): void {
    this.frame = f;
    this.view.removeChildren().forEach((c) => c.destroy({ children: true }));
    this.view.position.set(f.x, f.y);
    this.view.scale.set(f.scale);
    this.view.addChild(new Graphics().rect(0, -f.h, f.w, 3 * f.h).fill({ color: COLORS.bg, alpha: 0.92 }));

    const r = this.reward;
    const lines: [string, number, number][] = [
      [r.firstClear ? t(r.hard ? 'results.hardCleared' : 'results.cleared') : t('results.fallen'), 80, r.firstClear ? COLORS.saffron : COLORS.text],
      [t('results.reached', { wave: this.waves }), 52, COLORS.text],
    ];
    if (r.newBest) lines.push([t('results.newBest'), 48, COLORS.saffron]);
    if (r.grit > 0) lines.push([t('results.grit', { n: r.grit }), 48, COLORS.saffron]);
    if (r.hardUnlocked) lines.push([t('results.hardUnlocked'), 48, COLORS.danger]);
    if (r.newRelic) lines.push([t('results.newRelic', { name: t(`relic.${r.newRelic}.name`) }), 52, COLORS.saffron]);
    for (const id of r.newCodex) lines.push([t('results.newCodex', { name: t(`evolve.${id}.name`) }), 48, COLORS.saffron]);
    for (const id of r.newSutras) lines.push([t('results.newSutra', { name: sutraName(id) }), 48, COLORS.saffron]);
    lines.push([t('results.copper', { n: r.copper }), 56, COLORS.copper]);
    if (r.offering > 0) lines.push([t('results.offering', { n: r.offering }), 44, COLORS.copper]);
    for (const c of r.chests) lines.push([t('results.chest', { wave: c.wave, copper: c.copper, jade: c.jade }), 44, COLORS.jade]);
    if (r.drops.length > 0) {
      lines.push([t('results.drops'), 48, COLORS.dim]);
      for (const [text, color] of dropLines(r.drops)) lines.push([text, 48, color]);
    }
    if (this.offer === 'paid') lines.push([t('results.doubled'), 48, COLORS.saffron]);
    // the card grows with its lines; the buttons sit a fixed distance below it
    const cardH = lines.reduce((n, [, size]) => n + size + 44, 0) + 120;
    const card = new Container();
    card.position.set(f.w / 2, f.h / 2 - 200);
    card.addChild(panel(920, cardH));
    let y = -cardH / 2 + 60;
    for (const [text, size, fill] of lines) {
      const l = fit(label(text, size, fill), 840);
      l.y = y + size / 2;
      card.addChild(l);
      y += size + 44;
    }
    this.view.addChild(card);

    let by = card.y + cardH / 2 + 150;
    if (this.offer === 'offered' || this.offer === 'playing') {
      const playing = this.offer === 'playing';
      // the same size, font and colour as Continue (CrazyGames' rewarded-ad rules)
      const ad = button(playing ? '…' : t('results.double'), 640, 150, () => void this.playAd(), {
        fill: playing ? COLORS.panelLocked : COLORS.saffron,
        video: !playing,
      });
      ad.position.set(f.w / 2, by);
      if (playing) ad.eventMode = 'none';
      this.view.addChild(ad);
      by += 190;
    }
    const next = button(t('common.continue'), 640, 150, () => this.actions.next());
    next.position.set(f.w / 2, by);
    if (this.offer === 'playing') next.eventMode = 'none';
    this.view.addChild(next);
  }

  destroy(): void {
    this.view.destroy({ children: true });
  }

  private relayout(): void {
    if (this.frame && !this.view.destroyed) this.layout(this.frame);
  }

  private async playAd(): Promise<void> {
    if (this.offer !== 'offered') return;
    this.offer = 'playing';
    this.relayout();
    const paid = await this.actions.double();
    // a skipped or unfilled ad keeps the offer, so the player can try once more
    this.offer = paid ? 'paid' : 'offered';
    this.relayout();
  }
}
