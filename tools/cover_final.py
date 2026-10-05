"""Finishes the store covers: crops each painted cover to its store size and lays the logo over it.
usage: python cover_final.py <store dir> [en|zh]
Reads <store dir>/cover_{landscape,portrait,square}.png and logo_<lang>.png, writes
<store dir>/final/<lang>_{landscape,portrait,square}.png (docs/store.md "Images"), and the WeChat
share card client/wechat/share/<lang>.jpg (5:4, cut from the landscape cover)."""
import sys
from pathlib import Path

from PIL import Image

# name: store size, crop focus (fraction of width, height kept in view), logo (centre x, centre y,
# width), all as fractions of the final picture
COVERS = {
    "landscape": ((1920, 1080), (0.5, 0.5), (0.497, 0.125, 0.27)),
    "portrait": ((800, 1200), (0.5, 0.5), (0.5, 0.13, 0.74)),
    "square": ((800, 800), (0.5, 0.5), (0.5, 0.895, 0.40)),
}
# the card a WeChat share shows: 5:4 at 500x400, a JPEG to stay light in the main package
SHARE = ((500, 400), (0.44, 0.5), (0.5, 0.15, 0.42))
SHARE_DIR = Path(__file__).resolve().parent.parent / "client" / "wechat" / "share"


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
        page = cover(store / f"cover_{name}.png", logo, size, focus, (lx, ly, lw))
        page.save(out / f"{lang}_{name}.png", optimize=True)
        print(out / f"{lang}_{name}.png", size)
    SHARE_DIR.mkdir(exist_ok=True)
    size, focus, place = SHARE
    cover(store / "cover_landscape.png", logo, size, focus, place).save(SHARE_DIR / f"{lang}.jpg", quality=82, optimize=True)
    print(SHARE_DIR / f"{lang}.jpg", size)


def cover(path, logo, size, focus, place):
    """The painted cover cut to size, with the logo laid over it."""
    lx, ly, lw = place
    page = fit(Image.open(path).convert("RGBA"), size, focus)
    k = lw * size[0] / logo.width
    mark = logo.resize((round(logo.width * k), round(logo.height * k)), Image.LANCZOS)
    page.alpha_composite(mark, (round(lx * size[0] - mark.width / 2), round(ly * size[1] - mark.height / 2)))
    return page.convert("RGB")


if __name__ == "__main__":
    main()
