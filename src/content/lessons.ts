import type { SimController } from '../app/controller.ts';
import { ui } from '../app/ui.ts';
import { G } from '../sim/genome.ts';
import type { WorldConfig } from '../sim/world.ts';

/**
 * The Academy: short guided lessons. Each step can spotlight part of the
 * screen and either wait for the learner to do something (`done`) or show a
 * Next button. Lessons always start from a fresh world so they behave the
 * same for everyone.
 */
export interface LessonStep {
  title: string;
  body: string;
  /** CSS selector of the element to spotlight. */
  target?: string;
  /** Completes the step automatically when true. */
  done?: (ctl: SimController) => boolean;
  /** Text for the button when there is no automatic check. */
  cta?: string;
  /** Shown under the text while waiting for `done`. */
  hint?: string;
  onEnter?: (ctl: SimController) => void;
  progress?: (ctl: SimController) => { value: number; max: number; label: string };
}

export interface Lesson {
  id: string;
  title: string;
  subtitle: string;
  minutes: number;
  scenario: string;
  overrides?: Partial<WorldConfig>;
  steps: LessonStep[];
  takeaways: string[];
}

const selected = (ctl: SimController) => ctl.selected() !== undefined;

export const LESSONS: Lesson[] = [
  {
    id: 'meet',
    title: 'Meet the creatures',
    subtitle: 'Bodies, senses and a brain you can watch think',
    minutes: 4,
    scenario: 'ecosystem',
    overrides: { seed: 'academy-meet' },
    steps: [
      {
        title: 'Welcome to the lab',
        body: 'This petri dish is alive. Every glowing cell is a creature with a **body built from DNA** and a **brain made of neurons**. Green specks are plants, violet ones are berries, red ones are meat.',
        cta: 'Let’s look closer',
        onEnter: (ctl) => {
          ctl.setSpeed(1);
          ctl.setTool('inspect');
          ctl.select(null);
        },
      },
      {
        title: 'Pick a creature',
        body: '**Click any creature** in the dish to select it. Scroll to zoom in if they look small.',
        done: selected,
        hint: 'Click directly on a glowing cell.',
      },
      {
        title: 'What it sees',
        body: 'The cyan cone is its **field of view**. The coloured lines point at the nearest plant, berry, meat and creature it can see. Those directions and distances are the only information its brain gets.',
        cta: 'Next',
      },
      {
        title: 'Its brain, live',
        body: 'On the right is its brain, working in real time: **senses** on the left, **hidden neurons** in the middle, **actions** on the right. Bright neurons are active, and the moving dots are signals travelling along connections. Hover anything to see what it does.',
        target: '[data-tour="side-panel"]',
        onEnter: () => ui.set({ inspectorTab: 'brain', panelOpen: true }),
        cta: 'Next',
      },
      {
        title: 'What it does',
        body: 'Below the brain, LifeSim tests the network with made-up situations and writes down how it reacts. Scroll down in the panel and read your creature’s instincts.',
        target: '[data-tour="instincts"]',
        cta: 'Next',
      },
      {
        title: 'Ride along',
        body: 'Press the **follow** button (or the F key) to keep the camera on your creature.',
        target: '[data-tour="follow"]',
        done: (ctl) => ctl.follow,
        hint: 'The crosshair-target button at the top of the panel.',
      },
      {
        title: 'Where it came from',
        body: 'Open the **DNA** tab. These numbers built its body and wired its brain. Its children will inherit them, with a few random mutations.',
        target: '[data-tour="tab-dna"]',
        done: () => ui.get().inspectorTab === 'dna',
      },
    ],
    takeaways: [
      'Each creature has a body built from DNA and a brain made of neurons.',
      'The brain turns what it sees into what it does, 30 times a second.',
      'You can inspect any creature’s senses, brain, instincts and DNA.',
    ],
  },
  {
    id: 'neuron',
    title: 'How a neuron thinks',
    subtitle: 'Weights, biases and brain surgery',
    minutes: 5,
    scenario: 'ecosystem',
    overrides: { seed: 'academy-neuron' },
    steps: [
      {
        title: 'One neuron, one decision',
        body: 'Let’s start with a creature that has a **single neuron**. Open the Neuron Lab and complete its challenge.',
        cta: 'Open the Neuron Lab',
        onEnter: (ctl) => ctl.setSpeed(1),
      },
      {
        title: 'Neuron Lab',
        body: 'Adjust the **weight** so the creature turns toward food. When it eats 5 plants in 20 seconds, you’re done.',
        onEnter: () => ui.set({ modal: 'neuron' }),
        done: () => ui.get().discovered.includes('neuron-lab') && ui.get().modal !== 'neuron',
        hint: 'Complete the challenge, then close the Neuron Lab.',
      },
      {
        title: 'From one neuron to a brain',
        body: 'Real creatures have 14 senses, up to 12 hidden neurons and 3 actions, so several hundred weights. **Select a creature** to see them.',
        done: selected,
        onEnter: () => ui.set({ inspectorTab: 'brain', panelOpen: true }),
      },
      {
        title: 'Brain surgery',
        body: 'Switch on **Surgery**, then click a thick line ending at **Turn**, ideally the dashed reflex link from **Plant direction**. Press **Flip** to reverse it.',
        target: '[data-tour="surgery"]',
        done: () => ui.get().discovered.includes('surgeon'),
        hint: 'Dashed lines are reflexes that skip the hidden layer.',
      },
      {
        title: 'Watch your patient',
        body: 'Follow your creature for a while. With the connection flipped, it may now turn **away** from plants. The body is unchanged: only one number in its brain is different. Every behaviour lives in the weights.',
        cta: 'Got it',
      },
    ],
    takeaways: [
      'A neuron multiplies inputs by weights, adds a bias and squashes the total.',
      'Positive weights excite, negative weights inhibit.',
      'Changing a single weight can flip a behaviour.',
    ],
  },
  {
    id: 'evolution',
    title: 'Evolution from scratch',
    subtitle: 'Watch random brains get smart',
    minutes: 6,
    scenario: 'soup',
    overrides: { seed: 'academy-soup' },
    steps: [
      {
        title: 'Random brains',
        body: 'Every creature here was born with a brain wired **at random**. Most swim straight past food or spin in circles. Select a few and look at their instincts.',
        cta: 'Next',
        onEnter: (ctl) => ctl.setSpeed(1),
      },
      {
        title: 'Speed up time',
        body: 'Evolution needs generations. Set the speed to **8×** or faster.',
        target: '[data-tour="speed"]',
        done: (ctl) => ctl.speed >= 8,
      },
      {
        title: 'Measure the brains',
        body: 'This chart copies a plant-eater’s brain into the **same test arena** again and again and counts how many plants it finds per minute. It measures the brain, not luck.',
        target: '[data-tour="dock"]',
        onEnter: () => ui.set({ dockOpen: true, dockTab: 'skill' }),
        cta: 'Next',
      },
      {
        title: 'Run 15 generations',
        body: 'Let natural selection work. Keep an eye on the skill chart while you wait.',
        done: (ctl) => ctl.world.totals.maxGeneration >= 15,
        progress: (ctl) => ({ value: ctl.world.totals.maxGeneration, max: 15, label: 'generation' }),
      },
      {
        title: 'What happened?',
        body: 'Nobody designed these brains. Creatures whose random wiring happened to steer toward food had more babies, and their wiring spread. Repeat for generations and you get skilled foragers. That is **natural selection**, applied to brains: **neuroevolution**.',
        cta: 'Finish',
      },
    ],
    takeaways: [
      'Variation (mutation) + heredity + differential reproduction = evolution.',
      'No goal is programmed: food simply rewards better brains with more babies.',
      'The skill test shows brains really improve, generation after generation.',
    ],
  },
  {
    id: 'genes',
    title: 'Genes & family trees',
    subtitle: 'Inheritance, mutation and the common ancestor',
    minutes: 5,
    scenario: 'ecosystem',
    overrides: { seed: 'academy-genes' },
    steps: [
      {
        title: 'Speed things up',
        body: 'We need a few generations of family history. Set the speed to **8×** for a moment.',
        target: '[data-tour="speed"]',
        done: (ctl) => ctl.speed >= 8,
      },
      {
        title: 'Wait for generation 6',
        body: 'Families are growing…',
        done: (ctl) => ctl.world.totals.maxGeneration >= 6,
        progress: (ctl) => ({ value: ctl.world.totals.maxGeneration, max: 6, label: 'generation' }),
      },
      {
        title: 'Pick a young creature',
        body: 'Slow down to 1× and **select a creature**. Babies (small ones) work best.',
        done: (ctl) => {
          const c = ctl.selected();
          return !!c && c.parentId !== 0;
        },
        hint: 'Choose one that was born in the dish, not a founder.',
        onEnter: (ctl) => ctl.setSpeed(1),
      },
      {
        title: 'Read its DNA',
        body: 'Open the **DNA** tab. Each gene is marked by where it came from: mother, father, or a brand-new **mutation**.',
        target: '[data-tour="tab-dna"]',
        done: () => ui.get().inspectorTab === 'dna',
      },
      {
        title: 'Climb the family tree',
        body: 'Now open the **Family** tab and look at its ancestors, back to the founders. A star marks the **common ancestor** of everyone alive, if it’s in this line.',
        target: '[data-tour="tab-family"]',
        done: () => ui.get().inspectorTab === 'family',
      },
      {
        title: 'Turn the mutation dial',
        body: 'Open **Lab controls** (flask icon). Mutation strength sets how sloppily DNA is copied. At 0, evolution stops; very high values scramble everything.',
        target: '[data-tour="lab-btn"]',
        done: () => ui.get().modal === 'lab',
      },
    ],
    takeaways: [
      'Children inherit DNA from one or two parents.',
      'Mutations are random copying errors, the raw material of evolution.',
      'Trace any family far enough back and everyone shares an ancestor.',
    ],
  },
  {
    id: 'predators',
    title: 'Predators & prey',
    subtitle: 'Food chains and population cycles',
    minutes: 6,
    scenario: 'predators',
    overrides: { seed: 'academy-predators' },
    steps: [
      {
        title: 'Hunters in the dish',
        body: 'Creatures with **red mandibles and spikes** are hunters: their diet gene lets them digest meat. They chase and bite other creatures.',
        cta: 'Next',
        onEnter: (ctl) => ctl.setSpeed(1),
      },
      {
        title: 'Find a hunter',
        body: '**Select a hunter** and read its instincts in the Brain tab.',
        done: (ctl) => (ctl.selected()?.traits.diet ?? 0) > 0.6,
        hint: 'Look for spiky creatures with red jaws. The minimap shows hunters in red.',
        onEnter: () => ui.set({ inspectorTab: 'brain', panelOpen: true }),
      },
      {
        title: 'Watch the populations',
        body: 'Switch the population chart to **Diet** and run at **8×**. Grazers are green, hunters red.',
        target: '[data-tour="dock"]',
        onEnter: () => ui.set({ dockOpen: true, dockTab: 'population' }),
        done: (ctl) => ctl.speed >= 8,
      },
      {
        title: 'Ride the cycle',
        body: 'More prey feed more hunters. Then hunters eat too many and starve, and prey recover. Watch for the **hunter peaks trailing behind the grazer peaks**.',
        done: (ctl) => ctl.world.time >= 360,
        progress: (ctl) => ({ value: Math.floor(ctl.world.time / 60), max: 6, label: 'minutes simulated' }),
      },
    ],
    takeaways: [
      'Energy flows up the food chain: plants → grazers → hunters.',
      'Predator and prey numbers rise and fall in linked cycles (Lotka–Volterra).',
      'Each side pushes the other to evolve: an arms race.',
    ],
  },
  {
    id: 'learning',
    title: 'Learning to survive',
    subtitle: 'When the world changes, learners win',
    minutes: 6,
    scenario: 'poison',
    overrides: { seed: 'academy-poison' },
    steps: [
      {
        title: 'Two species, one difference',
        body: 'Both species are born **loving berries**. The blue one, *Baccivora docilis*, can **learn** from experience. The orange one, *Baccivora rigida*, lives on instinct alone. Every minute, the berries switch between tasty and poisonous.',
        cta: 'Next',
        onEnter: (ctl) => ctl.setSpeed(2),
      },
      {
        title: 'Select a learner',
        body: 'Select a **blue** creature and stay on its Brain tab.',
        done: (ctl) => (ctl.selected()?.genome.body[G.plasticity] ?? 0) > 0.4,
        onEnter: () => ui.set({ inspectorTab: 'brain', panelOpen: true }),
        hint: 'Use the species list on the right to highlight the blue species.',
      },
      {
        title: 'Wait for the poison',
        body: 'Keep watching your learner. When the berries turn toxic (see the skull at the top), its first bite will hurt.',
        done: (ctl) => ctl.world.berriesToxic,
        target: '[data-tour="vitals"]',
      },
      {
        title: 'Watch its taste change',
        body: 'Scroll to **Learned tastes**. After a poisonous berry, its liking for berries drops; below zero, its brain’s berry wiring flips and it avoids them.',
        target: '[data-tour="tastes"]',
        cta: 'Next',
      },
      {
        title: 'Who wins?',
        body: 'Run at **8×** and watch the population chart. Same bodies, same instincts: the only difference is the ability to learn.',
        onEnter: () => ui.set({ dockOpen: true, dockTab: 'population' }),
        done: (ctl) => ctl.world.time >= 480,
        progress: (ctl) => ({ value: Math.floor(ctl.world.time / 60), max: 8, label: 'minutes simulated' }),
      },
    ],
    takeaways: [
      'Learning changes behaviour within a lifetime; evolution needs generations.',
      'When the world changes fast, the ability to learn is a big advantage.',
      'Learned tastes are not inherited: each child must learn for itself.',
    ],
  },
];

export function getLesson(id: string | null): Lesson | undefined {
  return LESSONS.find((l) => l.id === id);
}
