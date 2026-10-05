/**
 * The Field Guide: short, accurate explanations of every idea the simulation
 * demonstrates. `**bold**` is rendered as emphasis. Each entry ends with
 * something to try in the dish, so reading always leads back to doing.
 */

export type Chapter = 'Brains' | 'Genes' | 'Evolution' | 'Ecology';

export interface GuideEntry {
  key: string;
  title: string;
  chapter: Chapter;
  summary: string;
  body: string[];
  tryIt?: string;
  related?: string[];
}

export const CHAPTERS: { id: Chapter; blurb: string }[] = [
  { id: 'Brains', blurb: 'How a tiny neural network turns what a creature sees into what it does.' },
  { id: 'Genes', blurb: 'How DNA stores a creature and passes it on, typos and all.' },
  { id: 'Evolution', blurb: 'How survival and reproduction slowly reshape life.' },
  { id: 'Ecology', blurb: 'How creatures, food and the seasons push on each other.' },
];

export const GUIDE: GuideEntry[] = [
  // ------------------------------------------------------------------ Brains
  {
    key: 'neuron',
    title: 'Neurons',
    chapter: 'Brains',
    summary: 'A neuron adds up its inputs, each multiplied by a weight, and squashes the total into a number between −1 and +1.',
    body: [
      'A real neuron collects electrical signals from other neurons and "fires" when the total is strong enough. The neurons in LifeSim are a simplified version of the same idea, the kind used in modern AI.',
      'Each one does three things: **multiply** every incoming signal by the strength of its connection (its weight), **add** everything up together with a bias, and **squash** the total through an activation function so the output stays between −1 and +1.',
      'One neuron on its own can only make a simple decision, like "turn toward the plant". Wire a few dozen together and you get behaviour that looks surprisingly smart.',
    ],
    tryIt: 'Open the Neuron Lab from the Academy and drive a creature with a single neuron.',
    related: ['weights', 'activation', 'layers'],
  },
  {
    key: 'weights',
    title: 'Connections & weights',
    chapter: 'Brains',
    summary: 'A weight is the strength of one connection. Positive weights excite, negative weights inhibit, and zero means no effect.',
    body: [
      'Every line in the brain view is a connection with a weight. **Cyan** lines are positive: when the first neuron is active, they push the next one up. **Red** lines are negative: they push it down. Thicker lines are stronger.',
      'Everything a creature "knows" is stored in these numbers. A creature that turns toward food has a positive weight from "Plant direction" to "Turn". Flip that weight and the very same body will turn away from every meal.',
      'In LifeSim the starting weights are written in the DNA, so they are inherited, and they change through mutation. That is how evolution rewires brains.',
    ],
    tryIt: 'Select a creature, open its brain, switch on Brain surgery and click a connection to change its weight. Watch how its behaviour changes.',
    related: ['neuron', 'neuroevolution', 'reflexes'],
  },
  {
    key: 'bias',
    title: 'Bias',
    chapter: 'Brains',
    summary: 'A bias is a neuron’s built-in leaning: its output when all its inputs are silent.',
    body: [
      'Even when a creature sees nothing at all, its brain still produces actions. That baseline comes from the biases. A positive bias on "Swim" means the creature cruises forward by default; a negative bias on "Bite" keeps its jaws shut unless something tells them to open.',
      'Biases are genes too, so evolution tunes a creature’s default mood as well as its reactions.',
    ],
    related: ['neuron', 'weights'],
  },
  {
    key: 'activation',
    title: 'Activation: squashing',
    chapter: 'Brains',
    summary: 'The activation function (here tanh) squashes any total into the range −1…+1, which lets networks make non-linear decisions.',
    body: [
      'After adding up its inputs, a neuron passes the total through an S-shaped curve called tanh. Small totals pass through almost unchanged; huge totals get flattened to nearly −1 or +1.',
      'That flattening matters. Without it, stacking layers of neurons would be no smarter than a single layer. With it, a network can represent decisions like "chase it if it is small, flee if it is big".',
    ],
    tryIt: 'In the Neuron Lab, push a weight very high and watch the output saturate near +1.',
    related: ['neuron', 'layers'],
  },
  {
    key: 'layers',
    title: 'Layers: senses → hidden → actions',
    chapter: 'Brains',
    summary: 'Signals flow from 14 sensory neurons, through up to 12 hidden neurons, to 3 action neurons.',
    body: [
      '**Input layer**: what the creature senses. Where the nearest plant, berry, meat and creature are, how close they are, how big that creature is, whether it looks like family, plus hunger, pain, the wall ahead and an internal rhythm.',
      '**Hidden layer**: neurons that combine the senses into features no single sense carries, such as "something small is close on my left".',
      '**Output layer**: what the creature does. Swim (forward/back), Turn (left/right) and Bite.',
      'The brain thinks 30 times every simulated second, and every one of those decisions is visible live in the brain view.',
    ],
    related: ['senses', 'reflexes', 'brain-cost'],
  },
  {
    key: 'reflexes',
    title: 'Reflexes: direct links',
    chapter: 'Brains',
    summary: 'Some connections skip the hidden layer and wire a sense straight to an action, like the reflex arc in your spinal cord.',
    body: [
      'When you touch something hot, your hand jerks back before your brain has finished thinking. That is a reflex: a short, direct path from sense to muscle.',
      'LifeSim brains have them too: the curved links that jump from the senses straight to the actions. They make simple behaviours (turn toward food, veer away from the wall) easy for evolution to discover, because a single mutation can create one.',
    ],
    related: ['layers', 'neuroevolution'],
  },
  {
    key: 'senses',
    title: 'How creatures see',
    chapter: 'Brains',
    summary: 'Eyes report the direction and nearness of the closest plant, berry, meat and creature inside the field of view.',
    body: [
      'Each creature looks out through a cone in front of it. Its width (field of view) and length (eyesight) are genes. For each kind of thing it reports two numbers: **direction** (−1 far left, 0 straight ahead, +1 far right) and **nearness** (0 nothing in sight, 1 touching).',
      'Wide eyes notice more but aim less precisely, the way rabbits see. Narrow eyes aim precisely but miss what is beside them, the way hawks see. Long sight finds more food but costs energy. Natural selection balances these trade-offs differently for hunters and for grazers.',
    ],
    tryIt: 'Select a creature to see its vision cone and the lines to what it is looking at.',
    related: ['layers', 'metabolism'],
  },
  {
    key: 'brain-cost',
    title: 'Brains are expensive',
    chapter: 'Brains',
    summary: 'Every hidden neuron burns energy every second, so bigger brains must pay for themselves.',
    body: [
      'Your brain is 2% of your body weight but uses about 20% of your energy. Brains are costly everywhere in nature.',
      'In LifeSim, brain size is a gene. Each active hidden neuron adds to the energy bill. A bigger brain only spreads through the population if the smarter behaviour it allows earns back more food than it costs. Watch the Brain size trait: it rarely grows without a good reason.',
    ],
    tryIt: 'Open the Traits chart and follow "Brain size" over a long run.',
    related: ['metabolism', 'neuroevolution'],
  },
  {
    key: 'learning',
    title: 'Learning during life',
    chapter: 'Brains',
    summary: 'Creatures with the learning gene adjust how much they like each food after every meal: a reward signal rewires their brain.',
    body: [
      'Evolution needs many generations to change behaviour. Learning works within a single lifetime.',
      'Each creature has a learned **liking** for plants, berries and meat. A tasty meal nudges it up; a poisonous one pushes it down. The liking multiplies every connection leaving that food’s eye neurons, so it literally rewires the brain. If the liking drops below zero the connections flip sign, and a creature that was born to chase berries now steers away from them and refuses to eat them.',
      'Real brains do something similar: a burst of dopamine after a good outcome strengthens the connections that led to it. How fast a creature learns is a gene, and learning costs energy, so evolution decides whether it is worth having.',
    ],
    tryIt: 'Start the Poison berries world, select a creature from the learning species and watch its berry liking in the Brain tab after the berries turn toxic.',
    related: ['changing-environment', 'lamarck', 'weights'],
  },
  {
    key: 'neuroevolution',
    title: 'Neuroevolution',
    chapter: 'Brains',
    summary: 'Nobody programs these brains. Random mutations plus natural selection slowly tune their weights into skilled behaviour.',
    body: [
      'Most AI is trained with an algorithm called backpropagation, which uses calculus to adjust weights. LifeSim uses the method nature used: **neuroevolution**.',
      'Children inherit their parents’ weights with small random changes. Creatures whose brains find food reproduce more, so their weights spread. Over generations the brains get better at the tasks the environment rewards, with no teacher and no goal written anywhere.',
      'The Skill chart measures this directly. Every few seconds a plant-eater’s brain is copied into an identical test arena and we count how many plants it finds per minute.',
    ],
    tryIt: 'Start the Primordial soup world, run it at 8× and watch the Skill chart climb.',
    related: ['selection', 'weights', 'mutation'],
  },

  // ------------------------------------------------------------------- Genes
  {
    key: 'dna',
    title: 'DNA & genes',
    chapter: 'Genes',
    summary: 'A creature’s DNA is a list of numbers. 14 body genes build its body; about 260 brain genes set its starting brain wiring.',
    body: [
      'Real DNA is a long molecule written in four chemical letters. LifeSim DNA is a list of numbers, but it works the same way: it is a recipe that is copied and passed on.',
      '**Body genes** (each between 0 and 1) are expressed as traits when a creature is born: size, muscle, colour, diet, eyesight, field of view, growth time, breeding threshold, baby size, mutation rate, learning rate, rhythm, markings and brain size.',
      '**Brain genes** are the starting weight of every connection in the brain.',
      'You can copy any creature’s DNA as a text code and release it into another world.',
    ],
    tryIt: 'Select a creature and open its DNA tab. Each coloured band is one gene.',
    related: ['heredity', 'mutation', 'crossover'],
  },
  {
    key: 'heredity',
    title: 'Heredity',
    chapter: 'Genes',
    summary: 'Children inherit their parents’ DNA, so successful traits get passed on.',
    body: [
      'Heredity is the first ingredient of evolution: offspring resemble their parents. Without it, a lucky survivor’s advantage would vanish with it.',
      'Relatives in LifeSim share genes, so they look alike. The same colour gene runs through a whole family line, and creatures even use colour similarity to recognise kin.',
    ],
    tryIt: 'Open a creature’s Family tab and step back through its ancestors.',
    related: ['dna', 'mutation', 'selection'],
  },
  {
    key: 'mutation',
    title: 'Mutation',
    chapter: 'Genes',
    summary: 'Copying DNA is not perfect. Random typos create the variation that natural selection works on.',
    body: [
      'Every time DNA is copied a few genes change slightly at random. Most mutations make no difference or make things a little worse. Rarely, one helps.',
      'Mutation is the second ingredient of evolution: without new variation, selection would quickly run out of options.',
      'How sloppy the copying is depends on the mutation-rate gene, so evolution even tunes its own speed. You can also scale every mutation rate from the Lab controls. Set it to zero and evolution stops.',
    ],
    tryIt: 'In Lab controls, drop the mutation strength to 0 and see whether the traits charts keep moving.',
    related: ['heredity', 'selection', 'drift'],
  },
  {
    key: 'crossover',
    title: 'Two parents: crossover',
    chapter: 'Genes',
    summary: 'When a mate is nearby, the baby’s DNA is a mix of both parents, creating fresh combinations of genes.',
    body: [
      'In sexual reproduction, each child receives a different mix of its parents’ genes. Two good adaptations that appeared in different family lines can end up together in one child.',
      'LifeSim mixes body genes one by one, but brain genes travel one whole neuron at a time, so a useful circuit tends to be inherited intact. If no mate of the same species is close, a creature reproduces alone (a clone with mutations), like many real microbes.',
    ],
    related: ['heredity', 'speciation'],
  },
  {
    key: 'drift',
    title: 'Genetic drift & neutral genes',
    chapter: 'Genes',
    summary: 'Some changes in gene frequency are pure luck, especially in small populations.',
    body: [
      'Not every evolutionary change is adaptive. Sometimes a gene becomes common just because its carriers happened to be lucky. This is **genetic drift**, and it is strongest when populations are small.',
      'The Markings gene in LifeSim has no effect on survival at all. Watch it wander up and down over time: that is drift in action. Unused hidden neurons are "junk DNA" too. Their weights mutate freely until a brain-size mutation switches them on.',
    ],
    related: ['mutation', 'selection'],
  },
  {
    key: 'lamarck',
    title: 'Lamarck vs. Darwin',
    chapter: 'Genes',
    summary: 'Can parents pass on what they learned? Lamarck thought so; biology says no. In LifeSim you can test both.',
    body: [
      'Jean-Baptiste Lamarck (1809) proposed that traits acquired during life are inherited: a giraffe stretching its neck would have longer-necked children. Darwin’s theory, confirmed by genetics, says only the DNA is inherited, not the experiences.',
      'In LifeSim, learned likings normally die with the creature. The Lab controls include a Lamarckian experiment switch that writes what a parent learned into its child’s instincts. Try both and compare how quickly a population adapts.',
    ],
    tryIt: 'In Poison berries, turn on the Lamarckian switch in Lab controls and compare.',
    related: ['learning', 'heredity'],
  },

  // --------------------------------------------------------------- Evolution
  {
    key: 'selection',
    title: 'Natural selection',
    chapter: 'Evolution',
    summary: 'Creatures vary, variation is inherited, and some variants leave more offspring. Repeat, and populations change.',
    body: [
      'Darwin’s idea fits in one line: **variation + heredity + differential reproduction = evolution**.',
      'Nothing in LifeSim decides who is "best". Creatures simply try to stay alive. Those whose bodies and brains happen to gather more energy breed more, so their genes become more common in the next generation. Repeat over many generations and you get creatures that look designed for their world, with no designer.',
    ],
    tryIt: 'Watch the Traits chart. Every line that moves steadily is natural selection at work.',
    related: ['fitness', 'mutation', 'heredity', 'neuroevolution'],
  },
  {
    key: 'fitness',
    title: 'Fitness',
    chapter: 'Evolution',
    summary: 'In biology, fitness means reproductive success: how many offspring you leave, not how strong you are.',
    body: [
      '"Survival of the fittest" is easy to misread. Fitness is not strength or speed; it is the number of descendants a creature leaves. A small, slow creature that breeds a lot can be fitter than a giant.',
      'Each creature’s card shows its babies and kills. Compare a few and you will see that the fittest creatures are often not the ones you would expect.',
    ],
    related: ['selection', 'life-history'],
  },
  {
    key: 'artificial-selection',
    title: 'Artificial selection',
    chapter: 'Evolution',
    summary: 'When you choose which creatures breed, you are doing what farmers and dog breeders have done for millennia.',
    body: [
      'Darwin opened On the Origin of Species with pigeon breeding. Humans have reshaped wolves into chihuahuas and wild mustard into broccoli, cabbage and kale just by choosing who breeds.',
      'Use the Feed and Breed tools to favour creatures you like (say, the biggest ones), and Remove to take others out of the gene pool. Within a few generations your choices will show up in the Traits chart.',
    ],
    tryIt: 'Breed only the biggest creatures for a few minutes, then check the Body size trait.',
    related: ['selection', 'fitness'],
  },
  {
    key: 'speciation',
    title: 'New species',
    chapter: 'Evolution',
    summary: 'When a family line’s DNA drifts far enough from its relatives, it becomes a new species.',
    body: [
      'Biologists usually say two populations are different species when they can no longer interbreed. In LifeSim, a new species is declared when a lineage’s DNA has drifted past a threshold from its parent species and at least a few members are alive at once. From then on its members only mate with each other.',
      'Every species gets a Latin name. The second word describes what changed: *velox* means fast, *magnus* big, *oculatus* sharp-eyed.',
    ],
    tryIt: 'Open the Species tab under the charts to see the tree of life grow.',
    related: ['extinction', 'common-ancestor', 'crossover'],
  },
  {
    key: 'extinction',
    title: 'Extinction',
    chapter: 'Evolution',
    summary: 'When the last member of a species dies, its unique genes are gone for good.',
    body: [
      'More than 99% of all species that ever lived on Earth are extinct. Extinction is a normal part of evolution: species are outcompeted, eaten or caught out by a changing world.',
      'Extinct species stay in the tree of life as greyed-out branches.',
    ],
    related: ['speciation', 'mass-extinction'],
  },
  {
    key: 'mass-extinction',
    title: 'Mass extinction',
    chapter: 'Evolution',
    summary: 'Sudden catastrophes wipe out huge numbers at once, and the survivors inherit an empty world.',
    body: [
      '66 million years ago an asteroid ended the age of dinosaurs. The small mammals that survived spread into the empty world and diversified, eventually into us.',
      'The Meteor tool wipes out everything in its blast circle and dims the plants for a while. Survivors, often just lucky, become the ancestors of everything that follows. That is a population bottleneck.',
    ],
    tryIt: 'Strike a meteor on the densest area, then watch which species recovers first.',
    related: ['extinction', 'drift'],
  },
  {
    key: 'common-ancestor',
    title: 'The common ancestor',
    chapter: 'Evolution',
    summary: 'Go back far enough and every creature alive shares a single ancestor.',
    body: [
      'Trace any two creatures’ family lines backward (mother to mother) and they eventually meet. Do it for the whole population and you find the **most recent common ancestor** of everyone alive. In humans, the matching idea is called "Mitochondrial Eve".',
      'LifeSim tracks this automatically. As old family lines die out, the common ancestor keeps moving forward in time.',
    ],
    related: ['heredity', 'speciation'],
  },
  {
    key: 'changing-environment',
    title: 'Changing environments',
    chapter: 'Evolution',
    summary: 'When the world changes faster than generations turn over, learning beats instinct.',
    body: [
      'Instincts are great when the world stays the same: they are free, instant and never wrong about familiar things. But evolution is slow. If the rules change every few minutes, a population cannot re-evolve its instincts fast enough.',
      'That is when learning pays off. A learner pays a small energy cost but can figure out the new rules within one lifetime. The Poison berries world puts this to the test: the berries switch between tasty and toxic every minute.',
    ],
    tryIt: 'Run Poison berries at 4× and compare the two species on the population chart.',
    related: ['learning', 'selection'],
  },
  {
    key: 'arms-race',
    title: 'Evolutionary arms races',
    chapter: 'Evolution',
    summary: 'Hunters and prey keep pushing each other to evolve: faster prey select for faster hunters, and so on.',
    body: [
      'When prey evolve to flee better, only the best hunters still eat, so hunters improve too, which again favours better-escaping prey. Biologists call this the **Red Queen** effect, after the Alice in Wonderland character who must keep running just to stay in place.',
      'Look for it in the Traits chart: muscle and eyesight often creep upward when hunters are around.',
    ],
    related: ['predator-prey', 'selection'],
  },

  // ------------------------------------------------------------------ Ecology
  {
    key: 'food-chain',
    title: 'Food chains',
    chapter: 'Ecology',
    summary: 'Energy flows from plants to grazers to hunters, and most of it is lost at every step.',
    body: [
      'Plants capture energy. Grazers eat plants, hunters eat grazers, and scavengers eat the remains. At every step most of the energy is burned in living (moving, thinking, staying warm), which is why there are always far fewer hunters than grazers.',
      'Diet is a gene. Specialists digest their own food very well; generalists can eat both but digest neither well.',
    ],
    related: ['predator-prey', 'carrying-capacity', 'metabolism'],
  },
  {
    key: 'carrying-capacity',
    title: 'Carrying capacity',
    chapter: 'Ecology',
    summary: 'A world can only feed so many. Populations overshoot, crash and settle around what the food supply allows.',
    body: [
      'With plenty of food a population grows fast, until the creatures eat food faster than it grows back. Then many starve and the population falls. The level it hovers around is the **carrying capacity**.',
      'Change the plant growth in Lab controls and watch the carrying capacity follow.',
    ],
    tryIt: 'Halve the plant growth rate and watch the population chart find a new level.',
    related: ['seasons', 'predator-prey'],
  },
  {
    key: 'predator-prey',
    title: 'Predator–prey cycles',
    chapter: 'Ecology',
    summary: 'More prey → hunters thrive → prey decline → hunters starve → prey recover… and around again.',
    body: [
      'In the 1920s, Alfred Lotka and Vito Volterra showed mathematically that hunters and prey should rise and fall in linked cycles, with the hunters lagging behind. Fur-trapping records of lynx and snowshoe hares in Canada show exactly this pattern over 100 years.',
      'The Population chart colours hunters red. Look for their peaks trailing behind the grazers’ peaks.',
    ],
    tryIt: 'Start Predators & prey and watch the population chart for a few cycles.',
    related: ['food-chain', 'arms-race'],
  },
  {
    key: 'seasons',
    title: 'Seasons',
    chapter: 'Ecology',
    summary: 'Plants grow faster in summer and slower in winter. Hard times make natural selection stronger.',
    body: [
      'When food is plentiful almost everyone survives and selection is weak. In winter food is scarce and only the creatures best at finding it make it through. Much of evolution happens in hard times.',
      'You can make seasons milder or harsher in Lab controls.',
    ],
    related: ['carrying-capacity', 'selection'],
  },
  {
    key: 'metabolism',
    title: 'Metabolism & body size',
    chapter: 'Ecology',
    summary: 'Big bodies burn more energy in total but less per gram. Every action has an energy price.',
    body: [
      'In real animals, metabolic rate grows with body mass to the power ¾ (**Kleiber’s law**). An elephant burns more energy than a mouse, but far less per kilogram. LifeSim uses the same rule.',
      'Every second a creature pays for its body, its swimming, its eyes, its brain and its learning. Being big means storing more energy, living longer and biting harder, but also eating more and turning slowly. There is no single best size, only trade-offs.',
    ],
    related: ['brain-cost', 'life-history'],
  },
  {
    key: 'life-history',
    title: 'Live fast or slow',
    chapter: 'Ecology',
    summary: 'Many small babies or a few big ones? Breed early or wait? Evolution tunes these life-history strategies.',
    body: [
      'Mice breed early and have many small, cheap babies (an **r-strategy**). Elephants breed late and invest heavily in a few big babies (a **K-strategy**). Which wins depends on the environment.',
      'Three LifeSim genes control this: Growth time (fast growers breed sooner but die younger), Breeding threshold (how full the energy tank must be before having a baby) and Baby size (how much energy each baby gets).',
    ],
    related: ['fitness', 'metabolism'],
  },
  {
    key: 'life-support',
    title: 'The lab’s life support',
    chapter: 'Ecology',
    summary: 'If the population gets too small, the lab revives successful genomes from its gene bank, so the experiment keeps going.',
    body: [
      'Real evolution can end in total extinction. To keep the experiment running, the lab keeps a **gene bank** of the most successful genomes it has seen. When numbers fall below a minimum, it releases a mutated copy of one.',
      'You can turn life support off in Lab controls for a no-safety-net experiment.',
    ],
    related: ['extinction'],
  },
];

export function getEntry(key: string): GuideEntry | undefined {
  return GUIDE.find((g) => g.key === key);
}
