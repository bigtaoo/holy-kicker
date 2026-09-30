"""竖屏多视口可读性测试：同一个世界，分别用手机 9:16、桌面小 iframe、桌面全屏三种视口渲染。
逻辑分辨率 1080x1920；桌面端画面可放宽到 3:4 并拉近镜头（ZOOM）。
usage: python portrait_test.py <主角图> <杂兵图> <精英图> <输出前缀>"""
import random
import sys
from PIL import Image, ImageDraw, ImageFont


def cutout(src):
    """从四角泛洪抠掉白底，角色内部的白色保留。"""
    rgb = Image.open(src).convert("RGB")
    mark = (255, 0, 255)
    for xy in [(0, 0), (rgb.width - 1, 0), (0, rgb.height - 1), (rgb.width - 1, rgb.height - 1)]:
        ImageDraw.floodfill(rgb, xy, mark, thresh=40)
    im = Image.open(src).convert("RGBA")
    mask = Image.new("L", rgb.size, 255)
    mp, rp = mask.load(), rgb.load()
    for y in range(rgb.height):
        for x in range(rgb.width):
            if rp[x, y] == mark:
                mp[x, y] = 0
    im.putalpha(mask)
    return im.crop(im.getbbox())


def fit(im, h):
    return im.resize((round(im.width * h / im.height), h), Image.LANCZOS)


def font(size):
    try:
        return ImageFont.truetype("arial.ttf", size)
    except OSError:
        return ImageFont.load_default(size=size)


# 逻辑单位（1080 宽设计稿）
HERO_H, MOB_H, ELITE_H = 120, 80, 130
LW, LH = 1080, 1920
ZOOM = 1.3          # 桌面端镜头拉近倍数
DESK_ASPECT = 3 / 4  # 桌面端画面最宽到 3:4
GROUND = (58, 74, 60)
SIDE = (28, 32, 30)

hero_src, mob_src, elite_src, prefix = sys.argv[1:5]
hero = fit(cutout(hero_src), HERO_H)
mob = fit(cutout(mob_src), MOB_H)
elite = fit(cutout(elite_src), ELITE_H)

# 世界比手机视野宽，给桌面 3:4 视野留余量
WW, WH = 1500, LH
cx, cy = WW // 2, WH // 2
rng = random.Random(7)
world = Image.new("RGBA", (WW, WH), GROUND + (255,))
sprites = []
for _ in range(90):
    x, y = rng.randint(0, WW - mob.width), rng.randint(0, WH - mob.height)
    if abs(x + mob.width / 2 - cx) < 220 and abs(y + mob.height / 2 - cy) < 220:
        continue
    sprites.append((y + mob.height, mob, x, y))
sprites.append((cy - 420 + elite.height, elite, cx + 60, cy - 420))  # 精英从上方来
sprites.append((cy - HERO_H // 2 + hero.height, hero, cx - hero.width // 2, cy - HERO_H // 2))
for _, im, x, y in sorted(sprites, key=lambda s: s[0]):
    world.alpha_composite(im, (x, y))


def ui(img, scale):
    """顶部血条 + 48 逻辑 px 文字，检查 UI 字号在该视口下是否可读。"""
    d = ImageDraw.Draw(img)
    pad, bar_h = round(24 * scale), round(28 * scale)
    d.rectangle([pad, pad, img.width - pad, pad + bar_h], fill=(120, 30, 30))
    d.rectangle([pad, pad, pad + (img.width - 2 * pad) * 0.7, pad + bar_h], fill=(220, 60, 50))
    d.text((pad, pad + bar_h + round(10 * scale)), "Lv 7   Kills 1234   03:21",
           fill="white", font=font(max(6, round(48 * scale))), stroke_width=max(1, round(4 * scale)), stroke_fill="black")


def render(name, cw, ch, desktop):
    if desktop:
        # 视野高度按 ZOOM 缩小，宽度在 9:16 到 3:4 之间尽量铺满容器
        vh = LH / ZOOM
        vw = min(vh * DESK_ASPECT, vh * cw / ch)
    else:
        vw, vh = LW, LH
    scale = ch / vh
    view = world.crop((round(cx - vw / 2), round(cy - vh / 2), round(cx + vw / 2), round(cy + vh / 2)))
    view = view.resize((round(vw * scale), ch), Image.LANCZOS)
    ui(view, scale)
    canvas = Image.new("RGBA", (cw, ch), SIDE + (255,))
    canvas.alpha_composite(view, ((cw - view.width) // 2, 0))
    out = f"{prefix}_{name}.png"
    canvas.save(out)
    print(f"{out}: 画面 {view.width}x{view.height}, 主角 {HERO_H * scale:.0f}px, 杂兵 {MOB_H * scale:.0f}px, 字 {48 * scale:.0f}px")


render("phone", 1080, 1920, False)
render("desk_small", 821, 462, True)
render("desk_full", 1920, 1080, True)
