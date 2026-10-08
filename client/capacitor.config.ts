import type { CapacitorConfig } from '@capacitor/cli';

// The iOS shell (docs/ios.md): the web build in Capacitor's WKWebView. `npm run build:ios` writes
// dist-ios/, `npx cap sync ios` copies it into ios/App/App/public and runs pod install (macOS
// only; CI does both, .github/workflows/release-ios.yml).
//
// Everything native is ours, not Capacitor plugins (bar SystemBars, built into the core):
// HKBridgeViewController injects window.HKNative (src/platform/ios/bridge.ts). This file is compiled into the shell, so a change
// here needs a new binary.
const config: CapacitorConfig = {
  appId: 'com.gamestao.holykicker',
  appName: 'Holy Kicker',
  webDir: 'dist-ios',
  ios: {
    // 'never': the page keeps the whole screen and env(safe-area-inset-*) reports the real notch
    // and home-indicator bands, which WebPlatform.safeInsets() reads. 'always' insets the web view
    // natively and makes env() read 0 (funny, IOS_RELEASE / capacitor.config.ts).
    contentInset: 'never',
    // the game's own background, so there is no white flash before the first frame
    backgroundColor: '#141816',
    scrollEnabled: false,
  },
  plugins: {
    // Core's SystemBars owns the status bar and the home indicator: at load it shows both unless
    // `hidden`, undoing Info.plist's UIStatusBarHidden, and its extension on CAPBridgeViewController
    // answers prefersHomeIndicatorAutoHidden (not open, so the bridge cannot override it).
    SystemBars: { hidden: true },
  },
};

export default config;
