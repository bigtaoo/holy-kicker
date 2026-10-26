import type { DeviceInfo } from '../game/quality';

/**
 * The portal's device type over the user agent's guess: a portal knows tablets the user agent
 * hides, but its "desktop" never undoes an iPad the touch points gave away (iPadOS passes for a
 * Mac, and a portal taking it for one would show the keyboard hints to a player with no keys).
 */
export function portalDevice(info: DeviceInfo, type: string | null): DeviceInfo {
  if (type === 'tablet') return { ...info, mobile: true, tablet: true };
  if (type === 'mobile') return { ...info, mobile: true };
  return info;
}
