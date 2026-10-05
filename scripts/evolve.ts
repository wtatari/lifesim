/**
 * Headless evolution runner.
 *
 *   npm run evolve -- --minutes 30 --seed 3 [--berry shifting] [--out presets.json]
 *
 * Runs a world without graphics as fast as possible and prints its vital
 * signs. Used to tune the ecosystem and to breed the pre-evolved creatures
 * that ship with the lessons.
 */
import { writeFileSync } from 'node:fs';
import { World, benchmarkGenome, type WorldConfig } from '../src/sim/world.ts';
import { toDnaCode } from '../src/sim/genome.ts';
import { speciesName } from '../src/sim/species.ts';
import { T } from '../src/sim/tuning.ts';

const args = process.argv.slice(2);
function arg(name: string, def: string): string {
  const i = args.indexOf(`--${name}`);
  return i >= 0 && args[i + 1] ? args[i + 1] : def;
}

const minutes = Number(arg('minutes', '20'));
const seed = arg('seed', '1');
const every = Number(arg('every', '60'));
const out = arg('out', '');
const patch: Partial<WorldConfig> = { seed };
if (arg('berry', '')) patch.berryMode = arg('berry', 'good') as WorldConfig['berryMode'];
if (arg('berryShare', '')) patch.berryShare = Number(arg('berryShare', '0.1'));
if (arg('plantRate', '')) patch.plantRate = Number(arg('plantRate', '24'));
if (arg('predation', '')) patch.predation = arg('predation', 'true') === 'true';
if (arg('startBrain', '')) patch.startBrain = arg('startBrain', 'random') as WorldConfig['startBrain'];
if (arg('threshold', '')) patch.speciesThreshold = Number(arg('threshold', '0.2'));
if (arg('lamarck', '')) patch.lamarckian = arg('lamarck', 'false') === 'true';
if (arg('founderDiet', '')) patch.founderDiet = Number(arg('founderDiet', '0'));
if (arg('pop', '')) patch.startPopulation = Number(arg('pop', '60'));
if (arg('radius', '')) patch.radius = Number(arg('radius', '1100'));
if (arg('hunters', '')) patch.hunterFounders = Number(arg('hunters', '0'));
if (arg('hunterShare', '')) patch.hunterShare = Number(arg('hunterShare', '0.15'));
if (arg('founders', '')) patch.founders = Number(arg('founders', '4'));
if (arg('hunterSupport', '')) patch.hunterSupport = Number(arg('hunterSupport', '0'));

// Allow tuning overrides for experiments: --tune key=value,key=value
const tune = arg('tune', '');
if (tune) {
  for (const kv of tune.split(',')) {
    const [k, v] = kv.split('=');
    (T as unknown as Record<string, number>)[k] = Number(v);
  }
}

const world = new World(patch);
world.recordEvents = true;
const totalSteps = Math.round((minutes * 60) / (1 / 30));
const t0 = performance.now();
let lastPrint = 0;
let stepTime = 0;
let steps = 0;

const pad = (s: string | number, n: number) => String(s).padStart(n);
console.log(
  [
    'time',
    'pop',
    'plnt',
    'H/O/C',
    'gen',
    'intake',
    'skill',
    'size',
    'speed',
    'diet',
    'vis',
    'fov',
    'brain',
    'plast',
    'mut',
    'sp',
    'kills',
    'toxic%',
    'ms/step',
  ].join('\t'),
);

for (let i = 0; i < totalSteps; i++) {
  const s0 = performance.now();
  world.step();
  stepTime += performance.now() - s0;
  steps++;
  world.drainEvents();
  if (world.time - lastPrint >= every) {
    lastPrint = world.time;
    const s = world.stats.latest();
    if (!s) continue;
    const living = world.species.living().length;
    console.log(
      [
        `${(world.time / 60).toFixed(1)}m`,
        pad(s.pop, 3),
        pad(s.plants, 4),
        `${s.herb}/${s.omni}/${s.carn}`,
        `${s.maxGen}`,
        s.intake.toFixed(1),
        Number.isNaN(s.skill) ? '-' : s.skill.toFixed(1),
        s.traits.size.toFixed(2),
        s.traits.speed.toFixed(2),
        s.traits.diet.toFixed(2),
        s.traits.vision.toFixed(2),
        s.traits.fov.toFixed(2),
        s.traits.brain.toFixed(1),
        s.traits.plasticity.toFixed(2),
        s.traits.mutation.toFixed(2),
        `${living}`,
        `${world.totals.kills}`,
        Number.isNaN(s.toxicShare) ? '-' : (s.toxicShare * 100).toFixed(0),
        (stepTime / steps).toFixed(2),
      ].join('\t'),
    );
    stepTime = 0;
    steps = 0;
  }
}

const wall = (performance.now() - t0) / 1000;
console.log(`\nSimulated ${minutes} min in ${wall.toFixed(1)} s real time (${((minutes * 60) / wall).toFixed(0)}× real-time)`);
console.log('Totals', world.totals);
console.log('Species alive:');
for (const s of world.species.living()) {
  console.log(
    `  #${s.id} ${speciesName(s)}  pop=${s.population} peak=${s.peak} born=${s.bornAt.toFixed(0)}s depth=${s.depth} diet=${s.avg.diet.toFixed(2)} size=${s.avg.size.toFixed(2)}`,
  );
}
console.log(`Species ever established: ${world.species.list.filter((s) => s.established).length}`);

if (out) {
  // Pick the best foragers (by benchmark) and the most successful hunters.
  const herbs = world.creatures.filter((c) => c.traits.plantEff > 0.5);
  const scored = herbs
    .slice(0, 60)
    .map((c) => ({ c, score: benchmarkGenome(c.genome, 11) + benchmarkGenome(c.genome, 12) }))
    .sort((a, b) => b.score - a.score);
  const carns = world.creatures.filter((c) => c.traits.meatEff > 0.4).sort((a, b) => b.kills - a.kills);
  const data = {
    seed,
    minutes,
    foragers: scored.slice(0, 8).map((x) => ({ dna: toDnaCode(x.c.genome), skill: x.score / 2, gen: x.c.generation })),
    hunters: carns.slice(0, 8).map((c) => ({ dna: toDnaCode(c.genome), kills: c.kills, gen: c.generation })),
  };
  writeFileSync(out, JSON.stringify(data, null, 2));
  console.log(`Wrote ${out}`);
}
