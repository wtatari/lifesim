/**
 * Colours of the microscope world. The UI theme (styles/tokens.css) uses the
 * same values so canvas drawings and HTML panels match. Names follow the
 * fluorescent proteins and dyes used in real microscopy.
 */
export const PAL = {
  void: '#03060b',
  agar: '#0a121c',
  agarEdge: '#060b12',
  gfp: '#62f2a0', // plants, growth, positive
  cfp: '#4fd6ff', // selection, interactive accent
  yfp: '#ffcf5a', // energy, highlights
  mcherry: '#ff5d7a', // meat, predators, danger, negative weights
  berry: '#b98bff', // berries
  dapi: '#8a96ff', // hidden neurons
  ink: '#e6edf5',
  ink2: '#a9b6c7',
  ink3: '#6f7d90',
} as const;

const hueCache = new Map<string, string>();

/** Body colour for a creature hue (0..1). */
export function hueColor(h: number, s = 72, l = 60, a = 1): string {
  const key = `${Math.round(h * 360)}|${s}|${l}|${a}`;
  let v = hueCache.get(key);
  if (!v) {
    v = a === 1 ? `hsl(${Math.round(h * 360)} ${s}% ${l}%)` : `hsl(${Math.round(h * 360)} ${s}% ${l}% / ${a})`;
    if (hueCache.size > 4000) hueCache.clear();
    hueCache.set(key, v);
  }
  return v;
}

/** RGB triple for a hue, for blending in canvas code. */
export function hueRgb(h: number, s = 0.72, l = 0.6): [number, number, number] {
  const k = (n: number) => (n + h * 12) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = (n: number) => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  return [Math.round(f(0) * 255), Math.round(f(8) * 255), Math.round(f(4) * 255)];
}

/** Colour for a signed value: cyan for positive, red for negative. */
export function signedColor(v: number, alpha = 1): string {
  const m = Math.min(1, Math.abs(v));
  if (v >= 0) return `rgba(79, 214, 255, ${alpha * (0.15 + 0.85 * m)})`;
  return `rgba(255, 93, 122, ${alpha * (0.15 + 0.85 * m)})`;
}
