import { Rng } from './rng.ts';
import {
  B1_OFFSET,
  B2_OFFSET,
  BRAIN_LEN,
  H_MAX,
  IN,
  N_IN,
  N_OUT,
  OUT,
  W1_OFFSET,
  W2_OFFSET,
  W3_OFFSET,
} from './brainLayout.ts';

/**
 * DNA
 * ===
 * A genome has two parts:
 *  - body genes: 14 numbers between 0 and 1. Each one is "expressed" as a
 *    physical trait (size, speed, colour, diet …) when the creature is born.
 *  - brain genes: the starting strength of every neural connection.
 *
 * Children get a copy of their parent's genome with a few random copying
 * errors (mutations). If a mate is close by, the child's genome is a mix of
 * both parents (crossover).
 */

export const GENE_KEYS = [
  'size',
  'speed',
  'hue',
  'diet',
  'vision',
  'fov',
  'maturity',
  'fertility',
  'investment',
  'mutation',
  'plasticity',
  'clock',
  'pattern',
  'brain',
] as const;

export type GeneKey = (typeof GENE_KEYS)[number];
export const N_BODY = GENE_KEYS.length;

export const G: Record<GeneKey, number> = Object.fromEntries(
  GENE_KEYS.map((k, i) => [k, i]),
) as Record<GeneKey, number>;

export interface GeneInfo {
  key: GeneKey;
  label: string;
  /** What the low end / high end of the gene means. */
  low: string;
  high: string;
  desc: string;
  /** Converts the raw 0..1 gene into the trait value shown in the UI. */
  format: (g: number) => string;
  /** How much a difference in this gene counts when comparing species. */
  speciesWeight: number;
}

export const GENE_INFO: GeneInfo[] = [
  {
    key: 'size',
    label: 'Body size',
    low: 'tiny',
    high: 'huge',
    desc: 'Big bodies store more energy, live longer and bite harder. But they burn more energy at rest and turn slowly.',
    format: (g) => `${(5 + 13 * g).toFixed(1)} μm`,
    speciesWeight: 1.4,
  },
  {
    key: 'speed',
    label: 'Muscle',
    low: 'weak',
    high: 'strong',
    desc: 'Stronger muscles swim faster, but every stroke costs more energy.',
    format: (g) => `${Math.round(40 + 120 * g)} force`,
    speciesWeight: 1.2,
  },
  {
    key: 'hue',
    label: 'Colour',
    low: '',
    high: '',
    desc: 'Body colour. It does not change fitness directly, but relatives share it, so creatures can use it to recognise family.',
    format: (g) => `${Math.round(g * 360)}°`,
    speciesWeight: 1.6,
  },
  {
    key: 'diet',
    label: 'Diet',
    low: 'plant-eater',
    high: 'meat-eater',
    desc: 'Which food the gut can digest. Specialists digest their food well; generalists (in the middle) digest both, but neither well.',
    format: (g) => (g < 0.35 ? 'herbivore' : g > 0.65 ? 'carnivore' : 'omnivore'),
    speciesWeight: 2.2,
  },
  {
    key: 'vision',
    label: 'Eyesight',
    low: 'short-sighted',
    high: 'far-sighted',
    desc: 'How far the eyes can see. Seeing far helps find food and danger, but big eyes cost energy.',
    format: (g) => `${Math.round(60 + 240 * g)} μm`,
    speciesWeight: 1,
  },
  {
    key: 'fov',
    label: 'Field of view',
    low: 'narrow',
    high: 'wide',
    desc: 'How wide the eyes look. Wide eyes (like prey animals) spot more around them; narrow eyes (like hunters) aim more precisely.',
    format: (g) => `${Math.round(60 + 260 * g)}°`,
    speciesWeight: 1,
  },
  {
    key: 'maturity',
    label: 'Growth time',
    low: 'grows fast',
    high: 'grows slow',
    desc: 'How long it takes to grow up. Fast growers breed sooner but die younger: "live fast, die young".',
    format: (g) => `${Math.round(8 + 37 * g)} s`,
    speciesWeight: 0.8,
  },
  {
    key: 'fertility',
    label: 'Breeding threshold',
    low: 'breeds early',
    high: 'waits until full',
    desc: 'How full the energy tank must be before having a baby. Breeding early means more babies, but leaves the parent weak.',
    format: (g) => `${Math.round((0.45 + 0.5 * g) * 100)}% full`,
    speciesWeight: 0.8,
  },
  {
    key: 'investment',
    label: 'Baby size',
    low: 'many small babies',
    high: 'few big babies',
    desc: 'How much energy goes into each baby. Big babies survive better but cost more — the trade-off biologists call r/K selection.',
    format: (g) => `${Math.round((0.3 + 0.4 * g) * 100)}% of adult`,
    speciesWeight: 0.8,
  },
  {
    key: 'mutation',
    label: 'Mutation rate',
    low: 'careful copying',
    high: 'sloppy copying',
    desc: 'How many copying mistakes happen when the DNA is passed on. Mistakes are usually harmful, but they are also the raw material of evolution.',
    format: (g) => `${(mutationProbability(g) * 100).toFixed(1)}% genes`,
    speciesWeight: 0.5,
  },
  {
    key: 'plasticity',
    label: 'Learning rate',
    low: 'pure instinct',
    high: 'fast learner',
    desc: 'How quickly the brain rewires itself from experience during life (Hebbian learning). Learning brains cost extra energy.',
    format: (g) => `${Math.round(g * 100)}%`,
    speciesWeight: 0.8,
  },
  {
    key: 'clock',
    label: 'Rhythm',
    low: 'slow beat',
    high: 'fast beat',
    desc: 'Speed of the internal oscillator neuron, a built-in heartbeat the brain can use to time movements.',
    format: (g) => `${(0.15 + 1.6 * g).toFixed(2)} Hz`,
    speciesWeight: 0.3,
  },
  {
    key: 'pattern',
    label: 'Markings',
    low: 'plain',
    high: 'spotted',
    desc: 'Spots on the body. Purely cosmetic: a neutral gene that drifts randomly over time.',
    format: (g) => `${Math.round(g * 6)} spots`,
    speciesWeight: 0.8,
  },
  {
    key: 'brain',
    label: 'Brain size',
    low: 'few neurons',
    high: 'many neurons',
    desc: 'How many hidden neurons are switched on. More neurons can learn more complex behaviour, but brains are expensive to run.',
    format: (g) => `${hiddenCountFromGene(g)} neurons`,
    speciesWeight: 1,
  },
];

export interface Genome {
  body: Float32Array;
  brain: Float32Array;
}

export function mutationProbability(gene: number): number {
  return 0.01 + 0.1 * gene * gene;
}

export function hiddenCountFromGene(g: number): number {
  return Math.max(2, Math.min(H_MAX, Math.round(2 + g * (H_MAX - 2))));
}

export function cloneGenome(g: Genome): Genome {
  return { body: new Float32Array(g.body), brain: new Float32Array(g.brain) };
}

const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);
const WMAX = 4;
const clampW = (v: number) => (v < -WMAX ? -WMAX : v > WMAX ? WMAX : v);

export interface RandomGenomeOptions {
  hue?: number;
  diet?: number;
  /** Standard deviation of the random brain weights. */
  weightScale?: number;
}

/** A completely random genome: the "primordial soup" starting point. */
export function randomGenome(rng: Rng, opts: RandomGenomeOptions = {}): Genome {
  const body = new Float32Array(N_BODY);
  for (let i = 0; i < N_BODY; i++) body[i] = rng.next();
  body[G.hue] = opts.hue ?? rng.next();
  body[G.diet] = opts.diet ?? rng.range(0, 0.25);
  body[G.size] = rng.range(0.25, 0.6);
  body[G.speed] = rng.range(0.3, 0.7);
  body[G.vision] = rng.range(0.3, 0.6);
  body[G.fov] = rng.range(0.3, 0.6);
  body[G.mutation] = rng.range(0.35, 0.6);
  body[G.plasticity] = rng.range(0, 0.4);
  body[G.brain] = rng.range(0.3, 0.6);
  body[G.fertility] = rng.range(0.3, 0.7);
  body[G.investment] = rng.range(0.3, 0.7);
  body[G.maturity] = rng.range(0.3, 0.7);

  // Primordial brains: random wiring, but with gentle output weights and a
  // forward-swimming bias. The first creatures mostly cruise straight ahead;
  // evolution has to discover steering.
  const brain = new Float32Array(BRAIN_LEN);
  const s = opts.weightScale ?? 1;
  for (let i = W1_OFFSET; i < B1_OFFSET; i++) brain[i] = clampW(rng.gauss(0, 0.8 * s));
  for (let i = B1_OFFSET; i < W2_OFFSET; i++) brain[i] = clampW(rng.gauss(0, 0.5 * s));
  for (let i = W2_OFFSET; i < B2_OFFSET; i++) brain[i] = clampW(rng.gauss(0, 0.45 * s));
  for (let i = W3_OFFSET; i < BRAIN_LEN; i++) brain[i] = clampW(rng.gauss(0, 0.3 * s));
  brain[B2_OFFSET + OUT.thrust] = rng.gauss(0.6, 0.3);
  brain[B2_OFFSET + OUT.turn] = rng.gauss(0, 0.25);
  brain[B2_OFFSET + OUT.bite] = rng.gauss(-0.8, 0.4);
  return { body, brain };
}

/**
 * Copies a genome with random mutations.
 * `scale` is the global "mutation strength" knob from the lab controls.
 */
export function mutate(parent: Genome, rng: Rng, scale = 1): Genome {
  const child = cloneGenome(parent);
  if (scale <= 0) return child;
  const p = Math.min(0.6, mutationProbability(parent.body[G.mutation]) * scale);
  const b = child.body;
  for (let i = 0; i < N_BODY; i++) {
    if (rng.next() < p) {
      if (i === G.hue) {
        b[i] = (b[i] + rng.gauss(0, 0.035) + 1) % 1;
      } else {
        b[i] = clamp01(b[i] + rng.gauss(0, 0.07));
      }
    }
  }
  const w = child.brain;
  for (let i = 0; i < BRAIN_LEN; i++) {
    if (rng.next() < p) {
      // Most mutations nudge a connection; a few rewire it completely.
      w[i] = rng.next() < 0.08 ? clampW(rng.gauss(0, 1.5)) : clampW(w[i] + rng.gauss(0, 0.5));
    }
  }
  return child;
}

/**
 * Sexual reproduction: each body gene comes from one parent at random.
 * Brain genes are inherited one *neuron at a time* (all of a hidden neuron's
 * connections travel together), which keeps working circuits intact.
 */
export function crossover(a: Genome, b: Genome, rng: Rng): Genome {
  const child = cloneGenome(a);
  for (let i = 0; i < N_BODY; i++) {
    if (rng.next() < 0.5) child.body[i] = b.body[i];
  }
  for (let h = 0; h < H_MAX; h++) {
    if (rng.next() < 0.5) {
      for (let i = 0; i < N_IN; i++) child.brain[W1_OFFSET + h * N_IN + i] = b.brain[W1_OFFSET + h * N_IN + i];
      child.brain[B1_OFFSET + h] = b.brain[B1_OFFSET + h];
      for (let o = 0; o < N_OUT; o++) child.brain[W2_OFFSET + o * H_MAX + h] = b.brain[W2_OFFSET + o * H_MAX + h];
    }
  }
  for (let o = 0; o < N_OUT; o++) {
    if (rng.next() < 0.5) {
      child.brain[B2_OFFSET + o] = b.brain[B2_OFFSET + o];
      for (let i = 0; i < N_IN; i++) child.brain[W3_OFFSET + o * N_IN + i] = b.brain[W3_OFFSET + o * N_IN + i];
    }
  }
  return child;
}

function hueDistance(a: number, b: number): number {
  const d = Math.abs(a - b) % 1;
  return d > 0.5 ? 1 - d : d;
}

/**
 * Genetic distance between two genomes. Mostly driven by visible body traits,
 * with a smaller contribution from the brain. Used to decide when a lineage
 * has drifted far enough to count as a new species.
 */
export function geneticDistance(a: Genome, b: Genome): number {
  let sum = 0;
  let wsum = 0;
  for (let i = 0; i < N_BODY; i++) {
    const w = GENE_INFO[i].speciesWeight;
    const d = i === G.hue ? hueDistance(a.body[i], b.body[i]) * 2 : a.body[i] - b.body[i];
    sum += w * d * d;
    wsum += w;
  }
  let brainDiff = 0;
  for (let i = 0; i < BRAIN_LEN; i++) brainDiff += Math.abs(a.brain[i] - b.brain[i]);
  brainDiff /= BRAIN_LEN;
  return Math.sqrt(sum / wsum) + 0.08 * brainDiff;
}

/** A hand-wired "starter brain" that already steers toward plants — used by lessons. */
export function seedForagerBrain(brain: Float32Array, rng: Rng, noise = 0.1): void {
  for (let i = 0; i < BRAIN_LEN; i++) brain[i] = rng.gauss(0, noise);
  const skip = (o: number, i: number) => W3_OFFSET + o * N_IN + i;
  brain[skip(OUT.turn, IN.plantDir)] = 3; // reflex: turn toward the nearest plant
  brain[skip(OUT.turn, IN.berryDir)] = 2.4; // …and toward berries (a tasty treat)
  brain[skip(OUT.thrust, IN.plantNear)] = 0.6; // swim harder when food is close
  brain[skip(OUT.turn, IN.wall)] = 2; // veer away from the wall
  brain[B2_OFFSET + OUT.thrust] = 0.8;
  brain[B2_OFFSET + OUT.bite] = -1.5;
}

/**
 * Hand-wired "hunter instincts": chase the nearest creature, bite it when it
 * is right in front (unless it looks like family), and go for meat.
 */
export function seedHunterBrain(brain: Float32Array, rng: Rng, noise = 0.1): void {
  for (let i = 0; i < BRAIN_LEN; i++) brain[i] = rng.gauss(0, noise);
  const skip = (o: number, i: number) => W3_OFFSET + o * N_IN + i;
  brain[skip(OUT.turn, IN.creatureDir)] = 3;
  brain[skip(OUT.turn, IN.meatDir)] = 2.2;
  brain[skip(OUT.turn, IN.wall)] = 2;
  brain[skip(OUT.thrust, IN.creatureNear)] = 0.7;
  brain[skip(OUT.bite, IN.creatureNear)] = 3.5;
  brain[skip(OUT.bite, IN.kin)] = -3;
  brain[skip(OUT.bite, IN.energy)] = -1.6; // a full belly makes it lazy
  brain[skip(OUT.thrust, IN.energy)] = -0.5;
  brain[B2_OFFSET + OUT.thrust] = 0.9;
  brain[B2_OFFSET + OUT.bite] = -1.9;
}

/** Body plan of a typical founding hunter. */
export function hunterBody(body: Float32Array, rng: Rng): void {
  body[G.diet] = rng.range(0.82, 0.92);
  body[G.size] = rng.range(0.5, 0.65);
  body[G.speed] = rng.range(0.6, 0.75);
  body[G.vision] = rng.range(0.55, 0.7);
  body[G.fov] = rng.range(0.15, 0.3);
  body[G.fertility] = rng.range(0.6, 0.8);
  body[G.investment] = rng.range(0.55, 0.75);
}

/** Number of brain genes that are direct reflex links. */
export const REFLEX_GENES = BRAIN_LEN - W3_OFFSET;

// ---------------------------------------------------------------------------
// Serialisation: genomes travel as compact base64 strings ("DNA codes").
// ---------------------------------------------------------------------------

function f32ToB64(arr: Float32Array): string {
  const bytes = new Uint8Array(arr.buffer, arr.byteOffset, arr.byteLength);
  let s = '';
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
  return btoa(s);
}

function b64ToF32(b64: string, len: number): Float32Array {
  const s = atob(b64);
  const bytes = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) bytes[i] = s.charCodeAt(i);
  const out = new Float32Array(len);
  const src = new Float32Array(bytes.buffer, 0, Math.min(len, Math.floor(bytes.length / 4)));
  out.set(src);
  return out;
}

export function encodeGenome(g: Genome): string {
  return `${f32ToB64(g.body)}.${f32ToB64(g.brain)}`;
}

export function decodeGenome(code: string): Genome {
  const [body, brain] = code.trim().split('.');
  if (!body || !brain) throw new Error('Not a valid DNA code');
  const g = { body: b64ToF32(body, N_BODY), brain: b64ToF32(brain, BRAIN_LEN) };
  for (let i = 0; i < N_BODY; i++) if (!Number.isFinite(g.body[i])) throw new Error('Corrupted DNA code');
  for (let i = 0; i < BRAIN_LEN; i++) if (!Number.isFinite(g.brain[i])) throw new Error('Corrupted DNA code');
  return g;
}

/** Shareable DNA code with a recognisable prefix. */
export function toDnaCode(g: Genome): string {
  return `LIFESIM-DNA:${encodeGenome(g)}`;
}

export function fromDnaCode(code: string): Genome {
  const trimmed = code.trim();
  const raw = trimmed.startsWith('LIFESIM-DNA:') ? trimmed.slice('LIFESIM-DNA:'.length) : trimmed;
  return decodeGenome(raw);
}
