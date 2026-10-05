/**
 * The fixed "wiring diagram" every creature's brain follows.
 *
 *   14 sensory inputs  →  up to 12 hidden neurons  →  3 motor outputs
 *          └──────────── direct "reflex" links ─────────────┘
 *
 * The *strength* of every connection (the weights) is written in the DNA, so
 * evolution can rewire behaviour. How many hidden neurons are switched on is
 * also a gene ("brain size"). Direct input→output links work like reflex
 * arcs: simple, fast reactions that evolution can discover with a single
 * mutation, while the hidden layer allows more complex decisions.
 */

export const N_IN = 14;
/** The first 8 inputs come from the eyes; only their connections can learn. */
export const N_VISION = 8;
export const H_MAX = 12;
export const N_OUT = 3;

/** Layout of the brain section of the genome (and of a Brain's weight array). */
export const W1_OFFSET = 0; // [h * N_IN + i]  input → hidden
export const B1_OFFSET = W1_OFFSET + H_MAX * N_IN; // [h]  hidden biases
export const W2_OFFSET = B1_OFFSET + H_MAX; // [o * H_MAX + h]  hidden → output
export const B2_OFFSET = W2_OFFSET + N_OUT * H_MAX; // [o]  output biases
export const W3_OFFSET = B2_OFFSET + N_OUT; // [o * N_IN + i]  input → output (reflexes)
export const BRAIN_LEN = W3_OFFSET + N_OUT * N_IN;

export const IN = {
  plantDir: 0,
  plantNear: 1,
  berryDir: 2,
  berryNear: 3,
  meatDir: 4,
  meatNear: 5,
  creatureDir: 6,
  creatureNear: 7,
  threat: 8,
  kin: 9,
  energy: 10,
  pain: 11,
  wall: 12,
  clock: 13,
} as const;

export const OUT = {
  thrust: 0,
  turn: 1,
  bite: 2,
} as const;

export type NeuronGroup = 'vision' | 'social' | 'body' | 'motor';

export interface NeuronInfo {
  key: string;
  /** Short label drawn next to the neuron. */
  label: string;
  /** Tiny glyph used where space is tight. */
  glyph: string;
  group: NeuronGroup;
  /** Plain-language explanation shown on hover. */
  desc: string;
  /** Typical range of the value, for the UI. */
  range: [number, number];
}

export const INPUT_INFO: NeuronInfo[] = [
  {
    key: 'plantDir',
    label: 'Plant direction',
    glyph: 'P↔',
    group: 'vision',
    desc: 'Where the nearest green plant is in my field of view: −1 = far left, 0 = straight ahead, +1 = far right. 0 also when no plant is seen.',
    range: [-1, 1],
  },
  {
    key: 'plantNear',
    label: 'Plant nearness',
    glyph: 'P●',
    group: 'vision',
    desc: 'How close that plant is: 0 = nothing seen (or at the edge of sight), 1 = touching it.',
    range: [0, 1],
  },
  {
    key: 'berryDir',
    label: 'Berry direction',
    glyph: 'B↔',
    group: 'vision',
    desc: 'Where the nearest violet berry is (−1 left … +1 right). Berries are rich in energy, but in some worlds they turn poisonous.',
    range: [-1, 1],
  },
  {
    key: 'berryNear',
    label: 'Berry nearness',
    glyph: 'B●',
    group: 'vision',
    desc: 'How close the nearest berry is (0 = none, 1 = touching).',
    range: [0, 1],
  },
  {
    key: 'meatDir',
    label: 'Meat direction',
    glyph: 'M↔',
    group: 'vision',
    desc: 'Where the nearest piece of meat (remains of a dead creature) is. Only useful to meat-eaters.',
    range: [-1, 1],
  },
  {
    key: 'meatNear',
    label: 'Meat nearness',
    glyph: 'M●',
    group: 'vision',
    desc: 'How close the nearest meat is (0 = none, 1 = touching).',
    range: [0, 1],
  },
  {
    key: 'creatureDir',
    label: 'Creature direction',
    glyph: 'C↔',
    group: 'vision',
    desc: 'Where the nearest other creature is (−1 left … +1 right): a mate, a rival, prey… or a predator.',
    range: [-1, 1],
  },
  {
    key: 'creatureNear',
    label: 'Creature nearness',
    glyph: 'C●',
    group: 'vision',
    desc: 'How close that creature is (0 = nobody in sight, 1 = touching).',
    range: [0, 1],
  },
  {
    key: 'threat',
    label: 'Its size vs mine',
    glyph: 'Sz',
    group: 'social',
    desc: 'How big the nearest visible creature is compared to me: +1 = much bigger (danger?), −1 = much smaller (food?), 0 = same size or nobody.',
    range: [-1, 1],
  },
  {
    key: 'kin',
    label: 'Looks like family',
    glyph: 'Kn',
    group: 'social',
    desc: 'How similar the nearest visible creature looks to me (its colour). Relatives share colour genes, so this works as a kin detector.',
    range: [0, 1],
  },
  {
    key: 'energy',
    label: 'Energy (fullness)',
    glyph: 'En',
    group: 'body',
    desc: 'How full my energy tank is. Low energy = hungry. Lets the brain act differently when starving.',
    range: [0, 1],
  },
  {
    key: 'pain',
    label: 'Pain',
    glyph: 'Pn',
    group: 'body',
    desc: 'Spikes when I get bitten or eat something poisonous, then fades. Useful for running away.',
    range: [0, 1],
  },
  {
    key: 'wall',
    label: 'Wall ahead',
    glyph: 'Wl',
    group: 'body',
    desc: 'How close the wall of the dish is in the direction I am facing (0 = far, 1 = touching).',
    range: [0, 1],
  },
  {
    key: 'clock',
    label: 'Internal rhythm',
    glyph: '∿',
    group: 'body',
    desc: 'A built-in oscillator that swings between −1 and +1, like a heartbeat. Its speed is a gene. Rhythms help produce wiggly search patterns.',
    range: [-1, 1],
  },
];

export const OUTPUT_INFO: NeuronInfo[] = [
  {
    key: 'thrust',
    label: 'Swim',
    glyph: '↑',
    group: 'motor',
    desc: 'Positive = swim forward, negative = back up. Swimming burns energy.',
    range: [-1, 1],
  },
  {
    key: 'turn',
    label: 'Turn',
    glyph: '↻',
    group: 'motor',
    desc: 'Negative = turn left, positive = turn right.',
    range: [-1, 1],
  },
  {
    key: 'bite',
    label: 'Bite',
    glyph: '⚔',
    group: 'motor',
    desc: 'Above 0.3 the jaws snap at whatever creature is right in front. Hunting costs energy.',
    range: [-1, 1],
  },
];

export const BITE_THRESHOLD = 0.3;
