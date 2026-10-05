/**
 * Time series of the world's vital signs, used by the charts.
 * History is kept forever at decreasing resolution: once the buffer is full,
 * neighbouring samples are merged and the sampling interval doubles.
 */

export const TRAIT_KEYS = ['size', 'speed', 'diet', 'vision', 'fov', 'brain', 'plasticity', 'mutation', 'fertility', 'investment', 'maturity'] as const;
export type TraitKey = (typeof TRAIT_KEYS)[number];

export interface StatSample {
  t: number;
  pop: number;
  plants: number;
  berries: number;
  meat: number;
  herb: number;
  omni: number;
  carn: number;
  births: number;
  deaths: number;
  kills: number;
  maxGen: number;
  avgGen: number;
  /** Average energy eaten per creature per minute in this interval. */
  intake: number;
  /** Average learned change in brains (0 = nobody learned anything). */
  learned: number;
  /** Foraging skill benchmark: plants per minute in the standard test arena (NaN = not measured). */
  skill: number;
  /** Fraction of toxic berries among berries eaten (NaN when none were eaten). */
  toxicShare: number;
  traits: Record<TraitKey, number>;
  /** Population per established species. */
  species: Record<number, number>;
}

const MAX_SAMPLES = 480;

export class StatsHistory {
  samples: StatSample[] = [];
  interval: number;
  lastSampleAt = 0;

  constructor(interval = 2) {
    this.interval = interval;
  }

  push(s: StatSample): void {
    this.samples.push(s);
    this.lastSampleAt = s.t;
    if (this.samples.length > MAX_SAMPLES) this.compact();
  }

  private compact(): void {
    const out: StatSample[] = [];
    for (let i = 0; i + 1 < this.samples.length; i += 2) out.push(mergeSamples(this.samples[i], this.samples[i + 1]));
    if (this.samples.length % 2 === 1) out.push(this.samples[this.samples.length - 1]);
    this.samples = out;
    this.interval *= 2;
  }

  latest(): StatSample | undefined {
    return this.samples[this.samples.length - 1];
  }
}

function avg(a: number, b: number): number {
  if (Number.isNaN(a)) return b;
  if (Number.isNaN(b)) return a;
  return (a + b) / 2;
}

function mergeSamples(a: StatSample, b: StatSample): StatSample {
  const traits = {} as Record<TraitKey, number>;
  for (const k of TRAIT_KEYS) traits[k] = avg(a.traits[k], b.traits[k]);
  const species: Record<number, number> = {};
  for (const k in a.species) species[k] = a.species[k] / 2;
  for (const k in b.species) species[k] = (species[k] ?? 0) + b.species[k] / 2;
  return {
    t: b.t,
    pop: avg(a.pop, b.pop),
    plants: avg(a.plants, b.plants),
    berries: avg(a.berries, b.berries),
    meat: avg(a.meat, b.meat),
    herb: avg(a.herb, b.herb),
    omni: avg(a.omni, b.omni),
    carn: avg(a.carn, b.carn),
    births: a.births + b.births,
    deaths: a.deaths + b.deaths,
    kills: a.kills + b.kills,
    maxGen: Math.max(a.maxGen, b.maxGen),
    avgGen: avg(a.avgGen, b.avgGen),
    intake: avg(a.intake, b.intake),
    learned: avg(a.learned, b.learned),
    skill: avg(a.skill, b.skill),
    toxicShare: avg(a.toxicShare, b.toxicShare),
    traits,
    species,
  };
}
