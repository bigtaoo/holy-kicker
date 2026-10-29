# Saves that survive: older builds and the cloud save

A full journey takes about 60 days, so a lost save loses a player. This page covers two
things: no build may destroy a save it cannot fully read, and a player without a portal
account can carry their save to a new device.

## Older builds

A save can be read by a build older than the one that wrote it:

- an iOS hot update rolled back (`docs/ios.md` "Hot updates"), or the shell's bundled web layer
  starting before the downloaded one;
- a portal still serving an older upload (CrazyGames, Playgama, WeChat review lag) while
  another portal or the same player's other device runs a newer one;
- a portal's cloud copy (the CrazyGames data module, Playgama Bridge storage) written by a newer
  build on another device;
- the cloud save below.

`parseSave` reads every save in this build's terms: arrays cut to `BALANCE.chapters`, the
items, evolutions and relics it knows, bit fields to its width. That is right for playing and
wrong for writing back. So `SaveStore` (`client/src/meta/saveStore.ts`), which every host's
store goes through, follows three rules:

1. **A newer version is never written over.** A stored save whose `version` is above
   `SAVE_VERSION` is played from memory: the session works, its progress is kept in memory
   (a reload within the session, such as a CrazyGames sign-in, still sees it) and the stored
   text stays as it was. `SaveStore.readOnly` says so.
2. **The same version keeps what it cannot read.** Each write goes through `keep`
   (`client/src/meta/saveKeep.ts`): a value this build did not change goes back exactly as
   stored (a cleared count above this build's chapters, a longer array, an unknown key, a gear
   item it does not know); a changed value goes back as changed, plus the stored array's tail
   past this build's length, the stored object's unknown keys and, in a bit field, the stored
   bits this build cut off. The codex is a set: unknown evolutions stay next to new ones.
   An older version is upgraded instead: its unknown keys are fields a later build retired.
3. **A broken main copy is not written over blind.** Text that is not a JSON object is set
   aside under `hk.save.broken` (once) and the last good copy, `hk.save.bak`, is read instead
   (`SaveStore.restored`). The backup is the save as it read at launch, then follows the save
   at most every 5 minutes (`BACKUP_EVERY_MS`), so a bad write cannot reach both at once.

Bit fields used to be clamped (`min(value, all bits)`), so a newer build's extra achievement,
monk or chest read as every one claimed; they are masked now.

Every store is covered by `client/src/platform/saveStores.test.ts`: web localStorage, the
reskin's prefixed keys, the iOS mirror store (localStorage plus UserDefaults), WeChat storage,
the CrazyGames data module and Playgama Bridge storage (which reads its keys once at boot, so
the backup keys are in its list).

What this does not cover: a newer build that changes what an existing field means without
raising `SAVE_VERSION`. Raise the version whenever a field's meaning changes.

## The cloud save

CrazyGames and Playgama keep the save in their own cloud (their data modules), so a signed-in
player there already carries it between devices. Everywhere else the save lives on one device:
the web build at h.gamestao.com, the iOS apps and, later, WeChat (offline for now: its request
whitelist needs an ICP-filed domain; no `wx.login` id is used yet, so it will start as a slot per
device). The cloud save gives those players a copy on the backend that another device pulls in.

**The player never sees it.** There is no button, no code and no status line: settings has no
cloud rows (the "Account & data" panel holds only play data and the play ID). A sync that fails
says nothing and waits for the next chance.

### A slot and its key

The backend keeps one **slot** per player: the save as text, its revision and its version. A slot
is reached by a secret of 12 Crockford base-32 characters (60 bits), the server's "restore code"
(the name stays on the wire). The device makes it and keeps it as `hk.cloud` beside the save (on
iOS it is mirrored into UserDefaults with the save; the corgi keeps its own under `corgi:`). It is
never shown, and it is not the play ID (`hk.install`, shown in settings and quoted in problem
reports): knowing the play ID gives no way into the slot. The key never goes into a URL (every
call is a POST with a JSON body) and the lookups are rate limited per address; at 6 a minute,
finding any one of a million slots by guessing takes some 350,000 years from one address.

`CloudSync` (`client/src/net/cloudSync.ts`) runs a **pass** at launch, as the game goes to the
background (at most once a minute) and when the host's account signs in:

1. With a host account (Game Center, below) whose player is not the one `hk.cloud.gc` names, it
   asks for that player's slot (`gc`, made when there is none). When that is not the slot the
   device has, the device's own slot is synced first, so what it held is in the save, and then
   the device switches to the account's slot.
2. With no slot yet, it makes one of the device's own (`new`).
3. It reads the slot, merges it with the save (below), puts a changed save in play and writes the
   merge back. A slot that is gone (404: 30 days unwritten) is forgotten, and the next pass makes
   one again.

The save is never touched during a run (the write waits for the next pass), and a device whose own
save is read-only (a newer build's) does not sync. A slot made from a typed code by an older build
works the same: it is just the slot `hk.cloud` names.

### iOS: Game Center

On iOS, a player signed in to Game Center has their slot keyed to their Game Center player: on a
new phone signed in to the same player, the first pass finds it and merges it in. Game Center
answers some time after launch, so the launch pass may run signed out and make a slot of the
device's own; the sign-in (`GameCenterAccount.onChange` with a nickname, main.ios.ts) runs a pass
at once (`CloudSync.account()`), which merges the device's slot into the account's. A player who
signs in later from settings is merged the same way. `hk.cloud.gc` keeps the player the slot
belongs to, so later launches skip the lookup.

The shell proves the player to the server with Game Center's identity signature
(`GKLocalPlayer.fetchItems(forIdentityVerificationSignature:)`, bridge v5,
`HKNative.gameCenterIdentity()` answered through `onGameCenterIdentity`): the player ids, the
bundle id, a timestamp, a salt, the signature and the URL of Apple's public key. The server
(`server/src/gameCenter.ts`) fetches the key's certificate (only from `https://static.gc.apple.com/`,
kept a day), checks it is in date, and checks the RSA-SHA256 signature over the player id, the
bundle id, the timestamp (big-endian 64 bits) and the salt, with the timestamp within an hour of
now. Apple's documentation names `teamPlayerID` as the signed id; the shell sends `gamePlayerID`
beside it and the server tries both, keying the slot on the one that verified. The bundle id
must be one of the two apps' (`apps.json`), which also says the game. The slot is found by an
HMAC of the game and the player id (the tag salt), so the database holds no Game Center id.

**Only a device can verify this part**: the Swift side compiles only on the macOS runner, and
Game Center signs only on a phone signed in to it. Until a TestFlight build has carried a save
through Game Center to a second install, treat it as unproven; the device's own slot works without it.

### Merging two saves

Every sync merges the slot's save with the device's, field by field. Progress
is never lost to "the last write wins":

- **Progress takes the furthest of the two**: level and xp as a pair; `cleared`; per chapter
  `best`, `stars`, `hardBest`, `hardStars`; `runs`, `kills`, `trained`, `gifts` (with its
  `giftDay`); the bit fields `chests`, `opened`, `hardChests`, `hardOpened`, `monks`, `achieved`,
  `seen`, `sutras` (OR, `achieved` word by word to the longer of the two); `firstRunDone` (OR);
  the codex (union); `firstDay` (the earliest set one); `bestStreak` (the higher).
- **The daily streak follows the save that played a daily last**: `streak` with its `streakDay`
  (the later day; the same day keeps the longer streak). `dailyBest` is the later daily's best
  (its id sorts by date; the same daily keeps the more waves).
- **Today's `daily` is the later day's**; the same day keeps the most of each counter (shop
  chests, quick patrols) and, when both drew the same tasks (they do: the draw is seeded by the
  date), each task's most progress and every claim, so nothing of the day pays twice.
- **Everything else comes from the leading save**, the one with more runs (then more chapters
  cleared, then the higher level and xp; a tie keeps the device's): the wallet (`copper`, `jade`),
  `gear`, the selected `relic`, `chapter`, `monk` and `hard`, the patrol clock,
  `grit`, the falls, `dice`, `challenge` and the unpaid `weeks`. A wallet cannot be merged
  without paying twice for one thing, so it follows the save that has played the most. The
  leader's gear gets a first copy of each relic only the other save had unlocked (one unlocked
  by its copy alone, under the old gates, would be lost otherwise).
- A field this build does not know follows the leading save as well (`keep`, as above).

`mergeSaves` (`client/src/meta/saveMerge.ts`) is tested to be commutative on progress and to
never lower any progress field, over random pairs (`saveProps.test.ts`) and a save of every
version (`saveCorpus.test.ts`, `fixtures/`). Two devices played at once lose at most the trailing device's
wallet and selections since their last sync.

### Versions

The slot carries its save's version. A device syncs only when the slot's version is at most
its own `SAVE_VERSION`: a slot written by a newer build is left alone (the device plays its own
save and syncs again once it is updated), and the server refuses an upload whose version
is below the slot's. A device whose own save is read-only (a newer build's, above) never syncs.
Uploading keeps what this build could not read of the slot's save (`keep` over the slot's
object), so two builds of the same version never strip each other's chapters.

### The server

`server/src/cloudSave.ts` (routes, wired from `routes.ts`), `cloudVault.ts` (the store), wire
format in `cloudWire.ts` (shared as `@hk/protocol`):

| Call | Body | Answer |
| --- | --- | --- |
| `POST /v1/cloud/new` | `{ game }` | `{ code, rev: 0 }` |
| `POST /v1/cloud/gc` | `{ game, identity, create }` | `{ code, rev }`; 404 with `create: false` and no slot; 403 when the signature fails |
| `POST /v1/cloud/read` | `{ game, code }` | `{ rev, save }` (`save` null while empty); 404 for no slot |
| `POST /v1/cloud/write` | `{ game, code, base, save }` | `{ rev }`; 409 `{ rev, save }` when `base` is not the slot's revision or the save's version is below the slot's |

Limits: a save of at most 24 kB (`CLOUD_LIMITS.saveBytes`; a 20-chapter save is about 3 kB), a
JSON object with a numeric `version`. Rates per address: `cloudNew` 3 at once, then 1 a minute
(slots and Game Center lookups); `cloud` 10 at once, then 6 a minute (reads and writes). The
Mongo collection `cloud` holds `{ _id: code, game, rev, version, save, at, gc? }`, with a unique
sparse index on `gc` and a TTL that drops a slot not written for 30 days (`CLOUD_LIMITS.slotDays`,
as the privacy policy states; a player who keeps playing keeps it, since every sync writes). The
server changes an older index's TTL in place at start (`collMod`); it was two years until 2026-10-22.

A write is optimistic: the client sends the revision it merged from; on 409 it merges the
answer and tries once more, else waits for the next sync.

### Testing on a device

- Web: open h.gamestao.com and play a run; in the browser's storage `hk.cloud` holds a key and the
  backend has a slot with the run in it. Clear the site's data except `hk.cloud` (or copy it into
  a private window's storage) and reload: the lobby comes back with the same chapters and copper.
- iOS (TestFlight, signed in to Game Center): play a run, send the app to the background, delete
  it and install it again: once Game Center greets the player, the save comes back by itself. On a
  phone signed out of Game Center, play, then sign in from settings: the device's progress and the
  account's merge.
