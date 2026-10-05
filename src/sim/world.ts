import { BITE_THRESHOLD, H_MAX, IN, N_IN, N_OUT, OUT, W1_OFFSET, W3_OFFSET } from './brainLayout.ts';
import { Creature, type DeathCause } from './creature.ts';
import {
  cloneGenome,
  crossover,
  G,
  geneticDistance,
  hunterBody,
  mutate,
  randomGenome,
  seedForagerBrain,
  seedHunterBrain,
  type Genome,
} from './genome.ts';
import { creatureName } from './names.ts';
import { Rng } from './rng.ts';
import { Grid } from './spatial.ts';
import { SpeciesRegistry, type Species } from './species.ts';
import { StatsHistory, TRAIT_KEYS, type StatSample, type TraitKey } from './stats.ts';
import { T } from './tuning.ts';

export type BerryMode = 'good' | 'toxic' | 'shifting';

export interface WorldConfig {
  seed: number | string;
  /** Radius of the petri dish in μm. */
  radius: number;
  startPopulation: number;
  /** Number of ancestral species the world starts with. */
  founders: number;
  /** 'random' = primordial soup, 'forager' = hand-wired starter brains. */
  startBrain: 'random' | 'forager';
  /** Diet of the founders (0 = plants … 1 = meat); null = random low values. */
  founderDiet: number | null;
  /** How many of the founding species are hunters with basic hunting instincts. */
  hunterFounders: number;
  /** Share of the starting population that belongs to hunter species. */
  hunterShare: number;
  /** New plants per second (before seasons). */
  plantRate: number;
  maxPlants: number;
  /** Fraction of plants that grow in fertile patches (the rest anywhere). */
  hotspotShare: number;
  /** Fraction of new food that is berries. */
  berryShare: number;
  berryMode: BerryMode;
  /** Seconds between berry toxicity flips in 'shifting' mode. */
  berryPeriod: number;
  /** 0 = no seasons, 1 = harsh winters. */
  seasonAmp: number;
  seasonLength: number;
  /** Multiplies every creature's mutation rate. 0 freezes evolution. */
  mutationScale: number;
  predation: boolean;
  /** Mix DNA with a nearby mate when breeding. */
  sexual: boolean;
  /** Experiment: write learned brain changes into the child's DNA. */
  lamarckian: boolean;
  reproduction: boolean;
  /** Keep at least this many creatures alive (0 = let extinction happen). */
  lifeSupport: number;
  /** Keep at least this many meat-eaters alive (0 = predators may go extinct). */
  hunterSupport: number;
  maxPopulation: number;
  speciesThreshold: number;
  recordStats: boolean;
  /** Run the foraging-skill benchmark periodically. */
  benchmark: boolean;
}

export const DEFAULT_CONFIG: WorldConfig = {
  seed: 1,
  radius: 800,
  startPopulation: 50,
  founders: 4,
  startBrain: 'random',
  founderDiet: null,
  hunterFounders: 0,
  hunterShare: 0.15,
  plantRate: 14,
  maxPlants: 700,
  hotspotShare: 0.45,
  berryShare: 0.1,
  berryMode: 'good',
  berryPeriod: 120,
  seasonAmp: 0.3,
  seasonLength: 300,
  mutationScale: 1,
  predation: true,
  sexual: true,
  lamarckian: false,
  reproduction: true,
  lifeSupport: 10,
  hunterSupport: 0,
  maxPopulation: 300,
  speciesThreshold: 0.11,
  recordStats: true,
  benchmark: true,
};

export interface Plant {
  id: number;
  x: number;
  y: number;
  r: number;
  energy: number;
  maxEnergy: number;
  /** 0 = green plant, 1 = violet berry. */
  kind: 0 | 1;
  age: number;
  maxAge: number;
  alive: boolean;
}

export interface Meat {
  id: number;
  x: number;
  y: number;
  r: number;
  energy: number;
  hue: number;
  alive: boolean;
}

export interface Hotspot {
  x: number;
  y: number;
  r: number;
  vx: number;
  vy: number;
  kind: 0 | 1;
  strength: number;
}

/** What we remember about a creature after it is gone (family trees). */
export interface LifeRecord {
  id: number;
  name: string;
  parentId: number;
  mateId: number;
  speciesId: number;
  generation: number;
  born: number;
  died: number | null;
  cause: DeathCause | null;
  children: number;
  hue: number;
  radius: number;
  diet: number;
  plantsEaten: number;
  meatEaten: number;
  kills: number;
}

export type WorldEvent =
  | { type: 'birth'; id: number; x: number; y: number; hue: number; sexual: boolean }
  | { type: 'death'; id: number; x: number; y: number; hue: number; cause: DeathCause }
  | { type: 'kill'; killerId: number; victimId: number; x: number; y: number }
  | { type: 'speciation'; speciesId: number; parentSpeciesId: number }
  | { type: 'extinction'; speciesId: number }
  | { type: 'toxicFlip'; toxic: boolean }
  | { type: 'season'; season: SeasonName }
  | { type: 'lifeSupport'; count: number; id: number; hunter: boolean }
  | { type: 'meteor'; x: number; y: number; radius: number; killed: number };

export type SeasonName = 'spring' | 'summer' | 'autumn' | 'winter';

export interface BankEntry {
  genome: Genome;
  speciesId: number;
  generation: number;
  score: number;
  hunter: boolean;
}

type DamageSource = 'bite' | 'toxin' | 'starve' | 'age' | null;

const TAU = Math.PI * 2;
const CELL = 80;

export class World {
  readonly config: WorldConfig;
  readonly rng: Rng;
  time = 0;
  tick = 0;
  nextId = 1;
  creatures: Creature[] = [];
  plants: Plant[] = [];
  meats: Meat[] = [];
  hotspots: Hotspot[] = [];
  readonly species: SpeciesRegistry;
  readonly records = new Map<number, LifeRecord>();
  readonly stats = new StatsHistory(2);
  events: WorldEvent[] = [];
  recordEvents = true;
  berriesToxic = false;
  /** Seconds of reduced plant growth left after a meteor. */
  impactWinter = 0;
  geneBank: BankEntry[] = [];
  /** Most recent common ancestor (maternal line) of everyone alive. */
  mrca: { id: number; generation: number; born: number } | null = null;
  lastSkill = NaN;
  readonly totals = {
    births: 0,
    deaths: 0,
    kills: 0,
    plantsEaten: 0,
    berriesEaten: 0,
    toxicEaten: 0,
    meatEaten: 0,
    speciations: 0,
    extinctions: 0,
    lifeSupport: 0,
    maxGeneration: 0,
  };

  readonly plantGrid: Grid<Plant>;
  readonly meatGrid: Grid<Meat>;
  readonly creatureGrid: Grid<Creature>;
  private readonly byId = new Map<number, Creature>();
  private readonly tmpPlants: Plant[] = [];
  private readonly tmpMeat: Meat[] = [];
  private readonly tmpCreatures: Creature[] = [];
  private newborns: Creature[] = [];
  private plantAcc = 0;
  private anyDeaths = false;
  private deadPlants = false;
  private lastSeason: SeasonName;
  private damageSource = new Map<number, DamageSource>();
  private interval = { births: 0, deaths: 0, kills: 0, intake: 0, berries: 0, toxic: 0, start: 0 };
  private timers = { recenter: 0, prune: 0, bankDecay: 0 };
  private probe: SkillProbe | null = null;
  private skillResults: number[] = [];

  constructor(config: Partial<WorldConfig> = {}, opts: { empty?: boolean } = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.rng = new Rng(this.config.seed);
    this.species = new SpeciesRegistry(this.config.speciesThreshold);
    const R = this.config.radius;
    this.plantGrid = new Grid<Plant>(-R, -R, 2 * R, 2 * R, CELL);
    this.meatGrid = new Grid<Meat>(-R, -R, 2 * R, 2 * R, CELL);
    this.creatureGrid = new Grid<Creature>(-R, -R, 2 * R, 2 * R, CELL);
    this.lastSeason = this.season().name;
    this.berriesToxic = this.computeToxic();
    if (!opts.empty) {
      this.initHotspots();
      this.seedPlants(0.6);
      this.populate();
      this.species.recenter(this.creatures);
    }
  }

  // ---------------------------------------------------------------------------
  // Setup
  // ---------------------------------------------------------------------------

  initHotspots(): void {
    const R = this.config.radius;
    const rng = this.rng;
    this.hotspots = [];
    const area = (R / 1100) ** 2;
    const nPlant = Math.max(2, Math.round(4 * area));
    const nBerry = Math.max(1, Math.round(2 * area));
    for (let i = 0; i < nPlant + nBerry; i++) {
      const a = rng.range(0, TAU);
      const d = Math.sqrt(rng.next()) * R * 0.7;
      const speed = rng.range(3, 9);
      const va = rng.range(0, TAU);
      this.hotspots.push({
        x: Math.cos(a) * d,
        y: Math.sin(a) * d,
        r: R * rng.range(0.12, 0.2),
        vx: Math.cos(va) * speed,
        vy: Math.sin(va) * speed,
        kind: i < nPlant ? 0 : 1,
        strength: rng.range(0.6, 1.4),
      });
    }
  }

  seedPlants(fraction: number): void {
    const n = Math.floor(this.config.maxPlants * fraction);
    for (let i = 0; i < n; i++) {
      const p = this.spawnPlant();
      if (p) {
        p.energy = p.maxEnergy * this.rng.range(0.5, 1);
        p.age = this.rng.range(0, p.maxAge * 0.7);
      }
    }
  }

  populate(): void {
    const cfg = this.config;
    const rng = this.rng;
    if (cfg.startPopulation <= 0) return;
    const nf = Math.max(1, cfg.founders);
    const nh = Math.min(nf, Math.max(0, cfg.hunterFounders));
    const ng = nf - nh;
    const hunterPop = nh ? Math.round(cfg.startPopulation * cfg.hunterShare) : 0;
    const grazerPop = cfg.startPopulation - hunterPop;
    for (let f = 0; f < nf; f++) {
      const hunter = f >= ng;
      const hue = hunter
        ? (0.97 + rng.range(-0.03, 0.03) + (f - ng) * 0.08) % 1
        : (0.18 + (f / Math.max(1, ng)) * 0.62 + rng.range(-0.04, 0.04)) % 1;
      const base = this.founderGenome(hunter, hue);
      const sp = this.species.create(base, 0, null, this.time, rng, true);
      const n = hunter ? Math.ceil(hunterPop / nh) : Math.ceil(grazerPop / Math.max(1, ng));
      for (let i = 0; i < n; i++) {
        const g = mutate(base, rng, 0.6);
        const pos = this.randomPointInDish(0.9);
        this.addCreature(g, pos.x, pos.y, rng.range(0, TAU), {
          species: sp,
          generation: 0,
          growth: rng.range(0.6, 1),
          energyFraction: rng.range(0.55, 0.85),
        });
      }
    }
  }

  /** A genome for a founding species (or a life-support newcomer). */
  founderGenome(hunter: boolean, hue?: number): Genome {
    const cfg = this.config;
    const rng = this.rng;
    if (hunter) {
      const g = randomGenome(rng, { hue });
      hunterBody(g.body, rng);
      seedHunterBrain(g.brain, rng);
      return g;
    }
    const g = randomGenome(rng, { hue, diet: cfg.founderDiet ?? rng.range(0, 0.2) });
    if (cfg.startBrain === 'forager') seedForagerBrain(g.brain, rng);
    return g;
  }

  randomPointInDish(fraction = 1): { x: number; y: number } {
    const a = this.rng.range(0, TAU);
    const d = Math.sqrt(this.rng.next()) * this.config.radius * fraction;
    return { x: Math.cos(a) * d, y: Math.sin(a) * d };
  }

  // ---------------------------------------------------------------------------
  // Creatures
  // ---------------------------------------------------------------------------

  /** Creates a creature and registers it immediately. */
  addCreature(
    genome: Genome,
    x: number,
    y: number,
    angle: number,
    opts: {
      species: Species;
      generation: number;
      parentId?: number;
      mateId?: number;
      growth?: number;
      energyFraction?: number;
      energy?: number;
      parentGenomes?: [Genome | null, Genome | null];
    },
  ): Creature {
    const c = this.makeCreature(genome, x, y, angle, opts);
    this.register(c);
    return c;
  }

  private makeCreature(
    genome: Genome,
    x: number,
    y: number,
    angle: number,
    opts: {
      species: Species;
      generation: number;
      parentId?: number;
      mateId?: number;
      growth?: number;
      energyFraction?: number;
      energy?: number;
      parentGenomes?: [Genome | null, Genome | null];
    },
  ): Creature {
    const c = new Creature({
      id: this.nextId++,
      name: creatureName(this.rng),
      genome,
      x,
      y,
      angle,
      generation: opts.generation,
      parentId: opts.parentId ?? 0,
      mateId: opts.mateId ?? 0,
      speciesId: opts.species.id,
      birthTime: this.time,
      growth: opts.growth ?? 0,
      energyFraction: opts.energyFraction,
      parentGenomes: opts.parentGenomes,
    });
    if (opts.energy !== undefined) c.energy = Math.min(c.maxEnergy, opts.energy);
    return c;
  }

  private register(c: Creature): void {
    this.creatures.push(c);
    this.byId.set(c.id, c);
    const sp = this.species.get(c.speciesId);
    if (sp) {
      if (sp.extinctAt !== null) sp.extinctAt = null;
      this.species.onBirth(sp);
    }
    this.records.set(c.id, {
      id: c.id,
      name: c.name,
      parentId: c.parentId,
      mateId: c.mateId,
      speciesId: c.speciesId,
      generation: c.generation,
      born: c.birthTime,
      died: null,
      cause: null,
      children: 0,
      hue: c.traits.hue,
      radius: c.traits.adultRadius,
      diet: c.traits.diet,
      plantsEaten: 0,
      meatEaten: 0,
      kills: 0,
    });
    if (c.generation > this.totals.maxGeneration) this.totals.maxGeneration = c.generation;
  }

  getCreature(id: number): Creature | undefined {
    return this.byId.get(id);
  }

  /** Puts a loaded creature back without counting it as a birth. */
  restoreCreature(c: Creature): void {
    this.creatures.push(c);
    this.byId.set(c.id, c);
  }

  /** Living descendants of a creature (through both parents, as far as records reach). */
  livingDescendants(id: number): number {
    const kids = new Map<number, number[]>();
    for (const r of this.records.values()) {
      if (r.parentId) {
        let a = kids.get(r.parentId);
        if (!a) kids.set(r.parentId, (a = []));
        a.push(r.id);
      }
      if (r.mateId) {
        let a = kids.get(r.mateId);
        if (!a) kids.set(r.mateId, (a = []));
        a.push(r.id);
      }
    }
    const seen = new Set<number>();
    const stack = [...(kids.get(id) ?? [])];
    let alive = 0;
    while (stack.length) {
      const k = stack.pop()!;
      if (seen.has(k)) continue;
      seen.add(k);
      if (this.byId.has(k)) alive++;
      const more = kids.get(k);
      if (more) for (const m of more) stack.push(m);
    }
    return alive;
  }

  /** Finds the creature under a point (with some tolerance for clicking). */
  creatureAt(x: number, y: number, tolerance = 6): Creature | null {
    let best: Creature | null = null;
    let bestD = Infinity;
    for (const c of this.creatures) {
      const d = Math.hypot(c.x - x, c.y - y) - c.radius;
      if (d < tolerance && d < bestD) {
        bestD = d;
        best = c;
      }
    }
    return best;
  }

  // ---------------------------------------------------------------------------
  // Main loop
  // ---------------------------------------------------------------------------

  step(): void {
    const dt = T.dt;
    this.time += dt;
    this.tick++;

    this.updateEnvironment(dt);
    this.spawnPlants(dt);
    this.updatePlants(dt);
    this.updateMeat(dt);

    const grid = this.creatureGrid;
    grid.clear();
    for (const c of this.creatures) grid.insert(c);

    for (const c of this.creatures) {
      if (!c.alive) continue;
      c.prevX = c.x;
      c.prevY = c.y;
      c.prevAngle = c.angle;
      this.sense(c);
      c.brain.forward();
      this.act(c, dt);
    }

    this.resolveCollisions();
    if (this.anyDeaths) this.processDeaths();
    if (this.newborns.length) this.processBirths();
    if (this.deadPlants) this.compactPlants();
    this.lifeSupport();
    this.bookkeeping(dt);
  }

  // ---------------------------------------------------------------------------
  // Environment
  // ---------------------------------------------------------------------------

  season(): { name: SeasonName; factor: number; phase: number } {
    const phase = ((this.time % this.config.seasonLength) + this.config.seasonLength) % this.config.seasonLength / this.config.seasonLength;
    const s = Math.sin(phase * TAU);
    const factor = 1 + this.config.seasonAmp * s;
    let name: SeasonName;
    if (s > 0.5) name = 'summer';
    else if (s < -0.5) name = 'winter';
    else name = Math.cos(phase * TAU) > 0 ? 'spring' : 'autumn';
    return { name, factor, phase };
  }

  private computeToxic(): boolean {
    const m = this.config.berryMode;
    if (m === 'good') return false;
    if (m === 'toxic') return true;
    return Math.floor(this.time / this.config.berryPeriod) % 2 === 1;
  }

  private updateEnvironment(dt: number): void {
    const toxic = this.computeToxic();
    if (toxic !== this.berriesToxic) {
      this.berriesToxic = toxic;
      this.emit({ type: 'toxicFlip', toxic });
    }
    const season = this.season().name;
    if (season !== this.lastSeason) {
      this.lastSeason = season;
      if (this.config.seasonAmp > 0.05) this.emit({ type: 'season', season });
    }
    if (this.impactWinter > 0) this.impactWinter = Math.max(0, this.impactWinter - dt);

    const R = this.config.radius;
    const rng = this.rng;
    for (const h of this.hotspots) {
      h.vx += rng.gauss(0, 3) * dt;
      h.vy += rng.gauss(0, 3) * dt;
      const sp = Math.hypot(h.vx, h.vy);
      if (sp > 10) {
        h.vx *= 10 / sp;
        h.vy *= 10 / sp;
      }
      h.x += h.vx * dt;
      h.y += h.vy * dt;
      const d = Math.hypot(h.x, h.y);
      if (d > R * 0.78) {
        const nx = h.x / d;
        const ny = h.y / d;
        const dot = h.vx * nx + h.vy * ny;
        if (dot > 0) {
          h.vx -= 2 * dot * nx;
          h.vy -= 2 * dot * ny;
        }
      }
    }
  }

  private spawnPlants(dt: number): void {
    const cfg = this.config;
    let rate = cfg.plantRate * this.season().factor;
    if (this.impactWinter > 0) rate *= 0.25;
    this.plantAcc += rate * dt;
    while (this.plantAcc >= 1) {
      this.plantAcc -= 1;
      if (this.plants.length < cfg.maxPlants) this.spawnPlant();
    }
  }

  spawnPlant(kind?: 0 | 1, at?: { x: number; y: number }, spread = 0): Plant | null {
    const rng = this.rng;
    const cfg = this.config;
    const R = cfg.radius;
    const k: 0 | 1 = kind ?? (rng.next() < cfg.berryShare ? 1 : 0);
    let x = 0;
    let y = 0;
    let placed = false;
    if (at) {
      for (let tries = 0; tries < 6 && !placed; tries++) {
        x = at.x + rng.gauss(0, spread);
        y = at.y + rng.gauss(0, spread);
        placed = x * x + y * y < (R - 6) * (R - 6);
      }
      if (!placed) return null;
    } else {
      const useSpot = k === 1 || rng.next() < cfg.hotspotShare;
      if (useSpot) {
        const spots = this.hotspots.filter((h) => h.kind === k);
        if (spots.length) {
          let total = 0;
          for (const h of spots) total += h.strength;
          let pickV = rng.next() * total;
          let h = spots[0];
          for (const s of spots) {
            pickV -= s.strength;
            if (pickV <= 0) {
              h = s;
              break;
            }
          }
          for (let tries = 0; tries < 4 && !placed; tries++) {
            x = h.x + rng.gauss(0, h.r * 0.55);
            y = h.y + rng.gauss(0, h.r * 0.55);
            placed = x * x + y * y < (R - 6) * (R - 6);
          }
        }
      }
      if (!placed) {
        const p = this.randomPointInDish(0.985);
        x = p.x;
        y = p.y;
      }
    }
    const maxEnergy = k === 1 ? T.berryEnergy : T.plantEnergy;
    const p: Plant = {
      id: this.nextId++,
      x,
      y,
      r: (k === 1 ? T.berryRadius : T.plantRadius) * 0.55,
      energy: maxEnergy * 0.5,
      maxEnergy,
      kind: k,
      age: 0,
      maxAge: rng.range(100, 200),
      alive: true,
    };
    this.plants.push(p);
    this.plantGrid.insert(p);
    return p;
  }

  private updatePlants(dt: number): void {
    const grow = (0.65 * dt) / T.plantGrowTime;
    for (const p of this.plants) {
      p.age += dt;
      if (p.energy < p.maxEnergy) {
        p.energy = Math.min(p.maxEnergy, p.energy + p.maxEnergy * grow);
        const base = p.kind === 1 ? T.berryRadius : T.plantRadius;
        p.r = base * (0.45 + 0.55 * (p.energy / p.maxEnergy));
      }
      if (p.age > p.maxAge && p.alive) {
        p.alive = false;
        this.plantGrid.remove(p);
        this.deadPlants = true;
      }
    }
  }

  private compactPlants(): void {
    let w = 0;
    const arr = this.plants;
    for (let i = 0; i < arr.length; i++) if (arr[i].alive) arr[w++] = arr[i];
    arr.length = w;
    this.deadPlants = false;
  }

  private updateMeat(dt: number): void {
    const keep = 1 - T.meatDecay * dt;
    let w = 0;
    const arr = this.meats;
    for (let i = 0; i < arr.length; i++) {
      const m = arr[i];
      if (m.alive) {
        m.energy *= keep;
        m.r = 2.5 + Math.sqrt(m.energy) * 0.55;
        if (m.energy < 0.6) {
          m.alive = false;
          this.meatGrid.remove(m);
        }
      }
      if (m.alive) arr[w++] = m;
    }
    arr.length = w;
  }

  addMeat(x: number, y: number, energy: number, hue: number): void {
    if (energy < 1) return;
    const R = this.config.radius - 4;
    const d = Math.hypot(x, y);
    if (d > R) {
      x *= R / d;
      y *= R / d;
    }
    const m: Meat = { id: this.nextId++, x, y, r: 2.5 + Math.sqrt(energy) * 0.55, energy, hue, alive: true };
    this.meats.push(m);
    this.meatGrid.insert(m);
  }

  // ---------------------------------------------------------------------------
  // Senses
  // ---------------------------------------------------------------------------

  private sense(c: Creature): void {
    const inp = c.brain.input;
    const t = c.traits;
    const range = t.visionRange;
    const range2 = range * range;
    const halfFov = t.fov * 0.5;
    const cosHalf = Math.cos(halfFov);
    const ca = Math.cos(c.angle);
    const sa = Math.sin(c.angle);
    const cx = c.x;
    const cy = c.y;
    const seen = c.seen;

    // For each kind of thing, the eyes report the NEAREST one inside the
    // field of view: its direction (−1 far left … +1 far right) and its
    // nearness (0 = nothing / edge of sight … 1 = touching).
    let plantD2 = range2;
    let plant: Plant | null = null;
    let berryD2 = range2;
    let berry: Plant | null = null;
    const plants = this.plantGrid.query(cx, cy, range, this.tmpPlants);
    for (let k = 0; k < plants.length; k++) {
      const p = plants[k];
      const dx = p.x - cx;
      const dy = p.y - cy;
      const d2 = dx * dx + dy * dy;
      if (p.kind === 0 ? d2 >= plantD2 : d2 >= berryD2) continue;
      if (dx * ca + dy * sa < cosHalf * Math.sqrt(d2)) continue;
      if (p.kind === 0) {
        plantD2 = d2;
        plant = p;
      } else {
        berryD2 = d2;
        berry = p;
      }
    }

    let meatD2 = range2;
    let meat: Meat | null = null;
    const meats = this.meatGrid.query(cx, cy, range, this.tmpMeat);
    for (let k = 0; k < meats.length; k++) {
      const m = meats[k];
      const dx = m.x - cx;
      const dy = m.y - cy;
      const d2 = dx * dx + dy * dy;
      if (d2 >= meatD2) continue;
      if (dx * ca + dy * sa < cosHalf * Math.sqrt(d2)) continue;
      meatD2 = d2;
      meat = m;
    }

    let otherD2 = range2;
    let other: Creature | null = null;
    const others = this.creatureGrid.query(cx, cy, range, this.tmpCreatures);
    for (let k = 0; k < others.length; k++) {
      const o = others[k];
      if (o === c || !o.alive) continue;
      const dx = o.x - cx;
      const dy = o.y - cy;
      const d2 = dx * dx + dy * dy;
      if (d2 >= otherD2) continue;
      if (dx * ca + dy * sa < cosHalf * Math.sqrt(d2)) continue;
      otherD2 = d2;
      other = o;
    }

    seen[0] = plant;
    seen[1] = berry;
    seen[2] = meat;
    seen[3] = other;
    this.look(inp, IN.plantDir, plant, cx, cy, ca, sa, range, halfFov, 0);
    this.look(inp, IN.berryDir, berry, cx, cy, ca, sa, range, halfFov, 0);
    this.look(inp, IN.meatDir, meat, cx, cy, ca, sa, range, halfFov, 0);
    this.look(inp, IN.creatureDir, other, cx, cy, ca, sa, range, halfFov, other ? other.radius : 0);

    if (other) {
      const rel = (other.radius - c.radius) / c.radius;
      inp[IN.threat] = rel > 1 ? 1 : rel < -1 ? -1 : rel;
      let hd = Math.abs(other.traits.hue - t.hue);
      if (hd > 0.5) hd = 1 - hd;
      const kin = 1 - hd / 0.1;
      inp[IN.kin] = kin > 0 ? kin : 0;
      c.seenCreatureId = other.id;
    } else {
      inp[IN.threat] = 0;
      inp[IN.kin] = 0;
      c.seenCreatureId = 0;
    }
    const e = c.energy / c.maxEnergy;
    inp[IN.energy] = e > 1 ? 1 : e;
    inp[IN.pain] = c.pain > 1 ? 1 : c.pain;

    // Distance to the dish wall straight ahead.
    const R = this.config.radius;
    const pf = cx * ca + cy * sa;
    const disc = pf * pf - (cx * cx + cy * cy - R * R);
    const tWall = -pf + Math.sqrt(disc > 0 ? disc : 0);
    const w = 1 - tWall / range;
    inp[IN.wall] = w > 0 ? w : 0;
    inp[IN.clock] = Math.sin(TAU * t.clockFreq * c.age);
  }

  /** Writes the direction & nearness signals for one seen object (or zeros). */
  private look(
    inp: Float32Array,
    slot: number,
    obj: { x: number; y: number } | null,
    cx: number,
    cy: number,
    ca: number,
    sa: number,
    range: number,
    halfFov: number,
    objRadius: number,
  ): void {
    if (!obj) {
      inp[slot] = 0;
      inp[slot + 1] = 0;
      return;
    }
    const dx = obj.x - cx;
    const dy = obj.y - cy;
    const d = Math.sqrt(dx * dx + dy * dy) + 1e-6;
    const fwd = (dx * ca + dy * sa) / d;
    const side = (dy * ca - dx * sa) / d;
    let a = Math.atan2(side, fwd) / halfFov;
    if (a > 1) a = 1;
    else if (a < -1) a = -1;
    let close = 1 - Math.max(0, d - objRadius) / range;
    if (close < 0) close = 0;
    inp[slot] = a;
    inp[slot + 1] = close;
  }

  // ---------------------------------------------------------------------------
  // Actions & metabolism
  // ---------------------------------------------------------------------------

  private act(c: Creature, dt: number): void {
    const t = c.traits;
    const out = c.brain.output;
    let thrust = out[OUT.thrust];
    if (thrust < 0) thrust *= T.backwardFactor;
    const turn = out[OUT.turn];
    c.biting = this.config.predation && out[OUT.bite] > BITE_THRESHOLD;

    c.angle += turn * c.turnRate * dt;
    if (c.angle > Math.PI) c.angle -= TAU;
    else if (c.angle < -Math.PI) c.angle += TAU;

    const mass = c.mass;
    const force = c.force;
    const acc = (thrust * force) / mass;
    c.vx += Math.cos(c.angle) * acc * dt;
    c.vy += Math.sin(c.angle) * acc * dt;
    const drag = Math.exp(-T.drag * dt);
    c.vx *= drag;
    c.vy *= drag;
    c.x += c.vx * dt;
    c.y += c.vy * dt;
    const sp = Math.hypot(c.vx, c.vy);
    c.distance += sp * dt;
    c.swimPhase += (0.25 + Math.abs(thrust) * 1.2) * dt * 12;

    // Energy bill for this step.
    const m075 = Math.pow(mass, 0.75);
    let cost =
      T.baseMetabolism * m075 +
      T.moveCost * Math.abs(thrust) * force +
      T.brainCost * t.hiddenCount +
      T.visionCost * t.visionRange * (0.5 + t.fov / TAU) +
      T.plasticityCost * t.plasticity;
    if (c.biting) cost += T.biteCost * m075;
    c.energy -= cost * dt;

    this.eat(c, dt);
    if (c.biting) this.bite(c, dt);
    else c.biteTargetId = 0;

    // Health: starvation, healing and old age.
    if (c.energy <= 0) {
      c.energy = 0;
      c.health -= T.starveDamage * dt;
      this.damageSource.set(c.id, 'starve');
    } else if (c.health < c.maxHealth) {
      const heal = Math.min(T.regen * Math.sqrt(mass) * dt, c.maxHealth - c.health);
      c.health += heal;
      c.energy -= heal * T.regenCost;
    }
    if (c.age > t.lifespan) {
      c.health -= T.oldAgeDamage * Math.sqrt(mass) * dt * (1 + (c.age - t.lifespan) / 15);
      this.damageSource.set(c.id, 'age');
    }

    // Growing up: faster when well fed, and new body mass costs energy.
    if (c.growth < 1) {
      const fed = c.energy > 0.3 * c.maxEnergy ? 1 : 0.3;
      const m0 = mass;
      c.growth = Math.min(1, c.growth + (dt / t.maturityTime) * fed);
      c.energy -= (c.mass - m0) * T.growthCost;
    }

    // Learned opinions slowly fade back toward instinct.
    c.brain.relax(dt);

    c.age += dt;
    c.pain *= Math.exp(-dt / 0.6);
    c.eatFlash *= 0.9;
    c.hurtFlash *= 0.88;
    c.reproCooldown -= dt;

    if (c.health <= 0) {
      const src = this.damageSource.get(c.id);
      this.kill(c, src === 'bite' ? 'eaten' : src === 'toxin' ? 'poisoned' : src === 'age' ? 'old age' : 'starved');
      return;
    }

    if (
      this.config.reproduction &&
      c.growth >= 1 &&
      c.reproCooldown <= 0 &&
      c.energy >= t.fertility * c.maxEnergy
    ) {
      this.tryReproduce(c);
    }
  }

  private eat(c: Creature, dt: number): void {
    const t = c.traits;
    const r = c.radius;
    if (c.energy >= c.maxEnergy * 0.98) return;
    if (t.plantEff >= T.minDigest) {
      const near = this.plantGrid.query(c.x, c.y, r + T.berryRadius + 1, this.tmpPlants);
      for (let k = 0; k < near.length; k++) {
        const p = near[k];
        if (!p.alive) continue;
        const dx = p.x - c.x;
        const dy = p.y - c.y;
        const rr = r + p.r;
        if (dx * dx + dy * dy > rr * rr) continue;
        // Learned taste aversion: it refuses food it has come to dislike.
        if (c.brain.liking[p.kind] < 0) continue;
        this.consumePlant(c, p);
        if (c.energy >= c.maxEnergy * 0.98) break;
      }
    }
    if (t.meatEff >= T.minDigest && c.brain.liking[2] >= 0) {
      const near = this.meatGrid.query(c.x, c.y, r + 16, this.tmpMeat);
      for (let k = 0; k < near.length; k++) {
        const m = near[k];
        if (!m.alive) continue;
        const dx = m.x - c.x;
        const dy = m.y - c.y;
        const rr = r + m.r;
        if (dx * dx + dy * dy > rr * rr) continue;
        const take = Math.min(m.energy, T.meatEatRate * Math.sqrt(c.mass) * dt);
        m.energy -= take;
        const gain = take * t.meatEff;
        c.energy = Math.min(c.maxEnergy, c.energy + gain);
        c.meatEaten += take;
        c.energyGained += gain;
        c.brain.taste(2, gain / 25);
        c.eatFlash = 1;
        this.interval.intake += gain;
        this.totals.meatEaten += take;
        if (m.energy <= 0.6) {
          m.alive = false;
          this.meatGrid.remove(m);
        }
        break;
      }
    }
  }

  private consumePlant(c: Creature, p: Plant): void {
    p.alive = false;
    this.plantGrid.remove(p);
    this.deadPlants = true;
    if (p.kind === 1) this.interval.berries++;
    if (p.kind === 1 && this.berriesToxic) {
      c.energy = Math.max(0, c.energy - T.toxicEnergyLoss);
      c.health -= T.toxicDamage;
      c.pain = Math.min(1, c.pain + 0.9);
      c.brain.taste(1, -1.5);
      c.toxicEaten++;
      c.hurtFlash = 1;
      this.damageSource.set(c.id, 'toxin');
      this.interval.toxic++;
      this.totals.toxicEaten++;
      return;
    }
    const gain = p.energy * c.traits.plantEff;
    c.energy = Math.min(c.maxEnergy, c.energy + gain);
    c.energyGained += gain;
    c.brain.taste(p.kind, Math.min(1, gain / 25));
    c.eatFlash = 1;
    this.interval.intake += gain;
    if (p.kind === 1) {
      c.berriesEaten++;
      this.totals.berriesEaten++;
    } else {
      c.plantsEaten++;
      this.totals.plantsEaten++;
    }
  }

  private bite(c: Creature, dt: number): void {
    const near = this.creatureGrid.query(c.x, c.y, c.radius + 30, this.tmpCreatures);
    const ca = Math.cos(c.angle);
    const sa = Math.sin(c.angle);
    const cosB = Math.cos(T.biteAngle);
    let target: Creature | null = null;
    let bestD = Infinity;
    for (let k = 0; k < near.length; k++) {
      const o = near[k];
      if (o === c || !o.alive) continue;
      const dx = o.x - c.x;
      const dy = o.y - c.y;
      const d = Math.hypot(dx, dy) + 1e-6;
      if (d > c.radius + o.radius + T.biteReach) continue;
      if (dx * ca + dy * sa < cosB * d) continue;
      if (d < bestD) {
        bestD = d;
        target = o;
      }
    }
    if (!target) {
      c.biteTargetId = 0;
      return;
    }
    c.biteTargetId = target.id;
    const t = c.traits;
    const dmg = (T.biteDamage + T.biteDamageDiet * t.diet) * Math.pow(c.mass, 0.7) * dt;
    target.health -= dmg;
    target.pain = Math.min(1, target.pain + dmg / (0.2 * target.maxHealth));
    target.lastAttackerId = c.id;
    target.hurtFlash = 1;
    this.damageSource.set(target.id, 'bite');
    const gain = dmg * T.bloodGain * t.meatEff;
    c.energy = Math.min(c.maxEnergy, c.energy + gain);
    c.energyGained += gain;
    this.interval.intake += gain;
    if (target.health <= 0 && target.alive) {
      this.kill(target, 'eaten');
      c.kills++;
      this.totals.kills++;
      this.interval.kills++;
      this.emit({ type: 'kill', killerId: c.id, victimId: target.id, x: target.x, y: target.y });
    }
  }

  private findMate(c: Creature): Creature | null {
    const near = this.creatureGrid.query(c.x, c.y, T.mateRange, this.tmpCreatures);
    let best: Creature | null = null;
    let bestD = T.mateRange * T.mateRange;
    for (let k = 0; k < near.length; k++) {
      const o = near[k];
      if (o === c || !o.alive || o.growth < 1 || o.speciesId !== c.speciesId) continue;
      const d2 = (o.x - c.x) ** 2 + (o.y - c.y) ** 2;
      if (d2 < bestD) {
        bestD = d2;
        best = o;
      }
    }
    return best;
  }

  private tryReproduce(c: Creature): void {
    const cfg = this.config;
    if (this.creatures.length + this.newborns.length >= cfg.maxPopulation) {
      c.reproCooldown = 1;
      return;
    }
    const t = c.traits;
    const babyR = t.adultRadius * t.babyFraction;
    const babyMass = (babyR / T.massRef) ** 2;
    const babyEnergy = T.energyPerMass * babyMass * T.babyEnergyFill;
    const cost = babyEnergy * T.birthOverhead;
    if (c.energy - cost < T.minParentReserve * c.maxEnergy) {
      c.reproCooldown = 1;
      return;
    }
    const mate = cfg.sexual ? this.findMate(c) : null;
    let g = mate ? crossover(c.genome, mate.genome, this.rng) : c.genome;
    if (cfg.lamarckian && c.brain.plastic) {
      // Lamarck's idea: what the parent learned becomes part of the child's instincts.
      g = cloneGenome(g);
      for (let o = 0; o < N_OUT; o++) for (let i = 0; i < 6; i++) g.brain[W3_OFFSET + o * N_IN + i] *= c.brain.inputGain(i);
      for (let h = 0; h < H_MAX; h++) for (let i = 0; i < 6; i++) g.brain[W1_OFFSET + h * N_IN + i] *= c.brain.inputGain(i);
    }
    g = mutate(g, this.rng, cfg.mutationScale);

    c.energy -= cost;
    c.children++;
    c.reproCooldown = T.reproCooldown;
    if (mate) mate.children++;

    const back = c.angle + Math.PI + this.rng.range(-0.6, 0.6);
    const dist = c.radius + babyR + 1;
    let x = c.x + Math.cos(back) * dist;
    let y = c.y + Math.sin(back) * dist;
    const R = cfg.radius - babyR - 1;
    const d = Math.hypot(x, y);
    if (d > R) {
      x *= R / d;
      y *= R / d;
    }
    const parentSpecies = this.species.get(c.speciesId)!;
    const sp = this.species.assign(g, parentSpecies, this.nextId, this.time, this.rng);
    const baby = this.makeCreature(g, x, y, this.rng.range(0, TAU), {
      species: sp,
      generation: Math.max(c.generation, mate?.generation ?? 0) + 1,
      parentId: c.id,
      mateId: mate?.id ?? 0,
      energy: babyEnergy,
      growth: 0,
      parentGenomes: [c.genome, mate?.genome ?? null],
    });
    this.newborns.push(baby);
  }

  /** Kill a creature (it is removed at the end of the step). */
  kill(c: Creature, cause: DeathCause): void {
    if (!c.alive) return;
    c.alive = false;
    c.deathCause = cause;
    this.anyDeaths = true;
  }

  private processDeaths(): void {
    this.anyDeaths = false;
    let w = 0;
    const arr = this.creatures;
    for (let i = 0; i < arr.length; i++) {
      const c = arr[i];
      if (c.alive) {
        arr[w++] = c;
        continue;
      }
      this.onDied(c);
    }
    arr.length = w;
  }

  private onDied(c: Creature): void {
    this.byId.delete(c.id);
    this.damageSource.delete(c.id);
    const sp = this.species.get(c.speciesId);
    if (sp) this.species.onDeath(sp, this.time);
    const rec = this.records.get(c.id);
    if (rec) {
      rec.died = this.time;
      rec.cause = c.deathCause;
      rec.children = c.children;
      rec.plantsEaten = c.plantsEaten + c.berriesEaten;
      rec.meatEaten = c.meatEaten;
      rec.kills = c.kills;
    }
    const corpse = T.corpsePerMass * c.mass + 0.4 * Math.max(0, c.energy);
    this.addMeat(c.x, c.y, corpse, c.traits.hue);
    this.totals.deaths++;
    this.interval.deaths++;
    this.emit({ type: 'death', id: c.id, x: c.x, y: c.y, hue: c.traits.hue, cause: c.deathCause ?? 'starved' });

    // Remember successful genomes: the "gene bank" used by life support.
    const score = c.children + c.energyGained / 250 + c.kills * 0.5;
    if (score > 0.5) {
      const entry: BankEntry = { genome: c.genome, speciesId: c.speciesId, generation: c.generation, score, hunter: c.traits.diet > 0.6 };
      const bank = this.geneBank;
      const same = bank.filter((b) => b.hunter === entry.hunter);
      if (same.length < 16) bank.push(entry);
      else {
        let min = same[0];
        for (const b of same) if (b.score < min.score) min = b;
        if (score > min.score) bank[bank.indexOf(min)] = entry;
      }
    }
  }

  private processBirths(): void {
    for (const b of this.newborns) {
      this.register(b);
      this.totals.births++;
      this.interval.births++;
      const parentRec = this.records.get(b.parentId);
      if (parentRec) parentRec.children++;
      const mateRec = b.mateId ? this.records.get(b.mateId) : undefined;
      if (mateRec) mateRec.children++;
      this.emit({ type: 'birth', id: b.id, x: b.x, y: b.y, hue: b.traits.hue, sexual: b.mateId !== 0 });
    }
    this.newborns = [];
    this.flushSpeciesEvents();
  }

  private flushSpeciesEvents(): void {
    for (const p of this.species.pending) {
      if (p.type === 'speciation') {
        this.totals.speciations++;
        this.emit({ type: 'speciation', speciesId: p.species.id, parentSpeciesId: p.species.parentId });
      } else {
        this.totals.extinctions++;
        this.emit({ type: 'extinction', speciesId: p.species.id });
      }
    }
    this.species.pending.length = 0;
  }

  private resolveCollisions(): void {
    const R = this.config.radius;
    for (const c of this.creatures) {
      if (!c.alive) continue;
      const near = this.creatureGrid.query(c.x, c.y, c.radius + 26, this.tmpCreatures);
      for (let k = 0; k < near.length; k++) {
        const o = near[k];
        if (o.id <= c.id || !o.alive) continue;
        const dx = o.x - c.x;
        const dy = o.y - c.y;
        const min = c.radius + o.radius;
        const d2 = dx * dx + dy * dy;
        if (d2 >= min * min || d2 < 1e-9) continue;
        const d = Math.sqrt(d2);
        const overlap = (min - d) * 0.5;
        const nx = dx / d;
        const ny = dy / d;
        const mc = c.mass;
        const mo = o.mass;
        const fc = mo / (mc + mo);
        const fo = mc / (mc + mo);
        c.x -= nx * overlap * fc;
        c.y -= ny * overlap * fc;
        o.x += nx * overlap * fo;
        o.y += ny * overlap * fo;
      }
      const d = Math.hypot(c.x, c.y);
      const lim = R - c.radius;
      if (d > lim) {
        const nx = c.x / d;
        const ny = c.y / d;
        c.x = nx * lim;
        c.y = ny * lim;
        const vn = c.vx * nx + c.vy * ny;
        if (vn > 0) {
          c.vx -= vn * nx;
          c.vy -= vn * ny;
        }
      }
    }
  }

  private lifeSupport(): void {
    if (this.tick % 12 !== 0) return;
    const min = this.config.lifeSupport;
    if (min > 0 && this.creatures.length < min) {
      this.respawn(false);
      return;
    }
    const minHunters = this.config.hunterSupport;
    if (minHunters > 0 && this.tick % 60 === 0) {
      let hunters = 0;
      for (const c of this.creatures) if (c.traits.diet > 0.6) hunters++;
      if (hunters < minHunters) this.respawn(true);
    }
  }

  /** Player power: release newcomers (from the gene bank when possible). */
  introduce(hunter: boolean, count: number): number[] {
    const ids: number[] = [];
    for (let i = 0; i < count; i++) ids.push(this.respawn(hunter, false));
    this.flushSpeciesEvents();
    return ids;
  }

  /** Player power: plants everywhere (bloom) or half of them gone (famine). */
  bloom(count: number): void {
    for (let i = 0; i < count; i++) {
      const p = this.spawnPlant();
      if (p) {
        p.energy = p.maxEnergy;
        p.r = p.kind === 1 ? T.berryRadius : T.plantRadius;
      }
    }
  }

  famine(): void {
    for (const p of this.plants) {
      if (p.alive && this.rng.next() < 0.5) {
        p.alive = false;
        this.plantGrid.remove(p);
        this.deadPlants = true;
      }
    }
    if (this.deadPlants) this.compactPlants();
  }

  /** Life support: bring back a successful genome from the gene bank (or a fresh founder). */
  private respawn(hunter: boolean, isLifeSupport = true): number {
    const rng = this.rng;
    let genome: Genome;
    let species: Species | undefined;
    let generation = 0;
    const bank = this.geneBank.filter((b) => b.hunter === hunter);
    if (bank.length && rng.next() < 0.85) {
      bank.sort((a, b) => b.score - a.score);
      const pickE = bank[Math.min(bank.length - 1, Math.floor(rng.next() ** 2 * bank.length))];
      genome = mutate(pickE.genome, rng, 1);
      species = this.species.get(pickE.speciesId);
      generation = pickE.generation + 1;
      if (species && geneticDistance(genome, species.rep) > this.species.threshold * 1.5) species = undefined;
    } else {
      genome = this.founderGenome(hunter, hunter ? 0.97 : undefined);
    }
    if (!species) species = this.species.create(genome, this.nextId, null, this.time, rng, true);
    const pos = this.randomPointInDish(0.9);
    const c = this.addCreature(genome, pos.x, pos.y, rng.range(0, TAU), {
      species,
      generation,
      growth: 0.7,
      energyFraction: 0.8,
    });
    if (isLifeSupport) {
      this.totals.lifeSupport++;
      this.emit({ type: 'lifeSupport', count: 1, id: c.id, hunter });
    }
    return c.id;
  }

  // ---------------------------------------------------------------------------
  // Periodic bookkeeping
  // ---------------------------------------------------------------------------

  private bookkeeping(dt: number): void {
    const tm = this.timers;
    tm.recenter += dt;
    tm.prune += dt;
    tm.bankDecay += dt;
    if (this.species.pending.length) this.flushSpeciesEvents();
    if (tm.recenter >= 12) {
      tm.recenter = 0;
      this.species.recenter(this.creatures);
    }
    if (tm.bankDecay >= 10) {
      tm.bankDecay = 0;
      for (const b of this.geneBank) b.score *= 0.93;
    }
    if (tm.prune >= 30) {
      tm.prune = 0;
      this.pruneRecords();
    }
    if (this.config.benchmark) this.advanceProbe();
    if (this.config.recordStats && this.time - this.stats.lastSampleAt >= this.stats.interval) {
      this.sampleStats();
    }
  }

  /** Forget dead creatures nobody descends from, and find the common ancestor. */
  private pruneRecords(): void {
    const keep = new Set<number>();
    const counts = new Map<number, number>();
    for (const c of this.creatures) {
      let id = c.id;
      let guard = 0;
      while (id && guard++ < 100000) {
        counts.set(id, (counts.get(id) ?? 0) + 1);
        keep.add(id);
        const r = this.records.get(id);
        if (!r) break;
        if (r.mateId) keep.add(r.mateId);
        id = r.parentId;
      }
    }
    const n = this.creatures.length;
    let best: LifeRecord | null = null;
    if (n > 1) {
      for (const [id, cnt] of counts) {
        if (cnt !== n) continue;
        const r = this.records.get(id);
        if (r && (!best || r.generation > best.generation)) best = r;
      }
    }
    this.mrca = best ? { id: best.id, generation: best.generation, born: best.born } : null;
    const horizon = this.time - 90;
    for (const [id, r] of this.records) {
      if (!keep.has(id) && r.died !== null && r.died < horizon) this.records.delete(id);
    }
  }

  private sampleStats(): void {
    const iv = this.interval;
    const span = Math.max(1e-6, this.time - (iv.start || 0));
    let herb = 0;
    let omni = 0;
    let carn = 0;
    let maxGen = 0;
    let sumGen = 0;
    let learned = 0;
    let plasticN = 0;
    const traitSum: Record<TraitKey, number> = {} as Record<TraitKey, number>;
    for (const k of TRAIT_KEYS) traitSum[k] = 0;
    const speciesPop: Record<number, number> = {};
    for (const c of this.creatures) {
      const b = c.genome.body;
      if (c.traits.diet < 0.35) herb++;
      else if (c.traits.diet > 0.65) carn++;
      else omni++;
      if (c.generation > maxGen) maxGen = c.generation;
      sumGen += c.generation;
      traitSum.size += b[G.size];
      traitSum.speed += b[G.speed];
      traitSum.diet += b[G.diet];
      traitSum.vision += b[G.vision];
      traitSum.fov += b[G.fov];
      traitSum.brain += c.traits.hiddenCount;
      traitSum.plasticity += b[G.plasticity];
      traitSum.mutation += b[G.mutation];
      traitSum.fertility += b[G.fertility];
      traitSum.investment += b[G.investment];
      traitSum.maturity += b[G.maturity];
      if (c.brain.plastic) {
        learned += c.brain.learnedMagnitude();
        plasticN++;
      }
      const sp = this.species.get(c.speciesId);
      if (sp?.established) speciesPop[c.speciesId] = (speciesPop[c.speciesId] ?? 0) + 1;
    }
    const n = this.creatures.length;
    const traits = {} as Record<TraitKey, number>;
    for (const k of TRAIT_KEYS) traits[k] = n ? traitSum[k] / n : NaN;
    let berries = 0;
    for (const p of this.plants) if (p.kind === 1) berries++;
    const sample: StatSample = {
      t: this.time,
      pop: n,
      plants: this.plants.length - berries,
      berries,
      meat: this.meats.length,
      herb,
      omni,
      carn,
      births: iv.births,
      deaths: iv.deaths,
      kills: iv.kills,
      maxGen,
      avgGen: n ? sumGen / n : 0,
      intake: n ? (iv.intake / n / span) * 60 : 0,
      learned: plasticN ? learned / plasticN : 0,
      skill: this.lastSkill,
      toxicShare: iv.berries > 0 ? iv.toxic / iv.berries : NaN,
      traits,
      species: speciesPop,
    };
    this.stats.push(sample);
    this.interval = { births: 0, deaths: 0, kills: 0, intake: 0, berries: 0, toxic: 0, start: this.time };
  }

  /**
   * Foraging-skill benchmark: a copy of a random plant-eater is dropped into
   * an identical test arena and we count how many plants it finds per minute.
   * Because the arena is always the same, the score measures the brain, not
   * luck or crowding. The test runs a few steps at a time to stay smooth.
   */
  private advanceProbe(): void {
    if (!this.probe) {
      if (this.tick % 15 !== 0 || !this.creatures.length) return;
      const c = this.creatures[this.rng.int(0, this.creatures.length)];
      if (c.traits.plantEff < 0.4) return;
      this.probe = new SkillProbe(c.genome, 7);
    }
    if (this.probe.advance(4)) {
      this.skillResults.push(this.probe.score);
      if (this.skillResults.length > 8) this.skillResults.shift();
      let sum = 0;
      for (const v of this.skillResults) sum += v;
      this.lastSkill = sum / this.skillResults.length;
      this.probe = null;
    }
  }

  // ---------------------------------------------------------------------------
  // Player powers
  // ---------------------------------------------------------------------------

  sprinkleFood(x: number, y: number, kind: 0 | 1, count: number, spread: number): number {
    let n = 0;
    for (let i = 0; i < count; i++) {
      const p = this.spawnPlant(kind, { x, y }, spread);
      if (p) {
        p.energy = p.maxEnergy;
        p.r = kind === 1 ? T.berryRadius : T.plantRadius;
        n++;
      }
    }
    return n;
  }

  smite(id: number): void {
    const c = this.byId.get(id);
    if (c) this.kill(c, 'smitten');
    if (this.anyDeaths) this.processDeaths();
  }

  feed(id: number): void {
    const c = this.byId.get(id);
    if (!c) return;
    c.energy = c.maxEnergy;
    c.health = c.maxHealth;
    c.favored = true;
  }

  /** Artificial selection: breed a (mutated) copy of a chosen creature. */
  cloneCreature(id: number): Creature | null {
    const c = this.byId.get(id);
    if (!c) return null;
    const g = mutate(c.genome, this.rng, this.config.mutationScale);
    const sp = this.species.assign(g, this.species.get(c.speciesId)!, this.nextId, this.time, this.rng);
    const a = this.rng.range(0, TAU);
    const x = c.x + Math.cos(a) * (c.radius * 2.5);
    const y = c.y + Math.sin(a) * (c.radius * 2.5);
    const baby = this.addCreature(g, x, y, this.rng.range(0, TAU), {
      species: sp,
      generation: c.generation + 1,
      parentId: c.id,
      growth: 0.5,
      energyFraction: 0.9,
      parentGenomes: [c.genome, null],
    });
    c.children++;
    const rec = this.records.get(c.id);
    if (rec) rec.children++;
    this.totals.births++;
    this.emit({ type: 'birth', id: baby.id, x: baby.x, y: baby.y, hue: baby.traits.hue, sexual: false });
    this.flushSpeciesEvents();
    return baby;
  }

  /** Release a creature built from a DNA code into the dish. */
  spawnGenome(genome: Genome, x: number, y: number): Creature {
    let species: Species | undefined;
    for (const s of this.species.list) {
      if (s.extinctAt === null && geneticDistance(genome, s.rep) <= this.species.threshold) {
        species = s;
        break;
      }
    }
    if (!species) species = this.species.create(genome, this.nextId, null, this.time, this.rng, true);
    return this.addCreature(genome, x, y, this.rng.range(0, TAU), {
      species,
      generation: 0,
      growth: 1,
      energyFraction: 0.8,
    });
  }

  meteor(x: number, y: number, radius: number): number {
    let killed = 0;
    for (const c of this.creatures) {
      if (c.alive && Math.hypot(c.x - x, c.y - y) < radius + c.radius) {
        this.kill(c, 'meteor');
        killed++;
      }
    }
    for (const p of this.plants) {
      if (p.alive && Math.hypot(p.x - x, p.y - y) < radius) {
        p.alive = false;
        this.plantGrid.remove(p);
        this.deadPlants = true;
      }
    }
    if (this.anyDeaths) this.processDeaths();
    if (this.deadPlants) this.compactPlants();
    this.impactWinter = Math.max(this.impactWinter, 40);
    this.emit({ type: 'meteor', x, y, radius, killed });
    this.flushSpeciesEvents();
    return killed;
  }

  setConfig(patch: Partial<WorldConfig>): void {
    Object.assign(this.config, patch);
    if (patch.speciesThreshold !== undefined) this.species.threshold = patch.speciesThreshold;
    this.berriesToxic = this.computeToxic();
  }

  // ---------------------------------------------------------------------------

  emit(e: WorldEvent): void {
    if (!this.recordEvents) return;
    this.events.push(e);
    if (this.events.length > 4000) this.events.splice(0, this.events.length - 3000);
  }

  drainEvents(): WorldEvent[] {
    const e = this.events;
    this.events = [];
    return e;
  }
}

// -----------------------------------------------------------------------------
// Standard foraging test arena
// -----------------------------------------------------------------------------

export const ARENA_SECONDS = 20;

/** One creature alone in a standard arena with a fixed supply of plants. */
export class SkillProbe {
  readonly arena: World;
  readonly creature: Creature;
  readonly total = Math.round(ARENA_SECONDS / T.dt);
  steps = 0;

  constructor(genome: Genome, seed: number) {
    this.arena = new World(
      {
        seed,
        radius: 420,
        startPopulation: 0,
        plantRate: 400,
        maxPlants: 55,
        hotspotShare: 0,
        berryShare: 0,
        seasonAmp: 0,
        predation: false,
        reproduction: false,
        lifeSupport: 0,
        recordStats: false,
        benchmark: false,
      },
      { empty: true },
    );
    this.arena.recordEvents = false;
    this.arena.seedPlants(1);
    const sp = this.arena.species.create(genome, 0, null, 0, this.arena.rng, true);
    this.creature = this.arena.addCreature(genome, 0, 0, 0, { species: sp, generation: 0, growth: 1, energyFraction: 0.6 });
  }

  /** Advances up to n steps; returns true when the test is complete. */
  advance(n: number): boolean {
    const c = this.creature;
    for (let i = 0; i < n && this.steps < this.total; i++) {
      this.arena.step();
      c.energy = c.maxEnergy * 0.55;
      c.health = c.maxHealth;
      this.steps++;
    }
    return this.steps >= this.total;
  }

  /** Plants found per minute. */
  get score(): number {
    return (this.creature.plantsEaten / ARENA_SECONDS) * 60;
  }
}

export function benchmarkGenome(genome: Genome, seed = 7): number {
  const probe = new SkillProbe(genome, seed);
  probe.advance(probe.total);
  return probe.score;
}
