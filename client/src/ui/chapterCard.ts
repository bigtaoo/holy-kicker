import { Container } from 'pixi.js';
import { t } from '../i18n';
import { chapterName } from '../i18n/chapterName';
import { gritBonus } from '../meta/loadout';
import { hardOpenAt, isCleared, playableChapters, track } from '../meta/progress';
import type { SaveData } from '../meta/save';
import type { BoardUi } from './boardPanel';
import { lockIcon, type IconSheet } from './buildBar';
import { cardLinesLayout, CHESTS_TOP } from './chapterCardLayout';
import { chestRow } from './chestRow';
import { clearUnlocks, nextBlessing, starTotal } from '../meta/unlocks';
import { sutraName } from './cardText';
import { CARD, CARD_STROKE } from './playCard';
import { statLines } from './statText';
import { starRow } from './stars';
import { COLORS, button, fit, label, panel } from './widgets';

// The Play tab's chapter card (LobbyScreen.playTab): its name between the chapter arrows, its
// stars or how far it went, its five chests, and the normal / hard switch over it once a
// chapter is cleared (a chapter's hard mode opens with its three stars). Under the stars, a line
// or two: the grit on the first uncleared chapter, what clearing it unlocks, and on a cleared
// chapter still short of three stars the next star blessing (docs/unlocks.md).

export interface ChapterCardDeps {
  save: SaveData;
  icons: IconSheet;
  boards: BoardUi;
  selectChapter(chapter: number): void;
  chooseTrack(hard: boolean): void;
  progressChest(chapter: number, hard: boolean, index: number): void;
  toast(text: string): void;
}

/** Whether the card has the normal / hard switch over it (from the first clear on). */
export function hasTrackSwitch(save: SaveData): boolean {
  return save.cleared > 0;
}

/** Normal and hard side by side, the shown one lit; a hard mode still locked shows a lock and says how to open it. */
export function trackSwitch(d: ChapterCardDeps): Container {
  const row = new Container();
  const open = hardOpenAt(d.save, d.save.chapter);
  ([[false, 'lobby.normal'], [true, 'lobby.hard']] as const).forEach(([hard, key], i) => {
    const on = d.save.hard === hard;
    const locked = hard && !open;
    const b = button(t(key), 300, 90, () => {
      if (locked) d.toast(t('lobby.hardLocked'));
      else if (!on) d.chooseTrack(hard);
    }, { fill: on ? (hard ? COLORS.danger : COLORS.saffron) : COLORS.panelLocked, size: 52, textFill: on ? COLORS.text : COLORS.dim });
    b.x = (i - 0.5) * 320;
    if (locked) {
      const l = lockIcon(d.icons, 48);
      l.position.set(130, -30);
      b.addChild(l);
    }
    row.addChild(b);
  });
  return row;
}

/** The chapter card for chapter `n`, top at 0. */
export function chapterCard(d: ChapterCardDeps, n: number, open: boolean): Container {
  const { save } = d;
  const card = new Container();
  const hard = save.hard;
  const ranks = open ? d.boards.button(n, hard) : null;
  // a line fit() wrapped takes two rows: each line its own height, the chests under the last
  const lines = cardLines(save, n, open).map(([text, fill]) => fit(label(text, 48, fill), 840));
  const layout = cardLinesLayout(lines.map((l) => l.height), ranks !== null);
  const shift = layout.chests - CHESTS_TOP;
  const back = panel(900, 370 + shift, CARD.fill);
  back.y = (370 + shift) / 2;
  card.addChild(back);
  const progress = track(save, hard);
  const name = chapterName(n);
  // one line only: a second would cover the line under it, so a long name shrinks instead
  const title = fit(label(hard ? t('lobby.hardTitle', { n, name }) : t('lobby.chapterTitle', { n, name }), 64, hard ? COLORS.danger : COLORS.text, CARD_STROKE), 640, 100);
  title.y = 70;
  // a cleared chapter shows its stars; otherwise the wave the best run reached (the save keeps
  // waves cleared, the chests count those; the leaderboard and the HUD name the wave reached)
  const best = progress.best[n - 1] ?? 0;
  if (open && isCleared(save, n, hard)) {
    const stars = starRow(progress.stars[n - 1] ?? 1, 70, CARD.starOff);
    stars.y = 150;
    card.addChild(stars);
  } else {
    const status = label(
      !open ? t('lobby.unlockAtChapter', { n: n - 1 })
        : best > 0 ? t('lobby.best', { wave: best + 1 }) : t('lobby.notPlayed'),
      48, open ? CARD.quiet : COLORS.danger, open ? {} : CARD_STROKE,
    );
    status.y = 155;
    card.addChild(status);
  }
  if (ranks) {
    // under the › arrow, with a gap: it is a smaller button than the arrow (boardPanel.ts)
    ranks.position.set(340, 160);
    card.addChild(ranks);
  }
  const chests = chestRow(save, n, d.icons, (i) => d.progressChest(n, hard, i));
  chests.y = layout.chests;
  card.addChild(title, chests);
  lines.forEach((l, i) => {
    l.y = layout.ys[i];
    card.addChild(l);
  });
  // chapter arrows: through the cleared chapters and the first uncleared one; once there is more
  // than one, both stand, the one with nowhere to go faded, so the title stays centred between them
  const playable = playableChapters(save);
  const arrow = (dir: -1 | 1) => {
    const target = n + dir;
    if (playable < 2) return;
    const can = target >= 1 && target <= playable;
    const b = button(dir < 0 ? '‹' : '›', 90, 100, () => {
      if (can) d.selectChapter(target);
    }, { fill: COLORS.panelLocked, size: 80 });
    b.position.set(dir * 385, 70);
    if (!can) b.alpha = 0.3;
    card.addChild(b);
  };
  arrow(-1);
  arrow(1);
  return card;
}

/** The card's lines under the stars, each its text and colour. */
function cardLines(save: SaveData, n: number, open: boolean): [string, number][] {
  if (!open) return [];
  const out: [string, number][] = [];
  const grit = gritBonus(save, n);
  if (Object.keys(grit).length > 0) out.push([t('lobby.grit', { n: save.grit, attack: grit.attack ?? 0, hp: grit.maxHp ?? 0 }), CARD.accent]);
  if (save.hard) return out;
  if (n > save.cleared) {
    const names = clearUnlocks(n).flatMap((u) =>
      u.kind === 'relic' ? [t(`relic.${u.id}.name`)] : u.kind === 'sutra' ? [sutraName(u.id)] : u.kind === 'monk' ? [t(`monk.${u.id}.name`)] : []);
    if (names.length > 0) out.push([t('lobby.clearFor', { list: names.join(', ') }), CARD.accent]);
  } else if ((save.stars[n - 1] ?? 0) < 3) {
    const b = nextBlessing(save);
    if (b) out.push([t('lobby.nextBlessing', { have: starTotal(save), need: b.stars, stats: statLines({ [b.stat]: b.n }).join('') }), CARD.accent]);
  }
  return out;
}
