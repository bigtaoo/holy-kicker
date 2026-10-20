// Types for iosApp.mjs, which client/src/platform/ios/iosApp.test.ts imports.

export interface AdMobIds {
  app: string;
  rewarded: string;
  interstitial: string;
}

/** One app of client/src/platform/ios/apps.json. */
export interface IosApp {
  bundleId: string;
  name: string;
  homeName: string;
  homeNameZh: string;
  version: string;
  adFree: string;
  adMob: AdMobIds | null;
  ota: string;
  profile: string;
  background: string;
  icon: string;
}

export const IOS_FILES: Record<'pbx' | 'plist' | 'zhStrings' | 'adMob' | 'store' | 'launch' | 'capConfig', string>;
export const ICON: string;
export const TEST_ADMOB: AdMobIds;
export function patchIos(texts: Record<string, string>, from: IosApp, to: IosApp): Record<string, string>;
