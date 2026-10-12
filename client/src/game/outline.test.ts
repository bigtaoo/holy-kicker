import { describe, expect, it } from 'vitest';
import type { SheetMeta } from './mobAnim';
import { paddedMeta, rimOffsets } from './outline';

const META: SheetMeta = { frames: 2, flash: 2, cols: 2, frameW: 100, frameH: 200, fps: 10, anchor: [50, 190], height: 160, lift: [0, 4] };

describe('outline', () => {
  it('pads every frame and keeps the feet on the drawing', () => {
    const m = paddedMeta(META, 7);
    expect(m).toMatchObject({ frameW: 114, frameH: 214, anchor: [57, 197], height: 160, lift: [0, 4] });
  });

  it('stamps a ring exactly the rim width out', () => {
    const ring = rimOffsets(7, 12);
    expect(ring).toHaveLength(12);
    for (const [x, y] of ring) expect(Math.hypot(x, y)).toBeCloseTo(7);
  });
});
