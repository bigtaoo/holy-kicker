import UIKit
import UserNotifications

// Local notifications for the bridge (docs/ios.md "Reminders"): the patrol is full, today's daily
// is ready. Nothing is asked at launch: the game asks from a tap of its own (a card after a run,
// or settings), through ask(). The texts come from the page, already in the player's language;
// the shell only books, replaces and cancels them by id. Nothing is shown while the game is open
// (no foreground presentation), which is what a reminder is for.
final class Notifications {

    enum Status: String {
        /// Never asked: the system sheet can still be shown.
        case unknown
        case on
        /// Refused, or turned off in Settings; only Settings can turn it back on.
        case off
    }

    /// The last answer, nil until the system has given one.
    private(set) var status: Status?
    /// Called on the main thread whenever the status changes.
    var onChange: ((Status) -> Void)?

    private let center = UNUserNotificationCenter.current()

    func start() {
        refresh()
        // the player may have changed it in Settings while the game was away
        NotificationCenter.default.addObserver(forName: UIApplication.didBecomeActiveNotification, object: nil, queue: .main) { [weak self] _ in
            self?.refresh()
        }
    }

    func refresh() {
        center.getNotificationSettings { [weak self] settings in
            let status: Status
            switch settings.authorizationStatus {
            case .notDetermined: status = .unknown
            case .denied: status = .off
            default: status = .on
            }
            DispatchQueue.main.async { self?.publish(status) }
        }
    }

    /// Shows the system's permission sheet (once in the app's life; after that it answers at once).
    func ask() {
        center.requestAuthorization(options: [.alert, .sound]) { [weak self] _, _ in
            DispatchQueue.main.async {
                guard let self else { return }
                // the page waits for an answer even when nothing changed
                self.status = nil
                self.refresh()
            }
        }
    }

    /// Books a notification at `at` (ms since 1970), replacing one with the same id. Only when on.
    func schedule(id: String, at: Double, title: String, body: String) {
        let seconds = at / 1000 - Date().timeIntervalSince1970
        guard status == .on, seconds > 0, !id.isEmpty else { return }
        let content = UNMutableNotificationContent()
        content.title = title
        content.body = body
        content.sound = .default
        let trigger = UNTimeIntervalNotificationTrigger(timeInterval: max(1, seconds), repeats: false)
        center.removePendingNotificationRequests(withIdentifiers: [id])
        center.add(UNNotificationRequest(identifier: id, content: content, trigger: trigger))
    }

    func cancel(id: String) {
        center.removePendingNotificationRequests(withIdentifiers: [id])
    }

    private func publish(_ next: Status) {
        guard next != status else { return }
        status = next
        onChange?(next)
    }
}
