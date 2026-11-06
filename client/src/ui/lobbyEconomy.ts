import type { OfferPlace, PropValue } from '@hk/protocol';
import { Container } from 'pixi.js';
import { t, type Key } from '../i18n';
import { achievementsReady, claimAchievement, claimAllAchievements } from '../meta/achievements';
import { BALANCE } from '../meta/balance';
import { claimBonus, claimTask, tasksOpen, today, untilNextDay } from '../meta/daily';
import { claimGoal, claimWeekBonus, thisWeek } from '../meta/goals';
import { claimMerit } from '../meta/merit';
import type { Haul } from '../meta/haul';
import { canDouble, collectPatrol, patrolHours, patrolOpen, quickLeft, quickPatrol, type QuickPay } from '../meta/patrol';
import { openProgressChest } from '../meta/progressChests';
import type { SaveData } from '../meta/save';
import { lobbyWaiting, tasksWaiting } from '../meta/waiting';
import { OfferLog } from '../net/offers';
import type { Store } from '../platform/types';
import { claimGift, giftReady, nextGift } from '../meta/welcome';
import { giftPanel } from './giftPanel';
import { CHEST_KINDS, chestBlock, chestsLeft, openChest, type ChestKind } from '../meta/shop';
import { CARD_W, chestCard, shopSpots } from './shopCards';
import type { TasksView } from './achievePanel';
import { adFreeCard } from './adFreeCard';
import { iconSprite, lockIcon, type IconSheet } from './buildBar';
import { hoursText, patrolPanel, tasksPanel, type Live, type PatrolLook, type Tick } from './economyPanels';
import { haulPanel } from './haulPanel';
import { railButton, setRailSub } from './lobbyRail';
import { COLORS, fit, label } from './widgets';

// The lobby's economy (docs/design.md "Retention", "Ads and monetization"): the Shop tab's
// chests (and on iOS the ad-free card, adFreeCard.ts), the patrol and daily-task buttons on
// the Play tab's left rail, a new player's welcome gift, and their panels. Holds what is open and whether an ad or a purchase is under way; the save
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
  /** Plays the rewarded ad offered at `at`; resolves whether it finished. */
  rewarded(at: OfferPlace): Promise<boolean>;
  /** The icon sheet, with the chests as chest_free, chest_ad, chest_jade and (the copper one) chest. */
  icons: IconSheet;
  /** What the patrol panel's scene is drawn with. */
  patrolLook(): PatrolLook;
  /** The ad-free card's purchase; null on every host but iOS. */
  store: Store | null;
  track: LobbyTrack;
}

/** Reports a lobby purchase, payout or rewarded offer to analytics (Backend.track). */
export type LobbyTrack = (e: 'buy' | 'claim' | 'iap' | 'offer', p: Record<string, PropValue>) => void;

type Modal = 'patrol' | 'tasks' | 'gift' | null;

/** What the player is told after an ad-free buy or restore (nothing after a cancel). */
const AD_FREE_TOASTS: Record<'buy' | 'restore', Record<string, Key>> = {
  buy: { owned: 'shop.bought', pending: 'shop.waiting', failed: 'shop.buyFailed' },
  restore: { owned: 'shop.restored', none: 'shop.nothingToRestore', failed: 'shop.storeOffline' },
};


export class EconomyUi {
  private modal: Modal = null;
  private haul: Haul | null = null;
  /** Seconds the haul popup has been up, for its pop (haulPanel.ts). */
  private haulAge = 0;
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
  /** This lobby's rewarded offers, each reported once as shown or no-fill. */
  private readonly offers: OfferLog;

  constructor(private readonly host: EconomyHost, adAvailable: Promise<boolean>, private readonly now: () => number = Date.now) {
    this.offers = new OfferLog(host.track);
    void adAvailable.then((ok) => {
      this.adOk = ok;
      this.offers.answer(ok);
      if (ok) host.relayout();
    });
  }

  /** Called at the start of every lobby layout: the live numbers are rebuilt with it. */
  reset(): void {
    this.live = [];
    this.ticks = [];
  }

  update(dt: number): void {
    if (this.haul) this.haulAge += dt;
    for (const f of this.ticks) f(dt);
    this.clock += dt;
    if (this.clock < 1) return;
    this.clock = 0;
    for (const f of this.live) f();
  }

  /** The Patrol button for the Play tab's left rail: the hours stored, a badge once it is full. */
  patrolRail(): Container {
    const save = this.host.save();
    const open = patrolOpen(save);
    const r = railButton({
      icon: open ? iconSprite(this.host.icons, 'patrol', 100) : lockIcon(this.host.icons, 70),
      name: t('patrol.title'),
      dim: !open,
    }, () => {
      if (!open) return this.host.toast(t('tab.unlockFirstRun'));
      this.show('patrol');
    });
    const refresh = () => {
      const hours = patrolHours(this.host.save(), this.now());
      const full = open && hours >= BALANCE.patrol.capHours;
      // the first minute after setting out reads as a start, not as "0h 0m"
      setRailSub(r, !open ? '' : full ? t('patrol.full') : hours < 1 / 60 ? t('patrol.started') : hoursText(hours));
      r.badge.visible = full;
    };
    refresh();
    this.live.push(refresh);
    return r.view;
  }

  /**
   * The Tasks button under Patrol, once tasks are open: a badge with how many can be claimed over
   * its four pages. A badge, not a dot: the lobby's one-dot-at-a-time rule used to hide it
   * whenever a tab or the monk had a dot of its own, while the results screen counted the tasks.
   */
  tasksRail(): Container | null {
    const save = this.host.save();
    if (!tasksOpen(save)) return null;
    const w = lobbyWaiting(save, this.now());
    const daily = w.tasks > 0;
    const week = w.goals > 0;
    const merit = w.merit > 0;
    const achieve = w.achievements > 0;
    return railButton({ icon: iconSprite(this.host.icons, 'tasks', 100), name: t('tasks.button'), count: tasksWaiting(w) }, () => {
      this.tasksView = daily ? 'daily' : week ? 'week' : merit ? 'merit' : achieve ? 'achieve' : 'daily';
      this.achievePage = 0;
      this.show('tasks');
    }).view;
  }

  /**
   * The welcome gift (meta/welcome.ts) for the right rail: lit with a badge when today's is waiting,
   * dim with "tomorrow" once it is taken; null before the first run and after the last. It opens
   * the week's calendar (giftPanel.ts).
   */
  giftRail(): Container | null {
    const save = this.host.save();
    const gift = nextGift(save);
    if (!save.firstRunDone || !gift) return null;
    const ready = giftReady(save, this.now());
    return railButton({
      icon: iconSprite(this.host.icons, 'chest_free', 104),
      name: t('gift.button'),
      // the gift's name is too long for the rail; the toast names it once claimed
      sub: ready ? '' : t('gift.later'),
      lit: ready,
      dim: !ready,
      count: ready ? 1 : 0,
    }, () => this.show('gift')).view;
  }

  /** Opens a progress chest the runs reached (progressChests.ts) and shows what it paid. */
  progressChest(chapter: number, hard: boolean, index: number): void {
    this.pay(openProgressChest(this.host.save(), chapter, hard, index), 'claim', { what: 'progressChest', chapter, hard, index });
  }

  /**
   * The Shop tab, centred on x = 0 from y = 0 down, `room` tall: the chests, then on iOS the
   * ad-free card, sharing the room (so a host with fewer cards shows them bigger, not a bare
   * floor), and the refill countdown under them.
   */
  /** The Shop tab, its top centre at 0,0; `row` lays a landscape frame `frameW` wide out as one row of tall cards. */
  shopTab(room: number, frameW: number, row: boolean): Container {
    const c = new Container();
    const kinds = CHEST_KINDS.filter((k) => k !== 'ad' || this.adOk);
    if ((chestsLeft(this.host.save(), this.now(), 'ad') ?? 0) > 0) this.offers.place('lobby_chest');
    const store = this.host.store;
    const at = shopSpots(kinds.length + (store ? 1 : 0), room, frameW, row && !store);
    const deps = { save: this.host.save(), now: this.now(), icons: this.host.icons, playing: this.playing, open: (kind: ChestKind) => void this.open(kind) };
    kinds.forEach((kind, i) => {
      const card = chestCard(deps, kind, at.w, at.h, at.row);
      card.position.set(at.at[i].x, at.at[i].y);
      c.addChild(card);
    });
    if (store) {
      const card = adFreeCard(store, this.buying, at.w, at.h, {
        buy: () => void this.adFree('buy', () => store.buy()),
        restore: () => void this.adFree('restore', () => store.restore()),
        toast: (text) => this.host.toast(text),
      });
      card.y = at.at[kinds.length].y;
      c.addChild(card);
    }
    if (at.foot === null) return c;
    const foot = label('', 48, COLORS.text, { stroke: { color: COLORS.outline, width: 8 } });
    foot.y = at.foot;
    const refresh = () => {
      foot.text = t('shop.refill', { time: hoursText(untilNextDay(this.now()) / 3_600_000) });
      fit(foot, CARD_W);
    };
    refresh();
    this.live.push(refresh);
    c.addChild(foot);
    return c;
  }

  /** A haul popup is up: a claim's reward flight waits for its OK. */
  get holding(): boolean {
    return this.haul !== null;
  }

  /** The open panel and the haul over it, or null. */
  overlay(w: number, h: number): Container | null {
    if (!this.modal && !this.haul) return null;
    const c = new Container();
    const save = this.host.save();
    if (this.modal === 'patrol') {
      if (canDouble(save, this.now())) this.offers.place('patrol_double');
      if (quickLeft(save, this.now(), 'ad') > 0) this.offers.place('patrol_quick');
      c.addChild(patrolPanel(save, this.now, w, h, this.adOk, this.playing, {
        collect: (double) => void this.collect(double),
        quick: (pay) => void this.quick(pay),
        close: () => this.show(null),
        toast: (text) => this.host.toast(text),
      }, this.host.patrolLook(), this.live, this.ticks));
    } else if (this.modal === 'tasks') {
      c.addChild(tasksPanel(save, this.now(), w, h, this.tasksView, this.achievePage, this.host.icons, {
        claimTask: (i) => this.claim(claimTask(this.host.save(), this.now(), i), [{ what: 'task', task: i, kind: today(this.host.save(), this.now()).tasks[i]?.kind ?? '' }]),
        bonus: () => this.claim(claimBonus(this.host.save(), this.now()), [{ what: 'bonus' }]),
        claimGoal: (i) => this.claim(claimGoal(this.host.save(), this.now(), i), [{ what: 'goal', goal: i, kind: thisWeek(this.host.save(), this.now()).tasks[i]?.kind ?? '' }]),
        weekBonus: () => this.pay(claimWeekBonus(this.host.save(), this.now()), 'claim', { what: 'weekBonus' }),
        claimMerit: () => this.pay(claimMerit(this.host.save(), this.now()), 'claim', { what: 'merit' }),
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
    } else if (this.modal === 'gift') {
      c.addChild(giftPanel(save, this.now(), w, h, this.host.icons, {
        claim: () => {
          const r = claimGift(this.host.save(), this.now());
          if (r) this.pay(r, 'claim', { what: 'gift', n: r.n, ...(r.haul.monk ? { monk: r.haul.monk } : {}) });
        },
        close: () => this.show(null),
      }));
    }
    if (this.haul) {
      const haul = haulPanel(this.haul, this.host.icons, w, h, () => {
        this.haul = null;
        this.host.relayout();
      });
      haul.pop(this.haulAge);
      this.ticks.push(() => haul.pop(this.haulAge));
      c.addChild(haul.view);
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
    this.haulAge = 0;
    this.host.change(r.save);
    this.host.track(e, { ...p, ...(e === 'buy' ? { spent } : {}), copper: r.haul.copper, jade: r.haul.jade, drops: r.haul.drops.length });
  }

  /** Plays the rewarded ad with every ad button locked; resolves whether it finished. */
  private async watch(at: OfferPlace): Promise<boolean> {
    if (this.playing) return false;
    this.playing = true;
    this.host.relayout();
    const paid = await this.host.rewarded(at);
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
    if (double && !(await this.watch('patrol_double'))) return;
    const hours = patrolHours(this.host.save(), this.now());
    this.pay(collectPatrol(this.host.save(), this.now(), double), 'claim', { what: 'patrol', hours: Math.round(hours * 10) / 10, double });
  }

  private async quick(pay: QuickPay): Promise<void> {
    if (pay === 'ad' && !(await this.watch('patrol_quick'))) return;
    this.pay(quickPatrol(this.host.save(), this.now(), pay), 'buy', { item: 'patrol', pay });
  }

  private async open(kind: ChestKind): Promise<void> {
    const block = chestBlock(this.host.save(), this.now(), kind);
    if (block) return this.host.toast(block === 'jade' ? t('shop.noJade') : block === 'copper' ? t('gear.noCopper') : t('shop.tomorrow'));
    if (kind === 'ad' && !(await this.watch('lobby_chest'))) return;
    this.pay(openChest(this.host.save(), this.now(), kind), 'buy', { item: 'chest', kind });
  }
}
