import { describe, expect, it } from 'vitest';
import { AUDIT_DEFAULTS, auditLayout, type AuditNode } from './layoutAudit';

const W = 400;
const H = 800;
const OPTS = { ...AUDIT_DEFAULTS, uiScale: 0.4, cssPerPx: 1 };

type Box = [x: number, y: number, w: number, h: number];
const bounds = ([x, y, width, height]: Box) => () => ({ x, y, width, height });
const base = { visible: true, renderable: true, alpha: 1 };

/** A label of `fontSize` design units drawn at the UI's scale times `shrink`. */
function text(s: string, box: Box, fontSize = 60, shrink = 1): AuditNode {
  const a = OPTS.uiScale * shrink;
  return { ...base, text: s, style: { fontSize }, worldTransform: { a, b: 0 }, getBounds: bounds(box) };
}

/** A Graphics leaf filling a rect at `alpha`. */
function rect(box: Box, alpha = 1, type = 'rectangle'): AuditNode {
  const path = { shapePath: { shapePrimitives: [{ shape: { type } }] } };
  return { ...base, context: { instructions: [{ action: 'fill', data: { style: { alpha }, path } }] }, getBounds: bounds(box) };
}

function group(children: AuditNode[], extra: Partial<AuditNode> = {}): AuditNode {
  return { ...base, children, getBounds: bounds([0, 0, W, H]), ...extra };
}

const kinds = (n: AuditNode) => auditLayout(n, W, H, OPTS).findings.map((f) => f.kind);

describe('auditLayout', () => {
  it('passes a label sitting in its own panel', () => {
    const r = auditLayout(group([rect([50, 50, 300, 100]), text('Play', [80, 70, 100, 30])]), W, H, OPTS);
    expect(r).toEqual({ labels: 1, findings: [] });
  });

  it('reports two labels that collide, but not a drop shadow', () => {
    const f = auditLayout(group([text('Wave 6', [50, 50, 120, 30]), text('Level up', [90, 55, 120, 30])]), W, H, OPTS).findings;
    expect(f.map((x) => [x.kind, x.a, x.b])).toEqual([['overlap', 'Wave 6', 'Level up']]);
    expect(kinds(group([text('Play', [50, 50, 120, 30]), text('Play', [53, 53, 120, 30])]))).toEqual([]);
  });

  it('reports a label off the canvas', () => {
    expect(kinds(group([text('Gold', [380, 10, 60, 30])]))).toEqual(['offscreen']);
  });

  it('reports a label running out of the solid button it sits on', () => {
    expect(kinds(group([rect([50, 40, 100, 80]), text('A long caption', [60, 55, 160, 30])]))).toEqual(['overflow']);
  });

  it('takes a bar bleeding far past the canvas edge as the face its labels sit on', () => {
    // a list panel scrolled under the tab bar, which runs 800 units on below the canvas
    const panel = rect([100, 620, 200, 140]);
    const tabs = rect([0, 700, W, 900]);
    expect(kinds(group([panel, tabs, text('Gear', [150, 740, 60, 30])]))).toEqual([]);
  });

  it('reports a label painted over by a solid fill drawn after it, not by a faint one', () => {
    expect(kinds(group([text('Hidden', [60, 60, 100, 30]), rect([50, 50, 150, 60])]))).toEqual(['covered']);
    expect(kinds(group([text('Hidden', [60, 60, 100, 30]), rect([50, 50, 150, 60], 0.3)]))).toEqual([]);
  });

  it('reports a panel running off the canvas once, by the label it holds, not an empty one', () => {
    const f = auditLayout(group([rect([50, 600, 300, 300]), text('Back', [150, 650, 100, 30]), text('Claim', [150, 700, 100, 30])]), W, H, OPTS).findings;
    expect(f.map((x) => [x.kind, x.a, x.frac])).toEqual([['cutoff', 'Back', 0.33]]);
    expect(kinds(group([rect([50, 600, 300, 300])]))).toEqual([]);
  });

  it('reports placeholder text', () => {
    expect(kinds(group([text('Coins: NaN', [50, 50, 120, 30])]))).toEqual(['placeholder']);
    expect(kinds(group([text('Hello {name}', [50, 50, 120, 30])]))).toEqual(['placeholder']);
  });

  it('reports a font under 48 design units after a shrink, and under the CSS floor', () => {
    const f = auditLayout(group([text('Small', [50, 50, 80, 14], 48, 0.5)]), W, H, OPTS).findings;
    expect(f.map((x) => [x.kind, x.frac, x.b])).toEqual([['tiny', 24, 'font=48 scale=0.50'], ['small', 9.6, 'font=48 scale=0.50']]);
    // 60 units at 0.4 px a unit is 24 px; half a CSS px a screen px brings it under 12
    const css = auditLayout(group([text('Faint', [50, 50, 80, 20])]), W, H, { ...OPTS, cssPerPx: 0.45 }).findings;
    expect(css.map((x) => x.kind)).toEqual(['small']);
  });

  it('judges a label without a font size by its height', () => {
    const n: AuditNode = { ...base, text: 'Bitmap', getBounds: bounds([50, 50, 80, 8]) };
    expect(kinds(group([n]))).toEqual(['tiny', 'small']);
  });

  it('drops what a later full-screen backdrop hides, and judges the modal on top', () => {
    const behind = [text('Lobby', [50, 50, 100, 30]), text('Clash', [60, 50, 100, 30])];
    const modal = [rect([0, 0, W, H], 0.7, 'roundedRectangle'), rect([50, 300, 300, 200]), text('Paused', [100, 350, 120, 30])];
    expect(auditLayout(group([...behind, ...modal]), W, H, OPTS)).toEqual({ labels: 1, findings: [] });
  });

  it('skips hidden, transparent and masked-away nodes and clips to masks', () => {
    const hidden = group([text('Gone', [50, 50, 100, 30])], { visible: false });
    const faint = group([text('Gone', [50, 50, 100, 30])], { alpha: 0.01 });
    const masked = group([text('Gone', [50, 50, 100, 30])], { mask: { ...base, getBounds: bounds([200, 200, 50, 50]) } });
    expect(auditLayout(group([hidden, faint, masked]), W, H, OPTS).labels).toBe(0);
    // a label running past the canvas edge but clipped by a mask inside it is not offscreen
    const clipped = group([text('Scroll', [350, 50, 100, 30])], { mask: { ...base, getBounds: bounds([0, 0, W, H]) } });
    expect(kinds(group([clipped]))).toEqual([]);
  });

  it('ignores empty labels and fills that are not rects', () => {
    const circle = rect([50, 50, 150, 60], 1, 'circle');
    expect(auditLayout(group([text('  ', [50, 50, 100, 30]), text('Ring', [60, 60, 100, 30]), circle]), W, H, OPTS).findings).toEqual([]);
  });
});
