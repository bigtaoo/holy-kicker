import { Container, Graphics, type Text } from 'pixi.js';
import { COLORS } from './widgets';
import { RECORD_BURST, popScale, rayAlpha, sparkAt, sparks, type Spark } from './recordBurst';

// Draws the new-record cheer (recordBurst.ts) around the banner's cheer line: turning gold rays
// behind it, the words popping in, and a burst of warm sparks. `update(age)` moves it on.

const SPARK_COLORS = [COLORS.saffron, 0xffe08a, COLORS.text];
const RAYS = 12;

export class RecordBurstView {
  readonly view = new Container();
  private readonly rays = new Graphics();
  private readonly dots: [Graphics, Spark][] = [];

  constructor(private readonly words: Text) {
    // wedge rays from the middle, alternating long and short
    for (let i = 0; i < RAYS; i++) {
      const a = (i / RAYS) * Math.PI * 2;
      const r = i % 2 ? 380 : 520;
      const w = 0.09;
      this.rays.poly([0, 0, Math.cos(a - w) * r, Math.sin(a - w) * r, Math.cos(a + w) * r, Math.sin(a + w) * r]);
    }
    this.rays.fill({ color: 0xffd060, alpha: 0.35 });
    this.view.addChild(this.rays);
    for (const s of sparks()) {
      // a four-pointed star, outlined like the rest of the art
      const k = s.size;
      const g = new Graphics()
        .poly([0, -k, k * 0.3, -k * 0.3, k, 0, k * 0.3, k * 0.3, 0, k, -k * 0.3, k * 0.3, -k, 0, -k * 0.3, -k * 0.3])
        .fill(SPARK_COLORS[s.hue])
        .stroke({ color: COLORS.outline, width: 4 });
      this.dots.push([g, s]);
      this.view.addChild(g);
    }
    this.view.addChild(words);
    this.view.eventMode = 'none';
    this.update(0);
  }

  update(age: number): void {
    this.words.scale.set(popScale(age));
    this.rays.alpha = rayAlpha(age);
    this.rays.rotation = age * RECORD_BURST.spin * Math.PI * 2;
    this.rays.scale.set(Math.min(1, age / 0.25));
    for (const [g, s] of this.dots) {
      const p = sparkAt(s, age);
      g.position.set(p.x, p.y);
      g.alpha = p.alpha;
      g.rotation = age * 4 + s.dir;
    }
  }
}
