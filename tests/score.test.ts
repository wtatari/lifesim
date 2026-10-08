import { describe, expect, it } from 'vitest';
import { bellMidi, chordMidi, degreeToMidi, midiToHz, MOODS, sceneFor, type Mood, type SceneInput } from '../src/audio/score.ts';

const base: SceneInput = { screen: 'lab', advPhase: 'off', editing: false, season: 'summer', population: 40, paused: false };

describe('Music scenes', () => {
  it('follows the season in the lab', () => {
    expect(sceneFor(base).mood).toBe('summer');
    expect(sceneFor({ ...base, season: 'winter' }).mood).toBe('winter');
  });

  it('hushes when the simulation is paused', () => {
    expect(sceneFor(base).hushed).toBe(false);
    expect(sceneFor({ ...base, paused: true }).hushed).toBe(true);
  });

  it('plays the start-screen theme whatever the background dish is doing', () => {
    expect(sceneFor({ ...base, screen: 'home', season: 'winter', paused: true })).toEqual({ mood: 'home', motion: false, hushed: false });
  });

  it('mourns an empty dish', () => {
    expect(sceneFor({ ...base, population: 0 }).mood).toBe('elegy');
  });

  it('tracks the adventure: designing, playing, dying', () => {
    const a: SceneInput = { ...base, screen: 'adventure' };
    expect(sceneFor({ ...a, advPhase: 'create', editing: true }).mood).toBe('design');
    expect(sceneFor({ ...a, advPhase: 'play' })).toEqual({ mood: 'summer', motion: true, hushed: false });
    expect(sceneFor({ ...a, advPhase: 'play', editing: true }).mood).toBe('design');
    expect(sceneFor({ ...a, advPhase: 'play', paused: true })).toEqual({ mood: 'summer', motion: false, hushed: true });
    expect(sceneFor({ ...a, advPhase: 'dead' }).mood).toBe('elegy');
    expect(sceneFor({ ...a, advPhase: 'extinct' }).mood).toBe('elegy');
  });
});

describe('Music notes', () => {
  it('converts notes to pitch', () => {
    expect(midiToHz(69)).toBe(440);
    expect(midiToHz(57)).toBeCloseTo(220);
  });

  it('wraps scale degrees into higher octaves', () => {
    const m = MOODS.spring;
    expect(degreeToMidi(m, 0)).toBe(m.root);
    expect(degreeToMidi(m, 7)).toBe(m.root + 12);
    expect(degreeToMidi(m, 8)).toBe(m.root + 12 + m.scale[1]);
  });

  it('keeps every mood in a comfortable register and in its own scale', () => {
    for (const mood of Object.keys(MOODS) as Mood[]) {
      const m = MOODS[mood];
      const inScale = (midi: number) => m.scale.includes((((midi - m.root) % 12) + 12) % 12);
      for (let i = 0; i < m.chords.length; i++) {
        const notes = chordMidi(m, i);
        expect(notes.every(inScale)).toBe(true);
        // Bass (an octave under the chord root) stays audible on small speakers; the top stays out of the bells' way.
        expect(midiToHz(notes[0] - 12)).toBeGreaterThan(50);
        expect(midiToHz(Math.max(...notes))).toBeLessThan(700);
      }
      for (let p = 0; p < 1; p += 0.05) {
        const midi = bellMidi(m, p);
        expect(inScale(midi)).toBe(true);
        expect(midiToHz(midi)).toBeLessThan(1800);
      }
    }
  });

  it('loops the chord progression', () => {
    const m = MOODS.home;
    expect(chordMidi(m, m.chords.length)).toEqual(chordMidi(m, 0));
  });
});
