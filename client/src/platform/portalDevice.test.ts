import { describe, expect, it } from 'vitest';
import { portalDevice } from './portalDevice';
import type { DeviceInfo } from '../game/quality';

const base: DeviceInfo = { mobile: false, tablet: false, apple: false, cores: 8, memoryGB: 8, gpu: '', modelLevel: 0 };
const ipad: DeviceInfo = { ...base, mobile: true, tablet: true, apple: true };

describe('portalDevice', () => {
  it('takes the tablets and phones a portal knows', () => {
    expect(portalDevice(base, 'tablet')).toMatchObject({ mobile: true, tablet: true });
    expect(portalDevice(base, 'mobile')).toMatchObject({ mobile: true, tablet: false });
  });

  it("keeps an iPad an iPad when the portal calls it a desktop", () => {
    expect(portalDevice(ipad, 'desktop')).toEqual(ipad);
    expect(portalDevice(base, 'desktop')).toEqual(base);
    expect(portalDevice(ipad, null)).toEqual(ipad);
  });
});
