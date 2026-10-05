import { B2_OFFSET, IN, N_IN, OUT, W3_OFFSET } from '../sim/brainLayout.ts';
import { G, GENE_KEYS, type GeneKey, type Genome } from '../sim/genome.ts';

/**
 * Adventure mode content: starting body plans, evolution-point prices and the
 * goals that guide a new player through eat → grow → breed → evolve.
 */

export interface Preset {
  id: string;
  label: string;
  blurb: string;
  genes: Partial<Record<GeneKey, number>>;
}

const BASE: Record<GeneKey, number> = {
  size: 0.45,
  speed: 0.5,
  hue: 0.33,
  diet: 0.12,
  vision: 0.5,
  fov: 0.5,
  maturity: 0.4,
  fertility: 0.6,
  investment: 0.5,
  mutation: 0.4,
  plasticity: 0.3,
  clock: 0.3,
  pattern: 0.3,
  brain: 0.3,
};

export const PRESETS: Preset[] = [
  {
    id: 'grazer',
    label: 'Grazer',
    blurb: 'A calm plant-eater with wide eyes to spot danger.',
    genes: { size: 0.45, speed: 0.45, diet: 0.1, vision: 0.5, fov: 0.7, hue: 0.33, pattern: 0.3 },
  },
  {
    id: 'hunter',
    label: 'Hunter',
    blurb: 'Fast, sharp-eyed meat-eater. Bite other creatures to eat them.',
    genes: { size: 0.6, speed: 0.72, diet: 0.88, vision: 0.66, fov: 0.2, hue: 0.98, pattern: 0.65, investment: 0.65 },
  },
  {
    id: 'omnivore',
    label: 'Omnivore',
    blurb: 'Eats plants and meat, but digests neither very well.',
    genes: { size: 0.5, speed: 0.55, diet: 0.5, vision: 0.55, fov: 0.45, hue: 0.12, pattern: 0.15 },
  },
  {
    id: 'speedster',
    label: 'Speedster',
    blurb: 'Tiny and quick. Grows up fast, dies young.',
    genes: { size: 0.22, speed: 0.92, diet: 0.15, vision: 0.6, fov: 0.5, maturity: 0.15, hue: 0.55, pattern: 0.5 },
  },
  {
    id: 'tank',
    label: 'Tank',
    blurb: 'Huge, tough and long-lived, but slow to turn and expensive to run.',
    genes: { size: 0.95, speed: 0.55, diet: 0.72, vision: 0.42, fov: 0.35, maturity: 0.75, hue: 0.78, pattern: 0.85 },
  },
];

export function presetBody(p: Preset): Float32Array {
  const b = new Float32Array(GENE_KEYS.length);
  for (const k of GENE_KEYS) b[G[k]] = p.genes[k] ?? BASE[k];
  return b;
}

/** Editor groups, in display order. */
export const GENE_GROUPS: { title: string; genes: GeneKey[] }[] = [
  { title: 'Body', genes: ['size', 'speed', 'diet'] },
  { title: 'Eyes', genes: ['vision', 'fov'] },
  { title: 'Mind', genes: ['brain', 'plasticity'] },
  { title: 'Life cycle', genes: ['maturity', 'investment', 'fertility', 'mutation'] },
  { title: 'Looks', genes: ['hue', 'pattern'] },
];

/** Genes that change only appearance cost nothing to evolve. */
export const FREE_GENES: GeneKey[] = ['hue', 'pattern', 'clock'];

/** Evolution points per 0.1 change of a gene (a tenth of its full range). */
export const EP_PER_STEP = 1;

export function evolveCost(from: Float32Array, to: Float32Array): number {
  let cost = 0;
  for (const k of GENE_KEYS) {
    if (FREE_GENES.includes(k)) continue;
    cost += Math.abs(to[G[k]] - from[G[k]]) * 10 * EP_PER_STEP;
  }
  // Tiny slider jitters are free.
  return Math.max(0, Math.ceil(cost - 0.05));
}

export type DietKind = 'plants' | 'both' | 'meat';

export function dietKind(diet: number): DietKind {
  return diet < 0.4 ? 'plants' : diet > 0.62 ? 'meat' : 'both';
}

/**
 * Wires the reflexes (direct sense → action links) for a diet, leaving the
 * rest of the brain alone: what the autopilot and your wild descendants
 * start out doing.
 */
export function applyDietInstincts(brain: Float32Array, kind: DietKind): void {
  const reflex = (o: number, i: number) => W3_OFFSET + o * N_IN + i;
  const set = (o: number, i: number, v: number) => (brain[reflex(o, i)] = v);
  set(OUT.turn, IN.wall, 2);
  if (kind === 'plants') {
    set(OUT.turn, IN.plantDir, 3);
    set(OUT.turn, IN.berryDir, 2.4);
    set(OUT.thrust, IN.plantNear, 0.6);
    set(OUT.turn, IN.meatDir, 0);
    set(OUT.turn, IN.creatureDir, 0);
    set(OUT.bite, IN.creatureNear, 0);
    brain[B2_OFFSET + OUT.thrust] = 0.8;
    brain[B2_OFFSET + OUT.bite] = -1.5;
  } else if (kind === 'meat') {
    set(OUT.turn, IN.plantDir, 0);
    set(OUT.turn, IN.berryDir, 0);
    set(OUT.thrust, IN.plantNear, 0);
    set(OUT.turn, IN.creatureDir, 3);
    set(OUT.turn, IN.meatDir, 2.2);
    set(OUT.thrust, IN.creatureNear, 0.7);
    set(OUT.bite, IN.creatureNear, 3.5);
    set(OUT.bite, IN.kin, -3);
    set(OUT.bite, IN.energy, -1.6);
    brain[B2_OFFSET + OUT.thrust] = 0.9;
    brain[B2_OFFSET + OUT.bite] = -1.9;
  } else {
    set(OUT.turn, IN.plantDir, 2.4);
    set(OUT.turn, IN.berryDir, 2);
    set(OUT.turn, IN.meatDir, 2.6);
    set(OUT.thrust, IN.plantNear, 0.5);
    set(OUT.turn, IN.creatureDir, 0);
    set(OUT.bite, IN.creatureNear, 0);
    brain[B2_OFFSET + OUT.thrust] = 0.8;
    brain[B2_OFFSET + OUT.bite] = -1.5;
  }
}

export function designGenome(body: Float32Array, brain: Float32Array): Genome {
  return { body: body.slice(), brain: brain.slice() };
}

// ---------------------------------------------------------------------------
// Goals
// ---------------------------------------------------------------------------

export interface GoalProgress {
  meals: number;
  grown: boolean;
  eggsLaid: number;
  generation: number;
  alive: number;
  /** Seconds the bloodline has survived. */
  survived: number;
  kills: number;
  newSpecies: boolean;
}

export interface Goal {
  id: string;
  title: string;
  hint: string;
  reward: number;
  done: (p: GoalProgress) => boolean;
  progress?: (p: GoalProgress) => [number, number];
}

export const GOALS: Goal[] = [
  {
    id: 'eat',
    title: 'Eat 5 meals',
    hint: 'Swim into green plants (or meat, if you eat meat).',
    reward: 3,
    done: (p) => p.meals >= 5,
    progress: (p) => [Math.min(5, p.meals), 5],
  },
  { id: 'grow', title: 'Grow up', hint: 'Keep eating. Babies need time and food to reach adult size.', reward: 3, done: (p) => p.grown },
  {
    id: 'eggs',
    title: 'Lay your first eggs',
    hint: 'As a well-fed adult, press Lay eggs. You get to evolve the baby you will play next.',
    reward: 4,
    done: (p) => p.eggsLaid >= 1,
  },
  {
    id: 'gen3',
    title: 'Reach generation 3',
    hint: 'Each time you lay eggs you continue as the newborn: one generation more.',
    reward: 6,
    done: (p) => p.generation >= 3,
    progress: (p) => [Math.min(3, p.generation), 3],
  },
  {
    id: 'hunt',
    title: 'Win a fight',
    hint: 'Bite a smaller creature until it dies (meat-eaters gain the most).',
    reward: 5,
    done: (p) => p.kills >= 1,
  },
  {
    id: 'kin10',
    title: '10 of your bloodline alive',
    hint: 'Your brothers and sisters breed on their own. Well-designed bodies spread.',
    reward: 8,
    done: (p) => p.alive >= 10,
    progress: (p) => [Math.min(10, p.alive), 10],
  },
  {
    id: 'survive',
    title: 'Bloodline survives 5 minutes',
    hint: 'If you die, you can carry on as any living descendant.',
    reward: 8,
    done: (p) => p.survived >= 300,
    progress: (p) => [Math.min(5, Math.floor(p.survived / 60)), 5],
  },
  {
    id: 'species',
    title: 'Evolve into a new species',
    hint: 'Change your DNA enough over a few generations and your line becomes a new species.',
    reward: 10,
    done: (p) => p.newSpecies,
  },
  {
    id: 'gen10',
    title: 'Reach generation 10',
    hint: 'A true dynasty.',
    reward: 12,
    done: (p) => p.generation >= 10,
    progress: (p) => [Math.min(10, p.generation), 10],
  },
  {
    id: 'kin40',
    title: '40 of your bloodline alive',
    hint: 'Your design is winning the struggle for existence.',
    reward: 15,
    done: (p) => p.alive >= 40,
    progress: (p) => [Math.min(40, p.alive), 40],
  },
];

/** Evolution points earned per unit of energy eaten. */
export const EP_PER_ENERGY = 1 / 12;
export const EP_PER_KILL = 3;
export const START_EP = 0;
