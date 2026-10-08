import GoogleMobileAds
import UIKit
import UserMessagingPlatform

// AdMob for the bridge (docs/ios.md "Ads: AdMob"): Google's consent form (UMP) once the game is on
// screen, then a rewarded ad and an interstitial kept loaded. Every request is non-personalised
// (npa=1) and the app never asks to track (no ATT prompt), as D:\funny decided. The page sees the
// state (whether ads may be requested at all, which ad is loaded, whether the privacy options are
// due) and asks for one ad at a time; how it went comes back as events.
final class AdMob: NSObject, FullScreenContentDelegate {

    enum Kind: String { case rewarded, interstitial }

    struct State: Equatable {
        /// "pending" until the consent answer is in, then "on" (ads may be requested) or "off".
        var status = "pending"
        var rewarded = false
        var interstitial = false
        /// Where Google's consent form applies (EEA/UK): settings offers it again.
        var privacyOptions = false
        /// Why the last load failed, "GADErrorDomain 3: …" (3 is no fill); nil once a load works.
        var error: String?

        var json: [String: Any] {
            ["status": status, "rewarded": rewarded, "interstitial": interstitial,
             "privacyOptions": privacyOptions, "error": error ?? NSNull()]
        }
    }

    /// Google's demo units serve test ads under any app id, and every build uses them until the
    /// listing (step 5) turns `live` on: our own units have no fill before the app is on the store.
    private static let live = false
    private static func unit(_ kind: Kind) -> String {
        switch kind {
        case .rewarded: return live ? "ca-app-pub-5437693117291100/1896010873" : "ca-app-pub-3940256099942544/1712485313"
        case .interstitial: return live ? "ca-app-pub-5437693117291100/7607502555" : "ca-app-pub-3940256099942544/4411468910"
        }
    }

    private(set) var state = State()
    /// Called on the main thread whenever the state changes.
    var onChange: ((State) -> Void)?
    /// An ad the page asked for: "started" once it is on screen, then "done" (ok: the reward was
    /// earned, for a rewarded ad), or "done" alone when it could not be shown.
    var onEvent: ((Kind, String, Bool) -> Void)?
    /// Presents the consent form and the ads.
    weak var presenter: UIViewController?

    private var started = false
    private var rewardedAd: RewardedAd?
    private var interstitialAd: InterstitialAd?
    private var loading: Set<Kind> = []
    private var failures: [Kind: Int] = [:]
    private var showing: Kind?
    private var earned = false
    private var error: String?

    /// Asks for consent where it applies, then starts the SDK. Called once the view is on screen,
    /// since the form needs a presenter in the window.
    func start() {
        let consent = ConsentInformation.shared
        consent.requestConsentInfoUpdate(with: RequestParameters()) { [weak self] error in
            DispatchQueue.main.async {
                guard let self else { return }
                guard error == nil, let presenter = self.presenter else { return self.consentSettled() }
                ConsentForm.loadAndPresentIfRequired(from: presenter) { [weak self] _ in
                    DispatchQueue.main.async { self?.consentSettled() }
                }
            }
        }
        // an answer from an earlier launch allows ads now, before the update comes back
        if consent.canRequestAds { startAds() }
    }

    /// Google's privacy options form, from the settings button.
    func showPrivacyOptions() {
        guard let presenter, presenter.presentedViewController == nil else { return }
        ConsentForm.presentPrivacyOptionsForm(from: presenter) { [weak self] _ in
            DispatchQueue.main.async { self?.consentSettled() }
        }
    }

    func show(_ kind: Kind) {
        guard showing == nil, let presenter, presenter.presentedViewController == nil else {
            onEvent?(kind, "done", false)
            return
        }
        switch kind {
        case .rewarded:
            guard let ad = rewardedAd else { return notShown(kind) }
            rewardedAd = nil
            showing = kind
            earned = false
            ad.present(from: presenter) { [weak self] in self?.earned = true }
        case .interstitial:
            guard let ad = interstitialAd else { return notShown(kind) }
            interstitialAd = nil
            showing = kind
            ad.present(from: presenter)
        }
        refresh()
    }

    // MARK: FullScreenContentDelegate

    func adWillPresentFullScreenContent(_ ad: FullScreenPresentingAd) {
        if let kind = showing { onEvent?(kind, "started", false) }
    }

    func adDidDismissFullScreenContent(_ ad: FullScreenPresentingAd) {
        // the reward is paid once the ad is gone, never while it is still on screen
        finish(ok: earned)
    }

    func ad(_ ad: FullScreenPresentingAd, didFailToPresentFullScreenContentWithError error: Error) {
        record(error)
        finish(ok: false)
    }

    // MARK: Private

    private func consentSettled() {
        if ConsentInformation.shared.canRequestAds {
            startAds()
        } else {
            // consent withdrawn from the privacy options: nothing loaded is shown any more
            rewardedAd = nil
            interstitialAd = nil
        }
        refresh()
    }

    private func startAds() {
        guard !started else { return }
        started = true
        MobileAds.shared.start(completionHandler: nil)
        load(.rewarded)
        load(.interstitial)
    }

    private func load(_ kind: Kind) {
        guard started, ConsentInformation.shared.canRequestAds, !loading.contains(kind) else { return }
        loading.insert(kind)
        Task { @MainActor [weak self] in
            do {
                switch kind {
                case .rewarded:
                    let ad = try await RewardedAd.load(with: AdMob.unit(kind), request: AdMob.request())
                    ad.fullScreenContentDelegate = self
                    self?.rewardedAd = ad
                case .interstitial:
                    let ad = try await InterstitialAd.load(with: AdMob.unit(kind), request: AdMob.request())
                    ad.fullScreenContentDelegate = self
                    self?.interstitialAd = ad
                }
                self?.loaded(kind, error: nil)
            } catch {
                self?.loaded(kind, error: error)
            }
        }
    }

    private func loaded(_ kind: Kind, error: Error?) {
        loading.remove(kind)
        if let error {
            record(error)
            // no fill is normal before the app is live: try again, backing off to five minutes
            let n = (failures[kind] ?? 0) + 1
            failures[kind] = n
            let delay = min(300.0, 15.0 * pow(2.0, Double(n - 1)))
            DispatchQueue.main.asyncAfter(deadline: .now() + delay) { [weak self] in self?.load(kind) }
        } else {
            failures[kind] = 0
            self.error = nil
        }
        refresh()
    }

    private func notShown(_ kind: Kind) {
        onEvent?(kind, "done", false)
        load(kind)
    }

    private func finish(ok: Bool) {
        guard let kind = showing else { return }
        showing = nil
        earned = false
        onEvent?(kind, "done", ok)
        load(kind)
        refresh()
    }

    private func record(_ error: Error) {
        // the code tells no fill from a wrong unit or a network failure (funny's lesson)
        let ns = error as NSError
        self.error = "\(ns.domain) \(ns.code): \(ns.localizedDescription)"
    }

    private func refresh() {
        let consent = ConsentInformation.shared
        var next = state
        next.status = consent.canRequestAds ? "on" : (consent.consentStatus == .unknown ? "pending" : "off")
        next.rewarded = rewardedAd != nil
        next.interstitial = interstitialAd != nil
        next.privacyOptions = consent.privacyOptionsRequirementStatus == .required
        next.error = error
        guard next != state else { return }
        state = next
        onChange?(next)
    }

    /// Non-personalised (npa=1): the privacy label says "no tracking", so no request asks for it.
    private static func request() -> Request {
        let request = Request()
        let extras = Extras()
        extras.additionalParameters = ["npa": "1"]
        request.register(extras)
        return request
    }
}
