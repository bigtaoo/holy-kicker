"""The sticker pass (sticker_pass.py, outline only) on the monk's finished sheets and pictures, in
place: each frame of a packed sheet (pack_deco.py / pack_icons.py layout, its .json beside it) is
outlined at the size the game draws it and fitted back into its own rectangle, so the layout, the
frame names and the code that reads them stay as they are. The corgi's art gets the same pass
before packing (corgi_art.py); the monk's sheets were packed long before, from sources several
tools deep, so this works on the shipped files instead.
usage: python tools/sticker_sheet.py [deco|icons|items]...   (none = all; run once per picture:
it adds the outline again on every run, so rebuild a sheet from its sources before rerunning)
Then python tools/webp.py for the twins."""
import json
import re
import sys
from pathlib import Path

import numpy as np
from PIL import Image

sys.path.insert(0, str(Path(__file__).parent))
from pack_deco import to_palette  # noqa: E402
from sticker_art import SPECK, drop_specks  # noqa: E402
import cv2  # noqa: E402
from sticker_pass import OUTLINE, OUT_SHARE, _disc, _outline, sticker  # noqa: E402

ROOT = Path(__file__).resolve().parent.parent
PUB = ROOT / "client/public/art"

# each chapter's prop sheet and the DecoStyle in decoView.ts holding its props' world sizes
DECO = {"ground/deco": "TEMPLE", "ch2/ground/marsh_deco": "MARSH", "ch3/ground/snow_deco": "SNOW",
        "ch4/ground/street_deco": "GHOST", "ch5/ground/cave_deco": "PEAK"}
# left soft: the see-through decals lying flat in the ground (an outline would stand them up),
# the glowing ones (an outline turns glow into a dark blot), the code-drawn round patch, and the
# lanterns, whose grassy feet an outline turns into black specks
SKIP_DECO = {"patch", "dirt_patch", "puddle", "lily", "ice", "papers", "bones", "brazier", "crystals",
             "lantern", "lantern_post"}
# thin blades and twigs: an outline traced round every tip turns into black specks, so these get
# one round the clump's closed silhouette instead (clump()), the tips left sticking out over it;
# the value is the least r+g+b a pixel needs to count as the clump (the shrub: its snow, not twigs)
CLUMP_DECO = {"grass_tuft": 0, "reeds": 0, "shrub": 420}
CLUMP_CLOSE = 3  # world units: gaps between blades narrower than this are filled
CLUMP_OPEN = 1.5  # world units: spikes thinner than this are trimmed off the silhouette
# the pebbles, crumbs and clods strewn round a prop's foot: outlined, each turns into a black dot
DECO_SPECK = 3 * SPECK
ICON_UNITS = 96  # about the size the cards and the HUD show a 128 px icon cell (corgi_art.py)
# partly see-through or glowing icons, which an outline would ring
SKIP_ICONS = {"knives", "halo"}
# the relic and spell pictures in the world, drawn at about ITEM_PX px per world unit (art.ts);
# the cuju and its meteor, and the lion, glow and keep their soft edges
ITEMS = ["staff", "staff_ruyi", "bell_relic", "palm", "fish", "mountain"]
ITEM_PX = 2.5


def deco_sizes(style):
    """name -> world units, read from the chapter's DecoStyle in decoView.ts."""
    ts = (ROOT / "client/src/game/decoView.ts").read_text(encoding="utf-8")
    block = re.search(rf"export const {style}_DECO: DecoStyle = {{\s*kinds: \[(.*?)\]", ts, re.S).group(1)
    return {n: int(v) for n, v in re.findall(r"name: '(\w+)'.*?size: (\d+)", block)}


def outline(im, units, speck=SPECK):
    """<im> (RGBA) outlined as the game shows its long side <units> world units long, at the same
    pixel size: the picture shrinks by the outline's outer share so the result fits its box."""
    w, h = im.size
    box = im.getchannel("A").getbbox()
    if not box:
        return im
    scale = max(w, h) / units
    pad = int(np.ceil(OUTLINE * OUT_SHARE * scale)) + 1
    page = Image.new("RGBA", (w + 2 * pad, h + 2 * pad))
    page.alpha_composite(im, (pad, pad))
    page = drop_specks(np.array(page), (speck * scale) ** 2)
    # back into the old picture's box, keeping its place (props stand on their bottom edge)
    return fit(Image.fromarray(sticker([page], scale, flat=False)[0]), im)


def clump(im, units, light=0):
    """<im> outlined round its clump: the solid pixels (and, with <light>, only the bright ones)
    closed into one silhouette, the gaps filled with the clump's shadow colour, outlined, and laid
    over the picture so the thin tips still show past the line; fitted back like outline()."""
    w, h = im.size
    scale = max(w, h) / units
    pad = int(np.ceil(OUTLINE * scale)) + 2
    a = np.zeros((h + 2 * pad, w + 2 * pad, 4), np.uint8)
    a[pad:pad + h, pad:pad + w] = np.array(im)
    solid = a[:, :, 3] >= 230
    if light:
        solid &= a[:, :, :3].astype(int).sum(2) >= light
    body = cv2.morphologyEx(solid.astype(np.uint8), cv2.MORPH_CLOSE, _disc(CLUMP_CLOSE * scale))
    body = cv2.morphologyEx(body, cv2.MORPH_OPEN, _disc(CLUMP_OPEN * scale))
    n, lab, st, _ = cv2.connectedComponentsWithStats(body)
    if n < 2:
        return im
    body = lab == 1 + np.argmax(st[1:, cv2.CC_STAT_AREA])
    rgb = a[:, :, :3].astype(np.float32)
    px = rgb[solid]
    lum = px.sum(1)
    shade = np.median(px[lum <= np.percentile(lum, 40)], axis=0) * 0.8
    al = a[:, :, 3:].astype(np.float32) / 255
    base = np.where(body[..., None], shade * (1 - al) + rgb * al, 0)
    out, aa = _outline(base, np.where(body, 255.0, 0), np.zeros(body.shape, bool), scale, True)
    ring = np.dstack([np.clip(out, 0, 255), aa * 255]).round().astype(np.uint8)
    ring[aa <= 0] = 0
    res = Image.fromarray(a)
    res.alpha_composite(Image.fromarray(ring))
    return fit(res, im)


def fit(out, im):
    """<out> shrunk into <im>'s opaque box, standing on its bottom edge, on a page of <im>'s size."""
    w, h = im.size
    box = im.getchannel("A").getbbox()
    out = out.crop(out.getchannel("A").getbbox())
    bw, bh = box[2] - box[0], box[3] - box[1]
    k = min(bw / out.width, bh / out.height, 1.0)
    out = out.resize((max(1, round(out.width * k)), max(1, round(out.height * k))), Image.LANCZOS)
    res = Image.new("RGBA", (w, h))
    res.alpha_composite(out, (box[0] + (bw - out.width) // 2, box[3] - out.height))
    return res


def save_like(im, path, mode):
    if mode == "P":
        im.quantize(256, method=Image.Quantize.FASTOCTREE, dither=Image.Dither.NONE).save(path, optimize=True)
    else:
        im.save(path, optimize=True)


def sheet(key, units_of, speck=SPECK):
    """Outlines every frame of <key>.png whose units_of(name) is not None (CLUMP_DECO's round
    their clump)."""
    png = PUB / f"{key}.png"
    src = Image.open(png)
    mode = src.mode
    page = src.convert("RGBA")
    frames = json.loads((PUB / f"{key}.json").read_text(encoding="utf-8"))["frames"]
    for f in frames:
        units = units_of(f["name"])
        if units is None:
            continue
        r = (f["x"], f["y"], f["x"] + f["w"], f["y"] + f["h"])
        cell = page.crop(r)
        if f["name"] in CLUMP_DECO:
            cell = clump(cell, units, CLUMP_DECO[f["name"]])
        else:
            cell = outline(cell, units, speck)
        page.paste(Image.new("RGBA", cell.size), r[:2])
        page.alpha_composite(cell, r[:2])
    patch = next((f for f in frames if f["name"] == "patch"), None)
    if patch:  # a prop sheet: its soft patch keeps its own alpha ramp (pack_deco.py)
        to_palette(page, patch).save(png, optimize=True)
    else:
        save_like(page, png, mode)
    print(f"{png.relative_to(ROOT)}")


def deco():
    for key, style in DECO.items():
        sizes = deco_sizes(style)
        sheet(key, lambda n, s=sizes: None if n in SKIP_DECO else s.get(n), DECO_SPECK)


def icons():
    sheet("icons/icons", lambda n: None if n in SKIP_ICONS else ICON_UNITS)


def items():
    for n in ITEMS:
        png = PUB / f"{n}.png"
        src = Image.open(png)
        im = src.convert("RGBA")
        save_like(outline(im, max(im.size) / ITEM_PX), png, src.mode)
        print(f"{png.relative_to(ROOT)}")


if __name__ == "__main__":
    steps = {"deco": deco, "icons": icons, "items": items}
    for name in sys.argv[1:] or steps:
        steps[name]()
