/*
 * How bright things are, as an eye there would take them. The Sun gives
 * 128,000 lux at the Earth's distance, falling off as the square. A body too
 * small to be a disc is a point as bright as its magnitude, on the stars'
 * scale: from its size and albedo, its distances from the Sun and the eye,
 * and how much of its day side faces the eye. What the eye can still make
 * out is Schaefer's limiting magnitude for the sky behind, and anything
 * bright in view lightens that sky by the light it scatters in the eye
 * (Stiles and Holladay's veiling glare), so stars go near the Moon, and near
 * the Sun from anywhere.
 */

import type { BodyId } from './bodies'
import type { Vec3 } from './ephemeris'

/** The Sun's light at the Earth's distance, lux, and its magnitude from there. */
export const SUN_LUX = 128_000
export const SUN_MAG = -26.74
/** The darkest sky, cd/m²: the faintest stars drawn, 6.5, just show against it. */
export const DARK = 1.7e-4
/** Magnitudes over the limit that drew today's faintest stars, so a dark sky draws them as before. */
const SPARE = 0.172
/** The most lights whose glare is counted, brightest first: as many as the star shader has room for. */
export const LIGHTS = 6

/** Geometric albedo: how bright a body is full on, against a white disc its size. Iapetus is half coal, half snow. */
export const ALBEDO: Record<Exclude<BodyId, 'sun'>, number> = {
  mercury: 0.142,
  venus: 0.689,
  earth: 0.434,
  moon: 0.12,
  mars: 0.17,
  jupiter: 0.538,
  metis: 0.06,
  adrastea: 0.1,
  amalthea: 0.09,
  thebe: 0.047,
  io: 0.63,
  europa: 0.67,
  ganymede: 0.43,
  callisto: 0.22,
  himalia: 0.04,
  saturn: 0.499,
  prometheus: 0.6,
  pandora: 0.6,
  epimetheus: 0.73,
  janus: 0.71,
  mimas: 0.96,
  enceladus: 1.38,
  tethys: 1.23,
  dione: 1,
  rhea: 0.95,
  titan: 0.22,
  hyperion: 0.3,
  iapetus: 0.25,
  phoebe: 0.08,
  uranus: 0.488,
  miranda: 0.45,
  ariel: 0.53,
  umbriel: 0.26,
  titania: 0.35,
  oberon: 0.31,
  neptune: 0.442,
  triton: 0.76,
  pluto: 0.52,
  charon: 0.41,
}

/** Air and cloud tops scatter as a matt ball does. Bare dust and ice throw light back toward the Sun, and fade faster off full. */
const CLOUDED = new Set<BodyId>(['earth', 'jupiter', 'saturn', 'uranus', 'neptune', 'titan'])

/** Bare dust and ice: magnitudes fainter than full at `deg` off it. */
function airless(deg: number): number {
  return 0.026 * deg + 4e-9 * deg ** 4
}

/**
 * Where the eye has measured it, a planet fades as measured: Mercury and Venus
 * as Hilton has them (the Explanatory Supplement), Venus brightening again as
 * a thin crescent where its clouds scatter forward, and Mars as Mallama and
 * Hilton do, past the half it has been seen at as dust is.
 */
const MEASURED: Partial<Record<BodyId, (deg: number) => number>> = {
  mercury: (deg) => {
    const x = deg / 100
    return x * (4.98 + x * (-4.88 + x * 3.02))
  },
  venus: (deg) => {
    const x = deg / 100
    return deg < 163.6 ? x * (1.03 + x * (0.57 + x * 0.13)) : 5.45 - 1.02 * x
  },
  mars: (deg) => {
    if (deg <= 50) return 2.267e-2 * deg - 1.302e-4 * deg ** 2
    if (deg <= 120) return 1.234 - 2.573e-2 * deg + 3.445e-4 * deg ** 2
    return 3.107 + airless(deg) - airless(120)
  },
}

/** Noon light at `au` from the Sun, lux. */
export function noonLux(au: number): number {
  return SUN_LUX / (au * au)
}

/** The light from something of magnitude `m`, lux. */
export function luxOf(m: number): number {
  return SUN_LUX * 10 ** (-0.4 * (m - SUN_MAG))
}

/** The Sun's magnitude at `au`. */
export function sunMagnitude(au: number): number {
  return SUN_MAG + 5 * Math.log10(au)
}

/**
 * A sunlit body's magnitude: its radius and distance from the eye in km, from
 * the Sun in AU, and the angle at it between the Sun and the eye, radians.
 * `lit` is how much sunlight reaches it, under 1 in a shadow; `rings` adds
 * Saturn's, in magnitudes.
 */
export function magnitude(id: Exclude<BodyId, 'sun'>, radius: number, eye: number, sun: number, phase: number, lit = 1, rings = 0): number {
  const deg = (phase * 180) / Math.PI
  const measured = MEASURED[id]
  const fade = measured
    ? measured(deg)
    : CLOUDED.has(id)
      ? -2.5 * Math.log10(Math.max(1e-12, (Math.sin(phase) + (Math.PI - phase) * Math.cos(phase)) / Math.PI))
      : airless(deg)
  return SUN_MAG - 2.5 * Math.log10((ALBEDO[id] * (radius / eye) ** 2 * Math.max(lit, 1e-12)) / (sun * sun)) + fade + rings
}

/** Saturn's rings in its magnitude: brighter the more open they are both to the Sun and to the eye, nothing when the eye sees their dark face. */
export function ringsMagnitude(eyeTilt: number, sunTilt: number): number {
  if (eyeTilt * sunTilt <= 0) return 0
  return -1.825 * Math.sqrt(Math.abs(Math.sin(eyeTilt) * Math.sin(sunTilt)))
}

/** The faintest magnitude the eye makes out against a sky of `L` cd/m². */
export function limit(L: number): number {
  return 7.93 - 5 * Math.log10(1 + 63 * Math.sqrt(L))
}

/** What a lens magnifying `m` times adds to that, magnitudes: up to 30 times, a 20 cm telescope's worth. */
export function gain(m: number): number {
  return 5 * Math.log10(Math.min(30, Math.max(1, m)))
}

/** By how many magnitudes something shows above the limit. Under 0 it is lost. */
export function excess(m: number, L: number, lens: number): number {
  return limit(L) + lens + SPARE - m
}

/**
 * A light in view, for the haze it puts over the sky round it: its direction
 * from the eye, its strength, and the angle inside which the haze stops
 * growing, radians of sky. The haze `th` from it is k / th², cd/m².
 */
export interface Glare {
  id: BodyId
  dir: Vec3
  k: number
  min: number
}

/**
 * The strength of a light of `E` lux at the eye through a lens magnifying `m`
 * times. Stiles and Holladay's haze is 10 E / th² for th in degrees as the
 * eye sees them, and a lens spreads the sky by `m` and gathers up to 30² as
 * much light, so seen through it the haze `th` of sky away is this over th².
 */
export function glareOf(E: number, m: number): number {
  const deg = (m * 180) / Math.PI
  return (10 * E * Math.min(30, Math.max(1, m)) ** 2) / (deg * deg)
}

/** The sky's luminance in direction `d`, cd/m²: the dark, and the haze from every light in view but `skip`. Mirrored in the star shader. */
export function skyAt(glare: readonly Glare[], d: Vec3, skip?: BodyId): number {
  let L = DARK
  for (const g of glare) {
    if (g.id === skip) continue
    const c = [d[1] * g.dir[2] - d[2] * g.dir[1], d[2] * g.dir[0] - d[0] * g.dir[2], d[0] * g.dir[1] - d[1] * g.dir[0]]
    const th = Math.max(g.min, Math.atan2(Math.hypot(c[0], c[1], c[2]), d[0] * g.dir[0] + d[1] * g.dir[1] + d[2] * g.dir[2]))
    L += g.k / (th * th)
  }
  return L
}

/**
 * How a point shows `x` magnitudes over the limit: how strongly, 0 to 1, and
 * how wide, CSS px. Brighter is bigger and stronger; past Sirius it only
 * grows slowly, toward 9 px. Mirrored in the star shader.
 */
export function pointLook(x: number): { a: number; size: number } {
  const b = Math.max(0, x) * 1.33
  const a = Math.min(1, 0.1 + 0.085 * b) * smoothstep(-0.25, 0.3, x)
  const size = b <= 11 ? 2.2 + 0.36 * b : 9 - 2.84 * Math.exp((-0.36 * (b - 11)) / 2.84)
  return { a, size }
}

function smoothstep(a: number, b: number, x: number): number {
  const t = Math.max(0, Math.min(1, (x - a) / (b - a)))
  return t * t * (3 - 2 * t)
}
