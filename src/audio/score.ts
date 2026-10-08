import type { SeasonName } from '../sim/world.ts';

/**
 * What the music plays, kept apart from how it is played (music.ts) so it can
 * be reasoned about and tested without a browser.
 */
export type Mood = 'home' | SeasonName | 'design' | 'elegy';

export interface MoodDef {
  /** MIDI note of the scale root (the pad sits here, bells two octaves up). */
  root: number;
  /** Semitone offsets of the seven scale notes. */
  scale: number[];
  /** Chord loop, as scale degrees. Degrees past 6 continue into the next octave. */
  chords: number[][];
  /** Scale degrees the bells may play: a pentatonic subset, so any two sound fine together. */
  bells: number[];
  /** Octaves above the root for the bells. */
  bellOctave: number;
  /** Mean seconds between bell notes. */
  bellEvery: number;
  /** Pad filter cutoff in Hz: higher is brighter. */
  bright: number;
  /** Seconds each chord is held. */
  chordLen: number;
}

const LYDIAN = [0, 2, 4, 6, 7, 9, 11];
const MAJOR = [0, 2, 4, 5, 7, 9, 11];
const DORIAN = [0, 2, 3, 5, 7, 9, 10];
const MINOR = [0, 2, 3, 5, 7, 8, 10];

const MAJOR_BELLS = [0, 1, 2, 4, 5];
const MINOR_BELLS = [0, 2, 3, 4, 6];

/** A seventh chord stacked in thirds on a scale degree. */
const seventh = (d: number) => [d, d + 2, d + 4, d + 6];
/** Root, fifth and ninth: open and unresolved. */
const open = (d: number) => [d, d + 4, d + 8];

export const MOODS: Record<Mood, MoodDef> = {
  // Start screen: floating, in no hurry to go anywhere.
  home: { root: 50, scale: LYDIAN, chords: [seventh(0), seventh(1), seventh(0), seventh(4)], bells: MAJOR_BELLS, bellOctave: 2, bellEvery: 4, bright: 1500, chordLen: 16 },
  // Things start growing: clear and hopeful.
  spring: { root: 55, scale: MAJOR, chords: [open(0), seventh(3), seventh(5), seventh(3)], bells: MAJOR_BELLS, bellOctave: 2, bellEvery: 3, bright: 1900, chordLen: 13 },
  // Plenty of food, plenty of life: the warmest and busiest.
  summer: { root: 53, scale: LYDIAN, chords: [seventh(0), seventh(1), seventh(5), seventh(4)], bells: MAJOR_BELLS, bellOctave: 2, bellEvery: 2.2, bright: 2400, chordLen: 12 },
  // Growth slows: mellow and a little wistful.
  autumn: { root: 45, scale: DORIAN, chords: [seventh(0), seventh(3), seventh(0), seventh(6)], bells: MINOR_BELLS, bellOctave: 2, bellEvery: 4.5, bright: 1200, chordLen: 15 },
  // Lean times: dark, still, only the occasional note.
  winter: { root: 52, scale: MINOR, chords: [seventh(0), seventh(5), seventh(2), seventh(5)], bells: MINOR_BELLS, bellOctave: 2, bellEvery: 6.5, bright: 800, chordLen: 18 },
  // The creature editor: light and curious.
  design: { root: 48, scale: MAJOR, chords: [open(0), seventh(1), seventh(3), seventh(1)], bells: MAJOR_BELLS, bellOctave: 2, bellEvery: 1.7, bright: 2000, chordLen: 10 },
  // Your creature died, or the dish is empty.
  elegy: { root: 50, scale: MINOR, chords: [open(0), seventh(5)], bells: MINOR_BELLS, bellOctave: 2, bellEvery: 9, bright: 600, chordLen: 20 },
};

export interface Scene {
  mood: Mood;
  /** A soft pulse under the pad, for when the player is steering a creature. */
  motion: boolean;
  /** The simulation is paused: the music stays, but muffled and sparser. */
  hushed: boolean;
}

export interface SceneInput {
  screen: 'home' | 'lab' | 'adventure';
  advPhase: 'off' | 'create' | 'play' | 'dead' | 'extinct';
  /** The creature editor is open. */
  editing: boolean;
  season: SeasonName;
  population: number;
  paused: boolean;
}

export function sceneFor(i: SceneInput): Scene {
  if (i.screen === 'home') return { mood: 'home', motion: false, hushed: false };
  if (i.screen === 'adventure') {
    if (i.advPhase === 'dead' || i.advPhase === 'extinct') return { mood: 'elegy', motion: false, hushed: false };
    if (i.editing || i.advPhase !== 'play') return { mood: 'design', motion: false, hushed: false };
    return { mood: i.season, motion: !i.paused, hushed: i.paused };
  }
  if (i.population === 0) return { mood: 'elegy', motion: false, hushed: false };
  return { mood: i.season, motion: false, hushed: i.paused };
}

/** MIDI note of a scale degree; degrees past the end of the scale climb octaves. */
export function degreeToMidi(m: MoodDef, degree: number): number {
  const n = m.scale.length;
  return m.root + 12 * Math.floor(degree / n) + m.scale[((degree % n) + n) % n];
}

export function midiToHz(midi: number): number {
  return 440 * 2 ** ((midi - 69) / 12);
}

export function chordMidi(m: MoodDef, index: number): number[] {
  return m.chords[index % m.chords.length].map((d) => degreeToMidi(m, d));
}

/** Sine bells turn piercing above about A6, so higher picks fold down an octave. */
const BELL_TOP = 93;

/** A bell note: `pick` in [0, 1) chooses among the mood's bell degrees over two octaves. */
export function bellMidi(m: MoodDef, pick: number): number {
  const i = Math.floor(pick * m.bells.length * 2);
  const octave = m.bellOctave + (i >= m.bells.length ? 1 : 0);
  let midi = degreeToMidi(m, m.bells[i % m.bells.length]) + 12 * octave;
  while (midi > BELL_TOP) midi -= 12;
  return midi;
}
