"""Letter the game's logo in the sticker style: flat saffron and gold letters, a hard cel shadow on
their lower right edges, a thick dark outline and a solid drop under the whole word.
usage: python make_logo.py <out dir>
Writes logo_en.png ("HOLY KICKER", two lines) and logo_zh.png (蹴鞠僧) with transparent
backgrounds. Fonts are SIL OFL / Apache, in art/fonts with their licences."""
import os
import sys
from PIL import Image, ImageChops, ImageDraw, ImageFont

FONTS = os.path.join(os.path.dirname(__file__), "..", "art", "fonts")
INK = (38, 22, 14)        # outline and drop, the art's dark brown-black
GOLD = (255, 206, 64)     # top line fill
SAFFRON = (247, 146, 30)  # main fill, the hero's robe
SHADE = 0.78              # cel shadow tone, a multiple of the fill
HIGHLIGHT = (255, 248, 220)


def text_mask(lines, size):
    """L masks per line: (mask, font) laid out centred, one under the other."""
    out = []
    for text, font_file, px, tracking in lines:
        font = ImageFont.truetype(os.path.join(FONTS, font_file), px)
        widths = [font.getbbox(ch)[2] - font.getbbox(ch)[0] for ch in text]
        w = sum(widths) + tracking * (len(text) - 1) + px
        im = Image.new("L", (w, int(px * 1.5)), 0)
        d = ImageDraw.Draw(im)
        x = px // 2
        for ch, cw in zip(text, widths):
            d.text((x - font.getbbox(ch)[0], px // 4), ch, font=font, fill=255)
            x += cw + tracking
        out.append(im.crop(im.getbbox()))
    return out


def shift(mask, dx, dy):
    return ImageChops.offset(mask, dx, dy)


def grow(mask, r):
    """Dilates by r pixels with a round brush (stamping the mask in a disc of offsets)."""
    out = mask.copy()
    for dy in range(-r, r + 1, 2):
        for dx in range(-r, r + 1, 2):
            if dx * dx + dy * dy <= r * r:
                out = ImageChops.lighter(out, shift(mask, dx, dy))
    return out


def sticker(lines, fills, gap, outline, drop, tilt, bold=0, cel=14):
    masks = text_mask(lines, 0)
    pad = outline + drop + 8
    w = max(m.width for m in masks) + pad * 2
    h = sum(m.height for m in masks) + gap * (len(masks) - 1) + pad * 2
    canvas = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    word = Image.new("L", (w, h), 0)
    fill = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    y = pad
    for m, col in zip(masks, fills):
        x = (w - m.width) // 2
        layer = Image.new("L", (w, h), 0)
        layer.paste(m, (x, y))
        if bold:  # thin brush strokes get fattened so the fill reads inside the outline
            layer = grow(layer, bold)
        word = ImageChops.lighter(word, layer)
        k = max(2, m.height // cel)
        # cel shadow: the part of each letter its own up-left copy does not cover
        lit = ImageChops.multiply(layer, shift(layer, -k, -k))
        shade = ImageChops.subtract(layer, lit)
        dark = tuple(int(c * SHADE) for c in col)
        fill.paste(Image.new("RGBA", (w, h), col + (255,)), (0, 0), lit)
        fill.paste(Image.new("RGBA", (w, h), dark + (255,)), (0, 0), shade)
        # a thin highlight on the upper left edges
        hl = ImageChops.subtract(layer, shift(layer, k // 2 + 1, k // 2 + 1))
        hl = ImageChops.multiply(hl, shift(layer, -k, -k))
        fill.paste(Image.new("RGBA", (w, h), HIGHLIGHT + (255,)), (0, 0), hl)
        y += m.height + gap
    edge = grow(word, outline)
    canvas.paste(Image.new("RGBA", (w, h), INK + (255,)), (0, 0), shift(edge, 0, drop))
    canvas.paste(Image.new("RGBA", (w, h), INK + (255,)), (0, 0), edge)
    canvas.alpha_composite(fill)
    canvas = canvas.rotate(tilt, resample=Image.BICUBIC, expand=True)
    return canvas.crop(canvas.getbbox())


def main(out_dir):
    os.makedirs(out_dir, exist_ok=True)
    en = sticker(
        [("HOLY", "LuckiestGuy-Regular.ttf", 240, 12), ("KICKER", "LuckiestGuy-Regular.ttf", 340, 14)],
        [GOLD, SAFFRON], gap=10, outline=22, drop=26, tilt=4)
    en.save(os.path.join(out_dir, "logo_en.png"))
    zh = sticker([("蹴鞠僧", "MaShanZheng-Regular.ttf", 420, -10)], [SAFFRON],
                 gap=0, outline=20, drop=26, tilt=4, bold=8, cel=45)
    zh.save(os.path.join(out_dir, "logo_zh.png"))
    print(f"logo_en {en.size}, logo_zh {zh.size}")


if __name__ == "__main__":
    main(sys.argv[1] if len(sys.argv) > 1 else "art/store")
