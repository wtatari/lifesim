import { useEffect, useMemo, useRef, useState } from 'react';
import { RotateCcw, Scissors, Shuffle } from 'lucide-react';
import { useController } from '../../app/context.ts';
import { ui } from '../../app/ui.ts';
import { useStore } from '../../app/store.ts';
import { discover } from '../../app/discoveryEngine.ts';
import { w1Index, w2Index, w3Index } from '../../sim/brain.ts';
import { BITE_THRESHOLD, H_MAX, INPUT_INFO, N_IN, N_OUT, OUTPUT_INFO } from '../../sim/brainLayout.ts';
import type { Creature } from '../../sim/creature.ts';
import { PAL } from '../../render/palette.ts';
import { Slider } from '../common.tsx';

const GROUP_COLOR = [PAL.gfp, PAL.gfp, PAL.berry, PAL.berry, PAL.mcherry, PAL.mcherry, PAL.yfp, PAL.yfp, PAL.yfp, PAL.yfp, PAL.ink2, PAL.mcherry, PAL.ink2, PAL.dapi];

type Hit =
  | { kind: 'input'; i: number }
  | { kind: 'hidden'; h: number }
  | { kind: 'output'; o: number }
  | { kind: 'w1'; h: number; i: number }
  | { kind: 'w2'; o: number; h: number }
  | { kind: 'w3'; o: number; i: number };

interface Layout {
  w: number;
  h: number;
  xIn: number;
  xHid: number;
  xOut: number;
  yIn: number[];
  yHid: number[];
  yOut: number[];
}

function computeLayout(w: number, h: number): Layout {
  const top = 16;
  const bottom = h - 16;
  const gap = 12;
  const rowH = (bottom - top - gap * 2) / (N_IN - 1);
  const yIn: number[] = [];
  for (let i = 0; i < N_IN; i++) yIn.push(top + i * rowH + (i >= 8 ? gap : 0) + (i >= 10 ? gap : 0));
  const yHid: number[] = [];
  const hTop = top + 8;
  const hBot = bottom - 8;
  for (let k = 0; k < H_MAX; k++) yHid.push(hTop + (k * (hBot - hTop)) / (H_MAX - 1));
  const mid = (top + bottom) / 2;
  const yOut = [mid - 74, mid, mid + 74];
  const xIn = Math.min(156, w * 0.44);
  const xOut = w - 62;
  const xHid = xIn + (xOut - xIn) * 0.5;
  return { w, h, xIn, xHid, xOut, yIn, yHid, yOut };
}

function bez(x1: number, y1: number, x2: number, y2: number, t: number): [number, number] {
  const cx1 = x1 + (x2 - x1) * 0.5;
  const cx2 = x2 - (x2 - x1) * 0.5;
  const u = 1 - t;
  const x = u * u * u * x1 + 3 * u * u * t * cx1 + 3 * u * t * t * cx2 + t * t * t * x2;
  const y = u * u * u * y1 + 3 * u * u * t * y1 + 3 * u * t * t * y2 + t * t * t * y2;
  return [x, y];
}

/** Reflex links are drawn as straight dashed lines from sense to action. */
function reflexPoint(L: Layout, i: number, o: number, t: number): [number, number] {
  return [L.xIn + (L.xOut - L.xIn) * t, L.yIn[i] + (L.yOut[o] - L.yIn[i]) * t];
}

export function BrainView({ creature }: { creature: Creature | undefined }) {
  const ctl = useController();
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [size, setSize] = useState({ w: 340, h: 430 });
  const [hover, setHover] = useState<{ hit: Hit; x: number; y: number } | null>(null);
  const [edit, setEdit] = useState<{ hit: Extract<Hit, { kind: 'w1' | 'w2' | 'w3' }>; x: number; y: number } | null>(null);
  const [writeDna, setWriteDna] = useState(false);
  const surgery = useStore(ui, (s) => s.surgery);
  const [showValues, setShowValues] = useState(true);
  const hoverRef = useRef<Hit | null>(null);
  hoverRef.current = hover?.hit ?? edit?.hit ?? null;
  const L = useMemo(() => computeLayout(size.w, size.h), [size]);

  useEffect(() => {
    const el = wrapRef.current!;
    const ro = new ResizeObserver(() => {
      const w = Math.max(280, Math.floor(el.clientWidth));
      setSize({ w, h: 430 });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    setEdit(null);
  }, [creature?.id]);

  // Draw loop
  useEffect(() => {
    const canvas = canvasRef.current!;
    const ctx = canvas.getContext('2d')!;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = L.w * dpr;
    canvas.height = L.h * dpr;
    let raf = 0;
    let clock = 0;
    let last = performance.now();
    const draw = (now: number) => {
      raf = requestAnimationFrame(draw);
      const dt = Math.min(0.1, (now - last) / 1000);
      last = now;
      if (!ctl.paused) clock += dt;
      const c = creature && ctl.world.getCreature(creature.id) ? creature : undefined;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, L.w, L.h);
      if (!c) return;
      drawBrain(ctx, L, c, clock, hoverRef.current, showValues);
    };
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, [L, creature, ctl, showValues]);

  const hitTest = (x: number, y: number): Hit | null => {
    const c = creature;
    if (!c) return null;
    const b = c.brain;
    for (let i = 0; i < N_IN; i++) if (Math.hypot(x - L.xIn, y - L.yIn[i]) < 9) return { kind: 'input', i };
    for (let h = 0; h < H_MAX; h++) if (Math.hypot(x - L.xHid, y - L.yHid[h]) < 10) return { kind: 'hidden', h };
    for (let o = 0; o < N_OUT; o++) if (Math.hypot(x - L.xOut, y - L.yOut[o]) < 13) return { kind: 'output', o };
    if (x < L.xIn - 12) {
      // Labels: treat as the input node of that row.
      for (let i = 0; i < N_IN; i++) if (Math.abs(y - L.yIn[i]) < 8) return { kind: 'input', i };
      return null;
    }
    let best: Hit | null = null;
    let bestD = 5;
    const near = (px: number, py: number) => Math.hypot(px - x, py - y);
    if (x > L.xIn && x < L.xHid) {
      for (let h = 0; h < b.hiddenCount; h++) {
        for (let i = 0; i < N_IN; i++) {
          if (Math.abs(b.w1(h, i)) < 0.15) continue;
          for (let k = 1; k < 12; k++) {
            const [px, py] = bez(L.xIn, L.yIn[i], L.xHid, L.yHid[h], k / 12);
            const d = near(px, py);
            if (d < bestD) {
              bestD = d;
              best = { kind: 'w1', h, i };
            }
          }
        }
      }
    }
    if (x > L.xHid && x < L.xOut) {
      for (let o = 0; o < N_OUT; o++) {
        for (let h = 0; h < b.hiddenCount; h++) {
          if (Math.abs(b.w[w2Index(o, h)]) < 0.15) continue;
          for (let k = 1; k < 12; k++) {
            const [px, py] = bez(L.xHid, L.yHid[h], L.xOut, L.yOut[o], k / 12);
            const d = near(px, py);
            if (d < bestD) {
              bestD = d;
              best = { kind: 'w2', o, h };
            }
          }
        }
      }
    }
    if (!best) {
      for (let o = 0; o < N_OUT; o++) {
        for (let i = 0; i < N_IN; i++) {
          if (Math.abs(b.w3(o, i)) < 0.25) continue;
          for (let k = 1; k < 16; k++) {
            const [px, py] = reflexPoint(L, i, o, k / 16);
            const d = near(px, py);
            if (d < bestD) {
              bestD = d;
              best = { kind: 'w3', o, i };
            }
          }
        }
      }
    }
    return best;
  };

  const local = (e: React.PointerEvent) => {
    const r = canvasRef.current!.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };

  const onMove = (e: React.PointerEvent) => {
    const p = local(e);
    const hit = hitTest(p.x, p.y);
    setHover(hit ? { hit, ...p } : null);
  };

  const onClick = (e: React.PointerEvent) => {
    if (!creature) return;
    const p = local(e);
    const hit = hitTest(p.x, p.y);
    if (!surgery) {
      if (hit && (hit.kind === 'w1' || hit.kind === 'w2' || hit.kind === 'w3')) {
        ui.set({ surgery: true });
        setEdit({ hit, ...p });
      }
      return;
    }
    if (!hit) {
      setEdit(null);
      return;
    }
    if (hit.kind === 'hidden' && hit.h < creature.brain.hiddenCount) {
      creature.brain.lesioned[hit.h] = creature.brain.lesioned[hit.h] ? 0 : 1;
      discover('surgeon');
      ctl.touch();
      return;
    }
    if (hit.kind === 'w1' || hit.kind === 'w2' || hit.kind === 'w3') setEdit({ hit, ...p });
  };

  const c = creature;
  return (
    <div className="brain-view" ref={wrapRef}>
      <div className="brain-toolbar">
        <div className="legend">
          <span className="lg-item"><i className="lg-line pos" />excites</span>
          <span className="lg-item"><i className="lg-line neg" />inhibits</span>
          <span className="lg-item"><i className="lg-line reflex" />reflex link</span>
        </div>
        <div className="brain-toggles">
          <button className={`btn sm ${showValues ? '' : 'ghost'}`} onClick={() => setShowValues((v) => !v)} aria-pressed={showValues} title="Show live values">
            0.42
          </button>
          <button
            className={`btn sm ${surgery ? 'surgery-on' : 'ghost'}`}
            aria-pressed={surgery}
            onClick={() => {
              ui.set({ surgery: !surgery });
              setEdit(null);
            }}
            title="Brain surgery: click a connection to change its weight, or a hidden neuron to switch it off"
            data-tour="surgery"
          >
            <Scissors size={13} /> Surgery
          </button>
        </div>
      </div>
      <div className="brain-canvas-wrap">
        <canvas
          ref={canvasRef}
          style={{ width: L.w, height: L.h }}
          className={`brain-canvas ${surgery ? 'is-surgery' : ''}`}
          onPointerMove={onMove}
          onPointerLeave={() => setHover(null)}
          onPointerDown={onClick}
          aria-label="Live neural network of the selected creature"
          role="img"
        />
        <div className="brain-col-labels" aria-hidden="true">
          <span style={{ left: L.xIn - 30 }}>Senses</span>
          <span style={{ left: L.xHid - 22 }}>Hidden</span>
          <span style={{ left: L.xOut - 22 }}>Actions</span>
        </div>
        {hover && !edit && c && <BrainTooltip hit={hover.hit} x={hover.x} y={hover.y} c={c} L={L} surgery={surgery} />}
        {edit && c && (
          <SurgeryPopover
            key={`${edit.hit.kind}-${JSON.stringify(edit.hit)}`}
            hit={edit.hit}
            x={edit.x}
            y={edit.y}
            c={c}
            L={L}
            writeDna={writeDna}
            setWriteDna={setWriteDna}
            onClose={() => setEdit(null)}
          />
        )}
      </div>
      {surgery && (
        <p className="surgery-hint">
          <Scissors size={12} /> Click a connection to rewire it, or a hidden neuron to switch it off. Changes affect this creature’s brain only, unless you also write them into its DNA.
        </p>
      )}
    </div>
  );
}

function weightIndex(hit: Extract<Hit, { kind: 'w1' | 'w2' | 'w3' }>): number {
  if (hit.kind === 'w1') return w1Index(hit.h, hit.i);
  if (hit.kind === 'w2') return w2Index(hit.o, hit.h);
  return w3Index(hit.o, hit.i);
}

function connName(hit: Extract<Hit, { kind: 'w1' | 'w2' | 'w3' }>): string {
  if (hit.kind === 'w1') return `${INPUT_INFO[hit.i].label} → Hidden ${hit.h + 1}`;
  if (hit.kind === 'w2') return `Hidden ${hit.h + 1} → ${OUTPUT_INFO[hit.o].label}`;
  return `${INPUT_INFO[hit.i].label} → ${OUTPUT_INFO[hit.o].label} (reflex)`;
}

function fmt(v: number): string {
  return `${v >= 0 ? '+' : '−'}${Math.abs(v).toFixed(2)}`;
}

function BrainTooltip({ hit, x, y, c, L, surgery }: { hit: Hit; x: number; y: number; c: Creature; L: Layout; surgery: boolean }) {
  const b = c.brain;
  let title = '';
  let body: React.ReactNode = null;
  if (hit.kind === 'input') {
    const info = INPUT_INFO[hit.i];
    const gain = b.inputGain(hit.i);
    title = info.label;
    body = (
      <>
        <p>{info.desc}</p>
        <p className="tt-val mono">now {fmt(b.input[hit.i])}</p>
        {Math.abs(gain - 1) > 0.02 && (
          <p className="tt-note">
            Learned liking ×{gain.toFixed(2)}: the brain feels this as {fmt(b.perceived[hit.i])}.
          </p>
        )}
      </>
    );
  } else if (hit.kind === 'hidden') {
    title = `Hidden neuron ${hit.h + 1}`;
    if (hit.h >= b.hiddenCount) {
      body = <p>Switched off. This creature’s Brain-size gene only turns on {b.hiddenCount} hidden neurons. The weights of this one still sit in its DNA and mutate silently (“junk DNA”), until a mutation switches it on.</p>;
    } else if (b.lesioned[hit.h]) {
      body = <p>Disabled by brain surgery. {surgery ? 'Click to switch it back on.' : ''}</p>;
    } else {
      const ranked = [...Array(N_IN).keys()].map((i) => ({ i, w: b.w1(hit.h, i) })).sort((p, q) => Math.abs(q.w) - Math.abs(p.w)).slice(0, 3);
      body = (
        <>
          <p>Combines the senses into a new signal. Activation now: <span className="mono">{fmt(b.hidden[hit.h])}</span></p>
          <p className="tt-note">Listens mostly to: {ranked.map((r) => `${INPUT_INFO[r.i].label} (${fmt(r.w)})`).join(', ')}</p>
          {surgery && <p className="tt-note">Click to switch this neuron off.</p>}
        </>
      );
    }
  } else if (hit.kind === 'output') {
    const info = OUTPUT_INFO[hit.o];
    title = info.label;
    body = (
      <>
        <p>{info.desc}</p>
        <p className="tt-val mono">now {fmt(b.output[hit.o])}</p>
      </>
    );
  } else {
    const idx = weightIndex(hit);
    const gain = hit.kind === 'w2' ? 1 : b.inputGain(hit.i);
    const eff = b.w[idx] * gain;
    title = connName(hit);
    const pre = hit.kind === 'w2' ? b.hidden[hit.h] : b.perceived[hit.i];
    body = (
      <>
        <p>
          Weight <span className="mono">{fmt(eff)}</span>: {eff >= 0 ? 'when the left neuron is positive, it pushes the right neuron up' : 'when the left neuron is positive, it pushes the right neuron down'}.
        </p>
        <p className="tt-note mono">signal now {fmt(pre * eff)}</p>
        {Math.abs(gain - 1) > 0.02 && <p className="tt-note">Inherited {fmt(b.w[idx])} × learned liking {gain.toFixed(2)}</p>}
        <p className="tt-note">{surgery ? 'Click to edit.' : 'Click to perform brain surgery on it.'}</p>
      </>
    );
  }
  const left = Math.min(x + 14, L.w - 230);
  const top = Math.min(y + 14, L.h - 40);
  return (
    <div className="tooltip brain-tt" style={{ left: Math.max(4, left), top }}>
      <strong>{title}</strong>
      {body}
    </div>
  );
}

function SurgeryPopover({
  hit,
  x,
  y,
  c,
  L,
  writeDna,
  setWriteDna,
  onClose,
}: {
  hit: Extract<Hit, { kind: 'w1' | 'w2' | 'w3' }>;
  x: number;
  y: number;
  c: Creature;
  L: Layout;
  writeDna: boolean;
  setWriteDna: (v: boolean) => void;
  onClose: () => void;
}) {
  const ctl = useController();
  const idx = weightIndex(hit);
  const [val, setVal] = useState(() => c.brain.w[idx]);
  const apply = (v: number) => {
    const clamped = Math.max(-4, Math.min(4, v));
    setVal(clamped);
    c.brain.w[idx] = clamped;
    if (writeDna) c.genome.brain[idx] = clamped;
    discover('surgeon');
    ctl.touch();
  };
  const original = c.genome.brain[idx];
  const left = Math.max(4, Math.min(x - 120, L.w - 252));
  const top = Math.min(y + 12, L.h - 168);
  return (
    <div className="popover surgery-pop" style={{ left, top }} role="dialog" aria-label="Edit connection">
      <div className="pop-head">
        <strong>{connName(hit)}</strong>
        <button className="icon-btn sm" onClick={onClose} aria-label="Close">
          ×
        </button>
      </div>
      <div className="pop-row">
        <Slider id="surgery-weight" min={-4} max={4} step={0.05} value={val} onChange={apply} label="Connection weight" />
        <span className={`mono weight-val ${val >= 0 ? 'pos' : 'neg'}`}>{fmt(val)}</span>
      </div>
      <div className="pop-actions">
        <button className="btn sm" onClick={() => apply(-val)} title="Make excitation inhibition and vice versa">
          <Shuffle size={12} /> Flip
        </button>
        <button className="btn sm" onClick={() => apply(0)} title="Cut the connection">
          <Scissors size={12} /> Cut
        </button>
        <button className="btn sm ghost" onClick={() => apply(original)} title="Back to the value in its DNA">
          <RotateCcw size={12} /> Reset
        </button>
      </div>
      <label className="pop-check">
        <input type="checkbox" checked={writeDna} onChange={(e) => setWriteDna(e.target.checked)} />
        Also write into its DNA (its future babies inherit this)
      </label>
    </div>
  );
}

// -----------------------------------------------------------------------------
// Canvas drawing
// -----------------------------------------------------------------------------

function drawBrain(ctx: CanvasRenderingContext2D, L: Layout, c: Creature, clock: number, focus: Hit | null, showValues: boolean): void {
  const b = c.brain;
  const H = b.hiddenCount;
  const related = (kind: 'w1' | 'w2' | 'w3', a: number, bb: number): boolean => {
    if (!focus) return true;
    switch (focus.kind) {
      case 'input':
        return (kind === 'w1' && bb === focus.i) || (kind === 'w3' && bb === focus.i);
      case 'hidden':
        return (kind === 'w1' && a === focus.h) || (kind === 'w2' && bb === focus.h);
      case 'output':
        return (kind === 'w2' && a === focus.o) || (kind === 'w3' && a === focus.o);
      case 'w1':
        return kind === 'w1' && a === focus.h && bb === focus.i;
      case 'w2':
        return kind === 'w2' && a === focus.o && bb === focus.h;
      case 'w3':
        return kind === 'w3' && a === focus.o && bb === focus.i;
    }
  };
  const strokeConn = (w: number, rel: boolean, dashed: boolean) => {
    const m = Math.min(1, Math.abs(w) / 3);
    const alpha = rel ? (focus ? 0.25 + 0.7 * m : 0.07 + 0.45 * m) : 0.025;
    ctx.strokeStyle = w >= 0 ? `rgba(79, 214, 255, ${alpha})` : `rgba(255, 93, 122, ${alpha})`;
    ctx.lineWidth = 0.6 + 2.4 * m;
    ctx.setLineDash(dashed ? [3, 3] : []);
  };

  // Reflex links (behind everything)
  for (let o = 0; o < N_OUT; o++) {
    for (let i = 0; i < N_IN; i++) {
      const w = b.w3(o, i);
      if (Math.abs(w) < 0.25) continue;
      strokeConn(w, related('w3', o, i), true);
      ctx.beginPath();
      ctx.moveTo(L.xIn, L.yIn[i]);
      ctx.lineTo(L.xOut, L.yOut[o]);
      ctx.stroke();
    }
  }
  ctx.setLineDash([]);

  // Input → hidden
  for (let h = 0; h < H; h++) {
    if (b.lesioned[h]) continue;
    for (let i = 0; i < N_IN; i++) {
      const w = b.w1(h, i);
      if (Math.abs(w) < 0.15) continue;
      strokeConn(w, related('w1', h, i), false);
      ctx.beginPath();
      ctx.moveTo(L.xIn, L.yIn[i]);
      const mx = (L.xIn + L.xHid) / 2;
      ctx.bezierCurveTo(mx, L.yIn[i], mx, L.yHid[h], L.xHid, L.yHid[h]);
      ctx.stroke();
    }
  }
  // Hidden → output
  for (let o = 0; o < N_OUT; o++) {
    for (let h = 0; h < H; h++) {
      if (b.lesioned[h]) continue;
      const w = b.w[w2Index(o, h)];
      if (Math.abs(w) < 0.15) continue;
      strokeConn(w, related('w2', o, h), false);
      ctx.beginPath();
      ctx.moveTo(L.xHid, L.yHid[h]);
      const mx = (L.xHid + L.xOut) / 2;
      ctx.bezierCurveTo(mx, L.yHid[h], mx, L.yOut[o], L.xOut, L.yOut[o]);
      ctx.stroke();
    }
  }

  // Signals travelling along busy connections
  ctx.globalCompositeOperation = 'lighter';
  const pulse = (x: number, y: number, s: number, pos: boolean) => {
    ctx.fillStyle = pos ? `rgba(160, 235, 255, ${Math.min(0.9, s)})` : `rgba(255, 160, 180, ${Math.min(0.9, s)})`;
    ctx.beginPath();
    ctx.arc(x, y, 1.6 + Math.min(1.6, s * 1.5), 0, Math.PI * 2);
    ctx.fill();
  };
  for (let h = 0; h < H; h++) {
    if (b.lesioned[h]) continue;
    for (let i = 0; i < N_IN; i++) {
      const sig = b.perceived[i] * b.w1(h, i);
      if (Math.abs(sig) < 0.15 || (focus && !related('w1', h, i))) continue;
      const t = (clock * 0.8 + i * 0.13 + h * 0.07) % 1;
      const [x, y] = bez(L.xIn, L.yIn[i], L.xHid, L.yHid[h], t);
      pulse(x, y, Math.abs(sig), sig >= 0);
    }
  }
  for (let o = 0; o < N_OUT; o++) {
    for (let h = 0; h < H; h++) {
      if (b.lesioned[h]) continue;
      const sig = b.hidden[h] * b.w[w2Index(o, h)];
      if (Math.abs(sig) < 0.15 || (focus && !related('w2', o, h))) continue;
      const t = (clock * 0.8 + h * 0.11 + o * 0.3) % 1;
      const [x, y] = bez(L.xHid, L.yHid[h], L.xOut, L.yOut[o], t);
      pulse(x, y, Math.abs(sig), sig >= 0);
    }
  }
  ctx.globalCompositeOperation = 'source-over';

  // Input nodes and labels
  ctx.textBaseline = 'middle';
  for (let i = 0; i < N_IN; i++) {
    const v = b.perceived[i];
    const y = L.yIn[i];
    const isFocus = focus && focus.kind === 'input' && focus.i === i;
    drawNode(ctx, L.xIn, y, 6.5, v, GROUP_COLOR[i], isFocus ? 1 : 0.85);
    ctx.font = `${isFocus ? 600 : 400} 11px Atkinson, system-ui, sans-serif`;
    ctx.fillStyle = isFocus ? PAL.ink : Math.abs(v) > 0.05 ? PAL.ink2 : PAL.ink3;
    ctx.textAlign = 'right';
    const label = INPUT_INFO[i].label;
    const labelX = L.xIn - (showValues ? 46 : 12);
    ctx.fillText(label, labelX, y);
    if (showValues) {
      ctx.font = '500 10px "JetBrains Mono", ui-monospace, monospace';
      ctx.fillStyle = Math.abs(v) > 0.05 ? (v > 0 ? PAL.cfp : PAL.mcherry) : PAL.ink3;
      ctx.fillText(v.toFixed(2), L.xIn - 11, y);
    }
  }

  // Hidden nodes
  for (let h = 0; h < H_MAX; h++) {
    const y = L.yHid[h];
    if (h >= H) {
      ctx.strokeStyle = 'rgba(138, 150, 255, 0.22)';
      ctx.setLineDash([2, 2]);
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(L.xHid, y, 6, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);
      continue;
    }
    if (b.lesioned[h]) {
      ctx.strokeStyle = PAL.mcherry;
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      ctx.arc(L.xHid, y, 7, 0, Math.PI * 2);
      ctx.moveTo(L.xHid - 5, y - 5);
      ctx.lineTo(L.xHid + 5, y + 5);
      ctx.moveTo(L.xHid + 5, y - 5);
      ctx.lineTo(L.xHid - 5, y + 5);
      ctx.stroke();
      continue;
    }
    const isFocus = focus && focus.kind === 'hidden' && focus.h === h;
    drawNode(ctx, L.xHid, y, 7.5, b.hidden[h], PAL.dapi, isFocus ? 1 : 0.9);
  }

  // Output nodes and labels
  for (let o = 0; o < N_OUT; o++) {
    const v = b.output[o];
    const y = L.yOut[o];
    const active = o === 2 ? v > BITE_THRESHOLD : true;
    drawNode(ctx, L.xOut, y, 11, v, o === 2 ? PAL.mcherry : PAL.yfp, 1);
    ctx.textAlign = 'left';
    ctx.font = '600 12px Atkinson, system-ui, sans-serif';
    ctx.fillStyle = PAL.ink;
    ctx.fillText(OUTPUT_INFO[o].label, L.xOut + 16, y - 7);
    ctx.font = '500 10.5px "JetBrains Mono", ui-monospace, monospace';
    let detail = `${v >= 0 ? '+' : '−'}${Math.abs(v).toFixed(2)}`;
    if (o === 0) detail = v > 0.1 ? `${detail} ↑` : v < -0.1 ? `${detail} ↓` : detail;
    if (o === 1) detail = v > 0.1 ? `${detail} ↻` : v < -0.1 ? `${detail} ↺` : detail;
    if (o === 2) detail = active ? 'SNAP!' : 'closed';
    ctx.fillStyle = o === 2 && active ? PAL.mcherry : PAL.ink2;
    ctx.fillText(detail, L.xOut + 16, y + 8);
  }
}

function drawNode(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, v: number, ring: string, alpha: number): void {
  const m = Math.min(1, Math.abs(v));
  ctx.globalAlpha = alpha;
  ctx.fillStyle = '#060b12';
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();
  if (m > 0.02) {
    ctx.fillStyle = v >= 0 ? `rgba(79, 214, 255, ${0.15 + 0.85 * m})` : `rgba(255, 93, 122, ${0.15 + 0.85 * m})`;
    ctx.beginPath();
    ctx.arc(x, y, r * (0.35 + 0.65 * m), 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.strokeStyle = ring;
  ctx.lineWidth = 1.4;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.stroke();
  if (m > 0.6) {
    ctx.globalCompositeOperation = 'lighter';
    ctx.fillStyle = v >= 0 ? 'rgba(79, 214, 255, 0.18)' : 'rgba(255, 93, 122, 0.18)';
    ctx.beginPath();
    ctx.arc(x, y, r + 5, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalCompositeOperation = 'source-over';
  }
  ctx.globalAlpha = 1;
}
