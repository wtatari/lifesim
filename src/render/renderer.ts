import type { Creature } from '../sim/creature.ts';
import { G } from '../sim/genome.ts';
import type { World } from '../sim/world.ts';
import { Effects } from './effects.ts';
import { hueColor, PAL } from './palette.ts';
import { SpriteCache } from './sprites.ts';

export interface Camera {
  x: number;
  y: number;
  /** Screen pixels per world unit (μm). */
  zoom: number;
}

export interface RenderState {
  selectedId: number | null;
  hoveredId: number | null;
  highlightSpecies: number | null;
  showVision: boolean;
  trail: { x: number; y: number }[] | null;
  /** Pointer position in world coordinates (for tool previews). */
  pointer: { x: number; y: number } | null;
  toolRadius: number;
  toolColor: string;
  /** Interpolation between the previous and current physics step (0..1). */
  alpha: number;
}

const TAU = Math.PI * 2;

export class Renderer {
  readonly canvas: HTMLCanvasElement;
  readonly ctx: CanvasRenderingContext2D;
  readonly sprites = new SpriteCache();
  readonly effects = new Effects();
  camera: Camera = { x: 0, y: 0, zoom: 0.5 };
  target: Camera = { x: 0, y: 0, zoom: 0.5 };
  width = 1;
  height = 1;
  dpr = 1;
  /** Seconds of real time, for animation. */
  clock = 0;
  /** Screen area covered by floating panels (px), so framing ignores it. */
  insets = { left: 0, right: 0, top: 0, bottom: 0 };
  private dishTex: HTMLCanvasElement | null = null;
  private worldRadius = 800;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    const ctx = canvas.getContext('2d', { alpha: false });
    if (!ctx) throw new Error('Canvas 2D is not available');
    this.ctx = ctx;
    this.resize();
  }

  resize(): void {
    const rect = this.canvas.getBoundingClientRect();
    this.dpr = Math.min(2, window.devicePixelRatio || 1);
    this.width = Math.max(1, rect.width);
    this.height = Math.max(1, rect.height);
    this.canvas.width = Math.round(this.width * this.dpr);
    this.canvas.height = Math.round(this.height * this.dpr);
  }

  // ---------------------------------------------------------------------------
  // Camera
  // ---------------------------------------------------------------------------

  /** Centre of the visible area (inside the panels), in screen pixels. */
  get viewCenter(): { x: number; y: number } {
    const i = this.insets;
    const w = Math.max(80, this.width - i.left - i.right);
    const h = Math.max(80, this.height - i.top - i.bottom);
    return { x: i.left + w / 2, y: i.top + h / 2 };
  }

  fitZoom(radius = this.worldRadius): number {
    const i = this.insets;
    const w = Math.max(160, this.width - i.left - i.right);
    const h = Math.max(160, this.height - i.top - i.bottom);
    return Math.min(w, h) / (radius * 2 * 1.06);
  }

  minZoom(): number {
    return this.fitZoom() * 0.7;
  }

  maxZoom(): number {
    return 9;
  }

  /** Updates the area covered by panels; keeps the whole dish in view if it was. */
  setInsets(next: { left: number; right: number; top: number; bottom: number }): void {
    const i = this.insets;
    if (i.left === next.left && i.right === next.right && i.top === next.top && i.bottom === next.bottom) return;
    const fz = this.fitZoom();
    const wasFit = Math.abs(this.target.zoom - fz) / fz < 0.04 && Math.hypot(this.target.x, this.target.y) < this.worldRadius * 0.05;
    this.insets = { ...next };
    if (wasFit) this.fit(this.worldRadius);
  }

  fit(radius: number, instant = false): void {
    this.worldRadius = radius;
    this.target = { x: 0, y: 0, zoom: this.fitZoom(radius) };
    if (instant) this.camera = { ...this.target };
  }

  /** Zoom by a factor, keeping the world point under the screen point fixed. */
  zoomAt(sx: number, sy: number, factor: number): void {
    const t = this.target;
    const c = this.viewCenter;
    const nz = Math.max(this.minZoom(), Math.min(this.maxZoom(), t.zoom * factor));
    const wx = t.x + (sx - c.x) / t.zoom;
    const wy = t.y + (sy - c.y) / t.zoom;
    t.x = wx - (sx - c.x) / nz;
    t.y = wy - (sy - c.y) / nz;
    t.zoom = nz;
    this.clampTarget();
  }

  panBy(dxScreen: number, dyScreen: number): void {
    this.target.x -= dxScreen / this.target.zoom;
    this.target.y -= dyScreen / this.target.zoom;
    this.clampTarget();
    this.camera.x = this.target.x;
    this.camera.y = this.target.y;
  }

  centerOn(x: number, y: number, zoom?: number): void {
    this.target.x = x;
    this.target.y = y;
    if (zoom) this.target.zoom = Math.max(this.minZoom(), Math.min(this.maxZoom(), zoom));
    this.clampTarget();
  }

  private clampTarget(): void {
    const t = this.target;
    const lim = this.worldRadius * 1.05;
    const d = Math.hypot(t.x, t.y);
    if (d > lim) {
      t.x *= lim / d;
      t.y *= lim / d;
    }
  }

  screenToWorld(sx: number, sy: number): { x: number; y: number } {
    const c = this.camera;
    const v = this.viewCenter;
    return { x: c.x + (sx - v.x) / c.zoom, y: c.y + (sy - v.y) / c.zoom };
  }

  worldToScreen(wx: number, wy: number): { x: number; y: number } {
    const c = this.camera;
    const v = this.viewCenter;
    return { x: (wx - c.x) * c.zoom + v.x, y: (wy - c.y) * c.zoom + v.y };
  }

  private updateCamera(dt: number): void {
    const k = 1 - Math.exp(-dt * 10);
    const c = this.camera;
    const t = this.target;
    c.x += (t.x - c.x) * k;
    c.y += (t.y - c.y) * k;
    const lz = Math.log(c.zoom) + (Math.log(t.zoom) - Math.log(c.zoom)) * k;
    c.zoom = Math.exp(lz);
  }

  // ---------------------------------------------------------------------------
  // Frame
  // ---------------------------------------------------------------------------

  render(world: World, s: RenderState, dt: number): void {
    this.clock += dt;
    this.updateCamera(dt);
    this.effects.update(dt);
    const R = world.config.radius;
    if (R !== this.worldRadius) this.worldRadius = R;

    const { ctx, width: W, height: H, dpr } = this;
    const cam = this.camera;
    const z = cam.zoom;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
    ctx.fillStyle = PAL.void;
    ctx.fillRect(0, 0, W, H);

    const vc = this.viewCenter;
    ctx.setTransform(dpr * z, 0, 0, dpr * z, dpr * (vc.x - cam.x * z), dpr * (vc.y - cam.y * z));
    const view = {
      x0: cam.x - vc.x / z,
      x1: cam.x + (W - vc.x) / z,
      y0: cam.y - vc.y / z,
      y1: cam.y + (H - vc.y) / z,
    };

    this.drawDish(R);
    ctx.save();
    ctx.beginPath();
    ctx.arc(0, 0, R, 0, TAU);
    ctx.clip();
    this.drawHotspots(world);
    this.drawGrid(view, z);
    this.drawMeat(world, view, z);
    this.drawPlants(world, view, z);

    const selected = s.selectedId !== null ? world.getCreature(s.selectedId) : undefined;
    if (selected && s.trail) this.drawTrail(s.trail, selected, z);
    if (selected && s.showVision) this.drawVision(selected, s.alpha, z);

    this.drawCreatures(world, s, view, z);
    this.effects.draw(ctx, z);
    ctx.restore();

    this.drawRim(R, z);
    if (s.pointer && s.toolRadius > 0) this.drawToolCursor(s.pointer, s.toolRadius, s.toolColor, z);
  }

  // ---------------------------------------------------------------------------
  // Background
  // ---------------------------------------------------------------------------

  private makeDishTexture(): HTMLCanvasElement {
    const size = 1024;
    const c = document.createElement('canvas');
    c.width = c.height = size;
    const ctx = c.getContext('2d')!;
    const r = size / 2;
    const g = ctx.createRadialGradient(r * 0.92, r * 0.86, r * 0.05, r, r, r);
    g.addColorStop(0, '#0f1a27');
    g.addColorStop(0.55, '#0b141f');
    g.addColorStop(0.9, '#08101a');
    g.addColorStop(1, '#060c14');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(r, r, r, 0, TAU);
    ctx.fill();
    // Agar speckle: tiny specks of debris suspended in the medium.
    let seed = 1234567;
    const rand = () => {
      seed = (seed * 1103515245 + 12345) & 0x7fffffff;
      return seed / 0x7fffffff;
    };
    for (let i = 0; i < 2600; i++) {
      const a = rand() * TAU;
      const d = Math.sqrt(rand()) * r * 0.98;
      const x = r + Math.cos(a) * d;
      const y = r + Math.sin(a) * d;
      const s = rand() < 0.94 ? 0.6 + rand() * 0.9 : 1.6 + rand() * 2;
      ctx.fillStyle = `rgba(150, 190, 230, ${0.02 + rand() * 0.05})`;
      ctx.beginPath();
      ctx.arc(x, y, s, 0, TAU);
      ctx.fill();
    }
    // Meniscus: light gathering near the glass wall.
    const m = ctx.createRadialGradient(r, r, r * 0.86, r, r, r);
    m.addColorStop(0, 'rgba(120, 180, 255, 0)');
    m.addColorStop(0.85, 'rgba(120, 180, 255, 0.05)');
    m.addColorStop(1, 'rgba(160, 210, 255, 0.12)');
    ctx.fillStyle = m;
    ctx.beginPath();
    ctx.arc(r, r, r, 0, TAU);
    ctx.fill();
    return c;
  }

  private drawDish(R: number): void {
    if (!this.dishTex) this.dishTex = this.makeDishTexture();
    const ctx = this.ctx;
    // Soft halo of light around the dish (the microscope's lamp).
    const halo = ctx.createRadialGradient(0, 0, R * 0.9, 0, 0, R * 1.35);
    halo.addColorStop(0, 'rgba(60, 120, 200, 0.10)');
    halo.addColorStop(1, 'rgba(60, 120, 200, 0)');
    ctx.fillStyle = halo;
    ctx.beginPath();
    ctx.arc(0, 0, R * 1.35, 0, TAU);
    ctx.fill();
    ctx.drawImage(this.dishTex, -R, -R, R * 2, R * 2);
  }

  private drawRim(R: number, z: number): void {
    const ctx = this.ctx;
    const px = 1 / z;
    ctx.strokeStyle = 'rgba(8, 14, 22, 0.9)';
    ctx.lineWidth = 7 * px;
    ctx.beginPath();
    ctx.arc(0, 0, R + 3.5 * px, 0, TAU);
    ctx.stroke();
    ctx.strokeStyle = 'rgba(140, 200, 255, 0.35)';
    ctx.lineWidth = 1.4 * px;
    ctx.beginPath();
    ctx.arc(0, 0, R, 0, TAU);
    ctx.stroke();
    ctx.strokeStyle = 'rgba(140, 200, 255, 0.12)';
    ctx.lineWidth = 1 * px;
    ctx.beginPath();
    ctx.arc(0, 0, R + 8 * px, 0, TAU);
    ctx.stroke();
    // Graduation marks every 5°, longer every 30°.
    ctx.strokeStyle = 'rgba(140, 200, 255, 0.22)';
    ctx.lineWidth = 1 * px;
    ctx.beginPath();
    for (let deg = 0; deg < 360; deg += 5) {
      const a = (deg * Math.PI) / 180;
      const len = (deg % 30 === 0 ? 9 : 4) * px;
      const r0 = R + 9 * px;
      ctx.moveTo(Math.cos(a) * r0, Math.sin(a) * r0);
      ctx.lineTo(Math.cos(a) * (r0 + len), Math.sin(a) * (r0 + len));
    }
    ctx.stroke();
  }

  private drawHotspots(world: World): void {
    const ctx = this.ctx;
    ctx.globalCompositeOperation = 'lighter';
    for (const h of world.hotspots) {
      const rr = h.r * 1.7;
      const g = ctx.createRadialGradient(h.x, h.y, 0, h.x, h.y, rr);
      const a = 0.05 + 0.035 * h.strength;
      if (h.kind === 0) {
        g.addColorStop(0, `rgba(98, 242, 160, ${a})`);
        g.addColorStop(0.5, `rgba(70, 200, 140, ${a * 0.45})`);
        g.addColorStop(1, 'rgba(60, 180, 130, 0)');
      } else {
        g.addColorStop(0, `rgba(185, 139, 255, ${a})`);
        g.addColorStop(0.5, `rgba(150, 110, 230, ${a * 0.45})`);
        g.addColorStop(1, 'rgba(140, 100, 220, 0)');
      }
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(h.x, h.y, rr, 0, TAU);
      ctx.fill();
    }
    ctx.globalCompositeOperation = 'source-over';
  }

  /** Hemocytometer-style counting grid that fades in as you zoom. */
  private drawGrid(view: { x0: number; x1: number; y0: number; y1: number }, z: number): void {
    const alpha = Math.max(0, Math.min(0.11, (z - 0.9) * 0.08));
    if (alpha <= 0.005) return;
    const ctx = this.ctx;
    const step = z > 3 ? 25 : 50;
    ctx.strokeStyle = `rgba(140, 200, 255, ${alpha})`;
    ctx.lineWidth = 1 / z;
    ctx.beginPath();
    for (let x = Math.floor(view.x0 / step) * step; x <= view.x1; x += step) {
      ctx.moveTo(x, view.y0);
      ctx.lineTo(x, view.y1);
    }
    for (let y = Math.floor(view.y0 / step) * step; y <= view.y1; y += step) {
      ctx.moveTo(view.x0, y);
      ctx.lineTo(view.x1, y);
    }
    ctx.stroke();
  }

  private drawPlants(world: World, view: { x0: number; x1: number; y0: number; y1: number }, z: number): void {
    const ctx = this.ctx;
    const { plant, berry } = this.sprites;
    const minS = 2.4 / z;
    const toxic = world.berriesToxic;
    ctx.globalCompositeOperation = 'lighter';
    const pulse = 0.85 + 0.15 * Math.sin(this.clock * 2.2);
    for (const p of world.plants) {
      if (p.x < view.x0 - 12 || p.x > view.x1 + 12 || p.y < view.y0 - 12 || p.y > view.y1 + 12) continue;
      const s = Math.max(p.r * 2.9, minS);
      if (p.kind === 0) {
        ctx.globalAlpha = 0.65 + 0.35 * (p.energy / p.maxEnergy);
        ctx.drawImage(plant, p.x - s, p.y - s, s * 2, s * 2);
      } else {
        ctx.globalAlpha = pulse;
        ctx.drawImage(berry, p.x - s, p.y - s, s * 2, s * 2);
      }
    }
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
    // Toxic berries get a faint warning ring that only you can see.
    if (toxic && z > 0.9) {
      ctx.strokeStyle = 'rgba(255, 93, 122, 0.55)';
      ctx.lineWidth = 1 / z;
      ctx.setLineDash([2 / z, 2 / z]);
      ctx.beginPath();
      for (const p of world.plants) {
        if (p.kind !== 1) continue;
        if (p.x < view.x0 || p.x > view.x1 || p.y < view.y0 || p.y > view.y1) continue;
        ctx.moveTo(p.x + p.r * 1.9, p.y);
        ctx.arc(p.x, p.y, p.r * 1.9, 0, TAU);
      }
      ctx.stroke();
      ctx.setLineDash([]);
    }
  }

  private drawMeat(world: World, view: { x0: number; x1: number; y0: number; y1: number }, z: number): void {
    const ctx = this.ctx;
    const sprite = this.sprites.meat;
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = 0.45;
    for (const m of world.meats) {
      if (m.x < view.x0 - 20 || m.x > view.x1 + 20 || m.y < view.y0 - 20 || m.y > view.y1 + 20) continue;
      const s = Math.max(m.r * 1.9, 2.6 / z);
      ctx.drawImage(sprite, m.x - s, m.y - s, s * 2, s * 2);
    }
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
    if (z * 3 > 2) {
      // A soft, lumpy chunk of tissue.
      for (const m of world.meats) {
        if (m.x < view.x0 - 20 || m.x > view.x1 + 20 || m.y < view.y0 - 20 || m.y > view.y1 + 20) continue;
        const r = m.r * 0.62;
        ctx.fillStyle = '#c8475f';
        ctx.beginPath();
        ctx.arc(m.x, m.y, r, 0, TAU);
        ctx.arc(m.x + r * 0.55, m.y - r * 0.35, r * 0.62, 0, TAU);
        ctx.arc(m.x - r * 0.45, m.y + r * 0.45, r * 0.55, 0, TAU);
        ctx.fill();
        ctx.fillStyle = 'rgba(255, 190, 200, 0.55)';
        ctx.beginPath();
        ctx.arc(m.x - r * 0.25, m.y - r * 0.3, r * 0.25, 0, TAU);
        ctx.fill();
      }
    }
  }

  // ---------------------------------------------------------------------------
  // Creatures
  // ---------------------------------------------------------------------------

  private drawCreatures(world: World, s: RenderState, view: { x0: number; x1: number; y0: number; y1: number }, z: number): void {
    const a = s.alpha;
    for (const c of world.creatures) {
      const x = c.prevX + (c.x - c.prevX) * a;
      const y = c.prevY + (c.y - c.prevY) * a;
      const r = c.radius;
      if (x < view.x0 - r * 4 || x > view.x1 + r * 4 || y < view.y0 - r * 4 || y > view.y1 + r * 4) continue;
      let da = c.angle - c.prevAngle;
      if (da > Math.PI) da -= TAU;
      else if (da < -Math.PI) da += TAU;
      const ang = c.prevAngle + da * a;
      const dim = s.highlightSpecies !== null && c.speciesId !== s.highlightSpecies;
      this.drawCreature(c, x, y, ang, z, dim);
      if (c.id === s.selectedId) this.drawSelectionRing(x, y, r, z);
      else if (c.id === s.hoveredId) this.drawHoverRing(x, y, r, z);
    }
  }

  drawCreature(c: Creature, x: number, y: number, ang: number, z: number, dim: boolean): void {
    drawCreatureShape(this.ctx, this.sprites, this.clock, c, x, y, ang, z, dim);
  }

  private drawSelectionRing(x: number, y: number, r: number, z: number): void {
    const ctx = this.ctx;
    ctx.strokeStyle = PAL.cfp;
    ctx.lineWidth = 1.6 / z;
    ctx.setLineDash([6 / z, 5 / z]);
    ctx.lineDashOffset = -this.clock * 18 / z;
    ctx.beginPath();
    ctx.arc(x, y, r + 7 / z, 0, TAU);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.lineDashOffset = 0;
    // Corner brackets like a microscope reticle.
    const b = r + 12 / z;
    const l = 6 / z;
    ctx.lineWidth = 1.4 / z;
    ctx.beginPath();
    for (const [sx, sy] of [
      [-1, -1],
      [1, -1],
      [1, 1],
      [-1, 1],
    ]) {
      ctx.moveTo(x + sx * b, y + sy * (b - l));
      ctx.lineTo(x + sx * b, y + sy * b);
      ctx.lineTo(x + sx * (b - l), y + sy * b);
    }
    ctx.stroke();
  }

  private drawHoverRing(x: number, y: number, r: number, z: number): void {
    const ctx = this.ctx;
    ctx.strokeStyle = 'rgba(230, 237, 245, 0.55)';
    ctx.lineWidth = 1.2 / z;
    ctx.beginPath();
    ctx.arc(x, y, r + 5 / z, 0, TAU);
    ctx.stroke();
  }

  private drawVision(c: Creature, alpha: number, z: number): void {
    const ctx = this.ctx;
    const x = c.prevX + (c.x - c.prevX) * alpha;
    const y = c.prevY + (c.y - c.prevY) * alpha;
    let da = c.angle - c.prevAngle;
    if (da > Math.PI) da -= TAU;
    else if (da < -Math.PI) da += TAU;
    const ang = c.prevAngle + da * alpha;
    const R = c.traits.visionRange;
    const half = c.traits.fov / 2;
    const g = ctx.createRadialGradient(x, y, c.radius, x, y, R);
    g.addColorStop(0, 'rgba(79, 214, 255, 0.16)');
    g.addColorStop(0.7, 'rgba(79, 214, 255, 0.06)');
    g.addColorStop(1, 'rgba(79, 214, 255, 0.015)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.arc(x, y, R, ang - half, ang + half);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = 'rgba(79, 214, 255, 0.4)';
    ctx.lineWidth = 1 / z;
    ctx.stroke();
    // Centre line: straight ahead.
    ctx.setLineDash([3 / z, 5 / z]);
    ctx.strokeStyle = 'rgba(79, 214, 255, 0.25)';
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + Math.cos(ang) * R, y + Math.sin(ang) * R);
    ctx.stroke();
    ctx.setLineDash([]);

    const colors = [PAL.gfp, PAL.berry, PAL.mcherry, PAL.yfp];
    for (let k = 0; k < 4; k++) {
      const o = c.seen[k];
      if (!o) continue;
      ctx.strokeStyle = colors[k];
      ctx.globalAlpha = 0.8;
      ctx.lineWidth = 1.2 / z;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(o.x, o.y);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(o.x, o.y, 7 / z + 3, 0, TAU);
      ctx.stroke();
      ctx.globalAlpha = 1;
    }
  }

  private drawTrail(trail: { x: number; y: number }[], c: Creature, z: number): void {
    if (trail.length < 2) return;
    const ctx = this.ctx;
    ctx.lineWidth = 1.4 / z;
    ctx.lineCap = 'round';
    const n = trail.length;
    for (let i = 1; i < n; i++) {
      ctx.strokeStyle = hueColor(c.traits.hue, 80, 70, (i / n) * 0.45);
      ctx.beginPath();
      ctx.moveTo(trail[i - 1].x, trail[i - 1].y);
      ctx.lineTo(trail[i].x, trail[i].y);
      ctx.stroke();
    }
  }

  private drawToolCursor(p: { x: number; y: number }, r: number, color: string, z: number): void {
    const ctx = this.ctx;
    ctx.strokeStyle = color;
    ctx.lineWidth = 1.5 / z;
    ctx.setLineDash([5 / z, 4 / z]);
    ctx.lineDashOffset = -this.clock * 12 / z;
    ctx.beginPath();
    ctx.arc(p.x, p.y, r, 0, TAU);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.lineDashOffset = 0;
  }

  // ---------------------------------------------------------------------------
  // Minimap
  // ---------------------------------------------------------------------------

  drawMinimap(mctx: CanvasRenderingContext2D, size: number, dpr: number, world: World, highlightSpecies: number | null): void {
    const R = world.config.radius;
    const s = (size / 2 - 4) / R;
    mctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    mctx.clearRect(0, 0, size, size);
    mctx.setTransform(dpr * s, 0, 0, dpr * s, dpr * size / 2, dpr * size / 2);
    mctx.fillStyle = 'rgba(10, 18, 28, 0.9)';
    mctx.beginPath();
    mctx.arc(0, 0, R, 0, TAU);
    mctx.fill();
    mctx.strokeStyle = 'rgba(140, 200, 255, 0.4)';
    mctx.lineWidth = 1 / s;
    mctx.stroke();
    mctx.fillStyle = 'rgba(98, 242, 160, 0.45)';
    for (const p of world.plants) mctx.fillRect(p.x - 3, p.y - 3, 6, 6);
    for (const c of world.creatures) {
      const dim = highlightSpecies !== null && c.speciesId !== highlightSpecies;
      mctx.fillStyle = dim ? 'rgba(120,130,150,0.35)' : c.traits.diet > 0.6 ? PAL.mcherry : hueColor(c.traits.hue, 80, 65);
      const rr = Math.max(c.radius, 9);
      mctx.fillRect(c.x - rr, c.y - rr, rr * 2, rr * 2);
    }
    const cam = this.camera;
    const i = this.insets;
    const w = (this.width - i.left - i.right) / cam.zoom;
    const h = (this.height - i.top - i.bottom) / cam.zoom;
    mctx.strokeStyle = 'rgba(230, 237, 245, 0.85)';
    mctx.lineWidth = 1.2 / s;
    mctx.strokeRect(cam.x - w / 2, cam.y - h / 2, w, h);
  }
}

/** Draws one creature (body, tail, eyes, jaws) in world coordinates. */
export function drawCreatureShape(
ctx: CanvasRenderingContext2D,
sprites: SpriteCache,
clock: number,
c: Creature,
x: number,
y: number,
ang: number,
z: number,
dim: boolean,
): void {
  const r = c.radius;
  const sr = r * z;
  const t = c.traits;
  const hue = t.hue;
  const base = dim ? 0.18 : 1;
  const energy = Math.max(0, Math.min(1, c.energy / c.maxEnergy));

  if (sr < 2.2) {
    ctx.globalAlpha = base;
    ctx.fillStyle = hueColor(hue, 75, 62);
    ctx.beginPath();
    ctx.arc(x, y, Math.max(r, 1.6 / z), 0, TAU);
    ctx.fill();
    if (t.diet > 0.6) {
      ctx.strokeStyle = PAL.mcherry;
      ctx.lineWidth = 1 / z;
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
    return;
  }

  // Bioluminescent glow, brighter when well fed.
  ctx.globalCompositeOperation = 'lighter';
  ctx.globalAlpha = base * (0.18 + 0.32 * energy);
  const gs = r * 2.6;
  ctx.drawImage(sprites.glow(hue), x - gs, y - gs, gs * 2, gs * 2);
  ctx.globalCompositeOperation = 'source-over';
  ctx.globalAlpha = base;

  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(ang);

  // Flagellum: longer for strong swimmers, beating faster when swimming hard.
  if (sr >= 3.5) {
    const L = r * (0.8 + 1.1 * c.genome.body[G.speed]);
    const amp = r * (0.1 + 0.28 * Math.min(1, c.speed / 50));
    const ph = c.swimPhase;
    ctx.strokeStyle = hueColor(hue, 70, 74, 0.7);
    ctx.lineWidth = Math.max(r * 0.15, 0.9 / z);
    ctx.lineCap = 'round';
    ctx.beginPath();
    const x0 = -r * 0.9;
    ctx.moveTo(x0, 0);
    for (let i = 1; i <= 9; i++) {
      const u = i / 9;
      ctx.lineTo(x0 - L * u, Math.sin(ph - u * 5.5) * amp * u);
    }
    ctx.stroke();
  }

  // Body
  ctx.drawImage(sprites.body(hue), -r, -r, r * 2, r * 2);

  // Carnivores grow a spiky membrane.
  if (t.diet > 0.55 && sr >= 4) {
    ctx.fillStyle = hueColor(hue, 60, 45, 0.9);
    const n = 9;
    ctx.beginPath();
    for (let i = 0; i < n; i++) {
      const aa = Math.PI * 0.35 + (i / (n - 1)) * Math.PI * 1.3;
      const ca = Math.cos(aa);
      const sa = Math.sin(aa);
      ctx.moveTo(ca * r * 0.88 - sa * r * 0.12, sa * r * 0.88 + ca * r * 0.12);
      ctx.lineTo(ca * r * 1.18, sa * r * 1.18);
      ctx.lineTo(ca * r * 0.88 + sa * r * 0.12, sa * r * 0.88 - ca * r * 0.12);
    }
    ctx.fill();
  }

  // Markings
  if (t.spots > 0 && sr >= 4) {
    ctx.fillStyle = hueColor(hue, 65, 32, 0.55);
    let h = c.id * 2654435761;
    for (let i = 0; i < t.spots; i++) {
      h = (h ^ (h >>> 13)) * 1274126177;
      const aa = ((h >>> 8) & 1023) / 1023 * TAU;
      const dd = 0.25 + (((h >>> 18) & 255) / 255) * 0.45;
      ctx.beginPath();
      ctx.arc(Math.cos(aa) * r * dd - r * 0.1, Math.sin(aa) * r * dd, r * 0.11, 0, TAU);
      ctx.fill();
    }
  }

  // Nucleus
  ctx.fillStyle = hueColor(hue, 55, 28, 0.55);
  ctx.beginPath();
  ctx.arc(-r * 0.22, r * 0.05, r * 0.24, 0, TAU);
  ctx.fill();

  // Starving creatures fade.
  if (energy < 0.3) {
    ctx.fillStyle = `rgba(3, 6, 11, ${(0.3 - energy) * 1.6})`;
    ctx.beginPath();
    ctx.arc(0, 0, r * 0.95, 0, TAU);
    ctx.fill();
  }

  // Mouth: mandibles for meat-eaters, a soft mouth for grazers.
  if (sr >= 3) {
    if (t.diet > 0.4) {
      const open = c.biting ? 0.42 + 0.28 * Math.sin(clock * 28 + c.id) : 0.2;
      const len = r * (0.32 + 0.4 * t.diet);
      ctx.fillStyle = c.biting ? '#ff8aa0' : PAL.mcherry;
      for (const side of [-1, 1]) {
        ctx.beginPath();
        ctx.moveTo(r * 0.72, side * r * 0.36);
        ctx.quadraticCurveTo(r * 0.95 + len * 0.8, side * r * (0.42 + open * 0.6), r * 0.86 + len, side * r * (0.08 + open * 0.25));
        ctx.quadraticCurveTo(r * 0.98 + len * 0.3, side * r * 0.24, r * 0.8, side * r * 0.12);
        ctx.closePath();
        ctx.fill();
      }
    } else {
      ctx.fillStyle = 'rgba(4, 10, 16, 0.65)';
      ctx.beginPath();
      ctx.ellipse(r * 0.8, 0, r * 0.1, r * 0.17, 0, 0, TAU);
      ctx.fill();
    }
  }

  // Eyes look at whatever the creature is paying attention to.
  if (sr >= 3.2) {
    const eyeA = Math.max(0.38, Math.min(1.05, t.fov / 4));
    const eyeR = r * (0.17 + 0.13 * c.genome.body[G.vision]);
    const ed = r * 0.56;
    let lookA = 0;
    let best = 0;
    const inp = c.brain.input;
    for (let k = 0; k < 4; k++) {
      const near = inp[k * 2 + 1];
      const o = c.seen[k];
      if (o && near > best) {
        best = near;
        lookA = Math.atan2(o.y - c.y, o.x - c.x) - c.angle;
      }
    }
    const px = Math.cos(lookA) * eyeR * 0.38;
    const py = Math.sin(lookA) * eyeR * 0.38;
    for (const side of [-1, 1]) {
      const ex = Math.cos(eyeA * side) * ed;
      const ey = Math.sin(eyeA * side) * ed;
      ctx.fillStyle = '#eef6ff';
      ctx.beginPath();
      ctx.arc(ex, ey, eyeR, 0, TAU);
      ctx.fill();
      ctx.fillStyle = '#081019';
      ctx.beginPath();
      ctx.arc(ex + px, ey + py, eyeR * 0.56, 0, TAU);
      ctx.fill();
      if (sr > 9) {
        ctx.fillStyle = 'rgba(255,255,255,0.85)';
        ctx.beginPath();
        ctx.arc(ex + px - eyeR * 0.18, ey + py - eyeR * 0.2, eyeR * 0.16, 0, TAU);
        ctx.fill();
      }
    }
  }

  // Feedback flashes: green when eating, red when hurt.
  if (c.eatFlash > 0.08) {
    ctx.strokeStyle = `rgba(98, 242, 160, ${c.eatFlash * 0.9})`;
    ctx.lineWidth = Math.max(1 / z, r * 0.1);
    ctx.beginPath();
    ctx.arc(0, 0, r * (1.05 + (1 - c.eatFlash) * 0.4), 0, TAU);
    ctx.stroke();
  }
  if (c.hurtFlash > 0.08) {
    ctx.strokeStyle = `rgba(255, 93, 122, ${c.hurtFlash})`;
    ctx.lineWidth = Math.max(1.2 / z, r * 0.12);
    ctx.beginPath();
    ctx.arc(0, 0, r * 1.08, 0, TAU);
    ctx.stroke();
  }
  ctx.restore();
  ctx.globalAlpha = 1;
}
