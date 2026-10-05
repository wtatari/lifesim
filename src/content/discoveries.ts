import type { World, WorldEvent } from '../sim/world.ts';

/**
 * Discoveries are achievements that teach: each one fires the moment the
 * simulation demonstrates an idea, with a two-line explanation and a link
 * to the matching Field Guide entry.
 */
export type DiscoveryIcon =
  | 'baby'
  | 'heart'
  | 'history'
  | 'git-branch'
  | 'skull'
  | 'swords'
  | 'lightbulb'
  | 'flask'
  | 'snowflake'
  | 'brain'
  | 'hourglass'
  | 'activity'
  | 'flame'
  | 'route'
  | 'target'
  | 'heart-pulse'
  | 'hand'
  | 'scissors'
  | 'dna'
  | 'zap'
  | 'drumstick';

export interface DiscoveryDef {
  id: string;
  title: string;
  body: string;
  guide: string;
  icon: DiscoveryIcon;
  /** Fires on a world event. */
  onEvent?: (e: WorldEvent, w: World) => boolean;
  /** Polled about once per second. */
  check?: (w: World, memo: DiscoveryMemo) => boolean;
}

/** Scratch memory shared by checks (e.g. recent population peak). */
export interface DiscoveryMemo {
  popHistory: { t: number; pop: number }[];
}

export const DISCOVERIES: DiscoveryDef[] = [
  {
    id: 'first-birth',
    title: 'A new generation',
    body: 'A creature just had a baby. Its DNA is a copy of its parent’s, with a few random copying errors called mutations.',
    guide: 'heredity',
    icon: 'baby',
    onEvent: (e) => e.type === 'birth',
  },
  {
    id: 'two-parents',
    title: 'Two parents',
    body: 'This baby’s DNA is a mix of two parents. Mixing genes (crossover) creates new combinations every generation.',
    guide: 'crossover',
    icon: 'heart',
    onEvent: (e) => e.type === 'birth' && e.sexual,
  },
  {
    id: 'gen-10',
    title: 'Generation 10',
    body: 'Ten rounds of survival and reproduction. Each round, genes from creatures that left more babies became a little more common.',
    guide: 'selection',
    icon: 'history',
    check: (w) => w.totals.maxGeneration >= 10,
  },
  {
    id: 'gen-50',
    title: 'Generation 50',
    body: 'Fifty generations of selection. Compare today’s creatures with the founders in the Traits chart: the population has measurably changed.',
    guide: 'neuroevolution',
    icon: 'history',
    check: (w) => w.totals.maxGeneration >= 50,
  },
  {
    id: 'gen-200',
    title: 'Deep time',
    body: 'Generation 200. Neutral genes like Markings have wandered far from where they started, by pure luck. That is genetic drift.',
    guide: 'drift',
    icon: 'hourglass',
    check: (w) => w.totals.maxGeneration >= 200,
  },
  {
    id: 'new-species',
    title: 'A new species',
    body: 'A family line has drifted so far from its relatives that it now counts as a separate species. See it branch off in the tree of life.',
    guide: 'speciation',
    icon: 'git-branch',
    onEvent: (e) => e.type === 'speciation',
  },
  {
    id: 'extinction',
    title: 'Extinction',
    body: 'A species just lost its last member. Its unique combination of genes is gone forever.',
    guide: 'extinction',
    icon: 'skull',
    onEvent: (e) => e.type === 'extinction',
  },
  {
    id: 'first-kill',
    title: 'The first hunt',
    body: 'A hunter caught its prey. Energy flows up the food chain: plants → grazers → hunters.',
    guide: 'food-chain',
    icon: 'swords',
    onEvent: (e) => e.type === 'kill',
  },
  {
    id: 'meat-evolved',
    title: 'Hunters evolved',
    body: 'A species descended from plant-eaters has evolved into meat-eaters. A new way of life has appeared.',
    guide: 'food-chain',
    icon: 'drumstick',
    check: (w) =>
      w.species.list.some((s) => {
        if (s.extinctAt !== null || !s.established || s.avg.diet < 0.6) return false;
        const parent = w.species.get(s.parentId);
        return !!parent && parent.rep.body[3] < 0.35;
      }),
  },
  {
    id: 'learned',
    title: 'Learned from experience',
    body: 'A creature ate something bad and now avoids it. Its genes didn’t change. It learned within its own lifetime.',
    guide: 'learning',
    icon: 'lightbulb',
    check: (w) => w.creatures.some((c) => c.brain.liking[1] < 0 || c.brain.liking[0] < 0),
  },
  {
    id: 'poison',
    title: 'The berries turned toxic',
    body: 'Berries look exactly the same, but now they poison whoever eats them. Creatures can only find out the hard way, unless they can learn.',
    guide: 'changing-environment',
    icon: 'flask',
    onEvent: (e) => e.type === 'toxicFlip' && e.toxic,
  },
  {
    id: 'winter',
    title: 'Winter',
    body: 'Plants grow slowly now. Food gets scarce and the weakest starve. Natural selection is strongest in hard times.',
    guide: 'seasons',
    icon: 'snowflake',
    onEvent: (e) => e.type === 'season' && e.season === 'winter',
  },
  {
    id: 'big-brain',
    title: 'Big brain',
    body: 'A creature evolved 11 or more hidden neurons. More neurons allow more complex behaviour, but every neuron costs energy, every second.',
    guide: 'brain-cost',
    icon: 'brain',
    check: (w) => w.creatures.some((c) => c.traits.hiddenCount >= 11),
  },
  {
    id: 'old-age',
    title: 'A full life',
    body: 'A creature died of old age. Its lifespan was written in its genes: bigger, slow-growing creatures live longer.',
    guide: 'life-history',
    icon: 'hourglass',
    onEvent: (e) => e.type === 'death' && e.cause === 'old age',
  },
  {
    id: 'boom',
    title: 'Population boom',
    body: 'Over 120 creatures! With food to spare, populations grow fast, until they eat food faster than it grows back.',
    guide: 'carrying-capacity',
    icon: 'activity',
    check: (w) => w.creatures.length >= 120,
  },
  {
    id: 'crash',
    title: 'Population crash',
    body: 'Half the population died within a minute. Overshooting the food supply leads to a crash: carrying capacity in action.',
    guide: 'carrying-capacity',
    icon: 'activity',
    check: (w, memo) => {
      const recent = memo.popHistory.filter((p) => p.t > w.time - 60);
      const peak = Math.max(0, ...recent.map((p) => p.pop));
      return peak >= 40 && w.creatures.length <= peak / 2;
    },
  },
  {
    id: 'meteor',
    title: 'Mass extinction',
    body: 'A meteor wiped out everything in its path. Whoever survived, often just by luck, will be the ancestor of what comes next.',
    guide: 'mass-extinction',
    icon: 'flame',
    onEvent: (e) => e.type === 'meteor' && e.killed >= 5,
  },
  {
    id: 'ancestor',
    title: 'Common ancestor',
    body: 'Every creature alive today descends from one single individual. Find it in any creature’s Family tab.',
    guide: 'common-ancestor',
    icon: 'route',
    check: (w) => w.mrca !== null && w.mrca.generation >= 3,
  },
  {
    id: 'skilled',
    title: 'Expert foragers',
    body: 'Plant-eaters now find over 22 plants a minute in the standard test arena. Nobody programmed this: natural selection tuned their brains.',
    guide: 'neuroevolution',
    icon: 'target',
    check: (w) => {
      // Only counts when brains got better, not when they started out skilled.
      const first = w.stats.samples.find((s) => Number.isFinite(s.skill));
      return !!first && first.skill < 12 && w.lastSkill >= 22;
    },
  },
  {
    id: 'life-support',
    title: 'The lab stepped in',
    body: 'The population got dangerously small, so the lab revived a successful genome from its gene bank.',
    guide: 'life-support',
    icon: 'heart-pulse',
    onEvent: (e) => e.type === 'lifeSupport',
  },
  {
    id: 'artificial',
    title: 'Artificial selection',
    body: 'You are choosing who gets to breed, just as farmers shaped crops and breeders shaped dogs for thousands of years.',
    guide: 'artificial-selection',
    icon: 'hand',
  },
  {
    id: 'surgeon',
    title: 'Brain surgeon',
    body: 'You rewired a brain by hand. Every behaviour lives in those connection weights. Change them and the creature changes.',
    guide: 'weights',
    icon: 'scissors',
  },
  {
    id: 'engineer',
    title: 'Genetic engineer',
    body: 'You moved DNA between worlds. A DNA code holds everything needed to rebuild a creature: body and brain.',
    guide: 'dna',
    icon: 'dna',
  },
  {
    id: 'neuron-lab',
    title: 'Neuron whisperer',
    body: 'You wired a single neuron to steer a creature toward food. That is what evolution does too, by trial and error.',
    guide: 'neuron',
    icon: 'zap',
  },
];

export function getDiscovery(id: string): DiscoveryDef | undefined {
  return DISCOVERIES.find((d) => d.id === id);
}
