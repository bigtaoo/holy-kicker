import Foundation

// The web key store's copy in UserDefaults (client/src/platform/ios/mirrorStore.ts): every key the
// game writes to localStorage is also written here, and handed back to the page at launch, so the
// save survives iOS clearing the web view's storage. Declared in PrivacyInfo.xcprivacy (CA92.1:
// read and written by this app only).
struct KeyStore {
    private static let defaultsKey = "hk.kv"
    private let defaults = UserDefaults.standard

    func all() -> [String: String] {
        return defaults.dictionary(forKey: Self.defaultsKey) as? [String: String] ?? [:]
    }

    func set(_ key: String, _ value: String) {
        var values = all()
        values[key] = value
        defaults.set(values, forKey: Self.defaultsKey)
    }
}
