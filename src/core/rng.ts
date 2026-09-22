/**
 * Deterministic pseudo-random number generator.
 *
 * The simulation must be reproducible: given the same seed and the same sequence
 * of steps it produces byte-identical state. That is what makes the timeline
 * trustworthy, and it is what makes the simulation testable without a browser.
 *
 * mulberry32: 32 bits of state, good distribution, extremely cheap.
 */
export class Rng {
  private s: number

  constructor(seed: number) {
    // Avoid the degenerate all-zero state.
    this.s = (seed >>> 0) || 0x9e3779b9
  }

  /** Raw state, so a snapshot can restore the exact stream position. */
  get state(): number {
    return this.s
  }

  set state(value: number) {
    this.s = value >>> 0
  }

  /** Uniform in [0, 1). */
  next(): number {
    this.s = (this.s + 0x6d2b79f5) >>> 0
    let t = this.s
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }

  /** Uniform in [min, max). */
  range(min: number, max: number): number {
    return min + this.next() * (max - min)
  }

  /** Uniform integer in [min, max]. */
  int(min: number, max: number): number {
    return Math.floor(this.range(min, max + 1 - Number.EPSILON))
  }

  /** True with probability p. */
  chance(p: number): boolean {
    return this.next() < p
  }

  /** ±spread around zero. */
  spread(spread: number): number {
    return (this.next() * 2 - 1) * spread
  }

  /** Approximately normal, mean 0, sd 1, clamped to ±3 (sum of 3 uniforms). */
  normal(): number {
    return (this.next() + this.next() + this.next() - 1.5) * 2
  }

  pick<T>(items: readonly T[]): T {
    return items[this.int(0, items.length - 1)] as T
  }

  /** In-place Fisher-Yates using this stream. */
  shuffle<T>(items: T[]): T[] {
    for (let i = items.length - 1; i > 0; i--) {
      const j = this.int(0, i)
      const tmp = items[i] as T
      items[i] = items[j] as T
      items[j] = tmp
    }
    return items
  }
}

/** A seed derived from the clock, for the one place non-determinism is wanted: first load. */
export function randomSeed(): number {
  return (Math.random() * 0xffffffff) >>> 0
}

/** Avalanche a uint32. Used to derive substreams and stateless hash noise. */
export function splitmix32(z: number): number {
  let x = z >>> 0
  x ^= x >>> 16
  x = Math.imul(x, 0x21f0aaad)
  x ^= x >>> 15
  x = Math.imul(x, 0x735a2d97)
  x ^= x >>> 15
  return x >>> 0
}

/**
 * Stateless noise: the same three integers always give the same number in
 * [0, 1). This is what lets a slowly changing value be a pure function of
 * simulation time instead of a thing that has to be stored and restored.
 */
export function hash01(a: number, b: number, c: number): number {
  const h = splitmix32(splitmix32((a | 0) ^ Math.imul(b | 0, 0x9e3779b9)) ^ Math.imul(c | 0, 0x85ebca6b))
  return h / 4294967296
}
