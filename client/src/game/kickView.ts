import { Container, Graphics, Sprite, type Text } from 'pixi.js';
import { FP, KICK, type Flyer, type MobKind, type Player, type SimEvent } from '@hk/engine';
import { t } from '../i18n';
import { COLORS, label } from '../ui/widgets';
import type { FxPool } from './fx';
import { lerpX, lerpY } from './fixedStep';
import type { MobLook } from './mobView';
import { SHADOW_Z } from './shadow';
import type { Shake } from './shake';
import { LOCAL } from './simEvents';

// The Holy Kick prototype's look (engine kick.ts, docs/kick-prototype.md): the kicked bodies
// spinning through the horde with a short trail, the charge as a ring at the monk's feet (so it
// sits right in both layouts), a "×7" over him as the chain grows, a beat of hit-stop on the kick
// and a gold burst where a body meets a wall, an elite or the boss.

/** How fast a body spins, in turns a second. */
const SPIN = 2.2;
/** Real seconds the view stands still as the kick lands. */
const HIT_STOP = 0.06;
/** How long the chain counter stays up after its last step. */
const COUNTER_TIME = 0.9;
/** The charge ring round the monk's feet: radius and the squash of the ground's perspective. */
const RING_R = 92;
const RING_ASPECT = 0.42;
const GOLD = COLORS.gold;

export class KickView {
  private readonly bodies = new Map<number, Sprite>();
  private readonly ring = new Graphics();
  private readonly counter: Text;
  private counterT = 0;
  private stop = 0;
  private pulse = 0;

  constructor(
    private readonly world: Container,
    private readonly look: (kind: MobKind) => MobLook,
    private readonly fx: FxPool,
    private readonly shake: Shake,
    counterZ: number,
  ) {
    this.ring.zIndex = SHADOW_Z + 0.5;
    this.counter = label('', 96, GOLD, { stroke: { color: COLORS.outline, width: 12 } }, true);
    this.counter.zIndex = counterZ;
    this.counter.visible = false;
    world.addChild(this.ring, this.counter);
  }

  /** One of the kick's events (simEvents.ts). Positions arrive in FP. */
  on(e: SimEvent): void {
    switch (e.type) {
      case 'kickReady':
        if (e.owner === LOCAL) this.pulse = 1;
        break;
      case 'holyKick':
        if (e.owner !== LOCAL) break;
        this.stop = HIT_STOP;
        this.shake.punch(e.dx, e.dy, 26);
        this.fx.emit({ shape: 'glow', x: e.x / FP, y: e.y / FP - 50, vx: 0, vy: 0, life: 0.14, size0: 170, size1: 60, rotation: 0, spin: 0, drag: 1, color: 0xffffff, alpha: 0.95 }, true);
        this.fx.emit({ shape: 'ring', x: e.x / FP, y: e.y / FP - 50, vx: 0, vy: 0, life: 0.25, size0: 40, size1: 260, rotation: 0, spin: 0, drag: 1, color: GOLD, alpha: 0.9 }, true);
        break;
      case 'kickChain':
        if (e.owner !== LOCAL || e.n < 2) break;
        this.counter.text = t('gear.count', { n: e.n });
        this.counter.scale.set(1 + Math.min(0.6, e.n * 0.05) + 0.35);
        this.counterT = COUNTER_TIME;
        break;
      case 'kickBurst': {
        this.shake.blow(e.wall ? 16 : 10);
        const x = e.x / FP, y = e.y / FP, r = e.radius / FP;
        for (let k = 0; k < 3; k++) {
          this.fx.emit({ shape: 'ring', x, y: y - 30, vx: 0, vy: 0, life: 0.3 + k * 0.1, size0: 40, size1: r * 2 * (0.6 + k * 0.25), rotation: 0, spin: 0, drag: 1, color: k === 1 ? 0xffffff : GOLD, alpha: 0.9 - k * 0.2, aspect: 0.6 }, true);
        }
        this.fx.emit({ shape: 'glow', x, y: y - 30, vx: 0, vy: 0, life: 0.2, size0: r * 1.4, size1: r * 0.4, rotation: 0, spin: 0, drag: 1, color: 0xfff4c0, alpha: 0.8 }, true);
        break;
      }
    }
  }

  /** The hit-stop: true while the view should stand still this frame (real seconds). */
  hold(real: number): boolean {
    if (this.stop <= 0) return false;
    this.stop -= real;
    return true;
  }

  draw(flyers: readonly Flyer[], p: Player, alpha: number, dt: number, hx: number, hy: number): void {
    this.drawBodies(flyers, alpha, dt);
    this.drawRing(p, dt, hx, hy);
    this.counterT = Math.max(0, this.counterT - dt);
    this.counter.visible = this.counterT > 0;
    if (!this.counter.visible) return;
    // pops in large, settles, and fades out at the end
    const s = this.counter.scale.x;
    this.counter.scale.set(s + (1 - s) * Math.min(1, dt * 12));
    this.counter.alpha = Math.min(1, this.counterT / 0.25);
    this.counter.position.set(hx, hy - 200);
  }

  private drawBodies(flyers: readonly Flyer[], alpha: number, dt: number): void {
    const seen = new Set<number>();
    for (const f of flyers) {
      seen.add(f.id);
      let s = this.bodies.get(f.id);
      if (!s) {
        const look = this.look(f.kind);
        const tex = look.sheet.textures[0];
        s = new Sprite(tex);
        s.anchor.set(0.5);
        s.scale.set(look.height / tex.height);
        if (look.tint !== undefined) s.tint = look.tint;
        this.bodies.set(f.id, s);
        this.world.addChild(s);
      }
      const x = lerpX(f, alpha), y = lerpY(f, alpha) - 60;
      s.position.set(x, y);
      s.rotation += (f.vx >= 0 ? 1 : -1) * SPIN * 2 * Math.PI * dt;
      s.zIndex = y + 60;
      this.fx.emit({ shape: 'puff', x, y, vx: 0, vy: 0, life: 0.22, size0: 46, size1: 12, rotation: 0, spin: 0, drag: 1, color: 0xfff4c0, alpha: 0.55 });
    }
    for (const [id, s] of this.bodies) {
      if (seen.has(id)) continue;
      s.destroy();
      this.bodies.delete(id);
    }
  }

  /** The charge as an arc round the feet; full, a pulsing gold ring. */
  private drawRing(p: Player, dt: number, hx: number, hy: number): void {
    const g = this.ring.clear();
    if (p.charge === undefined || p.dead) return;
    g.position.set(hx, hy);
    g.scale.set(1, RING_ASPECT);
    const full = p.charge >= KICK.full;
    this.pulse = Math.max(0, this.pulse - dt * 1.5);
    g.circle(0, 0, RING_R).stroke({ color: COLORS.outline, width: 14, alpha: 0.45 });
    if (full) {
      const beat = 0.5 + 0.5 * Math.sin(performance.now() / 160);
      g.circle(0, 0, RING_R + 18 * this.pulse).stroke({ color: GOLD, width: 12 + 6 * beat, alpha: 0.75 + 0.25 * beat });
    } else if (p.charge > 0) {
      const a = (p.charge / KICK.full) * 2 * Math.PI;
      g.arc(0, 0, RING_R, -Math.PI / 2, -Math.PI / 2 + a).stroke({ color: COLORS.saffron, width: 10, alpha: 0.9 });
    }
  }

  destroy(): void {
    for (const s of this.bodies.values()) s.destroy();
    this.bodies.clear();
  }
}
