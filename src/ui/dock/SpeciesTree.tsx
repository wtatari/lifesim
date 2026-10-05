import { useEffect, useRef, useState } from 'react';
import { useSim } from '../../app/context.ts';
import { openGuide } from '../../app/ui.ts';
import { speciesName, type Species } from '../../sim/species.ts';
import { hueColor } from '../../render/palette.ts';
import { prepare, timeLabel } from './chart.ts';
import { useElementSize } from './Dock.tsx';

interface Lane {
  sp: Species;
  y: number;
}

/**
 * Tree of life drawn as a spindle diagram: each species is a band whose
 * thickness follows its population over time, branching from its parent.
 */
export function SpeciesTree() {
  const ctl = useSim();
  const w = ctl.world;
  const [wrapRef, size] = useElementSize<HTMLDivElement>();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [hover, setHover] = useState<{ lane: Lane; x: number; y: number } | null>(null);

  const all = w.species.list.filter((s) => s.established);
  const kids = new Map<number, Species[]>();
  const roots: Species[] = [];
  for (const s of all) {
    if (s.parentId && all.some((p) => p.id === s.parentId)) {
      let a = kids.get(s.parentId);
      if (!a) kids.set(s.parentId, (a = []));
      a.push(s);
    } else roots.push(s);
  }
  const order: Species[] = [];
  const visit = (s: Species) => {
    order.push(s);
    for (const k of (kids.get(s.id) ?? []).sort((a, b) => a.bornAt - b.bornAt)) visit(k);
  };
  for (const r of roots.sort((a, b) => a.bornAt - b.bornAt || a.id - b.id)) visit(r);

  const laneH = Math.max(16, Math.min(30, (size.h - 24) / Math.max(1, order.length)));
  const height = Math.max(size.h, order.length * laneH + 24);
  const lanes: Lane[] = order.map((sp, i) => ({ sp, y: 14 + i * laneH + laneH / 2 }));
  const labelRoom = 170;
  const x0 = 12;
  const x1 = Math.max(x0 + 50, size.w - labelRoom);
  const tMax = Math.max(1, w.time);
  const xOf = (t: number) => x0 + (t / tMax) * (x1 - x0);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d')!;
    prepare(ctx, canvas, size.w, height);
    const samples = w.stats.samples;
    const byId = new Map(lanes.map((l) => [l.sp.id, l]));
    // Time grid
    ctx.font = '500 10px "JetBrains Mono", ui-monospace, monospace';
    ctx.fillStyle = '#6f7d90';
    ctx.strokeStyle = 'rgba(150, 190, 235, 0.07)';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    for (let k = 0; k <= 4; k++) {
      const t = (tMax * k) / 4;
      const x = xOf(t);
      ctx.beginPath();
      ctx.moveTo(x, 4);
      ctx.lineTo(x, height);
      ctx.stroke();
      ctx.fillText(timeLabel(t), Math.max(x0 + 10, Math.min(x1 - 10, x)), 0);
    }
    // Branch connectors
    ctx.strokeStyle = 'rgba(169, 182, 199, 0.35)';
    ctx.lineWidth = 1;
    for (const l of lanes) {
      const p = byId.get(l.sp.parentId);
      if (!p) continue;
      const x = xOf(l.sp.bornAt);
      ctx.beginPath();
      ctx.moveTo(x, p.y);
      ctx.lineTo(x, l.y);
      ctx.lineTo(x + 6, l.y);
      ctx.stroke();
    }
    // Spindles
    for (const l of lanes) {
      const s = l.sp;
      const end = s.extinctAt ?? w.time;
      const alive = s.extinctAt === null;
      const pts: [number, number][] = [];
      for (const smp of samples) {
        if (smp.t < s.bornAt - 0.01 || smp.t > end + w.stats.interval) continue;
        const pop = smp.species[s.id] ?? 0;
        pts.push([xOf(Math.min(smp.t, end)), Math.min(laneH * 0.46, 0.8 + Math.sqrt(pop) * 1.4)]);
      }
      if (pts.length === 0 || pts[0][0] > xOf(s.bornAt) + 1) pts.unshift([xOf(s.bornAt), 0.8]);
      pts.push([xOf(end), alive ? Math.min(laneH * 0.46, 0.8 + Math.sqrt(s.population) * 1.4) : 0.6]);
      ctx.beginPath();
      ctx.moveTo(pts[0][0], l.y - pts[0][1]);
      for (const [x, h] of pts) ctx.lineTo(x, l.y - h);
      for (let i = pts.length - 1; i >= 0; i--) ctx.lineTo(pts[i][0], l.y + pts[i][1]);
      ctx.closePath();
      ctx.fillStyle = alive ? hueColor(s.hue, 70, 55, hover && hover.lane.sp.id !== s.id ? 0.45 : 0.9) : 'rgba(111, 125, 144, 0.45)';
      ctx.fill();
      // Label
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      ctx.font = 'italic 13px "Instrument Serif", Georgia, serif';
      ctx.fillStyle = alive ? '#e6edf5' : '#6f7d90';
      const label = speciesName(s) + (alive ? '' : ' †');
      ctx.fillText(label, xOf(end) + 8, l.y);
    }
  });

  const onMove = (e: React.PointerEvent) => {
    const r = canvasRef.current!.getBoundingClientRect();
    const y = e.clientY - r.top;
    const x = e.clientX - r.left;
    const lane = lanes.find((l) => Math.abs(l.y - y) < laneH / 2);
    setHover(lane ? { lane, x, y } : null);
  };

  return (
    <div className="panel-chart">
      <div className="chart-side">
        <p className="note">Every band is a species. Its thickness follows its population; branches show which species it split from. † marks extinction.</p>
        <p className="note">
          <span className="mono">{all.filter((s) => s.extinctAt === null).length}</span> alive · <span className="mono">{all.filter((s) => s.extinctAt !== null).length}</span> extinct
        </p>
        <button className="link-btn" onClick={() => openGuide('speciation')}>
          How do new species form?
        </button>
      </div>
      <div className="chart tree-scroll scroll" ref={wrapRef}>
        <canvas
          ref={canvasRef}
          style={{ width: size.w, height }}
          onPointerMove={onMove}
          onPointerLeave={() => setHover(null)}
          onClick={() => {
            if (hover && hover.lane.sp.extinctAt === null) ctl.setHighlightSpecies(ctl.highlightSpecies === hover.lane.sp.id ? null : hover.lane.sp.id);
          }}
          role="img"
          aria-label="Tree of life"
        />
        {order.length === 0 && <div className="chart-empty">No species yet.</div>}
        {hover && (
          <div className="tooltip chart-tt" style={{ left: Math.min(hover.x + 12, size.w - 220), top: Math.max(4, hover.y - 10) }}>
            <strong className="latin">{speciesName(hover.lane.sp)}</strong>
            <div className="tt-row">
              <span>Appeared</span>
              <span className="mono">T+{timeLabel(hover.lane.sp.bornAt)}</span>
            </div>
            <div className="tt-row">
              <span>{hover.lane.sp.extinctAt === null ? 'Alive now' : 'Extinct at'}</span>
              <span className="mono">{hover.lane.sp.extinctAt === null ? hover.lane.sp.population : `T+${timeLabel(hover.lane.sp.extinctAt)}`}</span>
            </div>
            <div className="tt-row">
              <span>Peak population</span>
              <span className="mono">{hover.lane.sp.peak}</span>
            </div>
            {hover.lane.sp.parentId !== 0 && w.species.get(hover.lane.sp.parentId) && (
              <div className="tt-row">
                <span>Split from</span>
                <span className="latin">{speciesName(w.species.get(hover.lane.sp.parentId)!)}</span>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
