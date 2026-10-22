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
