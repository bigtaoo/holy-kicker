# Save corpus

One save per `SAVE_VERSION`, as the last build of that version stored it, for
`saveCorpus.test.ts`. Each is a made-up player mid-journey (several chapters cleared, gear at
several tiers, hard mode, a day of tasks, whatever that version had); none is a player's data.

| File | Version | Written by | Version raised in |
| --- | --- | --- | --- |
| `v1.ts` | 1 | e89002a | b268141 |
| `v2.ts` | 2 | 7853c37 | 5dc075f |
| `v3.ts` | 3 | 02dc25a | 5f5581c |
| `v4.ts` | 4 | 6a16373 | aa47fd5 |
| `v5.ts` | 5 | cc62d39 | c96f01f |
| `v6.ts` | 6 | 3030b19 | 7dd87db |
| `v7.ts` | 7 | f1295ab | (current) |

## How they were made

`generator.txt` is a vitest file. For each commit above:

```bash
git worktree add --detach ../old <commit>
cd ../old && npm install
cp <this folder>/generator.txt client/src/meta/zzGen.test.ts
cd client && HK_FIXTURE_OUT=/tmp/vN.json npx vitest run src/meta/zzGen.test.ts
```

It takes that build's `newSave()`, lays one fixed set of mid-journey values over it (a field the
build did not have is ignored) and reads the result back through that build's own `parseSave`,
so the stored object is exactly what that build would have written, its own clamps and relic
grants included. The JSON's `stored` became `vN.ts` (one line per field); `lost` lists the values
that build changed on reading (the relic copies it granted, `achieved` turning into words in 7).

A new `SAVE_VERSION` should add its predecessor's last save here the same way.
