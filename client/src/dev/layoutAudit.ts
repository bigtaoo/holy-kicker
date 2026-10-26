// A geometry auditor that runs inside the page, against the live Pixi display tree: labels that
// collide, spill out of the panel or button they were drawn into, fall off the canvas, sit under
// opaque art drawn after them, or come out smaller than the game lets text be. Adapted from
// D:\funny's client/src/testing/layoutAudit.ts; build/layoutSweep.mjs drives it (docs/layout-sweep.md).
//
// Only the dev server reaches it: the sweep imports this module into the page by its source path,
// no entry imports it, so no release bundle carries it. It is self-contained all the same (no
// imports, no module-level values, every helper nested in `auditLayout`), so it can also be handed
// to `page.evaluate` as a function, which serializes it by its source text.

/** An axis-aligned rect in the renderer's screen pixels. */
export interface AuditRect { x: number; y: number; w: number; h: number }

export interface AuditFinding {
  /**
   * `overlap`: two labels whose ink boxes intersect. `offscreen`: a label (partly) outside the
   * canvas. `overflow`: a label running out of the solid panel or button face it sits on.
   * `covered`: a label painted over by a solid fill drawn after it. `tiny`: a label whose font,
   * times any shrink applied above it, is below the UI's minimum in design units (CLAUDE.md: 48).
   * `small`: a label rendered below the CSS-px floor, whatever its design size: the viewport
   * itself is too small for the UI's scale. `placeholder`: a label showing undefined, NaN or an
   * unfilled `{name}`.
   */
  kind: 'overlap' | 'offscreen' | 'overflow' | 'covered' | 'tiny' | 'small' | 'placeholder';
  a: string;
  /** The other label for `overlap`; for `tiny` and `small` the diagnosis, `font=<units> scale=<shrink>`. */
  b: string;
  rectA: AuditRect;
  rectB: AuditRect;
  /** `overlap`, `covered`: the share of the smaller ink box hit; `overflow`: escape / width; `tiny`: design units; `small`: CSS px. */
  frac: number;
}

export interface AuditOptions {
  /** Report an overlap only when it covers at least this share of the smaller label... */
  minFrac: number;
  /** ...and at least this many square pixels. Together they ignore labels that only touch. */
  minPx: number;
  /** Screen pixels per UI design unit (UiFrame.scale: the current screen's view scale). */
  uiScale: number;
  /** CSS pixels per renderer screen pixel (1 unless the canvas is stretched). */
  cssPerPx: number;
  /** The smallest font a label may have, in design units, after any shrink above it. */
  minDesignUnits: number;
  /** The smallest a label may render, in CSS pixels. */
  minCssPx: number;
}

export interface AuditResult {
  /** Visible labels judged; 0 means the walk found no scene to judge. */
  labels: number;
  findings: AuditFinding[];
}

export const AUDIT_DEFAULTS = { minFrac: 0.12, minPx: 40, minDesignUnits: 48, minCssPx: 12 } as const;

/** The minimal shape of a Pixi v8 container the walk reads. */
export interface AuditNode {
  visible: boolean;
  renderable: boolean;
  alpha: number;
  label?: string | null;
  text?: unknown;
  mask?: unknown;
  children?: AuditNode[];
  /** `Text`: its font size, in its own units. */
  style?: { fontSize?: unknown };
  /** `Graphics`: what it was told to draw. */
  context?: { instructions?: Array<{ action: string; data?: { style?: { alpha?: number }; path?: { shapePath?: { shapePrimitives?: Array<{ shape?: { type?: string } }> } } } }> };
  worldTransform?: { a: number; b: number };
  getBounds(): { x: number; y: number; width: number; height: number };
}

/**
 * Walks `stage` and reports labels that collide, spill out of their own panel or fall off a
 * `screenW` x `screenH` canvas. Three rules keep it quiet enough to be a gate:
 *
 *  - Masks are honoured: every box is clipped to its ancestors' masks, a label clipped away is dropped.
 *  - Occlusion is honoured: a label drawn before an opaque, screen-sized fill (a modal's backdrop, a
 *    full-screen menu backdrop) inside it is dropped, so a panel is judged against itself, not the
 *    screen dimmed behind it.
 *  - Text padding is removed: each label box is deflated by 10% of its height (at most 4 px) before
 *    intersecting, so labels that only touch are not reported.
 */
export function auditLayout(stage: AuditNode, screenW: number, screenH: number, opts: AuditOptions): AuditResult {
  const screenArea = screenW * screenH;
  const axisScale = (m: { a: number; b: number } | undefined): number => (m ? Math.hypot(m.a, m.b) : 1);
  const rectOf = (n: AuditNode): AuditRect => {
    const b = n.getBounds();
    return { x: b.x, y: b.y, w: b.width, h: b.height };
  };
  const intersect = (a: AuditRect, b: AuditRect): AuditRect => {
    const x = Math.max(a.x, b.x);
    const y = Math.max(a.y, b.y);
    return { x, y, w: Math.max(0, Math.min(a.x + a.w, b.x + b.w) - x), h: Math.max(0, Math.min(a.y + a.h, b.y + b.h) - y) };
  };
  const contains = (outer: AuditRect, inner: AuditRect): boolean =>
    outer.x <= inner.x + 0.5 && outer.y <= inner.y + 0.5 && outer.x + outer.w >= inner.x + inner.w - 0.5 && outer.y + outer.h >= inner.y + inner.h - 0.5;
  const labelOf = (n: AuditNode): string | null => (typeof n.text === 'string' && n.text.trim().length > 0 ? n.text : null);
  /** The alpha of the most opaque rect or rounded-rect fill a Graphics draws, 0 for anything else. */
  const boxFill = (n: AuditNode): number => {
    let best = 0;
    for (const ins of n.context?.instructions ?? []) {
      if (ins.action !== 'fill') continue;
      const shapes = ins.data?.path?.shapePath?.shapePrimitives ?? [];
      if (shapes.some((p) => p.shape?.type === 'rectangle' || p.shape?.type === 'roundedRectangle')) best = Math.max(best, ins.data?.style?.alpha ?? 1);
    }
    return best;
  };

  interface Label { order: number; text: string; rect: AuditRect; font: number | null; worldScale: number }
  /** A leaf that could be the panel or button a label was drawn into; `solid` when it is an opaque rect fill. */
  interface Frame { order: number; rect: AuditRect; alpha: number; solid: boolean }
  const labels: Label[] = [];
  const frames: Frame[] = [];
  const covers: Array<{ order: number; rect: AuditRect }> = [];
  let order = 0;

  // pre-order DFS is Pixi's paint order: a higher `order` is drawn later, on top
  const walk = (n: AuditNode, clip: AuditRect | null, parentAlpha: number): void => {
    if (!n.visible || n.alpha <= 0.02) return;
    const alpha = parentAlpha * n.alpha;
    if (alpha <= 0.05) return;
    let next = clip;
    if (n.mask && typeof (n.mask as AuditNode).getBounds === 'function') {
      const m = rectOf(n.mask as AuditNode);
      next = next ? intersect(next, m) : m;
      if (next.w <= 0 || next.h <= 0) return;
    }
    const mine = order++;
    if (n.renderable) {
      const raw = rectOf(n);
      const box = next ? intersect(raw, next) : raw;
      if (box.w > 0 && box.h > 0) {
        const text = labelOf(n);
        if (text !== null) {
          const font = Number(n.style?.fontSize);
          labels.push({ order: mine, text, rect: box, font: Number.isFinite(font) && font > 0 ? font : null, worldScale: axisScale(n.worldTransform) });
        } else if (!n.children?.length) {
          const fill = boxFill(n);
          const area = box.w * box.h;
          // a Graphics paints what it filled; a sprite its whole box, as far as the tree can tell
          const opacity = alpha * (n.context ? fill : 1);
          if (opacity >= 0.5 && area >= 0.45 * screenArea) covers.push({ order: mine, rect: box });
          else if (box.w >= 12 && box.h >= 12 && area <= 0.35 * screenArea) frames.push({ order: mine, rect: box, alpha, solid: alpha * fill >= 0.6 });
        }
      }
    }
    for (const k of n.children ?? []) walk(k, next, alpha);
  };
  walk(stage, null, 1);

  const unseen = (o: number, r: AuditRect): boolean => covers.some((c) => c.order > o && contains(c.rect, r));
  const visible = labels.filter((l) => !unseen(l.order, l.rect));
  const seenFrames = frames.filter((f) => !unseen(f.order, f.rect));
  const findings: AuditFinding[] = [];
  const none: AuditRect = { x: 0, y: 0, w: 0, h: 0 };
  const ink = (r: AuditRect): AuditRect => {
    const pad = Math.min(r.h * 0.1, 4);
    return { x: r.x + pad * 0.5, y: r.y + pad, w: Math.max(0, r.w - pad), h: Math.max(0, r.h - pad * 2) };
  };
  const round2 = (v: number): number => Math.round(v * 100) / 100;

  for (const l of visible) {
    if (l.rect.x < -0.5 || l.rect.y < -0.5 || l.rect.x + l.rect.w > screenW + 0.5 || l.rect.y + l.rect.h > screenH + 0.5) {
      findings.push({ kind: 'offscreen', a: l.text, b: '', rectA: l.rect, rectB: none, frac: 0 });
    }
    const box = ink(l.rect);
    const area = box.w * box.h;
    if (area <= 0) continue;

    // painted over by a solid fill drawn after it
    for (const f of frames) {
      if (f.order < l.order || !f.solid) continue;
      const hit = intersect(box, f.rect);
      if (hit.w * hit.h > area * 0.35) {
        findings.push({ kind: 'covered', a: l.text, b: '', rectA: l.rect, rectB: f.rect, frac: round2((hit.w * hit.h) / area) });
        break;
      }
    }
    if (/\b(undefined|null|NaN)\b|\{\w+\}/.test(l.text)) findings.push({ kind: 'placeholder', a: l.text, b: '', rectA: l.rect, rectB: none, frac: 0 });

    // legibility: the font in design units after any shrink-to-fit above it, and in CSS pixels
    const shrink = opts.uiScale > 0 ? l.worldScale / opts.uiScale : 1;
    const units = l.font !== null ? l.font * shrink : box.h / Math.max(opts.uiScale, 1e-6) / 0.77;
    const diag = `font=${l.font ?? '?'} scale=${shrink.toFixed(2)}`;
    if (units < opts.minDesignUnits - 0.5) findings.push({ kind: 'tiny', a: l.text, b: diag, rectA: l.rect, rectB: none, frac: Math.round(units * 10) / 10 });
    const css = (l.font !== null ? l.font * l.worldScale : box.h / 0.77) * opts.cssPerPx;
    if (css < opts.minCssPx - 0.05) findings.push({ kind: 'small', a: l.text, b: diag, rectA: l.rect, rectB: none, frac: Math.round(css * 10) / 10 });

    // overflow: no box under the label holds it, and the solid one holding most of it is escaped
    let frame: AuditRect | null = null;
    let held = area * 0.5;
    const cx = box.x + box.w / 2;
    const cy = box.y + box.h / 2;
    for (const f of seenFrames) {
      if (f.order > l.order || f.rect.w * f.rect.h < area * 1.2) continue;
      if (contains(f.rect, box)) {
        frame = null;
        break;
      }
      if (!f.solid || cx < f.rect.x || cx > f.rect.x + f.rect.w || cy < f.rect.y || cy > f.rect.y + f.rect.h) continue;
      const inside = intersect(box, f.rect);
      if (inside.w * inside.h <= held) continue;
      held = inside.w * inside.h;
      frame = f.rect;
    }
    if (frame) {
      const escape = Math.max(frame.x - box.x, box.x + box.w - (frame.x + frame.w), frame.y - box.y, box.y + box.h - (frame.y + frame.h));
      if (escape > Math.max(3, box.h * 0.15)) findings.push({ kind: 'overflow', a: l.text, b: 'frame', rectA: l.rect, rectB: frame, frac: round2(escape / Math.max(1, box.w)) });
    }
  }

  for (let i = 0; i < visible.length; i++) {
    for (let j = i + 1; j < visible.length; j++) {
      const a = visible[i];
      const b = visible[j];
      // the same text twice a few pixels apart is a drop shadow, not a collision
      if (a.text === b.text && Math.abs(a.rect.x - b.rect.x) <= 4 && Math.abs(a.rect.y - b.rect.y) <= 4) continue;
      const ia = ink(a.rect);
      const ib = ink(b.rect);
      const hit = intersect(ia, ib);
      const area = hit.w * hit.h;
      const smaller = Math.min(ia.w * ia.h, ib.w * ib.h);
      if (area <= 0 || smaller <= 0 || area < opts.minPx || area / smaller < opts.minFrac) continue;
      findings.push({ kind: 'overlap', a: a.text, b: b.text, rectA: a.rect, rectB: b.rect, frac: round2(area / smaller) });
    }
  }
  return { labels: visible.length, findings };
}
