/**
 * Minimal canvas charting: stacked areas and lines over simulated time,
 * with a faint grid, axis labels from the theme, and an emphasised endpoint.
 */
export interface Series {
  key: string;
  label: string;
  color: string;
  values: number[];
  dashed?: boolean;
  /** Draw on the secondary (right) axis. */
  right?: boolean;
  fill?: boolean;
}

export interface ChartGeom {
  x0: number;
  x1: number;
  y0: number;
  y1: number;
}

const INK3 = '#6f7d90';
const GRID = 'rgba(150, 190, 235, 0.08)';

export function niceStep(raw: number): number {
  if (raw <= 0 || !Number.isFinite(raw)) return 1;
  const p = Math.pow(10, Math.floor(Math.log10(raw)));
  const n = raw / p;
  const m = n <= 1 ? 1 : n <= 2 ? 2 : n <= 2.5 ? 2.5 : n <= 5 ? 5 : 10;
  return m * p;
}

export function niceMax(v: number): number {
  if (v <= 0 || !Number.isFinite(v)) return 1;
  const p = Math.pow(10, Math.floor(Math.log10(v)));
  const n = v / p;
  const m = n <= 1 ? 1 : n <= 2 ? 2 : n <= 2.5 ? 2.5 : n <= 5 ? 5 : 10;
  return m * p;
}

export function prepare(ctx: CanvasRenderingContext2D, canvas: HTMLCanvasElement, w: number, h: number): number {
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) {
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
  }
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, w, h);
  return dpr;
}

export function drawAxes(
  ctx: CanvasRenderingContext2D,
  g: ChartGeom,
  times: number[],
  yMax: number,
  opts: { yLabel?: (v: number) => string; rightMax?: number; rightLabel?: (v: number) => string; yMin?: number } = {},
): void {
  const yMin = opts.yMin ?? 0;
  ctx.font = '500 10px "JetBrains Mono", ui-monospace, monospace';
  ctx.textBaseline = 'middle';
  ctx.strokeStyle = GRID;
  ctx.lineWidth = 1;
  // Round tick values (multiples of 1, 2, 2.5 or 5 × 10^k) so every label is a real number.
  const step = niceStep((yMax - yMin) / 4);
  for (let v = yMin; v <= yMax + step * 0.01; v += step) {
    const y = g.y1 - ((v - yMin) / (yMax - yMin)) * (g.y1 - g.y0);
    ctx.beginPath();
    ctx.moveTo(g.x0, Math.round(y) + 0.5);
    ctx.lineTo(g.x1, Math.round(y) + 0.5);
    ctx.stroke();
    ctx.fillStyle = INK3;
    ctx.textAlign = 'right';
    ctx.fillText(opts.yLabel ? opts.yLabel(v) : String(Math.round(v)), g.x0 - 6, y);
  }
  if (opts.rightMax !== undefined) {
    const rstep = niceStep(opts.rightMax / 4);
    ctx.textAlign = 'left';
    ctx.fillStyle = INK3;
    for (let v = 0; v <= opts.rightMax + rstep * 0.01; v += rstep) {
      const y = g.y1 - (v / opts.rightMax) * (g.y1 - g.y0);
      ctx.fillText(opts.rightLabel ? opts.rightLabel(v) : String(Math.round(v)), g.x1 + 6, y);
    }
  }
  // Time labels
  if (times.length > 1) {
    const t0 = times[0];
    const t1 = times[times.length - 1];
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.fillStyle = INK3;
    const n = 4;
    let prev = '';
    for (let k = 0; k <= n; k++) {
      const t = t0 + ((t1 - t0) * k) / n;
      const x = g.x0 + ((g.x1 - g.x0) * k) / n;
      const label = timeLabel(t);
      if (label === prev) continue;
      prev = label;
      ctx.fillText(label, Math.min(g.x1 - 14, Math.max(g.x0 + 14, x)), g.y1 + 6);
    }
  }
}

export function timeLabel(t: number): string {
  const s = Math.max(0, Math.round(t));
  if (s < 3600) return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
  return `${Math.floor(s / 3600)}h${String(Math.floor((s % 3600) / 60)).padStart(2, '0')}`;
}

export function xAt(g: ChartGeom, i: number, n: number): number {
  return n <= 1 ? g.x1 : g.x0 + ((g.x1 - g.x0) * i) / (n - 1);
}

export function drawStacked(ctx: CanvasRenderingContext2D, g: ChartGeom, series: Series[], yMax: number): void {
  const n = series[0]?.values.length ?? 0;
  if (n < 2) return;
  const base = new Float64Array(n);
  const yOf = (v: number) => g.y1 - (v / yMax) * (g.y1 - g.y0);
  for (const s of series) {
    ctx.beginPath();
    for (let i = 0; i < n; i++) {
      const x = xAt(g, i, n);
      const y = yOf(base[i] + (s.values[i] || 0));
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    for (let i = n - 1; i >= 0; i--) ctx.lineTo(xAt(g, i, n), yOf(base[i]));
    ctx.closePath();
    ctx.globalAlpha = 0.78;
    ctx.fillStyle = s.color;
    ctx.fill();
    ctx.globalAlpha = 1;
    ctx.strokeStyle = 'rgba(3, 6, 11, 0.55)';
    ctx.lineWidth = 1;
    ctx.stroke();
    for (let i = 0; i < n; i++) base[i] += s.values[i] || 0;
  }
}

export function drawLine(ctx: CanvasRenderingContext2D, g: ChartGeom, s: Series, yMax: number, yMin = 0): void {
  const n = s.values.length;
  if (n < 2) return;
  const yOf = (v: number) => g.y1 - ((v - yMin) / (yMax - yMin)) * (g.y1 - g.y0);
  ctx.strokeStyle = s.color;
  ctx.lineWidth = 1.8;
  ctx.setLineDash(s.dashed ? [4, 4] : []);
  ctx.beginPath();
  let started = false;
  let lastX = 0;
  let lastY = 0;
  for (let i = 0; i < n; i++) {
    const v = s.values[i];
    if (!Number.isFinite(v)) {
      started = false;
      continue;
    }
    const x = xAt(g, i, n);
    const y = yOf(v);
    if (!started) {
      ctx.moveTo(x, y);
      started = true;
    } else ctx.lineTo(x, y);
    lastX = x;
    lastY = y;
  }
  ctx.stroke();
  ctx.setLineDash([]);
  if (s.fill) {
    ctx.lineTo(lastX, g.y1);
    ctx.lineTo(g.x0, g.y1);
    ctx.closePath();
    ctx.globalAlpha = 0.1;
    ctx.fillStyle = s.color;
    ctx.fill();
    ctx.globalAlpha = 1;
  }
  if (started) {
    ctx.fillStyle = s.color;
    ctx.beginPath();
    ctx.arc(lastX, lastY, 3, 0, Math.PI * 2);
    ctx.fill();
  }
}

export function drawHover(ctx: CanvasRenderingContext2D, g: ChartGeom, x: number): void {
  ctx.strokeStyle = 'rgba(230, 237, 245, 0.35)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(Math.round(x) + 0.5, g.y0);
  ctx.lineTo(Math.round(x) + 0.5, g.y1);
  ctx.stroke();
}
