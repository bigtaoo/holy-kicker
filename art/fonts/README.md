# Fonts

Luckiest Guy and Ma Shan Zheng are used only by `tools/make_logo.py` to letter the logo; never
shipped in the game. Lilita One is the game's display font (titles, buttons, big numbers, damage
digits; `client/src/ui/fonts.ts`), shipped unmodified as `client/public/art/fonts/LilitaOne-Regular.ttf`
(OFL: the Reserved Font Name means a subset or other change must be renamed). The OFL requires the
licence to travel with the font, so `OFL-LilitaOne.txt` ships beside it in `client/public/art/fonts/`
(and so in every build, the WeChat package included); `client/public/THIRD-PARTY-NOTICES.txt` lists
the bundled code libraries' licences.

| File | Font | Licence |
|---|---|---|
| LuckiestGuy-Regular.ttf | Luckiest Guy (Astigmatic) | Apache 2.0, `LICENSE-LuckiestGuy.txt` |
| MaShanZheng-Regular.ttf | Ma Shan Zheng 马善政毛笔楷书 | SIL OFL 1.1, `OFL-MaShanZheng.txt` |
| client/public/art/fonts/LilitaOne-Regular.ttf | Lilita One (Juan Montoreano) | SIL OFL 1.1, `OFL-LilitaOne.txt` |

All from github.com/google/fonts (the first two 2026-10-04, Lilita One 2026-10-21).
