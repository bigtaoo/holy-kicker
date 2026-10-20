import { describe, expect, it } from 'vitest';
import { IOS_FILES, patchIos, TEST_ADMOB, type IosApp } from '../../../../build/iosApp.mjs';
import pbx from '../../../ios/App/App.xcodeproj/project.pbxproj?raw';
import plist from '../../../ios/App/App/Info.plist?raw';
import zhStrings from '../../../ios/App/App/zh-Hans.lproj/InfoPlist.strings?raw';
import adMob from '../../../ios/App/App/AdMob.swift?raw';
import store from '../../../ios/App/App/Store.swift?raw';
import launch from '../../../ios/App/App/Base.lproj/LaunchScreen.storyboard?raw';
import capConfig from '../../../capacitor.config.ts?raw';
import releaseCorgi from '../../../../.github/workflows/release-ios-corgi.yml?raw';
import APPS from './apps.json';

// The committed shell is Holy Kicker's; the corgi app is it with apps.json's corgi values written
// over (build/iosApp.mjs, docs/ios.md "Second app: Corgi Commando").

const apps = APPS as Record<'monk' | 'corgi', IosApp>;
const F = IOS_FILES;
const texts = { [F.pbx]: pbx, [F.plist]: plist, [F.zhStrings]: zhStrings, [F.adMob]: adMob, [F.store]: store, [F.launch]: launch, [F.capConfig]: capConfig };

describe('iOS apps', () => {
  it('commits the shell as Holy Kicker, exactly as apps.json says', () => {
    // every edit finds its anchor, and writing monk over monk changes nothing
    expect(patchIos(texts, apps.monk, apps.monk)).toEqual(texts);
  });

  const corgi = patchIos(texts, apps.monk, apps.corgi);

  it("writes the corgi's values and leaves none of Holy Kicker's", () => {
    for (const text of Object.values(corgi)) {
      expect(text).not.toContain('holykicker');
      expect(text).not.toContain('Holy Kicker');
      expect(text).not.toContain('5437693117291100');
    }
    expect(corgi[F.pbx].match(/PRODUCT_BUNDLE_IDENTIFIER = ([^;]+);/g)).toEqual([
      'PRODUCT_BUNDLE_IDENTIFIER = com.gamestao.corgi;',
      'PRODUCT_BUNDLE_IDENTIFIER = com.gamestao.corgi;',
    ]);
    expect(corgi[F.plist]).toMatch(/<key>CFBundleDisplayName<\/key>\s*<string>Commando<\/string>/);
    expect(corgi[F.zhStrings]).toContain('"CFBundleDisplayName" = "柯基突击队";');
    expect(corgi[F.store]).toContain('static let productIds = ["com.gamestao.corgi.adfree"]');
    expect(corgi[F.launch]).toContain('key="backgroundColor" red="0.0627" green="0.0706" blue="0.1647"');
    expect(corgi[F.capConfig]).toContain("appId: 'com.gamestao.corgi'");
  });

  it("runs Google's test ads until the corgi's own units exist", () => {
    if (apps.corgi.adMob) {
      expect(corgi[F.adMob]).toContain('private static let live = true');
      return;
    }
    expect(corgi[F.adMob]).toContain('private static let live = false');
    expect(corgi[F.plist]).toContain(`<string>${TEST_ADMOB.app}</string>`);
    expect(corgi[F.adMob]).toContain(`live ? "${TEST_ADMOB.rewarded}"`);
  });

  it('keeps each app on its own bundle id, profile and update host', () => {
    expect(new Set(Object.values(apps).map((a) => a.bundleId)).size).toBe(2);
    expect(new Set(Object.values(apps).map((a) => a.ota)).size).toBe(2);
    expect(apps.corgi.adFree.startsWith(`${apps.corgi.bundleId}.`)).toBe(true);
    expect(releaseCorgi).toContain('theme: corgi');
  });
});
