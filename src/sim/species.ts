import { cloneGenome, G, geneticDistance, N_BODY, type Genome } from './genome.ts';
import { BRAIN_LEN } from './brainLayout.ts';
import { genusName, speciesEpithet } from './names.ts';
import { Rng } from './rng.ts';
import type { Creature } from './creature.ts';

/**
 * Species
 * =======
 * A species is a group of creatures whose DNA is similar. Every newborn is
 * compared with a "representative" genome of its parent's species. If it has
 * drifted too far, it founds a brand-new species (speciation!).
 *
 * New lineages only count as a species once they reach a few living members
 * at the same time ("established"), so one-off mutants don't flood the tree.
 */
export interface Species {
  id: number;
  genus: string;
  epithet: string;
  /** Display colour (hue 0..1), taken from the founder. */
  hue: number;
  parentId: number;
  bornAt: number;
  extinctAt: number | null;
  founderId: number;
  rep: Genome;
  population: number;
  peak: number;
  totalBorn: number;
  established: boolean;
  /** Depth in the tree of life (0 = primordial). */
  depth: number;
  /** Rolling trait averages for the UI. */
  avg: { size: number; speed: number; diet: number; vision: number; brain: number; plasticity: number };
}

export const ESTABLISH_POPULATION = 4;

export function speciesName(s: Pick<Species, 'genus' | 'epithet'>): string {
  return `${s.genus} ${s.epithet}`;
}

export class SpeciesRegistry {
  readonly list: Species[] = [];
  readonly byId = new Map<number, Species>();
  nextId = 1;
  threshold: number;
  /** Speciation / extinction notifications for the UI, drained by the world. */
  readonly pending: { type: 'speciation' | 'extinction'; species: Species }[] = [];

  constructor(threshold: number) {
    this.threshold = threshold;
  }

  get(id: number): Species | undefined {
    return this.byId.get(id);
  }

  create(genome: Genome, founderId: number, parent: Species | null, time: number, rng: Rng, established = false): Species {
    const s: Species = {
      id: this.nextId++,
      genus: parent && Math.abs(parent.rep.body[G.diet] - genome.body[G.diet]) < 0.3 ? parent.genus : genusName(rng),
      epithet: speciesEpithet(rng, genome, parent?.rep),
      hue: genome.body[G.hue],
      parentId: parent?.id ?? 0,
      bornAt: time,
      extinctAt: null,
      founderId,
      rep: cloneGenome(genome),
      population: 0,
      peak: 0,
      totalBorn: 0,
      established,
      depth: parent ? parent.depth + 1 : 0,
      avg: { size: 0, speed: 0, diet: 0, vision: 0, brain: 0, plasticity: 0 },
    };
    // Avoid duplicate names within the same genus.
    let n = 2;
    const base = s.epithet;
    while (this.list.some((o) => o.genus === s.genus && o.epithet === s.epithet)) {
      s.epithet = `${base} ${toRoman(n++)}`;
    }
    this.list.push(s);
    this.byId.set(s.id, s);
    return s;
  }

  /** Decide which species a newborn belongs to. */
  assign(genome: Genome, parentSpecies: Species, founderId: number, time: number, rng: Rng): Species {
    if (geneticDistance(genome, parentSpecies.rep) <= this.threshold) return parentSpecies;
    // Maybe it belongs to a young daughter species that split off recently.
    for (const s of this.list) {
      if (s.parentId === parentSpecies.id && s.extinctAt === null && geneticDistance(genome, s.rep) <= this.threshold) {
        return s;
      }
    }
    return this.create(genome, founderId, parentSpecies, time, rng);
  }

  onBirth(s: Species): void {
    s.population++;
    s.totalBorn++;
    if (s.population > s.peak) s.peak = s.population;
    if (!s.established && s.population >= ESTABLISH_POPULATION) {
      s.established = true;
      if (s.parentId !== 0) this.pending.push({ type: 'speciation', species: s });
    }
  }

  onDeath(s: Species, time: number): void {
    s.population--;
    if (s.population <= 0) {
      s.population = 0;
      if (!s.established) {
        // A failed mutant lineage: forget it ever existed.
        const i = this.list.indexOf(s);
        if (i >= 0) this.list.splice(i, 1);
        this.byId.delete(s.id);
        return;
      }
      s.extinctAt = time;
      this.pending.push({ type: 'extinction', species: s });
    }
  }

  /**
   * Re-centre each species on its current members so species track gradual
   * change; only lineages that diverge from the rest will split off.
   */
  recenter(creatures: readonly Creature[]): void {
    const groups = new Map<number, Creature[]>();
    for (const c of creatures) {
      let g = groups.get(c.speciesId);
      if (!g) groups.set(c.speciesId, (g = []));
      g.push(c);
    }
    const body = new Float32Array(N_BODY);
    const brain = new Float32Array(BRAIN_LEN);
    for (const [id, members] of groups) {
      const s = this.byId.get(id);
      if (!s) continue;
      const avg = s.avg;
      avg.size = avg.speed = avg.diet = avg.vision = avg.brain = avg.plasticity = 0;
      body.fill(0);
      brain.fill(0);
      let hx = 0;
      let hy = 0;
      for (const c of members) {
        const b = c.genome.body;
        for (let i = 0; i < N_BODY; i++) body[i] += b[i];
        for (let i = 0; i < BRAIN_LEN; i++) brain[i] += c.genome.brain[i];
        hx += Math.cos(b[G.hue] * Math.PI * 2);
        hy += Math.sin(b[G.hue] * Math.PI * 2);
        avg.size += b[G.size];
        avg.speed += b[G.speed];
        avg.diet += b[G.diet];
        avg.vision += b[G.vision];
        avg.brain += c.traits.hiddenCount;
        avg.plasticity += b[G.plasticity];
      }
      const n = members.length;
      for (let i = 0; i < N_BODY; i++) body[i] /= n;
      for (let i = 0; i < BRAIN_LEN; i++) brain[i] /= n;
      body[G.hue] = ((Math.atan2(hy, hx) / (Math.PI * 2)) % 1 + 1) % 1;
      avg.size /= n;
      avg.speed /= n;
      avg.diet /= n;
      avg.vision /= n;
      avg.brain /= n;
      avg.plasticity /= n;
      if (n >= 3) {
        const centroid: Genome = { body, brain };
        let best = members[0];
        let bestD = Infinity;
        for (const c of members) {
          const d = geneticDistance(c.genome, centroid);
          if (d < bestD) {
            bestD = d;
            best = c;
          }
        }
        s.rep = cloneGenome(best.genome);
      }
    }
  }

  living(): Species[] {
    return this.list.filter((s) => s.extinctAt === null && s.established);
  }
}

function toRoman(n: number): string {
  const map: [number, string][] = [
    [10, 'X'],
    [9, 'IX'],
    [5, 'V'],
    [4, 'IV'],
    [1, 'I'],
  ];
  let s = '';
  for (const [v, r] of map) {
    while (n >= v) {
      s += r;
      n -= v;
    }
  }
  return s;
}
