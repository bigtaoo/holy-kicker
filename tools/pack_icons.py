"""Packs the build icons (relic, spells, passives) into one sheet for the HUD and the cards.
usage: python pack_icons.py [--cell N --name NAME --pad N] <out dir> <img>...
Each image is cut out (cutout.py), trimmed, scaled to fit a CELL px square keeping its shape,
centred in that cell (in the icon sheet, a solid one a little smaller: FILL), and laid out in a grid in <out dir>/icons.png with <out dir>/icons.json:
  {"frames": [{"name", "x", "y", "w", "h"}, ...]}   (the same layout as deco.json)
The frame name is the file stem, which is the item id in the engine (or the gear slot).
--cell and --name make another sheet the same way, e.g. the monks' portraits at 256 px
(<out dir>/monks.png, art/monk/monks/README.md); --pad sets the gap round each cell."""
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
# the game mipmaps the sheet: 4 px keeps a clear pixel between cells two levels down
PAD = 4
# optical size (the icon sheet only): a solid picture (a book, a chest) looks bigger than a thin
# one (a hat, a staff) in the same square, so one that covers more than FILL of its square is
# shrunk by sqrt(FILL / its cover), never below SHRINK; the thin ones cannot grow past the cell
FILL = 0.5
SHRINK = 0.8


def optical(im):
    """The scale that gives a trimmed picture about the visual weight of the others."""
    cover = im.getchannel("A").point(lambda a: 255 if a > 128 else 0).histogram()[255] / max(im.size) ** 2
    return max(SHRINK, min(1.0, (FILL / cover) ** 0.5)) if cover else 1.0


def main():
    global CELL, PAD
    args, name = sys.argv[1:], "icons"
    while args[0].startswith("--"):
        if args[0] == "--cell":
            CELL = int(args[1])
        elif args[0] == "--name":
            name = args[1]
        elif args[0] == "--pad":
            PAD = int(args[1])
        args = args[2:]
    out, srcs = Path(args[0]), args[1:]
    rows = (len(srcs) + COLS - 1) // COLS
    step = CELL + PAD * 2
    page = Image.new("RGBA", (COLS * step, rows * step))
    frames = []
    for i, s in enumerate(srcs):
        im = cutout(s, HOLES.get(Path(s).stem, ()))
        im = im.crop(im.getbbox())
        k = CELL / max(im.size) * (optical(im) if name == "icons" else 1.0)
        im = im.resize((max(1, round(im.width * k)), max(1, round(im.height * k))), Image.LANCZOS)
        x, y = (i % COLS) * step + PAD, (i // COLS) * step + PAD
        page.alpha_composite(im, (x + (CELL - im.width) // 2, y + (CELL - im.height) // 2))
        frames.append({"name": Path(s).stem, "x": x, "y": y, "w": CELL, "h": CELL})
    out.mkdir(parents=True, exist_ok=True)
    # a 256-colour palette, like the baked mobs: a fifth of the size (full colour put WeChat's main
    # package over 4 MB). Its speckle only showed while the game shrank the icons without mipmaps.
    page.quantize(256, method=Image.Quantize.FASTOCTREE).save(out / f"{name}.png", optimize=True)
    (out / f"{name}.json").write_text(json.dumps({"frames": frames}, indent=1))
    print(f"{len(frames)} icons, {page.size[0]}x{page.size[1]}, {(out / f'{name}.png').stat().st_size // 1024} KB")


if __name__ == "__main__":
    main()
