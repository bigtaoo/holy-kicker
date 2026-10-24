import { Graphics } from 'pixi.js';
import { THEME } from '../theme';

// The corgi reskin's spell and relic effects (docs/reskin.md): the same timings, sizes and
// layers as Holy Kicker's, drawn as the corgi's gadgets in the colours of its icons, orange
// metal, grey steel and cyan glass. Each view keeps Holy Kicker's look and takes these in a
// corgi build; no build mixes the two. The Golden Bell becomes an energy bubble, the cymbals saw
// blades, the beads drones, the bowl a striped disc, the lotus seeds mines, the incense ring a
// plasma field (a green repair field when evolved), the Mountain Palm's print a scorched crater.

export const CORGI = THEME === 'corgi';

export const CORGI_FX = {
  outline: 0x1e2228,
  orange: 0xff9a2a,
  hot: 0xffd27a,
  red: 0xd8372c,
  steel: 0xb8c0c8,
  steelDark: 0x6e7682,
  cyan: 0x6fe4ff,
  cyanPale: 0xd8f8ff,
  laser: 0xff5a30,
  laserCore: 0xffe4d8,
  plasma: 0x4ff0c8,
  plasmaPale: 0xd4fff2,
  mend: 0x6ff08a,
  mendPale: 0xdcffe2,
} as const;

const C = CORGI_FX;

/** The Plasma Field in a 2r box, like its icon: a teal ring cast by a small orange
 *  emitter in the middle, crackling at the rim; the evolved Repair Field is green with a cross. */
export function corgiPuddle(r: number, heal: boolean): Graphics {
  const fill = heal ? C.mend : C.plasma;
  const pale = heal ? C.mendPale : C.plasmaPale;
  const g = new Graphics()
    .circle(r, r, r * 0.94).fill({ color: fill, alpha: 0.18 })
    .circle(r, r, r * 0.92).stroke({ color: fill, width: r * 0.07, alpha: 0.92 })
    .circle(r, r, r * 0.88).stroke({ color: pale, width: r * 0.02, alpha: 0.8 })
    .circle(r, r, r * 0.55).stroke({ color: fill, width: r * 0.03, alpha: 0.45 });
  // six short zigzag arcs along the rim
  for (let k = 0; k < 6; k++) {
    const a0 = (k / 6) * Math.PI * 2 + 0.3;
    for (let j = 0; j < 5; j++) {
      const a = a0 + j * 0.09;
      const d = r * (j % 2 ? 0.99 : 0.87);
      if (j === 0) g.moveTo(r + Math.cos(a) * d, r + Math.sin(a) * d);
      else g.lineTo(r + Math.cos(a) * d, r + Math.sin(a) * d);
    }
    g.stroke({ color: pale, width: r * 0.025, alpha: 0.95 });
  }
  const e = r * 0.2;
  g.ellipse(r, r, e, e * 0.8).fill(C.orange).stroke({ color: C.outline, width: r * 0.03 })
    .ellipse(r, r, e * 0.45, e * 0.36).fill(fill);
  if (heal) {
    const arm = { color: 0xffffff, alpha: 0.85 };
    const line = { color: fill, width: r * 0.02 };
    g.roundRect(r - r * 0.08, r - r * 0.5, r * 0.16, r * 0.28, r * 0.03).fill(arm).stroke(line)
      .roundRect(r - r * 0.22, r - r * 0.44, r * 0.44, r * 0.16, r * 0.03).fill(arm).stroke(line);
  }
  return g;
}

/** The Orbital Barrage's crater in a 2r box: scorched ground under a glowing rim and a crosshair. */
export function corgiCrater(r: number): Graphics {
  const g = new Graphics()
    .circle(r, r, r * 0.95).fill({ color: 0x2a1e18, alpha: 0.42 })
    .circle(r, r, r * 0.92).stroke({ color: C.orange, width: r * 0.06, alpha: 0.85 })
    .circle(r, r, r * 0.6).stroke({ color: C.hot, width: r * 0.03, alpha: 0.6 })
    .circle(r, r, r * 0.08).fill({ color: C.hot, alpha: 0.9 });
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2;
    g.moveTo(r + Math.cos(a) * r * 0.25, r + Math.sin(a) * r * 0.25).lineTo(r + Math.cos(a) * r * 0.8, r + Math.sin(a) * r * 0.8);
  }
  return g.stroke({ color: C.orange, width: r * 0.05, alpha: 0.85 });
}

/** A saw blade in a 2r box: steel teeth round an orange hub. */
export function corgiSaw(r: number): Graphics {
  const teeth = 14;
  const pts: number[] = [];
  for (let i = 0; i < teeth; i++) {
    const a = (i / teeth) * Math.PI * 2;
    const b = ((i + 0.75) / teeth) * Math.PI * 2;
    pts.push(r + Math.cos(a) * r * 0.94, r + Math.sin(a) * r * 0.94, r + Math.cos(b) * r * 0.74, r + Math.sin(b) * r * 0.74);
  }
  return new Graphics()
    .poly(pts).fill(C.steel).stroke({ color: C.outline, width: r * 0.08 })
    .circle(r, r, r * 0.52).fill(C.steelDark)
    .circle(r, r, r * 0.24).fill(C.orange).stroke({ color: C.outline, width: r * 0.08 })
    .moveTo(r * 0.5, r * 0.62).lineTo(r * 0.72, r * 0.5).stroke({ color: 0xffffff, width: r * 0.08, alpha: 0.8 });
}

/** The Bubble Shield round the hero, centred on (0, 0): an energy skin that glows at its edge and
 * fades inward, so the hero inside stays clear; the gloss runs along the rim, off the face. */
export function corgiBubble(r: number): Graphics {
  const g = new Graphics().ellipse(0, 0, r, r * 1.15).fill({ color: C.cyan, alpha: 0.05 });
  // the edge glow: rings stepping inward, fainter each step
  for (const [k, w, a] of [[0.95, 12, 0.08], [0.97, 8, 0.14], [0.985, 5, 0.22]] as const) {
    g.ellipse(0, 0, r * k, r * 1.15 * k).stroke({ color: C.cyan, width: w, alpha: a });
  }
  g.ellipse(0, 0, r, r * 1.15).stroke({ color: C.cyanPale, width: 4, alpha: 0.8 });
  // a crescent of gloss on the upper left of the rim, and a glint on the far side
  for (let i = 0; i <= 12; i++) {
    const a = Math.PI * (1.08 + 0.3 * (i / 12));
    const x = Math.cos(a) * r * 0.88;
    const y = Math.sin(a) * r * 1.15 * 0.88;
    if (i) g.lineTo(x, y);
    else g.moveTo(x, y);
  }
  g.stroke({ color: 0xffffff, width: 6, alpha: 0.5, cap: 'round' });
  return g.circle(r * 0.62, r * 0.7, r * 0.04).fill({ color: 0xffffff, alpha: 0.5 });
}

/** A drone in a d box: a round body with a cyan eye under two rotors; `steel` for the second ring. */
export function corgiDrone(d: number, steel: boolean): Graphics {
  const r = d / 2;
  const body = steel ? C.steel : C.orange;
  const shade = steel ? C.steelDark : 0xc4641a;
  const g = new Graphics();
  for (const side of [-1, 1]) {
    g.moveTo(r + side * 12, r).lineTo(r + side * 17, r - 13).stroke({ color: C.outline, width: 5 });
    g.ellipse(r + side * 17, r - 15, 12, 4.5).fill(C.steel).stroke({ color: C.outline, width: 3 });
  }
  return g.ellipse(r, r + 6, 21, 15).fill(C.outline)
    .ellipse(r, r + 6, 16, 10.5).fill(body)
    // one hard cel shadow along the bottom, the eye on the front
    .ellipse(r, r + 12, 14, 4).fill(shade)
    .circle(r + 4, r + 5, 5.5).fill(C.cyan).stroke({ color: C.outline, width: 2.5 })
    .circle(r + 2.5, r + 3.5, 1.8).fill(0xffffff);
}

/** The thrown disc in a size box: orange with red stripes, or steel with cyan ones for the Saw Storm. */
export function corgiDisc(size: number, storm: boolean): Graphics {
  const r = size / 2;
  const g = new Graphics()
    .circle(r, r, r - 1).fill(C.outline)
    .circle(r, r, r - 7).fill(storm ? C.steelDark : C.orange);
  const stripe = storm ? C.cyan : C.red;
  for (const off of [-20, 0, 20]) {
    const half = Math.sqrt((r - 11) ** 2 - off * off);
    g.moveTo(r - half, r + off).lineTo(r + half, r + off).stroke({ color: stripe, width: 9 });
  }
  g.circle(r, r, r - 12).stroke({ color: storm ? C.cyanPale : C.hot, width: 4 });
  if (storm) g.circle(r, r, 14).fill({ color: C.cyanPale, alpha: 0.9 });
  return g.ellipse(r - 24, r - 30, 9, 5).fill(0xffffff);
}

/** A mine in a w × (w + 8) box, standing on its bottom quarter: a steel puck with a red light. */
export function corgiMine(w: number, magnet: boolean): Graphics {
  const r = w / 2;
  return new Graphics()
    .ellipse(r, r + 10, 23, 13).fill(C.outline)
    .ellipse(r, r + 9, 19, 9.5).fill(C.steel)
    .ellipse(r, r + 13, 16, 4).fill(C.steelDark)
    .ellipse(r, r + 3, 12, 7.5).fill(magnet ? C.cyan : C.orange).stroke({ color: C.outline, width: 3.5 })
    .circle(r, r + 1, 3.6).fill(magnet ? 0xffffff : 0xff3a2a)
    .circle(r - 5, r, 1.6).fill({ color: 0xffffff, alpha: 0.8 });
}
