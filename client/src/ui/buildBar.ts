import { Container, Graphics, Sprite, type Text, type Texture } from 'pixi.js';
import { MAX_LEVEL } from '@hk/engine';
import type { BuildSlot, Charge } from './buildSlots';
import { COLORS, label } from './widgets';

// The build strip under the experience bar: one round badge per slot with the item icon and
// its level as pips. An evolved item gets a gold rim and gold pips; a ready one pulses gold
// (its evolution comes on the next level-up); a maxed one still missing its passive shows that
// passive small on its corner. A spell recharging is darkened by a clock sweep that opens from
// twelve o'clock, with the seconds left on the bell and the incense.

export type IconSheet = ReadonlyMap<string, Texture>;

const R = 44;
const GAP = 12;
/** Extra room between the relic, the spells and the passives. */
const GROUP_GAP = 30;
const PIP_R = 7;
const PIP_STEP = 16;
const GOLD = 0xffd860;

export const KIND_RIM: Record<BuildSlot['kind'], number> = { relic: COLORS.saffron, spell: 0x5aa8f0, passive: COLORS.jade };

/** The icon of `id` scaled to fit `size`, or null if the sheet lacks it. */
export function iconSprite(icons: IconSheet, id: string, size: number): Sprite | null {
  const tex = icons.get(id);
  if (!tex) return null;
  const s = new Sprite(tex);
  s.anchor.set(0.5);
  s.scale.set(size / Math.max(tex.width, tex.height));
  return s;
}

/** The padlock on locked things, `size` across; a drawn one when the sheet has none. */
export function lockIcon(icons: IconSheet, size: number): Container {
  const icon = iconSprite(icons, 'lock', size);
  if (icon) return icon;
  const g = new Graphics().roundRect(-size * 0.3, -size * 0.05, size * 0.6, size * 0.45, 6).fill(COLORS.trim).stroke({ color: COLORS.outline, width: 4 });
  return g.arc(0, -size * 0.05, size * 0.2, Math.PI, 0).stroke({ color: COLORS.outline, width: 6 });
}

/** A spell badge's recharge overlay, redrawn only when its numbers change. */
interface Sweep {
  dark: Graphics;
  secs: Text;
  share: number;
}

export class BuildBar {
  readonly view = new Container();
  /** Gold rings of the slots whose evolution is ready, pulsed by update. */
  private glows: Graphics[] = [];
  /** The spell badges' recharge overlays, in spell slot order (null for an empty slot). */
  private sweeps: (Sweep | null)[] = [];
  private t = 0;

  constructor(private readonly icons: IconSheet) {
    this.view.eventMode = 'none';
  }

  /** Total width of the strip, so the HUD can centre it. */
  static width(count: number): number {
    return count * R * 2 + (count - 3) * GAP + 2 * GROUP_GAP;
  }

  draw(slots: readonly BuildSlot[]): void {
    this.view.removeChildren().forEach((c) => c.destroy({ children: true }));
    this.glows = [];
    this.sweeps = [];
    let x = -BuildBar.width(slots.length) / 2 + R;
    slots.forEach((slot, i) => {
      if (i > 0) x += slots[i - 1].kind === slot.kind ? R * 2 + GAP : R * 2 + GROUP_GAP;
      const badge = this.badge(slot);
      badge.x = x;
      this.view.addChild(badge);
    });
  }

  update(dt: number): void {
    this.t += dt;
    const a = 0.55 + 0.45 * Math.sin(this.t * 6);
    for (const g of this.glows) g.alpha = a;
  }

  /** Each spell's recharge, in spell slot order (spellCharges). */
  setCharges(charges: readonly (Charge | null)[]): void {
    this.sweeps.forEach((w, i) => {
      if (!w) return;
      const c = charges[i];
      const share = c ? Math.round(c.share * 120) / 120 : 0;
      if (share !== w.share) {
        w.share = share;
        w.dark.clear();
        // the dark part is what is still to wait; the bright part grows clockwise from the top
        if (share > 0) w.dark.moveTo(0, 0).arc(0, 0, R - 6, -Math.PI / 2 + (1 - share) * Math.PI * 2, Math.PI * 1.5).closePath().fill({ color: COLORS.outline, alpha: 0.62 });
      }
      const secs = c && c.secs > 0 ? String(c.secs) : '';
      if (w.secs.text !== secs) w.secs.text = secs;
    });
  }

  private badge(slot: BuildSlot): Container {
    const c = new Container();
    const empty = slot.state === 'empty';
    const rim = slot.state === 'evolved' ? GOLD : empty ? COLORS.dim : KIND_RIM[slot.kind];
    c.addChild(new Graphics().circle(0, 0, R).fill(empty ? COLORS.panelLocked : COLORS.panel)
      .stroke({ color: COLORS.outline, width: 10 }).circle(0, 0, R - 4).stroke({ color: rim, width: slot.state === 'evolved' ? 6 : 4 }));
    if (empty) {
      if (slot.kind === 'spell') this.sweeps.push(null);
      c.alpha = 0.6;
      return c;
    }
    if (slot.state === 'ready') {
      const glow = new Graphics().circle(0, 0, R + 8).stroke({ color: GOLD, width: 6 });
      this.glows.push(glow);
      c.addChild(glow);
    }
    const icon = slot.icon && iconSprite(this.icons, slot.icon, R * 1.6);
    if (icon) c.addChild(icon);
    const sweep = slot.kind === 'spell' ? { dark: new Graphics(), secs: label('', 48, COLORS.text, { stroke: { color: COLORS.outline, width: 8 } }), share: 0 } : null;
    if (sweep) {
      this.sweeps.push(sweep);
      c.addChild(sweep.dark);
    }
    const pips = new Graphics();
    const left = -((MAX_LEVEL - 1) * PIP_STEP) / 2;
    for (let i = 0; i < MAX_LEVEL; i++) {
      const fill = i < slot.level ? (slot.state === 'evolved' ? GOLD : rim) : COLORS.panelLocked;
      pips.circle(left + i * PIP_STEP, R + 14, PIP_R).fill(fill).stroke({ color: COLORS.outline, width: 3 });
    }
    c.addChild(pips);
    if (slot.needs) {
      // the passive this maxed item still needs, on its lower right
      const r = R * 0.6;
      const hint = new Container();
      hint.position.set(R * 0.7, R * 0.5);
      hint.addChild(new Graphics().circle(0, 0, r).fill(COLORS.panelLocked).stroke({ color: COLORS.outline, width: 5 })
        .circle(0, 0, r - 3).stroke({ color: GOLD, width: 3 }));
      const small = iconSprite(this.icons, slot.needs, r * 1.5);
      if (small) {
        small.alpha = 0.85;
        hint.addChild(small);
      }
      c.addChild(hint);
    }
    if (sweep) c.addChild(sweep.secs);
    return c;
  }
}
