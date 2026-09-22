import type { Rng } from './rng'

/**
 * Continuous variation without state.
 *
 * The simulation may not draw from the PRNG on a plain tick: if it did, one
 * dropped or replayed frame would desynchronise the whole future and scrubbing
 * would stop being exact. So every continuous wobble comes from value noise over
 * tables that are a pure function of the seed. Sample at `t` and you always get
 * the same answer, no matter how you arrived at `t`.
 */
export function makeNoiseTables(rng: Rng, count: number, size: number): Float32Array[] {
  const tables: Float32Array[] = []
  for (let i = 0; i < count; i++) {
    const tab = new Float32Array(size)
    for (let j = 0; j < size; j++) tab[j] = rng.next()
    tables.push(tab)
  }
  return tables
}

/** Smoothstep-interpolated value noise, wrapping. `u` is in cells. */
export function vnoise(tab: Float32Array, u: number): number {
  const n = tab.length
  const i = Math.floor(u)
  const f = u - i
  const s = f * f * (3 - 2 * f)
  const a = tab[((i % n) + n) % n] as number
  const b = tab[(((i + 1) % n) + n) % n] as number
  return a + (b - a) * s
}

export function smoothstep(edge0: number, edge1: number, x: number): number {
  if (edge1 === edge0) return x < edge0 ? 0 : 1
  const t = clamp((x - edge0) / (edge1 - edge0), 0, 1)
  return t * t * (3 - 2 * t)
}

/** Wrap an angle to (-pi, pi]. */
export function wrapPi(a: number): number {
  let x = (a + Math.PI) % (2 * Math.PI)
  if (x < 0) x += 2 * Math.PI
  return x - Math.PI
}

export function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v
}

export function clampAbs(v: number, limit: number): number {
  return clamp(v, -limit, limit)
}

export const DEG = Math.PI / 180
