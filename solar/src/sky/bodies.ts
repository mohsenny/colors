/*
 * The Sun, the eight planets, the Moon and the round moons of Jupiter and
 * Saturn, at their real sizes. Radii are the IAU 2015 equatorial ones for the
 * Sun and the planets, with the flattening that makes the giants visibly
 * squat, and mean ones for the moons, in km.
 */

export type BodyId =
  | 'sun'
  | 'mercury'
  | 'venus'
  | 'earth'
  | 'moon'
  | 'mars'
  | 'jupiter'
  | 'io'
  | 'europa'
  | 'ganymede'
  | 'callisto'
  | 'saturn'
  | 'mimas'
  | 'enceladus'
  | 'tethys'
  | 'dione'
  | 'rhea'
  | 'titan'
  | 'iapetus'
  | 'uranus'
  | 'neptune'

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
  /** The planet a moon goes round. */
  parent?: BodyId
}

/** Sun first, then outward, each moon after its planet, nearest first. */
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
  { id: 'moon', name: 'Moon', kind: 'moon', radius: 1_737.4, flat: 0, color: '#a8a49e', parent: 'earth' },
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
  { id: 'io', name: 'Io', kind: 'moon', radius: 1_821.6, flat: 0, color: '#c4a670', parent: 'jupiter' },
  { id: 'europa', name: 'Europa', kind: 'moon', radius: 1_560.8, flat: 0, color: '#c6bbaf', parent: 'jupiter' },
  { id: 'ganymede', name: 'Ganymede', kind: 'moon', radius: 2_631.2, flat: 0, color: '#8a8477', parent: 'jupiter' },
  { id: 'callisto', name: 'Callisto', kind: 'moon', radius: 2_410.3, flat: 0, color: '#615b54', parent: 'jupiter' },
  { id: 'saturn', name: 'Saturn', kind: 'planet', radius: 60_268, flat: 0.09796, color: '#d9c18e' },
  { id: 'mimas', name: 'Mimas', kind: 'moon', radius: 198.2, flat: 0, color: '#b3b2b0', parent: 'saturn' },
  { id: 'enceladus', name: 'Enceladus', kind: 'moon', radius: 252.1, flat: 0, color: '#d3d5da', parent: 'saturn' },
  { id: 'tethys', name: 'Tethys', kind: 'moon', radius: 531.1, flat: 0, color: '#cbcac8', parent: 'saturn' },
  { id: 'dione', name: 'Dione', kind: 'moon', radius: 561.4, flat: 0, color: '#b7b6b5', parent: 'saturn' },
  { id: 'rhea', name: 'Rhea', kind: 'moon', radius: 763.8, flat: 0, color: '#b6b2ab', parent: 'saturn' },
  {
    id: 'titan',
    name: 'Titan',
    kind: 'moon',
    radius: 2_574.7,
    flat: 0,
    color: '#c99a55',
    air: { depth: 0.1, tint: [1, 0.66, 0.3] },
    parent: 'saturn',
  },
  { id: 'iapetus', name: 'Iapetus', kind: 'moon', radius: 734.5, flat: 0, color: '#8f7d6c', parent: 'saturn' },
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

/** The ten with a row of their own in the drawer and a number key. The moons of the giants ride under their planet. */
export const KEYED: readonly Body[] = BODIES.filter((b) => !b.parent || b.parent === 'earth')

const BY_ID = new Map(BODIES.map((b) => [b.id, b]))

export function bodyById(id: string): Body | undefined {
  return BY_ID.get(id as BodyId)
}

/** Saturn's rings, inner and outer edge in km: the C ring to the edge of the A ring. */
export const RINGS = { inner: 74_658, outer: 136_775 } as const

export const AU_KM = 149_597_870.7
export const LIGHT_KM_S = 299_792.458
