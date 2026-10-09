import type { PropValue } from '@hk/protocol';
import { Container } from 'pixi.js';
import { formatAmount, t, type Key } from '../i18n';
import { achievementsReady, claimAchievement, claimAllAchievements } from '../meta/achievements';
import { BALANCE } from '../meta/balance';
import { claimable, claimBonus, claimTask, tasksOpen } from '../meta/daily';
import type { Haul } from '../meta/haul';
import { collectPatrol, patrolHours, patrolOpen, quickPatrol, type QuickPay } from '../meta/patrol';
import type { SaveData } from '../meta/save';
import type { Store } from '../platform/types';
import { CHEST_KINDS, chestBlock, chestContents, chestsLeft, openChest, type ChestKind } from '../meta/shop';
import type { TasksView } from './achievePanel';
import { adFreeCard } from './adFreeCard';
import { iconSprite, lockIcon, type IconSheet } from './buildBar';
import { haulPanel, hoursText, patrolPanel, tasksPanel, type Live, type PatrolLook, type Tick } from './economyPanels';
import { COLORS, button, buttonLabel, dot, fit, label, panel } from './widgets';

// The lobby's economy (docs/design.md "Retention", "Ads and monetization"): the Shop tab's
// chests (and on iOS the ad-free card, adFreeCard.ts), the patrol and daily-task buttons under
// PLAY, and their panels. Holds what is open and whether an ad or a purchase is under way; the save
// changes themselves are pure (meta/shop.ts, meta/patrol.ts, meta/daily.ts) and go back to the
// lobby to store. Each one that went through is reported to analytics: a chest or a quick patrol
// as `buy`, anything paid out as `claim`, every ad-free buy or restore as `iap`.
//
// Rewarded offers are hidden, not shown disabled, when the host has no ad (CrazyGames' rule
// for adblocked players).

export interface EconomyHost {
  save(): SaveData;
  change(save: SaveData): void;
  relayout(): void;
  toast(text: string): void;
  /** Plays a rewarded ad; resolves whether it finished. */
  rewarded(): Promise<boolean>;
  /** The icon sheet, with the chests as chest_free, chest_ad and chest_jade. */
  icons: IconSheet;
  /** What the patrol panel's scene is drawn with. */
  patrolLook(): PatrolLook;
  /** The ad-free card's purchase; null on every host but iOS. */
  store: Store | null;
  track: LobbyTrack;
}

/** Reports a lobby purchase or payout to analytics (Backend.track). */
export type LobbyTrack = (e: 'buy' | 'claim' | 'iap', p: Record<string, PropValue>) => void;

type Modal = 'patrol' | 'tasks' | null;

/** What the player is told after an ad-free buy or restore (nothing after a cancel). */
const AD_FREE_TOASTS: Record<'buy' | 'restore', Record<string, Key>> = {
  buy: { owned: 'shop.bought', pending: 'shop.waiting', failed: 'shop.buyFailed' },
  restore: { owned: 'shop.restored', none: 'shop.nothingToRestore', failed: 'shop.storeOffline' },
};

const CARD_W = 1000;
const CARD_H = 290;
const CARD_GAP = 40;

/** Whether the Shop tab has something free waiting. */
export function shopWaiting(save: SaveData, now: number): boolean {
  return chestsLeft(save, now, 'free') === 1;
}

/** With `store`, the ad-free card under the chests. */
export function shopHeight(adOk: boolean, store: boolean): number {
  const n = (adOk ? CHEST_KINDS.length : CHEST_KINDS.length - 1) + (store ? 1 : 0);
  return n * CARD_H + (n - 1) * CARD_GAP;
}

export class EconomyUi {
  private modal: Modal = null;
  private haul: Haul | null = null;
  private adOk = false;
  private playing = false;
  /** An ad-free buy or restore is under way. */
  private buying = false;
  private live: Live[] = [];
  private ticks: Tick[] = [];
  private clock = 0;
  /** The tasks panel's page: today's tasks first, unless only an achievement waits. */
  private tasksView: TasksView = 'daily';
  private achievePage = 0;

  constructor(private readonly host: EconomyHost, adAvailable: Promise<boolean>, private readonly now: () => number = Date.now) {
    void adAvailable.then((ok) => {
      this.adOk = ok;
      if (ok) host.relayout();
    });
  }

  /** Called at the start of every lobby layout: the live numbers are rebuilt with it. */
  reset(): void {
    this.live = [];
    this.ticks = [];
  }

  update(dt: number): void {
    for (const f of this.ticks) f(dt);
    this.clock += dt;
    if (this.clock < 1) return;
    this.clock = 0;
    for (const f of this.live) f();
  }

  /** The Patrol and Tasks buttons under PLAY, centred on x = 0. */
  playRow(): Container {
    const row = new Container();
    const save = this.host.save();
    const open = patrolOpen(save);
    const patrol = button(' ', 460, 130, () => {
      if (!open) return this.host.toast(t('tab.unlockChapter', { n: BALANCE.unlocks.patrolChapter }));
      this.show('patrol');
    }, { fill: open ? COLORS.panel : COLORS.panelLocked, size: 46, icon: open ? iconSprite(this.host.icons, 'patrol', 84) : lockIcon(this.host.icons, 64) });
    patrol.x = -250;
    const text = buttonLabel(patrol);
    const full = dot(205, -50);
    const refresh = () => {
      const hours = patrolHours(this.host.save(), this.now());
      text.text = open ? `${t('patrol.title')} ${hours >= BALANCE.patrol.capHours ? t('patrol.full') : hoursText(hours)}` : t('patrol.title');
      fit(text, 320);
      full.visible = open && hours >= BALANCE.patrol.capHours;
    };
    refresh();
    this.live.push(refresh);
    patrol.addChild(full);
    row.addChild(patrol);
    if (tasksOpen(save)) {
      const daily = claimable(save, this.now()) > 0;
      const achieve = achievementsReady(save).length > 0;
      const tasks = button(t('tasks.button'), 460, 130, () => {
        this.tasksView = achieve && !daily ? 'achieve' : 'daily';
        this.achievePage = 0;
        this.show('tasks');
      }, { fill: COLORS.panel, size: 46, icon: iconSprite(this.host.icons, 'tasks', 84) });
      tasks.x = 250;
      if (daily || achieve) tasks.addChild(dot(205, -50));
      row.addChild(tasks);
    }
    return row;
  }

  /** The Shop tab, centred on x = 0 from y = 0 down (shopHeight tall). */
  shopTab(): Container {
    const c = new Container();
    const kinds = CHEST_KINDS.filter((k) => k !== 'ad' || this.adOk);
    kinds.forEach((kind, i) => {
      const card = this.chestCard(kind);
      card.y = i * (CARD_H + CARD_GAP) + CARD_H / 2;
      c.addChild(card);
    });
    const store = this.host.store;
    if (store) {
      const card = adFreeCard(store, this.buying, CARD_W, CARD_H, {
        buy: () => void this.adFree('buy', () => store.buy()),
        restore: () => void this.adFree('restore', () => store.restore()),
        toast: (text) => this.host.toast(text),
      });
      card.y = kinds.length * (CARD_H + CARD_GAP) + CARD_H / 2;
      c.addChild(card);
    }
    return c;
  }

  /** The open panel and the haul over it, or null. */
  overlay(w: number, h: number): Container | null {
    if (!this.modal && !this.haul) return null;
    const c = new Container();
    const save = this.host.save();
    if (this.modal === 'patrol') {
      c.addChild(patrolPanel(save, this.now, w, h, this.adOk, this.playing, {
        collect: (double) => void this.collect(double),
        quick: (pay) => void this.quick(pay),
        close: () => this.show(null),
        toast: (text) => this.host.toast(text),
      }, this.host.patrolLook(), this.live, this.ticks));
    } else if (this.modal === 'tasks') {
      c.addChild(tasksPanel(save, this.now(), w, h, this.tasksView, this.achievePage, {
        claimTask: (i) => this.claim(claimTask(this.host.save(), this.now(), i), [{ what: 'task', task: i }]),
        bonus: () => this.claim(claimBonus(this.host.save(), this.now()), [{ what: 'bonus' }]),
        claim: (i) => this.claim(claimAchievement(this.host.save(), i), [{ what: 'achievement', goal: i }]),
        claimAll: () => {
          const goals = achievementsReady(this.host.save()).map((i) => ({ what: 'achievement', goal: i, all: true }));
          this.claim(claimAllAchievements(this.host.save()), goals);
        },
        page: (n) => {
          this.achievePage = n;
          this.host.relayout();
        },
        view: (v) => {
          this.tasksView = v;
          this.achievePage = 0;
          this.host.relayout();
        },
        close: () => this.show(null),
      }));
    }
    if (this.haul) {
      c.addChild(haulPanel(this.haul, w, h, () => {
        this.haul = null;
        this.host.relayout();
      }));
    }
    return c;
  }

  private show(modal: Modal): void {
    this.modal = modal;
    this.host.relayout();
  }

  /** Stores a payout and reports it, unless nothing was paid (the save came back as it was). */
  private claim(next: SaveData, events: Record<string, PropValue>[]): void {
    if (next === this.host.save()) return;
    this.host.change(next);
    for (const p of events) this.host.track('claim', p);
  }

  private pay(r: { save: SaveData; haul: Haul } | null, e: 'buy' | 'claim', p: Record<string, PropValue>): void {
    if (!r) return;
    // a buy's price is the jade that went beyond what the haul paid in
    const spent = this.host.save().jade + r.haul.jade - r.save.jade;
    this.haul = r.haul;
    this.host.change(r.save);
    this.host.track(e, { ...p, ...(e === 'buy' ? { spent } : {}), copper: r.haul.copper, jade: r.haul.jade, drops: r.haul.drops.length });
  }

  /** Plays the rewarded ad with every ad button locked; resolves whether it finished. */
  private async watch(): Promise<boolean> {
    if (this.playing) return false;
    this.playing = true;
    this.host.relayout();
    const paid = await this.host.rewarded();
    this.playing = false;
    if (!paid) this.host.relayout();
    return paid;
  }

  /** A buy or a restore of the ad-free card; ownership itself comes back through the store, which
   *  redraws the lobby (main.ios.ts). */
  private async adFree(what: 'buy' | 'restore', go: () => Promise<string>): Promise<void> {
    if (this.buying) return;
    this.buying = true;
    this.host.relayout();
    const outcome = await go();
    this.buying = false;
    this.host.relayout();
    this.host.track('iap', { what, item: 'adfree', outcome });
    const toast = AD_FREE_TOASTS[what][outcome];
    if (toast) this.host.toast(t(toast));
  }

  private async collect(double: boolean): Promise<void> {
    if (double && !(await this.watch())) return;
    const hours = patrolHours(this.host.save(), this.now());
    this.pay(collectPatrol(this.host.save(), this.now(), double), 'claim', { what: 'patrol', hours: Math.round(hours * 10) / 10, double });
  }

  private async quick(pay: QuickPay): Promise<void> {
    if (pay === 'ad' && !(await this.watch())) return;
    this.pay(quickPatrol(this.host.save(), this.now(), pay), 'buy', { item: 'patrol', pay });
  }

  private async open(kind: ChestKind): Promise<void> {
    const block = chestBlock(this.host.save(), this.now(), kind);
    if (block) return this.host.toast(block === 'jade' ? t('shop.noJade') : t('shop.tomorrow'));
    if (kind === 'ad' && !(await this.watch())) return;
    this.pay(openChest(this.host.save(), this.now(), kind), 'buy', { item: 'chest', kind });
  }

  private chestCard(kind: ChestKind): Container {
    const save = this.host.save();
    const now = this.now();
    const card = new Container();
    card.addChild(panel(CARD_W, CARD_H));
    const icon = iconSprite(this.host.icons, `chest_${kind}`, 200);
    if (icon) {
      icon.x = -380;
      card.addChild(icon);
    }
    const c = chestContents(save, kind);
    const left = chestsLeft(save, now, kind);
    const info = kind === 'free' ? t('shop.freeInfo', { copper: formatAmount(c.copper), n: c.drops })
      : kind === 'ad' ? t('shop.adInfo', { jade: c.jade, n: c.drops })
      : t('shop.jadeInfo', { n: c.drops, chapter: c.chapter });
    const status = left === null ? '' : left > 0 ? t('shop.left', { n: left }) : t('shop.tomorrow');
    const lines: [string, number, number][] = [[t(`shop.${kind}`), 56, COLORS.text], [info, 40, COLORS.dim], [status, 38, left === 0 ? COLORS.danger : COLORS.dim]];
    lines.forEach(([text, size, fill], i) => {
      const l = fit(label(text, size, fill, { align: 'left' }), 420);
      l.anchor.set(0, 0.5);
      l.position.set(-270, -80 + i * 75);
      card.addChild(l);
    });
    const block = chestBlock(save, now, kind);
    const playing = kind === 'ad' && this.playing;
    const text = playing ? '…' : kind === 'jade' ? t('shop.price', { jade: BALANCE.shop.jadeChest.jade }) : t('shop.open');
    const ok = !block && !this.playing;
    const fill = !ok ? COLORS.panelLocked : kind === 'jade' ? COLORS.jade : COLORS.saffron;
    const b = button(text, 300, 130, () => void this.open(kind), {
      fill, textFill: !ok ? COLORS.dim : kind === 'jade' ? COLORS.outline : COLORS.text, video: kind === 'ad' && !playing, size: 48,
    });
    b.x = 320;
    if (this.playing) b.eventMode = 'none';
    card.addChild(b);
    if (kind === 'free' && !block) card.addChild(dot(CARD_W / 2 - 20, -CARD_H / 2 + 20));
    return card;
  }
}
