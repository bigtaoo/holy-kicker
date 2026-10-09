import Foundation
import StoreKit

// The ad-free card for the bridge (docs/ios.md "The ad-free card (StoreKit 2)"). Ownership is
// StoreKit's, not ours: `Transaction.currentEntitlements` at every launch, `Transaction.updates`
// while the game runs (Ask to Buy approved later, a refund, a purchase on another device). No
// server: the perk is local and StoreKit checks Apple's signature on the device, so an unverified
// transaction counts for nothing. A transaction is finished once the page has been told. The page
// sees the prices and what is owned, and asks to buy or restore; how that went comes back as a result.
final class Store {

    /// What this build sells; the page names the card by the same id (platform/ios/storeKit.ts).
    static let productIds = ["com.gamestao.holykicker.adfree"]

    struct State: Equatable {
        /// displayPrice by product id, for the products StoreKit could load (none offline, or
        /// before the Paid Apps agreement is active).
        var prices: [String: String] = [:]
        /// The verified, unrevoked entitlements among productIds.
        var owned: Set<String> = []
        /// AppStore.canMakePayments: false where Screen Time blocks purchases.
        var canPay = true

        var json: [String: Any] {
            ["products": prices.keys.sorted().map { ["id": $0, "price": prices[$0] ?? ""] },
             "owned": owned.sorted(), "canPay": canPay]
        }
    }

    /// The last answer, nil until StoreKit has given one.
    private(set) var state: State?
    /// Called on the main thread whenever the state changes.
    var onChange: ((State) -> Void)?
    /// How a buy or a restore the page asked for went, on the main thread: ("buy", "owned" |
    /// "cancelled" | "pending" | "failed") or ("restore", "owned" | "none" | "cancelled" | "failed").
    /// "pending" is Ask to Buy: the answer comes later, through the state.
    var onResult: ((String, String) -> Void)?

    private var updates: Task<Void, Never>?
    private var busy = false

    deinit { updates?.cancel() }

    /// Called at launch, before the page can ask for anything.
    func start() {
        // listening first, so a transaction that lands while the entitlements are read is not missed
        updates = Task { [weak self] in
            for await result in StoreKit.Transaction.updates {
                await self?.settle(result)
            }
        }
        Task { @MainActor [weak self] in await self?.refresh(prices: true) }
    }

    /// Apple's purchase sheet for one product, only from a tap.
    func buy(_ id: String) {
        Task { @MainActor [weak self] in await self?.purchase(id) }
    }

    /// Restore purchases, only from a tap: AppStore.sync() (Apple may ask for the Apple ID's
    /// password), then the entitlements again.
    func restore() {
        Task { @MainActor [weak self] in await self?.sync() }
    }

    @MainActor
    private func purchase(_ id: String) async {
        guard !busy else { return }
        busy = true
        defer { busy = false }
        var outcome = "failed"
        do {
            if Self.productIds.contains(id), let product = try await Product.products(for: [id]).first {
                switch try await product.purchase() {
                case .success(let verification):
                    if case .verified(let tx) = verification {
                        var next = state ?? State()
                        next.owned.insert(tx.productID)
                        publish(next)
                        await tx.finish()
                        outcome = "owned"
                    }
                case .userCancelled:
                    outcome = "cancelled"
                case .pending:
                    outcome = "pending"
                @unknown default:
                    break
                }
            }
        } catch {
            outcome = "failed"
        }
        onResult?("buy", outcome)
    }

    @MainActor
    private func sync() async {
        guard !busy else { return }
        busy = true
        defer { busy = false }
        var outcome: String
        do {
            try await AppStore.sync()
            outcome = "none"
        } catch StoreKitError.userCancelled {
            outcome = "cancelled"
        } catch {
            outcome = "failed"
        }
        await refresh(prices: false)
        if state?.owned.isEmpty == false { outcome = "owned" }
        onResult?("restore", outcome)
    }

    /// A transaction StoreKit delivered outside a buy: ownership is read again whole (a refund
    /// revokes, an approval grants), then the transaction is finished.
    @MainActor
    private func settle(_ result: VerificationResult<StoreKit.Transaction>) async {
        guard case .verified(let tx) = result else { return }
        await refresh(prices: false)
        await tx.finish()
    }

    /// Reads the entitlements (and the prices at launch, or while they are missing) and publishes.
    @MainActor
    private func refresh(prices: Bool) async {
        var loaded: [String: String]?
        if prices || state?.prices.isEmpty != false, let products = try? await Product.products(for: Self.productIds) {
            loaded = Dictionary(products.map { ($0.id, $0.displayPrice) }, uniquingKeysWith: { a, _ in a })
        }
        var owned: Set<String> = []
        for await result in StoreKit.Transaction.currentEntitlements {
            if case .verified(let tx) = result, tx.revocationDate == nil, Self.productIds.contains(tx.productID) {
                owned.insert(tx.productID)
            }
        }
        var next = state ?? State()
        if let loaded { next.prices = loaded }
        next.owned = owned
        next.canPay = AppStore.canMakePayments
        publish(next)
        // the card is applied, so whatever StoreKit still holds as unfinished is done
        for await result in StoreKit.Transaction.unfinished {
            if case .verified(let tx) = result { await tx.finish() }
        }
    }

    @MainActor
    private func publish(_ next: State) {
        guard next != state else { return }
        state = next
        onChange?(next)
    }
}
