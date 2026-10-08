# Patrol scene (2026-10-08)

The patrol panel's window on the road (`client/src/ui/patrolScene.ts`): the chosen monk walks
right while the patrol piles up, the far hills scroll at 15 % of the road's pace, props pass on
the grass verge, a coin he finds every 2.2 s and each gear drop fly into the sack (the Shop's
pouch icon), which grows with the hours. Once the patrol is full he stops and a "Full" bubble
shows. The road and the verge are drawn in code.

All text-to-image from the `*.txt` prompts here (`gen.sh` generates whatever is missing), then

    python tools/patrol_art.py client/public/art/ui art/monk/ui/patrol/far.jpg 0.22-0.85 \
      art/monk/ui/patrol/{pine,lantern,rocks,bamboo,sign,bush}.jpg

- `far.jpg`: a 4:3 misty mountain landscape; the tool keeps the band from 22 % to 85 % of its
  height and cross-fades the last 12 % of its width into the start so it tiles
  (`client/public/art/ui/patrol_far.jpg`, 384 px tall, about 35 KB). It is painted with soft
  gradients rather than in the sticker style, which keeps it behind the monk and the props.
- Props: pine, stone lantern, rocks, bamboo, a blank signpost, a berry bush, cut out and packed
  into `patrol_props.{png,json}` (220 px, 192 colours, about 75 KB). They came with a little
  grass at their feet, which sits well on the verge.

Findings:
- First try: edit_image on a flat reference strip drawn in code (hill layers built to loop).
  It kept the flat vector shapes, clouds cut off on a straight line, and a second edit with a
  long list of details changed almost nothing. Text-to-image and a crop were far better.
