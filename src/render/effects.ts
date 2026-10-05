/**
 * Short-lived visual effects (rings, sparks) drawn in world coordinates.
 */
export type EffectKind = 'birth' | 'death' | 'kill' | 'meteor' | 'spawn' | 'feed' | 'smite' | 'learn';

export interface Effect {
  kind: EffectKind;
  x: number;
  y: number;
  /** Age in seconds of real time. */
  t: number;
  life: number;
  radius: number;
  color: string;
}

const MAX_EFFECTS = 160;

export class Effects {
  list: Effect[] = [];

  add(kind: EffectKind, x: number, y: number, color: string, radius = 10): void {
    const life =
      kind === 'meteor' ? 2.2 : kind === 'death' ? 1.1 : kind === 'smite' ? 0.9 : kind === 'learn' ? 1.2 : 0.8;
    if (this.list.length >= MAX_EFFECTS) {
      // Drop the oldest cosmetic effect; meteors always get through.
      const i = this.list.findIndex((e) => e.kind !== 'meteor');
      if (i >= 0) this.list.splice(i, 1);
      else return;
    }
    this.list.push({ kind, x, y, t: 0, life, radius, color });
  }

  update(dt: number): void {
    let w = 0;
    for (const e of this.list) {
      e.t += dt;
      if (e.t < e.life) this.list[w++] = e;
    }
    this.list.length = w;
  }

  draw(ctx: CanvasRenderingContext2D, zoom: number): void {
    const px = 1 / zoom;
    for (const e of this.list) {
      const p = e.t / e.life;
      const ease = 1 - (1 - p) * (1 - p);
      ctx.globalAlpha = Math.max(0, 1 - p);
      switch (e.kind) {
        case 'birth':
        case 'spawn':
        case 'feed':
        case 'learn': {
          ctx.strokeStyle = e.color;
          ctx.lineWidth = Math.max(1.2 * px, (1 - p) * 2.4 * px);
          ctx.beginPath();
          ctx.arc(e.x, e.y, e.radius * (1 + ease * 2.2), 0, Math.PI * 2);
          ctx.stroke();
          if (e.kind === 'spawn' || e.kind === 'feed') {
            ctx.beginPath();
            ctx.arc(e.x, e.y, e.radius * (1 + ease * 1.2), 0, Math.PI * 2);
            ctx.stroke();
          }
          break;
        }
        case 'death':
        case 'kill': {
          ctx.fillStyle = e.color;
          const n = 7;
          for (let i = 0; i < n; i++) {
            const a = (i / n) * Math.PI * 2 + e.x * 0.01;
            const d = e.radius * (0.6 + ease * 1.8);
            ctx.beginPath();
            ctx.arc(e.x + Math.cos(a) * d, e.y + Math.sin(a) * d, Math.max(0.8 * px, e.radius * 0.14 * (1 - p)), 0, Math.PI * 2);
            ctx.fill();
          }
          if (e.kind === 'kill') {
            ctx.strokeStyle = e.color;
            ctx.lineWidth = 2 * px;
            ctx.beginPath();
            ctx.arc(e.x, e.y, e.radius * (1 + ease), 0, Math.PI * 2);
            ctx.stroke();
          }
          break;
        }
        case 'smite': {
          ctx.strokeStyle = e.color;
          ctx.lineWidth = 3 * px * (1 - p);
          ctx.beginPath();
          const top = e.y - 600;
          ctx.moveTo(e.x, top);
          let yy = top;
          let xx = e.x;
          while (yy < e.y) {
            yy += 60;
            xx = e.x + (yy < e.y ? Math.sin(yy * 0.37 + e.t * 40) * 18 : 0);
            ctx.lineTo(xx, Math.min(yy, e.y));
          }
          ctx.stroke();
          ctx.beginPath();
          ctx.arc(e.x, e.y, e.radius * (1 + ease * 3), 0, Math.PI * 2);
          ctx.stroke();
          break;
        }
        case 'meteor': {
          ctx.strokeStyle = e.color;
          ctx.lineWidth = 6 * px * (1 - p) + px;
          ctx.beginPath();
          ctx.arc(e.x, e.y, e.radius * (0.3 + ease * 1.2), 0, Math.PI * 2);
          ctx.stroke();
          ctx.fillStyle = e.color;
          ctx.globalAlpha = Math.max(0, 0.35 * (1 - p * 1.6));
          ctx.beginPath();
          ctx.arc(e.x, e.y, e.radius * (0.2 + ease), 0, Math.PI * 2);
          ctx.fill();
          break;
        }
      }
    }
    ctx.globalAlpha = 1;
  }
}
