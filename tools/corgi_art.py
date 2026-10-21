"""Builds the corgi theme's planets, UI art and item pictures (art/reskin/corgi/README.md) from
their sources into art/reskin/corgi/game/<key>, each the size, format and frame names of the
monk file it replaces, with a same-size WebP twin where client/src/webpArt.json lists one.
usage: python tools/corgi_art.py [grounds|deco|icons|items|patrol|lobby]...   (none = all)
A step whose sources are not there yet is skipped and named, so a partial set still builds."""
import json
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter

sys.path.insert(0, str(Path(__file__).parent))
from recolor_armour import GUNMETAL, glow, recolor  # noqa: E402

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "art/reskin/corgi"
OUT = SRC / "game"
PUB = ROOT / "client/public"
TOOLS = ROOT / "tools"
WEBP = set(json.loads((ROOT / "client/src/webpArt.json").read_text(encoding="utf-8")))

# the grounds: no generated picture, every tile drawn in code (seeded, so the output is stable)
GROUNDS = {
    "art/ground/grass.png": ["planet_tile.py", "frost"],
    "art/ground/earth.png": ["planet_tile.py", "regolith"],
    "art/ground/earth_soft.png": ["planet_tile.py", "regolith", "--soft"],
    "art/ground/marsh.png": ["planet_tile.py", "spore"],
    "art/ch3/ground/snow.png": ["planet_tile.py", "dune"],
    "art/ch4/ground/street.png": ["rock_tile.py", "--rgb", "60,58,58", "--ember", "230,130,50", "--embers", "6",
                                 "--lava", "160,74,28", "--seed", "7"],
    "art/ch5/ground/cave.png": ["hex_tile.py"],
}

# each chapter's props: a 2x3 sheet cut in reading order into the frame names decoView.ts draws
DECO = {
    "art/ground/deco": ("planets/deco_frost.png", "grass_tuft bush rocks dirt_patch stump gravestone"),
    "art/ground/marsh_deco": ("planets/deco_jungle.png", "reeds puddle lily mossrock log lantern"),
    "art/ch3/ground/snow_deco": ("planets/deco_dune.png", "pine snowrock shrub ice stump cairn"),
    "art/ch4/ground/street_deco": ("planets/deco_forge.png", "lantern_post papers jars crates stall burner"),
    "art/ch5/ground/cave_deco": ("planets/deco_hive.png", "spikes bones - brazier crystals stupa"),
}

# icon sheets: grid and names in reading order ("-" skips a cell or object, name@x,y seeds a
# see-through hole); "auto" for the sheets whose rows came out uneven (split_sheet.py)
ICON_SHEETS = {
    "icons/sheet_weapons.png": ("3x3", "ball staff - - beads - bolt - bell"),
    "icons/sheet_spells.png": ("auto", "palm incense lotus halo roar - - legs calm eye"),
    "icons/sheet_passives.png": ("auto", "rice focus - wrath - pendant - bracers - robe sandals"),
    "icons/sheet_shop.png": ("auto", "chest_free chest_jade train_attack chest_ad - train_hp train_xp "
                                     "train_copper - - train_magnet train_revive"),
    "icons/sheet_lobby.png": ("3x3", "jade copper shop codex lock@0.5,0.14 settings@0.5,0.5 patrol tasks chest"),
    "icons/sheet_fix.png": ("1x3", "iron karma sash@0.5,0.42"),
    "icons/sheet_relics.png": ("2x2", "bowl cymbal fish -"),
    "icons/sheet_arsenal.png": ("1x3", "talisman bomb knives"),
    "icons/sheet_tabs.png": ("1x2", "daily tab_train@0.5,0.17"),
}
# the guns among the icons take the squad's gunmetal (tools/recolor_armour.py), so the HUD's
# relic matches the pistols the hero holds; "glow" lights the blaster's slots, button and muzzle
# ring in the pistols' yellow-green (regions in the cut icon's pixels), and "paper" names a point
# in each trigger guard, whose enclosed sheet white the cut keeps and the dark HUD shows
GUN_ICONS = {
    "ball": {"glow": [], "paper": [(142, 98)]},
    "bowl": {"glow": [["ellipse", 16, 40, 42, 102], ["rect", 200, 28, 220, 48], ["rect", 204, 88, 219, 110],
                      ["rect", 268, 28, 356, 46], ["rect", 240, 83, 308, 101], ["ellipse", 318, 53, 346, 81]],
             "paper": [(258, 140)]},
}
# the monk sheet's frame order (client/public/art/icons/icons.json), which the corgi sheet keeps
ICONS = [f["name"] for f in json.loads((PUB / "art/icons/icons.json").read_text())["frames"]]

# item pictures: sheet, grid, names; each fitted into the monk picture's exact size (the bomb that
# stands in for the palm is drawn nose up and falls nose down, so it is flipped)
ITEM_SHEETS = {
    "items/sheet_tall.png": ("1x4", "staff staff_ruyi bell_relic palm"),
    "items/sheet_round.png": ("1x3", "cuju cuju_meteor fish"),
    "items/sheet_big.png": ("1x2", "lion mountain"),
}

PROPS = ("ui/props.png", "2x3", "pine lantern sign bamboo rocks bush")
FLIP = {"palm"}
FAR = ("ui/far.png", "0.22-0.85")
LOBBY = "ui/bg_lobby.png"


def run(*args):
    subprocess.run([sys.executable, *map(str, args)], check=True, cwd=ROOT)


def webp_twin(key):
    """The WebP the web hosts prefer, at the PNG's size (check:theme compares them)."""
    if key in WEBP:
        png = OUT / key
        Image.open(png).convert("RGBA").save(png.with_suffix(".webp"), "WEBP", quality=90, method=6, alpha_quality=100)


def split(sheet, grid, names, dest):
    run(TOOLS / "split_sheet.py", SRC / sheet, grid, dest, *names.split())


def missing(*rels):
    gone = [r for r in rels if not (SRC / r).exists()]
    for r in gone:
        print(f"  waiting for {SRC.relative_to(ROOT) / r}")
    return bool(gone)


def grounds(_):
    for key, cmd in GROUNDS.items():
        (OUT / key).parent.mkdir(parents=True, exist_ok=True)
        run(TOOLS / cmd[0], *cmd[1:2] if cmd[0] == "planet_tile.py" else [], OUT / key,
            *(cmd[2:] if cmd[0] == "planet_tile.py" else cmd[1:]))
        webp_twin(key)


def deco(_):
    for key, (sheet, names) in DECO.items():
        if missing(sheet):
            continue
        with tempfile.TemporaryDirectory() as tmp:
            split(sheet, "2x3", names, Path(tmp) / "cut")
            pieces = [Path(tmp) / "cut" / f"{n}.png" for n in names.split() if n != "-"]
            run(TOOLS / "pack_deco.py", tmp, *pieces)
            dst = OUT / key
            dst.parent.mkdir(parents=True, exist_ok=True)
            shutil.copy(Path(tmp) / "deco.png", dst.with_suffix(".png"))
            shutil.copy(Path(tmp) / "deco.json", dst.with_suffix(".json"))


def clear_paper(im, seeds):
    """Makes the near-white patch around each seed point transparent, with its pale rim."""
    pale = im.convert("L").point(lambda v: 255 if v > 230 else 0)
    for seed in seeds:
        ImageDraw.floodfill(pale, seed, 128)
    hole = pale.point(lambda v: 255 if v == 128 else 0).filter(ImageFilter.MaxFilter(5))
    rim = im.convert("L").point(lambda v: 255 if v > 170 else 0)
    gone = Image.composite(hole, Image.new("L", im.size), rim)
    alpha = Image.composite(Image.new("L", im.size), im.getchannel("A"), gone)
    im.putalpha(alpha)
    return im


def icons(cut):
    for sheet, (grid, names) in ICON_SHEETS.items():
        if not missing(sheet):
            split(sheet, grid, names, cut)
    gone = [n for n in ICONS if not (cut / f"{n}.png").exists()]
    if gone:
        print(f"  icons not cut yet: {' '.join(gone)}")
        return
    for n, gun in GUN_ICONS.items():
        im = clear_paper(Image.open(cut / f"{n}.png").convert("RGBA"), gun["paper"])
        recolor(glow(im, gun["glow"]), GUNMETAL).save(cut / f"{n}.png")
    (OUT / "art/icons").mkdir(parents=True, exist_ok=True)
    run(TOOLS / "pack_icons.py", OUT / "art/icons", *[cut / f"{n}.png" for n in ICONS])
    for ext in ("png", "json"):
        a, b = PUB / f"art/icons/icons.{ext}", OUT / f"art/icons/icons.{ext}"
        if ext == "json":
            mine, monk = json.loads(b.read_text()), json.loads(a.read_text())
            assert [(f["name"], f["w"], f["h"]) for f in mine["frames"]] == \
                [(f["name"], f["w"], f["h"]) for f in monk["frames"]], "icon frames differ from the monk sheet"
        else:
            assert Image.open(a).size == Image.open(b).size, "icon sheet size differs"


def fit(src, key):
    """Trims a cut-out piece and scales it to fit the monk picture's size, centred, in its mode."""
    monk = Image.open(PUB / key)
    w, h = monk.size
    im = Image.open(src).convert("RGBA")
    if Path(key).stem in FLIP:
        im = im.transpose(Image.Transpose.FLIP_TOP_BOTTOM)
    im = im.crop(im.getchannel("A").getbbox())
    k = min(w / im.width, h / im.height)
    im = im.resize((max(1, round(im.width * k)), max(1, round(im.height * k))), Image.LANCZOS)
    page = Image.new("RGBA", (w, h))
    page.alpha_composite(im, ((w - im.width) // 2, (h - im.height) // 2))
    dst = OUT / key
    dst.parent.mkdir(parents=True, exist_ok=True)
    if monk.mode == "P":
        page.quantize(255, method=Image.Quantize.FASTOCTREE, dither=Image.Dither.NONE).save(dst, optimize=True)
    else:
        page.save(dst, optimize=True)
    webp_twin(key)


def items(cut):
    for sheet, (grid, names) in ITEM_SHEETS.items():
        if missing(sheet):
            continue
        split(sheet, grid, names, cut)
        for n in names.split():
            fit(cut / f"{n}.png", f"art/{n}.png")


def patrol(cut):
    if missing(PROPS[0], FAR[0]):
        return
    split(PROPS[0], PROPS[1], PROPS[2], cut)
    (OUT / "art/ui").mkdir(parents=True, exist_ok=True)
    run(TOOLS / "patrol_art.py", OUT / "art/ui", SRC / FAR[0], FAR[1], *[cut / f"{n}.png" for n in PROPS[2].split()])


def lobby(_):
    if missing(LOBBY):
        return
    size = Image.open(PUB / "art/ui/lobby.jpg").size
    im = Image.open(SRC / LOBBY).convert("RGB")
    # cover the monk size, anchored at the bottom like the game draws it (the sky gives way)
    k = max(size[0] / im.width, size[1] / im.height)
    im = im.resize((round(im.width * k), round(im.height * k)), Image.LANCZOS)
    x = (im.width - size[0]) // 2
    im = im.crop((x, im.height - size[1], x + size[0], im.height))
    (OUT / "art/ui").mkdir(parents=True, exist_ok=True)
    im.save(OUT / "art/ui/lobby.jpg", quality=82, optimize=True)


STEPS = {"grounds": grounds, "deco": deco, "icons": icons, "items": items, "patrol": patrol, "lobby": lobby}

if __name__ == "__main__":
    for name in sys.argv[1:] or STEPS:
        print(name)
        with tempfile.TemporaryDirectory() as cut:  # the cut-out pieces, rebuilt every time
            STEPS[name](Path(cut))
