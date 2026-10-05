import { Creature } from './creature.ts';
import { decodeGenome, encodeGenome } from './genome.ts';
import type { Species } from './species.ts';
import type { StatSample } from './stats.ts';
import { World, type Hotspot, type LifeRecord, type WorldConfig } from './world.ts';

/**
 * Saving and loading whole worlds. Everything is turned into plain JSON;
 * genomes travel as compact base64 strings.
 */
export interface SavedWorld {
  version: 1;
  savedAt: number;
  name: string;
  scenarioId: string;
  config: WorldConfig;
  time: number;
  tick: number;
  nextId: number;
  rng: number[];
  berriesToxic: boolean;
  impactWinter: number;
  lastSkill: number | null;
  totals: World['totals'];
  mrca: World['mrca'];
  hotspots: Hotspot[];
  plants: number[];
  meats: number[];
  species: (Omit<Species, 'rep'> & { rep: string })[];
  speciesNextId: number;
  creatures: SavedCreature[];
  records: LifeRecord[];
  stats: { samples: StatSample[]; interval: number; lastSampleAt: number };
  geneBank: { genome: string; speciesId: number; generation: number; score: number; hunter: boolean }[];
  timers?: World['timers'];
  plantAcc?: number;
}

interface SavedCreature {
  id: number;
  name: string;
  genome: string;
  brain?: string;
  parents: [string | null, string | null];
  generation: number;
  parentId: number;
  mateId: number;
  speciesId: number;
  birthTime: number;
  s: number[]; // x, y, angle, vx, vy, energy, health, age, growth, pain, reproCooldown
  stats: number[]; // plants, berries, toxic, meat, energyGained, kills, children, distance
  liking: number[];
  lesioned: number[];
  learningEvents: number;
  favored: boolean;
}

const round = (v: number, d = 100) => Math.round(v * d) / d;

export function serializeWorld(w: World, meta: { name: string; scenarioId: string }): SavedWorld {
  const plants: number[] = [];
  for (const p of w.plants) plants.push(p.x, p.y, p.energy, p.maxEnergy, p.kind, p.age, p.maxAge);
  const meats: number[] = [];
  for (const m of w.meats) meats.push(m.x, m.y, m.energy, m.hue);
  return {
    version: 1,
    savedAt: Date.now(),
    name: meta.name,
    scenarioId: meta.scenarioId,
    config: { ...w.config },
    time: w.time,
    tick: w.tick,
    nextId: w.nextId,
    rng: w.rng.getState(),
    berriesToxic: w.berriesToxic,
    impactWinter: w.impactWinter,
    lastSkill: Number.isNaN(w.lastSkill) ? null : w.lastSkill,
    totals: { ...w.totals },
    mrca: w.mrca,
    hotspots: w.hotspots.map((h) => ({ ...h })),
    plants,
    meats,
    species: w.species.list.map((s) => ({ ...s, rep: encodeGenome(s.rep), avg: { ...s.avg } })),
    speciesNextId: w.species.nextId,
    creatures: w.creatures.map((c) => {
      let brainChanged = false;
      for (let i = 0; i < c.brain.w.length; i++) if (c.brain.w[i] !== c.genome.brain[i]) brainChanged = true;
      return {
        id: c.id,
        name: c.name,
        genome: encodeGenome(c.genome),
        brain: brainChanged ? encodeGenome({ body: c.genome.body, brain: c.brain.w }) : undefined,
        parents: [c.parentGenomes[0] ? encodeGenome(c.parentGenomes[0]) : null, c.parentGenomes[1] ? encodeGenome(c.parentGenomes[1]) : null],
        generation: c.generation,
        parentId: c.parentId,
        mateId: c.mateId,
        speciesId: c.speciesId,
        birthTime: c.birthTime,
        s: [c.x, c.y, c.angle, c.vx, c.vy, c.energy, c.health, c.age, c.growth, c.pain, c.reproCooldown],
        stats: [c.plantsEaten, c.berriesEaten, c.toxicEaten, c.meatEaten, c.energyGained, c.kills, c.children, round(c.distance)],
        liking: Array.from(c.brain.liking),
        lesioned: Array.from(c.brain.lesioned),
        learningEvents: c.brain.learningEvents,
        favored: c.favored,
      };
    }),
    records: [...w.records.values()],
    stats: { samples: w.stats.samples, interval: w.stats.interval, lastSampleAt: w.stats.lastSampleAt },
    geneBank: w.geneBank.map((b) => ({ genome: encodeGenome(b.genome), speciesId: b.speciesId, generation: b.generation, score: b.score, hunter: b.hunter })),
    timers: { ...w.timers },
    plantAcc: w.plantAcc,
  };
}

export function deserializeWorld(d: SavedWorld): World {
  if (!d || d.version !== 1) throw new Error('This save file is from an unknown version of LifeSim.');
  const w = new World(d.config, { empty: true });
  w.time = d.time;
  w.tick = d.tick;
  w.berriesToxic = d.berriesToxic;
  w.impactWinter = d.impactWinter;
  w.lastSkill = d.lastSkill ?? NaN;
  Object.assign(w.totals, d.totals);
  w.mrca = d.mrca;
  w.hotspots = d.hotspots.map((h) => ({ ...h }));

  for (let i = 0; i + 7 <= d.plants.length; i += 7) {
    const p = w.spawnPlant(d.plants[i + 4] as 0 | 1, { x: d.plants[i], y: d.plants[i + 1] }, 0);
    if (!p) continue;
    p.energy = d.plants[i + 2];
    p.maxEnergy = d.plants[i + 3];
    p.age = d.plants[i + 5];
    p.maxAge = d.plants[i + 6];
  }
  for (let i = 0; i + 4 <= d.meats.length; i += 4) w.addMeat(d.meats[i], d.meats[i + 1], d.meats[i + 2], d.meats[i + 3]);

  w.species.nextId = d.speciesNextId;
  for (const s of d.species) {
    const sp: Species = { ...s, rep: decodeGenome(s.rep), avg: { ...s.avg } };
    w.species.list.push(sp);
    w.species.byId.set(sp.id, sp);
  }

  for (const r of d.records) w.records.set(r.id, { ...r });

  for (const sc of d.creatures) {
    const genome = decodeGenome(sc.genome);
    const c = new Creature({
      id: sc.id,
      name: sc.name,
      genome,
      x: sc.s[0],
      y: sc.s[1],
      angle: sc.s[2],
      generation: sc.generation,
      parentId: sc.parentId,
      mateId: sc.mateId,
      speciesId: sc.speciesId,
      birthTime: sc.birthTime,
      growth: sc.s[8],
      parentGenomes: [sc.parents[0] ? decodeGenome(sc.parents[0]) : null, sc.parents[1] ? decodeGenome(sc.parents[1]) : null],
    });
    if (sc.brain) c.brain.w.set(decodeGenome(sc.brain).brain);
    [c.vx, c.vy, c.energy, c.health, c.age] = [sc.s[3], sc.s[4], sc.s[5], sc.s[6], sc.s[7]];
    c.pain = sc.s[9];
    c.reproCooldown = sc.s[10];
    [c.plantsEaten, c.berriesEaten, c.toxicEaten, c.meatEaten, c.energyGained, c.kills, c.children, c.distance] = sc.stats;
    c.brain.liking.set(sc.liking);
    c.brain.lesioned.set(sc.lesioned);
    c.brain.learningEvents = sc.learningEvents;
    c.favored = sc.favored;
    w.restoreCreature(c);
  }
  w.nextId = d.nextId;
  w.rng.setState(d.rng);
  w.stats.samples = d.stats.samples;
  w.stats.interval = d.stats.interval;
  w.stats.lastSampleAt = d.stats.lastSampleAt;
  w.geneBank = d.geneBank.map((b) => ({ genome: decodeGenome(b.genome), speciesId: b.speciesId, generation: b.generation, score: b.score, hunter: b.hunter }));
  if (d.timers) w.timers = { ...d.timers };
  if (d.plantAcc !== undefined) w.plantAcc = d.plantAcc;
  return w;
}
