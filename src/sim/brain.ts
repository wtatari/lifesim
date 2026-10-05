import {
  B1_OFFSET,
  B2_OFFSET,
  H_MAX,
  N_IN,
  N_OUT,
  W1_OFFSET,
  W2_OFFSET,
  W3_OFFSET,
} from './brainLayout.ts';
import { T } from './tuning.ts';

/** Food kinds a creature can form an opinion about. */
export const TASTE_KINDS = ['plant', 'berry', 'meat'] as const;
export type TasteKind = 0 | 1 | 2;

/**
 * A small neural network with lifetime learning.
 *
 * Thinking (forward pass), for every hidden neuron h:
 *     h = tanh( bias_h + Σ_i  weight_ih · input_i )
 * and for every output o (hidden neurons plus direct reflex links):
 *     o = tanh( bias_o + Σ_h weight_ho · h + Σ_i reflex_io · input_i )
 *
 * Learning during life ("taste learning"):
 *  Every kind of food the creature can see (plants, berries, meat) has a
 *  learned *liking*. It multiplies the strength of every connection coming
 *  out of that food's eye neurons:
 *    liking  1  → the creature reacts exactly as its genes wired it.
 *    liking  2  → the pull toward that food is twice as strong.
 *    liking  0  → it ignores that food.
 *    liking <0  → the connections flip: it now steers AWAY from that food.
 *  Each meal nudges the liking up (tasty) or down (poisonous), scaled by the
 *  creature's learning-rate gene — a reward signal much like dopamine in real
 *  brains. Learned likings are not written into the DNA: every child starts
 *  from its parents' instincts and has to learn for itself.
 */
export class Brain {
  /** Connection strengths the creature was born with (from DNA, or edited by brain surgery). */
  readonly w: Float32Array;
  /** Raw sensor values this step. */
  readonly input = new Float32Array(N_IN);
  /** Sensor values after learned likings are applied — what the network actually uses. */
  readonly perceived = new Float32Array(N_IN);
  readonly hidden = new Float32Array(H_MAX);
  readonly output = new Float32Array(N_OUT);
  /** Hidden neurons switched off by the player (brain surgery). */
  readonly lesioned = new Uint8Array(H_MAX);
  /** Learned liking for each food kind (1 = instinct). */
  readonly liking = new Float32Array([1, 1, 1]);

  hiddenCount: number;
  learningRate: number;
  /** Number of meals that changed an opinion. */
  learningEvents = 0;

  constructor(weights: Float32Array, hiddenCount: number, learningRate: number) {
    this.w = new Float32Array(weights);
    this.hiddenCount = hiddenCount;
    this.learningRate = learningRate;
  }

  get plastic(): boolean {
    return this.learningRate > 0.001;
  }

  /** Learned multiplier applied to an input neuron (1 for non-food inputs). */
  inputGain(i: number): number {
    return i < 6 ? this.liking[i >> 1] : 1;
  }

  /** Effective strength of an input→hidden connection. */
  w1(h: number, i: number): number {
    return this.w[W1_OFFSET + h * N_IN + i] * this.inputGain(i);
  }

  /** Effective strength of a reflex (input→output) connection. */
  w3(o: number, i: number): number {
    return this.w[W3_OFFSET + o * N_IN + i] * this.inputGain(i);
  }

  forward(): void {
    const { w, input, perceived, hidden, output, hiddenCount, lesioned, liking } = this;
    for (let i = 0; i < N_IN; i++) perceived[i] = input[i];
    for (let i = 0; i < 6; i++) perceived[i] *= liking[i >> 1];
    for (let h = 0; h < H_MAX; h++) {
      if (h >= hiddenCount || lesioned[h]) {
        hidden[h] = 0;
        continue;
      }
      let sum = w[B1_OFFSET + h];
      const row = W1_OFFSET + h * N_IN;
      for (let i = 0; i < N_IN; i++) sum += w[row + i] * perceived[i];
      hidden[h] = Math.tanh(sum);
    }
    for (let o = 0; o < N_OUT; o++) {
      let sum = w[B2_OFFSET + o];
      const row = W2_OFFSET + o * H_MAX;
      for (let h = 0; h < hiddenCount; h++) sum += w[row + h] * hidden[h];
      const skip = W3_OFFSET + o * N_IN;
      for (let i = 0; i < N_IN; i++) sum += w[skip + i] * perceived[i];
      output[o] = Math.tanh(sum);
    }
  }

  /**
   * A meal of `kind` turned out good (reward > 0) or bad (reward < 0).
   * Returns how much the liking changed.
   */
  taste(kind: TasteKind, reward: number): number {
    if (!this.plastic || reward === 0) return 0;
    const before = this.liking[kind];
    let v = before + this.learningRate * reward;
    if (v > T.likingMax) v = T.likingMax;
    else if (v < T.likingMin) v = T.likingMin;
    this.liking[kind] = v;
    if (Math.abs(v - before) > 0.05) this.learningEvents++;
    return v - before;
  }

  /** Opinions slowly fade back toward instinct (forgetting). */
  relax(dt: number): void {
    if (!this.plastic) return;
    const k = 1 - Math.exp(-dt / T.forgetTau);
    for (let i = 0; i < 3; i++) this.liking[i] += (1 - this.liking[i]) * k;
  }

  /** How far the creature's opinions have moved away from instinct (0 = nothing learned). */
  learnedMagnitude(): number {
    return (Math.abs(this.liking[0] - 1) + Math.abs(this.liking[1] - 1) + Math.abs(this.liking[2] - 1)) / 3;
  }

  /**
   * Runs the network on an arbitrary input vector without disturbing its live
   * state. Used by the "instincts" analysis and the lesson playground.
   */
  probe(inputs: ArrayLike<number>, out: Float32Array, hiddenOut?: Float32Array, useLiking = true): void {
    const { w, hiddenCount, lesioned, liking } = this;
    const hid = hiddenOut ?? new Float32Array(H_MAX);
    const x = new Float32Array(N_IN);
    for (let i = 0; i < N_IN; i++) x[i] = inputs[i] * (useLiking && i < 6 ? liking[i >> 1] : 1);
    for (let h = 0; h < H_MAX; h++) {
      if (h >= hiddenCount || lesioned[h]) {
        hid[h] = 0;
        continue;
      }
      let sum = w[B1_OFFSET + h];
      const row = W1_OFFSET + h * N_IN;
      for (let i = 0; i < N_IN; i++) sum += w[row + i] * x[i];
      hid[h] = Math.tanh(sum);
    }
    for (let o = 0; o < N_OUT; o++) {
      let sum = w[B2_OFFSET + o];
      const row = W2_OFFSET + o * H_MAX;
      for (let h = 0; h < hiddenCount; h++) sum += w[row + h] * hid[h];
      const skip = W3_OFFSET + o * N_IN;
      for (let i = 0; i < N_IN; i++) sum += w[skip + i] * x[i];
      out[o] = Math.tanh(sum);
    }
  }
}

export const w1Index = (h: number, i: number) => W1_OFFSET + h * N_IN + i;
export const w2Index = (o: number, h: number) => W2_OFFSET + o * H_MAX + h;
export const b1Index = (h: number) => B1_OFFSET + h;
export const b2Index = (o: number) => B2_OFFSET + o;
export const w3Index = (o: number, i: number) => W3_OFFSET + o * N_IN + i;
