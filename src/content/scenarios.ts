import { G, mutate, randomGenome, seedForagerBrain } from '../sim/genome.ts';
import { World, type WorldConfig } from '../sim/world.ts';

export interface Scenario {
  id: string;
  title: string;
  tagline: string;
  description: string;
  /** What to watch for, shown when the world starts. */
  watch: string;
  config: Partial<WorldConfig>;
  setup?: (w: World) => void;
}

export const SCENARIOS: Scenario[] = [
  {
    id: 'ecosystem',
    title: 'Living ecosystem',
    tagline: 'Grazers, hunters and seasons',
    description:
      'Three species of plant-grazers and one species of hunters, each born with simple instincts. Natural selection takes it from there.',
    watch: 'Watch the hunters and grazers rise and fall in cycles, and new species branch off.',
    config: {
      startBrain: 'forager',
      founders: 4,
      hunterFounders: 1,
      hunterShare: 0.12,
      hunterSupport: 3,
      berryShare: 0.1,
      berryMode: 'good',
    },
  },
  {
    id: 'soup',
    title: 'Primordial soup',
    tagline: 'Random brains, from scratch',
    description:
      'Every creature starts with a brain wired completely at random. Most can barely find food. Speed up time and watch evolution invent steering.',
    watch: 'Open the Skill chart: foraging skill climbs as natural selection improves the brains.',
    config: {
      startBrain: 'random',
      founders: 4,
      hunterFounders: 0,
      startPopulation: 50,
      berryShare: 0.08,
    },
  },
  {
    id: 'predators',
    title: 'Predators & prey',
    tagline: 'An evolutionary arms race',
    description:
      'More hunters from the start. Prey that flee survive; hunters that chase well eat. Each side keeps pushing the other to evolve.',
    watch: 'The population chart swings like a pendulum: more prey → more hunters → fewer prey → fewer hunters.',
    config: {
      startBrain: 'forager',
      founders: 3,
      hunterFounders: 1,
      hunterShare: 0.2,
      hunterSupport: 3,
      startPopulation: 60,
      berryShare: 0.06,
    },
  },
  {
    id: 'poison',
    title: 'Poison berries',
    tagline: 'Learners vs. pure instinct',
    description:
      'Two species born with the same instincts: both love berries. One can learn from experience, the other cannot. Every minute the berries switch between tasty and poisonous.',
    watch: 'Compare the two species on the population chart. Inspect a learner to see its opinion of berries change.',
    config: {
      startPopulation: 0,
      berryShare: 0.35,
      berryMode: 'shifting',
      berryPeriod: 60,
      predation: false,
      seasonAmp: 0,
      lifeSupport: 0,
      hunterSupport: 0,
    },
    setup(w) {
      const base = randomGenome(w.rng, { hue: 0.3 });
      seedForagerBrain(base.brain, w.rng);
      base.body[G.diet] = 0.05;
      const make = (plasticity: number, hue: number) => {
        const g = mutate(base, w.rng, 0);
        g.body[G.plasticity] = plasticity;
        g.body[G.hue] = hue;
        return g;
      };
      const learner = make(0.85, 0.53);
      const instinct = make(0, 0.08);
      const spL = w.species.create(learner, 0, null, 0, w.rng, true);
      spL.genus = 'Baccivora';
      spL.epithet = 'docilis';
      const spI = w.species.create(instinct, 0, null, 0, w.rng, true);
      spI.genus = 'Baccivora';
      spI.epithet = 'rigida';
      for (let i = 0; i < 24; i++) {
        const p = w.randomPointInDish(0.9);
        w.addCreature(mutate(learner, w.rng, 0.4), p.x, p.y, w.rng.range(0, 6.28), { species: spL, generation: 0, growth: 1, energyFraction: 0.7 });
        const q = w.randomPointInDish(0.9);
        w.addCreature(mutate(instinct, w.rng, 0.4), q.x, q.y, w.rng.range(0, 6.28), { species: spI, generation: 0, growth: 1, energyFraction: 0.7 });
      }
    },
  },
];

export function getScenario(id: string): Scenario {
  return SCENARIOS.find((s) => s.id === id) ?? SCENARIOS[0];
}

export function createWorld(scenario: Scenario, overrides: Partial<WorldConfig> = {}): World {
  const seed = overrides.seed ?? Math.floor(Math.random() * 1e9);
  const w = new World({ ...scenario.config, ...overrides, seed });
  if (scenario.setup) {
    scenario.setup(w);
    w.species.recenter(w.creatures);
  }
  return w;
}
