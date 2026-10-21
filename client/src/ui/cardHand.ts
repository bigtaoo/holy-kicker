import { Assets, Container, Graphics, Sprite, type Texture } from 'pixi.js';
import { tapPose } from './cardNudge';
import { COLORS } from './widgets';

// The hand of the card nudge (cardNudge.ts): the sticker hand (art/ui/hand.png, from
// art/ui/hand), its fingertip at the origin, the palm below and to the right so it covers little
// of the card, tapping with a gold ring. The picture loads the first time a nudge is built; the
// nudge waits seconds before it shows, so it is in by then.

const HAND = 'art/ui/hand.png';
/** Where the fingertip sits in the picture, as a share of its width and height. */
const TIP = { x: 0.47, y: 0.02 };
/** The drawn height, in logical units. */
const HEIGHT = 230;

let texture: Texture | null = null;
let loading: Promise<Texture | null> | null = null;

function handTexture(): Promise<Texture | null> {
  loading ??= Assets.load<Texture>(HAND).then(
    (t) => (texture = t),
    () => ((loading = null), null),
  );
  return loading;
}

export interface CardHand {
  view: Container;
  /** Poses the tap `t` seconds into the nudge. */
  update(t: number): void;
}

export function cardHand(): CardHand {
  const view = new Container();
  view.eventMode = 'none';
  const ring = new Graphics();
  const hand = new Sprite();
  hand.anchor.set(TIP.x, TIP.y);
  hand.rotation = -0.3;
  const dress = (t: Texture) => {
    hand.texture = t;
    hand.scale.set(HEIGHT / t.height);
  };
  if (texture) dress(texture);
  else void handTexture().then((t) => t && !hand.destroyed && dress(t));
  view.addChild(ring, hand);
  const update = (t: number) => {
    const { lift, ripple } = tapPose(t);
    hand.position.set(lift * 22, lift * 56);
    // pressed, the hand sinks a little into the card
    const base = hand.texture.height > 1 ? HEIGHT / hand.texture.height : 1;
    hand.scale.set(base * (1 - 0.08 * (1 - lift)));
    ring.clear();
    if (ripple >= 0) ring.circle(0, 0, 36 + ripple * 110).stroke({ color: COLORS.gold, width: 14 * (1 - ripple) + 4, alpha: 1 - ripple * 0.8 });
  };
  update(0);
  return { view, update };
}
