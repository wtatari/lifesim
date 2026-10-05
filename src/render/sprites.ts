import { hueRgb } from './palette.ts';

/**
 * Pre-rendered glow sprites. Drawing a cached image is far cheaper than
 * building a fresh gradient for every plant on every frame.
 */

function makeCanvas(size: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const ctx = c.getContext('2d')!;
  return [c, ctx];
}

export function glowSprite(rgb: [number, number, number], core = 0.22, size = 64): HTMLCanvasElement {
  const [c, ctx] = makeCanvas(size);
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  const [r, gg, b] = rgb;
  g.addColorStop(0, `rgba(${Math.min(255, r + 90)}, ${Math.min(255, gg + 90)}, ${Math.min(255, b + 90)}, 1)`);
  g.addColorStop(core, `rgba(${r}, ${gg}, ${b}, 0.95)`);
  g.addColorStop(core + 0.12, `rgba(${r}, ${gg}, ${b}, 0.32)`);
  g.addColorStop(0.62, `rgba(${r}, ${gg}, ${b}, 0.08)`);
  g.addColorStop(1, `rgba(${r}, ${gg}, ${b}, 0)`);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  return c;
}

/** Soft cell body: bright cytoplasm, darker membrane, thin bright rim. */
export function bodySprite(hue: number, size = 96): HTMLCanvasElement {
  const [c, ctx] = makeCanvas(size);
  const r = size / 2;
  const [cr, cg, cb] = hueRgb(hue, 0.7, 0.62);
  const [dr, dg, db] = hueRgb(hue, 0.75, 0.42);
  const [lr, lg, lb] = hueRgb(hue, 0.9, 0.82);
  const g = ctx.createRadialGradient(r * 0.85, r * 0.8, r * 0.05, r, r, r * 0.98);
  g.addColorStop(0, `rgba(${lr}, ${lg}, ${lb}, 0.95)`);
  g.addColorStop(0.45, `rgba(${cr}, ${cg}, ${cb}, 0.92)`);
  g.addColorStop(0.86, `rgba(${dr}, ${dg}, ${db}, 0.95)`);
  g.addColorStop(1, `rgba(${dr}, ${dg}, ${db}, 0)`);
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(r, r, r * 0.98, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = `rgba(${lr}, ${lg}, ${lb}, 0.75)`;
  ctx.lineWidth = size * 0.035;
  ctx.beginPath();
  ctx.arc(r, r, r * 0.9, 0, Math.PI * 2);
  ctx.stroke();
  return c;
}

export class SpriteCache {
  readonly plant: HTMLCanvasElement;
  readonly berry: HTMLCanvasElement;
  readonly meat: HTMLCanvasElement;
  readonly spark: HTMLCanvasElement;
  private bodies = new Map<number, HTMLCanvasElement>();
  private glows = new Map<number, HTMLCanvasElement>();

  constructor() {
    this.plant = glowSprite([98, 242, 160], 0.2);
    this.berry = glowSprite([185, 139, 255], 0.26);
    this.meat = glowSprite([255, 93, 122], 0.3);
    this.spark = glowSprite([255, 255, 255], 0.1, 32);
  }

  private bucket(h: number): number {
    return Math.round(((h % 1) + 1) % 1 * 48) % 48;
  }

  body(hue: number): HTMLCanvasElement {
    const b = this.bucket(hue);
    let s = this.bodies.get(b);
    if (!s) {
      s = bodySprite(b / 48);
      this.bodies.set(b, s);
    }
    return s;
  }

  glow(hue: number): HTMLCanvasElement {
    const b = this.bucket(hue);
    let s = this.glows.get(b);
    if (!s) {
      s = glowSprite(hueRgb(b / 48, 0.8, 0.6), 0.05, 64);
      this.glows.set(b, s);
    }
    return s;
  }
}
