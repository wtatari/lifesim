/**
 * Seeded pseudo-random number generator (sfc32).
 *
 * Every random decision in the simulation (mutations, food placement, …)
 * flows through one of these, so a world started from the same seed with the
 * same settings unfolds the same way. That makes experiments repeatable.
 */
export class Rng {
  private a = 0;
  private b = 0;
  private c = 0;
  private d = 0;
  private spareGauss: number | null = null;

  constructor(seed: number | string = Date.now()) {
    this.reseed(seed);
  }

  reseed(seed: number | string): void {
    // xmur3 string hash → four 32-bit seeds
    const str = String(seed);
    let h = 1779033703 ^ str.length;
    for (let i = 0; i < str.length; i++) {
      h = Math.imul(h ^ str.charCodeAt(i), 3432918353);
      h = (h << 13) | (h >>> 19);
    }
    const next = () => {
      h = Math.imul(h ^ (h >>> 16), 2246822507);
      h = Math.imul(h ^ (h >>> 13), 3266489909);
      return (h ^= h >>> 16) >>> 0;
    };
    this.a = next();
    this.b = next();
    this.c = next();
    this.d = next();
    this.spareGauss = null;
    for (let i = 0; i < 12; i++) this.next();
  }

  /** Uniform float in [0, 1). */
  next(): number {
    let { a, b, c, d } = this;
    a >>>= 0;
    b >>>= 0;
    c >>>= 0;
    d >>>= 0;
    let t = (a + b) | 0;
    a = b ^ (b >>> 9);
    b = (c + (c << 3)) | 0;
    c = (c << 21) | (c >>> 11);
    d = (d + 1) | 0;
    t = (t + d) | 0;
    c = (c + t) | 0;
    this.a = a;
    this.b = b;
    this.c = c;
    this.d = d;
    return (t >>> 0) / 4294967296;
  }

  range(min: number, max: number): number {
    return min + (max - min) * this.next();
  }

  /** Integer in [min, maxExclusive). */
  int(min: number, maxExclusive: number): number {
    return min + Math.floor(this.next() * (maxExclusive - min));
  }

  chance(p: number): boolean {
    return this.next() < p;
  }

  /** Normally distributed number (Box–Muller). */
  gauss(mean = 0, sd = 1): number {
    if (this.spareGauss !== null) {
      const s = this.spareGauss;
      this.spareGauss = null;
      return mean + sd * s;
    }
    let u = 0;
    let v = 0;
    let s = 0;
    do {
      u = this.next() * 2 - 1;
      v = this.next() * 2 - 1;
      s = u * u + v * v;
    } while (s >= 1 || s === 0);
    const m = Math.sqrt((-2 * Math.log(s)) / s);
    this.spareGauss = v * m;
    return mean + sd * u * m;
  }

  pick<T>(arr: readonly T[]): T {
    return arr[Math.floor(this.next() * arr.length)];
  }

  getState(): number[] {
    return [this.a >>> 0, this.b >>> 0, this.c >>> 0, this.d >>> 0];
  }

  setState(s: readonly number[]): void {
    [this.a, this.b, this.c, this.d] = s;
    this.spareGauss = null;
  }
}
