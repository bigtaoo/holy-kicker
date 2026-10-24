import { Container, Graphics } from 'pixi.js';
import { affixList, AFFIX, type Affix } from '@hk/engine';
import { badgeOffsets } from './actLook';

// The affix badges (engine acts.ts AFFIX, act 3 on): code-drawn stickers, a dark disc with a
// thick outline and the affix's sign in flat colour over one hard shadow. The shield is a blue
// shield with a pip for each hit it still blocks, haste a yellow bolt, split two purple
// circles, explode a red burst. Over an elite's head (eliteView.ts) and beside the boss bar
// (bossStage.ts).

const OUTLINE = 0x0b0e0c;
const DISC = 0x241c30;
const SHADOW = 0x0b0e0c;
const COLOR: Record<Affix, number> = { shield: 0x58a8ff, haste: 0xffd23c, split: 0xa064f0, explode: 0xff4a4a };
const GAP = 8;

/** The sign of `a` in a 64-unit badge centred on (0, 0). */
function sign(g: Graphics, a: Affix, dx: number, dy: number, fill: number): void {
  const at = (pts: number[]) => pts.map((v, k) => v + (k % 2 === 0 ? dx : dy));
  const line = { color: OUTLINE, width: 4, join: 'round' as const };
  if (a === 'shield') g.poly(at([0, -22, 18, -15, 16, 6, 0, 22, -16, 6, -18, -15])).fill(fill).stroke(line);
  else if (a === 'haste') g.poly(at([5, -25, -13, 3, -1, 3, -6, 25, 13, -5, 1, -5, 7, -25])).fill(fill).stroke(line);
  else if (a === 'split') {
    g.circle(-9 + dx, 5 + dy, 11).fill(fill).stroke(line);
    g.circle(9 + dx, -6 + dy, 11).fill(fill).stroke(line);
  } else {
    const pts: number[] = [];
    for (let k = 0; k < 16; k++) {
      const r = k % 2 === 0 ? 24 : 11;
      const t = (k / 16) * Math.PI * 2 - Math.PI / 2;
      pts.push(Math.cos(t) * r, Math.sin(t) * r);
    }
    g.poly(at(pts)).fill(fill).stroke(line);
  }
}

/** One badge: the disc, the shadow, the sign, and the shield's pips. */
function badge(a: Affix, guard: number): Graphics {
  const g = new Graphics();
  g.circle(3, 4, 32).fill(SHADOW);
  g.circle(0, 0, 32).fill(DISC).stroke({ color: OUTLINE, width: 6 });
  sign(g, a, 3, 3, SHADOW);
  sign(g, a, 0, 0, COLOR[a]);
  if (a === 'shield') {
    for (let k = 0; k < AFFIX.shieldBlocks; k++) {
      g.circle((k - (AFFIX.shieldBlocks - 1) / 2) * 9, -3, 3.4).fill(k < guard ? 0xffffff : 0x2c4a78);
    }
  }
  return g;
}

/** A row of badges for one foe; rebuilt only when its affixes or shield change. */
export class AffixBadges {
  readonly view = new Container();
  private key = -1;

  /** `size` is a badge's width in the parent's units. */
  constructor(private readonly size = 64) {
    this.view.label = 'affixes';
    this.view.visible = false;
  }

  /** The foe's affix mask (0: none) and the hits its shield still blocks. */
  set(mask: number, guard: number): void {
    this.view.visible = mask !== 0;
    const key = mask * 16 + guard;
    if (key === this.key) return;
    this.key = key;
    for (const c of this.view.removeChildren()) c.destroy();
    const list = affixList(mask);
    const xs = badgeOffsets(list.length, this.size, GAP);
    list.forEach((a, k) => {
      const g = badge(a, guard);
      g.scale.set(this.size / 64);
      g.x = xs[k];
      this.view.addChild(g);
    });
  }

  /** The row's width. */
  width(n: number): number {
    return n * this.size + Math.max(0, n - 1) * GAP;
  }
}
