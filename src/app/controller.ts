import type { Creature } from '../sim/creature.ts';
import { T } from '../sim/tuning.ts';
import type { LifeRecord, World, WorldEvent } from '../sim/world.ts';
import { hueColor, PAL } from '../render/palette.ts';
import { Renderer, type RenderState } from '../render/renderer.ts';
import { notePlayerSelection } from './discoveryEngine.ts';

export type ToolId = 'inspect' | 'plant' | 'berry' | 'feed' | 'clone' | 'smite' | 'meteor';

export interface ToolInfo {
  id: ToolId;
  label: string;
  hint: string;
  key: string;
  radius: number;
  color: string;
}

export const TOOLS: ToolInfo[] = [
  { id: 'inspect', label: 'Inspect', hint: 'Click a creature to look inside its brain and DNA. Drag to move around.', key: 'V', radius: 0, color: PAL.cfp },
  { id: 'plant', label: 'Grow plants', hint: 'Click or drag to sprinkle green plants.', key: 'P', radius: 40, color: PAL.gfp },
  { id: 'berry', label: 'Grow berries', hint: 'Click or drag to sprinkle violet berries.', key: 'B', radius: 30, color: PAL.berry },
  { id: 'feed', label: 'Feed', hint: 'Click a creature to fill its energy and heal it. Picking favourites is artificial selection.', key: 'H', radius: 0, color: PAL.yfp },
  { id: 'clone', label: 'Breed', hint: 'Click a creature to make it have a baby right now (a mutated copy).', key: 'C', radius: 0, color: PAL.cfp },
  { id: 'smite', label: 'Remove', hint: 'Click a creature to remove it from the gene pool.', key: 'X', radius: 0, color: PAL.mcherry },
  { id: 'meteor', label: 'Meteor', hint: 'Click anywhere to strike. Everything in the circle dies: a mass extinction.', key: 'M', radius: 150, color: '#ff9b5a' },
];

export const SPEEDS = [1, 2, 4, 8, 16, Infinity] as const;

export function speedLabel(s: number): string {
  return Number.isFinite(s) ? `${s}×` : 'Max';
}

type Listener = () => void;
export type EventHook = (events: WorldEvent[], ctl: SimController) => void;

/**
 * Owns the world, the renderer and the animation loop. React components
 * subscribe to it and re-render a few times per second; the canvas redraws
 * every frame.
 */
export class SimController {
  world: World;
  renderer: Renderer | null = null;
  paused = false;
  speed: number = 1;
  selectedId: number | null = null;
  hoveredId: number | null = null;
  follow = false;
  tool: ToolId = 'inspect';
  highlightSpecies: number | null = null;
  showVision = true;
  /** Sim seconds per real second actually achieved. */
  actualSpeed = 1;
  fps = 60;
  version = 0;
  pointerWorld: { x: number; y: number } | null = null;
  /** Extra hooks run on every batch of world events (discoveries, lessons…). */
  readonly eventHooks = new Set<EventHook>();
  /** Hooks run every frame (lesson objectives, etc.). */
  readonly frameHooks = new Set<(ctl: SimController) => void>();

  private trail: { x: number; y: number }[] = [];
  private trailTimer = 0;
  private acc = 0;
  private raf = 0;
  private last = 0;
  private lastNotify = 0;
  private dirty = true;
  private listeners = new Set<Listener>();
  private spraying = false;
  private sprayAcc = 0;
  private speedWindow = { sim: 0, real: 0 };
  private fpsWindow = { frames: 0, real: 0 };
  private minimap: { ctx: CanvasRenderingContext2D; size: number; dpr: number } | null = null;
  private minimapTimer = 0;
  private running = false;

  constructor(world: World) {
    this.world = world;
  }

  // ---------------------------------------------------------------------------
  // Subscription (for React's useSyncExternalStore)
  // ---------------------------------------------------------------------------

  subscribe = (fn: Listener): (() => void) => {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  };

  getVersion = (): number => this.version;

  /** Mark UI state as changed; listeners are notified on the next frame. */
  touch(): void {
    this.dirty = true;
    if (!this.running) this.flush();
  }

  private flush(): void {
    this.dirty = false;
    this.version++;
    for (const l of this.listeners) l();
  }

  // ---------------------------------------------------------------------------
  // Lifecycle
  // ---------------------------------------------------------------------------

  attach(canvas: HTMLCanvasElement): void {
    this.renderer = new Renderer(canvas);
    this.renderer.fit(this.world.config.radius, true);
    this.start();
  }

  detach(): void {
    this.stop();
    this.renderer = null;
  }

  attachMinimap(canvas: HTMLCanvasElement | null, size: number): void {
    if (!canvas) {
      this.minimap = null;
      return;
    }
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = size * dpr;
    canvas.height = size * dpr;
    const ctx = canvas.getContext('2d');
    if (ctx) this.minimap = { ctx, size, dpr };
  }

  start(): void {
    if (this.running) return;
    this.running = true;
    this.last = performance.now();
    const loop = (now: number) => {
      if (!this.running) return;
      this.frame(now);
      this.raf = requestAnimationFrame(loop);
    };
    this.raf = requestAnimationFrame(loop);
  }

  stop(): void {
    this.running = false;
    cancelAnimationFrame(this.raf);
  }

  setWorld(world: World): void {
    this.world = world;
    this.selectedId = null;
    this.hoveredId = null;
    this.follow = false;
    this.highlightSpecies = null;
    this.trail = [];
    this.acc = 0;
    this.renderer?.effects.list.splice(0);
    this.renderer?.fit(world.config.radius, true);
    this.touch();
  }

  // ---------------------------------------------------------------------------
  // Frame
  // ---------------------------------------------------------------------------

  private frame(now: number): void {
    const dtReal = Math.min(0.1, Math.max(0, (now - this.last) / 1000));
    this.last = now;
    const w = this.world;
    const t0 = performance.now();
    let simAdvanced = 0;

    if (!this.paused) {
      const budget = 13;
      if (Number.isFinite(this.speed)) {
        this.acc += dtReal * this.speed;
        while (this.acc >= T.dt) {
          w.step();
          this.acc -= T.dt;
          simAdvanced += T.dt;
          if (performance.now() - t0 > budget) {
            this.acc = 0;
            break;
          }
        }
      } else {
        while (performance.now() - t0 < budget) {
          for (let i = 0; i < 4; i++) w.step();
          simAdvanced += 4 * T.dt;
        }
        this.acc = 0;
      }
    }

    // Measured speed (smoothed over ~1 s).
    this.speedWindow.sim += simAdvanced;
    this.speedWindow.real += dtReal;
    this.fpsWindow.frames++;
    this.fpsWindow.real += dtReal;
    if (this.speedWindow.real >= 1) {
      this.actualSpeed = this.speedWindow.sim / this.speedWindow.real;
      this.fps = this.fpsWindow.frames / this.fpsWindow.real;
      this.speedWindow = { sim: 0, real: 0 };
      this.fpsWindow = { frames: 0, real: 0 };
      this.dirty = true;
    }

    const events = w.drainEvents();
    if (events.length) this.handleEvents(events);

    if (this.spraying && this.pointerWorld) this.spray(dtReal);

    const sel = this.selected();
    if (sel) {
      this.trailTimer += simAdvanced;
      if (this.trailTimer >= 0.25) {
        this.trailTimer = 0;
        this.trail.push({ x: sel.x, y: sel.y });
        if (this.trail.length > 90) this.trail.shift();
      }
      if (this.follow && this.renderer) {
        this.renderer.target.x = sel.x;
        this.renderer.target.y = sel.y;
      }
    }

    for (const h of this.frameHooks) h(this);

    const r = this.renderer;
    if (r) {
      const toolInfo = TOOLS.find((t) => t.id === this.tool)!;
      const state: RenderState = {
        selectedId: this.selectedId,
        hoveredId: this.hoveredId,
        highlightSpecies: this.highlightSpecies,
        showVision: this.showVision,
        trail: sel ? this.trail : null,
        pointer: this.pointerWorld,
        toolRadius: toolInfo.radius,
        toolColor: toolInfo.color,
        alpha: this.paused ? 1 : Math.min(1, this.acc / T.dt),
      };
      r.render(w, state, dtReal);
      if (this.minimap) {
        this.minimapTimer += dtReal;
        if (this.minimapTimer > 0.1) {
          this.minimapTimer = 0;
          r.drawMinimap(this.minimap.ctx, this.minimap.size, this.minimap.dpr, w, this.highlightSpecies);
        }
      }
    }

    // While running, React views refresh ~6 times per second.
    if (this.dirty || (!this.paused && now - this.lastNotify > 160)) {
      this.lastNotify = now;
      this.flush();
    }
  }

  private handleEvents(events: WorldEvent[]): void {
    const fx = this.renderer?.effects;
    if (fx) {
      let budget = 30;
      for (const e of events) {
        if (budget <= 0 && e.type !== 'meteor') continue;
        switch (e.type) {
          case 'birth':
            if (this.isOnScreen(e.x, e.y)) {
              fx.add('birth', e.x, e.y, hueColor(e.hue, 80, 70), 6);
              budget--;
            }
            break;
          case 'death':
            if (this.isOnScreen(e.x, e.y)) {
              fx.add('death', e.x, e.y, e.cause === 'eaten' ? PAL.mcherry : 'rgba(170, 185, 205, 0.8)', 8);
              budget--;
            }
            break;
          case 'kill':
            if (this.isOnScreen(e.x, e.y)) {
              fx.add('kill', e.x, e.y, PAL.mcherry, 10);
              budget--;
            }
            break;
          case 'lifeSupport': {
            const c = this.world.getCreature(e.id);
            if (c) fx.add('spawn', c.x, c.y, PAL.cfp, 10);
            break;
          }
          case 'meteor':
            fx.add('meteor', e.x, e.y, '#ff9b5a', e.radius);
            break;
          default:
            break;
        }
      }
    }
    for (const h of this.eventHooks) h(events, this);
    if (this.selectedId !== null && !this.world.getCreature(this.selectedId)) this.dirty = true;
  }

  private isOnScreen(x: number, y: number): boolean {
    const r = this.renderer;
    if (!r) return false;
    const p = r.worldToScreen(x, y);
    return p.x > -40 && p.y > -40 && p.x < r.width + 40 && p.y < r.height + 40;
  }

  // ---------------------------------------------------------------------------
  // Time controls
  // ---------------------------------------------------------------------------

  togglePause(): void {
    this.paused = !this.paused;
    this.touch();
  }

  setPaused(p: boolean): void {
    this.paused = p;
    this.touch();
  }

  setSpeed(s: number): void {
    this.speed = s;
    this.paused = false;
    this.touch();
  }

  /** Advance exactly one physics step (when paused). */
  stepOnce(): void {
    this.world.step();
    const events = this.world.drainEvents();
    if (events.length) this.handleEvents(events);
    this.touch();
  }

  // ---------------------------------------------------------------------------
  // Selection & camera
  // ---------------------------------------------------------------------------

  selected(): Creature | undefined {
    return this.selectedId !== null ? this.world.getCreature(this.selectedId) : undefined;
  }

  selectedRecord(): LifeRecord | undefined {
    return this.selectedId !== null ? this.world.records.get(this.selectedId) : undefined;
  }

  select(id: number | null, opts: { focus?: boolean } = {}): void {
    if (id !== this.selectedId) {
      this.trail = [];
      this.trailTimer = 0;
    }
    this.selectedId = id;
    if (id === null) this.follow = false;
    if (id !== null && opts.focus) {
      const c = this.world.getCreature(id);
      if (c && this.renderer) {
        const z = Math.max(this.renderer.target.zoom, this.renderer.fitZoom() * 3);
        this.renderer.centerOn(c.x, c.y, z);
      }
    }
    this.touch();
  }

  setFollow(f: boolean): void {
    this.follow = f;
    const c = this.selected();
    if (f && c && this.renderer) {
      const z = Math.max(this.renderer.target.zoom, this.renderer.fitZoom() * 3.2);
      this.renderer.centerOn(c.x, c.y, z);
    }
    this.touch();
  }

  setTool(t: ToolId): void {
    this.tool = t;
    this.touch();
  }

  setHighlightSpecies(id: number | null): void {
    this.highlightSpecies = id;
    this.touch();
  }

  zoom(factor: number): void {
    const r = this.renderer;
    if (!r) return;
    r.zoomAt(r.width / 2, r.height / 2, factor);
    this.touch();
  }

  fitView(): void {
    this.follow = false;
    this.renderer?.fit(this.world.config.radius);
    this.touch();
  }

  /** Magnification label in the style of a microscope objective. */
  magnification(): number {
    const r = this.renderer;
    if (!r) return 4;
    return 4 * (r.camera.zoom / r.fitZoom());
  }

  // ---------------------------------------------------------------------------
  // Pointer interaction
  // ---------------------------------------------------------------------------

  pickAt(sx: number, sy: number): Creature | null {
    const r = this.renderer;
    if (!r) return null;
    const p = r.screenToWorld(sx, sy);
    return this.world.creatureAt(p.x, p.y, 8 / r.camera.zoom + 2);
  }

  hoverAt(sx: number, sy: number): void {
    const r = this.renderer;
    if (!r) return;
    this.pointerWorld = r.screenToWorld(sx, sy);
    const c = this.pickAt(sx, sy);
    const id = c ? c.id : null;
    if (id !== this.hoveredId) {
      this.hoveredId = id;
      this.touch();
    }
  }

  leave(): void {
    this.pointerWorld = null;
    this.spraying = false;
    if (this.hoveredId !== null) {
      this.hoveredId = null;
      this.touch();
    }
  }

  /** Returns true if the press was consumed by a tool (so it should not pan). */
  press(sx: number, sy: number): boolean {
    const r = this.renderer;
    if (!r) return false;
    const p = r.screenToWorld(sx, sy);
    this.pointerWorld = p;
    const w = this.world;
    const fx = r.effects;
    switch (this.tool) {
      case 'inspect': {
        const c = this.pickAt(sx, sy);
        if (c) {
          this.select(c.id);
          return true;
        }
        return false;
      }
      case 'plant':
      case 'berry':
        this.spraying = true;
        this.sprayAcc = 1;
        this.spray(0);
        return true;
      case 'feed': {
        const c = this.pickAt(sx, sy);
        if (!c) return false;
        w.feed(c.id);
        fx.add('feed', c.x, c.y, PAL.yfp, c.radius);
        notePlayerSelection();
        this.touch();
        return true;
      }
      case 'clone': {
        const c = this.pickAt(sx, sy);
        if (!c) return false;
        const baby = w.cloneCreature(c.id);
        if (baby) fx.add('birth', baby.x, baby.y, PAL.cfp, baby.radius + 4);
        notePlayerSelection();
        const ev = w.drainEvents();
        if (ev.length) this.handleEvents(ev);
        this.touch();
        return true;
      }
      case 'smite': {
        const c = this.pickAt(sx, sy);
        if (!c) return false;
        fx.add('smite', c.x, c.y, '#d9f0ff', c.radius);
        w.smite(c.id);
        const ev = w.drainEvents();
        if (ev.length) this.handleEvents(ev);
        this.touch();
        return true;
      }
      case 'meteor': {
        w.meteor(p.x, p.y, TOOLS.find((t) => t.id === 'meteor')!.radius);
        const ev = w.drainEvents();
        if (ev.length) this.handleEvents(ev);
        this.touch();
        return true;
      }
    }
  }

  release(): void {
    this.spraying = false;
  }

  private spray(dt: number): void {
    const p = this.pointerWorld;
    if (!p) return;
    this.sprayAcc += dt * 14;
    const kind = this.tool === 'berry' ? 1 : 0;
    const radius = TOOLS.find((t) => t.id === this.tool)!.radius;
    while (this.sprayAcc >= 1) {
      this.sprayAcc -= 1;
      this.world.sprinkleFood(p.x, p.y, kind, 1, radius * 0.5);
    }
  }
}
