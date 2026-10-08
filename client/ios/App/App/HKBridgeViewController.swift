import UIKit
import Capacitor
import WebKit

// The root view controller: Capacitor's web view plus `window.HKNative`, the bridge the game reads
// through client/src/platform/ios/bridge.ts (contract in docs/ios.md). No Capacitor plugins: the
// bridge is one WKScriptMessageHandler named "hk" and one script injected at document start, as in
// D:\funny's NWBridgeViewController. SceneDelegate makes this the window's root.
//
// Calls from JS are messages `{ op, ... }`; nothing in this version answers back, so there is no
// promise registry yet. Every member the page reads is feature-detected there, so a newer web
// bundle on an older shell falls back to the browser's behaviour.
final class HKBridgeViewController: CAPBridgeViewController, WKScriptMessageHandler {

    static let handlerName = "hk"
    /// Raised whenever the contract gains calls (HKNative.v in bridge.ts).
    static let bridgeVersion = 1

    private let keyStore = KeyStore()

    override func capacitorDidLoad() {
        guard let webView = webView else { return }
        let ucc = webView.configuration.userContentController
        ucc.add(self, name: Self.handlerName)
        ucc.addUserScript(WKUserScript(source: bridgeScript(), injectionTime: .atDocumentStart, forMainFrameOnly: true))
        webView.scrollView.bounces = false
        #if DEBUG
        // Safari's Web Inspector, for the day a Mac is at hand (release builds stay closed)
        if #available(iOS 16.4, *) { webView.isInspectable = true }
        #endif
    }

    // A drag on the stick that reaches the bottom edge must not send the game home: the first
    // swipe there only shows the home indicator, which stays hidden while playing (that one is
    // SystemBars' `hidden` in capacitor.config.ts; Capacitor's own extension answers it).
    override var preferredScreenEdgesDeferringSystemGestures: UIRectEdge { .bottom }

    // MARK: WKScriptMessageHandler

    func userContentController(_ userContentController: WKUserContentController, didReceive message: WKScriptMessage) {
        guard message.name == Self.handlerName, let body = message.body as? [String: Any] else { return }
        switch body["op"] as? String {
        case "save":
            guard let key = body["key"] as? String, let value = body["value"] as? String else { return }
            keyStore.set(key, value)
        case "openUrl":
            // only web pages (the privacy policy); never our own scheme or another app's
            guard let text = body["url"] as? String, let url = URL(string: text),
                  url.scheme == "https" || url.scheme == "http" else { return }
            UIApplication.shared.open(url)
        default:
            return
        }
    }

    // MARK: The injected script

    private func bridgeScript() -> String {
        let config: [String: Any] = [
            "v": Self.bridgeVersion,
            "saved": keyStore.all(),
            "languages": Locale.preferredLanguages,
            "device": Self.deviceLine(),
        ]
        let json = (try? JSONSerialization.data(withJSONObject: config)).flatMap { String(data: $0, encoding: .utf8) } ?? "{}"
        return """
        (function(){
          if (window.HKNative) return;
          var c = \(json);
          function post(m){ try { window.webkit.messageHandlers.\(Self.handlerName).postMessage(m); } catch (e) {} }
          window.HKNative = {
            v: c.v, saved: c.saved || {}, languages: c.languages || [], device: c.device || '',
            save: function(k, v){ post({ op: 'save', key: String(k), value: String(v) }); },
            openUrl: function(u){ post({ op: 'openUrl', url: String(u) }); }
          };
        })();
        """
    }

    /// The model identifier and system for problem reports, e.g. "iPhone15,2 iOS 18.1".
    private static func deviceLine() -> String {
        var info = utsname()
        uname(&info)
        let model = withUnsafeBytes(of: info.machine) { raw in
            String(decoding: raw.prefix(while: { $0 != 0 }), as: UTF8.self)
        }
        return "\(model) iOS \(UIDevice.current.systemVersion)"
    }
}
