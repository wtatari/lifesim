import { useEffect, useRef } from 'react';
import { useController, useSim } from '../app/context.ts';

/**
 * The microscope view. Handles panning (drag), zooming (wheel / pinch),
 * hovering and tool clicks; all drawing happens in the Renderer.
 */
export function WorldCanvas() {
  const ctl = useController();
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current!;
    ctl.attach(canvas);
    const ro = new ResizeObserver(() => ctl.renderer?.resize());
    ro.observe(canvas);

    const pointers = new Map<number, { x: number; y: number }>();
    let mode: 'none' | 'pan' | 'tool' | 'pinch' = 'none';
    let moved = 0;
    let pinchDist = 0;
    let downAt = { x: 0, y: 0 };

    const local = (e: PointerEvent | WheelEvent | MouseEvent) => {
      const r = canvas.getBoundingClientRect();
      return { x: e.clientX - r.left, y: e.clientY - r.top };
    };

    const onDown = (e: PointerEvent) => {
      if (e.button !== 0 && e.pointerType === 'mouse') return;
      canvas.setPointerCapture(e.pointerId);
      const p = local(e);
      pointers.set(e.pointerId, p);
      moved = 0;
      downAt = p;
      if (pointers.size === 2) {
        ctl.release();
        mode = 'pinch';
        const [a, b] = [...pointers.values()];
        pinchDist = Math.hypot(a.x - b.x, a.y - b.y);
        return;
      }
      mode = ctl.press(p.x, p.y) ? 'tool' : 'pan';
      if (mode === 'pan') canvas.classList.add('grabbing');
    };

    const onMove = (e: PointerEvent) => {
      const p = local(e);
      const prev = pointers.get(e.pointerId);
      if (!prev) {
        ctl.hoverAt(p.x, p.y);
        return;
      }
      pointers.set(e.pointerId, p);
      if (mode === 'pinch' && pointers.size >= 2) {
        const [a, b] = [...pointers.values()];
        const d = Math.hypot(a.x - b.x, a.y - b.y);
        if (pinchDist > 0) ctl.renderer?.zoomAt((a.x + b.x) / 2, (a.y + b.y) / 2, d / pinchDist);
        pinchDist = d;
        return;
      }
      if (mode === 'pan') {
        const dx = p.x - prev.x;
        const dy = p.y - prev.y;
        moved += Math.abs(dx) + Math.abs(dy);
        if (moved > 4) {
          if (ctl.follow) ctl.setFollow(false);
          ctl.renderer?.panBy(dx, dy);
        }
      } else if (mode === 'tool') {
        ctl.hoverAt(p.x, p.y);
      }
    };

    const onUp = (e: PointerEvent) => {
      pointers.delete(e.pointerId);
      canvas.classList.remove('grabbing');
      if (mode === 'pan' && moved <= 4 && ctl.tool === 'inspect') {
        // A click on empty water clears the selection.
        const hit = ctl.pickAt(downAt.x, downAt.y);
        if (!hit) ctl.select(null);
      }
      if (pointers.size === 0) {
        ctl.release();
        mode = 'none';
      }
    };

    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const p = local(e);
      const delta = e.deltaMode === 1 ? e.deltaY * 16 : e.deltaY;
      ctl.renderer?.zoomAt(p.x, p.y, Math.exp(-delta * 0.0016));
      ctl.touch();
    };

    const onDbl = (e: MouseEvent) => {
      const p = local(e);
      const c = ctl.pickAt(p.x, p.y);
      if (c) {
        ctl.select(c.id);
        ctl.setFollow(true);
      }
    };

    const onLeave = () => ctl.leave();

    canvas.addEventListener('pointerdown', onDown);
    canvas.addEventListener('pointermove', onMove);
    canvas.addEventListener('pointerup', onUp);
    canvas.addEventListener('pointercancel', onUp);
    canvas.addEventListener('pointerleave', onLeave);
    canvas.addEventListener('wheel', onWheel, { passive: false });
    canvas.addEventListener('dblclick', onDbl);
    return () => {
      ro.disconnect();
      canvas.removeEventListener('pointerdown', onDown);
      canvas.removeEventListener('pointermove', onMove);
      canvas.removeEventListener('pointerup', onUp);
      canvas.removeEventListener('pointercancel', onUp);
      canvas.removeEventListener('pointerleave', onLeave);
      canvas.removeEventListener('wheel', onWheel);
      canvas.removeEventListener('dblclick', onDbl);
      ctl.detach();
    };
  }, [ctl]);

  return <CanvasElement canvasRef={ref} />;
}

function CanvasElement({ canvasRef }: { canvasRef: React.RefObject<HTMLCanvasElement | null> }) {
  const ctl = useSim();
  const cursor =
    ctl.tool === 'inspect'
      ? ctl.hoveredId !== null
        ? 'pointer'
        : 'grab'
      : ctl.tool === 'plant' || ctl.tool === 'berry' || ctl.tool === 'meteor'
        ? 'crosshair'
        : ctl.hoveredId !== null
          ? 'pointer'
          : 'not-allowed';
  return (
    <canvas
      ref={canvasRef}
      className="world-canvas"
      style={{ cursor }}
      aria-label="Petri dish simulation. Click a creature to inspect it; drag to pan; scroll to zoom."
      role="img"
    />
  );
}
