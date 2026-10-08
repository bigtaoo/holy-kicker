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
import storyboard from '../../../ios/App/App/Base.lproj/Main.storyboard?raw';

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
    for (const file of ['AppDelegate.swift', 'SceneDelegate.swift', 'HKBridgeViewController.swift', 'KeyStore.swift', 'GameCenter.swift', 'AdMob.swift']) {
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
    ]) {
      expect(bridge).toContain(member);
    }
    // the page asks for the states as it loads, and the shell pushes them back by name
    expect(bridge).toContain("post({ op: 'gameCenter' });");
    expect(bridge).toContain("post({ op: 'adState' });");
    for (const op of ['"gameCenter"', '"gameCenterSignIn"', '"adState"', '"showAd"', '"adPrivacy"']) expect(bridge).toContain(`case ${op}:`);
    for (const receiver of ['_gameCenter', '_adState', '_adEvent']) expect(bridge).toContain(`push("${receiver}"`);
    expect(bridge).toContain('window.HKNative.\\(receiver)(');
    expect(gameCenter).toContain('"alias": alias ?? NSNull(), "canSignIn": canSignIn');
    // admob.ts reads these keys and these values
    for (const key of ['"status": status', '"rewarded": rewarded', '"interstitial": interstitial', '"privacyOptions": privacyOptions', '"error": error']) {
      expect(adMob).toContain(key);
    }
    expect(adMob).toContain('enum Kind: String { case rewarded, interstitial }');
    for (const event of ['"started"', '"done"']) expect(adMob).toContain(event);
    expect(bridge).toContain('"kind": kind.rawValue, "event": event, "ok": ok');
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
