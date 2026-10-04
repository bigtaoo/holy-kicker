# Store covers

Key art for the CrazyGames covers (`docs/store.md` "Images"). Each prompt is an edit of
`../rig/hero_apose_v3.png` so the monk stays on model:

    MISTRAL_KEY=D bash tools/edit_image.sh art/monk/rig/hero_apose_v3.png art/monk/store/cover_landscape.png art/monk/store/cover_landscape.txt

The pictures carry no text; the logo is laid over them afterwards, then each is cropped to
1920×1080, 800×1200 and 800×800.
