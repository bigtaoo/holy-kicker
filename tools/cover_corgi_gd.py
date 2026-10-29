"""GameDistribution's thumbnails for Corgi Commando, cut from the corgi's draft covers.

GD asks for JPGs at 512x384, 512x512 and 200x120, and takes 1280x720 and 1280x550 too. Each is a
centre crop (the corgi stands in the middle of every draft) of the draft closest in shape, scaled
down. Writes art/reskin/corgi/store/gamedistribution/<w>x<h>.jpg.

    python tools/cover_corgi_gd.py
"""

from pathlib import Path

from PIL import Image

STORE = Path(__file__).resolve().parent.parent / "art" / "reskin" / "corgi" / "store"
OUT = STORE / "gamedistribution"
SIZES = [(512, 384), (512, 512), (200, 120), (1280, 720), (1280, 550)]


def source(w: int, h: int) -> Image.Image:
    return Image.open(STORE / ("draft_square.png" if w / h < 1.2 else "draft_landscape.png")).convert("RGB")


def cut(img: Image.Image, w: int, h: int) -> Image.Image:
    sw, sh = img.size
    scale = max(w / sw, h / sh)
    cw, ch = round(w / scale), round(h / scale)
    left, top = (sw - cw) // 2, (sh - ch) // 2
    return img.crop((left, top, left + cw, top + ch)).resize((w, h), Image.LANCZOS)


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    for w, h in SIZES:
        path = OUT / f"{w}x{h}.jpg"
        cut(source(w, h), w, h).save(path, quality=90, optimize=True)
        print(path.name, path.stat().st_size)


if __name__ == "__main__":
    main()
