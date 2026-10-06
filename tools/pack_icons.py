"""Packs the build icons (relic, spells, passives) into one sheet for the HUD and the cards.
usage: python pack_icons.py [--cell N --name NAME] <out dir> <img>...
Each image is cut out (cutout.py), trimmed, scaled to fit a CELL px square keeping its shape,
centred in that cell, and laid out in a grid in <out dir>/icons.png with <out dir>/icons.json:
  {"frames": [{"name", "x", "y", "w", "h"}, ...]}   (the same layout as deco.json)
The frame name is the file stem, which is the item id in the engine (or the gear slot).
--cell and --name make another sheet the same way, e.g. the monks' portraits at 256 px
(<out dir>/monks.png, art/monk/monks/README.md)."""
import json
import sys
from pathlib import Path

from PIL import Image

sys.path.insert(0, str(Path(__file__).parent))
from cutout import cutout  # noqa: E402

# background showing through a closed shape, seeded by points as fractions of the source image
HOLES = {
    "pendant": [(0.52, 0.56)], "sash": [(0.5, 0.2)], "train_copper": [(0.5, 0.5)],
    "settings": [(0.5, 0.5)], "lock": [(0.5, 0.28)], "copper": [(0.42, 0.345)],
}

CELL = 128
COLS = 4
PAD = 2


def main():
    global CELL
    args, name = sys.argv[1:], "icons"
    while args[0].startswith("--"):
        if args[0] == "--cell":
            CELL = int(args[1])
        elif args[0] == "--name":
            name = args[1]
        args = args[2:]
    out, srcs = Path(args[0]), args[1:]
    rows = (len(srcs) + COLS - 1) // COLS
    step = CELL + PAD * 2
    page = Image.new("RGBA", (COLS * step, rows * step))
    frames = []
    for i, s in enumerate(srcs):
        im = cutout(s, HOLES.get(Path(s).stem, ()))
        im = im.crop(im.getbbox())
        k = CELL / max(im.size)
        im = im.resize((max(1, round(im.width * k)), max(1, round(im.height * k))), Image.LANCZOS)
        x, y = (i % COLS) * step + PAD, (i // COLS) * step + PAD
        page.alpha_composite(im, (x + (CELL - im.width) // 2, y + (CELL - im.height) // 2))
        frames.append({"name": Path(s).stem, "x": x, "y": y, "w": CELL, "h": CELL})
    out.mkdir(parents=True, exist_ok=True)
    # a 256-colour palette, like the baked mobs: about a third of the size, no visible change
    page.quantize(256, method=Image.Quantize.FASTOCTREE).save(out / f"{name}.png", optimize=True)
    (out / f"{name}.json").write_text(json.dumps({"frames": frames}, indent=1))
    print(f"{len(frames)} icons, {page.size[0]}x{page.size[1]}, {(out / f'{name}.png').stat().st_size // 1024} KB")


if __name__ == "__main__":
    main()
