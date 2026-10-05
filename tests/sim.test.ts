import { describe, expect, it } from 'vitest';
import { Rng } from '../src/sim/rng.ts';
import {
  crossover,
  decodeGenome,
  encodeGenome,
  fromDnaCode,
  G,
  geneticDistance,
  mutate,
  N_BODY,
  randomGenome,
  seedForagerBrain,
  toDnaCode,
} from '../src/sim/genome.ts';
import { Brain, b2Index, w3Index } from '../src/sim/brain.ts';
import { BRAIN_LEN, IN, N_IN, OUT } from '../src/sim/brainLayout.ts';
import { World, benchmarkGenome } from '../src/sim/world.ts';
import { deserializeWorld, serializeWorld } from '../src/sim/serialize.ts';
import { analyseInstincts } from '../src/sim/instincts.ts';
import { expressTraits } from '../src/sim/creature.ts';

const quiet = { benchmark: false } as const;

function run(w: World, steps: number) {
  for (let i = 0; i < steps; i++) {
    w.step();
    w.drainEvents();
  }
}

describe('Rng', () => {
  it('is deterministic for a seed and restorable from its state', () => {
    const a = new Rng('lab');
    const b = new Rng('lab');
    const seqA = Array.from({ length: 5 }, () => a.next());
    expect(Array.from({ length: 5 }, () => b.next())).toEqual(seqA);
    const state = a.getState();
    const next = a.next();
    a.setState(state);
    expect(a.next()).toBe(next);
  });

  it('produces values in range', () => {
    const r = new Rng(3);
    for (let i = 0; i < 1000; i++) {
      const v = r.next();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
      const k = r.int(2, 7);
      expect(k).toBeGreaterThanOrEqual(2);
      expect(k).toBeLessThan(7);
    }
  });
});

describe('Genome', () => {
  it('survives encoding as a DNA code', () => {
    const g = randomGenome(new Rng(1));
    const back = fromDnaCode(toDnaCode(g));
    expect(Array.from(back.body)).toEqual(Array.from(g.body));
    expect(Array.from(back.brain)).toEqual(Array.from(g.brain));
    expect(Array.from(decodeGenome(encodeGenome(g)).brain)).toEqual(Array.from(g.brain));
  });

  it('rejects garbage codes', () => {
    expect(() => fromDnaCode('hello')).toThrow();
  });

  it('keeps mutated genes inside their ranges', () => {
    const rng = new Rng(2);
    let g = randomGenome(rng);
    for (let i = 0; i < 200; i++) g = mutate(g, rng, 3);
    for (let i = 0; i < N_BODY; i++) {
      expect(g.body[i]).toBeGreaterThanOrEqual(0);
      expect(g.body[i]).toBeLessThanOrEqual(1);
    }
    for (let i = 0; i < BRAIN_LEN; i++) expect(Math.abs(g.brain[i])).toBeLessThanOrEqual(4);
  });

  it('does not mutate at all when the mutation scale is zero', () => {
    const rng = new Rng(4);
    const g = randomGenome(rng);
    expect(geneticDistance(g, mutate(g, rng, 0))).toBe(0);
  });

  it('builds children only from parental genes when crossing over', () => {
    const rng = new Rng(5);
    const a = randomGenome(rng);
    const b = randomGenome(rng);
    const c = crossover(a, b, rng);
    for (let i = 0; i < N_BODY; i++) expect([a.body[i], b.body[i]]).toContain(c.body[i]);
    for (let i = 0; i < BRAIN_LEN; i++) expect([a.brain[i], b.brain[i]]).toContain(c.brain[i]);
  });

  it('measures genetic distance symmetrically', () => {
    const rng = new Rng(6);
    const a = randomGenome(rng);
    const b = randomGenome(rng);
    expect(geneticDistance(a, a)).toBe(0);
    expect(geneticDistance(a, b)).toBeCloseTo(geneticDistance(b, a), 10);
    expect(geneticDistance(a, b)).toBeGreaterThan(0);
  });

  it('expresses body genes as traits', () => {
    const g = randomGenome(new Rng(7));
    g.body[G.size] = 1;
    g.body[G.diet] = 1;
    const t = expressTraits(g);
    expect(t.adultRadius).toBeCloseTo(18);
    expect(t.meatEff).toBeCloseTo(1);
    expect(t.plantEff).toBeCloseTo(0);
  });
});

describe('Brain', () => {
  it('computes tanh of the bias when every weight is zero', () => {
    const w = new Float32Array(BRAIN_LEN);
    w[b2Index(OUT.thrust)] = 0.5;
    const b = new Brain(w, 4, 0);
    b.input.fill(0.7);
    b.forward();
    expect(b.output[OUT.thrust]).toBeCloseTo(Math.tanh(0.5), 5);
    expect(b.output[OUT.turn]).toBe(0);
  });

  it('turns toward plants with a positive reflex weight', () => {
    const w = new Float32Array(BRAIN_LEN);
    w[w3Index(OUT.turn, IN.plantDir)] = 3;
    const b = new Brain(w, 2, 0);
    b.input[IN.plantDir] = 0.5;
    b.forward();
    expect(b.output[OUT.turn]).toBeGreaterThan(0.5);
  });

  it('learns to dislike poisonous food until the wiring flips', () => {
    const w = new Float32Array(BRAIN_LEN);
    w[w3Index(OUT.turn, IN.berryDir)] = 2;
    const b = new Brain(w, 2, 1.2);
    b.input[IN.berryDir] = 0.5;
    b.forward();
    expect(b.output[OUT.turn]).toBeGreaterThan(0);
    b.taste(1, -1.5);
    expect(b.liking[1]).toBeLessThan(0);
    b.forward();
    expect(b.output[OUT.turn]).toBeLessThan(0);
  });

  it('cannot learn without the learning gene', () => {
    const b = new Brain(new Float32Array(BRAIN_LEN), 2, 0);
    b.taste(1, -1.5);
    expect(b.liking[1]).toBe(1);
  });

  it('probes without disturbing the live state', () => {
    const rng = new Rng(8);
    const g = randomGenome(rng);
    const b = new Brain(g.brain, 6, 0);
    b.input[IN.plantNear] = 0.4;
    b.forward();
    const before = Array.from(b.output);
    b.probe(new Float32Array(N_IN).fill(1), new Float32Array(3));
    expect(Array.from(b.output)).toEqual(before);
  });

  it('describes a hand-wired forager as steering toward plants', () => {
    const rng = new Rng(9);
    const g = randomGenome(rng);
    seedForagerBrain(g.brain, rng, 0);
    const b = new Brain(g.brain, 6, 0);
    const texts = analyseInstincts(b, false).map((i) => i.text);
    expect(texts).toContain('Steers toward plants');
  });
});

describe('World', () => {
  it('runs deterministically from a seed', () => {
    const a = new World({ seed: 'same', ...quiet });
    const b = new World({ seed: 'same', ...quiet });
    run(a, 900);
    run(b, 900);
    expect(a.creatures.length).toBe(b.creatures.length);
    expect(a.creatures.map((c) => c.x)).toEqual(b.creatures.map((c) => c.x));
    expect(a.totals).toEqual(b.totals);
  });

  it('keeps every creature finite and inside the dish', () => {
    const w = new World({ seed: 'safety', hunterFounders: 1, startBrain: 'forager', ...quiet });
    run(w, 3000);
    const R = w.config.radius;
    for (const c of w.creatures) {
      expect(Number.isFinite(c.x) && Number.isFinite(c.y) && Number.isFinite(c.energy)).toBe(true);
      expect(Math.hypot(c.x, c.y)).toBeLessThanOrEqual(R + 0.01);
      expect(c.energy).toBeLessThanOrEqual(c.maxEnergy + 1e-6);
    }
  });

  it('keeps species head-counts in sync with the creatures', () => {
    const w = new World({ seed: 'census', startBrain: 'forager', hunterFounders: 1, ...quiet });
    run(w, 2400);
    const counts = new Map<number, number>();
    for (const c of w.creatures) counts.set(c.speciesId, (counts.get(c.speciesId) ?? 0) + 1);
    for (const s of w.species.list) {
      expect(s.population).toBe(counts.get(s.id) ?? 0);
      if (s.population > 0) expect(s.extinctAt).toBeNull();
    }
  });

  it('records births and deaths in the genealogy', () => {
    const w = new World({ seed: 'family', startBrain: 'forager', ...quiet });
    run(w, 1800);
    expect(w.totals.births).toBeGreaterThan(0);
    for (const c of w.creatures) {
      const r = w.records.get(c.id);
      expect(r).toBeDefined();
      expect(r!.died).toBeNull();
    }
  });

  it('keeps the population alive with life support', () => {
    const w = new World({ seed: 'support', lifeSupport: 8, plantRate: 0.5, startPopulation: 10, ...quiet });
    run(w, 3600);
    expect(w.creatures.length).toBeGreaterThanOrEqual(6);
  });

  it('wipes out creatures under a meteor', () => {
    const w = new World({ seed: 'impact', ...quiet });
    const killed = w.meteor(0, 0, 5000);
    expect(killed).toBeGreaterThan(0);
    expect(w.creatures.length).toBe(0);
  });
});

describe('Benchmark', () => {
  it('scores a hand-wired forager above random brains', () => {
    const rng = new Rng(10);
    const forager = randomGenome(rng);
    seedForagerBrain(forager.brain, rng);
    let random = 0;
    for (let i = 0; i < 5; i++) random += benchmarkGenome(randomGenome(rng));
    expect(benchmarkGenome(forager)).toBeGreaterThan(random / 5 + 5);
  });
});

describe('Saving', () => {
  it('restores every creature, plant and species', () => {
    const w = new World({ seed: 'save', startBrain: 'forager', hunterFounders: 1, ...quiet });
    run(w, 1500);
    const copy = deserializeWorld(JSON.parse(JSON.stringify(serializeWorld(w, { name: 'test', scenarioId: 'ecosystem' }))));
    expect(copy.time).toBe(w.time);
    expect(copy.creatures.map((c) => [c.id, c.x, c.y, c.energy])).toEqual(w.creatures.map((c) => [c.id, c.x, c.y, c.energy]));
    expect(copy.plants.length).toBe(w.plants.length);
    expect(copy.species.list.map((s) => [s.id, s.population])).toEqual(w.species.list.map((s) => [s.id, s.population]));
    expect(copy.records.size).toBe(w.records.size);
  });

  it('keeps running sensibly after loading', () => {
    const w = new World({ seed: 'save2', startBrain: 'forager', ...quiet });
    run(w, 1200);
    const copy = deserializeWorld(JSON.parse(JSON.stringify(serializeWorld(w, { name: 'test', scenarioId: 'ecosystem' }))));
    run(w, 600);
    run(copy, 600);
    expect(Math.abs(copy.creatures.length - w.creatures.length)).toBeLessThanOrEqual(Math.max(8, w.creatures.length * 0.25));
  });
});
