import { EP_PER_ENERGY, EP_PER_KILL, GOALS, type GoalProgress } from '../content/adventure.ts';
import type { Creature, DeathCause } from '../sim/creature.ts';
import type { Genome } from '../sim/genome.ts';
import { PAL } from '../render/palette.ts';
import type { SimController } from './controller.ts';
import { createStore } from './store.ts';
import { pushLog, pushToast, ui } from './ui.ts';

/**
 * Adventure mode: the player designs a creature, steers it around the dish,
 * eats, lays eggs and spends evolution points to redesign each new
 * generation. Wild siblings evolve on their own; together they form the
 * player's bloodline.
 */

export type AdventurePhase = 'off' | 'create' | 'play' | 'dead' | 'extinct';

export interface AdventureState {
  phase: AdventurePhase;
  /** Which editor is open, if any. */
  editor: null | 'create' | 'evolve';
  /** Evolution points available to spend. */
  ep: number;
  /** Evolution points earned in total. */
  earned: number;
  goalsDone: string[];
  progress: GoalProgress;
  /** Founding name, reused (with a numeral) for every generation you play. */
  dynasty: string;
  founderSpeciesId: number;
  startedAt: number;
  /** Largest bloodline ever alive at once. */
  peakAlive: number;
  lost: { name: string; cause: DeathCause | null; generation: number } | null;
  autopilot: boolean;
  /** Controls hint (hidden once the player has moved). */
  showControls: boolean;
}

const EMPTY_PROGRESS: GoalProgress = { meals: 0, grown: false, eggsLaid: 0, generation: 0, alive: 0, survived: 0, kills: 0, newSpecies: false };

function initial(): AdventureState {
  return {
    phase: 'off',
    editor: null,
    ep: 0,
    earned: 0,
    goalsDone: [],
    progress: { ...EMPTY_PROGRESS },
    dynasty: '',
    founderSpeciesId: -1,
    startedAt: 0,
    peakAlive: 0,
    lost: null,
    autopilot: false,
    showControls: true,
  };
}

export const adv = createStore<AdventureState>(initial());

/** Fast-changing counters live here and are copied into the store a few times per second. */
const run = {
  ep: 0,
  earned: 0,
  trackId: -1,
  lastGained: 0,
  lastKills: 0,
  lastMeals: 0,
  meals: 0,
  kills: 0,
  bestGeneration: 0,
  syncTimer: 0,
  hinted: new Set<string>(),
  biteHeld: false,
  wasPaused: false,
};

function mealsOf(c: Creature): number {
  return c.plantsEaten + c.berriesEaten + Math.floor(c.meatEaten / 20);
}

const ROMAN: [number, string][] = [
  [10, 'X'],
  [9, 'IX'],
  [5, 'V'],
  [4, 'IV'],
  [1, 'I'],
];
function roman(n: number): string {
  let s = '';
  for (const [v, r] of ROMAN) while (n >= v) ((s += r), (n -= v));
  return s;
}

/** "Bizo", "Bizo II", … "Bizo XXIII". */
export function dynastyName(base: string, generation: number): string {
  return generation === 0 ? base : `${base} ${roman(generation + 1)}`;
}

export function resetAdventure(phase: AdventurePhase = 'off'): void {
  Object.assign(run, { ep: 0, earned: 0, trackId: -1, lastGained: 0, lastKills: 0, lastMeals: 0, meals: 0, kills: 0, bestGeneration: 0, syncTimer: 0, biteHeld: false });
  run.hinted.clear();
  adv.set({ ...initial(), phase, editor: phase === 'create' ? 'create' : null });
}

function hint(id: string, title: string, body: string, ttl = 7000): void {
  if (run.hinted.has(id)) return;
  run.hinted.add(id);
  pushToast({ kind: 'lesson', title, body }, ttl);
}

// ---------------------------------------------------------------------------
// Actions
// ---------------------------------------------------------------------------

export function spawnPlayer(ctl: SimController, genome: Genome, name: string, genus: string, epithet: string): void {
  const w = ctl.world;
  const c = w.spawnPlayer(genome, name, genus, epithet);
  resetAdventure('play');
  adv.set({ dynasty: name, founderSpeciesId: c.speciesId, startedAt: w.time, phase: 'play', editor: null });
  run.bestGeneration = 0;
  focusPlayer(ctl, true);
  ctl.setPaused(false);
  pushLog({ t: w.time, kind: 'player', text: `${name} (${genus} ${epithet}) entered the dish.`, creatureId: c.id });
  const meat = c.traits.diet > 0.62;
  hint(
    'start',
    `Welcome, ${name}!`,
    meat
      ? 'You eat meat. Find red chunks, or hold Space to bite smaller creatures. Eat to grow up, then lay eggs.'
      : 'Swim into green plants to eat. Grow up, then lay eggs to evolve your next generation.',
    10000,
  );
}

function focusPlayer(ctl: SimController, zoomIn: boolean): void {
  const id = ctl.world.player?.id;
  if (id === undefined) return;
  ctl.select(id);
  ctl.follow = true;
  const r = ctl.renderer;
  const c = ctl.world.getCreature(id);
  if (zoomIn && r && c) r.centerOn(c.x, c.y, Math.max(r.target.zoom, r.fitZoom() * 4.5));
  ctl.touch();
}

export function openEvolveEditor(ctl: SimController): void {
  const r = ctl.world.playerCanBreed();
  if (!r.ready) {
    pushToast({ kind: 'warning', title: 'Not ready to lay eggs', body: r.reason }, 3500);
    return;
  }
  run.wasPaused = ctl.paused;
  ctl.setPaused(true);
  adv.set({ editor: 'evolve' });
}

export function closeEditor(ctl: SimController): void {
  const s = adv.get();
  adv.set({ editor: null });
  if (s.phase === 'play') ctl.setPaused(run.wasPaused);
}

/** Lays eggs with the designed DNA. Returns an error message, or null on success. */
export function layEggs(ctl: SimController, design: Genome, clutch: number, cost: number): string | null {
  const w = ctl.world;
  if (cost > run.ep + 1e-9) return 'Not enough evolution points.';
  const parent = w.player ? w.getCreature(w.player.id) : undefined;
  const gen = (parent?.generation ?? 0) + 1;
  const res = w.playerBreed(design, clutch, dynastyName(adv.get().dynasty, gen));
  if (!res.ok) return res.reason;
  run.ep -= cost;
  const s = adv.get();
  const progress = { ...s.progress, eggsLaid: s.progress.eggsLaid + 1 };
  adv.set({ editor: null, ep: run.ep, progress });
  const fx = ctl.renderer?.effects;
  for (const b of res.babies) fx?.add('birth', b.x, b.y, PAL.cfp, b.radius + 6);
  const ev = w.drainEvents();
  for (const h of ctl.eventHooks) h(ev, ctl);
  focusPlayer(ctl, false);
  ctl.setPaused(run.wasPaused);
  const baby = res.babies[0];
  pushLog({ t: w.time, kind: 'player', text: `${parent?.name ?? 'You'} laid ${res.babies.length} egg${res.babies.length > 1 ? 's' : ''}. You are now ${baby.name}.`, creatureId: baby.id });
  hint(
    'firstEggs',
    `You are now ${baby.name}`,
    res.babies.length > 1
      ? 'You carry the DNA you designed. Your siblings got random mutations instead, and they will live, breed and evolve on their own. Natural selection decides which design works best.'
      : 'You carry the DNA you designed. Your parent lives on without you.',
    11000,
  );
  return null;
}

export function continueAs(ctl: SimController, id: number): void {
  const w = ctl.world;
  if (!w.player || !w.getCreature(id)) return;
  w.player.id = id;
  w.player.thrust = w.player.turn = 0;
  adv.set({ phase: 'play', lost: null });
  focusPlayer(ctl, true);
  ctl.setPaused(false);
}

export function setAutopilot(ctl: SimController, on: boolean): void {
  const pl = ctl.world.player;
  if (pl) pl.autopilot = on;
  adv.set({ autopilot: on });
  if (on) hint('autopilot', 'Autopilot: your creature’s own brain is driving', 'This is what its neural network does with no help from you. Is it good at it? Natural selection is what makes it better.', 9000);
}

export function setBiteHeld(held: boolean): void {
  run.biteHeld = held;
}

// ---------------------------------------------------------------------------
// Per-frame update: input, camera, points, goals, death
// ---------------------------------------------------------------------------

const keys = new Set<string>();

function wrap(a: number): number {
  while (a > Math.PI) a -= Math.PI * 2;
  while (a < -Math.PI) a += Math.PI * 2;
  return a;
}

function update(ctl: SimController): void {
  const w = ctl.world;
  const pl = w.player;
  const s = adv.get();
  if (!pl || s.phase !== 'play') return;
  const c = w.getCreature(pl.id);
  if (!c) {
    onPlayerDeath(ctl);
    return;
  }

  // --- input
  let thrust = 0;
  let turn = 0;
  const up = keys.has('w') || keys.has('arrowup');
  const down = keys.has('s') || keys.has('arrowdown');
  const left = keys.has('a') || keys.has('arrowleft');
  const right = keys.has('d') || keys.has('arrowright');
  if (up || down || left || right) {
    thrust = up ? 1 : down ? -1 : 0;
    turn = (right ? 1 : 0) - (left ? 1 : 0);
  } else if (ctl.steering && ctl.pointerScreen && ctl.renderer) {
    const p = ctl.renderer.screenToWorld(ctl.pointerScreen.x, ctl.pointerScreen.y);
    const dx = p.x - c.x;
    const dy = p.y - c.y;
    const diff = wrap(Math.atan2(dy, dx) - c.angle);
    turn = Math.max(-1, Math.min(1, diff * 2.5));
    const d = Math.hypot(dx, dy);
    thrust = d < c.radius * 1.5 ? 0 : Math.abs(diff) > 1.4 ? 0.3 : d < c.radius * 5 ? 0.55 : 1;
  }
  pl.thrust = thrust;
  pl.turn = turn;
  pl.bite = keys.has(' ') || run.biteHeld;
  if ((thrust !== 0 || turn !== 0) && s.showControls && w.time - s.startedAt > 4) adv.set({ showControls: false });

  // --- camera
  if (ctl.selectedId !== pl.id) focusPlayer(ctl, false);
  else if (!ctl.follow) ctl.follow = true;

  // --- evolution points
  if (run.trackId !== c.id) {
    run.trackId = c.id;
    run.lastGained = c.energyGained;
    run.lastKills = c.kills;
    run.lastMeals = mealsOf(c);
  }
  const gained = c.energyGained - run.lastGained;
  const kills = c.kills - run.lastKills;
  const meals = mealsOf(c) - run.lastMeals;
  if (gained > 0 || kills > 0 || meals > 0) {
    run.lastGained = c.energyGained;
    run.lastKills = c.kills;
    run.lastMeals = mealsOf(c);
    const pts = gained * EP_PER_ENERGY + kills * EP_PER_KILL;
    run.ep += pts;
    run.earned += pts;
    run.meals += meals;
    run.kills += kills;
    if (kills > 0) hint('kill', 'Your first kill!', `+${EP_PER_KILL} evolution points. Eat the meat it left behind.`);
  }

  // --- situational hints
  if (c.energy < 0.25 * c.maxEnergy) hint('hungry', 'You are starving', 'Your energy is low. Find food fast, or you will lose health.');
  if (c.pain > 0.3) hint('pain', 'You are being bitten!', 'Swim away, or bite back (Space) if you are bigger.');
  if (c.growth >= 1 && c.energy >= 0.6 * c.maxEnergy) hint('canBreed', 'Ready to lay eggs', 'Press E (or the egg button) to evolve your next generation.', 9000);
  if (c.ageFraction > 0.8) hint('old', 'You are getting old', 'Every creature dies eventually. Lay eggs to carry on as your baby.', 9000);

  // --- slow bookkeeping
  run.syncTimer++;
  if (run.syncTimer < 15) return;
  run.syncTimer = 0;
  const alive = w.playerLineageAlive();
  for (const a of alive) if (a.generation > run.bestGeneration) run.bestGeneration = a.generation;
  const progress: GoalProgress = {
    meals: run.meals,
    grown: s.progress.grown || c.growth >= 1,
    eggsLaid: s.progress.eggsLaid,
    generation: run.bestGeneration,
    alive: alive.length,
    survived: w.time - s.startedAt,
    kills: run.kills,
    newSpecies: s.progress.newSpecies || alive.some((a) => a.speciesId !== s.founderSpeciesId),
  };
  const done = [...s.goalsDone];
  for (const g of GOALS) {
    if (done.includes(g.id) || !g.done(progress)) continue;
    done.push(g.id);
    run.ep += g.reward;
    run.earned += g.reward;
    pushToast({ kind: 'goal', title: g.title, body: `+${g.reward} evolution points` }, 5000);
    pushLog({ t: w.time, kind: 'player', text: `Goal complete: ${g.title} (+${g.reward} EP)` });
  }
  adv.set({ ep: run.ep, earned: run.earned, progress, goalsDone: done, peakAlive: Math.max(s.peakAlive, alive.length) });
}

function onPlayerDeath(ctl: SimController): void {
  const w = ctl.world;
  const pl = w.player!;
  const rec = w.records.get(pl.id);
  const alive = w.playerLineageAlive();
  adv.set({
    phase: alive.length ? 'dead' : 'extinct',
    lost: { name: rec?.name ?? 'Your creature', cause: rec?.cause ?? null, generation: rec?.generation ?? 0 },
    ep: run.ep,
    earned: run.earned,
    editor: null,
  });
  pl.thrust = pl.turn = 0;
  pl.bite = false;
  ctl.select(null);
  ctl.setPaused(true);
}

/** Wires keyboard input and the frame hook. Returns a cleanup function. */
export function attachAdventure(ctl: SimController): () => void {
  const typing = (e: KeyboardEvent) => {
    const el = e.target as HTMLElement | null;
    return !!el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable);
  };
  const onDown = (e: KeyboardEvent) => {
    if (typing(e) || e.metaKey || e.ctrlKey || e.altKey) return;
    if (ui.get().modal || adv.get().editor) return;
    const k = e.key.toLowerCase();
    if (['w', 'a', 's', 'd', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright', ' '].includes(k)) {
      e.preventDefault();
      keys.add(k);
      return;
    }
    if (adv.get().phase !== 'play') return;
    if (k === 'e') openEvolveEditor(ctl);
    else if (k === 't') setAutopilot(ctl, !adv.get().autopilot);
    else if (k === 'p' || k === 'escape') ctl.togglePause();
    else if (k === 'b') ui.set((u) => ({ panelOpen: !u.panelOpen }));
    else if (k === '+' || k === '=') ctl.zoom(1.3);
    else if (k === '-' || k === '_') ctl.zoom(1 / 1.3);
    else if (k === 'g') ui.set({ modal: 'guide', guideEntry: null });
  };
  const onUp = (e: KeyboardEvent) => keys.delete(e.key.toLowerCase());
  const onBlur = () => keys.clear();
  window.addEventListener('keydown', onDown);
  window.addEventListener('keyup', onUp);
  window.addEventListener('blur', onBlur);
  ctl.frameHooks.add(update);
  ctl.pointerMode = 'steer';
  return () => {
    window.removeEventListener('keydown', onDown);
    window.removeEventListener('keyup', onUp);
    window.removeEventListener('blur', onBlur);
    ctl.frameHooks.delete(update);
    ctl.pointerMode = 'tools';
    ctl.steering = false;
    keys.clear();
  };
}

/** Evolution points as a whole number for display. */
export function epNow(): number {
  return Math.floor(run.ep);
}
