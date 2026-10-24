import { Container } from 'pixi.js';
import { t } from '../i18n';
import type { PrivacyUi } from '../net/privacyChoice';
import type { AdPrivacy } from '../platform/types';
import { COLORS, backdrop, button, label, panel, playTap } from './widgets';

// Settings' second panel, "Account & data", opened from the main one (settingsPanel.ts): play
// data sharing on or off beside the privacy policy (and the ad network's privacy options where
// they are due, iOS in the EEA/UK), the leaderboards on or off (apart from sharing), what is sent, and the install's play ID, which copies itself
// when tapped (players quote it in a problem report). The cloud save has no rows: it syncs by
// itself (docs/cloud-save.md).

export interface AccountActions {
  /** Where the game talks to its backend, the player's privacy answer; null offline. */
  privacy: PrivacyUi | null;
  adPrivacy: AdPrivacy;
  /** Copies the play ID when it is tapped; unset where there is no clipboard. */
  copyId?: (id: string) => Promise<boolean>;
}

/** Whether the panel has anything to show (the main panel leaves its button out otherwise). */
export function accountOffered(a: AccountActions): boolean {
  return !!a.privacy || a.adPrivacy.offered();
}

const W = 860;
const ROW = 760;

export function accountPanel(w: number, h: number, a: AccountActions, back: () => void): Container {
  const view = new Container();
  view.addChild(backdrop(w, h));
  const box = new Container();
  box.position.set(w / 2, h / 2);
  let y = 30;
  const add = (c: Container, step: number) => {
    c.y = y + step / 2;
    box.addChild(c);
    y += step;
  };
  add(label(t('settings.account'), 64), 110);

  const p = a.privacy;
  const row = new Container();
  const n = (p ? 2 : 0) + (a.adPrivacy.offered() ? 1 : 0);
  const bw = (ROW - 24 * (n - 1)) / n;
  if (p) {
    const on = p.sharing();
    row.addChild(button(on ? t('settings.shareOn') : t('settings.shareOff'), bw, 110, () => p.set(!on), {
      fill: on ? COLORS.saffron : COLORS.panelLocked,
      textFill: on ? COLORS.outline : COLORS.text,
      size: 48,
    }));
    row.addChild(button(t('settings.policy'), bw, 110, () => p.openPolicy(), { fill: COLORS.panelLocked, size: 48 }));
  }
  if (a.adPrivacy.offered()) row.addChild(button(t('settings.adPrivacy'), bw, 110, () => a.adPrivacy.open(), { fill: COLORS.panelLocked, size: 48 }));
  row.children.forEach((b, i) => (b.x = (i - (n - 1) / 2) * (bw + 24)));
  add(row, 140);
  if (p) {
    const on = p.boards();
    add(button(on ? t('settings.boardsOn') : t('settings.boardsOff'), ROW, 110, () => p.setBoards(!on), {
      fill: on ? COLORS.saffron : COLORS.panelLocked,
      textFill: on ? COLORS.outline : COLORS.text,
      size: 48,
    }), 140);
  }

  const style = { wordWrap: true, wordWrapWidth: W - 100, breakWords: true };
  if (p) {
    const notice = label(t('settings.dataNotice'), 48, COLORS.dim, style);
    add(notice, notice.height + 30);
    const id = p.id();
    if (id) {
      const line = label(t('settings.playId', { id }), 48, a.copyId ? COLORS.text : COLORS.dim, style);
      if (a.copyId) {
        const copy = a.copyId;
        line.eventMode = 'static';
        line.cursor = 'pointer';
        line.on('pointertap', () => {
          playTap();
          void copy(id);
        });
      }
      add(line, line.height + 30);
    }
  }

  y += 30;
  add(button(t('common.back'), 400, 110, back, { fill: COLORS.panelLocked }), 110);
  const boxH = y + 50;
  box.children.forEach((c) => (c.y -= boxH / 2));
  box.addChildAt(panel(W, boxH), 0);
  box.scale.set(Math.min(1, (h - 40) / boxH));
  view.addChild(box);
  return view;
}
