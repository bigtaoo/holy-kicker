import UIKit
import Capacitor
import WebKit

// The root view controller: Capacitor's web view plus `window.HKNative`, the bridge the game reads
// through client/src/platform/ios/bridge.ts (contract in docs/ios.md). No Capacitor plugins: the
// bridge is one WKScriptMessageHandler named "hk" and one script injected at document start, as in
// D:\funny's NWBridgeViewController. SceneDelegate makes this the window's root.
//
// Calls from JS are messages `{ op, ... }`. Answers are pushed back into the page rather than
// settled by id: Game Center's and AdMob's states go to `HKNative._gameCenter` and `_adState`
// whenever they change and when the page asks (a reloaded page asks again); an ad's progress goes
// to `_adEvent`. Every member the page reads is feature-detected
// there, so a newer web bundle on an older shell falls back to the browser's behaviour.
final class HKBridgeViewController: CAPBridgeViewController, WKScriptMessageHandler {

    static let handlerName = "hk"
    /// Raised whenever the contract gains calls (HKNative.v in bridge.ts).
    static let bridgeVersion = 3

    private let keyStore = KeyStore()
    private let gameCenter = GameCenter()
    private let adMob = AdMob()

    override func capacitorDidLoad() {
        guard let webView = webView else { return }
        let ucc = webView.configuration.userContentController
        ucc.add(self, name: Self.handlerName)
        ucc.addUserScript(WKUserScript(source: bridgeScript(), injectionTime: .atDocumentStart, forMainFrameOnly: true))
        webView.scrollView.bounces = false
        gameCenter.presenter = self
        gameCenter.onChange = { [weak self] state in self?.push("_gameCenter", state.json) }
        gameCenter.start()
        adMob.presenter = self
        adMob.onChange = { [weak self] state in self?.push("_adState", state.json) }
        adMob.onEvent = { [weak self] kind, event, ok in
            self?.push("_adEvent", ["kind": kind.rawValue, "event": event, "ok": ok])
        }
        #if DEBUG
        // Safari's Web Inspector, for the day a Mac is at hand (release builds stay closed)
        if #available(iOS 16.4, *) { webView.isInspectable = true }
        #endif
    }

    private var adsStarted = false

    // Google's consent form needs a presenter that is in the window, so ads start here, once
    override func viewDidAppear(_ animated: Bool) {
        super.viewDidAppear(animated)
        guard !adsStarted else { return }
        adsStarted = true
        adMob.start()
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
        case "gameCenter":
            if let state = gameCenter.state { push("_gameCenter", state.json) }
        case "gameCenterSignIn":
            gameCenter.signIn()
        case "adState":
            push("_adState", adMob.state.json)
        case "showAd":
            guard let kind = (body["kind"] as? String).flatMap(AdMob.Kind.init(rawValue:)) else { return }
            adMob.show(kind)
        case "adPrivacy":
            adMob.showPrivacyOptions()
        default:
            return
        }
    }

    /// Hands a state or an event to the page: `HKNative[receiver](value)` in the injected script.
    private func push(_ receiver: String, _ value: [String: Any]) {
        guard let data = try? JSONSerialization.data(withJSONObject: value),
              let json = String(data: data, encoding: .utf8) else { return }
        webView?.evaluateJavaScript("window.HKNative && window.HKNative.\(receiver) && window.HKNative.\(receiver)(\(json))")
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
          // a value the shell pushes, kept for late readers, and who to tell
          function feed(){
            var last = null, cbs = [];
            return {
              get: function(){ return last; },
              on: function(cb){ cbs.push(cb); },
              push: function(v){ last = v; for (var i = 0; i < cbs.length; i++) { try { cbs[i](v); } catch (e) {} } }
            };
          }
          var gc = feed(), ad = feed(), adEvent = feed();
          window.HKNative = {
            v: c.v, saved: c.saved || {}, languages: c.languages || [], device: c.device || '',
            save: function(k, v){ post({ op: 'save', key: String(k), value: String(v) }); },
            openUrl: function(u){ post({ op: 'openUrl', url: String(u) }); },
            gameCenter: gc.get,
            onGameCenter: gc.on,
            gameCenterSignIn: function(){ post({ op: 'gameCenterSignIn' }); },
            adState: ad.get,
            onAdState: ad.on,
            onAdEvent: adEvent.on,
            showAd: function(kind){ post({ op: 'showAd', kind: String(kind) }); },
            adPrivacy: function(){ post({ op: 'adPrivacy' }); },
            _gameCenter: gc.push,
            _adState: ad.push,
            _adEvent: adEvent.push
          };
          post({ op: 'gameCenter' });
          post({ op: 'adState' });
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
