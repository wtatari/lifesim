import { useEffect, useRef } from 'react';
import { Maximize, Minus, Plus } from 'lucide-react';
import { useController, useSim } from '../app/context.ts';

const SIZE = 112;
const NICE = [5, 10, 20, 25, 50, 100, 200, 250, 500, 1000];

/** Minimap, zoom controls, objective magnification and a scale bar. */
export function MapCluster() {
  const ctl = useSim();
  const ref = useRef<HTMLCanvasElement>(null);
  const r = ctl.renderer;
  const zoom = r?.camera.zoom ?? 1;
  // Scale bar: a round length that is 60–130 px on screen.
  let len = NICE[0];
  for (const n of NICE) if (n * zoom <= 130) len = n;
  const px = len * zoom;
  const mag = ctl.magnification();

  return (
    <div className="map-cluster">
      <MiniMap canvasRef={ref} />
      <div className="map-side">
        <div className="zoom-btns glass">
          <button className="icon-btn sm" onClick={() => ctl.zoom(1.5)} aria-label="Zoom in" title="Zoom in (+)">
            <Plus size={15} />
          </button>
          <button className="icon-btn sm" onClick={() => ctl.zoom(1 / 1.5)} aria-label="Zoom out" title="Zoom out (−)">
            <Minus size={15} />
          </button>
          <button className="icon-btn sm" onClick={() => ctl.fitView()} aria-label="Show the whole dish" title="Show the whole dish (0)">
            <Maximize size={14} />
          </button>
        </div>
        <div className="scale glass">
          <span className="objective mono" title="Magnification, like a microscope objective">
            {mag < 10 ? mag.toFixed(1) : Math.round(mag)}×
          </span>
          <span className="scalebar" style={{ width: px }} />
          <span className="mono scale-label">{len} μm</span>
        </div>
      </div>
    </div>
  );
}

function MiniMap({ canvasRef }: { canvasRef: React.RefObject<HTMLCanvasElement | null> }) {
  const ctl = useController();
  useEffect(() => {
    ctl.attachMinimap(canvasRef.current, SIZE);
    return () => ctl.attachMinimap(null, SIZE);
  }, [ctl, canvasRef]);
  const onPointer = (e: React.PointerEvent) => {
    if (e.buttons !== 1 && e.type !== 'pointerdown') return;
    const rect = canvasRef.current!.getBoundingClientRect();
    const R = ctl.world.config.radius;
    const s = (SIZE / 2 - 4) / R;
    const x = (e.clientX - rect.left - SIZE / 2) / s;
    const y = (e.clientY - rect.top - SIZE / 2) / s;
    ctl.setFollow(false);
    ctl.renderer?.centerOn(x, y);
  };
  return (
    <canvas
      ref={canvasRef}
      className="minimap"
      style={{ width: SIZE, height: SIZE }}
      onPointerDown={onPointer}
      onPointerMove={onPointer}
      aria-label="Minimap: click to move the view"
      role="img"
    />
  );
}
