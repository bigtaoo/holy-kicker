"""Finishes the store covers: crops each painted cover to its store size and lays the logo over it.
usage: python cover_final.py <store dir> [en|zh]
Reads <store dir>/cover_{landscape,portrait,square}.png and logo_<lang>.png, writes
<store dir>/final/<lang>_{landscape,portrait,square}.png (docs/store.md "Images")."""
import sys
from pathlib import Path

from PIL import Image

# name: store size, crop focus (fraction of width, height kept in view), logo (centre x, centre y,
# width), all as fractions of the final picture
COVERS = {
    "landscape": ((1920, 1080), (0.5, 0.5), (0.5, 0.16, 0.36)),
    "portrait": ((800, 1200), (0.5, 0.5), (0.5, 0.13, 0.74)),
    "square": ((800, 800), (0.5, 0.5), (0.5, 0.885, 0.52)),
}


def fit(im, size, focus):
    """Scales im to cover size, cropping the overflow around focus."""
    w, h = size
    k = max(w / im.width, h / im.height)
    im = im.resize((round(im.width * k), round(im.height * k)), Image.LANCZOS)
    x = min(max(round(im.width * focus[0] - w / 2), 0), im.width - w)
    y = min(max(round(im.height * focus[1] - h / 2), 0), im.height - h)
    return im.crop((x, y, x + w, y + h))


def main():
    store = Path(sys.argv[1])
    lang = sys.argv[2] if len(sys.argv) > 2 else "en"
    logo = Image.open(store / f"logo_{lang}.png").convert("RGBA")
    out = store / "final"
    out.mkdir(exist_ok=True)
    for name, (size, focus, (lx, ly, lw)) in COVERS.items():
        page = fit(Image.open(store / f"cover_{name}.png").convert("RGBA"), size, focus)
        k = lw * size[0] / logo.width
        mark = logo.resize((round(logo.width * k), round(logo.height * k)), Image.LANCZOS)
        page.alpha_composite(mark, (round(lx * size[0] - mark.width / 2), round(ly * size[1] - mark.height / 2)))
        page.convert("RGB").save(out / f"{lang}_{name}.png", optimize=True)
        print(out / f"{lang}_{name}.png", size)


if __name__ == "__main__":
    main()
