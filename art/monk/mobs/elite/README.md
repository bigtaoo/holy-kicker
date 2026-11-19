# Elite jiangshi (monk)

The monk's elites drawn on their own instead of tinted copies of the horde's jiangshi (2026-11-19):

- `general.txt` → `genL.png` (picked over `genM.png`), its brown belt, beads and shoes cooled to slate
  by `python elite_cool.py genL.png general_v1.png 460` → `general_v1.png`, baked by `../general.json`
  into `client/public/art/mobs/general` — the big jiangshi elite and the first mid-boss twin.
- `twin.txt` → `twinN.png` (picked over `twinJ.png`), baked by `../lady.json` into
  `client/public/art/mobs/lady` — the court lady, the second twin.

Both drawings face the viewer, so they are baked with soft warps (`deform`: arms, hem, talisman, the
lady's tassels, a head bob) over the jiangshi's hop and squash rather than cut-out rig parts, which
tore the front-facing figure apart. Rim baked in (elite outline), drawn 140 units tall (`cast.ts`).
The corgi keeps its tinted horde sheet (`art.ts` loads these for the monk only).
