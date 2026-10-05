import { useEffect, useRef } from 'react';
import { useController } from '../../app/context.ts';
import type { Creature } from '../../sim/creature.ts';
import { drawCreatureShape } from '../../render/renderer.ts';
import { SpriteCache } from '../../render/sprites.ts';

let sharedSprites: SpriteCache | null = null;

/** A live close-up of one creature, like looking through a higher-power objective. */
export function Portrait({ creature, size = 96 }: { creature: Creature | undefined; size?: number }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const ctl = useController();
  useEffect(() => {
    const canvas = ref.current!;
    const ctx = canvas.getContext('2d')!;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = size * dpr;
    canvas.height = size * dpr;
    if (!sharedSprites) sharedSprites = new SpriteCache();
    const sprites = sharedSprites;
    let raf = 0;
    let clock = 0;
    let last = performance.now();
    const draw = (now: number) => {
      raf = requestAnimationFrame(draw);
      const dt = Math.min(0.1, (now - last) / 1000);
      last = now;
      clock += dt;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, size, size);
      const c = creature && ctl.world.getCreature(creature.id);
      if (!c) return;
      // Scale so the creature (plus tail) fits the frame, facing right.
      const r = c.radius;
      const z = (size * 0.3) / r;
      ctx.setTransform(dpr * z, 0, 0, dpr * z, dpr * size * 0.55, dpr * size * 0.5);
      // Same drawing code as the dish, at the origin and facing right.
      drawCreatureShape(ctx, sprites, clock, c, 0, 0, 0, z, false);
    };
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, [creature, ctl, size]);
  return (
    <div className="portrait" style={{ width: size, height: size }}>
      <canvas ref={ref} style={{ width: size, height: size }} aria-hidden="true" />
      <span className="reticle" aria-hidden="true" />
    </div>
  );
}
