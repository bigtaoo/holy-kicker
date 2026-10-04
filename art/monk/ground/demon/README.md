# Chapter 5 ground: Demon Peak (2026-10-04)

- **Tile**: no generated picture. `tools/rock_tile.py --rgb 50,52,58 --ember 120,92,180 --embers 10`
  draws the cave floor in code: irregular rock plates (a Voronoi diagram on a torus, so it is
  seamless) with dark cracks, a lighter lip on each plate's upper edge, hairline cracks and a
  few small embers, into `client/public/art/ch5/ground/cave.png`. Kept neutral grey: a violet
  first try hid the violet enemy attacks. `cave.txt` is the prompt for a generated one.
- **Props**: brazier, spikes, bones, stupa and crystals (`*.txt` prompts here) were
  rate-limited, so `client/public/art/ch5/ground/cave_deco.{png,json}` holds only the patch
  for now (`tools/pack_deco.py <dir>` with no images). `PEAK_DECO` in
  `client/src/game/decoView.ts` already lists the props; once generated, pack them with
  `python tools/pack_deco.py <dir> brazier.png spikes.png bones.png stupa.png crystals.png`
  and copy `deco.{png,json}` over `cave_deco.*`.
