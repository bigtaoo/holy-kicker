"""Print how light each map's ground tile is, per theme, for GROUND_LIGHT in client/src/game/actLook.ts.
usage: python tools/ground_light.py
The night over acts 2-4 is weakened on a darker ground so every map's ground comes out as light
as map 1's in the same act (actLook.ts); rerun this after redrawing a ground tile and paste the rows.
Light is the mean Rec. 709 luma, 0-255, of the opaque pixels."""
import json
import os
from PIL import Image

ROOT = os.path.join(os.path.dirname(__file__), "..")
# map 1 to 5, as client/src/chapterArt.ts loads them (map 1: the scene's default ground, grass)
GROUNDS = ["art/ground/grass.png", "art/ch2/ground/marsh.png", "art/ch3/ground/snow.png",
           "art/ch4/ground/street.png", "art/ch5/ground/cave.png"]


def light(path):
    im = Image.open(path).convert("RGBA")
    total = count = 0
    for r, g, b, a in im.get_flattened_data() if hasattr(im, "get_flattened_data") else im.getdata():
        if a < 128:
            continue
        total += 0.2126 * r + 0.7152 * g + 0.0722 * b
        count += 1
    return round(total / count)


def main():
    corgi = json.load(open(os.path.join(ROOT, "client", "themes", "corgi.json"), encoding="utf-8"))
    themes = {
        "monk": [os.path.join(ROOT, "client", "public", g) for g in GROUNDS],
        "corgi": [os.path.join(ROOT, corgi[g]) for g in GROUNDS],
    }
    for theme, paths in themes.items():
        print(f"  {theme}: [{', '.join(str(light(p)) for p in paths)}],")


if __name__ == "__main__":
    main()
