import { Rng } from './rng.ts';
import { G, type Genome } from './genome.ts';

/**
 * Names for creatures ("Bizo", "Ulka") and Latin-style binomial names for
 * species ("Velorix herbivora"). The species epithet describes the trait
 * that makes the species stand out, so the name hints at its adaptation.
 */

const ONSETS = ['b', 'd', 'f', 'g', 'k', 'l', 'm', 'n', 'p', 'r', 's', 't', 'v', 'z', 'br', 'kr', 'tr', 'pl', 'sh', 'zh', 'gl', 'fl', 'sn', 'qu', 'y', 'h', 'j', 'ch', 'th', 'dr'];
const VOWELS = ['a', 'e', 'i', 'o', 'u', 'a', 'o', 'i', 'ee', 'oo', 'ai', 'ou', 'y'];
const CODAS = ['', '', '', '', 'n', 'x', 'k', 'l', 'm', 'r', 's', 'p', 'b', 'z'];

export function creatureName(rng: Rng): string {
  const syll = rng.chance(0.6) ? 2 : rng.chance(0.7) ? 1 : 3;
  let s = '';
  for (let i = 0; i < syll; i++) {
    s += rng.pick(ONSETS) + rng.pick(VOWELS);
    if (i === syll - 1 || rng.chance(0.25)) s += rng.pick(CODAS);
  }
  if (s.length < 3) s += rng.pick(VOWELS);
  if (s.length > 8) s = s.slice(0, 8);
  return s.charAt(0).toUpperCase() + s.slice(1);
}

const GENUS_START = ['Vel', 'Mor', 'Cyt', 'Pla', 'Neu', 'Gly', 'Zo', 'Fla', 'Spi', 'Lum', 'Pyr', 'Oc', 'Hal', 'Thal', 'Bry', 'Xan', 'Rho', 'Kry', 'Amb', 'Ner', 'Sil', 'Vor', 'Ech', 'Myx', 'Phae', 'Tes', 'Cal', 'Dor', 'Gem', 'Lep'];
const GENUS_MID = ['o', 'a', 'i', 'e', 'u', 'y', 'ae', 'io', 'eo'];
const GENUS_END = ['rix', 'nax', 'plus', 'lon', 'dium', 'mus', 'phis', 'gella', 'cula', 'mona', 'tor', 'via', 'zoa', 'thus', 'nema', 'cyta', 'lum', 'derm', 'pod', 'sar'];

export function genusName(rng: Rng): string {
  return rng.pick(GENUS_START) + rng.pick(GENUS_MID) + rng.pick(GENUS_END);
}

interface Epithet {
  gene: number;
  high: string[];
  low: string[];
}

const EPITHETS: Epithet[] = [
  { gene: G.size, high: ['magnus', 'giganteus', 'grandis', 'robustus'], low: ['parvus', 'minimus', 'pusillus', 'nanus'] },
  { gene: G.speed, high: ['velox', 'rapidus', 'celer', 'cursor'], low: ['lentus', 'tardus', 'placidus', 'segnis'] },
  { gene: G.diet, high: ['carnivorus', 'predator', 'venator', 'ferox'], low: ['herbivorus', 'phytophagus', 'pascens', 'viridivorus'] },
  { gene: G.vision, high: ['oculatus', 'perspicax', 'lynceus', 'speculator'], low: ['myops', 'caecus', 'luscus', 'obscurus'] },
  { gene: G.fov, high: ['circumspectus', 'vigilans', 'panopticus', 'cautus'], low: ['intentus', 'directus', 'focalis', 'sagittarius'] },
  { gene: G.maturity, high: ['longaevus', 'patiens', 'senex', 'perennis'], low: ['ephemerus', 'praecox', 'fugax', 'brevis'] },
  { gene: G.fertility, high: ['prudens', 'parcus', 'cautelosus', 'frugalis'], low: ['fecundus', 'prolificus', 'fertilis', 'profusus'] },
  { gene: G.investment, high: ['maternus', 'nutrix', 'tutor', 'custos'], low: ['multiparus', 'spargens', 'seminator', 'disseminans'] },
  { gene: G.plasticity, high: ['sapiens', 'docilis', 'discens', 'astutus'], low: ['simplex', 'instinctivus', 'rigidus', 'innatus'] },
  { gene: G.brain, high: ['cerebrosus', 'cogitans', 'ingeniosus', 'callidus'], low: ['acephalus', 'simplex', 'stolidus', 'hebes'] },
  { gene: G.pattern, high: ['maculatus', 'punctatus', 'stellatus', 'guttatus'], low: ['nudus', 'purus', 'unicolor', 'levis'] },
];

const HUE_EPITHETS: [number, string][] = [
  [0.0, 'rubra'],
  [0.08, 'aurantia'],
  [0.15, 'aurea'],
  [0.25, 'viridis'],
  [0.4, 'smaragdina'],
  [0.5, 'cyanea'],
  [0.6, 'caerulea'],
  [0.72, 'violacea'],
  [0.83, 'purpurea'],
  [0.92, 'rosea'],
  [1.0, 'rubra'],
];

function hueEpithet(h: number): string {
  let best = HUE_EPITHETS[0];
  for (const e of HUE_EPITHETS) if (Math.abs(e[0] - h) < Math.abs(best[0] - h)) best = e;
  return best[1];
}

/**
 * Picks an epithet from the trait that differs most from `reference`
 * (the parent species, or the neutral middle value for founders).
 */
export function speciesEpithet(rng: Rng, genome: Genome, reference?: Genome): string {
  let bestScore = 0.06;
  let best: string | null = null;
  for (const e of EPITHETS) {
    const v = genome.body[e.gene];
    const ref = reference ? reference.body[e.gene] : 0.5;
    const d = v - ref;
    const score = Math.abs(d) * (e.gene === G.diet ? 1.6 : 1);
    if (score > bestScore) {
      bestScore = score;
      best = rng.pick(d > 0 ? e.high : e.low);
    }
  }
  return best ?? hueEpithet(genome.body[G.hue]);
}
