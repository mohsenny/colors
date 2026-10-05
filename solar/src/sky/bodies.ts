/*
 * The ten bodies: the Sun, the eight planets and the Moon, at their real
 * sizes. Radii are the IAU 2015 equatorial ones, in km, with the flattening
 * that makes the giants visibly squat.
 */

export type BodyId = 'sun' | 'mercury' | 'venus' | 'earth' | 'moon' | 'mars' | 'jupiter' | 'saturn' | 'uranus' | 'neptune'

export type BodyKind = 'star' | 'planet' | 'moon'

export interface Body {
  id: BodyId
  name: string
  kind: BodyKind
  /** Equatorial radius, km. */
  radius: number
  /** 1 - polar / equatorial. */
  flat: number
  /** For the chip and the marker, sampled off its map. */
  color: string
  /** How far the haze reaches above the surface, in radii, and its colour by day. */
  air?: { depth: number; tint: readonly [number, number, number] }
}

/** Sun first, then outward, the Moon after the Earth: the order of the drawer and the number keys. */
export const BODIES: readonly Body[] = [
  { id: 'sun', name: 'Sun', kind: 'star', radius: 695_700, flat: 0, color: '#f4a63a' },
  { id: 'mercury', name: 'Mercury', kind: 'planet', radius: 2_440.5, flat: 0, color: '#9c948c' },
  {
    id: 'venus',
    name: 'Venus',
    kind: 'planet',
    radius: 6_051.8,
    flat: 0,
    color: '#dcc596',
    air: { depth: 0.035, tint: [1, 0.86, 0.6] },
  },
  {
    id: 'earth',
    name: 'Earth',
    kind: 'planet',
    radius: 6_378.137,
    flat: 1 / 298.257,
    color: '#4f7fb8',
    air: { depth: 0.014, tint: [0.32, 0.56, 1] },
  },
  { id: 'moon', name: 'Moon', kind: 'moon', radius: 1_737.4, flat: 0, color: '#a8a49e' },
  {
    id: 'mars',
    name: 'Mars',
    kind: 'planet',
    radius: 3_396.19,
    flat: 0.00589,
    color: '#c1683f',
    air: { depth: 0.008, tint: [0.95, 0.62, 0.42] },
  },
  { id: 'jupiter', name: 'Jupiter', kind: 'planet', radius: 71_492, flat: 0.06487, color: '#c9a682' },
  { id: 'saturn', name: 'Saturn', kind: 'planet', radius: 60_268, flat: 0.09796, color: '#d9c18e' },
  {
    id: 'uranus',
    name: 'Uranus',
    kind: 'planet',
    radius: 25_559,
    flat: 0.02293,
    color: '#a3d6dd',
    air: { depth: 0.02, tint: [0.6, 0.85, 0.9] },
  },
  {
    id: 'neptune',
    name: 'Neptune',
    kind: 'planet',
    radius: 24_764,
    flat: 0.01708,
    color: '#5578d6',
    air: { depth: 0.02, tint: [0.4, 0.55, 1] },
  },
]

const BY_ID = new Map(BODIES.map((b) => [b.id, b]))

export function bodyById(id: string): Body | undefined {
  return BY_ID.get(id as BodyId)
}

/** Saturn's rings, inner and outer edge in km: the C ring to the edge of the A ring. */
export const RINGS = { inner: 74_658, outer: 136_775 } as const

export const AU_KM = 149_597_870.7
export const LIGHT_KM_S = 299_792.458
