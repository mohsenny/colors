/*
 * The bodies, real numbers in, drawn numbers out.
 *
 * Everything the user reads (mass, radius, surface clock) is computed from SI
 * values. Everything the user sees is in room units, where c = 1 and the body
 * framed by the current preset is one unit in radius, so GM = rs / 2.
 */

export const G = 6.674e-11
export const C_LIGHT = 2.998e8
export const M_SUN = 1.989e30
export const M_EARTH = 5.972e24
const AU = 1.496e11

export type BodyKind = 'planet' | 'star' | 'dwarf' | 'neutron' | 'hole'

export interface Preset {
  id: string
  name: string
  /** Short name for the dock chip, where the full one does not fit. */
  short: string
  kind: BodyKind
  /** kg */
  mass: number
  /** m. Zero for a black hole: its size is its horizon. */
  radius: number
  /** Surface tint for the sphere and the chip. */
  color: string
}

export const PRESETS: readonly Preset[] = [
  { id: 'earth', name: 'Earth', short: 'Earth', kind: 'planet', mass: M_EARTH, radius: 6.371e6, color: '#6f97b4' },
  { id: 'jupiter', name: 'Jupiter', short: 'Jupiter', kind: 'planet', mass: 1.898e27, radius: 6.9911e7, color: '#c8a37f' },
  { id: 'sun', name: 'Sun', short: 'Sun', kind: 'star', mass: M_SUN, radius: 6.96e8, color: '#f0a64a' },
  { id: 'sirius-b', name: 'Sirius B', short: 'Sirius B', kind: 'dwarf', mass: 1.018 * M_SUN, radius: 5.84e6, color: '#c3d1e8' },
  {
    id: 'psr-j0740',
    name: 'PSR J0740+6620',
    short: 'Neutron',
    kind: 'neutron',
    mass: 2.08 * M_SUN,
    radius: 1.24e4,
    color: '#9c9fc6',
  },
  { id: 'sgr-a', name: 'Sagittarius A*', short: 'Sgr A*', kind: 'hole', mass: 4.3e6 * M_SUN, radius: 0, color: '#101014' },
  { id: 'm87', name: 'M87*', short: 'M87*', kind: 'hole', mass: 6.5e9 * M_SUN, radius: 0, color: '#101014' },
]

export function presetById(id: string): Preset | undefined {
  return PRESETS.find((p) => p.id === id)
}

/** Schwarzschild radius, m. */
export function schwarzschild(mass: number): number {
  return (2 * G * mass) / (C_LIGHT * C_LIGHT)
}

/** The physical size of the thing you would bump into: surface or horizon. */
export function effectiveRadius(mass: number, radius: number): number {
  return Math.max(radius, schwarzschild(mass))
}

/** rs / R. One or more is a black hole. */
export function compactness(mass: number, radius: number): number {
  return schwarzschild(mass) / effectiveRadius(mass, radius)
}

/*
 * Visual compactness. Earth bends space by about one part in a billion, the Sun
 * by four in a million: drawn true, both lattices are ruler-straight. Log-linear
 * keeps every body in order and the gaps between them about where intuition puts
 * them. 0.16 is the floor at which Earth's pull is still visible on the lattice
 * at the default zoom; 0.88 is the ceiling that keeps a neutron star clearly a
 * surface and not a horizon, until it is compact enough to be drawn true. Black
 * holes are never exaggerated.
 */
const VIS_FLOOR = 0.16
const VIS_SPAN = 0.72
const LOG_C_MIN = -9.5

export function visualCompactness(c: number): number {
  if (c >= 1) return 1
  const t = Math.min(1, Math.max(0, (Math.log10(c) - LOG_C_MIN) / -LOG_C_MIN))
  // Never drawn shallower than it is, which is also what makes collapse
  // continuous: as C reaches 1 the drawn value reaches 1 with it.
  return Math.max(c, VIS_FLOOR + VIS_SPAN * t)
}

/** Clock rate at the surface relative to far away. Zero at a horizon. */
export function surfaceClock(mass: number, radius: number): number {
  return Math.sqrt(Math.max(0, 1 - compactness(mass, radius)))
}

/** How many times deeper the drawn well is than the real one. 1 means true. */
export function exaggeration(mass: number, radius: number): number {
  const c = compactness(mass, radius)
  return visualCompactness(c) / c
}

/** A body in room units. */
export interface Field {
  /** Drawn Schwarzschild radius, room units. */
  rs: number
  /** Drawn surface radius, room units. Equal to rs for a black hole. */
  radius: number
  hole: boolean
}

/**
 * The drawn field for a body, in a room whose unit is `frame` metres.
 *
 * Below collapse the drawn rs is the visual compactness times the surface. At
 * and past collapse the body is its horizon, at its true size, which is what
 * makes shrinking a star into a black hole continuous.
 */
export function fieldFor(mass: number, radius: number, frame: number): Field {
  const c = compactness(mass, radius)
  if (c >= 1) {
    const rs = schwarzschild(mass) / frame
    return { rs, radius: rs, hole: true }
  }
  const r = radius / frame
  return { rs: visualCompactness(c) * r, radius: r, hole: false }
}

// ---------------------------------------------------------------- formatting

function sig(v: number, digits: number): string {
  return v.toLocaleString('en-US', { maximumSignificantDigits: digits, minimumSignificantDigits: digits })
}

function big(v: number, unit: string): string {
  if (v >= 1e9) return `${sig(v / 1e9, 3)} billion ${unit}`
  if (v >= 1e6) return `${sig(v / 1e6, 3)} million ${unit}`
  return `${sig(v, 4)} ${unit}`
}

export function formatMass(kg: number): string {
  const sun = kg / M_SUN
  if (sun < 5e-4) {
    const earth = kg / M_EARTH
    return earth < 0.01 ? `${kg.toExponential(2)} kg` : big(earth, 'M⊕')
  }
  return big(sun, 'M☉')
}

export function formatLength(m: number): string {
  const km = m / 1000
  if (m >= 1e11) return `${sig(m / AU, 3)} AU`
  if (km >= 1e6) return big(km, 'km')
  if (km >= 10) return `${Math.round(km).toLocaleString('en-US')} km`
  return `${sig(km, 3)} km`
}

export function formatClock(rate: number): string {
  if (rate <= 0) return 'stops'
  // Enough digits to show the first one that is not a 9, so the Sun reads
  // 0.999998 and not a dishonest 1.000.
  const lack = 1 - rate
  if (lack <= 0) return '1×'
  const digits = Math.min(12, Math.max(2, Math.floor(-Math.log10(lack)) + 1))
  return `${rate.toFixed(digits)}×`
}

const SUPERSCRIPT = '⁰¹²³⁴⁵⁶⁷⁸⁹'

export function formatExaggeration(x: number): string {
  if (x < 1.5) return 'true to scale'
  const exp = Math.round(Math.log10(x))
  if (exp <= 1) return `×${Math.round(x)}`
  return `×10${String(exp)
    .split('')
    .map((d) => SUPERSCRIPT[Number(d)])
    .join('')}`
}
