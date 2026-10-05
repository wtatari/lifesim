import { Brain } from './brain.ts';
import { G, hiddenCountFromGene, mutationProbability, type Genome } from './genome.ts';
import { T } from './tuning.ts';

/**
 * Traits are what the genes *build*: the physical creature.
 * They are computed once at birth from the genome ("gene expression").
 */
export interface Traits {
  adultRadius: number;
  muscle: number;
  hue: number;
  diet: number;
  plantEff: number;
  meatEff: number;
  visionRange: number;
  fov: number;
  maturityTime: number;
  fertility: number;
  babyFraction: number;
  mutationRate: number;
  plasticity: number;
  learningRate: number;
  clockFreq: number;
  spots: number;
  hiddenCount: number;
  lifespan: number;
}

export function expressTraits(g: Genome): Traits {
  const b = g.body;
  const diet = b[G.diet];
  return {
    adultRadius: 5 + 13 * b[G.size],
    muscle: T.forcePerMuscle * b[G.speed] + T.forceBase,
    hue: b[G.hue],
    diet,
    // Mildly convex trade-off: specialists digest their food better than generalists.
    plantEff: Math.pow(1 - diet, T.digestExponent),
    meatEff: Math.pow(diet, T.digestExponent),
    visionRange: 60 + 240 * b[G.vision],
    fov: ((60 + 260 * b[G.fov]) * Math.PI) / 180,
    maturityTime: 8 + 37 * b[G.maturity],
    fertility: 0.45 + 0.5 * b[G.fertility],
    babyFraction: 0.3 + 0.4 * b[G.investment],
    mutationRate: mutationProbability(b[G.mutation]),
    plasticity: b[G.plasticity],
    learningRate: b[G.plasticity] * T.learnMax,
    clockFreq: 0.15 + 1.6 * b[G.clock],
    spots: Math.round(b[G.pattern] * 6),
    hiddenCount: hiddenCountFromGene(b[G.brain]),
    // Bigger bodies and slower growth both mean a longer life.
    lifespan: (T.lifespanBase + T.lifespanSize * b[G.size]) * (0.75 + 0.5 * b[G.maturity]),
  };
}

export type DeathCause = 'starved' | 'eaten' | 'old age' | 'poisoned' | 'smitten' | 'meteor';

export interface SeenRef {
  x: number;
  y: number;
}

export class Creature {
  readonly id: number;
  readonly name: string;
  readonly genome: Genome;
  readonly traits: Traits;
  readonly brain: Brain;
  readonly generation: number;
  readonly parentId: number;
  readonly mateId: number;
  readonly birthTime: number;
  /** DNA of the mother and (if any) the father, to show which genes came from whom. */
  readonly parentGenomes: [Genome | null, Genome | null];
  speciesId: number;

  x: number;
  y: number;
  angle: number;
  vx = 0;
  vy = 0;
  prevX: number;
  prevY: number;
  prevAngle: number;

  energy: number;
  health: number;
  age = 0;
  /** 0 = newborn, 1 = fully grown (adult, can breed). */
  growth = 0;
  alive = true;
  deathCause: DeathCause | null = null;

  // Per-step signals
  pain = 0;
  biting = false;
  biteTargetId = 0;
  lastAttackerId = 0;
  eatFlash = 0;
  hurtFlash = 0;
  reproCooldown = 0;
  swimPhase = Math.random() * Math.PI * 2;
  /** Nearest plant, berry, meat and creature in view this step (for drawing what it looks at). */
  seen: (SeenRef | null)[] = [null, null, null, null];
  seenCreatureId = 0;

  // Life statistics
  plantsEaten = 0;
  berriesEaten = 0;
  toxicEaten = 0;
  meatEaten = 0;
  energyGained = 0;
  kills = 0;
  children = 0;
  distance = 0;
  /** Blessed by the player (fed by hand) at least once. */
  favored = false;

  constructor(opts: {
    id: number;
    name: string;
    genome: Genome;
    x: number;
    y: number;
    angle: number;
    generation: number;
    parentId: number;
    mateId: number;
    speciesId: number;
    birthTime: number;
    energyFraction?: number;
    growth?: number;
    parentGenomes?: [Genome | null, Genome | null];
  }) {
    this.id = opts.id;
    this.name = opts.name;
    this.genome = opts.genome;
    this.traits = expressTraits(opts.genome);
    this.brain = new Brain(opts.genome.brain, this.traits.hiddenCount, this.traits.learningRate);
    this.generation = opts.generation;
    this.parentId = opts.parentId;
    this.mateId = opts.mateId;
    this.speciesId = opts.speciesId;
    this.birthTime = opts.birthTime;
    this.parentGenomes = opts.parentGenomes ?? [null, null];
    this.x = this.prevX = opts.x;
    this.y = this.prevY = opts.y;
    this.angle = this.prevAngle = opts.angle;
    this.growth = opts.growth ?? 0;
    this.energy = this.maxEnergy * (opts.energyFraction ?? T.babyEnergyFill);
    this.health = this.maxHealth;
  }

  /** Current body radius: babies start small and grow into adults. */
  get radius(): number {
    const t = this.traits;
    return t.adultRadius * (t.babyFraction + (1 - t.babyFraction) * this.growth);
  }

  get mass(): number {
    const r = this.radius / T.massRef;
    return r * r;
  }

  get maxEnergy(): number {
    return T.energyPerMass * this.mass;
  }

  get maxHealth(): number {
    return T.healthPerSqrtMass * Math.sqrt(this.mass);
  }

  get isAdult(): boolean {
    return this.growth >= 1;
  }

  get speed(): number {
    return Math.hypot(this.vx, this.vy);
  }

  /** Muscle force available right now. */
  get force(): number {
    return this.traits.muscle * Math.pow(this.mass, T.forceMassExp);
  }

  get turnRate(): number {
    return T.turnRate * Math.sqrt(T.massRef / this.radius);
  }

  get ageFraction(): number {
    return this.age / this.traits.lifespan;
  }
}
