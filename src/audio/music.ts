import { createStore } from '../app/store.ts';
import { bellMidi, chordMidi, midiToHz, MOODS, type Scene } from './score.ts';

/**
 * Generative ambient music, synthesised live with the Web Audio API: there are
 * no audio files to download. Three layers:
 *
 *   pad    slow, overlapping chords that set the mood
 *   bells  sparse random notes from a pentatonic scale, drenched in reverb
 *   pulse  a quiet repeating pluck, only while the player steers a creature
 *
 * The scene (see score.ts) chooses the scale, chords, brightness and density.
 * Chords fade over several seconds, so a scene change is a slow crossfade
 * rather than a cut.
 *
 * Browsers only allow sound after a click or key press, so nothing starts
 * until the first one.
 */
const STORAGE_KEY = 'lifesim.music.v1';
const VOLUME = 0.4;

function loadOn(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) !== 'off';
  } catch {
    return true;
  }
}

export const music = createStore<{ on: boolean }>({ on: loadOn() });

interface PadVoice {
  gain: GainNode;
  oscs: OscillatorNode[];
}

interface Rig {
  ctx: AudioContext;
  master: GainNode;
  padBus: GainNode;
  padFilter: BiquadFilterNode;
  bellBus: GainNode;
}

let rig: Rig | null = null;
let timer = 0;
let scene: Scene = { mood: 'home', motion: false, hushed: false };
let pad: PadVoice[] = [];
let chordIndex = 0;
let chord: number[] = [];
let nextChordAt = 0;
let nextBellAt = 0;
let nextPulseAt = 0;
let pulseStep = 0;

/** A few seconds of decaying stereo noise: a cheap, soft hall reverb. */
function impulse(ctx: AudioContext, seconds: number): AudioBuffer {
  const len = Math.floor(ctx.sampleRate * seconds);
  const buf = ctx.createBuffer(2, len, ctx.sampleRate);
  for (let ch = 0; ch < 2; ch++) {
    const d = buf.getChannelData(ch);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len) ** 3;
  }
  return buf;
}

function build(): Rig | null {
  const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctor) return null;
  const ctx = new Ctor();

  const master = ctx.createGain();
  master.gain.value = 0;
  // A limiter in all but name, so overlapping notes can never clip.
  const comp = ctx.createDynamicsCompressor();
  master.connect(comp).connect(ctx.destination);

  const reverb = ctx.createConvolver();
  reverb.buffer = impulse(ctx, 4);
  reverb.connect(master);

  const padBus = ctx.createGain();
  const padFilter = ctx.createBiquadFilter();
  padFilter.type = 'lowpass';
  padFilter.Q.value = 0.4;
  padFilter.frequency.value = MOODS[scene.mood].bright;
  const padSend = ctx.createGain();
  padSend.gain.value = 0.6;
  padBus.connect(padFilter);
  padFilter.connect(master);
  padFilter.connect(padSend).connect(reverb);

  const bellBus = ctx.createGain();
  const bellSend = ctx.createGain();
  bellSend.gain.value = 0.9;
  bellBus.connect(master);
  bellBus.connect(bellSend).connect(reverb);

  return { ctx, master, padBus, padFilter, bellBus };
}

function releasePad(t: number): void {
  for (const v of pad) {
    v.gain.gain.cancelScheduledValues(t);
    v.gain.gain.setTargetAtTime(0, t, 1.8);
    for (const o of v.oscs) o.stop(t + 12);
  }
  pad = [];
}

function playChord(r: Rig, t: number): void {
  const m = MOODS[scene.mood];
  releasePad(t);
  chord = chordMidi(m, chordIndex++);
  // The chord itself, plus its root an octave down as a plain sine for warmth.
  const notes = [{ midi: chord[0] - 12, type: 'sine' as OscillatorType, level: 0.1 }, ...chord.map((midi) => ({ midi, type: 'triangle' as OscillatorType, level: 0.05 }))];
  for (const n of notes) {
    const gain = r.ctx.createGain();
    gain.gain.setValueAtTime(0, t);
    gain.gain.linearRampToValueAtTime(n.level, t + 4);
    gain.connect(r.padBus);
    // Two slightly detuned oscillators per note beat slowly against each other.
    const oscs = [-5, 5].map((cents) => {
      const o = r.ctx.createOscillator();
      o.type = n.type;
      o.frequency.value = midiToHz(n.midi);
      o.detune.value = cents + (Math.random() * 4 - 2);
      o.connect(gain);
      o.start(t);
      return o;
    });
    pad.push({ gain, oscs });
  }
}

function pluck(r: Rig, t: number, midi: number, level: number, decay: number): void {
  const gain = r.ctx.createGain();
  gain.gain.setValueAtTime(0, t);
  gain.gain.linearRampToValueAtTime(level, t + 0.012);
  gain.gain.exponentialRampToValueAtTime(0.0001, t + decay);
  const pan = r.ctx.createStereoPanner();
  pan.pan.value = Math.random() * 1.4 - 0.7;
  gain.connect(pan).connect(r.bellBus);
  // A fundamental and a quiet octave above it give a soft, glassy tone.
  for (const [mult, amp] of [[1, 1], [2, 0.25]]) {
    const o = r.ctx.createOscillator();
    const g = r.ctx.createGain();
    g.gain.value = amp;
    o.frequency.value = midiToHz(midi) * mult;
    o.connect(g).connect(gain);
    o.start(t);
    o.stop(t + decay + 0.1);
  }
}

function tick(): void {
  const r = rig;
  if (!r || r.ctx.state !== 'running') return;
  const t = r.ctx.currentTime;
  const m = MOODS[scene.mood];

  r.padFilter.frequency.setTargetAtTime(m.bright * (scene.hushed ? 0.45 : 1), t, 2.5);

  if (t >= nextChordAt) {
    playChord(r, t + 0.05);
    nextChordAt = t + m.chordLen;
  }
  if (t >= nextBellAt) {
    pluck(r, t + 0.05, bellMidi(m, Math.random()), 0.03 + Math.random() * 0.03, 3 + Math.random() * 2);
    nextBellAt = t + m.bellEvery * (scene.hushed ? 2 : 1) * (0.4 + Math.random() * 1.2);
  }
  if (scene.motion && chord.length && t >= nextPulseAt) {
    pluck(r, t + 0.05, chord[pulseStep++ % chord.length] + 12, 0.018, 1.2);
    nextPulseAt = Math.max(nextPulseAt + 0.8, t);
  }
}

/** Fade in (creating the audio graph on first use) or fade out and stop. */
function sync(): void {
  const want = music.get().on && !document.hidden;
  if (want) {
    rig ??= build();
    if (!rig) return;
    const { ctx, master } = rig;
    void ctx.resume();
    master.gain.cancelScheduledValues(ctx.currentTime);
    master.gain.setTargetAtTime(VOLUME, ctx.currentTime, 0.8);
    if (!timer) timer = window.setInterval(tick, 200);
  } else if (rig) {
    const { ctx, master } = rig;
    master.gain.cancelScheduledValues(ctx.currentTime);
    master.gain.setTargetAtTime(0, ctx.currentTime, 0.25);
    window.clearInterval(timer);
    timer = 0;
    window.setTimeout(() => {
      if (!timer) void ctx.suspend();
    }, 1200);
  }
}

export function setScene(next: Scene): void {
  const moodChanged = next.mood !== scene.mood;
  scene = next;
  if (moodChanged && rig) {
    // Bring the new mood's first chord in now instead of waiting out the old one.
    chordIndex = 0;
    nextChordAt = 0;
    nextBellAt = Math.min(nextBellAt, rig.ctx.currentTime + 1.5);
  }
}

export function toggleMusic(): void {
  const on = !music.get().on;
  music.set({ on });
  try {
    localStorage.setItem(STORAGE_KEY, on ? 'on' : 'off');
  } catch {
    /* storage unavailable: the choice simply isn't remembered */
  }
  // This runs inside a click, so it is allowed to start audio.
  sync();
}

/** Start the music on the visitor's first click or key press. Returns a cleanup function. */
export function armMusic(): () => void {
  const first = () => {
    window.removeEventListener('pointerdown', first);
    window.removeEventListener('keydown', first);
    sync();
  };
  const onVis = () => {
    if (rig) sync();
  };
  window.addEventListener('pointerdown', first);
  window.addEventListener('keydown', first);
  document.addEventListener('visibilitychange', onVis);
  return () => {
    window.removeEventListener('pointerdown', first);
    window.removeEventListener('keydown', first);
    document.removeEventListener('visibilitychange', onVis);
  };
}
