import { describe, expect, it } from 'vitest';
import workflow from '../../../../.github/workflows/release-ios.yml?raw';
import capConfig from '../../../capacitor.config.ts?raw';
import indexHtml from '../../../index.html?raw';
import podfile from '../../../ios/App/Podfile?raw';
import pbx from '../../../ios/App/App.xcodeproj/project.pbxproj?raw';
import plist from '../../../ios/App/App/Info.plist?raw';
import bridge from '../../../ios/App/App/HKBridgeViewController.swift?raw';
import adMob from '../../../ios/App/App/AdMob.swift?raw';
import entitlements from '../../../ios/App/App/App.entitlements?raw';
import gameCenter from '../../../ios/App/App/GameCenter.swift?raw';
import privacy from '../../../ios/App/App/PrivacyInfo.xcprivacy?raw';
import sceneDelegate from '../../../ios/App/App/SceneDelegate.swift?raw';
import storeSwift from '../../../ios/App/App/Store.swift?raw';
import storyboard from '../../../ios/App/App/Base.lproj/Main.storyboard?raw';
import { AD_FREE_ID } from './storeKit';

// Nothing on the Windows machine compiles the Swift side (only the macOS CI runner does), so these
// pin the native project to the web side as text: the names both sides must agree on, and the
// settings a review or a device test would otherwise be the first to catch (docs/ios.md).

const BUNDLE = 'com.gamestao.holykicker';

describe('iOS shell', () => {
  it('names one bundle id everywhere', () => {
    expect(capConfig).toContain(`appId: '${BUNDLE}'`);
    expect(pbx.match(/PRODUCT_BUNDLE_IDENTIFIER = ([^;]+);/g)).toEqual([
      `PRODUCT_BUNDLE_IDENTIFIER = ${BUNDLE};`,
      `PRODUCT_BUNDLE_IDENTIFIER = ${BUNDLE};`,
    ]);
    expect(workflow).toContain(`BUNDLE_ID: ${BUNDLE}`);
    // the account's certificate (D:\cloud\ios): funny's workflow names the retired iPhone one
    expect(workflow).toContain('CODE_SIGN_IDENTITY="Apple Distribution"');
  });

  it('compiles every Swift file and ships the privacy manifest', () => {
    for (const file of ['AppDelegate.swift', 'SceneDelegate.swift', 'HKBridgeViewController.swift', 'KeyStore.swift', 'GameCenter.swift', 'AdMob.swift', 'Store.swift']) {
      expect(pbx).toContain(`/* ${file} in Sources */,`);
    }
    expect(pbx).toContain('/* PrivacyInfo.xcprivacy in Resources */,');
    expect(privacy).toContain('<string>CA92.1</string>');
  });

  it('roots the window in the bridge view controller', () => {
    expect(sceneDelegate).toContain('rootViewController = HKBridgeViewController()');
    expect(storyboard).toContain('customClass="HKBridgeViewController" customModule="App"');
  });

  it('injects the members bridge.ts reads, through the handler it posts to', () => {
    expect(bridge).toContain('static let handlerName = "hk"');
    expect(bridge).toContain('window.HKNative = {');
    for (const member of ['saved:', 'languages:', 'device:', 'save: function', 'openUrl: function']) expect(bridge).toContain(member);
    for (const member of [
      'gameCenter: gc.get', 'onGameCenter: gc.on', 'gameCenterSignIn: function', '_gameCenter: gc.push',
      'adState: ad.get', 'onAdState: ad.on', 'onAdEvent: adEvent.on', 'showAd: function', 'adPrivacy: function',
      '_adState: ad.push', '_adEvent: adEvent.push',
      'store: store.get', 'onStore: store.on', 'onStoreResult: storeResult.on', 'buy: function', 'restore: function',
      '_store: store.push', '_storeResult: storeResult.push',
    ]) {
      expect(bridge).toContain(member);
    }
    // the page asks for the states as it loads, and the shell pushes them back by name
    expect(bridge).toContain("post({ op: 'gameCenter' });");
    expect(bridge).toContain("post({ op: 'adState' });");
    expect(bridge).toContain("post({ op: 'store' });");
    for (const op of ['"gameCenter"', '"gameCenterSignIn"', '"adState"', '"showAd"', '"adPrivacy"', '"store"', '"buy"', '"restore"']) {
      expect(bridge).toContain(`case ${op}:`);
    }
    for (const receiver of ['_gameCenter', '_adState', '_adEvent', '_store', '_storeResult']) expect(bridge).toContain(`push("${receiver}"`);
    expect(bridge).toContain('window.HKNative.\\(receiver)(');
    expect(gameCenter).toContain('"alias": alias ?? NSNull(), "canSignIn": canSignIn');
    // admob.ts reads these keys and these values
    for (const key of ['"status": status', '"rewarded": rewarded', '"interstitial": interstitial', '"privacyOptions": privacyOptions', '"error": error']) {
      expect(adMob).toContain(key);
    }
    expect(adMob).toContain('enum Kind: String { case rewarded, interstitial }');
    for (const event of ['"started"', '"done"']) expect(adMob).toContain(event);
    expect(bridge).toContain('"kind": kind.rawValue, "event": event, "ok": ok');
    // storeKit.ts reads these keys and these outcomes
    expect(storeSwift).toContain('["id": $0, "price": prices[$0] ?? ""]');
    expect(storeSwift).toContain('"owned": owned.sorted(), "canPay": canPay');
    expect(bridge).toContain('["op": op, "outcome": outcome]');
    for (const outcome of ['"owned"', '"cancelled"', '"pending"', '"failed"', '"none"']) expect(storeSwift).toContain(outcome);
  });

  it('sells the ad-free card with StoreKit 2, trusting only verified, unrevoked entitlements', () => {
    expect(storeSwift).toContain(`static let productIds = ["${AD_FREE_ID}"]`);
    expect(storeSwift).toContain('StoreKit.Transaction.currentEntitlements');
    expect(storeSwift).toContain('tx.revocationDate == nil');
    // refunds, Ask to Buy and purchases elsewhere arrive here, listened to from launch
    expect(storeSwift).toContain('for await result in StoreKit.Transaction.updates');
    expect(bridge.split('override func capacitorDidLoad')[1].split('override func')[0]).toContain('store.start()');
    expect(storeSwift).toContain('try await AppStore.sync()');
    // an unverified transaction never grants and is never finished
    expect(storeSwift).not.toContain('.unverified');
    expect(storeSwift.match(/await tx\.finish\(\)/g)?.length).toBe(3);
  });

  it('signs in to Game Center with the entitlement, and never shows the sheet unasked', () => {
    expect(entitlements).toMatch(/<key>com\.apple\.developer\.game-center<\/key>\s*<true\/>/);
    expect(pbx.match(/CODE_SIGN_ENTITLEMENTS = ([^;]+);/g)).toEqual([
      'CODE_SIGN_ENTITLEMENTS = App/App.entitlements;',
      'CODE_SIGN_ENTITLEMENTS = App/App.entitlements;',
    ]);
    expect(gameCenter).toContain('GKLocalPlayer.local.authenticateHandler');
    // the one present() is signIn()'s, which only a tap reaches
    expect(gameCenter.match(/\.present\(/g)).toHaveLength(1);
    expect(gameCenter.split('func signIn()')[1]).toContain('.present(');
  });

  it("serves AdMob non-personalised, without asking to track, after Google's consent", () => {
    expect(podfile).toMatch(/pod 'Google-Mobile-Ads-SDK', '~> \d+\.\d+'/);
    expect(podfile).toMatch(/pod 'GoogleUserMessagingPlatform', '~> \d+\.\d+'/);
    expect(plist).toMatch(/<key>GADApplicationIdentifier<\/key>\s*<string>ca-app-pub-\d+~\d+<\/string>/);
    // our own units belong to the app id's publisher, and the listing serves them
    const publisher = plist.match(/ca-app-pub-(\d+)~\d+/)?.[1];
    expect(adMob.match(/live \? "ca-app-pub-(\d+)\//g)).toEqual([`live ? "ca-app-pub-${publisher}/`, `live ? "ca-app-pub-${publisher}/`]);
    expect(adMob).toContain('private static let live = true');
    expect(plist.match(/<key>SKAdNetworkIdentifier<\/key>/g)?.length).toBeGreaterThan(40);
    expect(plist).not.toContain('<key>NSUserTrackingUsageDescription</key>');
    expect(adMob).not.toContain('ATTrackingManager');
    expect(adMob).toContain('extras.additionalParameters = ["npa": "1"]');
    // no ad is requested before Google's consent allows it
    expect(adMob.split('private func load(')[1].split('Task')[0]).toContain('ConsentInformation.shared.canRequestAds');
    expect(bridge.split('override func viewDidAppear')[1]).toContain('adMob.start()');
  });

  it('is an iPhone game in portrait, full screen, without the status bar', () => {
    expect(pbx.match(/TARGETED_DEVICE_FAMILY = ([^;]+);/g)).toEqual(['TARGETED_DEVICE_FAMILY = 1;', 'TARGETED_DEVICE_FAMILY = 1;']);
    const orientations = plist.split('<key>UISupportedInterfaceOrientations</key>')[1].split('</array>')[0];
    expect(orientations.match(/UIInterfaceOrientation\w+/g)).toEqual(['UIInterfaceOrientationPortrait']);
    expect(plist).not.toContain('UISupportedInterfaceOrientations~ipad');
    expect(plist).toMatch(/<key>UIRequiresFullScreen<\/key>\s*<true\/>/);
    expect(plist).toMatch(/<key>UIStatusBarHidden<\/key>\s*<true\/>/);
    // SystemBars would show the status bar again at load, and it owns the home indicator
    expect(capConfig).toContain('SystemBars: { hidden: true }');
    expect(bridge).not.toContain('prefersHomeIndicatorAutoHidden');
    expect(plist).toMatch(/<key>ITSAppUsesNonExemptEncryption<\/key>\s*<false\/>/);
  });

  it('keeps the deployment target at iOS 15 in the Podfile and the project', () => {
    expect(podfile).toContain("platform :ios, '15.0'");
    expect([...pbx.matchAll(/IPHONEOS_DEPLOYMENT_TARGET = ([^;]+);/g)].map((m) => m[1])).toEqual(['15.0', '15.0', '15.0', '15.0']);
  });

  it('lets the page own the safe area', () => {
    expect(capConfig).toContain("contentInset: 'never'");
    expect(indexHtml).toContain('viewport-fit=cover');
  });
});
