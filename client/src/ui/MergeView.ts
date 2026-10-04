import { Container, Graphics, type Renderer } from 'pixi.js';
import type { Stat } from '@hk/engine';
import { t } from '../i18n';
import { BALANCE } from '../meta/balance';
import { itemStats, slotOf, type Drop, type ItemId, type Tier } from '../meta/gear';
import { FxLayer } from '../game/fxView';
import type { IconSheet } from './buildBar';
import { gearIcon } from './gearIcons';
import { itemName, TIER_COLORS, tierName } from './gearText';
import { COPIES, mergeFrame, mergeTiming, skipTo, type MergeTiming } from './mergeTimeline';
import { statText } from './statText';
import { COLORS, backdrop, fit, label, panel } from './widgets';

// The merge effect over the lobby (docs/design.md "Merge screen and effect"), timed by
// mergeTimeline.ts: copies fly into the centre, the ring charges in the new tier's colour, a
// white flash and a burst of sparks (the in-game particle layer), the new item bounces in and
// a card counts its stats up from the old tier. "Merge all" plays the short version for its
// best result and lists every merge on the card. A tap skips to the card, the next closes.

export interface MergeShow {
  /** The item made and its new tier. */
  item: ItemId;
  tier: Tier;
  /** Every merge done, for "Merge all"; the card then lists them instead of stats. */
  all?: Drop[];
}

const RIM = 380;
const BADGE_R = 120;

export class MergeView {
  readonly view = new Container();
  private readonly stage = new Container();
  private readonly ring = new Graphics();
  private readonly flash: Graphics;
  private readonly copies: Container[] = [];
  private readonly item: Container;
  private readonly card = new Container();
  private readonly fx: FxLayer;
  private readonly timing: MergeTiming;
  private readonly cy: number;
  private t = 0;
  private shake = 0;
  private landed = 0;
  private burst = false;
  private counted = -1;
  private readonly counters: { stat: Stat; from: number; to: number; text: ReturnType<typeof label>; star: boolean }[] = [];

  constructor(
    renderer: Renderer,
    private readonly icons: IconSheet,
    private readonly w: number,
    h: number,
    private readonly show: MergeShow,
    private readonly onClose: () => void,
  ) {
    this.timing = mergeTiming(!!show.all);
    this.cy = h / 2 - 260;
    this.view.addChild(backdrop(w, h, 0.94));
    this.stage.position.set(w / 2, this.cy);
    this.view.addChild(this.stage);
    const from = (show.tier - 1) as Tier;
    for (let i = 0; i < COPIES; i++) {
      const c = this.badge(show.item, from, 70);
      this.copies.push(c);
      this.stage.addChild(c);
    }
    this.stage.addChild(this.ring);
    this.item = this.badge(show.item, show.tier, BADGE_R);
    this.item.visible = false;
    this.stage.addChild(this.item);
    this.fx = new FxLayer(renderer);
    this.stage.addChild(this.fx.view);
    this.flash = new Graphics().rect(0, 0, w, h).fill(0xffffff);
    this.flash.alpha = 0;
    this.buildCard();
    this.view.addChild(this.card, this.flash);
    const hint = label(t('gear.tap'), 48, COLORS.dim);
    hint.position.set(w / 2, h - 120);
    this.view.addChild(hint);
    this.view.eventMode = 'static';
    this.view.on('pointertap', () => this.skip());
    this.update(0);
  }

  destroy(): void {
    this.view.destroy({ children: true });
  }

  private skip(): void {
    const to = skipTo(this.t, this.timing);
    if (to === 'close') return this.onClose();
    this.landed = COPIES;
    this.burst = true;
    this.t = to;
  }

  private badge(item: ItemId, tier: Tier, r: number): Container {
    const c = new Container();
    c.addChild(new Graphics().circle(0, 0, r).fill(COLORS.panelLocked).stroke({ color: COLORS.outline, width: 10 })
      .circle(0, 0, r - 8).stroke({ color: TIER_COLORS[tier], width: r / 8 }));
    const icon = gearIcon(this.icons, item, r * 1.45);
    if (icon) c.addChild(icon);
    return c;
  }

  update(dt: number): void {
    this.t += dt;
    const f = mergeFrame(this.t, this.timing);
    const color = TIER_COLORS[this.show.tier];
    f.copies.forEach((k, i) => {
      const c = this.copies[i];
      c.visible = k !== null;
      if (k === null) return;
      const a = -Math.PI / 2 + (i / COPIES) * Math.PI * 2;
      c.position.set(Math.cos(a) * RIM * (1 - k), Math.sin(a) * RIM * (1 - k));
    });
    // a pop and a shake as each copy lands
    const down = f.copies.filter((k) => k === null).length;
    while (this.landed < down) {
      this.landed++;
      this.pop(TIER_COLORS[this.show.tier - 1], 6, 500);
      this.shake = 0.12;
    }
    this.ring.clear();
    if (f.charge > 0) {
      const r = 90 + f.charge * 60;
      const spin = this.t * 9;
      this.ring.circle(0, 0, r).stroke({ color, width: 10 + f.charge * 14, alpha: 0.4 + f.charge * 0.6 });
      for (let i = 0; i < 6; i++) {
        const a = spin + (i / 6) * Math.PI * 2;
        this.ring.circle(Math.cos(a) * r, Math.sin(a) * r, 10 + f.charge * 8).fill(0xffffff);
      }
      if (Math.random() < f.charge) this.inward(color);
    }
    if (f.item && !this.burst) {
      this.burst = true;
      this.pop(color, 26, 1100);
      this.pop(0xffffff, 10, 800);
      this.fx.pool.emit({ shape: 'ring', x: 0, y: 0, vx: 0, vy: 0, life: 0.45, size0: 60, size1: 700, rotation: 0, spin: 0, drag: 1, color, alpha: 1 });
    }
    this.item.visible = !!f.item;
    if (f.item) {
      this.item.scale.set(f.item.sx, f.item.sy);
      this.item.y = -260 * (1 - f.item.fall);
    }
    this.flash.alpha = f.flash;
    this.card.visible = f.card > 0;
    this.card.alpha = f.card;
    this.card.y = this.cy + 560 + (1 - f.card) * 120;
    if (f.count !== this.counted) {
      this.counted = f.count;
      for (const c of this.counters) c.text.text = `${c.star ? '★ ' : ''}${statText(c.stat, Math.round(c.from + (c.to - c.from) * f.count))}`;
    }
    this.shake = Math.max(0, this.shake - dt);
    const s = this.shake * 120;
    this.stage.position.set(this.w / 2 + (Math.random() - 0.5) * s, this.cy + (Math.random() - 0.5) * s);
    this.fx.update(dt);
  }

  /** Sparks and rays flying out of the centre. */
  private pop(color: number, n: number, speed: number): void {
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + Math.random() * 0.4;
      const v = speed * (0.6 + Math.random() * 0.6);
      const ray = i % 3 === 0;
      this.fx.pool.emit({
        shape: ray ? 'band' : 'spark', x: 0, y: 0, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: 0.35 + Math.random() * 0.25,
        size0: ray ? 70 : 40, size1: 6, rotation: ray ? a : Math.random() * Math.PI, spin: ray ? 0 : 8, drag: 0.05,
        color: i % 4 ? color : 0xffffff, alpha: 1, aspect: ray ? 0.25 : 1,
      });
    }
  }

  /** A glow drawn into the charging centre. */
  private inward(color: number): void {
    const a = Math.random() * Math.PI * 2;
    const r = 320;
    this.fx.pool.emit({
      shape: 'glow', x: Math.cos(a) * r, y: Math.sin(a) * r, vx: -Math.cos(a) * r * 2.5, vy: -Math.sin(a) * r * 2.5, life: 0.4,
      size0: 34, size1: 8, rotation: 0, spin: 0, drag: 1, color, alpha: 0.9,
    });
  }

  private buildCard(): void {
    const { item, tier, all } = this.show;
    const lines: { text: string; fill: number }[] = [];
    if (all) {
      // one line per item and tier made, the best first
      const made = new Map<string, number>();
      for (const d of all) made.set(`${d.tier}:${d.item}`, (made.get(`${d.tier}:${d.item}`) ?? 0) + 1);
      const rows = [...made].sort((a, b) => Number(b[0][0]) - Number(a[0][0])).slice(0, 7);
      for (const [key, n] of rows) {
        const [k, id] = key.split(':') as [string, ItemId];
        lines.push({ text: `${tierName(Number(k) as Tier)} ${itemName(id)} ${t('gear.count', { n })}`, fill: TIER_COLORS[Number(k)] });
      }
    }
    const statRows = all ? [] : Object.entries(itemStats(item, tier)) as [Stat, number][];
    const before = itemStats(item, (tier - 1) as Tier);
    const affix = BALANCE.gear.items[slotOf(item)].affixes[tier - 1];
    const boxH = 200 + (all ? lines.length : statRows.length) * 66;
    this.card.x = this.w / 2;
    this.card.addChild(panel(900, boxH));
    const head = fit(label(all ? t('gear.merged', { n: all.length }) : `${tierName(tier)} ${itemName(item)}`, 60, TIER_COLORS[tier]), 820);
    head.y = -boxH / 2 + 70;
    this.card.addChild(head);
    let y = -boxH / 2 + 160;
    for (const l of lines) {
      const text = fit(label(l.text, 48, l.fill), 820);
      text.y = y;
      this.card.addChild(text);
      y += 66;
    }
    // every stat counts up from the old tier; the one the new affix raises is starred
    for (const [stat, to] of statRows) {
      const star = affix?.[0] === stat;
      const text = label(statText(stat, before[stat] ?? 0), 48, star ? COLORS.saffron : COLORS.text);
      text.y = y;
      this.card.addChild(text);
      this.counters.push({ stat, from: before[stat] ?? 0, to, text, star });
      y += 66;
    }
  }
}

