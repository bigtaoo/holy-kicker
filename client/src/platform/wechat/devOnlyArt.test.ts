import { describe, expect, it } from 'vitest';
import { DEFAULT_SCENE } from '../../game/scene';
import DEV_ONLY from './devOnlyArt.json';

// The WeChat build leaves these out of the package (vite.wechat.config.js): only dev scene
// switches (?ground=earth, ?face=white) draw them, and the WeChat entry always plays DEFAULT_SCENE.
describe('the art left out of the WeChat package', () => {
  it('is never drawn by the default scene', () => {
    expect(DEV_ONLY).not.toContain(`art/ground/${DEFAULT_SCENE.ground}.png`);
    // a soft face swaps jiangshi.png for jiangshi_soft.png (art.ts loadArt)
    expect(DEFAULT_SCENE.softFace).toBe(true);
  });
});
