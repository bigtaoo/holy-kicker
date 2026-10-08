import { describe, expect, it } from 'vitest';
import workflow from '../../../../.github/workflows/release-ios.yml?raw';
import capConfig from '../../../capacitor.config.ts?raw';
import indexHtml from '../../../index.html?raw';
import podfile from '../../../ios/App/Podfile?raw';
import pbx from '../../../ios/App/App.xcodeproj/project.pbxproj?raw';
import plist from '../../../ios/App/App/Info.plist?raw';
import bridge from '../../../ios/App/App/HKBridgeViewController.swift?raw';
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
    for (const file of ['AppDelegate.swift', 'SceneDelegate.swift', 'HKBridgeViewController.swift', 'KeyStore.swift']) {
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
