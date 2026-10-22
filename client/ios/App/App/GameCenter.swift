import GameKit
import UIKit

// Game Center for the bridge (docs/ios.md "Game Center"): the player's nickname for the boards,
// and the signed identity the cloud save keys a player's slot on (bridge v5).
// Authentication starts at launch, so a player signed in to Game Center in Settings is signed in
// silently. When Apple hands back its sign-in sheet instead, it is kept and never shown at launch:
// the game offers it from a tap (settings), through signIn().
final class GameCenter {

    struct State: Equatable {
        /// GKLocalPlayer.alias, the nickname the player chose (displayName can be a real name).
        let alias: String?
        /// Whether Apple's sign-in sheet is waiting for a tap.
        let canSignIn: Bool

        var json: [String: Any] { ["alias": alias ?? NSNull(), "canSignIn": canSignIn] }
    }

    /// The last answer, nil until GameKit has given one.
    private(set) var state: State?
    /// Called on the main thread whenever the state changes.
    var onChange: ((State) -> Void)?
    /// Presents the sign-in sheet.
    weak var presenter: UIViewController?

    private var signInSheet: UIViewController?

    func start() {
        // GameKit calls this again whenever the account changes (signed in or out in Settings
        // while the game was in the background, or after the sheet)
        GKLocalPlayer.local.authenticateHandler = { [weak self] sheet, _ in
            DispatchQueue.main.async {
                guard let self else { return }
                self.signInSheet = sheet
                let player = GKLocalPlayer.local
                let alias = player.isAuthenticated && !player.alias.isEmpty ? player.alias : nil
                self.publish(State(alias: alias, canSignIn: alias == nil && sheet != nil))
            }
        }
    }

    /// Shows Apple's sign-in sheet, only ever from a tap. Its outcome comes back through the
    /// handler; with no sheet to show, the current state is published again so the page settles.
    func signIn() {
        guard let sheet = signInSheet, let presenter, presenter.presentedViewController == nil else {
            if let state { onChange?(state) }
            return
        }
        signInSheet = nil
        presenter.present(sheet, animated: true)
    }

    /// Game Center's identity signature for the cloud save (docs/cloud-save.md "iOS: Game Center"):
    /// the player ids, the bundle id, the URL of Apple's key, the signature and the salt (base64)
    /// and the timestamp; `ok` false when no player is signed in or GameKit failed. The server
    /// checks it, so nothing here is trusted on the page's word.
    func identity(_ done: @escaping ([String: Any]) -> Void) {
        let player = GKLocalPlayer.local
        guard player.isAuthenticated else {
            done(["ok": false])
            return
        }
        player.fetchItems(forIdentityVerificationSignature: { url, signature, salt, timestamp, error in
            DispatchQueue.main.async {
                guard error == nil, let url, let signature, let salt else {
                    done(["ok": false])
                    return
                }
                done([
                    "ok": true,
                    "player": player.teamPlayerID,
                    "alt": player.gamePlayerID,
                    "bundle": Bundle.main.bundleIdentifier ?? "",
                    "key": url.absoluteString,
                    "sig": signature.base64EncodedString(),
                    "salt": salt.base64EncodedString(),
                    "ts": timestamp,
                ])
            }
        })
    }

    private func publish(_ next: State) {
        guard next != state else { return }
        state = next
        onChange?(next)
    }
}
